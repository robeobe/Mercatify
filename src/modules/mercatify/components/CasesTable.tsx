"use client"
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { StatusBadge, type StatusMap } from '@open-mercato/ui/primitives/status-badge'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { formatDate } from '@open-mercato/ui/utils/format'
import { useT } from '@open-mercato/shared/lib/i18n/context'

const ENTITY_ID = 'mercatify:interview_case'
const PAGE_SIZE = 50

type CaseStatus = 'draft' | 'in_progress' | 'completed'

type CaseRow = {
  id: string
  title: string
  status: string
  updatedAt: string | null
}

const statusVariants: StatusMap<CaseStatus> = {
  draft: 'neutral',
  in_progress: 'info',
  completed: 'success',
}

const statusLabelKeys: Record<CaseStatus, string> = {
  draft: 'mercatify.cases.status.draft',
  in_progress: 'mercatify.cases.status.inProgress',
  completed: 'mercatify.cases.status.completed',
}

function isKnownStatus(value: string): value is CaseStatus {
  return value === 'draft' || value === 'in_progress' || value === 'completed'
}

export default function CasesTable() {
  const t = useT()
  const [page, setPage] = React.useState(1)

  const columns = React.useMemo<ColumnDef<CaseRow>[]>(() => [
    { accessorKey: 'title', header: t('mercatify.cases.table.column.title'), meta: { priority: 1 } },
    {
      accessorKey: 'status',
      header: t('mercatify.cases.table.column.status'),
      meta: { priority: 2 },
      cell: ({ getValue }) => {
        const raw = String(getValue() ?? '')
        if (!isKnownStatus(raw)) return <span className="text-muted-foreground">—</span>
        return <StatusBadge variant={statusVariants[raw]} dot>{t(statusLabelKeys[raw])}</StatusBadge>
      },
    },
    {
      accessorKey: 'updatedAt',
      header: t('mercatify.cases.table.column.updatedAt'),
      meta: { priority: 3 },
      cell: ({ getValue }) => {
        const formatted = formatDate(getValue() as string | null)
        return <span>{formatted ?? '—'}</span>
      },
    },
  ], [t])

  const { data, isLoading, error } = useQuery({
    queryKey: ['mercatify-cases', page],
    queryFn: async () => fetchCrudList<CaseRow>('mercatify/cases', { page, pageSize: PAGE_SIZE }),
  })

  if (error) {
    const status = (error as { status?: number }).status
    const message = status === 401 || status === 403
      ? t('mercatify.cases.table.error.forbidden')
      : t('mercatify.cases.table.error.generic')
    return (
      <Alert status="error">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    )
  }

  return (
    <DataTable
      title={t('mercatify.cases.table.title')}
      columns={columns}
      data={data?.items ?? []}
      entityId={ENTITY_ID}
      extensionTableId={ENTITY_ID}
      isLoading={isLoading}
      emptyState={(
        <EmptyState
          title={t('mercatify.cases.table.empty')}
          description={t('mercatify.cases.table.emptyDescription')}
        />
      )}
      rowActions={(row) => (
        <RowActions
          items={[
            { label: t('mercatify.cases.table.actions.viewMapping'), href: `/backend/cases/${row.id}/mapping` },
          ]}
        />
      )}
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
