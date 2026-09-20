"use client"
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import LabsTraceView, { type LabsTraceStep } from './LabsTraceView'
import './labsPanel.css'

type LabsFactsKpis = {
  licencesTodayMonthly?: number | null
  licencesAfterMonthly?: number | null
  netRecurringAnnual?: number | null
  toolCount?: number | null
}

type LabsResult = {
  mode: 'deterministic' | 'ai'
  ranAt: string
  model?: string
  excludedTools: string[]
  html: string
  trace?: LabsTraceStep[]
  result?: {
    degradations?: string[]
    model?: { facts?: { kpis?: LabsFactsKpis } }
  }
}

type RequestForLabs = {
  id: string
  currency: string
  updatedAt: string | null
  labs_result: LabsResult | null
}

const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', PLN: 'zł' }
function fmtMoney(n: number | null | undefined, currency: string): string {
  if (n == null) return '—'
  const sym = CURRENCY_SYMBOL[currency] || ''
  const v = Math.round(n).toLocaleString('en-US')
  return currency === 'PLN' ? `${v} ${sym}` : `${sym}${v}`
}

/**
 * One button, one flow: runs the AI-enhanced analysis with server-side
 * defaults (OPENROUTER_API_KEY from .env, model openai/gpt-5.6-luna, 8000
 * max tokens) — no form, no deterministic/AI choice. The deterministic-only
 * command/route still exist server-side and remain callable directly if
 * ever needed again; this panel just no longer exposes that choice.
 */
export default function LabsPanel({ id }: { id: string }) {
  const t = useT()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['mercatify-request', id],
    queryFn: async () => fetchCrudList<RequestForLabs>('mercatify/requests', { id, page: 1, pageSize: 1 }),
  })
  const request = data?.items?.[0] ?? null
  const labsResult = request?.labs_result ?? null
  const currency = request?.currency ?? 'EUR'

  const [running, setRunning] = React.useState(false)
  const [showReport, setShowReport] = React.useState(false)
  const [liveSteps, setLiveSteps] = React.useState<LabsTraceStep[]>([])
  const pollTimerRef = React.useRef<number | null>(null)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['mercatify-request', id] })
  }

  function stopPolling() {
    if (pollTimerRef.current != null) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  React.useEffect(() => stopPolling, [])

  function startPolling(runId: string) {
    stopPolling()
    setLiveSteps([])
    pollTimerRef.current = window.setInterval(async () => {
      try {
        const { result } = await apiCallOrThrow<{ status: string; steps: LabsTraceStep[] }>(
          `/api/mercatify/requests/labs-run?runId=${encodeURIComponent(runId)}`,
        )
        if (result?.steps) setLiveSteps(result.steps)
      } catch {
        // Transient poll failure — the next tick (or the POST's own
        // resolution) will pick the live view back up. Never surface this.
      }
    }, 600)
  }

  async function run() {
    setRunning(true)
    const runId = crypto.randomUUID()
    startPolling(runId)
    try {
      await apiCallOrThrow('/api/mercatify/requests/labs-analyze-ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, runId }),
      })
      flash(t('mercatify.labs.flash.done', 'Mercatify Labs analysis complete.'), 'success')
      invalidate()
    } catch (err) {
      flash(err instanceof Error ? err.message : t('mercatify.labs.error.generic', 'Mercatify Labs analysis failed.'), 'error')
    } finally {
      stopPolling()
      setRunning(false)
    }
  }

  const kpis = labsResult?.result?.model?.facts?.kpis
  const degradations = labsResult?.result?.degradations ?? []

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-status-info-bg border-status-info-border p-3 text-sm text-status-info-text">
        <strong className="block">{t('mercatify.labs.intro.title', 'Experimental — a second, independent engine.')}</strong>
        <span>
          {t(
            'mercatify.labs.intro.body',
            'Runs the same stack through a separate capability-matching and ROI engine (mercatify-labs) as a cross-check. Nothing here touches the mapping, the overrides, or the report you send to the client.',
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={run} disabled={running}>
          {running ? t('mercatify.labs.action.analyzing', 'Analyzing…') : t('mercatify.labs.action.run.single', 'Mercatify Labs')}
        </Button>
      </div>

      {running ? (
        <div className="rounded-lg border p-4">
          <LabsTraceView steps={liveSteps} live />
        </div>
      ) : null}

      {labsResult ? (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge variant={labsResult.mode === 'ai' ? 'success' : 'info'} dot>
              {labsResult.mode === 'ai' ? t('mercatify.labs.badge.ai', 'AI run') : t('mercatify.labs.badge.deterministic', 'Deterministic run')}
            </StatusBadge>
            <span className="text-muted-foreground">
              {t('mercatify.labs.ranAt', 'Ran {date}', { date: new Date(labsResult.ranAt).toLocaleString() })}
              {labsResult.model ? ` · ${labsResult.model}` : ''}
            </span>
          </div>

          {kpis ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <LabsKpi label={t('mercatify.labs.kpi.today', 'Licences today')} value={fmtMoney(kpis.licencesTodayMonthly, currency)} />
              <LabsKpi label={t('mercatify.labs.kpi.after', 'Licences after')} value={fmtMoney(kpis.licencesAfterMonthly, currency)} />
              <LabsKpi accent label={t('mercatify.labs.kpi.saving', 'Net saving / yr')} value={fmtMoney(kpis.netRecurringAnnual, currency)} />
            </div>
          ) : null}

          {labsResult.excludedTools.length ? (
            <p className="text-xs text-muted-foreground">
              {t('mercatify.labs.excluded', '{count} tool(s) skipped — no capability was assigned: {names}', {
                count: labsResult.excludedTools.length,
                names: labsResult.excludedTools.join(', '),
              })}
            </p>
          ) : null}

          {degradations.length ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                {t('mercatify.labs.degradations.summary', '{count} section(s) fell back to facts-only', { count: degradations.length })}
              </summary>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {degradations.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </details>
          ) : null}

          {!running && labsResult.trace?.length ? (
            <div className="border-t pt-3">
              <LabsTraceView steps={labsResult.trace} />
            </div>
          ) : null}

          <Button type="button" variant="outline" size="sm" onClick={() => setShowReport((v) => !v)}>
            {showReport ? t('mercatify.labs.action.hideReport', 'Hide the full report') : t('mercatify.labs.action.showReport', 'Show the full report')}
          </Button>

          {showReport ? (
            <iframe
              title={t('mercatify.labs.reportFrameTitle', 'Mercatify Labs report')}
              srcDoc={labsResult.html}
              sandbox=""
              className="mercatify-labs-frame w-full rounded-lg border"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function LabsKpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'bg-status-success-bg border-status-success-border' : ''}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  )
}
