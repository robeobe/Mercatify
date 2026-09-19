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

const ENTITY_ID = 'mercatify:interview_case'
const PAGE_SIZE = 50

type CaseStatus = 'draft' | 'new' | 'mapping' | 'mapped' | 'sent' | 'accepted' | 'consult'

type CaseRow = {
  id: string
  title: string
  status: string
  updatedAt: string | null
}

const statusVariants: StatusMap<CaseStatus> = {
  draft: 'neutral',
  new: 'info',
  mapping: 'info',
  mapped: 'info',
  sent: 'success',
  accepted: 'success',
  consult: 'warning',
}

const statusLabelKeys: Record<CaseStatus, string> = {
  draft: 'mercatify.cases.status.draft',
  new: 'mercatify.cases.status.new',
  mapping: 'mercatify.cases.status.mapping',
  mapped: 'mercatify.cases.status.mapped',
  sent: 'mercatify.cases.status.sent',
  accepted: 'mercatify.cases.status.accepted',
  consult: 'mercatify.cases.status.consult',
}

function isKnownStatus(value: string): value is CaseStatus {
  return value in statusLabelKeys
}

export default function CasesTable() {
  const t = useT()
  const router = useRouter()
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
      actions={(
        <Button asChild>
          <Link href="/backend/cases/create">{t('mercatify.cases.table.actions.create')}</Link>
        </Button>
      )}
      emptyState={(
        <EmptyState
          title={t('mercatify.cases.table.empty')}
          description={t('mercatify.cases.table.emptyDescription')}
        />
      )}
      rowActions={(row) => (
        <RowActions
          items={[
            { id: 'mercatify.cases.open', label: t('mercatify.cases.table.actions.open'), href: `/backend/cases/${row.id}` },
            { id: 'mercatify.cases.viewMapping', label: t('mercatify.cases.table.actions.viewMapping'), href: `/backend/cases/${row.id}/mapping` },
            { id: 'mercatify.cases.viewHandoff', label: t('mercatify.cases.table.actions.viewHandoff'), href: `/backend/cases/${row.id}/handoff` },
            { id: 'mercatify.cases.buildReport', label: t('mercatify.cases.table.actions.buildReport'), href: `/backend/cases/${row.id}/report` },
          ]}
        />
      )}
      onRowClick={(row) => router.push(`/backend/cases/${row.id}`)}
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
