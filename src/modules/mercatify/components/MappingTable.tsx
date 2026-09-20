"use client"
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusMap } from '@open-mercato/ui/primitives/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@open-mercato/ui/primitives/table'
import { Tag, type TagMap } from '@open-mercato/ui/primitives/tag'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import EditMappingRowDialog from './EditMappingRowDialog'
import {
  CaseContextCard,
  ConsolePageHead,
  StatCard,
  StatGrid,
  StickyActionBar,
} from './console/ConsoleParts'
import { canBuildReport, isReportSent, type ConsoleCaseDto } from './console/case'

const PAGE_SIZE = 100

export type MercatifyDecision = 'native' | 'configure' | 'build' | 'integrate' | 'keep'
export type MercatifyConfidence = 'high' | 'medium' | 'low'

export type MappingRowDto = {
  id: string
  caseId: string
  position: number
  capability: string
  /** The SaaS product this job is paid for in. Absent from the list route today — see `sourceQuery`. */
  source?: string | null
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

/** Verdict colours from `om.css`: native lime, configure violet, build yellow. */
export const decisionTagMap: TagMap<MercatifyDecision> = {
  native: 'success',
  configure: 'brand',
  build: 'warning',
  integrate: 'neutral',
  keep: 'neutral',
}

export const confidenceVariants: StatusMap<MercatifyConfidence> = {
  high: 'success',
  medium: 'warning',
  low: 'neutral',
}

/** Decisions that mean "Open Mercato already does this job", as the report counts them. */
const COVERED: readonly string[] = ['native', 'configure']

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString()
}

/**
 * S-08 / `assets/console/modules.html`: the consultant's pass over the agent's
 * mapping. Every verdict on this screen is editable until somebody confirms
 * it; after that the table is read-only and the report opens.
 */
