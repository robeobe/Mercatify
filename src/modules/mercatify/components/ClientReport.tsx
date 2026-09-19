"use client"

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@open-mercato/ui/backend/Page'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import ReportPreview from './ReportPreview'
import type { ReportModel } from '../lib/report'
import { isAnsweredStatus } from '../lib/request-progress'
import { shortDate } from './client/clientRequest'

const LIST_HREF = '/backend/requests'

type ClientAnswer = 'accepted' | 'consult'

type ClientReportDto = {
  report: ReportModel
  status: string
  sentAt: string
  title: string
}

/**
 * S-10: what the client reads and answers — `assets/client/offer.html`.
 *
 * The document itself is `ReportPreview`, the very component the admin's
 * builder previews with, so there is no second renderer. Everything around it
 * is the client's decision: two card-shaped choices and one sticky send bar.
 */
export default function ClientReport({ caseId }: { caseId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  // `useGuardedMutation` exposes no pending flag; without our own a double
  // click could post the answer twice.
  const [busy, setBusy] = React.useState(false)
  const [choice, setChoice] = React.useState<ClientAnswer>('accepted')
  const [note, setNote] = React.useState('')

  const queryKey = React.useMemo(() => ['mercatify-client-report', caseId] as const, [caseId])
  const answerMutation = useGuardedMutation({ contextId: 'mercatify-case-answer' })

  const query = useQuery({
    queryKey,
    queryFn: async () => readApiResultOrThrow<ClientReportDto>(
      `/api/mercatify/cases/report/client?caseId=${encodeURIComponent(caseId)}`,
    ),
  })
  const data = query.data ?? null
  const answered = data ? isAnsweredStatus(data.status) : false

  const onSubmit = React.useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await answerMutation.runMutation({
        context: { caseId },
        operation: () => apiCallOrThrow('/api/mercatify/cases/answer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // The free text is for the consultant's benefit only — the endpoint
          // takes no message field, so it is not persisted.
          body: JSON.stringify({ caseId, answer: choice }),
        }),
      })
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mercatify-requests'] })
      flash(t(`mercatify.client.report.flash.${choice}`), 'success')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      const status = (error as { status?: number })?.status
      flash(
        status === 403
          ? t('mercatify.client.report.error.forbidden', 'That report is not one of yours.')
          : t('mercatify.client.report.error.answerFailed', 'We could not record your answer. Please try again.'),
        'error',
      )
    } finally {
      setBusy(false)
    }
  }, [answerMutation, caseId, choice, queryClient, queryKey, t])

  if (query.error) {
    const status = (query.error as { status?: number })?.status
    if (status === 404) {
      return (
        <div className="space-y-5">
          <PageHeader
            title={t('mercatify.client.report.title', 'Your consolidation report')}
            description={t('mercatify.client.report.notSent.lead', 'Not ready yet.')}
          />
          <EmptyState
            title=""
            description={t(
              'mercatify.client.report.notSent.description',
              'We are still reading what you sent. Your report will be here as soon as a consultant has been through it — usually within two working days.',
            )}
            actions={(
              <Button asChild variant="outline">
                <Link href={LIST_HREF}>{t('mercatify.client.report.actions.backToList', 'Back to my requests')}</Link>
              </Button>
            )}
          />
        </div>
      )
    }
    return (
      <Alert status="error">
        <AlertDescription>
          {status === 401 || status === 403
            ? t('mercatify.client.report.error.forbidden', 'That report is not one of yours.')
            : t('mercatify.client.report.error.generic', 'Unable to load your report.')}
        </AlertDescription>
      </Alert>
    )
  }

  if (query.isLoading || !data) {
    return <p className="text-sm text-muted-foreground">{t('mercatify.client.report.loading', 'Loading your report…')}</p>
  }

  const report = data.report
  const jobs = new Set(report.toolGroups.flatMap((group) => group.rows.map((row) => row.capability))).size
  const answeredOn = shortDate(report.sentAt ?? data.sentAt)

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('mercatify.client.report.title', 'Your consolidation report')}
        description={t('mercatify.client.report.lead', '{company} · {jobs} jobs across {tools} tools · prepared {date}', {
          company: report.companyName ?? data.title,
          jobs,
          tools: report.toolGroups.length,
          date: shortDate(report.preparedAt ?? data.sentAt),
        })}
        actions={(
          <Button asChild variant="ghost">
            <Link href={`${LIST_HREF}/${caseId}`}>
              {t('mercatify.client.report.actions.backToRequest', '← Back to your request')}
            </Link>
          </Button>
        )}
      />

      {answered ? (
        <Alert status="success">
          <AlertDescription>
            <span className="block font-medium">
              {data.status === 'accepted'
                ? t('mercatify.client.report.answered.accepted.title', 'You accepted this on {date}.', { date: answeredOn })
                : t('mercatify.client.report.answered.consult.title', 'You asked for a call on {date}.', { date: answeredOn })}
            </span>
            <span className="block">
              {data.status === 'accepted'
                ? t('mercatify.client.report.answered.accepted.body', 'A consultant is putting the first step together and will come back to you.')
                : t('mercatify.client.report.answered.consult.body', 'Someone from Sales will get in touch to walk you through it.')}
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-lg border border-border p-4">
        <ReportPreview report={report} />
      </div>

      {answered ? null : (
        <form onSubmit={onSubmit} data-testid="mercatify-client-report-actions">
          <div className="mb-3 mt-7">
            <h2 className="text-lg font-semibold tracking-tight">
              {t('mercatify.client.report.answer.title', 'What would you like to do?')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('mercatify.client.report.answer.lead', 'No pressure either way — the report is yours to keep whichever you pick.')}
            </p>
          </div>

          <div className="grid gap-3">
            {([
              {
                value: 'accepted' as const,
                title: t('mercatify.client.report.answer.accepted.title', "Accept — let's do this"),
                desc: t(
                  'mercatify.client.report.answer.accepted.desc',
                  'We start with the first thing on the list and come back to you with a plan and a date. Nothing is signed by clicking here.',
                ),
              },
              {
                value: 'consult' as const,
                title: t('mercatify.client.report.answer.consult.title', 'I would like to talk to someone first'),
                desc: t(
                  'mercatify.client.report.answer.consult.desc',
                  'Someone from Sales calls you to go through the map. Say below what you would like them to cover.',
                ),
              },
            ]).map((option) => (
              <label
                key={option.value}
                className="grid cursor-pointer grid-cols-[18px_1fr] items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5 font-normal hover:bg-muted"
              >
                <input
                  type="radio"
                  name="mercatify-client-answer"
                  value={option.value}
                  checked={choice === option.value}
                  onChange={() => setChoice(option.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">{option.desc}</span>
                </span>
              </label>
            ))}

            <div>
              <label htmlFor="mercatify-client-answer-note" className="mb-1 block text-sm font-medium">
                {t('mercatify.client.report.answer.note.label', 'Anything you want to add')}
              </label>
              <textarea
                id="mercatify-client-answer-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder={t(
                  'mercatify.client.report.answer.note.placeholder',
                  'The stock numbers are the thing that hurts — can we start there? Best reached Tuesday mornings.',
                )}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>

            <div className="sticky bottom-0 z-[5] mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur">
              <div className="min-w-0 flex-1 text-sm text-muted-foreground">
                {t('mercatify.client.report.answer.bar', 'Your answer goes straight to the consultant who wrote this.')}
              </div>
              <Button type="submit" disabled={busy}>
                {t('mercatify.client.report.answer.submit', 'Send my answer')}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
