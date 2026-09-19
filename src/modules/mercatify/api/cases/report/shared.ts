import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import { CaseReport, InterviewCase, InterviewCaseTool, MappingRow } from '../../../data/entities'
import { monthlyCostToNumber } from '../../../lib/case-tools'
import type {
  ReportCostsInput,
  ReportMappingRowInput,
  ReportProfileInput,
  ReportStackToolInput,
} from '../../../lib/report'

export type ReportScope = { tenantId: string; organizationId: string }

export type ReportDerivation = {
  profile: ReportProfileInput
  rows: ReportMappingRowInput[]
  stack: ReportStackToolInput[]
  costs: ReportCostsInput
}

export type ReportInputsDto = {
  headline: string | null
  notes: string | null
  analyst: string | null
  openQuestions: string | null
  hourlyRate: number | null
  implementationMonths: number | null
  buildEstimates: Record<string, number>
}

export type ReportBundle = {
  interviewCase: InterviewCase
  report: CaseReport | null
  derivation: ReportDerivation
  inputs: ReportInputsDto
}

/**
 * Everything `buildReportModel` needs for one case, read once.
 *
 * Shared by the admin builder route and S-10's client read route so both
 * screens render the very same document from the very same numbers — the
 * "one renderer, one derivation" rule issue #21 asks for. 404s outside the
 * caller's tenant/organization scope.
 */
export async function loadReportBundle(
  em: EntityManager,
  caseId: string,
  scope: ReportScope,
): Promise<ReportBundle> {
  const interviewCase = await em.findOne(InterviewCase, {
    id: caseId,
    ...scope,
    deletedAt: null,
  } as FilterQuery<InterviewCase>)
  if (!interviewCase) throw notFound('Interview case not found')

  const [rows, tools, report] = await Promise.all([
    em.find(MappingRow, { caseId, ...scope } as FilterQuery<MappingRow>),
    em.find(InterviewCaseTool, { interviewCase: caseId, ...scope } as FilterQuery<InterviewCaseTool>),
    em.findOne(CaseReport, { caseId, ...scope } as FilterQuery<CaseReport>),
  ])

  return {
    interviewCase,
    report,
    inputs: {
      headline: report?.headline ?? null,
      notes: report?.notes ?? null,
      analyst: report?.analyst ?? null,
      openQuestions: report?.openQuestions ?? null,
      hourlyRate: monthlyCostToNumber(report?.hourlyRate),
      implementationMonths: report?.implementationMonths ?? null,
      buildEstimates: report?.buildEstimates ?? {},
    },
    derivation: {
      profile: {
        companyName: interviewCase.companyName ?? null,
        industry: interviewCase.industry ?? null,
        peopleCount: interviewCase.peopleCount ?? null,
        currency: interviewCase.currency ?? null,
        pains: interviewCase.pains ?? null,
        mustKeep: interviewCase.mustKeep ?? null,
      },
      rows: rows.map((row) => ({
        id: String(row.id),
        position: row.position,
        capability: row.capability,
        source: row.source,
        decision: row.decision,
        targetLabel: row.targetLabel ?? null,
        targetModuleId: row.targetModuleId ?? null,
        confidence: row.confidence,
        justification: row.justification,
        flagged: row.flagged,
        flagReason: (row.flagReason ?? null) as 'unmapped' | 'module_not_enabled' | null,
      })),
      stack: tools.map((tool) => ({
        name: tool.name,
        monthlyCost: monthlyCostToNumber(tool.monthlyCost),
        seats: tool.seats ?? null,
      })),
      costs: {
        omOperatingCost: monthlyCostToNumber(interviewCase.omOperatingCost),
        implementationCost: monthlyCostToNumber(interviewCase.implementationCost),
      },
    },
  }
}
