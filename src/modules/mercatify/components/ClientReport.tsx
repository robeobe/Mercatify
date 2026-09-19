"use client"

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import ReportPreview from './ReportPreview'
import type { ReportModel } from '../lib/report'
import { isAnsweredStatus } from '../lib/request-progress'

const LIST_HREF = '/backend/requests'

type ClientAnswer = 'accepted' | 'consult'

type ClientReportDto = {
  report: ReportModel
  status: string
  sentAt: string
  title: string
}

/**
 * S-10: what the client reads and answers.
 *
 * Deliberately thin — it fetches the model and hands it to `ReportPreview`,
 * the very component the admin's builder previews with. There is no second
 * renderer and no second derivation here, so an admin edit followed by a
 * re-send shows up without any "regenerate" step.
 */
export default function ClientReport({ caseId }: { caseId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  // `useGuardedMutation` exposes no pending flag; without our own a double
  // click could post the answer twice.
  const [busy, setBusy] = React.useState(false)

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

  const onAnswer = React.useCallback(async (answer: ClientAnswer) => {
    const confirmed = await confirm({
      title: t(`mercatify.clientReport.confirm.${answer}.title`),
      text: t(`mercatify.clientReport.confirm.${answer}.text`),
      confirmText: t(`mercatify.clientReport.actions.${answer}`),
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await answerMutation.runMutation({
        context: { caseId },
        operation: () => apiCallOrThrow('/api/mercatify/cases/answer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ caseId, answer }),
        }),
      })
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mercatify-requests'] })
      flash(t(`mercatify.clientReport.flash.${answer}`), 'success')
    } catch (error) {
      const status = (error as { status?: number })?.status
      flash(
        status === 403
          ? t('mercatify.clientReport.error.forbidden')
          : t('mercatify.clientReport.error.answerFailed'),
        'error',
      )
    } finally {
      setBusy(false)
    }
  }, [answerMutation, caseId, confirm, queryClient, queryKey, t])

  if (query.error) {
    const status = (query.error as { status?: number })?.status
    if (status === 404) {
      return (
        <EmptyState
          title={t('mercatify.clientReport.notSent.title')}
          description={t('mercatify.clientReport.notSent.description')}
          actions={(
            <Button asChild variant="outline">
              <Link href={`${LIST_HREF}/${caseId}`}>{t('mercatify.clientReport.actions.backToRequest')}</Link>
            </Button>
          )}
        />
      )
    }
    return (
      <Alert status="error">
        <AlertDescription>
          {status === 401 || status === 403
            ? t('mercatify.clientReport.error.forbidden')
            : t('mercatify.clientReport.error.generic')}
        </AlertDescription>
      </Alert>
    )
  }

  if (query.isLoading || !data) {
    return <p className="text-sm text-muted-foreground">{t('mercatify.clientReport.loading')}</p>
  }

  return (
    <>
      {answered ? (
        <Alert status={data.status === 'accepted' ? 'success' : 'information'} className="mb-6">
          <AlertTitle>
            {t(data.status === 'accepted'
              ? 'mercatify.clientReport.answered.accepted.title'
              : 'mercatify.clientReport.answered.consult.title')}
          </AlertTitle>
          <AlertDescription>
            {t(data.status === 'accepted'
              ? 'mercatify.clientReport.answered.accepted.body'
              : 'mercatify.clientReport.answered.consult.body')}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-lg border border-border p-4">
        <ReportPreview report={data.report} />
      </div>

      <div
        className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-border p-4"
        data-testid="mercatify-client-report-actions"
      >
        <p className="mr-auto text-sm text-muted-foreground">
          {answered
            ? t('mercatify.clientReport.decide.change')
            : t('mercatify.clientReport.decide.prompt')}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={busy || data.status === 'consult'}
          onClick={() => void onAnswer('consult')}
        >
          {t('mercatify.clientReport.actions.consult')}
        </Button>
        <Button
          type="button"
          disabled={busy || data.status === 'accepted'}
          onClick={() => void onAnswer('accepted')}
        >
          {t('mercatify.clientReport.actions.accepted')}
        </Button>
      </div>
      {ConfirmDialogElement}
    </>
  )
}
