"use client"

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { PageHeader } from '@open-mercato/ui/backend/Page'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Input } from '@open-mercato/ui/primitives/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@open-mercato/ui/primitives/select'
import { StatusBadge, type StatusMap } from '@open-mercato/ui/primitives/status-badge'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { formatDate } from '@open-mercato/ui/utils/format'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  caseMonthly,
  caseRef,
  caseReceivedAt,
  caseSeats,
  caseToolNames,
  filterQueueCases,
  formatQueueMoney,
  queuePrimaryAction,
  queueStats,
  submittedQueueCases,
  type QueueCase,
} from '../../lib/case-list-filters'
import { QueueStats, type QueueStatCard } from './QueueStats'

const ENTITY_ID = 'mercatify:interview_case'
/* One page, filtered in the browser: the toolbar answers instantly and the
   header figures describe the same rows the table is showing. */
const PAGE_SIZE = 100
const ALL_STATUSES = '__all__'

type QueueStatus = 'new' | 'mapping' | 'mapped' | 'sent' | 'accepted' | 'consult'

/* Staff-side vocabulary. The client sees different words for the same states —
   both lists live in assets/shared/om-core.js as one REQUEST_STATUS table. */
const STATUS_ORDER: QueueStatus[] = ['new', 'mapping', 'mapped', 'sent', 'accepted', 'consult']

const statusVariants: StatusMap<QueueStatus> = {
  new: 'info',
  mapping: 'warning',
  mapped: 'success',
  sent: 'info',
  accepted: 'success',
  consult: 'warning',
}

const statusLabelFallback: Record<QueueStatus, string> = {
  new: 'new',
  mapping: 'in mapping',
  mapped: 'mapped',
  sent: 'report sent',
  accepted: 'accepted',
  consult: 'consult asked',
}

const statusFilterFallback: Record<QueueStatus, string> = {
  new: 'New',
  mapping: 'In mapping',
  mapped: 'Mapped',
  sent: 'Report sent',
  accepted: 'Accepted',
  consult: 'Consult asked',
}

const actionLabelFallback: Record<ReturnType<typeof queuePrimaryAction>['key'], string> = {
  map: 'Map',
  continueMapping: 'Continue mapping',
  buildReport: 'Build report',
  report: 'Report',
  integrate: 'Integrate with Mercatify Lab',
}

function isQueueStatus(value: string): value is QueueStatus {
  return (STATUS_ORDER as string[]).includes(value)
}

