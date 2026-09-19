"use client"

import * as React from 'react'
import Link from 'next/link'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CaseForm, toCaseFormValues, type CaseRecord } from './CaseForm'
import { RequestProgressTrack } from './RequestProgressTrack'
import {
  isAnsweredStatus,
  isReportReadyStatus,
  isSubmittedCaseStatus,
  type ClientProgressStep,
} from '../lib/request-progress'

const LIST_HREF = '/backend/requests'

type RequestRecord = CaseRecord & {
  progress?: ClientProgressStep[]
  submittedAt?: string | null
}

export function RequestDetailLoader({ id }: { id: string }) {
  const t = useT()
  const [record, setRecord] = React.useState<RequestRecord | null>(null)
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
        const data = await fetchCrudList<RequestRecord>('mercatify/cases', {
          ids: String(id),
          pageSize: 1,
          mine: true,
        })
        const item = data?.items?.[0]
        if (!item || !isSubmittedCaseStatus(item.status ?? 'draft')) {
          if (!cancelled) setIsNotFound(true)
          return
        }
        if (!cancelled) setRecord(item)
      } catch (error: unknown) {
        if (!cancelled) {
          if ((error as { status?: number }).status === 404) setIsNotFound(true)
          else {
            const message = error instanceof Error && error.message ? error.message : t('mercatify.requests.detail.error.load')
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
        label={t('mercatify.requests.detail.error.notFound')}
        backHref={LIST_HREF}
        backLabel={t('mercatify.requests.detail.actions.back')}
      />
    )
  }

  if (err) return <ErrorMessage label={err} />

  const status = record?.status ?? 'new'
  const reportReady = isReportReadyStatus(status)
  const answered = isAnsweredStatus(status)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
      <div className="min-w-0 space-y-4 lg:col-span-2">
        {reportReady ? (
          <div className="space-y-3">
            <Alert status={answered ? 'success' : 'information'}>
              <AlertTitle>
                {t(answered
                  ? `mercatify.requests.detail.answered.${status}.title`
                  : 'mercatify.requests.detail.reportReady.title')}
              </AlertTitle>
              <AlertDescription>
                {t(answered
                  ? `mercatify.requests.detail.answered.${status}.body`
                  : 'mercatify.requests.detail.reportReady.body')}
              </AlertDescription>
            </Alert>
            <Button asChild size="sm">
              <Link href={`${LIST_HREF}/${id}/report`}>
                {t(answered
                  ? 'mercatify.requests.detail.actions.viewReport'
                  : 'mercatify.requests.detail.actions.openReport')}
              </Link>
            </Button>
          </div>
        ) : null}
        <CaseForm
          mode="view"
          caseId={id}
          isLoading={loading}
          initial={record ? toCaseFormValues(record) : {
            id,
            companyName: '',
            industry: '',
            peopleCount: null,
            currency: 'EUR',
            pains: '',
            mustKeep: '',
            tools: [],
            status: 'new',
            updatedAt: null,
          }}
          listHref={LIST_HREF}
          formTitle={t('mercatify.requests.detail.title')}
          showLockAlert={false}
        />
      </div>
      <aside className="rounded-lg border border-border bg-card p-4" aria-label={t('mercatify.requests.progress.label')}>
        <h2 className="mb-4 text-sm font-medium">{t('mercatify.requests.progress.heading')}</h2>
        <RequestProgressTrack steps={record?.progress ?? []} />
      </aside>
    </div>
  )
}
