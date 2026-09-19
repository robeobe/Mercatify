/**
 * S-09: the client-facing report, derived from a confirmed mapping.
 *
 * Pure and I/O-free — no clock, no container, no fetch — so the whole document
 * is unit-testable and can be recomputed on every read. Nothing here is ever
 * persisted: a cached KPI is exactly the stale number S-04's
 * "never persist a derived figure" rule exists to prevent.
 *
 * Two money concepts live side by side and MUST NOT be blended:
 *   · S-04's `omOperatingCost` / `implementationCost` — customer-provided
 *     annual figures, two of the three saving lines (`lib/savings.ts`);
 *   · the build backlog's `hours × hourlyRate` — an admin's effort estimate,
 *     shown only in the backlog and its KPI.
 *
 * Every user-visible string is returned as an i18n key plus params, never as
 * a composed sentence: the caller localizes.
 */
import { computeSavingsScenario, type SavingsScenario } from './savings'

export const CASH_HORIZON_MONTHS = 24
export const DEFAULT_IMPLEMENTATION_MONTHS = 3

/** Bar order: what Open Mercato covers first, what still costs money last. */
export const REPORT_DECISION_ORDER = ['native', 'configure', 'integrate', 'keep', 'build'] as const
export type ReportDecision = (typeof REPORT_DECISION_ORDER)[number]

/** Decisions that mean "Open Mercato already does this job". */
const COVERED_DECISIONS: readonly string[] = ['native', 'configure']

export type ReportMappingRowInput = {
  id: string
  position: number
  capability: string
  /** The SaaS product this capability was read from (S-04's `source`). */
  source: string
  decision: string
  targetLabel: string | null
  targetModuleId: string | null
  confidence: string
  justification: string
  flagged: boolean
  flagReason: 'unmapped' | 'module_not_enabled' | null
}

export type ReportStackToolInput = {
  name: string
  monthlyCost: number | null
  seats: number | null
}

export type ReportProfileInput = {
  companyName: string | null
  industry: string | null
  peopleCount: number | null
  currency: string | null
  pains: string | null
  mustKeep: string | null
}

export type ReportCostsInput = {
  /** Customer-provided, annual. */
  omOperatingCost: number | null
  /** Customer-provided, one-off. */
  implementationCost: number | null
}

export type ReportAuthoredInput = {
  headline: string | null
  notes: string | null
  analyst: string | null
  openQuestions: string | null
  hourlyRate: number | null
  implementationMonths: number | null
  /** Keyed by `MappingRow.id`; missing or null means "to estimate". */
  buildEstimates: Record<string, number | null>
  sentAt: string | null
  /** ISO timestamp of the last compose edit; shown as "prepared on". */
  preparedAt: string | null
}

export type ReportModelInput = {
  profile: ReportProfileInput
  rows: ReportMappingRowInput[]
  stack: ReportStackToolInput[]
  costs: ReportCostsInput
  authored: ReportAuthoredInput
}

export type ReportHeadline =
  | { kind: 'override'; text: string }
  | { kind: 'computed'; key: 'someRetired' | 'noneRetired'; params: { removed: number; total: number } }

export type ReportSummaryClause = {
  key: 'spend' | 'covered' | 'endToEnd' | 'build' | 'stay'
  params: Record<string, number>
}

export type ReportKpis = {
  licencesToday: { amount: number; toolCount: number }
  /** `omOperatingMonthly` is null when the operating cost has not been entered. */
  licencesAfter: { amount: number; omOperatingMonthly: number | null }
  netAnnualSaving: { amount: number | null; removedCount: number }
  buildEffort: { hours: number; cost: number | null; itemCount: number; unestimatedCount: number }
}

export type ReportVerdictSegment = {
  decision: ReportDecision
  count: number
  /** 0–1; 0 when there are no rows at all. */
  share: number
}

export type ReportToolRow = {
  id: string
  capability: string
  targetLabel: string | null
  /** Named in the `module_not_enabled` flag message, exactly as the mapping table does. */
  targetModuleId: string | null
  decision: string
  confidence: string
  justification: string
  flagged: boolean
  flagReason: 'unmapped' | 'module_not_enabled' | null
}

export type ReportToolGroup = {
  /** Null for rows whose `source` names no tool in the stack — listed, never dropped. */
  toolName: string | null
  monthlyCost: number | null
  switchedOff: boolean
  rows: ReportToolRow[]
}

