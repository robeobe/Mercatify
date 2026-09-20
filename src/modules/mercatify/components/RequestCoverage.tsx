"use client"
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@open-mercato/ui/primitives/select'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  requestCaps, requestModules, requestMonthly, statusCounts,
  ALL_MODULE_OPTIONS, CONFIDENCE_BANDS, OM_MODULES, STATUS_META, DEFAULT_CONFIDENCE,
  type MappingStatus, type ConfidenceBand, type RequestCapRow,
} from '../lib/moduleMap'
import { mappingOpen, canReport, type RequestStatus } from '../lib/status'
import { refFor } from '../lib/ref'
import type { MercatifyCapOverride } from '../data/entities'
import LabsPanel from './LabsPanel'

type RequestDetail = {
  id: string
  company: string
  industry: string | null
  people_count: number | null
  currency: string
  status: RequestStatus
  pains: string | null
  must_keep: string | null
  tools: { name: string; seats?: number | null; monthly?: number | null; caps: string[] }[]
  overrides: Record<string, MercatifyCapOverride> | null
  sent_at: string | null
  mapped_at: string | null
  client_response: { kind: 'accepted' | 'consult'; at: string; message?: string } | null
  updatedAt: string | null
}

type RequestPickItem = { id: string; company: string; status: RequestStatus }

const STATUS_VARIANT: Record<RequestStatus, 'info' | 'warning' | 'success'> = {
  new: 'info', mapping: 'warning', mapped: 'success', sent: 'info', accepted: 'success', consult: 'warning',
}

const MAPPING_BADGE: Record<MappingStatus, 'success' | 'info' | 'warning' | 'neutral'> = {
  native: 'success', configure: 'info', build: 'warning', integrate: 'neutral', keep: 'neutral',
}

const GROUP_ORDER = ['Sales', 'Catalog & stock', 'Service', 'Operations', 'Platform', 'Not covered']

const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', PLN: 'zł' }
function money(n: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency] || ''
  const v = Math.round(n).toLocaleString('en-US')
  return currency === 'PLN' ? `${v} ${sym}` : `${sym}${v}`
}

