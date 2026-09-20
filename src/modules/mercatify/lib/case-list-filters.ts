import type { Where, WhereValue } from '@open-mercato/shared/lib/query/types'
import { isSubmittedCaseStatus, SUBMITTED_CASE_STATUSES } from './request-progress'

export type InterviewCaseListQuery = {
  id?: string
  ids?: string
  status?: string
  mine?: boolean
}

export type InterviewCaseListFilterInput = InterviewCaseListQuery & {
  actorUserId: string | null
  canSeeAllOrgCases: boolean
}

export type InterviewCaseListFilterResult =
  | { ok: true; filters: Where<Record<string, unknown>> }
  | { ok: false; error: 'actor_required' }

/**
 * Own-list and submitted-only narrowing for interview cases.
 *
 * Tenant/organization scope is applied by `makeCrudRoute`. This helper only adds
 * owner and lifecycle filters and must fail closed when an actor is required.
 */
export function buildInterviewCaseListFilters(
  input: InterviewCaseListFilterInput,
): InterviewCaseListFilterResult {
  const restrictToOwner = Boolean(input.mine) || !input.canSeeAllOrgCases
  if (restrictToOwner && !input.actorUserId) {
    return { ok: false, error: 'actor_required' }
  }

  const filters: Where<Record<string, unknown>> = {}
  const F = filters as Record<string, WhereValue>

  if (input.ids) {
    const ids = input.ids.split(',').map((value) => value.trim()).filter((value) => value.length > 0)
    if (ids.length > 0) F.id = { $in: ids }
  }
  if (input.id) F.id = input.id
  if (restrictToOwner && input.actorUserId) F.created_by_user_id = input.actorUserId

  if (input.mine) {
    if (input.status) {
      if (!isSubmittedCaseStatus(input.status)) F.id = { $in: [] }
      else F.status = input.status
    } else {
      F.status = { $in: [...SUBMITTED_CASE_STATUSES] }
    }
  } else if (input.status) {
    F.status = input.status
  }

  return { ok: true, filters }
}

/* ─────────────── the staff queue ───────────────
   The console's "Stack requests" screen filters and totals one fetched page in
   the browser, so the toolbar answers instantly. Everything the screen needs to
   derive from a row lives here as a pure function: the component renders, it
   does not count. */

export type QueueTool = {
  name: string
  seats?: number | null
  monthlyCost?: number | null
}

export type QueueCase = {
  id: string
  status: string
  companyName?: string | null
  industry?: string | null
  currency?: string | null
  submittedAt?: string | null
  createdAt?: string | null
  tools?: QueueTool[] | null
}

export type QueueFilter = {
  text?: string
  status?: string
}

/** `REQ-` plus the first four hex characters of the case id, as in the mockups. */
export function caseRef(id: string): string {
  const hex = String(id).replace(/[^0-9a-f]/gi, '').slice(0, 4).toUpperCase()
  return `REQ-${hex}`
}

export function caseToolNames(input: QueueCase): string[] {
  return (input.tools ?? []).map((tool) => tool.name).filter((name) => Boolean(name))
}

export function caseMonthly(input: QueueCase): number {
  return (input.tools ?? []).reduce((sum, tool) => sum + (Number(tool.monthlyCost) || 0), 0)
}

export function caseSeats(input: QueueCase): number {
  return (input.tools ?? []).reduce((sum, tool) => sum + (Number(tool.seats) || 0), 0)
}

export function caseReceivedAt(input: QueueCase): string | null {
  return input.submittedAt ?? input.createdAt ?? null
}

/** Only submitted requests reach the queue — a draft is still the client's. */
export function submittedQueueCases(cases: QueueCase[]): QueueCase[] {
  return cases.filter((item) => isSubmittedCaseStatus(item.status))
}

export function matchesQueueFilter(input: QueueCase, filter: QueueFilter): boolean {
  if (filter.status && input.status !== filter.status) return false
  const text = (filter.text ?? '').trim().toLowerCase()
  if (!text) return true
  const haystack = [
    caseRef(input.id),
    input.companyName ?? '',
    input.industry ?? '',
    ...caseToolNames(input),
  ].join(' ').toLowerCase()
  return haystack.includes(text)
}

export function filterQueueCases(cases: QueueCase[], filter: QueueFilter): QueueCase[] {
  return cases.filter((item) => matchesQueueFilter(item, filter))
}

export type QueueStats = {
  newCount: number
  mappingCount: number
  sentCount: number
  acceptedCount: number
  consultCount: number
  answeredCount: number
  monthlyTotal: number
  currency: string
}

/**
 * Header figures are declared spend, not a saving — the saving only exists once
 * a mapping says what actually moves. Mixed currencies are summed as entered and
 * shown in whichever currency most of the rows used.
 */
export function queueStats(cases: QueueCase[]): QueueStats {
  const count = (statuses: string[]) => cases.filter((item) => statuses.includes(item.status)).length
  const acceptedCount = count(['accepted'])
  const consultCount = count(['consult'])
  return {
    newCount: count(['new']),
    mappingCount: count(['mapping', 'mapped']),
    sentCount: count(['sent']),
    acceptedCount,
    consultCount,
    answeredCount: acceptedCount + consultCount,
    monthlyTotal: cases.reduce((sum, item) => sum + caseMonthly(item), 0),
    currency: majorityCurrency(cases),
  }
}

export function majorityCurrency(cases: QueueCase[], fallback = 'EUR'): string {
  const tally = new Map<string, number>()
  for (const item of cases) {
    const currency = (item.currency ?? '').trim().toUpperCase()
    if (!currency) continue
    tally.set(currency, (tally.get(currency) ?? 0) + 1)
  }
  let best = fallback
  let bestCount = 0
  for (const [currency, seen] of tally) {
    if (seen > bestCount) {
      best = currency
      bestCount = seen
    }
  }
  return best
}

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', PLN: 'zł' }

export function formatQueueMoney(value: number, currency?: string | null): string {
  const code = (currency ?? 'EUR').toUpperCase()
  const symbol = CURRENCY_SYMBOLS[code] ?? ''
  const rounded = Math.round(Number(value) || 0)
  const sign = rounded < 0 ? '−' : ''
  const digits = Math.abs(rounded).toLocaleString('en-US')
  return code === 'PLN' ? `${sign}${digits} ${symbol}` : `${sign}${symbol}${digits}`
}

/**
 * One action per row, chosen by where the request actually is — the mockup's
 * `requestActions()[0]`. A new request cannot be reported on, and a sent one is
 * not re-mapped from the queue. Only an accepted request gets the filled button:
 * it is the single step the queue is actually asking for.
 */
export type QueueAction = {
  key: 'map' | 'continueMapping' | 'buildReport' | 'report' | 'integrate'
  href: string
  filled: boolean
}

export function queuePrimaryAction(input: QueueCase): QueueAction {
  const base = `/backend/cases/${input.id}`
  switch (input.status) {
    case 'new':
      return { key: 'map', href: base, filled: false }
    case 'mapping':
      return { key: 'continueMapping', href: `${base}/mapping`, filled: false }
    case 'mapped':
      return { key: 'buildReport', href: `${base}/report`, filled: false }
    case 'accepted':
      return { key: 'integrate', href: `${base}/handoff?integrate=1`, filled: true }
    default:
      return { key: 'report', href: `${base}/report`, filled: false }
  }
}