export type ReportDuplicate = {
  capability: string
  tools: string[]
}

export type ReportSavingLine = {
  key: 'saasSaving' | 'omOperatingCost' | 'implementationCost'
  amount: number | null
  /** Where the figure came from — traceability, per S-04's acceptance criteria. */
  source: 'customer' | 'admin'
  basis: { key: 'removedTools' | 'customerProvidedAnnual' | 'customerProvidedOneOff'; params: { count?: number; tools?: string } }
}

export type ReportSavings = {
  lines: ReportSavingLine[]
  netAnnualSaving: number | null
  netPaybackMonths: number | null
  removedSaaS: string[]
  retainedSaaS: string[]
}

export type ReportBacklogItem = {
  id: string
  capability: string
  targetLabel: string | null
  confidence: string
  /** Null means "to estimate" — never rendered as a blank or a zero. */
  hours: number | null
  cost: number | null
}

export type ReportBacklog = {
  items: ReportBacklogItem[]
  totalHours: number
  /** Null when no hourly rate has been entered. */
  totalCost: number | null
  unestimatedCount: number
}

export type ReportCashPoint = { month: number; value: number }

export type ReportCashCurve = {
  horizonMonths: number
  rampMonths: number
  points: ReportCashPoint[]
  trough: number
  troughMonth: number
  /** Null when the curve never crosses zero inside the horizon — a finding, not a drawing bug. */
  breakEvenMonth: number | null
  endValue: number
  monthlyNetSaving: number
  /** True when there is no implementation cost to pay back. */
  paidNothing: boolean
}

export type ReportOpenQuestion =
  | { key: 'authored'; text: string }
  | { key: 'lowConfidence'; capability: string }
  | { key: 'unestimated'; count: number }

export type ReportModel = {
  currency: string | null
  companyName: string | null
  industry: string | null
  peopleCount: number | null
  seats: number | null
  preparedAt: string | null
  sentAt: string | null
  analyst: string | null
  notes: string | null
  headline: ReportHeadline
  summary: ReportSummaryClause[]
  kpis: ReportKpis
  verdict: ReportVerdictSegment[]
  toolGroups: ReportToolGroup[]
  duplicates: ReportDuplicate[]
  savings: ReportSavings
  backlog: ReportBacklog
  /** Null when a cost input is missing — the UI explains rather than guessing a line. */
  cashCurve: ReportCashCurve | null
  pains: string | null
  mustKeep: string | null
  openQuestions: ReportOpenQuestion[]
}

function sumMonthly(tools: ReportStackToolInput[]): number {
  return tools.reduce((total, tool) => total + (tool.monthlyCost ?? 0), 0)
}

function normalizeCapability(capability: string): string {
  return capability.trim().toLowerCase()
}

function buildHeadline(authored: string | null, removed: number, total: number): ReportHeadline {
  const override = authored?.trim()
  if (override) return { kind: 'override', text: override }
  return {
    kind: 'computed',
    key: removed > 0 ? 'someRetired' : 'noneRetired',
    params: { removed, total },
  }
}

function buildSummary(args: {
  monthlySpend: number
  toolCount: number
  capabilityCount: number
  coveredCount: number
  removedCount: number
  buildCount: number
  retainedCount: number
}): ReportSummaryClause[] {
  const clauses: ReportSummaryClause[] = [
    { key: 'spend', params: { amount: args.monthlySpend, tools: args.toolCount } },
    { key: 'covered', params: { covered: args.coveredCount, capabilities: args.capabilityCount } },
  ]
  if (args.removedCount > 0) clauses.push({ key: 'endToEnd', params: { tools: args.removedCount } })
  if (args.buildCount > 0) clauses.push({ key: 'build', params: { items: args.buildCount } })
  if (args.retainedCount > 0) clauses.push({ key: 'stay', params: { tools: args.retainedCount } })
  return clauses
}

function buildVerdict(rows: ReportMappingRowInput[]): ReportVerdictSegment[] {
  return REPORT_DECISION_ORDER.map((decision) => {
    const count = rows.filter((row) => row.decision === decision).length
    return { decision, count, share: rows.length > 0 ? count / rows.length : 0 }
  })
}

