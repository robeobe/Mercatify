"use client"
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { StatusBadge, type StatusMap } from '@open-mercato/ui/primitives/status-badge'
import { Tag, type TagMap } from '@open-mercato/ui/primitives/tag'
import { Button } from '@open-mercato/ui/primitives/button'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import Link from 'next/link'
import EditMappingRowDialog from './EditMappingRowDialog'

const ENTITY_ID = 'mercatify:mapping_row'
const PAGE_SIZE = 100

export type MercatifyDecision = 'native' | 'configure' | 'build' | 'integrate' | 'keep'
export type MercatifyConfidence = 'high' | 'medium' | 'low'

export type MappingRowDto = {
  id: string
  caseId: string
  position: number
  capability: string
  decision: MercatifyDecision
  targetKind: 'om_module' | 'external_tool' | 'unmapped'
  targetModuleId: string | null
  targetToolName: string | null
  targetLabel: string | null
  justification: string
  confidence: MercatifyConfidence
  flagged: boolean
  flagReason: 'unmapped' | 'module_not_enabled' | null
  updatedAt: string | null
}

type CaseDto = {
  id: string
  title: string
  status: string
  mappingConfirmedAt?: string | null
}

const decisionTagMap: TagMap<MercatifyDecision> = {
  native: 'success',
  configure: 'info',
  build: 'brand',
  integrate: 'warning',
  keep: 'neutral',
}

const confidenceVariants: StatusMap<MercatifyConfidence> = {
  high: 'success',
  medium: 'warning',
  low: 'neutral',
}

