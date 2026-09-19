"use client"
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterBar'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { requestCaps, requestMonthly } from '../lib/moduleMap'
import { REQUEST_STATUSES, REQUEST_STATUS_META, type RequestStatus } from '../lib/status'
import { refFor, adminRequestActions, type AdminRequestAction } from '../lib/ref'
import type { MercatifyClientResponse } from '../data/entities'

type RequestRow = {
  id: string
  company: string
  industry: string | null
  status: RequestStatus
  currency: string
  tools: { name: string; seats?: number | null; monthly?: number | null; caps: string[] }[]
  created_at: string | null
  owner_name: string | null
  client_response: MercatifyClientResponse | null
  jobs: number
  duplicates: number
  monthly: number
}

const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', PLN: 'zł' }
function money(n: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency] || ''
  const v = Math.round(n).toLocaleString('en-US')
  return currency === 'PLN' ? `${v} ${sym}` : `${sym}${v}`
}

const ACTION_LABEL_KEY: Record<AdminRequestAction['key'], [string, string]> = {
  map: ['mercatify.requests.table.action.map', 'Map'],
  continueMapping: ['mercatify.requests.table.action.continueMapping', 'Continue mapping'],
  buildReport: ['mercatify.requests.table.action.buildReport', 'Build report'],
  mapping: ['mercatify.requests.table.action.mapping', 'Mapping'],
  report: ['mercatify.requests.table.action.report', 'Report'],
}