export default function RequestCoverage({ id }: { id: string }) {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [tab, setTab] = React.useState<'module' | 'capability' | 'labs'>('module')
  const [flashCap, setFlashCap] = React.useState<string | null>(null)
  const [transientMsg, setTransientMsg] = React.useState<string | null>(null)
  const startedRef = React.useRef(false)
  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({})
  const flashTimeoutRef = React.useRef<number | undefined>(undefined)

  const { data, isLoading, error } = useQuery({
    queryKey: ['mercatify-request', id],
    queryFn: async () => fetchCrudList<RequestDetail>('mercatify/requests', { id, page: 1, pageSize: 1 }),
  })
  const request = data?.items?.[0] ?? null

  const { data: pickerData } = useQuery({
    queryKey: ['mercatify-requests-picker'],
    queryFn: async () => fetchCrudList<RequestPickItem>('mercatify/requests', {
      page: 1, pageSize: 100, sortField: 'created_at', sortDir: 'desc',
    }),
  })
  const pickerItems = pickerData?.items ?? []

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['mercatify-request', id] })
    queryClient.invalidateQueries({ queryKey: ['mercatify-requests'] })
    queryClient.invalidateQueries({ queryKey: ['mercatify-requests-picker'] })
  }

  async function setStatus(status: RequestStatus, message?: string) {
    if (!request) return
    try {
      await updateCrud('mercatify/requests', { id: request.id, status, expected_updated_at: request.updatedAt ?? undefined })
      invalidate()
      if (message) setTransientMsg(message)
    } catch (err) {
      flash(err instanceof Error ? err.message : t('mercatify.coverage.error.generic', 'Failed to update status.'), 'error')
    }
  }

  async function saveOverride(cap: string, patch: MercatifyCapOverride | null) {
    if (!request) return
    try {
      await apiCallOrThrow('/api/mercatify/requests/override', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: request.id, cap, patch, expected_updated_at: request.updatedAt ?? undefined }),
      })
      invalidate()
      setTransientMsg(t('mercatify.coverage.mapstate.saved', 'Saved.'))
      window.setTimeout(() => setTransientMsg(null), 1400)
    } catch (err) {
      flash(err instanceof Error ? err.message : t('mercatify.coverage.error.generic', 'Failed to update status.'), 'error')
    }
  }

  // Arriving here from the queue's Map action IS the act of starting, same as
  // the mock's unconditional startMapping() call on page open.
  React.useEffect(() => {
    if (request && request.status === 'new' && !startedRef.current) {
      startedRef.current = true
      setStatus('mapping')
    }
  }, [request?.status])

  function jumpToCap(cap: string) {
    setTab('capability')
    setFlashCap(cap)
    if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current)
    window.setTimeout(() => {
      const row = rowRefs.current[cap]
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      row?.querySelector<HTMLElement>('button[role="combobox"]')?.focus({ preventScroll: true })
    }, 60)
    flashTimeoutRef.current = window.setTimeout(() => setFlashCap(null), 1600)
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('mercatify.coverage.loading', 'Loading…')}</p>
  if (error || !request) return <div className="text-sm text-destructive">{t('mercatify.coverage.error.notFound', 'Request not found.')}</div>

  const locked = !mappingOpen(request.status)
  const caps = requestCaps(request.tools, request.overrides)
  const modules = requestModules(request.tools, request.overrides)
  const counts = statusCounts(caps)
  const covered = counts.native + counts.configure
  const monthly = requestMonthly(request.tools)
  const edits = caps.filter((c) => c.edited).length

  const groups: Record<string, typeof modules> = {}
  for (const row of modules) {
    const g = row.module.group
    groups[g] = groups[g] || []
    groups[g].push(row)
  }
  const groupNames = Object.keys(groups).sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a); const ib = GROUP_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })

  const mapStateMsg = transientMsg || (edits
    ? t('mercatify.coverage.mapstate.edited', '{count} row{plural} {verb} been corrected. Changes save as you make them.', {
        count: edits, plural: edits === 1 ? '' : 's', verb: edits === 1 ? 'has' : 'have',
      })
    : t('mercatify.coverage.mapstate.clean', 'Nothing corrected yet. Changes save as you make them.'))

  return (
    <>
      <PageHeader
        title={t('mercatify.coverage.page.title', 'Module coverage')}
        description={t('mercatify.coverage.page.description', 'Which Open Mercato modules pick up the work in an incoming request, and what is left over. Verdicts come from the capability map — they are a first pass a consultant confirms, not a promise.')}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {pickerItems.length > 1 ? (
              <Select value={request.id} onValueChange={(v) => router.push(`/backend/mercatify-requests/${v}`)}>
                <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pickerItems.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{refFor(r.id)} — {r.company}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button variant="outline" asChild>
              <Link href="/backend/mercatify-requests">{t('mercatify.coverage.action.backToQueue', 'Back to queue')}</Link>
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => setTab('capability')}
            >
              {locked
                ? t('mercatify.coverage.action.viewMapping', 'View the mapping')
                : t('mercatify.coverage.action.editMapping', 'Edit the mapping')}
            </Button>
            {canReport(request.status) ? (
              <Button asChild>
                <Link href={`/backend/mercatify-requests/${request.id}/report`}>
                  {request.sent_at
                    ? t('mercatify.coverage.action.openReport', 'Open the report →')
                    : t('mercatify.coverage.action.buildReport', 'Build the report →')}
                </Link>
              </Button>
            ) : (
              <Button disabled title={t('mercatify.coverage.action.reportDisabledHint', 'Confirm the mapping first')}>
                {t('mercatify.coverage.action.buildReport', 'Build the report →')}
              </Button>
            )}
            {locked ? (
              <Button variant="outline" type="button" onClick={() => setStatus('mapping', t('mercatify.coverage.mapstate.reopened', 'Reopened. Changes save as you make them.'))}>
                {t('mercatify.coverage.action.reopenMapping', 'Reopen mapping')}
              </Button>
            ) : null}
          </div>
        )}
      />

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{request.company}</h2>
          <StatusBadge variant="neutral">{refFor(request.id)}</StatusBadge>
          <StatusBadge variant={STATUS_VARIANT[request.status]} dot>
            {t(`mercatify.status.${request.status}`, request.status)}
          </StatusBadge>
          <span className="ml-auto text-sm text-muted-foreground">
            {request.industry || ''}
            {request.people_count ? ` · ${t('mercatify.common.peopleCount', '{count} people', { count: request.people_count })}` : ''}
            {' · '}{t('mercatify.coverage.header.licences', '{amount}/mo on licences', { amount: money(monthly, request.currency) })}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t('mercatify.report.pains.label', 'What hurts today')}</div>
            <p className="text-sm">{request.pains || t('mercatify.coverage.notStated', 'Not stated.')}</p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t('mercatify.report.mustKeep.label', 'Must not be touched')}</div>
            <p className="text-sm">{request.must_keep || t('mercatify.coverage.notStated', 'Not stated.')}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={t('mercatify.coverage.stat.jobs', 'Jobs to place')} value={String(caps.length)} sub={t('mercatify.coverage.stat.fromTools', 'from {count} tools', { count: request.tools.length })} />
        <Stat label={t('mercatify.coverage.stat.modules', 'Modules involved')} value={String(modules.filter((m) => !m.module.id.startsWith('__')).length)} sub={t('mercatify.coverage.stat.installed', 'already installed')} />
        <Stat label={t('mercatify.coverage.stat.covered', 'Native or configure')} value={String(covered)} sub={caps.length ? t('mercatify.coverage.stat.coveredPct', '{pct}% of the jobs', { pct: Math.round((covered / caps.length) * 100) }) : '—'} />
        <Stat label={t('mercatify.coverage.stat.build', 'To build')} value={String(counts.build)} sub={t('mercatify.coverage.stat.estimate', 'goes on the estimate')} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'module' | 'capability' | 'labs')}>
        <TabsList aria-label={t('mercatify.coverage.tabs.label', 'Coverage view')}>
          <TabsTrigger value="module">{t('mercatify.coverage.tab.overview', 'Overview by module')}</TabsTrigger>
          <TabsTrigger value="capability" count={edits || undefined}>
            {locked ? t('mercatify.coverage.tab.mapping', 'The mapping') : t('mercatify.coverage.tab.edit', 'Edit the mapping')}
          </TabsTrigger>
          <TabsTrigger value="labs">{t('mercatify.coverage.tab.labs', 'Mercatify Labs')}</TabsTrigger>
        </TabsList>

        <TabsContent value="module">
          <div className="rounded-lg border bg-status-info-bg border-status-info-border p-3 text-sm text-status-info-text">
            <strong className="block">{t('mercatify.coverage.overview.alert.title', "This is the agent's pass, not a verdict.")}</strong>
            <span>{t('mercatify.coverage.overview.alert.body', 'Click any job below — or use Edit the mapping — to change which module takes it over and how hard it is. The report is built from whatever you leave here.')}</span>
          </div>

          {groupNames.map((group) => (
            <section key={group} className="space-y-2 mt-4">
              <div className="flex items-baseline gap-2 text-xs uppercase tracking-wide text-muted-foreground border-b pb-1">
                <span>{group}</span>
                <span className="ml-auto">{t('mercatify.coverage.jobsCount', '{count} jobs', { count: groups[group].reduce((s, r) => s + r.caps.length, 0) })}</span>
              </div>
              <div className="grid gap-2">
                {groups[group].map((row) => {
                  const outside = row.module.id.startsWith('__')
                  return (
                    <div key={row.module.id} className={`flex flex-col sm:flex-row gap-3 rounded-lg border p-3 ${outside ? 'border-dashed' : ''}`}>
                      <div className="sm:w-56 sm:shrink-0">
                        <div className="text-sm font-semibold">{row.module.label}</div>
                        {!outside ? <div className="text-xs text-muted-foreground font-mono">{t('mercatify.coverage.modulePath', 'modules/{id}', { id: row.module.id })}</div> : null}
                        <div className="text-xs text-muted-foreground mt-1">{row.module.blurb}</div>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-wrap gap-1.5 content-start">
                        {row.caps.map((c) => (
                          <button
                            key={c.cap}
                            type="button"
                            onClick={() => jumpToCap(c.cap)}
                            title={(c.duplicate ? t('mercatify.coverage.duplicateHint', 'Paid for in {count} tools today. ', { count: c.tools.length }) : '') + t('mercatify.coverage.chip.title', 'Click to change where this job lands')}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs cursor-pointer hover:border-foreground ${c.duplicate ? 'border-status-warning-border bg-status-warning-bg text-status-warning-text' : ''}`}
                          >
                            <span>{c.label}</span>
                            <span className="text-muted-foreground">{c.tools.join(' + ')}</span>
                          </button>
                        ))}
                      </div>
                      <div className="text-right space-y-1">
                        <StatusBadge variant={MAPPING_BADGE[row.status]}>{t(`mercatify.mapping.${row.status}`, row.status)}</StatusBadge>
                        <div className="text-xs text-muted-foreground">{t('mercatify.coverage.jobsCount', '{count} jobs', { count: row.caps.length })}</div>
                        {row.duplicates ? <StatusBadge variant="warning">{t('mercatify.coverage.doneTwiceCount', '{count} paid twice', { count: row.duplicates })}</StatusBadge> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </TabsContent>

        <TabsContent value="capability">
          {!locked ? (
            <div className="rounded-lg border bg-status-info-bg border-status-info-border p-3 text-sm text-status-info-text mb-3">
              <strong className="block">{t('mercatify.coverage.edit.alert.title', 'Every row here is editable.')}</strong>
              <span>{t('mercatify.coverage.edit.alert.body', "The agent's pass is a starting point — change the module or the verdict where it got it wrong. Changes save as you make them. Edited rows are marked.")}</span>
            </div>
          ) : (
            <div className="rounded-lg border bg-status-warning-bg border-status-warning-border p-3 text-sm text-status-warning-text mb-3">
              <strong className="block">
                {request.sent_at
                  ? t('mercatify.coverage.locked.titleSent', 'This mapping went out to the client.')
                  : t('mercatify.coverage.locked.title', 'This mapping is closed.')}
              </strong>
              <span>
                {request.sent_at
                  ? t('mercatify.coverage.locked.bodySent', 'The report was sent on {date}. Reopen the mapping to change it — the client keeps the version they were given until a new report is sent.', { date: request.sent_at.slice(0, 10) })
                  : t('mercatify.coverage.locked.body', 'Confirmed on {date}. Reopen it if something needs correcting.', { date: request.mapped_at ? request.mapped_at.slice(0, 10) : t('mercatify.coverage.locked.earlierDate', 'an earlier date') })}
              </span>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">{t('mercatify.coverage.edit.column.capability', 'Job the client pays for')}</th>
                  <th className="px-3 py-2">{t('mercatify.coverage.edit.column.paidIn', 'Paid for in')}</th>
                  <th className="px-3 py-2">{t('mercatify.coverage.edit.column.module', 'Lands in')}</th>
                  <th className="px-3 py-2">{t('mercatify.coverage.edit.column.verdict', 'Verdict')}</th>
                  <th className="px-3 py-2">{t('mercatify.coverage.edit.column.confidence', 'Confidence')}</th>
                  <th className="px-3 py-2">{t('mercatify.coverage.edit.column.note', 'Note for the report')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {caps.map((cap) => (
                  <CapRow
                    key={cap.cap}
                    cap={cap}
                    disabled={locked}
                    flashed={cap.cap === flashCap}
                    onSave={saveOverride}
                    rowRef={(el) => { rowRefs.current[cap.cap] = el }}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5">
            <span>{t('mercatify.coverage.edit.footCount', '{count} capabilities across {tools} tools', { count: caps.length, tools: request.tools.length })}</span>
            <span>
              {edits
                ? t('mercatify.coverage.edit.footEdited', '{count} row{plural} edited by hand', { count: edits, plural: edits === 1 ? '' : 's' })
                : t('mercatify.coverage.edit.footClean', "no rows edited — all verdicts still the agent's")}
            </span>
          </div>
        </TabsContent>

        <TabsContent value="labs">
          <LabsPanel id={request.id} />
        </TabsContent>
      </Tabs>

      {!locked ? (
        <div className="sticky bottom-0 flex items-center gap-3 rounded-lg border bg-card/95 backdrop-blur p-3">
          <div className="flex-1 text-sm text-muted-foreground">{mapStateMsg}</div>
          <Button type="button" onClick={() => setStatus('mapped')}>
            {t('mercatify.coverage.action.confirmMapping', 'Confirm mapping')}
          </Button>
        </div>
      ) : null}
    </>
  )
}

function moduleSelectGroups() {
  const groups: Record<string, typeof OM_MODULES> = {}
  for (const m of OM_MODULES) {
    groups[m.group] = groups[m.group] || []
    groups[m.group].push(m)
  }
  return groups
}
const MODULE_GROUPS = moduleSelectGroups()

function CapRow({ cap, disabled, flashed, onSave, rowRef }: {
  cap: RequestCapRow
  disabled: boolean
  flashed: boolean
  onSave: (cap: string, patch: MercatifyCapOverride | null) => void
  rowRef: (el: HTMLTableRowElement | null) => void
}) {
  const t = useT()
  return (
    <tr
      ref={rowRef}
      data-cap={cap.cap}
      className={`border-b last:border-0 ${flashed ? 'bg-status-info-bg' : cap.edited ? 'bg-accent-indigo/5' : ''} transition-colors duration-1000`}
    >
      <td className="px-3 py-2 align-top">
        <div className="font-medium">{cap.label}</div>
        <div className="text-xs text-muted-foreground font-mono">{cap.cap}</div>
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
        {cap.tools.join(', ')}
        {cap.duplicate ? <div className="mt-1"><StatusBadge variant="warning">{t('mercatify.coverage.edit.paidTwice', 'paid for twice')}</StatusBadge></div> : null}
      </td>
      <td className="px-3 py-2 align-top">
        <Select disabled={disabled} value={cap.module} onValueChange={(v) => onSave(cap.cap, { module: v, status: cap.status, note: cap.note, conf: cap.conf })}>
          <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(MODULE_GROUPS).map(([group, mods]) => (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {mods.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectGroup>
            ))}
            <SelectGroup>
              <SelectLabel>{t('mercatify.coverage.notCovered', 'Not covered')}</SelectLabel>
              {ALL_MODULE_OPTIONS.filter((m) => m.id.startsWith('__')).map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2 align-top">
        <Select
          disabled={disabled}
          value={cap.status}
          onValueChange={(v) => onSave(cap.cap, {
            module: cap.module, status: v as MappingStatus, note: cap.note,
            conf: DEFAULT_CONFIDENCE[v as MappingStatus],
          })}
        >
          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(['native', 'configure', 'build', 'integrate', 'keep'] as MappingStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{t(`mercatify.mapping.${s}`, STATUS_META[s].label)} — {t(`mercatify.mapping.hint.${s}`, STATUS_META[s].hint)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground mt-1">
          {cap.edited ? t('mercatify.coverage.edit.editedTag', 'edited by hand') : t('mercatify.coverage.edit.fromAgent', 'from the agent')}
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <Select disabled={disabled} value={cap.conf} onValueChange={(v) => onSave(cap.cap, { module: cap.module, status: cap.status, note: cap.note, conf: v as ConfidenceBand })}>
          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CONFIDENCE_BANDS.map((band) => (
              <SelectItem key={band} value={band}>{t(`mercatify.confidence.${band}`, band)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2 align-top">
        <Input
          type="text"
          disabled={disabled}
          className="h-8 w-48"
          defaultValue={cap.note}
          placeholder={t('mercatify.coverage.edit.notePlaceholder', 'why, in one line')}
          onBlur={(e) => onSave(cap.cap, { module: cap.module, status: cap.status, note: e.target.value, conf: cap.conf })}
        />
      </td>
      <td className="px-3 py-2 align-top">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || !cap.edited}
          title={t('mercatify.coverage.edit.resetHint', 'Drop the manual edit and go back to what the agent proposed')}
          onClick={() => onSave(cap.cap, null)}
        >
          {t('mercatify.coverage.edit.reset', 'Reset')}
        </Button>
      </td>
    </tr>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}
