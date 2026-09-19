"use client"

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusMap } from '@open-mercato/ui/primitives/status-badge'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { formatDate } from '@open-mercato/ui/utils/format'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isReportReadyStatus, type WhoseTurn } from '../lib/request-progress'

const ENTITY_ID = 'mercatify:interview_case'
const PAGE_SIZE = 50

type CaseStatus = 'draft' | 'new' | 'mapping' | 'mapped' | 'sent' | 'accepted' | 'consult'

type RequestRow = {
  id: string
  title: string
  status: string
  whoseTurn?: WhoseTurn
  submittedAt: string | null
}

const statusVariants: StatusMap<CaseStatus> = {
  draft: 'neutral',
  new: 'info',
  mapping: 'warning',
  mapped: 'warning',
  sent: 'info',
  accepted: 'success',
  consult: 'warning',
}

const statusLabelKeys: Record<CaseStatus, string> = {
  draft: 'mercatify.cases.status.draft',
  new: 'mercatify.requests.status.received',
  mapping: 'mercatify.requests.status.inReview',
  mapped: 'mercatify.requests.status.inReview',
  sent: 'mercatify.requests.status.reportReady',
  accepted: 'mercatify.requests.status.accepted',
  consult: 'mercatify.requests.status.consult',
}

const turnVariants: StatusMap<WhoseTurn> = {
  mercatify: 'info',
  client: 'warning',
}

function isKnownStatus(value: string): value is CaseStatus {
  return value in statusLabelKeys
}

function isWhoseTurn(value: string): value is WhoseTurn {
  return value === 'mercatify' || value === 'client'
}

export default function RequestsTable() {
  const t = useT()
  const router = useRouter()
  const [page, setPage] = React.useState(1)

  const columns = React.useMemo<ColumnDef<RequestRow>[]>(() => [
    { accessorKey: 'title', header: t('mercatify.requests.table.column.title'), meta: { priority: 1 } },
    {
      accessorKey: 'status',
      header: t('mercatify.requests.table.column.status'),
      meta: { priority: 2 },
      cell: ({ getValue }) => {
        const raw = String(getValue() ?? '')
        if (!isKnownStatus(raw)) return <span className="text-muted-foreground">—</span>
        return <StatusBadge variant={statusVariants[raw]} dot>{t(statusLabelKeys[raw])}</StatusBadge>
      },
    },
    {
      accessorKey: 'whoseTurn',
      header: t('mercatify.requests.table.column.whoseTurn'),
      meta: { priority: 2 },
      cell: ({ getValue }) => {
        const raw = String(getValue() ?? '')
        if (!isWhoseTurn(raw)) return <span className="text-muted-foreground">—</span>
        return (
          <StatusBadge variant={turnVariants[raw]} dot>
            {t(raw === 'client' ? 'mercatify.requests.turn.client' : 'mercatify.requests.turn.mercatify')}
          </StatusBadge>
        )
      },
    },
    {
      accessorKey: 'submittedAt',
      header: t('mercatify.requests.table.column.submittedAt'),
      meta: { priority: 3 },
      cell: ({ getValue }) => {
        const formatted = formatDate(getValue() as string | null)
        return <span>{formatted ?? '—'}</span>
      },
    },
  ], [t])

  const { data, isLoading, error } = useQuery({
    queryKey: ['mercatify-requests', page],
    queryFn: async () => fetchCrudList<RequestRow>('mercatify/cases', { page, pageSize: PAGE_SIZE, mine: true }),
  })

  if (error) {
    const status = (error as { status?: number }).status
    const message = status === 401 || status === 403
      ? t('mercatify.requests.table.error.forbidden')
      : t('mercatify.requests.table.error.generic')
    return (
      <Alert status="error">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    )
  }

  return (
    <DataTable
      title={t('mercatify.requests.table.title')}
      columns={columns}
      data={data?.items ?? []}
      entityId={ENTITY_ID}
      extensionTableId={`${ENTITY_ID}:requests`}
      isLoading={isLoading}
      actions={(
        <Button asChild>
          <Link href="/backend/cases/create">{t('mercatify.requests.table.actions.create')}</Link>
        </Button>
      )}
      emptyState={(
        <EmptyState
          title={t('mercatify.requests.table.empty')}
          description={t('mercatify.requests.table.emptyDescription')}
        />
      )}
      rowActions={(row) => (
        <RowActions
          items={[
            { id: 'mercatify.requests.open', label: t('mercatify.requests.table.actions.open'), href: `/backend/requests/${row.id}` },
            // Only offered once the report is actually out — the route 404s
            // before that anyway, but a dead action is not an empty state.
            ...(isReportReadyStatus(row.status)
              ? [{
                id: 'mercatify.requests.openReport',
                label: t('mercatify.requests.table.actions.openReport'),
                href: `/backend/requests/${row.id}/report`,
              }]
              : []),
          ]}
        />
      )}
      onRowClick={(row) => router.push(`/backend/requests/${row.id}`)}
      pagination={{
        page,
        pageSize: PAGE_SIZE,
        total: data?.total ?? 0,
        totalPages: data?.totalPages ?? 0,
        onPageChange: setPage,
      }}
    />
  )
}
