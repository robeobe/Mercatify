"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { formatDate } from '@open-mercato/ui/utils/format'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiFetch } from '@open-mercato/ui/backend/utils/api'

/**
 * Staged lines the admin watches while the request is in flight. The Lab is
 * scripted and answers in milliseconds, so the pacing below is what makes the
 * step legible — the router only moves on once the POST has actually returned
 * AND the last line has been shown.
 */
const PROGRESS_STEP_MS = 3000

/**
 * The Lab's agent pipeline, one line per agent, in the order they run. Hardcoded
 * on purpose: the scripted adapter does not report per-agent progress, so this
 * is a narration of the real pipeline rather than a live feed of it.
 */
const LAB_AGENTS: ReadonlyArray<{ name: string; role: string }> = [
  { name: 'Process Analyst', role: 'Business analyst reading how the stack is actually used' },
  { name: 'OM Architect', role: 'Solution architect matching every job to an Open Mercato module' },
  { name: 'Consolidation Strategist', role: 'Transformation lead deciding what merges and what stays' },
  { name: 'FinOps', role: 'CFO / FinOps lead pricing the licences against the target stack' },
  { name: 'Migration Planner', role: 'Delivery lead sequencing the rollout' },
  { name: 'Report Editor', role: 'Consultant writing the executive half of a stack consolidation report' },
  { name: 'Report Risk Analyst', role: 'Consultant stating what would change the numbers, and what happens next' },
  { name: 'Critic', role: 'Adversarial reviewer of one pipeline stage' },
]

export type LabAnalysisStatus = 'draft' | 'new' | 'mapping' | 'mapped' | 'sent' | 'accepted' | 'consult'

/** Statuses whose analysis has already run. */
const ANALYSED: ReadonlySet<string> = new Set(['mapping', 'mapped', 'sent', 'accepted', 'consult'])
/** Statuses from which a report exists to open. */
const REPORTABLE: ReadonlySet<string> = new Set(['mapped', 'sent', 'accepted', 'consult'])

export function LabAnalysisCard({
  caseId,
  status,
  analysedAt,
}: {
  caseId: string
  status: string
  /** When the analysis landed — the case's `updatedAt` is close enough here. */
  analysedAt?: string | null
}) {
  const t = useT()
  const router = useRouter()
  const [running, setRunning] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)

  const mappingHref = `/backend/cases/${caseId}/mapping`
  const reportHref = `/backend/cases/${caseId}/report`

  const analyse = React.useCallback(async () => {
    setError(null)
    setRunning(true)
    setStep(1)
    // The progress lines and the POST run together; whichever finishes last
    // gates the redirect, so the admin never sees a truncated run.
    const paced = new Promise<void>((resolve) => {
      let shown = 1
      const timer = setInterval(() => {
        shown += 1
        setStep(shown)
        if (shown > LAB_AGENTS.length) {
          clearInterval(timer)
          resolve()
        }
      }, PROGRESS_STEP_MS)
    })
    try {
      const res = await apiFetch('/api/mercatify/mapping-rows/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caseId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error || t('mercatify.analysis.error.generic', 'The analysis could not be started. Please try again.'))
      }
      await paced
      router.push(mappingHref)
    } catch (err) {
      setRunning(false)
      setStep(0)
      setError(err instanceof Error ? err.message : t('mercatify.analysis.error.generic', 'The analysis could not be started. Please try again.'))
    }
  }, [caseId, mappingHref, router, t])

  const analysed = ANALYSED.has(status)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4 text-brand-violet" />
          {t('mercatify.analysis.card.title', 'Mercatify Lab analysis')}
        </CardTitle>
        {analysed ? (
          <CardDescription>
            {t('mercatify.analysis.card.analysedOn', 'Analysed on {date}')
              .replace('{date}', formatDate(analysedAt ?? null) ?? '—')}
          </CardDescription>
        ) : (
          <CardDescription>
            {t(
              'mercatify.analysis.card.description',
              'Send this stack to the Mercatify Lab agents. They map every tool and job to Open Mercato modules, with a confidence band and what needs building.',
            )}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {analysed ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href={mappingHref}>{t('mercatify.analysis.action.openMapping', 'Open the mapping')}</Link>
            </Button>
            {REPORTABLE.has(status) ? (
              <Button asChild variant="outline">
                <Link href={reportHref}>{t('mercatify.analysis.action.openReport', 'Open the report')}</Link>
              </Button>
            ) : null}
          </div>
        ) : running ? (
          <ol className="space-y-2.5" aria-live="polite">
            {LAB_AGENTS.slice(0, step).map((agent, index) => {
              const done = index < step - 1
              return (
                <li key={agent.name} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 flex size-4 flex-none items-center justify-center">
                    {done ? (
                      <span aria-hidden="true" className="text-status-success-icon">✓</span>
                    ) : (
                      <Spinner size="sm" />
                    )}
                  </span>
                  <span className={done ? 'text-muted-foreground' : undefined}>
                    <span className="font-medium">{agent.name}</span>
                    <span className="text-muted-foreground">{` — ${agent.role}`}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        ) : (
          <Button type="button" onClick={analyse}>
            {t('mercatify.analysis.action.analyse', 'Analyse with Mercatify Lab')}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default LabAnalysisCard
