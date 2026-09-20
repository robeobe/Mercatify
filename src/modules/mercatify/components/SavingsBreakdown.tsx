"use client"
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { formatCurrency } from '@open-mercato/ui/utils/format'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import EditCaseCostsDialog from './EditCaseCostsDialog'

export type SavingsBreakdownDto = {
  omOperatingCost: number | null
  implementationCost: number | null
  currency: string | null
  caseUpdatedAt: string
  removedSaaS: string[]
  retainedSaaS: string[]
  grossAnnualSaving: number
  netAnnualSaving: number | null
  netPaybackMonths: number | null
}

export default function SavingsBreakdown({ caseId }: { caseId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [editingCosts, setEditingCosts] = React.useState(false)

  const queryKey = React.useMemo(() => ['mercatify-savings', caseId] as const, [caseId])

  const savingsQuery = useQuery({
    queryKey,
    queryFn: async () => readApiResultOrThrow<SavingsBreakdownDto>(
      `/api/mercatify/cases/savings?caseId=${encodeURIComponent(caseId)}`,
    ),
  })

  const data = savingsQuery.data

  if (savingsQuery.error) {
    const status = (savingsQuery.error as { status?: number })?.status
    const message = status === 401 || status === 403
      ? t('mercatify.savings.error.forbidden')
      : t('mercatify.savings.error.generic')
    return (
      <Alert status="error">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    )
  }

  const costsEntered = data ? data.omOperatingCost != null && data.implementationCost != null : false

  return (
    <div className="rounded-lg border border-border p-4 space-y-3" data-testid="mercatify-savings-breakdown">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t('mercatify.savings.title')}</h3>
        <Button type="button" variant="outline" onClick={() => setEditingCosts(true)} disabled={savingsQuery.isLoading}>
          {costsEntered ? t('mercatify.savings.actions.editCosts') : t('mercatify.savings.actions.enterCosts')}
        </Button>
      </div>

      {savingsQuery.isLoading && (
        <p className="text-sm text-muted-foreground">{t('mercatify.savings.loading')}</p>
      )}

      {!savingsQuery.isLoading && data && !costsEntered && (
        <EmptyState
          title={t('mercatify.savings.empty.title')}
          description={t('mercatify.savings.empty.description')}
        />
      )}

      {!savingsQuery.isLoading && data && costsEntered && (
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt>
              {t('mercatify.savings.line.saasSaving')}
              <span className="ml-2 text-xs text-muted-foreground">{t('mercatify.savings.source.customer')}</span>
            </dt>
            <dd className="font-medium">{formatCurrency(data.grossAnnualSaving, data.currency) ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>
              {t('mercatify.savings.line.omOperatingCost')}
              <span className="ml-2 text-xs text-muted-foreground">{t('mercatify.savings.source.admin')}</span>
            </dt>
            <dd className="font-medium">{formatCurrency(data.omOperatingCost, data.currency) ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>
              {t('mercatify.savings.line.implementationCost')}
              <span className="ml-2 text-xs text-muted-foreground">{t('mercatify.savings.source.admin')}</span>
            </dt>
            <dd className="font-medium">{formatCurrency(data.implementationCost, data.currency) ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2">
            <dt className="font-medium">{t('mercatify.savings.line.netAnnualSaving')}</dt>
            <dd className="font-semibold">{formatCurrency(data.netAnnualSaving, data.currency) ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>{t('mercatify.savings.line.payback')}</dt>
            <dd className="font-medium">
              {data.netPaybackMonths != null
                ? t('mercatify.savings.payback.months', { count: Math.round(data.netPaybackMonths * 10) / 10 })
                : t('mercatify.savings.payback.notReached')}
            </dd>
          </div>
        </dl>
      )}

      <EditCaseCostsDialog
        open={editingCosts}
        onOpenChange={setEditingCosts}
        caseId={caseId}
        initial={data ? {
          omOperatingCost: data.omOperatingCost,
          implementationCost: data.implementationCost,
          caseUpdatedAt: data.caseUpdatedAt,
        } : null}
        onSaved={() => {
          setEditingCosts(false)
          queryClient.invalidateQueries({ queryKey })
        }}
      />
    </div>
  )
}
