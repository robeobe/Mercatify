"use client"
import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { buildCashCurve, fmtMoney, type Offer } from '../lib/offer'
import { CASH_HORIZON } from '../lib/offer'

/**
 * Cumulative net cash position, month by month — ported from
 * assets/shared/om-core.js renderCashChart. The one-off switching cost is a
 * single entered figure (not a per-capability hourly build-up); when it is
 * left blank the curve simply never dips and the caption says so.
 */
export default function CashChart({ offer }: { offer: Offer }) {
  const t = useT()
  if (!offer.oneOff && offer.monthlySaving <= 0) return null
  const curve = buildCashCurve(offer)
  const cur = offer.currency

  const W = 720, H = 290, L = 56, R = 700, T = 24, B = 250
  const vals = curve.points.map((p) => p.v)
  let hi = Math.max(0, ...vals)
  let lo = Math.min(0, ...vals)

  const raw = (hi - lo) / 5 || 1
  const mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10))
  const step = ([1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag
  lo = Math.floor(lo / step) * step
  hi = Math.ceil(hi / step) * step

  const x = (m: number) => L + (R - L) * (m / CASH_HORIZON)
  const y = (v: number) => B - (B - T) * ((v - lo) / (hi - lo))

  const gridValues: number[] = []
  for (let gv = lo; gv <= hi + step / 2; gv += step) gridValues.push(gv)

  const d = curve.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ')
  const areaD = `${d} L${x(CASH_HORIZON).toFixed(2)},${y(0).toFixed(2)} L${x(0).toFixed(2)},${y(0).toFixed(2)} Z`

  let caption: string
  if (curve.payback === 'none') {
    caption = offer.monthlySaving > 0
      ? t('mercatify.report.chart.captionNoneSaving', 'There is nothing to pay back — no switching cost was entered. The saving starts in month {month} and runs at {amount} a month.', { month: curve.ramp + 1, amount: fmtMoney(offer.monthlySaving, cur) })
      : t('mercatify.report.chart.captionNoneNothing', 'Nothing to pay back, and nothing saved yet either on these numbers.')
  } else if (curve.payback) {
    caption = t('mercatify.report.chart.captionPayback', 'The whole move pays for itself in month {month}. After that it is {amount} a month you keep.', { month: curve.payback, amount: fmtMoney(offer.monthlySaving, cur) })
  } else {
    caption = t('mercatify.report.chart.captionNever', 'On these numbers it does not pay for itself inside {horizon} months. Worth saying out loud before anything moves.', { horizon: CASH_HORIZON })
  }

  const ariaLabel = [
    t('mercatify.report.chart.ariaIntro', 'Cumulative net cash position over {horizon} months.', { horizon: CASH_HORIZON }),
    t('mercatify.report.chart.ariaTrough', 'Falls to {amount} at month {month}.', { amount: fmtMoney(curve.trough, cur), month: curve.troughMonth }),
    curve.payback === 'none'
      ? t('mercatify.report.chart.ariaNeverSpent', 'Never goes negative — nothing was spent up front.')
      : curve.payback
        ? t('mercatify.report.chart.ariaCrosses', 'Crosses zero in month {month}.', { month: curve.payback })
        : t('mercatify.report.chart.ariaDoesNotCross', 'Does not cross zero within {horizon} months.', { horizon: CASH_HORIZON }),
    t('mercatify.report.chart.ariaEnds', 'Ends at {amount}.', { amount: fmtMoney(curve.end, cur) }),
  ].join(' ')

  return (
    <figure className="mt-4 rounded-lg border p-4">
      <figcaption className="mb-2">
        <div className="text-sm font-semibold">{t('mercatify.report.chart.title', 'What it looks like in cash, month by month')}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{caption}</div>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="block w-full h-auto overflow-visible">
        <rect x={L} y={T} width={x(curve.ramp) - L} height={B - T} fill="var(--muted)" />
        <text x={L + 8} y={T + 14} fontFamily="ui-monospace, monospace" fontSize={10} fill="var(--muted-foreground)">
          {t('mercatify.report.chart.building', 'switching over')}
        </text>

        {gridValues.map((gv) => (
          <React.Fragment key={gv}>
            <line x1={L} y1={y(gv)} x2={R} y2={y(gv)} stroke="var(--border)" strokeWidth={1} />
            <text x={L - 8} y={y(gv) + 4} textAnchor="end" fontFamily="ui-monospace, monospace" fontSize={10} fill="var(--muted-foreground)">
              {fmtMoney(gv, cur)}
            </text>
          </React.Fragment>
        ))}
        <line x1={L} y1={y(0)} x2={R} y2={y(0)} stroke="var(--ring)" strokeWidth={1} strokeDasharray="4 3" />
        {[0, 6, 12, 18, 24].map((m) => (
          <text key={m} x={x(m)} y={B + 18} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={10} fill="var(--muted-foreground)">
            M{m}
          </text>
        ))}

        <path d={areaD} fill="var(--chart-line, #3f7d20)" opacity={0.08} />
        <path d={d} fill="none" stroke="var(--chart-line, #3f7d20)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {curve.trough < 0 ? (
          <Marker
            x={x(curve.troughMonth)} y={y(curve.trough)}
            label={t('mercatify.report.chart.markTrough', '{amount} — most you are ever out', { amount: fmtMoney(curve.trough, cur) })}
            // Below the dot, not above: the payback marker's label sits just above the
            // zero line, and the trough is often only a few months earlier on the same
            // chart — placing both labels above their dots crowds them into the same
            // narrow band. Keeping this one below the trough dot (and the zero line)
            // clears that band regardless of how close the two months are.
            anchor={curve.troughMonth > CASH_HORIZON * 0.6 ? 'end' : 'start'} dy={16}
          />
        ) : null}
        {curve.payback && curve.payback !== 'none' ? (
          <Marker x={x(curve.payback)} y={y(0)} label={t('mercatify.report.chart.markPayback', 'paid for itself · M{month}', { month: curve.payback })} anchor="end" dy={-10} />
        ) : null}
        <Marker x={x(CASH_HORIZON)} y={y(curve.end)} label={fmtMoney(curve.end, cur)} anchor="end" dy={-10} />

        {curve.points.map((p) => (
          <rect
            key={p.m}
            x={x(p.m) - (R - L) / CASH_HORIZON / 2}
            y={T}
            width={(R - L) / CASH_HORIZON}
            height={B - T}
            fill="transparent"
          >
            <title>{`Month ${p.m}: ${fmtMoney(p.v, cur)}${p.m <= curve.ramp ? ' — switching over' : ''}`}</title>
          </rect>
        ))}
      </svg>
    </figure>
  )
}

function Marker({ x, y, label, anchor, dy }: { x: number; y: number; label: string; anchor: 'start' | 'end'; dy: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={4.5} fill="var(--chart-line, #3f7d20)" stroke="var(--card)" strokeWidth={2} />
      <text x={x + (anchor === 'end' ? -8 : 8)} y={y + dy} textAnchor={anchor} fontFamily="ui-monospace, monospace" fontSize={10} fontWeight={600} fill="var(--foreground)">
        {label}
      </text>
    </>
  )
}
