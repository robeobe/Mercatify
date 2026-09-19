"use client"

import * as React from 'react'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type LabHandoffOutcomeProps = {
  status: string | null
  document: string | null
  at: string | null
}

/**
 * S-06 (FR-013): what happened when the client accepted the report.
 *
 * "Mercatify Lab is not installed" is rendered as a normal outcome with the
 * document that would have been handed over in full — never an error alert,
 * never a spinner, never a dead end. It is the path the demo runs on.
 *
 * Admin-only by construction: it renders the `.md`, which `api/handoff-document`
 * only ever returns to `mercatify.handoff.view`.
 */
export default function LabHandoffOutcome({ status, document, at }: LabHandoffOutcomeProps) {
  const t = useT()
  if (!status) return null

  const alertStatus = status === 'delivered' ? 'success' : status === 'failed' ? 'warning' : 'information'
  const handedOverAt = at ? new Date(at).toLocaleString() : null

  return (
    <Alert status={alertStatus} className="mb-6" data-testid="mercatify-lab-handoff-outcome">
      <AlertTitle>{t(`mercatify.labHandoff.${status}.title`)}</AlertTitle>
      <AlertDescription>
        <p>{t(`mercatify.labHandoff.${status}.body`)}</p>
        {handedOverAt ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('mercatify.labHandoff.at')} {handedOverAt}
          </p>
        ) : null}
        {document ? (
          <details className="mt-3" open={status !== 'delivered'}>
            <summary className="cursor-pointer text-sm font-medium">
              {t('mercatify.labHandoff.contentLabel')}
            </summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs">
              {document}
            </pre>
          </details>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