export default function MappingTable({ caseId, children }: { caseId: string; children?: React.ReactNode }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [editingRow, setEditingRow] = React.useState<MappingRowDto | null>(null)
  const generatedOnceRef = React.useRef(false)
  const [busy, setBusy] = React.useState(false)

  const generateMutation = useGuardedMutation({ contextId: 'mercatify-mapping-generate' })
  const confirmMutation = useGuardedMutation({ contextId: 'mercatify-mapping-confirm' })

  const caseQueryKey = React.useMemo(() => ['mercatify-mapping-case', caseId] as const, [caseId])
  const rowsQueryKey = React.useMemo(() => ['mercatify-mapping-rows', caseId] as const, [caseId])

  const caseQuery = useQuery({
    queryKey: caseQueryKey,
    queryFn: async () => fetchCrudList<ConsoleCaseDto>('mercatify/cases', { ids: caseId, pageSize: 1 }),
  })
  const mercatifyCase = caseQuery.data?.items?.[0] ?? null
  const isConfirmed = canBuildReport(mercatifyCase)
  const sent = isReportSent(mercatifyCase?.status)

  const rowsQuery = useQuery({
    queryKey: rowsQueryKey,
    queryFn: async () => fetchCrudList<MappingRowDto>('mercatify/mapping-rows', {
      caseId,
      pageSize: PAGE_SIZE,
      sortField: 'position',
      sortDir: 'asc',
    }),
  })
  const rows = rowsQuery.data?.items ?? []

  // "Paid for in" needs `MappingRow.source`, which the mapping-rows list route
  // does not return yet (that route belongs to another slice). The report
  // derivation carries the same rows WITH their source, so the column is filled
  // from there until the list route exposes it — at which point `row.source`
  // below wins and this lookup is simply unused.
  const sourceQuery = useQuery({
    queryKey: ['mercatify-mapping-sources', caseId],
    queryFn: async () => readApiResultOrThrow<{ derivation: { rows: { id: string; source: string }[] } }>(
      `/api/mercatify/cases/report?caseId=${encodeURIComponent(caseId)}`,
    ),
  })
  const sourceById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const row of sourceQuery.data?.derivation?.rows ?? []) map.set(row.id, row.source)
    return map
  }, [sourceQuery.data])

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
      queryClient.invalidateQueries({ queryKey: rowsQueryKey })
      queryClient.invalidateQueries({ queryKey: caseQueryKey })
    }).catch(() => {
      flash(t('mercatify.mapping.table.error.generateFailed'), 'error')
    })
  }, [caseId, caseQueryKey, generateMutation, queryClient, rows.length, rowsQuery.error, rowsQuery.isLoading, rowsQueryKey, t])

  // The four stat cards read exactly the numbers the table below shows, so a
  // corrected row moves the counters with it.
  const stats = React.useMemo(() => {
    const modules = new Set(rows.map((row) => row.targetModuleId).filter((id): id is string => Boolean(id)))
    const covered = rows.filter((row) => COVERED.includes(row.decision)).length
    return {
      capabilities: rows.length,
      toolCount: mercatifyCase?.tools?.length ?? 0,
      modules: modules.size,
      covered,
      coveredPct: rows.length > 0 ? Math.round((covered / rows.length) * 100) : null,
      build: rows.filter((row) => row.decision === 'build').length,
    }
  }, [mercatifyCase, rows])

  const onConfirmMapping = React.useCallback(async () => {
    setBusy(true)
    try {
      await confirmMutation.runMutation({
        context: { caseId },
        operation: () => apiCallOrThrow('/api/mercatify/mapping-rows/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ caseId }),
        }),
      })
      flash(t('mercatify.console.mapping.flash.confirmed', 'Mapping confirmed. You can build the report now.'), 'success')
      await queryClient.invalidateQueries({ queryKey: caseQueryKey })
    } catch {
      flash(t('mercatify.mapping.table.error.confirmFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }, [caseId, caseQueryKey, confirmMutation, queryClient, t])

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

  const reportLabel = sent
    ? t('mercatify.console.mapping.actions.openReport', 'Open the report →')
    : t('mercatify.console.mapping.actions.buildReport', 'Build the report →')

  return (
    <>
      <ConsolePageHead
        title={t('mercatify.console.mapping.title', 'Module coverage')}
        lead={t(
          'mercatify.console.mapping.lead',
          'Which Open Mercato modules pick up the work in an incoming request, and what is left over. Verdicts come from the capability map — they are a first pass a consultant confirms, not a promise.',
        )}
        actions={(
          <>
            <Button asChild variant="outline">
              <Link href="/backend/cases">{t('mercatify.console.actions.backToQueue', 'Back to queue')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/backend/cases/${caseId}/handoff`}>
                {t('mercatify.console.actions.handoffDocument', 'Handoff document')}
              </Link>
            </Button>
            {isConfirmed ? (
              <Button asChild>
                <Link href={`/backend/cases/${caseId}/report`}>{reportLabel}</Link>
              </Button>
            ) : (
              /* An anchor cannot be disabled, so the inert button says why. */
              <Button type="button" disabled title={t('mercatify.console.mapping.actions.confirmFirst', 'Confirm the mapping first')}>
                {reportLabel}
              </Button>
            )}
          </>
        )}
      />

      {mercatifyCase ? <CaseContextCard mercatifyCase={mercatifyCase} /> : null}

      <StatGrid>
        <StatCard
          label={t('mercatify.console.mapping.stat.jobs', 'Jobs to place')}
          value={stats.capabilities}
          sub={t('mercatify.console.mapping.stat.jobsSub', 'from {count} tools', { count: stats.toolCount })}
        />
        <StatCard
          label={t('mercatify.console.mapping.stat.modules', 'Modules involved')}
          value={stats.modules}
          sub={t('mercatify.console.mapping.stat.modulesSub', 'already installed')}
        />
        <StatCard
          label={t('mercatify.console.mapping.stat.covered', 'Native or configure')}
          value={stats.covered}
          sub={stats.coveredPct != null
            ? t('mercatify.console.mapping.stat.coveredSub', '{pct}% of the jobs', { pct: stats.coveredPct })
            : '—'}
        />
        <StatCard
          label={t('mercatify.console.mapping.stat.build', 'To build')}
          value={stats.build}
          sub={t('mercatify.console.mapping.stat.buildSub', 'goes on the estimate')}
        />
      </StatGrid>

      {/* The hint points at an Edit button that a confirmed mapping no longer
          has, so it gives way to the locked notice rather than sitting above it. */}
      {!isConfirmed ? (
        <Alert status="information" className="mb-3">
          <AlertTitle>{t('mercatify.console.mapping.hint.title.lab', "This is Mercatify Lab's first pass, not a verdict.")}</AlertTitle>
          <AlertDescription>
            {t(
              'mercatify.console.mapping.hint.body.lab',
              'Click Edit on any job below to change which module takes it over and how hard it is. The report is built from whatever you leave here.',
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      {isConfirmed ? (
        <Alert status="warning" className="mb-3" data-testid="mercatify-mapping-locked">
          <AlertTitle>
            {sent
              ? t('mercatify.console.mapping.locked.sentTitle', 'This mapping went out to the client.')
              : t('mercatify.console.mapping.locked.title', 'This mapping is closed.')}
          </AlertTitle>
          <AlertDescription>
            {sent
              ? t('mercatify.console.mapping.locked.sentBody', 'The report was sent on {date}.', {
                date: formatDate(mercatifyCase?.updatedAt),
              })
              : t('mercatify.console.mapping.locked.body', 'Confirmed on {date}.', {
                date: formatDate(mercatifyCase?.mappingConfirmedAt),
              })}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('mercatify.console.mapping.column.job', 'Job the client pays for')}</TableHead>
                <TableHead scope="col">{t('mercatify.console.mapping.column.source', 'Paid for in')}</TableHead>
                <TableHead scope="col">{t('mercatify.console.mapping.column.target', 'Lands in')}</TableHead>
                <TableHead scope="col">{t('mercatify.console.mapping.column.verdict', 'Verdict')}</TableHead>
                <TableHead scope="col">{t('mercatify.console.mapping.column.confidence', 'Confidence')}</TableHead>
                <TableHead scope="col">{t('mercatify.console.mapping.column.note', 'Note for the report')}</TableHead>
                <TableHead scope="col" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    {rowsQuery.isLoading || caseQuery.isLoading
                      ? t('mercatify.console.mapping.loading', 'Reading the stack…')
                      : t('mercatify.mapping.table.empty')}
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="align-top font-medium">{row.capability}</TableCell>
                  <TableCell className="align-top">{row.source || sourceById.get(row.id) || '—'}</TableCell>
                  <TableCell className="align-top">
                    <div>{row.targetLabel ?? '—'}</div>
                    {row.targetModuleId ? (
                      <div className="font-mono text-xs text-muted-foreground">modules/{row.targetModuleId}</div>
                    ) : null}
                    {/* A flag is context for the consultant, not a red error pill. */}
                    {row.flagged ? (
                      <div className="text-xs text-muted-foreground">
                        {row.flagReason === 'module_not_enabled'
                          ? t('mercatify.mapping.table.flag.moduleNotEnabled', { module: row.targetModuleId ?? '' })
                          : t('mercatify.mapping.table.flag.unmapped')}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <Tag variant={decisionTagMap[row.decision]}>{t(`mercatify.mapping.decision.${row.decision}`)}</Tag>
                  </TableCell>
                  <TableCell className="align-top">
                    <StatusBadge variant={confidenceVariants[row.confidence]} dot>
                      {t(`mercatify.mapping.confidence.${row.confidence}`)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="max-w-xs align-top whitespace-normal text-sm text-muted-foreground">
                    {row.justification}
                  </TableCell>
                  <TableCell className="align-top">
                    {isConfirmed ? null : (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingRow(row)}>
                        {t('mercatify.mapping.table.actions.edit')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>
            {t('mercatify.console.mapping.foot', '{capabilities} capabilities across {tools} tools', {
              capabilities: stats.capabilities,
              tools: stats.toolCount,
            })}
          </span>
        </div>
      </div>

      {/* The savings card rides under the table: it is how the two cost inputs
          the report's cash curve needs get entered today. */}
      {children ? <div className="mt-4">{children}</div> : null}

      {!isConfirmed ? (
        <StickyActionBar text={t('mercatify.console.mapping.bar.state', 'Changes save as you make them.')}>
          <Button
            type="button"
            onClick={() => void onConfirmMapping()}
            disabled={busy || rows.length === 0 || rowsQuery.isLoading}
          >
            {t('mercatify.mapping.actions.confirm')}
          </Button>
        </StickyActionBar>
      ) : null}

      <EditMappingRowDialog
        open={editingRow != null}
        onOpenChange={(next) => { if (!next) setEditingRow(null) }}
        row={editingRow}
        onSaved={() => {
          flash(t('mercatify.mapping.flash.rowSaved'), 'success')
          queryClient.invalidateQueries({ queryKey: rowsQueryKey })
        }}
      />
    </>
  )
}
