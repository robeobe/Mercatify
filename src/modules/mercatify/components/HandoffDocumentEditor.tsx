"use client"
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import LabHandoffOutcome from './LabHandoffOutcome'

const ENTITY_ID = 'mercatify:interview_case'
const CONTENT_MAX_LENGTH = 200_000

type HandoffDocumentDto = {
  id: string
  handoffDocument: string | null
  mappingConfirmedAt: string | null
  updatedAt: string | null
  labHandoffStatus: string | null
  labHandoffDocument: string | null
  labHandoffAt: string | null
}

type FormValues = {
  id: string
  content: string
  updatedAt?: string | null
}

export default function HandoffDocumentEditor({ caseId }: { caseId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const generatedOnceRef = React.useRef(false)
  const generateMutation = useGuardedMutation({ contextId: 'mercatify-handoff-generate' })

  const query = useQuery({
    queryKey: ['mercatify-handoff-document', caseId],
    queryFn: async () => fetchCrudList<HandoffDocumentDto>('mercatify/handoff-document', { ids: caseId, pageSize: 1 }),
  })
  const record = query.data?.items?.[0] ?? null
  const isConfirmed = Boolean(record?.mappingConfirmedAt)
  const hasDocument = record != null && record.handoffDocument != null

  // Auto-generate once, on the first visit after the mapping is confirmed —
  // the admin sees the document already seeded, with no manual step. Never
  // runs again once a document exists (PRD Open Question 8: independent
  // artifact, no re-sync from the mapping table).
  React.useEffect(() => {
    if (query.isLoading || query.error || generatedOnceRef.current) return
    if (!record || !isConfirmed || hasDocument) return
    generatedOnceRef.current = true
    void generateMutation.runMutation({
      context: { caseId },
      operation: () => apiCallOrThrow('/api/mercatify/handoff-document/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caseId }),
      }),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['mercatify-handoff-document', caseId] })
    }).catch(() => {
      flash(t('mercatify.handoff.editor.error.generateFailed'), 'error')
    })
  }, [caseId, generateMutation, hasDocument, isConfirmed, query.error, query.isLoading, queryClient, record, t])

  const fields = React.useMemo<CrudField[]>(() => [
    {
      id: 'content',
      label: t('mercatify.handoff.editor.fields.content.label'),
      type: 'textarea',
      rows: 30,
      maxLength: CONTENT_MAX_LENGTH,
      showCount: true,
    },
  ], [t])

  const groups = React.useMemo<CrudFormGroup[]>(() => [
    { id: 'document', title: t('mercatify.handoff.editor.group'), column: 1, fields: ['content'] },
  ], [t])

  const initialValues = React.useMemo<FormValues | undefined>(() => record ? {
    id: record.id,
    content: record.handoffDocument ?? '',
    updatedAt: record.updatedAt ?? null,
  } : undefined, [record])

  if (query.error) {
    const status = (query.error as { status?: number })?.status
    const message = status === 401 || status === 403
      ? t('mercatify.handoff.editor.error.forbidden')
      : t('mercatify.handoff.editor.error.generic')
    return (
      <Alert status="error">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    )
  }

  if (!query.isLoading && record && !isConfirmed) {
    return (
      <EmptyState
        title={t('mercatify.handoff.editor.notConfirmed.title')}
        description={t('mercatify.handoff.editor.notConfirmed.description')}
        actions={(
          <Button asChild>
            <Link href={`/backend/cases/${caseId}/mapping`}>{t('mercatify.handoff.editor.notConfirmed.action')}</Link>
          </Button>
        )}
      />
    )
  }

  return (
    <>
      {/* S-06: what happened when the client accepted — shown here, on the
          admin's screen, because the `.md` is admin-only (S-05). */}
      <LabHandoffOutcome
        status={record?.labHandoffStatus ?? null}
        document={record?.labHandoffDocument ?? null}
        at={record?.labHandoffAt ?? null}
      />
      <CrudForm<FormValues>
      title={t('mercatify.handoff.editor.title')}
      backHref={`/backend/cases/${caseId}`}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('mercatify.handoff.editor.submit')}
      cancelHref={`/backend/cases/${caseId}`}
      isLoading={query.isLoading || !hasDocument}
      loadingMessage={t('mercatify.handoff.editor.loading')}
      onSubmit={async (values) => {
        await updateCrud('mercatify/handoff-document', values)
        flash(t('mercatify.handoff.flash.saved'), 'success')
        queryClient.invalidateQueries({ queryKey: ['mercatify-handoff-document', caseId] })
      }}
      />
    </>
  )
}
