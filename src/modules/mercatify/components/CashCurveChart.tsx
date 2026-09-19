"use client"
import * as React from 'react'
import { formatCurrency } from '@open-mercato/ui/utils/format'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { ReportCashCurve } from '../lib/report'

const WIDTH = 720
const HEIGHT = 300
// Wide enough that a right-aligned negative currency tick ("-€30,000.00")
// still fits inside the viewBox instead of being clipped at the edge.
const LEFT = 116
const RIGHT = 700
const TOP = 24
const BOTTOM = 250

/** Ticks land on 1/2/5 × 10ⁿ so zero is always one of them and labels stay readable. */
function niceStep(span: number): number {
  const raw = span / 5 || 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const candidate = [1, 2, 5, 10].find((factor) => factor * magnitude >= raw) ?? 10
  return candidate * magnitude
}

/**
 * Cumulative net cash position against doing nothing, month by month. The
 * shape is the argument: money goes out while the work happens, the curve
 * turns when the licences drop off, and it crosses zero the month the whole
 * move has paid for itself.
 *
 * Every figure comes from S-04's customer-provided costs (`lib/report.ts`),
 * never from the backlog's `hours × rate` estimate. The `aria-label` states
 * the trough, the break-even outcome and the end value in words, so the chart
 * is fully legible without the drawing.
 */
export default function CashCurveChart({
  curve,
  currency,
}: {
  curve: ReportCashCurve
  currency: string | null
}) {
  const t = useT()
  const money = React.useCallback(
    (value: number) => formatCurrency(value, currency) ?? String(Math.round(value)),
    [currency],
  )

  const values = curve.points.map((point) => point.value)
  const rawHigh = Math.max(0, ...values)
  const rawLow = Math.min(0, ...values)
  const step = niceStep(rawHigh - rawLow)
  const low = Math.floor(rawLow / step) * step
  const high = Math.ceil(rawHigh / step) * step

  const x = (month: number) => LEFT + ((RIGHT - LEFT) * month) / curve.horizonMonths
  const y = (value: number) => BOTTOM - (BOTTOM - TOP) * ((value - low) / (high - low || 1))

  const ticks: number[] = []
  for (let value = low; value <= high + step / 2; value += step) ticks.push(value)

  const path = curve.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.month).toFixed(2)},${y(point.value).toFixed(2)}`)
    .join(' ')
  const area = `${path} L${x(curve.horizonMonths).toFixed(2)},${y(0).toFixed(2)} L${x(0).toFixed(2)},${y(0).toFixed(2)} Z`

  const paybackDescription = curve.paidNothing
    ? t('mercatify.report.cashCurve.aria.nothingSpent')
    : curve.breakEvenMonth != null
      ? t('mercatify.report.cashCurve.aria.crosses', { month: curve.breakEvenMonth })
      : t('mercatify.report.cashCurve.aria.neverCrosses', { months: curve.horizonMonths })

  const caption = curve.paidNothing
    ? curve.monthlyNetSaving > 0
      ? t('mercatify.report.cashCurve.caption.nothingSpent', {
        month: curve.rampMonths + 1,
        amount: money(curve.monthlyNetSaving),
      })
      : t('mercatify.report.cashCurve.caption.nothingAtAll')
    : curve.breakEvenMonth != null
      ? t('mercatify.report.cashCurve.caption.paysBack', {
        month: curve.breakEvenMonth,
        amount: money(curve.monthlyNetSaving),
      })
      : t('mercatify.report.cashCurve.caption.neverPaysBack', { months: curve.horizonMonths })

  return (
    <figure className="m-0 space-y-2" data-testid="mercatify-report-cash-curve">
      <figcaption className="space-y-1">
        <div className="text-sm font-medium">{t('mercatify.report.cashCurve.title')}</div>
        <div className="text-sm text-muted-foreground">{caption}</div>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        className="w-full"
        aria-label={t('mercatify.report.cashCurve.aria.summary', {
          months: curve.horizonMonths,
          trough: money(curve.trough),
          troughMonth: curve.troughMonth,
          payback: paybackDescription,
          end: money(curve.endValue),
        })}
      >
        {/* the months the money is going out */}
        <rect
          className="fill-muted"
          x={LEFT}
          y={TOP}
          width={Math.max(0, x(curve.rampMonths) - LEFT)}
          height={BOTTOM - TOP}
        />
        {ticks.map((value) => (
          <g key={`tick-${value}`}>
            <line className="stroke-border" x1={LEFT} y1={y(value)} x2={RIGHT} y2={y(value)} />
            <text className="fill-muted-foreground text-xs" x={LEFT - 10} y={y(value) + 4} textAnchor="end">
              {money(value)}
            </text>
          </g>
        ))}
        <line className="stroke-foreground" x1={LEFT} y1={y(0)} x2={RIGHT} y2={y(0)} />
        {[0, 6, 12, 18, 24]
          .filter((month) => month <= curve.horizonMonths)
          .map((month) => (
            <text
              key={`month-${month}`}
              className="fill-muted-foreground text-xs"
              x={x(month)}
              y={BOTTOM + 20}
              textAnchor="middle"
            >
              {t('mercatify.report.cashCurve.axis.month', { month })}
            </text>
          ))}
        <path className="fill-primary/10" d={area} />
        <path className="fill-none stroke-primary stroke-2" d={path} />
        {curve.trough < 0 ? <circle className="fill-primary" cx={x(curve.troughMonth)} cy={y(curve.trough)} r={4.5} /> : null}
        {curve.breakEvenMonth != null ? (
          <circle className="fill-primary" cx={x(curve.breakEvenMonth)} cy={y(0)} r={4.5} />
        ) : null}
        <circle className="fill-primary" cx={x(curve.horizonMonths)} cy={y(curve.endValue)} r={4.5} />
      </svg>
    </figure>
  )
}
