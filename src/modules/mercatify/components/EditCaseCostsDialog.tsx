"use client"
import * as React from 'react'
import { z } from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useDialogKeyHandler } from '@open-mercato/ui/hooks/useDialogKeyHandler'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

const ENTITY_ID = 'mercatify:interview_case'

type FormValues = {
  id: string
  omOperatingCost: number | null
  implementationCost: number | null
}

/**
 * S-04: OM operating cost and implementation cost — customer-provided inputs
 * to the net-saving formula (`lib/savings.ts`). Posts to the dedicated
 * `/api/mercatify/cases/costs` route (`commands/cases.ts`'s
 * `updateCaseCostsCommand`), not the generic case CRUD route, since these
 * figures stay editable regardless of the case's `status`.
 */
export default function EditCaseCostsDialog({
  open,
  onOpenChange,
  caseId,
  initial,
  onSaved,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  caseId: string
  initial: { omOperatingCost: number | null; implementationCost: number | null; caseUpdatedAt: string } | null
  onSaved: () => void
}) {
  const t = useT()

  const fields = React.useMemo<CrudField[]>(() => [
    { id: 'omOperatingCost', label: t('mercatify.savings.dialog.fields.omOperatingCost.label'), type: 'number' },
    { id: 'implementationCost', label: t('mercatify.savings.dialog.fields.implementationCost.label'), type: 'number' },
  ], [t])

  const groups = React.useMemo<CrudFormGroup[]>(() => [
    { id: 'costs', title: t('mercatify.savings.dialog.group'), column: 1, fields: ['omOperatingCost', 'implementationCost'] },
  ], [t])

  const schema = React.useMemo(() => z.object({
    id: z.string().uuid(),
    omOperatingCost: z.number().nonnegative().nullable(),
    implementationCost: z.number().nonnegative().nullable(),
  }), [])

  const initialValues = React.useMemo<FormValues>(() => ({
    id: caseId,
    omOperatingCost: initial?.omOperatingCost ?? null,
    implementationCost: initial?.implementationCost ?? null,
  }), [caseId, initial])

  const handleKeyDown = useDialogKeyHandler({ onCancel: () => onOpenChange(false) })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>{t('mercatify.savings.dialog.title')}</DialogTitle>
        </DialogHeader>
        <CrudForm<FormValues>
          embedded
          schema={schema}
          entityId={ENTITY_ID}
          fields={fields}
          groups={groups}
          initialValues={initialValues}
          submitLabel={t('mercatify.savings.dialog.submit')}
          extraActions={(
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('mercatify.savings.dialog.cancel')}
            </Button>
          )}
          onSubmit={async (values) => {
            await withScopedApiRequestHeaders(
              buildOptimisticLockHeader(initial?.caseUpdatedAt ?? null),
              () => apiCallOrThrow('/api/mercatify/cases/costs', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(values),
              }),
            )
            flash(t('mercatify.savings.flash.saved'), 'success')
            onSaved()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
