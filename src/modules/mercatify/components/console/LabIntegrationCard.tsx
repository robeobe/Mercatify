"use client"
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCallOrThrow, type ApiCallResult } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CaseRefBadge, StaffStatusBadge } from './ConsoleParts'

/**
 * The last step of the demo: an accepted report goes to Mercatify Lab.
 *
 * The button is live only on an accepted case — before that there is nothing
 * anybody has agreed to hand over, so it says so instead of failing on click.
 * Every Lab outcome comes back as a status, including "not installed"; the
 * document itself is rendered underneath by `LabHandoffOutcome`.
 */
export default function LabIntegrationCard({
  caseId,
  status,
  labHandoffStatus,
  labHandoffAt,
  onIntegrated,
}: {
  caseId: string
  status: string | null
  labHandoffStatus: string | null
  labHandoffAt: string | null
  onIntegrated: () => void
}) {
  const t = useT()
  const [busy, setBusy] = React.useState(false)
  const cardRef = React.useRef<HTMLDivElement | null>(null)
  const integrateMutation = useGuardedMutation({ contextId: 'mercatify-handoff-integrate' })

  const accepted = status === 'accepted'

  // The queue links here with `?integrate=1` on an accepted case; land on the
  // action rather than on the top of a long document.
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('integrate') !== '1') return
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const stateLine = labHandoffStatus === 'delivered'
    ? t('mercatify.console.handoff.state.delivered', 'Delivered to Mercatify Lab on {date}', {
      date: labHandoffAt ? new Date(labHandoffAt).toLocaleString() : '—',
    })
    : labHandoffStatus === 'not_installed'
      ? t(
        'mercatify.console.handoff.state.notInstalled',
        'Mercatify Lab is not installed — this is what would have been handed over',
      )
      : t('mercatify.console.handoff.state.pending', 'Not handed over yet')

  const onIntegrate = React.useCallback(async () => {
    setBusy(true)
    try {
      const call = await integrateMutation.runMutation({
        context: { caseId },
        operation: () => apiCallOrThrow<{ status: string | null }>('/api/mercatify/handoff-document/integrate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ caseId }),
        }),
      })
      const outcome = (call as ApiCallResult<{ status: string | null }> | undefined)?.result?.status ?? null
      flash(
        outcome === 'delivered'
          ? t('mercatify.console.handoff.flash.delivered', 'Handed over to Mercatify Lab.')
          : t('mercatify.console.handoff.flash.other', 'Handover finished — read the outcome below.'),
        outcome === 'delivered' ? 'success' : 'info',
      )
      onIntegrated()
    } catch {
      flash(t('mercatify.console.handoff.flash.failed', 'Could not hand this over to Mercatify Lab.'), 'error')
    } finally {
      setBusy(false)
    }
  }, [caseId, integrateMutation, onIntegrated, t])

  return (
    <div
      ref={cardRef}
      className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid="mercatify-lab-integration-card"
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-base font-semibold">
          {t('mercatify.console.handoff.title', 'Integrate with Mercatify Lab')}
        </h2>
        <CaseRefBadge caseId={caseId} />
        <StaffStatusBadge status={status} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{stateLine}</p>
        <Button
          type="button"
          onClick={() => void onIntegrate()}
          disabled={!accepted || busy}
          title={accepted ? undefined : t('mercatify.console.handoff.disabledHint', 'The client has to accept the report first')}
        >
          {t('mercatify.console.handoff.action', 'Integrate with Mercatify Lab')}
        </Button>
      </div>
      {!accepted ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('mercatify.console.handoff.disabledHint', 'The client has to accept the report first')}
        </p>
      ) : null}
    </div>
  )
}
