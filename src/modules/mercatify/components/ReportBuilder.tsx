"use client"
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { apiCallOrThrow, readApiResultOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import ReportPreview from './ReportPreview'
import { CaseRefBadge, ConsolePageHead, StaffStatusBadge } from './console/ConsoleParts'
import {
  buildReportModel,
  type ReportCostsInput,
  type ReportMappingRowInput,
  type ReportModel,
  type ReportProfileInput,
  type ReportStackToolInput,
} from '../lib/report'

type ReportInputsDto = {
  headline: string | null
  notes: string | null
  analyst: string | null
  openQuestions: string | null
  hourlyRate: number | null
  implementationMonths: number | null
  buildEstimates: Record<string, number>
}

type ReportResponseDto = {
  report: ReportModel
  derivation: {
    profile: ReportProfileInput
    rows: ReportMappingRowInput[]
    stack: ReportStackToolInput[]
    costs: ReportCostsInput
  }
  inputs: ReportInputsDto
  status: string
  submittedAt: string | null
  mappingConfirmedAt: string | null
  costsEntered: boolean
  caseUpdatedAt: string
  reportUpdatedAt: string | null
  sentAt: string | null
}

/** The two customer-provided figures the cash curve needs, edited in place. */
type CostState = {
  omOperatingCost: string
  implementationCost: string
}

type ComposeState = {
  headline: string
  notes: string
  analyst: string
  openQuestions: string
  hourlyRate: string
  implementationMonths: string
  buildEstimates: Record<string, string>
}

function toComposeState(inputs: ReportInputsDto): ComposeState {
  return {
    headline: inputs.headline ?? '',
    notes: inputs.notes ?? '',
    analyst: inputs.analyst ?? '',
    openQuestions: inputs.openQuestions ?? '',
    hourlyRate: inputs.hourlyRate != null ? String(inputs.hourlyRate) : '',
    implementationMonths: inputs.implementationMonths != null ? String(inputs.implementationMonths) : '',
    buildEstimates: Object.fromEntries(
      Object.entries(inputs.buildEstimates ?? {}).map(([rowId, hours]) => [rowId, String(hours)]),
    ),
  }
}

/** An empty box means "to estimate", which is not the same as zero. */
function toNumberOrNull(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const numeric = Number(trimmed)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null
}

function toPayload(caseId: string, state: ComposeState) {
  const buildEstimates: Record<string, number | null> = {}
  for (const [rowId, raw] of Object.entries(state.buildEstimates)) buildEstimates[rowId] = toNumberOrNull(raw)
  const months = toNumberOrNull(state.implementationMonths)
  return {
    caseId,
    headline: state.headline.trim() || null,
    notes: state.notes.trim() || null,
    analyst: state.analyst.trim() || null,
    openQuestions: state.openQuestions.trim() || null,
    hourlyRate: toNumberOrNull(state.hourlyRate),
    implementationMonths: months != null ? Math.min(24, Math.max(1, Math.round(months))) : null,
    buildEstimates,
  }
}

/**
 * S-09: the admin composes the two human parts and the estimates, and reads
 * the preview — the same renderer the client will get — before sending.
 * Nothing reaches the client until **Send to the client**, which is the only
 * action in the app that moves a case to `sent`.
 *
 * The preview re-derives locally on every keystroke via `buildReportModel`,
 * the same pure function the route runs, so "what I am about to send" cannot
 * drift from "what they get" between saves.
 */
export default function ReportBuilder({ caseId }: { caseId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [compose, setCompose] = React.useState<ComposeState | null>(null)
  const [costs, setCosts] = React.useState<CostState | null>(null)
  // `useGuardedMutation` exposes no pending flag, so the bar tracks its own —
  // without it a double-click could send twice.
  const [busy, setBusy] = React.useState(false)

  const queryKey = React.useMemo(() => ['mercatify-report', caseId] as const, [caseId])
  const saveMutation = useGuardedMutation({ contextId: 'mercatify-report-save' })
  const sendMutation = useGuardedMutation({ contextId: 'mercatify-report-send' })
  const costsMutation = useGuardedMutation({ contextId: 'mercatify-report-costs' })

  const query = useQuery({
    queryKey,
    queryFn: async () => readApiResultOrThrow<ReportResponseDto>(
      `/api/mercatify/cases/report?caseId=${encodeURIComponent(caseId)}`,
    ),
  })
  const data = query.data ?? null

  // Seed the compose state once per loaded version; later refetches after a
  // save must not clobber what the admin is still typing.
  const seededVersionRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!data) return
    const version = data.reportUpdatedAt ?? 'initial'
    if (seededVersionRef.current === version) return
    seededVersionRef.current = version
    setCompose(toComposeState(data.inputs))
  }, [data])

  // The costs live on the case, not the report row, so they seed off the
  // case's own version — a report save must not clobber a cost edit.
  const seededCostsRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!data) return
    if (seededCostsRef.current === data.caseUpdatedAt) return
    seededCostsRef.current = data.caseUpdatedAt
    setCosts({
      omOperatingCost: data.derivation.costs.omOperatingCost != null ? String(data.derivation.costs.omOperatingCost) : '',
      implementationCost: data.derivation.costs.implementationCost != null ? String(data.derivation.costs.implementationCost) : '',
    })
  }, [data])

  const update = React.useCallback(<K extends keyof ComposeState>(key: K, value: ComposeState[K]) => {
    setCompose((previous) => (previous ? { ...previous, [key]: value } : previous))
  }, [])

  /**
   * S-04's two cost inputs, saved from this screen so the admin never leaves it
   * to make the cash curve appear. Posts on blur to the same dedicated route
   * `EditCaseCostsDialog` uses, with the case's current version as the lock.
   */
  const saveCosts = React.useCallback(async () => {
    if (!costs || !data) return
    const omOperatingCost = toNumberOrNull(costs.omOperatingCost)
    const implementationCost = toNumberOrNull(costs.implementationCost)
    if (
      omOperatingCost === data.derivation.costs.omOperatingCost
      && implementationCost === data.derivation.costs.implementationCost
    ) return
    try {
      await withScopedApiRequestHeaders(
        buildOptimisticLockHeader(data.caseUpdatedAt),
        () => costsMutation.runMutation({
          context: { caseId },
          operation: () => apiCallOrThrow('/api/mercatify/cases/costs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: caseId, omOperatingCost, implementationCost }),
          }),
        }),
      )
      seededCostsRef.current = null
      await queryClient.invalidateQueries({ queryKey })
    } catch (error) {
      const status = (error as { status?: number })?.status
      flash(status === 409 ? t('mercatify.report.error.conflict') : t('mercatify.savings.error.generic'), 'error')
    }
  }, [caseId, costs, costsMutation, data, queryClient, queryKey, t])

  // The preview is derived from the saved model plus whatever is on screen,
  // re-run through the same pure builder the server uses.
  const previewModel = React.useMemo<ReportModel | null>(() => {
    if (!data || !compose) return null
    const payload = toPayload(caseId, compose)
    return buildReportModel({
      ...data.derivation,
      authored: {
        headline: payload.headline,
        notes: payload.notes,
        analyst: payload.analyst,
        openQuestions: payload.openQuestions,
        hourlyRate: payload.hourlyRate,
        implementationMonths: payload.implementationMonths,
        buildEstimates: payload.buildEstimates,
        sentAt: data.sentAt,
        preparedAt: data.reportUpdatedAt,
      },
    })
  }, [caseId, compose, data])

  const runSave = React.useCallback(async (): Promise<boolean> => {
    if (!compose || !data) return false
    setBusy(true)
    try {
      await withScopedApiRequestHeaders(
        buildOptimisticLockHeader(data.reportUpdatedAt),
        () => saveMutation.runMutation({
          context: { caseId },
          operation: () => apiCallOrThrow('/api/mercatify/cases/report', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(toPayload(caseId, compose)),
          }),
        }),
      )
      seededVersionRef.current = null
      await queryClient.invalidateQueries({ queryKey })
      return true
    } catch (error) {
      const status = (error as { status?: number })?.status
      flash(
        status === 409 ? t('mercatify.report.error.conflict') : t('mercatify.report.error.saveFailed'),
        'error',
      )
      return false
    } finally {
      setBusy(false)
    }
  }, [caseId, compose, data, queryClient, queryKey, saveMutation, t])

  const onSave = React.useCallback(async () => {
    if (await runSave()) flash(t('mercatify.report.flash.saved'), 'success')
  }, [runSave, t])

  const onSend = React.useCallback(async () => {
    if (!compose || !data) return
    const alreadySent = data.sentAt != null
    const confirmed = await confirm({
      title: alreadySent ? t('mercatify.report.sendDialog.resendTitle') : t('mercatify.report.sendDialog.title'),
      text: alreadySent ? t('mercatify.report.sendDialog.resendDescription') : t('mercatify.report.sendDialog.description'),
      confirmText: alreadySent ? t('mercatify.report.actions.resend') : t('mercatify.report.actions.send'),
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await sendMutation.runMutation({
        context: { caseId },
        operation: () => apiCallOrThrow('/api/mercatify/cases/report/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(toPayload(caseId, compose)),
        }),
      })
      seededVersionRef.current = null
      await queryClient.invalidateQueries({ queryKey })
      flash(
        t(
          'mercatify.console.report.flash.sent',
          'Sent. It is now in {company}’s portal, where they can accept it or ask for a call.',
          { company: data.derivation.profile.companyName ?? '' },
        ),
        'success',
      )
    } catch {
      flash(t('mercatify.report.error.sendFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }, [caseId, compose, confirm, data, queryClient, queryKey, sendMutation, t])

  if (query.error) {
    const status = (query.error as { status?: number })?.status
    const message = status === 401 || status === 403
      ? t('mercatify.report.error.forbidden')
      : t('mercatify.report.error.generic')
    return (
      <Alert status="error">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    )
  }

  if (query.isLoading || !data || !compose || !costs || !previewModel) {
    return <p className="text-sm text-muted-foreground">{t('mercatify.report.loading')}</p>
  }

  if (!data.mappingConfirmedAt) {
    return (
      <EmptyState
        title={t('mercatify.report.notConfirmed.title')}
        description={t('mercatify.report.notConfirmed.description')}
        actions={(
          <Button asChild>
            <Link href={`/backend/cases/${caseId}/mapping`}>{t('mercatify.report.notConfirmed.action')}</Link>
          </Button>
        )}
      />
    )
  }

  const profile = data.derivation.profile
  const headMeta = [
    profile.industry,
    t('mercatify.console.report.head.tools', '{count} tools', { count: data.derivation.stack.length }),
    data.submittedAt
      ? t('mercatify.console.report.head.received', 'received {date}', {
        date: new Date(data.submittedAt).toLocaleDateString(),
      })
      : null,
  ].filter((entry): entry is string => Boolean(entry))

  return (
    <>
      <ConsolePageHead
        title={t('mercatify.console.report.title', 'Report')}
        lead={t(
          'mercatify.console.report.lead',
          'Built from the confirmed mapping, your corrections included. Write the two human bits, read the preview, then send it. Nothing reaches the client until you press send.',
        )}
        actions={(
          <Button asChild variant="outline">
            <Link href={`/backend/cases/${caseId}/mapping`}>
              {t('mercatify.console.report.actions.backToMapping', '← Back to mapping')}
            </Link>
          </Button>
        )}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start">
        <section className="lg:col-span-2" aria-label={t('mercatify.report.compose.label')}>
          <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="text-base font-semibold">{profile.companyName ?? t('mercatify.report.compose.title')}</h2>
              <CaseRefBadge caseId={caseId} />
              <StaffStatusBadge status={data.status} />
              {headMeta.length > 0 ? (
                <p className="ml-auto text-sm text-muted-foreground">{headMeta.join(' · ')}</p>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{t('mercatify.report.compose.description')}</p>

          {!data.costsEntered ? (
            <Alert status="information">
              <AlertDescription>
                {t('mercatify.report.costsMissing')}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="mercatify-report-headline">{t('mercatify.report.fields.headline.label')}</Label>
            <Input
              id="mercatify-report-headline"
              value={compose.headline}
              maxLength={300}
              onChange={(event) => update('headline', event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('mercatify.report.fields.headline.hint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mercatify-report-notes">{t('mercatify.report.fields.notes.label')}</Label>
            <Textarea
              id="mercatify-report-notes"
              rows={5}
              value={compose.notes}
              maxLength={5000}
              onChange={(event) => update('notes', event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('mercatify.report.fields.notes.hint')}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="mercatify-report-analyst">{t('mercatify.report.fields.analyst.label')}</Label>
              <Input
                id="mercatify-report-analyst"
                value={compose.analyst}
                maxLength={200}
                onChange={(event) => update('analyst', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mercatify-report-rate">{t('mercatify.report.fields.hourlyRate.label')}</Label>
              <Input
                id="mercatify-report-rate"
                type="number"
                min={0}
                step={1}
                value={compose.hourlyRate}
                onChange={(event) => update('hourlyRate', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mercatify-report-months">{t('mercatify.report.fields.implementationMonths.label')}</Label>
              <Input
                id="mercatify-report-months"
                type="number"
                min={1}
                max={24}
                step={1}
                value={compose.implementationMonths}
                onChange={(event) => update('implementationMonths', event.target.value)}
              />
            </div>
            {/* S-04's two customer-provided figures live here, next to the
                estimate inputs, so the cash curve can be made to appear
                without leaving this screen. They save on blur. */}
            <div className="space-y-2">
              <Label htmlFor="mercatify-report-om-operating">
                {t('mercatify.console.report.fields.omOperatingCost.label', 'OM operating cost, yearly')}
              </Label>
              <Input
                id="mercatify-report-om-operating"
                type="number"
                min={0}
                step={1}
                value={costs.omOperatingCost}
                onChange={(event) => setCosts({ ...costs, omOperatingCost: event.target.value })}
                onBlur={() => void saveCosts()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mercatify-report-implementation-cost">
                {t('mercatify.console.report.fields.implementationCost.label', 'Implementation cost, one-off')}
              </Label>
              <Input
                id="mercatify-report-implementation-cost"
                type="number"
                min={0}
                step={1}
                value={costs.implementationCost}
                onChange={(event) => setCosts({ ...costs, implementationCost: event.target.value })}
                onBlur={() => void saveCosts()}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('mercatify.report.fields.hourlyRate.hint')}</p>

          <div className="space-y-2">
            <Label htmlFor="mercatify-report-open-questions">{t('mercatify.report.fields.openQuestions.label')}</Label>
            <Textarea
              id="mercatify-report-open-questions"
              rows={4}
              value={compose.openQuestions}
              maxLength={5000}
              onChange={(event) => update('openQuestions', event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('mercatify.report.fields.openQuestions.hint')}</p>
          </div>

          {previewModel.backlog.items.length > 0 ? (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">{t('mercatify.report.fields.estimates.legend')}</legend>
              <p className="text-xs text-muted-foreground">{t('mercatify.report.fields.estimates.hint')}</p>
              {previewModel.backlog.items.map((item) => (
                <div key={item.id} className="space-y-1">
                  <Label htmlFor={`mercatify-report-hours-${item.id}`}>{item.capability}</Label>
                  <Input
                    id={`mercatify-report-hours-${item.id}`}
                    type="number"
                    min={0}
                    step={1}
                    placeholder={t('mercatify.report.backlog.toEstimate')}
                    value={compose.buildEstimates[item.id] ?? ''}
                    onChange={(event) => update('buildEstimates', {
                      ...compose.buildEstimates,
                      [item.id]: event.target.value,
                    })}
                  />
                </div>
              ))}
            </fieldset>
          ) : null}
          </div>
        </section>

        <section className="lg:col-span-3" aria-label={t('mercatify.report.preview.label')}>
          <div className="rounded-lg border border-border">
            {/* The preview is framed so nobody mistakes it for the console's
                own page — what is inside is literally what the client opens. */}
            <div className="flex items-center gap-2.5 border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-border" aria-hidden="true" />
              <span className="h-2 w-2 rounded-full bg-border" aria-hidden="true" />
              <span className="h-2 w-2 rounded-full bg-border" aria-hidden="true" />
              <span>{t('mercatify.console.report.preview.chrome', 'client portal · your consolidation report')}</span>
            </div>
            <div className="p-4">
              <ReportPreview report={previewModel} />
            </div>
          </div>
        </section>
      </div>

      {/* S-10: the client's answer, read back where the admin sent from. */}
      {data.status === 'accepted' || data.status === 'consult' ? (
        <Alert status={data.status === 'accepted' ? 'success' : 'information'} className="mt-6">
          <AlertDescription data-testid="mercatify-report-client-answer">
            {t(`mercatify.report.clientAnswer.${data.status}`)}
          </AlertDescription>
        </Alert>
      ) : null}

      <div
        className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur"
        data-testid="mercatify-report-send-bar"
      >
        <p className="min-w-0 flex-1 text-sm text-muted-foreground" data-testid="mercatify-report-send-state">
          {data.sentAt
            ? t('mercatify.report.sendState.sent', { date: new Date(data.sentAt).toLocaleDateString() })
            : t('mercatify.report.sendState.notSent')}
        </p>
        <Button type="button" variant="outline" onClick={() => void onSave()} disabled={busy}>
          {t('mercatify.report.actions.save')}
        </Button>
        <Button type="button" onClick={() => void onSend()} disabled={busy}>
          {data.sentAt ? t('mercatify.report.actions.resend') : t('mercatify.report.actions.send')}
        </Button>
      </div>
      {ConfirmDialogElement}
    </>
  )
}