export default function RequestsTable() {
  const t = useT()
  const router = useRouter()
  const [q, setQ] = React.useState('')
  const [filterValues, setFilterValues] = React.useState<FilterValues>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ['mercatify-requests'],
    queryFn: async () => fetchCrudList<Omit<RequestRow, 'jobs' | 'duplicates' | 'monthly'>>('mercatify/requests', {
      page: 1, pageSize: 100, sortField: 'created_at', sortDir: 'desc',
    }),
  })

  const allRows: RequestRow[] = React.useMemo(() => {
    return (data?.items ?? []).map((item) => {
      const caps = requestCaps(item.tools)
      return {
        ...item,
        jobs: caps.length,
        duplicates: caps.filter((c) => c.duplicate).length,
        monthly: requestMonthly(item.tools),
      }
    })
  }, [data?.items])

  const statusFilter = typeof filterValues.status === 'string' ? filterValues.status : ''
  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    return allRows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false
      if (!needle) return true
      const haystack = [refFor(r.id), r.company, r.industry || '', ...r.tools.map((x) => x.name)]
        .join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }, [allRows, q, statusFilter])

  const stats = React.useMemo(() => {
    const byStatus = (s: RequestStatus) => allRows.filter((r) => r.status === s).length
    const accepted = byStatus('accepted')
    const consult = byStatus('consult')
    const declaredMonthly = allRows.reduce((s, r) => s + r.monthly, 0)
    return {
      new: byStatus('new'),
      mapping: byStatus('mapping'),
      sent: byStatus('sent'),
      accepted, consult,
      answered: accepted + consult,
      declaredMonthly,
    }
  }, [allRows])

  const newest = allRows[0]
  const newestAction = newest ? adminRequestActions(newest)[0] : null

  const filters: FilterDef[] = [
    {
      id: 'status',
      label: t('mercatify.requests.table.filter.status', 'Status'),
      type: 'select',
      options: REQUEST_STATUSES.map((s) => ({ value: s, label: t(`mercatify.status.${s}`, s) })),
    },
  ]

  const columns: ColumnDef<RequestRow>[] = [
    {
      accessorKey: 'id',
      header: t('mercatify.requests.table.column.ref', 'Ref'),
      enableSorting: false,
      cell: ({ row }) => (
        <Link href={`/backend/mercatify-requests/${row.original.id}`} className="font-mono text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {refFor(row.original.id)}
        </Link>
      ),
      meta: { priority: 0 },
    },
    {
      accessorKey: 'company',
      header: t('mercatify.requests.table.column.company', 'Company'),
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.company}</div>
          <div className="text-xs text-muted-foreground">{row.original.industry || '—'}</div>
        </div>
      ),
      meta: { priority: 1 },
    },
    {
      accessorKey: 'tools',
      header: t('mercatify.requests.table.column.tools', 'Tools'),
      enableSorting: false,
      cell: ({ getValue }) => {
        const tools = (getValue() as RequestRow['tools']) || []
        const names = tools.map((x) => x.name)
        return (
          <div>
            <div>{names.slice(0, 3).join(', ')}{names.length > 3 ? ` +${names.length - 3}` : ''}</div>
            <div className="text-xs text-muted-foreground">{t('mercatify.requests.table.toolsCount', '{count} tools', { count: names.length })}</div>
          </div>
        )
      },
      meta: { priority: 2 },
    },
    { accessorKey: 'jobs', header: t('mercatify.requests.table.column.jobs', 'Jobs'), meta: { priority: 3 } },
    {
      accessorKey: 'duplicates',
      header: t('mercatify.requests.table.column.duplicates', 'Paid twice'),
      cell: ({ getValue }) => {
        const n = Number(getValue() || 0)
        return n ? <StatusBadge variant="warning">{n}</StatusBadge> : <span className="text-muted-foreground">0</span>
      },
      meta: { priority: 4 },
    },
    {
      accessorKey: 'monthly',
      header: t('mercatify.requests.table.column.monthly', 'Monthly'),
      cell: ({ row }) => money(row.original.monthly, row.original.currency),
      meta: { priority: 5 },
    },
    {
      accessorKey: 'created_at',
      header: t('mercatify.requests.table.column.received', 'Received'),
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ? new Date(v).toLocaleDateString() : '—'
      },
      meta: { priority: 6 },
    },
    {
      accessorKey: 'status',
      header: t('mercatify.requests.table.column.status', 'Status'),
      cell: ({ row }) => {
        const r = row.original
        const meta = REQUEST_STATUS_META[r.status]
        const sub = r.client_response
          ? (r.client_response.kind === 'accepted'
            ? t('mercatify.requests.table.sub.clientAccepted', 'client accepted')
            : t('mercatify.requests.table.sub.clientWantsCall', 'client wants a call'))
          : (r.owner_name
            ? t('mercatify.requests.table.sub.owner', 'owner: {name}', { name: r.owner_name })
            : t('mercatify.requests.table.sub.unassigned', 'unassigned'))
        return (
          <div className="space-y-0.5">
            <StatusBadge variant={meta.badge} dot>{t(`mercatify.status.${r.status}`, r.status)}</StatusBadge>
            <div className="text-xs text-muted-foreground">{sub}</div>
          </div>
        )
      },
      meta: { priority: 7 },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          {adminRequestActions(row.original).map((action) => {
            const [key, fallback] = ACTION_LABEL_KEY[action.key]
            return (
              <Button
                key={action.key}
                asChild
                size="sm"
                variant={action.primary ? 'default' : 'outline'}
                onClick={(e) => e.stopPropagation()}
              >
                <Link href={action.href}>{t(key, fallback)}</Link>
              </Button>
            )
          })}
        </div>
      ),
      meta: { priority: 8 },
    },
  ]

  if (error) {
    return <div className="text-sm text-destructive">{t('mercatify.requests.table.error.generic', 'Failed to load stack requests.')}</div>
  }

  return (
    <>
      <PageHeader
        title={t('mercatify.requests.page.title', 'Stack requests')}
        description={t('mercatify.requests.page.description', 'Everything a client has sent from the intake form. Open one to see which Open Mercato modules pick the work up.')}
        actions={newest && newestAction ? (
          <Button asChild>
            <Link href={newestAction.href}>
              {t('mercatify.requests.pickupNewest', '{label} — {ref}', {
                label: t(...ACTION_LABEL_KEY[newestAction.key]),
                ref: refFor(newest.id),
              })}
            </Link>
          </Button>
        ) : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-5">
        <Stat label={t('mercatify.requests.stat.new', 'New')} value={String(stats.new)} sub={t('mercatify.requests.stat.new.sub', 'waiting to be mapped')} />
        <Stat label={t('mercatify.requests.stat.mapping', 'In mapping')} value={String(stats.mapping)} sub={t('mercatify.requests.stat.mapping.sub', 'picked up by a consultant')} />
        <Stat label={t('mercatify.requests.stat.sent', 'With the client')} value={String(stats.sent)} sub={t('mercatify.requests.stat.sent.sub', 'report sent, awaiting an answer')} />
        <Stat
          label={t('mercatify.requests.stat.answered', 'Answered')}
          value={String(stats.answered)}
          sub={t('mercatify.requests.stat.answered.sub', '{accepted} accepted, {consult} want a call', { accepted: stats.accepted, consult: stats.consult })}
        />
        <Stat
          label={t('mercatify.requests.stat.money', 'Licences under review')}
          value={`${money(stats.declaredMonthly, 'EUR')}*`}
          sub={t('mercatify.requests.stat.money.sub', 'per month, as declared')}
        />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        entityId="mercatify:mercatify_request"
        isLoading={isLoading}
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder={t('mercatify.requests.table.searchPlaceholder', 'Filter by company, ref or tool…')}
        filters={filters}
        filterValues={filterValues}
        onFiltersApply={setFilterValues}
        onRowClick={(row) => router.push(adminRequestActions(row)[0].href)}
      />
      <p className="text-xs text-muted-foreground">
        {t('mercatify.requests.table.footnote', '*declared licence spend, mixed currencies shown as entered')}
      </p>
    </>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}
