/**
 * The offer/report money model — ported from assets/shared/om-core.js
 * (buildOffer, buildCashCurve). Deliberately narrow: a tool is a candidate to
 * retire only when EVERY job it carries lands natively or by configuration.
 * Pure functions so the console preview and the client's page can compute the
 * exact same numbers from the same inputs.
 */
import type { MercatifyCapOverride, MercatifyReport, MercatifyRequestTool } from '../data/entities'
import {
  requestCaps, requestModules, requestMonthly, requestSeats, statusCounts,
  type MappingStatus, type RequestCapRow, type RequestModuleRow,
} from './moduleMap'

const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', PLN: 'zł' }

/** Same grouping as the mock's fmtMoney — the sign belongs in front of the
 * whole amount, which matters once the cash curve goes negative. */
export function fmtMoney(n: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency] || ''
  const raw = Math.round(Number(n) || 0)
  const sign = raw < 0 ? '−' : ''
  const v = Math.abs(raw).toLocaleString('en-US')
  return currency === 'PLN' ? `${sign}${v} ${sym}` : `${sign}${sym}${v}`
}

export type OfferToolLine = {
  name: string
  monthly: number
  seats: number
  rows: RequestCapRow[]
  reasons: RequestCapRow[]
}

export type OfferInput = {
  company: string
  industry?: string | null
  peopleCount?: number | null
  currency: string
  pains?: string | null
  mustKeep?: string | null
  tools: MercatifyRequestTool[]
  overrides?: Record<string, MercatifyCapOverride> | null
  report?: MercatifyReport | null
}

export type Offer = {
  company: string
  industry: string | null
  people: number | null
  currency: string
  generatedAt: string
  headline: string
  notes: string
  analyst: string
  openQuestions: string
  months: number
  pains: string | null
  mustKeep: string | null
  caps: RequestCapRow[]
  counts: Record<MappingStatus, number>
  modules: RequestModuleRow[]
  retire: OfferToolLine[]
  stays: OfferToolLine[]
  seats: number
  monthlyNow: number
  retained: number
  hosting: number
  monthlyAfter: number
  monthlySaving: number
  annualSaving: number
  monthlyRetire: number
  /** Capabilities nothing in the platform covers yet — a list to plan around,
   * not a costed line item (no hourly estimate is kept). */
  buildRows: RequestCapRow[]
  duplicates: RequestCapRow[]
  covered: number
  lowConfidence: RequestCapRow[]
}

export function buildOffer(input: OfferInput): Offer {
  const caps = requestCaps(input.tools, input.overrides)
  const counts = statusCounts(caps)
  const byCap: Record<string, RequestCapRow> = {}
  caps.forEach((c) => { byCap[c.cap] = c })
  const a = input.report?.assumptions || {}

  const retire: OfferToolLine[] = []
  const stays: OfferToolLine[] = []
  for (const t of input.tools) {
    const rows = (t.caps || []).map((c) => byCap[c]).filter(Boolean) as RequestCapRow[]
    const covered = rows.length > 0 && rows.every((r) => r.status === 'native' || r.status === 'configure')
    const entry: OfferToolLine = {
      name: t.name,
      monthly: Number(t.monthly) || 0,
      seats: Number(t.seats) || 0,
      rows,
      reasons: rows.filter((r) => r.status !== 'native' && r.status !== 'configure'),
    }
    ;(covered ? retire : stays).push(entry)
  }

  const monthlyNow = requestMonthly(input.tools)
  const monthlyRetire = retire.reduce((s, t) => s + t.monthly, 0)
  const retained = stays.reduce((s, t) => s + t.monthly, 0)
  const hosting = Number(a.hosting) || 0
  const monthlyAfter = retained + hosting
  const monthlySaving = monthlyNow - monthlyAfter

  const modules = requestModules(input.tools, input.overrides).filter((m) => m.module.id.indexOf('__') !== 0)
  const covered = counts.native + counts.configure

  return {
    company: input.company,
    industry: input.industry ?? null,
    people: input.peopleCount ?? null,
    currency: input.currency,
    generatedAt: input.report?.generatedAt || new Date().toISOString().slice(0, 10),
    headline: input.report?.headline || '',
    notes: input.report?.notes || '',
    analyst: a.analyst || '',
    openQuestions: a.notes || '',
    months: Number(a.months) || 3,
    pains: input.pains ?? null,
    mustKeep: input.mustKeep ?? null,
    caps, counts, modules,
    retire, stays,
    seats: requestSeats(input.tools),
    monthlyNow, retained, hosting, monthlyAfter, monthlySaving,
    annualSaving: monthlySaving * 12,
    monthlyRetire,
    buildRows: caps.filter((c) => c.status === 'build'),
    duplicates: caps.filter((c) => c.duplicate),
    covered,
    lowConfidence: caps.filter((c) => c.conf === 'low'),
  }
}

export const CASH_HORIZON = 24

export type CashPoint = { m: number; v: number }
export type CashCurve = {
  points: CashPoint[]
  /** Implementation months — old licences keep running, nothing is saved yet. */
  ramp: number
  /** First month the monthly saving actually lands. */
  savingsStartMonth: number
  end: number
}

/** Cumulative saving, month by month, against doing nothing. There is no
 * up-front cost in this model (no hourly build estimate), so the curve never
 * goes negative — it simply holds at zero through the implementation ramp,
 * then rises by the monthly saving every month after. */
export function buildCashCurve(offer: Offer): CashCurve {
  const ramp = Math.max(1, Number(offer.months) || 3)
  const points: CashPoint[] = [{ m: 0, v: 0 }]
  let v = 0
  for (let m = 1; m <= CASH_HORIZON; m++) {
    if (m > ramp) v += offer.monthlySaving
    points.push({ m, v })
  }
  return { points, ramp, savingsStartMonth: ramp + 1, end: points[points.length - 1].v }
}