export default function StackRequestsQueue() {
  const t = useT()
  const [text, setText] = React.useState('')
  const [status, setStatus] = React.useState<string>(ALL_STATUSES)

  const { data, isLoading, error } = useQuery({
    queryKey: ['mercatify-queue'],
    queryFn: async () => fetchCrudList<QueueCase>('mercatify/cases', { page: 1, pageSize: PAGE_SIZE }),
  })

  const all = React.useMemo(() => submittedQueueCases(data?.items ?? []), [data])
  const shown = React.useMemo(
    () => filterQueueCases(all, { text, status: status === ALL_STATUSES ? undefined : status }),
    [all, text, status],
  )
  const stats = React.useMemo(() => queueStats(all), [all])

  const cards: QueueStatCard[] = [
    {
      key: 'new',
      label: t('mercatify.queue.stats.new.label', 'New'),
      value: String(stats.newCount),
      sub: t('mercatify.queue.stats.new.sub', 'waiting to be mapped'),
    },
    {
      key: 'mapping',
      label: t('mercatify.queue.stats.mapping.label', 'In mapping'),
      value: String(stats.mappingCount),
      sub: t('mercatify.queue.stats.mapping.sub', 'picked up by a consultant'),
    },
    {
      key: 'sent',
      label: t('mercatify.queue.stats.sent.label', 'With the client'),
      value: String(stats.sentCount),
      sub: t('mercatify.queue.stats.sent.sub', 'report sent, awaiting an answer'),
    },
    {
      key: 'answered',
      label: t('mercatify.queue.stats.answered.label', 'Answered'),
      value: String(stats.answeredCount),
      sub: t('mercatify.queue.stats.answered.sub', '{accepted} accepted, {consult} want a call', {
        accepted: stats.acceptedCount,
        consult: stats.consultCount,
      }),
    },
    {
      key: 'money',
      label: t('mercatify.queue.stats.money.label', 'Licences under review'),
      value: formatQueueMoney(stats.monthlyTotal, stats.currency),
      sub: t('mercatify.queue.stats.money.sub', 'per month, as declared'),
    },
  ]

  const columns = React.useMemo<ColumnDef<QueueCase>[]>(() => [
    {
      id: 'ref',
      header: t('mercatify.queue.column.ref', 'Ref'),
      meta: { priority: 1, truncate: false },
      cell: ({ row }) => (
        /* The ref opens wherever the row's own primary action leads. */
        <Link
          href={queuePrimaryAction(row.original).href}
          className="font-mono font-medium whitespace-nowrap hover:underline"
        >
          {caseRef(row.original.id)}
        </Link>
      ),
    },
    {
      id: 'company',
      header: t('mercatify.queue.column.company', 'Company'),
      meta: { priority: 1, truncate: false },
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.companyName || '—'}</div>
          <div className="text-xs text-muted-foreground">{row.original.industry || '—'}</div>
        </div>
      ),
    },
    {
      id: 'tools',
      header: t('mercatify.queue.column.tools', 'Tools'),
      meta: { priority: 2, truncate: false },
      cell: ({ row }) => {
        const names = caseToolNames(row.original)
        const head = names.slice(0, 3).join(', ')
        const rest = names.length > 3 ? ` +${names.length - 3}` : ''
        return (
          <div>
            <div>{names.length ? `${head}${rest}` : '—'}</div>
            <div className="text-xs text-muted-foreground">
              {t('mercatify.queue.tools.summary', '{tools} tools, {seats} seats', {
                tools: names.length,
                seats: caseSeats(row.original),
              })}
            </div>
          </div>
        )
      },
    },
    {
      id: 'monthly',
      header: t('mercatify.queue.column.monthly', 'Monthly'),
      meta: { priority: 2, align: 'right', truncate: false },
      cell: ({ row }) => (
        <div className="text-right tabular-nums whitespace-nowrap">
          {formatQueueMoney(caseMonthly(row.original), row.original.currency)}
        </div>
      ),
    },
    {
      id: 'received',
      header: t('mercatify.queue.column.received', 'Received'),
      meta: { priority: 3, truncate: false },
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{formatDate(caseReceivedAt(row.original)) ?? '—'}</span>
      ),
    },
    {
      id: 'status',
      header: t('mercatify.queue.column.status', 'Status'),
      meta: { priority: 1, truncate: false },
      cell: ({ row }) => {
        const raw = String(row.original.status)
        if (!isQueueStatus(raw)) return <span className="text-muted-foreground">—</span>
        const answered = raw === 'accepted' || raw === 'consult'
        return (
          <div>
            <StatusBadge variant={statusVariants[raw]} dot className="whitespace-nowrap">
              {t(`mercatify.queue.status.${raw}`, statusLabelFallback[raw])}
            </StatusBadge>
            {answered ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {raw === 'accepted'
                  ? t('mercatify.queue.answer.accepted', 'client accepted')
                  : t('mercatify.queue.answer.consult', 'client wants a call')}
              </div>
            ) : null}
          </div>
        )
      },
    },
    {
      /* One action per row, chosen by where the request actually is. A new
         request cannot be reported on, and a sent one is not re-mapped from the
         queue — that is a deliberate step taken inside it. Only the accepted row
         is filled: integrating with the Lab is the one thing the queue is
         actually asking somebody to do.

         It is a column rather than DataTable's `rowActions` slot because the
         mockup leaves the header blank, and that slot always labels itself
         "Actions". */
      id: 'action',
      header: '',
      meta: { priority: 1, align: 'right', truncate: false },
      cell: ({ row }) => {
        const action = queuePrimaryAction(row.original)
        return (
          <div className="flex justify-end">
            <Button asChild size="sm" variant={action.filled ? 'default' : 'outline'}>
              <Link href={action.href} className="whitespace-nowrap">
                {t(`mercatify.queue.action.${action.key}`, actionLabelFallback[action.key])}
              </Link>
            </Button>
          </div>
        )
      },
    },
  ], [t])

  /* The pagehead's own shortcut points at the first row's action, labelled with
     it, so the queue always names the next thing to pick up instead of a verb
     that may not apply. */
  const newest = all[0]
  const newestAction = newest ? queuePrimaryAction(newest) : null
  const pagehead = (
    <PageHeader
      title={t('mercatify.queue.page.title', 'Stack requests')}
      description={t(
        'mercatify.queue.page.description',
        'Everything a client has sent from the intake form. One row per company; open it to see which Open Mercato modules pick the work up.',
      )}
      actions={newest && newestAction ? (
        <Button asChild variant="outline">
          <Link href={newestAction.href}>
            {`${t(`mercatify.queue.action.${newestAction.key}`, actionLabelFallback[newestAction.key])} — ${caseRef(newest.id)}`}
          </Link>
        </Button>
      ) : undefined}
    />
  )

  if (error) {
    const httpStatus = (error as { status?: number }).status
    const message = httpStatus === 401 || httpStatus === 403
      ? t('mercatify.queue.error.forbidden', 'You do not have permission to view the request queue.')
      : t('mercatify.queue.error.generic', 'Unable to load the request queue. Please try again.')
    return (
      <div className="space-y-4">
        {pagehead}
        <Alert status="error">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  /* Handed to DataTable as its `title` rather than its `toolbar`: the toolbar
     slot renders below an empty title row, and the mockup's table starts with
     the filter line. */
  const toolbar = (
    <div className="flex w-full flex-wrap items-center gap-2 font-normal">
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('mercatify.queue.toolbar.search', 'Filter by company, ref or tool…')}
        aria-label={t('mercatify.queue.toolbar.searchLabel', 'Filter requests')}
        className="h-8 max-w-xs"
      />
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="h-8 w-auto" aria-label={t('mercatify.queue.toolbar.statusLabel', 'Status')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STATUSES}>{t('mercatify.queue.toolbar.allStatuses', 'All statuses')}</SelectItem>
          {STATUS_ORDER.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`mercatify.queue.filter.${value}`, statusFilterFallback[value])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="ml-auto text-xs text-muted-foreground">
        {t('mercatify.queue.toolbar.count', '{shown} of {total}', { shown: shown.length, total: all.length })}
      </span>
    </div>
  )

  return (
    <div className="space-y-4">
      {pagehead}
      <QueueStats cards={cards} />
      <div>
        <DataTable
          columns={columns}
          data={shown}
          entityId={ENTITY_ID}
          extensionTableId={`${ENTITY_ID}:queue`}
          isLoading={isLoading}
          title={toolbar}
          exporter={false}
          sortable={false}
          emptyState={(
            <EmptyState title={t('mercatify.queue.empty', 'No request matches that filter.')} />
          )}
        />
        <div className="mt-2 px-1 text-xs text-muted-foreground">
          {t('mercatify.queue.footer', 'Showing {count} requests', { count: shown.length })}
        </div>
      </div>
    </div>
  )
}