function buildToolGroups(
  rows: ReportMappingRowInput[],
  stack: ReportStackToolInput[],
  removedSaaS: string[],
): ReportToolGroup[] {
  const removed = new Set(removedSaaS)
  const groups: ReportToolGroup[] = []
  const bySource = new Map<string, ReportMappingRowInput[]>()
  for (const row of rows) {
    const list = bySource.get(row.source) ?? []
    list.push(row)
    bySource.set(row.source, list)
  }

  const toReportRow = (row: ReportMappingRowInput): ReportToolRow => ({
    id: row.id,
    capability: row.capability,
    targetLabel: row.targetLabel,
    targetModuleId: row.targetModuleId,
    decision: row.decision,
    confidence: row.confidence,
    justification: row.justification,
    flagged: row.flagged,
    flagReason: row.flagReason,
  })

  for (const tool of stack) {
    groups.push({
      toolName: tool.name,
      monthlyCost: tool.monthlyCost,
      switchedOff: removed.has(tool.name),
      rows: (bySource.get(tool.name) ?? []).map(toReportRow),
    })
  }

  // FR-006's "flagged, never dropped" spirit: a capability whose `source`
  // names no tool in the stack still belongs in the document.
  const stackNames = new Set(stack.map((tool) => tool.name))
  const unattributed = rows.filter((row) => !stackNames.has(row.source))
  if (unattributed.length > 0) {
    groups.push({
      toolName: null,
      monthlyCost: null,
      switchedOff: false,
      rows: unattributed.map(toReportRow),
    })
  }

  return groups
}

function buildDuplicates(rows: ReportMappingRowInput[]): ReportDuplicate[] {
  const byCapability = new Map<string, { capability: string; tools: string[] }>()
  for (const row of rows) {
    const key = normalizeCapability(row.capability)
    const entry = byCapability.get(key) ?? { capability: row.capability, tools: [] }
    if (row.source && !entry.tools.includes(row.source)) entry.tools.push(row.source)
    byCapability.set(key, entry)
  }
  return [...byCapability.values()].filter((entry) => entry.tools.length > 1)
}

function buildSavings(scenario: SavingsScenario): ReportSavings {
  return {
    lines: [
      {
        key: 'saasSaving',
        amount: scenario.grossAnnualSaving,
        source: 'customer',
        basis: {
          key: 'removedTools',
          params: { count: scenario.removedSaaS.length, tools: scenario.removedSaaS.join(', ') },
        },
      },
      {
        key: 'omOperatingCost',
        amount: scenario.omOperatingCost,
        source: 'admin',
        basis: { key: 'customerProvidedAnnual', params: {} },
      },
      {
        key: 'implementationCost',
        amount: scenario.implementationCost,
        source: 'admin',
        basis: { key: 'customerProvidedOneOff', params: {} },
      },
    ],
    netAnnualSaving: scenario.netAnnualSaving,
    netPaybackMonths: scenario.netPaybackMonths,
    removedSaaS: scenario.removedSaaS,
    retainedSaaS: scenario.retainedSaaS,
  }
}

function buildBacklog(
  rows: ReportMappingRowInput[],
  estimates: Record<string, number | null>,
  hourlyRate: number | null,
): ReportBacklog {
  const items: ReportBacklogItem[] = rows
    .filter((row) => row.decision === 'build')
    .map((row) => {
      const raw = estimates[row.id]
      const hours = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
      return {
        id: row.id,
        capability: row.capability,
        targetLabel: row.targetLabel,
        confidence: row.confidence,
        hours,
        cost: hours != null && hourlyRate != null ? hours * hourlyRate : null,
      }
    })

  const totalHours = items.reduce((total, item) => total + (item.hours ?? 0), 0)
  return {
    items,
    totalHours,
    totalCost: hourlyRate != null ? totalHours * hourlyRate : null,
    unestimatedCount: items.filter((item) => item.hours == null).length,
  }
}

/**
 * Cumulative net cash against doing nothing, month by month. The one-off is
 * paid pro rata across the ramp; from the month after, the net monthly saving
 * accrues. Both inputs are S-04's customer-provided figures — the backlog's
 * `hours × rate` estimate deliberately plays no part here.
 */
