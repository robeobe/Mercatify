import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { buildChanges } from '@open-mercato/shared/lib/commands/helpers'
import { CrudHttpError, badRequest, notFound } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CaseReport, InterviewCase } from '../data/entities'
import { reportInputsSchema, type ReportInputsInput } from '../data/validators'
import { monthlyCostToColumn, monthlyCostToNumber } from '../lib/case-tools'
import { emitMercatifyEvent } from '../events'

const REPORT_ENTITY_ID = 'mercatify:case_report' as const
const REPORT_RESOURCE_KIND = 'mercatify.case_report' as const

/**
 * Statuses that mean the client has already answered the report. Re-sending
 * replaces the copy they hold, but must never walk their answer back to
 * `sent`.
 */
const ANSWERED_STATUSES: readonly string[] = ['accepted', 'consult']

type SerializedReport = {
  id: string
  caseId: string
  headline: string | null
  notes: string | null
  analyst: string | null
  openQuestions: string | null
  hourlyRate: number | null
  implementationMonths: number | null
  buildEstimates: Record<string, number>
  sentAt: string | null
  tenantId: string | null
  organizationId: string | null
}

export function serializeReport(entity: CaseReport): SerializedReport {
  return {
    id: String(entity.id),
    caseId: String(entity.caseId),
    headline: entity.headline ?? null,
    notes: entity.notes ?? null,
    analyst: entity.analyst ?? null,
    openQuestions: entity.openQuestions ?? null,
    hourlyRate: monthlyCostToNumber(entity.hourlyRate),
    implementationMonths: entity.implementationMonths ?? null,
    buildEstimates: entity.buildEstimates ?? {},
    sentAt: entity.sentAt ? entity.sentAt.toISOString() : null,
    tenantId: entity.tenantId ? String(entity.tenantId) : null,
    organizationId: entity.organizationId ? String(entity.organizationId) : null,
  }
}

/**
 * Derive the trusted scope and fail closed — mirrors `commands/handoff.ts`'s
 * `ensureScope`. A report is organization-owned business data, so there is no
 * system-scoped branch here.
 */
function ensureScope(ctx: CommandRuntimeContext): { tenantId: string; organizationId: string } {
  const tenantId = ctx.auth?.tenantId ?? null
  if (!tenantId) throw new CrudHttpError(400, { error: 'Tenant context is required' })
  const organizationId = ctx.selectedOrganizationId ?? ctx.organizationScope?.selectedId ?? null
  if (!organizationId) throw new CrudHttpError(400, { error: 'Organization context is required' })
  return { tenantId, organizationId }
}

async function loadConfirmedCase(
  em: EntityManager,
  caseId: string,
  scope: { tenantId: string; organizationId: string },
): Promise<InterviewCase> {
  const found = await em.findOne(InterviewCase, {
    id: caseId,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
  } as FilterQuery<InterviewCase>)
  if (!found) throw notFound('Interview case not found')
  // A report is a claim about a mapping, so it needs a mapping somebody stood
  // behind — the same gate the handoff document uses.
  if (!found.mappingConfirmedAt) throw badRequest('Confirm the mapping before building the report')
  return found
}

export async function findReportForCase(
  em: EntityManager,
  caseId: string,
  scope: { tenantId: string; organizationId: string },
): Promise<CaseReport | null> {
  return em.findOne(CaseReport, {
    caseId,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  } as FilterQuery<CaseReport>)
}

/** Only keys the caller actually sent are written, so a partial save never clears a field. */
function applyReportInputs(record: CaseReport, parsed: ReportInputsInput): void {
  if (parsed.headline !== undefined) record.headline = parsed.headline
  if (parsed.notes !== undefined) record.notes = parsed.notes
  if (parsed.analyst !== undefined) record.analyst = parsed.analyst
  if (parsed.openQuestions !== undefined) record.openQuestions = parsed.openQuestions
  if (parsed.hourlyRate !== undefined) record.hourlyRate = monthlyCostToColumn(parsed.hourlyRate)
  if (parsed.implementationMonths !== undefined) record.implementationMonths = parsed.implementationMonths
  if (parsed.buildEstimates !== undefined) {
    // A null estimate means "to estimate", which is not zero hours — drop the
    // key entirely rather than persisting a misleading 0.
    const next: Record<string, number> = {}
    for (const [rowId, hours] of Object.entries(parsed.buildEstimates)) {
      if (typeof hours === 'number' && Number.isFinite(hours)) next[rowId] = hours
    }
    record.buildEstimates = next
  }
}

