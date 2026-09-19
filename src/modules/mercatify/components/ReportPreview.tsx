"use client"
import * as React from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@open-mercato/ui/primitives/table'
import { StatusBadge, type StatusMap } from '@open-mercato/ui/primitives/status-badge'
import { Tag, type TagMap } from '@open-mercato/ui/primitives/tag'
import { Separator } from '@open-mercato/ui/primitives/separator'
import { formatCurrency } from '@open-mercato/ui/utils/format'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import CashCurveChart from './CashCurveChart'
import { REPORT_DECISION_ORDER, type ReportModel } from '../lib/report'
import {
  confidenceVariants,
  decisionTagMap,
  type MercatifyConfidence,
  type MercatifyDecision,
} from './MappingTable'

/** Verdict-bar fills, in the same reading order as `REPORT_DECISION_ORDER`. */
const verdictFills: Record<string, string> = {
  native: 'fill-status-success-icon',
  configure: 'fill-status-info-icon',
  integrate: 'fill-status-warning-icon',
  keep: 'fill-status-neutral-icon',
  build: 'fill-primary',
}

const VERDICT_BAR_WIDTH = 600
const VERDICT_BAR_HEIGHT = 12

function Section({ title, lead, children }: { title: string; lead?: string; children?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {lead ? <p className="text-sm text-muted-foreground">{lead}</p> : null}
      {children}
    </section>
  )
}

/**
 * Renders the client-facing report from the model and nothing else — no
 * fetching, no mutation, no knowledge of the admin's compose form. S-10 (the
 * client's own view of the sent report) reuses this verbatim, which is what
 * stops "what I am about to send" and "what they get" from drifting.
 */