function buildCashCurve(
  scenario: SavingsScenario,
  implementationMonths: number | null,
): ReportCashCurve | null {
  if (scenario.netAnnualSaving == null || scenario.implementationCost == null) return null

  const rampMonths = Math.max(1, implementationMonths ?? DEFAULT_IMPLEMENTATION_MONTHS)
  const monthlyOutflow = scenario.implementationCost / rampMonths
  const monthlyNetSaving = scenario.netAnnualSaving / 12

  const points: ReportCashPoint[] = [{ month: 0, value: 0 }]
  let value = 0
  for (let month = 1; month <= CASH_HORIZON_MONTHS; month += 1) {
    value += month <= rampMonths ? -monthlyOutflow : monthlyNetSaving
    points.push({ month, value })
  }

  let trough = points[0]
  for (const point of points) {
    if (point.value < trough.value) trough = point
  }

  let breakEvenMonth: number | null = null
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].value >= 0 && points[index - 1].value < 0) {
      breakEvenMonth = points[index].month
      break
    }
  }

  return {
    horizonMonths: CASH_HORIZON_MONTHS,
    rampMonths,
    points,
    trough: trough.value,
    troughMonth: trough.month,
    breakEvenMonth,
    endValue: points[points.length - 1].value,
    monthlyNetSaving,
    paidNothing: scenario.implementationCost === 0,
  }
}

function buildOpenQuestions(
  authored: string | null,
  rows: ReportMappingRowInput[],
  unestimatedCount: number,
): ReportOpenQuestion[] {
  const questions: ReportOpenQuestion[] = []
  for (const line of (authored ?? '').split('\n')) {
    const text = line.trim()
    if (text) questions.push({ key: 'authored', text })
  }
  for (const row of rows) {
    if (row.confidence === 'low') questions.push({ key: 'lowConfidence', capability: row.capability })
  }
  if (unestimatedCount > 0) questions.push({ key: 'unestimated', count: unestimatedCount })
  return questions
}

export function buildReportModel(input: ReportModelInput): ReportModel {
  const { profile, stack, costs, authored } = input
  const rows = [...input.rows].sort((a, b) => a.position - b.position)

  const scenario = computeSavingsScenario(
    rows.map((row) => ({ source: row.source, decision: row.decision })),
    stack.map((tool) => ({ name: tool.name, monthlyCost: tool.monthlyCost ?? 0 })),
    { omOperatingCost: costs.omOperatingCost, implementationCost: costs.implementationCost },
  )

  const removed = new Set(scenario.removedSaaS)
  const monthlySpend = sumMonthly(stack)
  const retainedMonthly = sumMonthly(stack.filter((tool) => !removed.has(tool.name)))
  const omOperatingMonthly = costs.omOperatingCost != null ? costs.omOperatingCost / 12 : null

  const backlog = buildBacklog(rows, authored.buildEstimates ?? {}, authored.hourlyRate)
  const coveredCount = rows.filter((row) => COVERED_DECISIONS.includes(row.decision)).length
  const seats = stack.reduce((total, tool) => total + (tool.seats ?? 0), 0)

  return {
    currency: profile.currency,
    companyName: profile.companyName,
    industry: profile.industry,
    peopleCount: profile.peopleCount,
    seats: seats > 0 ? seats : null,
    preparedAt: authored.preparedAt,
    sentAt: authored.sentAt,
    analyst: authored.analyst?.trim() ? authored.analyst.trim() : null,
    notes: authored.notes?.trim() ? authored.notes.trim() : null,
    headline: buildHeadline(authored.headline, scenario.removedSaaS.length, stack.length),
    summary: buildSummary({
      monthlySpend,
      toolCount: stack.length,
      capabilityCount: rows.length,
      coveredCount,
      removedCount: scenario.removedSaaS.length,
      buildCount: backlog.items.length,
      retainedCount: scenario.retainedSaaS.length,
    }),
    kpis: {
      licencesToday: { amount: monthlySpend, toolCount: stack.length },
      licencesAfter: {
        amount: retainedMonthly + (omOperatingMonthly ?? 0),
        omOperatingMonthly,
      },
      netAnnualSaving: {
        amount: scenario.netAnnualSaving,
        removedCount: scenario.removedSaaS.length,
      },
      buildEffort: {
        hours: backlog.totalHours,
        cost: backlog.totalCost,
        itemCount: backlog.items.length,
        unestimatedCount: backlog.unestimatedCount,
      },
    },
    verdict: buildVerdict(rows),
    toolGroups: buildToolGroups(rows, stack, scenario.removedSaaS),
    duplicates: buildDuplicates(rows),
    savings: buildSavings(scenario),
    backlog,
    cashCurve: buildCashCurve(scenario, authored.implementationMonths),
    pains: profile.pains,
    mustKeep: profile.mustKeep,
    openQuestions: buildOpenQuestions(authored.openQuestions, rows, backlog.unestimatedCount),
  }
}