async function upsertReport(
  ctx: CommandRuntimeContext,
  caseId: string,
  scope: { tenantId: string; organizationId: string },
  apply: (record: CaseReport) => void,
): Promise<CaseReport> {
  const em = ctx.container.resolve('em') as EntityManager
  const de = ctx.container.resolve('dataEngine') as DataEngine
  const existing = await findReportForCase(em, caseId, scope)

  if (!existing) {
    const draft = new CaseReport()
    apply(draft)
    return (await de.createOrmEntity({
      entity: CaseReport,
      data: {
        caseId,
        headline: draft.headline ?? null,
        notes: draft.notes ?? null,
        analyst: draft.analyst ?? null,
        openQuestions: draft.openQuestions ?? null,
        hourlyRate: draft.hourlyRate ?? null,
        implementationMonths: draft.implementationMonths ?? null,
        buildEstimates: draft.buildEstimates ?? {},
        sentAt: draft.sentAt ?? null,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
      },
    })) as CaseReport
  }

  const entity = await de.updateOrmEntity({
    entity: CaseReport,
    where: {
      id: existing.id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    } as FilterQuery<CaseReport>,
    apply,
  })
  if (!entity) throw notFound('Report not found')
  return entity
}

const saveReportCommand: CommandHandler<Record<string, unknown>, CaseReport> = {
  id: 'mercatify.report.save',
  async prepare(rawInput, ctx) {
    const parsed = reportInputsSchema.parse(rawInput ?? {})
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    await loadConfirmedCase(em, parsed.caseId, scope)
    const existing = await findReportForCase(em, parsed.caseId, scope)
    // No lock on the first save — there is no version to be stale against yet.
    if (existing) {
      enforceCommandOptimisticLock({
        resourceKind: REPORT_ENTITY_ID,
        resourceId: String(existing.id),
        current: existing.updatedAt,
        request: ctx.request,
      })
    }
    return { before: existing ? serializeReport(existing) : null }
  },
  async execute(rawInput, ctx) {
    const parsed = reportInputsSchema.parse(rawInput ?? {})
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    await loadConfirmedCase(em, parsed.caseId, scope)

    const entity = await upsertReport(ctx, parsed.caseId, scope, (record) => {
      applyReportInputs(record, parsed)
    })

    await emitMercatifyEvent('mercatify.report.updated', {
      id: String(entity.id),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })

    return entity
  },
  captureAfter: (_input, result) => serializeReport(result),
  buildLog: async ({ result, snapshots }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as SerializedReport | null | undefined
    const after = serializeReport(result)
    return {
      actionLabel: translate('mercatify.audit.report.save', 'Save client report'),
      resourceKind: REPORT_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId ? String(result.tenantId) : null,
      organizationId: result.organizationId ? String(result.organizationId) : null,
      changes: buildChanges(before ?? null, after as unknown as Record<string, unknown>, [
        'headline',
        'notes',
        'analyst',
        'openQuestions',
        'hourlyRate',
        'implementationMonths',
        'buildEstimates',
      ]),
      snapshotBefore: before ?? null,
      snapshotAfter: after,
    }
  },
}

/**
 * The one action that makes the report visible to the client, and the only
 * writer of the case's `sent` status (`commands/cases.ts` rejects it). Saves
 * whatever the admin currently has composed, in the same call, so sending a
 * never-saved report still sends what is on screen.
 */
const sendReportCommand: CommandHandler<
  Record<string, unknown>,
  { report: CaseReport; status: string }
> = {
  id: 'mercatify.report.send',
  async execute(rawInput, ctx) {
    const parsed = reportInputsSchema.parse(rawInput ?? {})
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const de = ctx.container.resolve('dataEngine') as DataEngine
    const interviewCase = await loadConfirmedCase(em, parsed.caseId, scope)

    const sentAt = new Date()
    const report = await upsertReport(ctx, parsed.caseId, scope, (record) => {
      applyReportInputs(record, parsed)
      record.sentAt = sentAt
    })

    // Re-sending replaces the client's copy but never walks back an answer
    // they already gave.
    const nextStatus = ANSWERED_STATUSES.includes(interviewCase.status) ? interviewCase.status : 'sent'
    if (nextStatus !== interviewCase.status) {
      const updated = await de.updateOrmEntity({
        entity: InterviewCase,
        where: {
          id: parsed.caseId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          deletedAt: null,
        } as FilterQuery<InterviewCase>,
        apply: (record: InterviewCase) => {
          record.status = 'sent'
        },
      })
      if (!updated) throw notFound('Interview case not found')
    }

    await emitMercatifyEvent('mercatify.report.sent', {
      id: String(report.id),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })

    return { report, status: nextStatus }
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('mercatify.audit.report.send', 'Send report to the client'),
      resourceKind: REPORT_RESOURCE_KIND,
      resourceId: String(result.report.id),
      tenantId: result.report.tenantId ? String(result.report.tenantId) : null,
      organizationId: result.report.organizationId ? String(result.report.organizationId) : null,
      snapshotAfter: {
        caseId: String(result.report.caseId),
        sentAt: result.report.sentAt ? result.report.sentAt.toISOString() : null,
        status: result.status,
      },
    }
  },
}

registerCommand(saveReportCommand)
registerCommand(sendReportCommand)

export { saveReportCommand, sendReportCommand, REPORT_ENTITY_ID }
