"use client"
import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { fmtMoney, type Offer } from '../lib/offer'
import { moduleById, type MappingStatus } from '../lib/moduleMap'
import CashChart from './CashChart'

const VERDICT_VARIANT: Record<MappingStatus, 'success' | 'info' | 'warning' | 'neutral'> = {
  native: 'success', configure: 'info', build: 'warning', integrate: 'neutral', keep: 'neutral',
}
const VERDICT_ORDER: MappingStatus[] = ['native', 'configure', 'integrate', 'keep', 'build']

/**
 * Renders the report body — ported from assets/shared/om-core.js renderOffer.
 * Used by both the console's report composer preview and the client's own
 * report page, so "what I am about to send" and "what they get" cannot drift.
 */
export default function OfferView({ offer }: { offer: Offer }) {
  const t = useT()
  const cur = offer.currency
  const toolCount = offer.retire.length + offer.stays.length
  const decided = offer.caps.length

  const headline = offer.headline || (offer.retire.length
    ? t('mercatify.report.headline.some', '{count} of your {total} tools can be switched off.', { count: offer.retire.length, total: toolCount })
    : t('mercatify.report.headline.none', 'Every tool in your stack earns its place — for now.'))

  const metaParts = [
    offer.generatedAt,
    offer.industry || '',
    offer.people ? t('mercatify.common.peopleCount', '{count} people', { count: offer.people }) : '',
    offer.seats ? t('mercatify.common.seatsCount', '{count} seats', { count: offer.seats }) : '',
    offer.analyst ? t('mercatify.report.reviewedBy', 'reviewed by {name}', { name: offer.analyst }) : t('mercatify.report.notReviewed', 'not yet reviewed'),
  ].filter(Boolean)

  const firstToCut = [...offer.retire].sort((a, b) => b.monthly - a.monthly)[0]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight max-w-md">{headline}</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          {t('mercatify.report.summary', 'You pay {monthlyNow} a month across {toolCount} tools. Of the {capCount} things you actually do in them, {covered} are covered by Open Mercato.', {
            monthlyNow: fmtMoney(offer.monthlyNow, cur), toolCount, capCount: offer.caps.length, covered: offer.covered,
          })}
          {offer.retire.length ? ' ' + t('mercatify.report.summary.retire', '{count} tools are covered end to end.', { count: offer.retire.length }) : ''}
          {offer.buildRows.length ? ' ' + t('mercatify.report.summary.build', '{count} things genuinely need building.', { count: offer.buildRows.length }) : ''}
          {offer.stays.length ? ' ' + t('mercatify.report.summary.stays', '{count} tools stay where they are, on purpose.', { count: offer.stays.length }) : ''}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-muted-foreground">
          {metaParts.map((part, i) => <span key={i}>{part}{i < metaParts.length - 1 ? ' ·' : ''}</span>)}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label={t('mercatify.report.kpi.licencesToday', 'Licences today')} value={fmtMoney(offer.monthlyNow, cur)} sub={t('mercatify.report.kpi.licencesToday.sub', 'per month · {count} tools', { count: toolCount })} />
        <Kpi label={t('mercatify.report.kpi.licencesAfter', 'Licences after')} value={fmtMoney(offer.monthlyAfter, cur)} sub={offer.hosting ? t('mercatify.report.kpi.licencesAfter.subHosting', 'per month · incl. {amount} hosting', { amount: fmtMoney(offer.hosting, cur) }) : t('mercatify.report.kpi.licencesAfter.subNoHosting', 'per month · hosting not costed')} />
        <Kpi accent label={t('mercatify.report.kpi.netSaving', 'Net saving')} value={fmtMoney(offer.annualSaving, cur)} sub={t('mercatify.report.kpi.netSaving.sub', 'per year · {count} tools switched off', { count: offer.retire.length })} />
      </div>

      {decided ? (
        <div>
          <div className="flex h-3 rounded-full overflow-hidden border">
            {VERDICT_ORDER.map((k) => {
              const n = offer.counts[k] || 0
              if (!n) return null
              return <span key={k} className={`block h-full ${verdictBg(k)}`} style={{ width: `${(n / decided) * 100}%` }} title={`${n} ${t(`mercatify.mapping.${k}`, k)}`} />
            })}
          </div>
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
            {VERDICT_ORDER.map((k) => {
              const n = offer.counts[k] || 0
              if (!n) return null
              return (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <i className={`inline-block w-2.5 h-2.5 rounded-sm ${verdictBg(k)}`} />
                  {n} {t(`mercatify.mapping.${k}`, k)}
                </span>
              )
            })}
          </div>
        </div>
      ) : null}

      <Section title={t('mercatify.report.section.toolByTool', 'Tool by tool')} lead={t('mercatify.report.section.toolByTool.lead', 'One verdict per job, with the confidence behind it. A tool appears more than once when it does more than one job.')}>
        <Table headers={[
          t('mercatify.report.table.toolJob', 'Tool · job'), t('mercatify.report.table.paidIn', 'Paid for in'), t('mercatify.report.table.openMercato', 'Open Mercato'),
          t('mercatify.report.table.verdict', 'Verdict'), t('mercatify.report.table.confidence', 'Confidence'),
        ]} numHeaders={[t('mercatify.report.table.monthly', 'Monthly')]}>
          {offer.retire.concat(offer.stays).flatMap((toolLine) => {
            const going = offer.retire.includes(toolLine)
            return toolLine.rows.map((r, i) => {
              const mod = moduleById(r.module)
              return (
                <tr key={`${toolLine.name}-${r.cap}`} className="border-b last:border-0">
                  <td className="px-3 py-2 align-top">
                    <div>{i === 0 ? toolLine.name : ''}</div>
                    <div className="text-xs text-muted-foreground">{r.label}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div>{r.tools.join(', ')}</div>
                    {r.note ? <div className="text-xs text-muted-foreground">{r.note}</div> : null}
                  </td>
                  <td className="px-3 py-2 align-top">{mod.label}</td>
                  <td className="px-3 py-2 align-top"><StatusBadge variant={VERDICT_VARIANT[r.status]}>{t(`mercatify.mapping.${r.status}`, r.status)}</StatusBadge></td>
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground">{t(`mercatify.confidence.${r.conf}`, r.conf)}</td>
                  <td className="px-3 py-2 align-top text-right">
                    <div>{i === 0 ? (toolLine.monthly ? t('mercatify.common.perMonth', '{amount}/mo', { amount: fmtMoney(toolLine.monthly, cur) }) : '—') : ''}</div>
                    {i === 0 && going ? <div className="text-xs text-muted-foreground">{t('mercatify.report.switchedOff', 'switched off')}</div> : null}
                  </td>
                </tr>
              )
            })
          })}
        </Table>
      </Section>

      {offer.duplicates.length ? (
        <Section title={t('mercatify.report.section.duplicates', 'You pay twice for these')} lead={t('mercatify.report.section.duplicates.lead', 'Same job, more than one invoice. This is where consolidation pays before a line of code is written.')}>
          <Table headers={[t('mercatify.report.table.job', 'Job'), t('mercatify.report.table.coveredBy', 'Covered by')]} numHeaders={[t('mercatify.report.table.tools', 'Tools')]}>
            {offer.duplicates.map((c) => (
              <tr key={c.cap} className="border-b last:border-0">
                <td className="px-3 py-2 align-top font-medium">{c.label}</td>
                <td className="px-3 py-2 align-top">{c.tools.join(', ')}</td>
                <td className="px-3 py-2 align-top text-right">{c.tools.length}</td>
              </tr>
            ))}
          </Table>
        </Section>
      ) : null}

      <Section
        title={t('mercatify.report.section.build', 'What genuinely has to be built')}
        lead={offer.buildRows.length ? t('mercatify.report.section.build.leadSome', 'Everything else is configuration. This is what is left.') : t('mercatify.report.section.build.leadNone', 'Nothing here needs new code. Everything you use is configuration.')}
      >
        {offer.buildRows.length ? (
          <Table headers={[t('mercatify.report.table.what', 'What'), t('mercatify.report.table.replaces', 'Replaces'), t('mercatify.report.table.confidence', 'Confidence')]} numHeaders={[]}>
            {offer.buildRows.map((c) => (
              <tr key={c.cap} className="border-b last:border-0">
                <td className="px-3 py-2 align-top">
                  <div>{c.label}</div>
                  {c.note ? <div className="text-xs text-muted-foreground">{c.note}</div> : null}
                </td>
                <td className="px-3 py-2 align-top">{c.tools.join(', ')}</td>
                <td className="px-3 py-2 align-top text-xs text-muted-foreground">{t(`mercatify.confidence.${c.conf}`, c.conf)}</td>
              </tr>
            ))}
          </Table>
        ) : null}
      </Section>

      <Section title={t('mercatify.report.section.arithmetic', 'What it costs, what it returns')} lead={t('mercatify.report.section.arithmetic.lead', 'Computed from the numbers you gave us. Every line can be recomputed by hand in the room.')}>
        <Table headers={[t('mercatify.report.table.line', 'Line'), t('mercatify.report.table.basis', 'Basis')]} numHeaders={[t('mercatify.report.table.amount', 'Amount')]}>
          <Line k={t('mercatify.report.line.licencesToday', 'Licences today')} basis={t('mercatify.report.line.licencesToday.basis', '{count} tools as invoiced', { count: toolCount })} val={t('mercatify.common.perMonth', '{amount}/mo', { amount: fmtMoney(offer.monthlyNow, cur) })} />
          <Line k={t('mercatify.report.line.switchedOff', 'Switched off')} basis={offer.retire.map((tl) => tl.name).join(', ') || t('mercatify.report.none', 'none')} val={t('mercatify.common.perMonth', '{amount}/mo', { amount: fmtMoney(-offer.monthlyRetire, cur) })} />
          <Line k={t('mercatify.report.line.retained', 'Licences retained')} basis={offer.stays.map((tl) => tl.name).join(', ') || t('mercatify.report.none', 'none')} val={t('mercatify.common.perMonth', '{amount}/mo', { amount: fmtMoney(offer.retained, cur) })} />
          <Line k={t('mercatify.report.line.hosting', 'Hosting & ops')} basis={offer.hosting ? t('mercatify.report.line.hosting.basisSet', 'estimate from us') : t('mercatify.report.line.hosting.basisUnset', 'not entered')} val={t('mercatify.common.perMonth', '{amount}/mo', { amount: fmtMoney(offer.hosting, cur) })} />
          <Line k={t('mercatify.report.line.after', 'Monthly after')} basis={t('mercatify.report.line.after.basis', 'retained + hosting')} val={t('mercatify.common.perMonth', '{amount}/mo', { amount: fmtMoney(offer.monthlyAfter, cur) })} />
          <Line k={t('mercatify.report.line.saving', 'Monthly saving')} basis={t('mercatify.report.line.saving.basis', 'today − after')} val={t('mercatify.common.perMonth', '{amount}/mo', { amount: fmtMoney(offer.monthlySaving, cur) })} />
          <Line strong k={t('mercatify.report.line.annual', 'Annual saving')} basis={t('mercatify.report.line.annual.basis', 'monthly saving × 12')} val={t('mercatify.report.perYear', '{amount}/yr', { amount: fmtMoney(offer.annualSaving, cur) })} />
        </Table>
        <CashChart offer={offer} />
      </Section>

      {offer.pains || offer.mustKeep ? (
        <Section title={t('mercatify.report.section.ownWords', 'In your own words')}>
          <div className="rounded-lg border p-4 space-y-3">
            {offer.pains ? (
              <div>
                <h3 className="text-sm font-semibold">{t('mercatify.report.pains.label', 'What hurts today')}</h3>
                <p className="text-sm text-muted-foreground border-l-2 pl-3 mt-1 whitespace-pre-wrap">{offer.pains}</p>
              </div>
            ) : null}
            {offer.mustKeep ? (
              <div>
                <h3 className="text-sm font-semibold">{t('mercatify.report.mustKeep.label', 'Must not be touched')}</h3>
                <p className="text-sm text-muted-foreground border-l-2 pl-3 mt-1 whitespace-pre-wrap">{offer.mustKeep}</p>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section title={t('mercatify.report.section.unsure', 'What we are not sure about')} lead={t('mercatify.report.section.unsure.lead', 'Confidence is a band, not a decimal. Anything marked low is a conversation, not a commitment.')}>
        <div className="rounded-lg border p-4">
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            {(offer.openQuestions || '').split('\n').filter(Boolean).map((line, i) => <li key={`q-${i}`}>{line}</li>)}
            {offer.lowConfidence.map((c) => (
              <li key={c.cap}>{c.label} — {t('mercatify.report.lowConfidence', 'low confidence')}{c.note ? `: ${c.note}` : ''}</li>
            ))}
            {!(offer.openQuestions || '').trim() && !offer.lowConfidence.length ? <li>{t('mercatify.report.noOpenQuestions', 'No open questions recorded.')}</li> : null}
          </ul>
        </div>
      </Section>

      <Section title={t('mercatify.report.section.firstCut', 'The first piece worth cutting')}>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground border-l-2 pl-3 whitespace-pre-wrap">
            {firstToCut
              ? t('mercatify.report.firstCut.some', '{name} — {amount}. Everything it does is already covered. We never propose replacing a stack; we name one piece, then the next.', {
                  name: firstToCut.name,
                  amount: firstToCut.monthly
                    ? t('mercatify.report.firstCut.amount', '{monthly} a month, {annual} a year', { monthly: fmtMoney(firstToCut.monthly, cur), annual: fmtMoney(firstToCut.monthly * 12, cur) })
                    : t('mercatify.report.firstCut.noCost', 'no cost on file'),
                })
              : t('mercatify.report.firstCut.none', 'Nothing is cancellable on the current verdicts — worth talking through before anything moves.')}
          </p>
        </div>
      </Section>

      {offer.notes ? (
        <Section title={t('mercatify.report.section.fromConsultant', 'From the consultant who read this')}>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{offer.notes}</p>
          </div>
        </Section>
      ) : null}
    </div>
  )
}

// Same semantic dot tokens StatusBadge uses, so the verdict bar reads as one
// system with every other status indicator in the backend.
const VERDICT_BG: Record<MappingStatus, string> = {
  native: 'bg-status-success-icon',
  configure: 'bg-status-info-icon',
  build: 'bg-status-warning-icon',
  integrate: 'bg-status-neutral-icon',
  keep: 'bg-status-neutral-icon',
}
function verdictBg(status: MappingStatus): string {
  return VERDICT_BG[status]
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'bg-status-success-bg border-status-success-border' : ''}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}

function Section({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold">{title}</h2>
      {lead ? <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{lead}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Table({ headers, numHeaders, children }: { headers: string[]; numHeaders: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            {headers.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
            {numHeaders.map((h) => <th key={h} className="px-3 py-2 font-medium text-right">{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Line({ k, basis, val, strong }: { k: string; basis: string; val: string; strong?: boolean }) {
  return (
    <tr className={`border-b last:border-0 ${strong ? 'font-semibold border-t-2' : ''}`}>
      <td className="px-3 py-2">{k}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{basis}</td>
      <td className="px-3 py-2 text-right">{val}</td>
    </tr>
  )
}
