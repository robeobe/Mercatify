"use client"

import * as React from 'react'
import Link from 'next/link'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { Skeleton } from '@open-mercato/ui/primitives/skeleton'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { apiFetch } from '@open-mercato/ui/backend/utils/api'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CaseForm, toCaseFormValues, type CaseFormValues, type CaseRecord } from '../CaseForm'
import { LabAnalysisCard } from './LabAnalysisCard'

const QUEUE_HREF = '/backend/cases'

/** `REQ-` + the first four hex characters of the case id — the reference the
 *  mockups print on every staff and client screen. */
export function caseRef(id: string): string {
  return `REQ-${id.replace(/-/g, '').slice(0, 4).toUpperCase()}`
}

const STAFF_STATUS: Record<string, { key: string; fallback: string; variant: StatusBadgeVariant }> = {
  draft: { key: 'mercatify.analysis.status.draft', fallback: 'draft', variant: 'neutral' },
  new: { key: 'mercatify.analysis.status.new', fallback: 'new', variant: 'info' },
  mapping: { key: 'mercatify.analysis.status.mapping', fallback: 'in mapping', variant: 'warning' },
  mapped: { key: 'mercatify.analysis.status.mapped', fallback: 'mapped', variant: 'success' },
  sent: { key: 'mercatify.analysis.status.sent', fallback: 'report sent', variant: 'info' },
  accepted: { key: 'mercatify.analysis.status.accepted', fallback: 'accepted', variant: 'success' },
  consult: { key: 'mercatify.analysis.status.consult', fallback: 'consult asked', variant: 'warning' },
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; record: CaseRecord; values: CaseFormValues }

export function CaseDetailView({ id }: { id: string }) {
  const t = useT()
  const [state, setState] = React.useState<LoadState>({ kind: 'loading' })
  // Cheapest honest permission probe: the mapping-rows list is gated on
  // `mercatify.mapping.view`, so a 403 there is exactly "this admin may not
  // see the analysis". `null` while it is still unknown.
  const [canSeeMapping, setCanSeeMapping] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await fetchCrudList<CaseRecord>('mercatify/cases', { ids: String(id), pageSize: 1 })
        const item = data?.items?.[0]
        if (cancelled) return
        if (!item) {
          setState({ kind: 'notFound' })
          return
        }
        setState({ kind: 'ready', record: item, values: toCaseFormValues(item) })
      } catch (error: unknown) {
        if (cancelled) return
        if ((error as { status?: number }).status === 404) setState({ kind: 'notFound' })
        else {
          const message = error instanceof Error && error.message
            ? error.message
            : t('mercatify.cases.form.error.load')
          setState({ kind: 'error', message })
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, t])

  React.useEffect(() => {
    let cancelled = false
    apiFetch(`/api/mercatify/mapping-rows?caseId=${encodeURIComponent(id)}&pageSize=1`)
      .then((res) => { if (!cancelled) setCanSeeMapping(res.status !== 403 && res.status !== 401) })
      .catch(() => { if (!cancelled) setCanSeeMapping(false) })
    return () => { cancelled = true }
  }, [id])

  if (state.kind === 'notFound') {
    return (
      <RecordNotFoundState
        label={t('mercatify.cases.form.error.notFound')}
        backHref={QUEUE_HREF}
        backLabel={t('mercatify.cases.form.actions.backToList')}
      />
    )
  }
  if (state.kind === 'error') return <ErrorMessage label={state.message} />
  if (state.kind === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-36 w-full" />
      </div>
    )
  }

  const { record, values } = state
  const status = String(record.status ?? 'draft')
  const staffStatus = STAFF_STATUS[status] ?? STAFF_STATUS.draft!
  const company = values.companyName?.trim() || record.title?.trim() || t('mercatify.cases.detail.title')

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-xl font-semibold leading-tight sm:text-2xl">{company}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">{caseRef(id)}</Badge>
            <StatusBadge variant={staffStatus.variant} dot>{t(staffStatus.key, staffStatus.fallback)}</StatusBadge>
          </div>
        </div>
        {canSeeMapping ? (
          <Button asChild variant="ghost">
            <Link href={QUEUE_HREF}>{t('mercatify.analysis.action.backToQueue', '← Back to queue')}</Link>
          </Button>
        ) : null}
      </div>

      {canSeeMapping ? (
        <LabAnalysisCard caseId={id} status={status} analysedAt={values.updatedAt ?? null} />
      ) : null}

      <CaseForm
        mode="view"
        caseId={id}
        initial={values}
        showCorrectedListAction={false}
        showLockAlert={false}
        embedded
      />
    </div>
  )
}

export default CaseDetailView
