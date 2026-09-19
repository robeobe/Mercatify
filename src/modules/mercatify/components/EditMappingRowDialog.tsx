"use client"
import * as React from 'react'
import { z } from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Button } from '@open-mercato/ui/primitives/button'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { useDialogKeyHandler } from '@open-mercato/ui/hooks/useDialogKeyHandler'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MercatifyDecisionSchema } from '../lib/mercatify-lab-port'
import type { MappingRowDto } from './MappingTable'

const ENTITY_ID = 'mercatify:mapping_row'

type FormValues = {
  id: string
  decision: string
  justification: string
  updatedAt?: string | null
}

export default function EditMappingRowDialog({
  open,
  onOpenChange,
  row,
  onSaved,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  row: MappingRowDto | null
  onSaved: () => void
}) {
  const t = useT()

  const decisionOptions = React.useMemo(
    () => MercatifyDecisionSchema.options.map((value) => ({
      value,
      label: t(`mercatify.mapping.decision.${value}`),
    })),
    [t],
  )

  const fields = React.useMemo<CrudField[]>(() => [
    {
      id: 'decision',
      label: t('mercatify.mapping.edit.fields.decision.label'),
      type: 'select',
      required: true,
      options: decisionOptions,
    },
    {
      id: 'justification',
      label: t('mercatify.mapping.edit.fields.justification.label'),
      type: 'textarea',
      required: true,
    },
  ], [decisionOptions, t])

  const groups = React.useMemo<CrudFormGroup[]>(() => [
    { id: 'details', title: t('mercatify.mapping.edit.group'), column: 1, fields: ['decision', 'justification'] },
  ], [t])

  const schema = React.useMemo(() => z.object({
    id: z.string().uuid(),
    decision: MercatifyDecisionSchema,
    justification: z.string().min(1).max(2000),
  }), [])

  const initialValues = React.useMemo<FormValues | undefined>(() => row ? {
    id: row.id,
    decision: row.decision,
    justification: row.justification,
    updatedAt: row.updatedAt ?? null,
  } : undefined, [row])

  const handleKeyDown = useDialogKeyHandler({ onCancel: () => onOpenChange(false) })

  if (!row) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>{t('mercatify.mapping.edit.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{row.capability}</p>
        </div>
        <CrudForm<FormValues>
          embedded
          schema={schema}
          entityId={ENTITY_ID}
          fields={fields}
          groups={groups}
          initialValues={initialValues}
          submitLabel={t('mercatify.mapping.edit.submit')}
          extraActions={(
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('mercatify.mapping.edit.cancel')}
            </Button>
          )}
          onSubmit={async (values) => {
            await updateCrud('mercatify/mapping-rows', values)
            onSaved()
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