export default function MappingTable({ caseId }: { caseId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [editingRow, setEditingRow] = React.useState<MappingRowDto | null>(null)
  const generatedOnceRef = React.useRef(false)

  const generateMutation = useGuardedMutation({ contextId: 'mercatify-mapping-generate' })
  const confirmMutation = useGuardedMutation({ contextId: 'mercatify-mapping-confirm' })

  const caseQuery = useQuery({
    queryKey: ['mercatify-mapping-case', caseId],
    queryFn: async () => fetchCrudList<CaseDto>('mercatify/cases', { ids: caseId, pageSize: 1 }),
  })
  const mercatifyCase = caseQuery.data?.items?.[0] ?? null
  const isConfirmed = Boolean(mercatifyCase?.mappingConfirmedAt)

  const rowsQuery = useQuery({
    queryKey: ['mercatify-mapping-rows', caseId],
    queryFn: async () => fetchCrudList<MappingRowDto>('mercatify/mapping-rows', {
      caseId,
      pageSize: PAGE_SIZE,
      sortField: 'position',
      sortDir: 'asc',
    }),
  })
  const rows = rowsQuery.data?.items ?? []

  // Auto-generate once, on the first visit to a case with no rows yet — the
  // admin sees the table already filled, with no manual "Run analysis" step.
  React.useEffect(() => {
    if (rowsQuery.isLoading || rowsQuery.error || generatedOnceRef.current) return
    if (rows.length > 0) return
    generatedOnceRef.current = true
    void generateMutation.runMutation({
      context: { caseId },
      operation: () => apiCallOrThrow('/api/mercatify/mapping-rows/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caseId }),
      }),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['mercatify-mapping-rows', caseId] })
    }).catch(() => {
      flash(t('mercatify.mapping.table.error.generateFailed'), 'error')
    })
  }, [caseId, generateMutation, queryClient, rows.length, rowsQuery.error, rowsQuery.isLoading, t])

  const columns = React.useMemo<ColumnDef<MappingRowDto>[]>(() => [
    { accessorKey: 'capability', header: t('mercatify.mapping.table.column.capability'), meta: { priority: 1 } },
    {
      accessorKey: 'targetLabel',
      header: t('mercatify.mapping.table.column.target'),
      meta: { priority: 2 },
      cell: ({ row }) => {
        const r = row.original
        if (r.flagged) {
          const message = r.flagReason === 'module_not_enabled'
            ? t('mercatify.mapping.table.flag.moduleNotEnabled', { module: r.targetModuleId ?? '' })
            : t('mercatify.mapping.table.flag.unmapped')
          return <Tag variant="error" dot>{message}</Tag>
        }
        return <span>{r.targetLabel ?? '—'}</span>
      },
    },
    {
      accessorKey: 'decision',
      header: t('mercatify.mapping.table.column.decision'),
      meta: { priority: 3 },
      cell: ({ getValue }) => {
        const value = getValue() as MercatifyDecision
        return <Tag variant={decisionTagMap[value]}>{t(`mercatify.mapping.decision.${value}`)}</Tag>
      },
    },
    {
      accessorKey: 'confidence',
      header: t('mercatify.mapping.table.column.confidence'),
      meta: { priority: 4 },
      cell: ({ getValue }) => {
        const value = getValue() as MercatifyConfidence
        return <StatusBadge variant={confidenceVariants[value]} dot>{t(`mercatify.mapping.confidence.${value}`)}</StatusBadge>
      },
    },
    {
      accessorKey: 'justification',
      header: t('mercatify.mapping.table.column.justification'),
      meta: { priority: 5, truncate: true, maxWidth: 320 },
    },
  ], [t])

  const onConfirmMapping = React.useCallback(async () => {
    const confirmed = await confirm({
      title: t('mercatify.mapping.confirmDialog.title'),
      text: t('mercatify.mapping.confirmDialog.description'),
      confirmText: t('mercatify.mapping.confirmDialog.confirm'),
    })
    if (!confirmed) return
    try {
      await confirmMutation.runMutation({
        context: { caseId },
        operation: () => apiCallOrThrow('/api/mercatify/mapping-rows/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ caseId }),
        }),
      })
      flash(t('mercatify.mapping.flash.confirmed'), 'success')
      queryClient.invalidateQueries({ queryKey: ['mercatify-mapping-case', caseId] })
    } catch {
      flash(t('mercatify.mapping.table.error.confirmFailed'), 'error')
    }
  }, [caseId, confirm, confirmMutation, queryClient, t])

  if (caseQuery.error || rowsQuery.error) {
    const status = (caseQuery.error as { status?: number })?.status ?? (rowsQuery.error as { status?: number })?.status
    const message = status === 401 || status === 403
      ? t('mercatify.mapping.table.error.forbidden')
      : t('mercatify.mapping.table.error.generic')
    return (
      <Alert status="error">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    )
  }

  return (
    <>
      <DataTable
        title={mercatifyCase?.title
          ? t('mercatify.mapping.table.titleWithCase', { case: mercatifyCase.title })
          : t('mercatify.mapping.table.title')}
        actions={(
          <>
            {isConfirmed ? (
              <>
                <Button asChild variant="outline">
                  <Link href={`/backend/cases/${caseId}/handoff`}>{t('mercatify.mapping.actions.viewHandoff')}</Link>
                </Button>
                {/* S-09: the report only opens once somebody has stood behind a mapping. */}
                <Button asChild variant="outline">
                  <Link href={`/backend/cases/${caseId}/report`}>{t('mercatify.mapping.actions.buildReport')}</Link>
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              onClick={() => void onConfirmMapping()}
              disabled={isConfirmed || rows.length === 0 || rowsQuery.isLoading}
            >
              {isConfirmed ? t('mercatify.mapping.actions.confirmed') : t('mercatify.mapping.actions.confirm')}
            </Button>
          </>
        )}
        columns={columns}
        data={rows}
        entityId={ENTITY_ID}
        extensionTableId={ENTITY_ID}
        isLoading={rowsQuery.isLoading || caseQuery.isLoading}
        emptyState={(
          <EmptyState
            title={t('mercatify.mapping.table.empty')}
            description={t('mercatify.mapping.table.emptyDescription')}
          />
        )}
        rowActions={isConfirmed ? undefined : (row) => (
          <RowActions
            items={[
              {
                label: t('mercatify.mapping.table.actions.edit'),
                onSelect: () => setEditingRow(row),
              },
            ]}
          />
        )}
      />
      <EditMappingRowDialog
        open={editingRow != null}
        onOpenChange={(next) => { if (!next) setEditingRow(null) }}
        row={editingRow}
        onSaved={() => {
          flash(t('mercatify.mapping.flash.rowSaved'), 'success')
          queryClient.invalidateQueries({ queryKey: ['mercatify-mapping-rows', caseId] })
        }}
      />
      {ConfirmDialogElement}
    </>
  )
}
