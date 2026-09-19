"use client"

import * as React from 'react'
import Link from 'next/link'
import { PageHeader } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { RequestProgressTrack } from './RequestProgressTrack'
import {
  CLIENT_STATUS_FALLBACKS,
  CLIENT_STATUS_LABEL_KEYS,
  CLIENT_STATUS_VARIANTS,
  isClientStatus,
  money,
  monthlyTotal,
  requestRef,
  shortDate,
  toolUseLabels,
  type ClientCase,
} from './client/clientRequest'
import { buildTrackSteps } from './client/progressSteps'
import { isAnsweredStatus, isReportReadyStatus, isSubmittedCaseStatus } from '../lib/request-progress'

const LIST_HREF = '/backend/requests'
const CREATE_HREF = '/backend/cases/create'

/** `assets/client/request.html` — what was sent on the left, where it is on the right. */
export function RequestDetailLoader({ id }: { id: string }) {
  const t = useT()
  const [record, setRecord] = React.useState<ClientCase | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [err, setErr] = React.useState<string | null>(null)
  const [isNotFound, setIsNotFound] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setErr(null)
      setIsNotFound(false)
      try {
        const data = await fetchCrudList<ClientCase>('mercatify/cases', {
          ids: String(id),
          pageSize: 1,
          mine: true,
        })
        const item = data?.items?.[0]
        if (!item || !isSubmittedCaseStatus(String(item.status ?? 'draft'))) {
          if (!cancelled) setIsNotFound(true)
          return
        }
        if (!cancelled) setRecord(item)
      } catch (error: unknown) {
        if (!cancelled) {
          if ((error as { status?: number }).status === 404) setIsNotFound(true)
          else {
            const message = error instanceof Error && error.message
              ? error.message
              : t('mercatify.client.detail.error.load', 'Unable to load this request.')
            setErr(message)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, t])

  if (isNotFound) {
    return (
      <RecordNotFoundState
        label={t('mercatify.client.detail.error.notFound', 'That request is not one of yours.')}
        backHref={LIST_HREF}
        backLabel={t('mercatify.client.detail.actions.back', '← Back to my requests')}
      />
    )
  }

  if (err) return <ErrorMessage label={err} />

  if (loading || !record) {
    return <p className="text-sm text-muted-foreground">{t('mercatify.client.detail.loading', 'Loading your request…')}</p>
  }

  const status = String(record.status ?? 'new')
  const reportReady = isReportReadyStatus(status)
  const answered = isAnsweredStatus(status)
  const ref = requestRef(id)
  const currency = record.currency
  // Stand-in for the report-sent / answer date, which the case JSON omits.
  const changedAt = shortDate(record.updatedAt)
  const tools = record.tools ?? []

  const meta = [
    record.industry || null,
    record.peopleCount ? t('mercatify.client.detail.people', '{count} people', { count: record.peopleCount }) : null,
    t('mercatify.client.detail.licences', '{amount}/mo on licences', { amount: money(monthlyTotal(tools), currency) }),
  ].filter(Boolean).join(' · ')

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('mercatify.client.detail.title', 'Your request {ref}', { ref })}
        description={t('mercatify.client.detail.lead', 'Sent on {date}. This is what we are working from.', {
          date: shortDate(record.submittedAt),
        })}
        actions={(
          <Button asChild variant="ghost">
            <Link href={LIST_HREF}>{t('mercatify.client.detail.actions.back', '← Back to my requests')}</Link>
          </Button>
        )}
      />

      {reportReady ? (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-baseline gap-2.5">
            <h2 className="text-lg font-semibold tracking-tight">
              {answered
                ? t('mercatify.client.detail.ready.titleAnswered', 'Your report')
                : t('mercatify.client.detail.ready.title', 'Your report is ready')}
            </h2>
            {isClientStatus(status) ? (
              <StatusBadge variant={CLIENT_STATUS_VARIANTS[status]}>
                {t(CLIENT_STATUS_LABEL_KEYS[status], CLIENT_STATUS_FALLBACKS[status])}
              </StatusBadge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {status === 'accepted'
              ? t('mercatify.client.detail.ready.bodyAccepted', 'You accepted it on {date}. It stays here for you to re-read.', { date: changedAt })
              : status === 'consult'
                ? t('mercatify.client.detail.ready.bodyConsult', 'You asked for a call on {date}. Sales will be in touch.', { date: changedAt })
                : t(
                  'mercatify.client.detail.ready.body',
                  'A consultant has been through your stack and sent the report back on {date}. Read it, then accept it or ask for a call — whichever suits.',
                  { date: changedAt },
                )}
          </p>
          <div className="mt-3.5">
            <Button asChild>
              <Link href={`${LIST_HREF}/${id}/report`}>
                {answered
                  ? t('mercatify.client.detail.actions.readAgain', 'Read it again')
                  : t('mercatify.client.detail.actions.readReport', 'Read the report')}
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:[grid-template-columns:minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-baseline gap-2.5">
              <h2 className="text-lg font-semibold tracking-tight">
                {record.companyName || t('mercatify.client.requests.fallbackTitle', 'Your stack')}
              </h2>
              <Badge variant="outline" className="font-mono">{ref}</Badge>
              <p className="ml-auto text-sm text-muted-foreground">{meta}</p>
            </div>
            <ul className="grid list-none p-0">
              {tools.map((tool, index) => {
                const bits = [
                  tool.seats ? t('mercatify.client.detail.seats', '{count} seats', { count: tool.seats }) : null,
                  tool.monthlyCost != null
                    ? t('mercatify.client.detail.perMonth', '{amount}/mo', { amount: money(tool.monthlyCost, currency) })
                    : null,
                ].filter(Boolean).join(' · ')
                return (
                  <li
                    key={`${tool.name}-${index}`}
                    className="border-b border-border py-2.5 first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <b className="text-sm">{tool.name}</b>
                      <span className="text-sm text-muted-foreground">{bits}</span>
                    </div>
                    <div className="mt-0.5 text-[0.8125rem] text-muted-foreground">{toolUseLabels(tool)}</div>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-sm text-muted-foreground">
                  {t('mercatify.client.detail.pains', 'What hurts today')}
                </div>
                <p className="text-sm">{record.pains || t('mercatify.client.detail.notStated', 'Not stated.')}</p>
              </div>
              <div>
                <div className="mb-1 text-sm text-muted-foreground">
                  {t('mercatify.client.detail.mustKeep', 'Must not be touched')}
                </div>
                <p className="text-sm">{record.mustKeep || t('mercatify.client.detail.notStated', 'Not stated.')}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-baseline gap-2.5">
              <h2 className="text-lg font-semibold tracking-tight">
                {t('mercatify.client.detail.change.title', 'Something to change?')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('mercatify.client.detail.change.body', 'Send a corrected list and we will work from the newer one.')}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={CREATE_HREF}>{t('mercatify.client.detail.change.cta', 'Send a corrected list')}</Link>
            </Button>
          </div>
        </div>

        <aside
          className="rounded-xl border border-border bg-card p-6 shadow-sm"
          aria-label={t('mercatify.client.track.label', 'Request progress')}
        >
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">{t('mercatify.client.track.heading', 'Where it is')}</h2>
          </div>
          <RequestProgressTrack
            steps={buildTrackSteps(t, { status, submittedAt: record.submittedAt, changedAt: record.updatedAt })}
          />
        </aside>
      </div>
    </div>
  )
}