export default function ReportPreview({ report }: { report: ReportModel }) {
  const t = useT()
  const currency = report.currency
  const money = React.useCallback(
    (value: number | null | undefined) => formatCurrency(value ?? null, currency) ?? '—',
    [currency],
  )

  const headline = report.headline.kind === 'override'
    ? report.headline.text
    : t(`mercatify.report.headline.${report.headline.key}`, report.headline.params)

  const verdictSegments = report.verdict.filter((segment) => segment.count > 0)
  let verdictOffset = 0

  const meta = [
    report.preparedAt ? t('mercatify.report.meta.preparedOn', { date: new Date(report.preparedAt).toLocaleDateString() }) : null,
    report.industry,
    report.peopleCount != null ? t('mercatify.report.meta.people', { count: report.peopleCount }) : null,
    report.seats != null ? t('mercatify.report.meta.seats', { count: report.seats }) : null,
    report.analyst
      ? t('mercatify.report.meta.reviewedBy', { analyst: report.analyst })
      : t('mercatify.report.meta.notReviewed'),
  ].filter((entry): entry is string => Boolean(entry))

  return (
    <article className="space-y-6" data-testid="mercatify-report-preview">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold">{headline}</h2>
        <p className="text-sm">
          {report.summary.map((clause) => t(`mercatify.report.summary.${clause.key}`, {
            ...clause.params,
            amount: money(clause.params.amount),
          })).join(' ')}
        </p>
        <p className="text-xs text-muted-foreground">{meta.join(' · ')}</p>
      </header>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="mercatify-report-kpis">
        <div className="rounded-lg border border-border p-3">
          <dt className="text-xs text-muted-foreground">{t('mercatify.report.kpi.licencesToday.label')}</dt>
          <dd className="text-lg font-semibold">{money(report.kpis.licencesToday.amount)}</dd>
          <p className="text-xs text-muted-foreground">
            {t('mercatify.report.kpi.licencesToday.detail', { tools: report.kpis.licencesToday.toolCount })}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-xs text-muted-foreground">{t('mercatify.report.kpi.licencesAfter.label')}</dt>
          <dd className="text-lg font-semibold">{money(report.kpis.licencesAfter.amount)}</dd>
          <p className="text-xs text-muted-foreground">
            {report.kpis.licencesAfter.omOperatingMonthly != null
              ? t('mercatify.report.kpi.licencesAfter.detail', { amount: money(report.kpis.licencesAfter.omOperatingMonthly) })
              : t('mercatify.report.kpi.licencesAfter.detailNoOperating')}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-xs text-muted-foreground">{t('mercatify.report.kpi.netAnnualSaving.label')}</dt>
          <dd className="text-lg font-semibold">
            {report.kpis.netAnnualSaving.amount != null ? money(report.kpis.netAnnualSaving.amount) : '—'}
          </dd>
          <p className="text-xs text-muted-foreground">
            {report.kpis.netAnnualSaving.amount != null
              ? t('mercatify.report.kpi.netAnnualSaving.detail', { tools: report.kpis.netAnnualSaving.removedCount })
              : t('mercatify.report.kpi.netAnnualSaving.detailMissing')}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="text-xs text-muted-foreground">{t('mercatify.report.kpi.buildEffort.label')}</dt>
          <dd className="text-lg font-semibold">
            {report.kpis.buildEffort.cost != null
              ? money(report.kpis.buildEffort.cost)
              : t('mercatify.report.hours', { hours: report.kpis.buildEffort.hours })}
          </dd>
          <p className="text-xs text-muted-foreground">
            {report.kpis.buildEffort.unestimatedCount > 0
              ? t('mercatify.report.kpi.buildEffort.detailUnestimated', {
                hours: report.kpis.buildEffort.hours,
                items: report.kpis.buildEffort.unestimatedCount,
              })
              : t('mercatify.report.kpi.buildEffort.detail', {
                hours: report.kpis.buildEffort.hours,
                items: report.kpis.buildEffort.itemCount,
              })}
          </p>
        </div>
      </dl>

      {verdictSegments.length > 0 ? (
        <Section title={t('mercatify.report.verdict.title')} lead={t('mercatify.report.verdict.lead')}>
          <svg
            viewBox={`0 0 ${VERDICT_BAR_WIDTH} ${VERDICT_BAR_HEIGHT}`}
            className="w-full"
            role="img"
            aria-label={verdictSegments
              .map((segment) => t('mercatify.report.verdict.ariaSegment', {
                count: segment.count,
                decision: t(`mercatify.mapping.decision.${segment.decision}`),
              }))
              .join(', ')}
            data-testid="mercatify-report-verdict-bar"
          >
            {verdictSegments.map((segment) => {
              const width = segment.share * VERDICT_BAR_WIDTH
              const offset = verdictOffset
              verdictOffset += width
              return (
                <rect
                  key={segment.decision}
                  className={verdictFills[segment.decision]}
                  x={offset}
                  y={0}
                  width={width}
                  height={VERDICT_BAR_HEIGHT}
                />
              )
            })}
          </svg>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {REPORT_DECISION_ORDER.filter((decision) => report.verdict.some((s) => s.decision === decision && s.count > 0)).map((decision) => (
              <li key={decision}>
                {t('mercatify.report.verdict.legendItem', {
                  count: report.verdict.find((s) => s.decision === decision)?.count ?? 0,
                  decision: t(`mercatify.mapping.decision.${decision}`),
                })}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={t('mercatify.report.tools.title')} lead={t('mercatify.report.tools.lead')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="whitespace-nowrap">{t('mercatify.report.tools.column.tool')}</TableHead>
              <TableHead scope="col" className="w-[42%] min-w-[16rem]">{t('mercatify.report.tools.column.capability')}</TableHead>
              <TableHead scope="col" className="min-w-[9rem]">{t('mercatify.report.tools.column.target')}</TableHead>
              <TableHead scope="col" className="whitespace-nowrap">{t('mercatify.report.tools.column.verdict')}</TableHead>
              <TableHead scope="col" className="whitespace-nowrap">{t('mercatify.report.tools.column.confidence')}</TableHead>
              <TableHead scope="col" className="whitespace-nowrap text-right">{t('mercatify.report.tools.column.monthly')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.toolGroups.flatMap((group) => group.rows.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap align-top">
                  {index === 0 ? (
                    <>
                      <div className="font-medium">{group.toolName ?? t('mercatify.report.tools.unattributed')}</div>
                      {group.switchedOff ? (
                        <div className="text-xs text-muted-foreground">{t('mercatify.report.tools.switchedOff')}</div>
                      ) : null}
                    </>
                  ) : null}
                </TableCell>
                <TableCell className="align-top">
                  <div>{row.capability}</div>
                  <div className="text-xs text-muted-foreground">{row.justification}</div>
                </TableCell>
                <TableCell className="align-top">
                  {/* A flag is a note for the reader, not an error in their
                      document — same treatment as the mapping table. */}
                  <div>{row.targetLabel ?? '—'}</div>
                  {row.flagged ? (
                    <div className="text-xs text-muted-foreground">
                      {row.flagReason === 'module_not_enabled'
                        ? t('mercatify.mapping.table.flag.moduleNotEnabled', { module: row.targetModuleId ?? '' })
                        : t('mercatify.mapping.table.flag.unmapped')}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap align-top">
                  <Tag variant={decisionTagMap[row.decision as MercatifyDecision]}>
                    {t(`mercatify.mapping.decision.${row.decision}`)}
                  </Tag>
                </TableCell>
                <TableCell className="whitespace-nowrap align-top">
                  <StatusBadge variant={confidenceVariants[row.confidence as MercatifyConfidence]} dot>
                    {t(`mercatify.mapping.confidence.${row.confidence}`)}
                  </StatusBadge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right align-top">{index === 0 ? money(group.monthlyCost) : ''}</TableCell>
              </TableRow>
            )))}
          </TableBody>
        </Table>
      </Section>

      {report.duplicates.length > 0 ? (
        <Section title={t('mercatify.report.duplicates.title')} lead={t('mercatify.report.duplicates.lead')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('mercatify.report.duplicates.column.capability')}</TableHead>
                <TableHead scope="col">{t('mercatify.report.duplicates.column.tools')}</TableHead>
                <TableHead scope="col">{t('mercatify.report.duplicates.column.count')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.duplicates.map((duplicate) => (
                <TableRow key={duplicate.capability}>
                  <TableCell>{duplicate.capability}</TableCell>
                  <TableCell>{duplicate.tools.join(', ')}</TableCell>
                  <TableCell>{duplicate.tools.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      ) : null}

      <Section
        title={t('mercatify.report.backlog.title')}
        lead={report.backlog.items.length > 0
          ? t('mercatify.report.backlog.lead')
          : t('mercatify.report.backlog.leadEmpty')}
      >
        {report.backlog.items.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t('mercatify.report.backlog.column.what')}</TableHead>
                  <TableHead scope="col">{t('mercatify.report.backlog.column.target')}</TableHead>
                  <TableHead scope="col">{t('mercatify.report.backlog.column.confidence')}</TableHead>
                  <TableHead scope="col">{t('mercatify.report.backlog.column.hours')}</TableHead>
                  <TableHead scope="col">{t('mercatify.report.backlog.column.cost')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.backlog.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.capability}</TableCell>
                    <TableCell>{item.targetLabel ?? '—'}</TableCell>
                    <TableCell>{t(`mercatify.mapping.confidence.${item.confidence}`)}</TableCell>
                    <TableCell>
                      {item.hours != null
                        ? t('mercatify.report.hours', { hours: item.hours })
                        : t('mercatify.report.backlog.toEstimate')}
                    </TableCell>
                    <TableCell>{item.cost != null ? money(item.cost) : '—'}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>{t('mercatify.report.backlog.total')}</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell>{t('mercatify.report.hours', { hours: report.backlog.totalHours })}</TableCell>
                  <TableCell>{report.backlog.totalCost != null ? money(report.backlog.totalCost) : '—'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            {report.backlog.unestimatedCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('mercatify.report.backlog.floorNote', { items: report.backlog.unestimatedCount })}
              </p>
            ) : null}
          </>
        ) : null}
      </Section>

      <Section title={t('mercatify.report.savings.title')} lead={t('mercatify.report.savings.lead')}>
        <dl className="space-y-2 text-sm" data-testid="mercatify-report-saving-lines">
          {report.savings.lines.map((line) => (
            <div key={line.key} className="flex items-start justify-between gap-4">
              <dt>
                <span>{t(`mercatify.report.savings.line.${line.key}`)}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {t(`mercatify.report.savings.basis.${line.basis.key}`, {
                    count: line.basis.params.count ?? 0,
                    tools: line.basis.params.tools ?? '',
                  })}
                  {' · '}
                  {t(`mercatify.report.savings.source.${line.source}`)}
                </span>
              </dt>
              <dd className="font-medium">{line.amount != null ? money(line.amount) : '—'}</dd>
            </div>
          ))}
          <Separator />
          <div className="flex items-center justify-between">
            <dt className="font-medium">{t('mercatify.report.savings.line.netAnnualSaving')}</dt>
            <dd className="font-semibold">
              {report.savings.netAnnualSaving != null ? money(report.savings.netAnnualSaving) : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>{t('mercatify.report.savings.line.payback')}</dt>
            <dd className="font-medium">
              {report.savings.netPaybackMonths != null
                ? t('mercatify.report.savings.payback.months', {
                  count: Math.round(report.savings.netPaybackMonths * 10) / 10,
                })
                : t('mercatify.report.savings.payback.notReached')}
            </dd>
          </div>
        </dl>
      </Section>

      {report.cashCurve ? (
        <CashCurveChart curve={report.cashCurve} currency={currency} />
      ) : (
        <p className="text-sm text-muted-foreground">{t('mercatify.report.cashCurve.unavailable')}</p>
      )}

      {report.pains || report.mustKeep ? (
        <Section title={t('mercatify.report.ownWords.title')}>
          <div className="space-y-3 rounded-lg border border-border p-4">
            {report.pains ? (
              <div>
                <h4 className="text-sm font-medium">{t('mercatify.report.ownWords.pains')}</h4>
                <p className="text-sm text-muted-foreground">{report.pains}</p>
              </div>
            ) : null}
            {report.mustKeep ? (
              <div>
                <h4 className="text-sm font-medium">{t('mercatify.report.ownWords.mustKeep')}</h4>
                <p className="text-sm text-muted-foreground">{report.mustKeep}</p>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section title={t('mercatify.report.unsure.title')} lead={t('mercatify.report.unsure.lead')}>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {report.openQuestions.length > 0 ? (
            report.openQuestions.map((question, index) => (
              <li key={`${question.key}-${index}`}>
                {question.key === 'authored' ? question.text : null}
                {question.key === 'lowConfidence'
                  ? t('mercatify.report.unsure.lowConfidence', { capability: question.capability })
                  : null}
                {question.key === 'unestimated'
                  ? t('mercatify.report.unsure.unestimated', { count: question.count })
                  : null}
              </li>
            ))
          ) : (
            <li>{t('mercatify.report.unsure.none')}</li>
          )}
        </ul>
      </Section>

      {report.notes ? (
        <Section title={t('mercatify.report.notes.title')}>
          <p className="rounded-lg border border-border p-4 text-sm">{report.notes}</p>
        </Section>
      ) : null}
    </article>
  )
}
