"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@open-mercato/ui/backend/Page'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { isAnsweredStatus, isReportReadyStatus } from '../lib/request-progress'
import {
  CLIENT_STATUS_FALLBACKS,
  CLIENT_STATUS_LABEL_KEYS,
  CLIENT_STATUS_VARIANTS,
  isClientStatus,
  money,
  monthlyTotal,
  requestRef,
  shortDate,
  type ClientCase,
} from './client/clientRequest'

const PAGE_SIZE = 50
const CREATE_HREF = '/backend/cases/create'

/**
 * `assets/client/requests.html` — tiles, not a table. The one thing the client
 * came back for is whether the ball is with us or with them, so the tile leads
 * with the status and changes its call to action with it.
 */
export default function RequestsTable() {
  const t = useT()
  const router = useRouter()

  const { data, isLoading, error } = useQuery({
    queryKey: ['mercatify-requests', 1],
    queryFn: async () => fetchCrudList<ClientCase>('mercatify/cases', { page: 1, pageSize: PAGE_SIZE, mine: true }),
  })

  if (error) {
    const status = (error as { status?: number }).status
    const message = status === 401 || status === 403
      ? t('mercatify.client.requests.error.forbidden', 'You do not have permission to view your requests.')
      : t('mercatify.client.requests.error.generic', 'Unable to load your requests. Please try again.')
    return (
      <Alert status="error">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    )
  }

  const items = data?.items ?? []

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t('mercatify.client.requests.loading', 'Loading your requests…')}</p>
  }

  if (!items.length) {
    return (
      <div className="space-y-5">
        <PageHeader
          title={t('mercatify.client.requests.title', 'Your requests')}
          description={t('mercatify.client.requests.empty.lead', 'Nothing here yet.')}
        />
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          {t(
            'mercatify.client.requests.empty.body',
            'You have not sent us a stack yet. It takes about four minutes and you keep the map whether or not you go ahead with us.',
          )}
          <div className="mt-3.5">
            <Button asChild>
              <Link href={CREATE_HREF}>{t('mercatify.client.requests.empty.cta', 'Map my stack')}</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('mercatify.client.requests.title', 'Your requests')}
        description={t(
          'mercatify.client.requests.lead',
          'Everything you have sent us, and where each one got to. Open one to see what you sent and to read the report when it comes back.',
        )}
        actions={(
          <Button asChild variant="outline">
            <Link href={CREATE_HREF}>{t('mercatify.client.requests.actions.another', 'Send another stack')}</Link>
          </Button>
        )}
      />

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {items.map((item) => {
          const status = String(item.status ?? 'new')
          const answered = isAnsweredStatus(status)
          const ready = isReportReadyStatus(status) && !answered
          const href = `/backend/requests/${item.id}`
          // The report-sent and answer dates are not on the case JSON; `updatedAt`
          // is the closest stand-in the list API gives us.
          const changedAt = shortDate(item.updatedAt)

          const state = ready
            ? t('mercatify.client.requests.state.ready', 'Your report came back on {date}.', { date: changedAt })
            : status === 'accepted'
              ? t('mercatify.client.requests.state.accepted', 'You accepted it on {date}.', { date: changedAt })
              : status === 'consult'
                ? t('mercatify.client.requests.state.consult', 'You asked for a call on {date}.', { date: changedAt })
                : t('mercatify.client.requests.state.waiting', 'With a consultant. We usually come back within two working days.')

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(href)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(href) } }}
              className={`flex cursor-pointer flex-col gap-2.5 rounded-xl border p-[18px] shadow-sm transition-colors hover:border-foreground ${
                ready
                  ? 'border-status-success-border bg-status-success-bg'
                  : 'border-border bg-card'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{requestRef(item.id)}</span>
                {isClientStatus(status) ? (
                  <StatusBadge variant={CLIENT_STATUS_VARIANTS[status]}>
                    {t(CLIENT_STATUS_LABEL_KEYS[status], CLIENT_STATUS_FALLBACKS[status])}
                  </StatusBadge>
                ) : null}
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight">
                  {item.companyName || t('mercatify.client.requests.fallbackTitle', 'Your stack')}
                </div>
                <div className="text-[0.8125rem] text-muted-foreground">
                  {t('mercatify.client.requests.meta', '{tools} tools · {amount}/mo · sent {date}', {
                    tools: (item.tools ?? []).length,
                    amount: money(monthlyTotal(item.tools), item.currency),
                    date: shortDate(item.submittedAt),
                  })}
                </div>
              </div>
              <div className="text-[0.8125rem] text-muted-foreground">{state}</div>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                {ready ? (
                  <Button asChild size="sm" onClick={(e) => e.stopPropagation()}>
                    <Link href={`${href}/report`}>
                      {t('mercatify.client.requests.actions.readReport', 'Read the report')}
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="outline" onClick={(e) => e.stopPropagation()}>
                    <Link href={href}>{t('mercatify.client.requests.actions.seeSent', 'See what you sent')}</Link>
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
