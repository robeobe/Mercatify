"use client"
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { FormField } from '@open-mercato/ui/primitives/form-field'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { canReport, type RequestStatus } from '../lib/status'
import { buildOffer } from '../lib/offer'
import { refFor } from '../lib/ref'
import type { MercatifyCapOverride, MercatifyClientResponse, MercatifyReport } from '../data/entities'
import OfferView from './OfferView'
import WorkspacePreviewPanel from './WorkspacePreviewPanel'

type RequestDetail = {
  id: string
  company: string
  industry: string | null
  people_count: number | null
  currency: string
  status: RequestStatus
  pains: string | null
  must_keep: string | null
  tools: { name: string; seats?: number | null; monthly?: number | null; caps: string[] }[]
  overrides: Record<string, MercatifyCapOverride> | null
  report: MercatifyReport | null
  sent_at: string | null
  client_response: MercatifyClientResponse | null
  created_at: string | null
  updatedAt: string | null
}

const STATUS_VARIANT: Record<RequestStatus, 'info' | 'warning' | 'success'> = {
  new: 'info', mapping: 'warning', mapped: 'success', sent: 'info', accepted: 'success', consult: 'warning',
}

export default function ReportComposer({ id }: { id: string }) {
  const t = useT()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['mercatify-request', id],
    queryFn: async () => fetchCrudList<RequestDetail>('mercatify/requests', { id, page: 1, pageSize: 1 }),
  })
  const request = data?.items?.[0] ?? null

  const [headline, setHeadline] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [analyst, setAnalyst] = React.useState('')
  const [switchingCost, setSwitchingCost] = React.useState('')
  const [hosting, setHosting] = React.useState('')
  const [months, setMonths] = React.useState('')
  const [openQuestions, setOpenQuestions] = React.useState('')
  const [saving, setSaving] = React.useState<'draft' | 'send' | null>(null)
  const hydrated = React.useRef(false)

  React.useEffect(() => {
    if (!request || hydrated.current) return
    hydrated.current = true
    const r = request.report
    setHeadline(r?.headline || '')
    setNotes(r?.notes || '')
    setAnalyst(r?.assumptions?.analyst || '')
    setSwitchingCost(r?.assumptions?.switchingCost !== undefined ? String(r.assumptions.switchingCost) : '')
    setHosting(r?.assumptions?.hosting !== undefined ? String(r.assumptions.hosting) : '')
    setMonths(r?.assumptions?.months !== undefined ? String(r.assumptions.months) : '')
    setOpenQuestions(r?.assumptions?.notes || '')
  }, [request])

  const offer = React.useMemo(() => {
    if (!request) return null
    return buildOffer({
      company: request.company,
      industry: request.industry,
      peopleCount: request.people_count,
      currency: request.currency,
      pains: request.pains,
      mustKeep: request.must_keep,
      tools: request.tools,
      overrides: request.overrides,
      report: {
        headline,
        notes,
        generatedAt: request.report?.generatedAt,
        assumptions: {
          analyst,
          switchingCost: switchingCost ? Number(switchingCost) : undefined,
          hosting: hosting ? Number(hosting) : undefined,
          months: months ? Number(months) : undefined,
          notes: openQuestions,
        },
      },
    })
  }, [request, headline, notes, analyst, switchingCost, hosting, months, openQuestions])

  async function submit(kind: 'draft' | 'send') {
    if (!request) return
    setSaving(kind)
    try {
      const body = {
        id: request.id,
        headline: headline.trim() || undefined,
        notes: notes.trim() || undefined,
        assumptions: {
          analyst: analyst.trim() || undefined,
          switchingCost: switchingCost ? Number(switchingCost) : undefined,
          hosting: hosting ? Number(hosting) : undefined,
          months: months ? Number(months) : undefined,
          notes: openQuestions.trim() || undefined,
        },
        expected_updated_at: request.updatedAt ?? undefined,
      }
      await apiCallOrThrow('/api/mercatify/requests/report', {
        method: kind === 'draft' ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      flash(
        kind === 'draft'
          ? t('mercatify.report.flash.draftSaved', 'Draft saved.')
          : t('mercatify.report.flash.sent', 'Sent. It is now in the client\'s portal, where they can accept it or ask for a call.'),
        'success',
      )
      queryClient.invalidateQueries({ queryKey: ['mercatify-request', id] })
      queryClient.invalidateQueries({ queryKey: ['mercatify-requests'] })
    } catch (err) {
      flash(err instanceof Error ? err.message : t('mercatify.report.error.generic', 'Failed to save the report.'), 'error')
    } finally {
      setSaving(null)
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('mercatify.coverage.loading', 'Loading…')}</p>
  if (error || !request) return <div className="text-sm text-destructive">{t('mercatify.coverage.error.notFound', 'Request not found.')}</div>

  if (!canReport(request.status)) {
    return (
      <>
        <PageHeader title={t('mercatify.report.notReady.title', 'Finish the mapping first')} description={t('mercatify.report.notReady.description', 'The report is built from the mapping, so it only opens once a consultant has confirmed one. Go through the rows, then press Confirm mapping.')} />
        <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
          <div className="text-sm text-muted-foreground">{request.company} · {t(`mercatify.status.${request.status}`, request.status)}</div>
          <Button asChild>
            <Link href={`/backend/mercatify-requests/${request.id}`}>{t('mercatify.report.goToMapping', 'Go to the mapping')}</Link>
          </Button>
        </div>
      </>
    )
  }

  const editedCount = offer ? offer.caps.filter((c) => c.edited).length : 0

  return (
    <>
      <PageHeader
        title={t('mercatify.report.page.title', 'Report')}
        description={t('mercatify.report.page.description', 'Built from the confirmed mapping, your corrections included. Write the two human bits, read the preview, then send it. Nothing reaches the client until you press send.')}
        actions={(
          <Button variant="outline" asChild>
            <Link href={`/backend/mercatify-requests/${request.id}`}>{t('mercatify.report.backToMapping', '← Back to mapping')}</Link>
          </Button>
        )}
      />

      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{request.company}</h2>
          <StatusBadge variant="neutral">{refFor(request.id)}</StatusBadge>
          <StatusBadge variant={STATUS_VARIANT[request.status]} dot>{t(`mercatify.status.${request.status}`, request.status)}</StatusBadge>
          <span className="ml-auto text-sm text-muted-foreground">
            {t('mercatify.report.meta', '{industry} · {count} tools · received {date}', {
              industry: request.industry || '',
              count: request.tools.length,
              date: request.created_at ? request.created_at.slice(0, 10) : '',
            })}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('mercatify.report.field.headline', 'Opening line')} description={t('mercatify.report.field.headline.hint', 'The first thing the client reads. One sentence, the finding — not a greeting.')}>
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={t('mercatify.report.field.headline.placeholder', 'Six of your fourteen tools do a job the platform already does.')} />
          </FormField>
          <FormField label={t('mercatify.report.field.analyst', 'Reviewed by')} description={t('mercatify.report.field.analyst.hint', 'Printed on the report.')}>
            <Input value={analyst} onChange={(e) => setAnalyst(e.target.value)} placeholder="Joanna" />
          </FormField>
        </div>
        <FormField label={t('mercatify.report.field.notes', 'What you want to say in your own words')} description={t('mercatify.report.field.notes.hint', 'Appears at the end of the report, under your name.')}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t('mercatify.report.field.switchingCost', 'One-off switching cost')} description={t('mercatify.report.field.switchingCost.hint', 'A single ballpark figure for the whole move. Leave blank to skip the break-even view.')}>
            <Input type="number" min={0} value={switchingCost} onChange={(e) => setSwitchingCost(e.target.value)} placeholder="4500" />
          </FormField>
          <FormField label={t('mercatify.report.field.hosting', 'Hosting & ops, monthly')} description={t('mercatify.report.field.hosting.hint', 'Counted against the saving, so it is not overstated.')}>
            <Input type="number" min={0} value={hosting} onChange={(e) => setHosting(e.target.value)} placeholder="240" />
          </FormField>
          <FormField label={t('mercatify.report.field.months', 'Implementation months')} description={t('mercatify.report.field.months.hint', 'How long before the old licences start dropping off.')}>
            <Input type="number" min={1} max={24} value={months} onChange={(e) => setMonths(e.target.value)} placeholder="3" />
          </FormField>
        </div>
        <FormField label={t('mercatify.report.field.openQuestions', 'Open questions, one per line')} description={t('mercatify.report.field.openQuestions.hint', 'Printed under "What we are not sure about", above the low-confidence rows.')}>
          <Textarea value={openQuestions} onChange={(e) => setOpenQuestions(e.target.value)} rows={3} />
        </FormField>
        <div className="text-xs text-muted-foreground">
          {editedCount
            ? t('mercatify.report.editCount.some', '{count} mapping row{plural} {verb} edited by hand before this report', {
                count: editedCount, plural: editedCount === 1 ? '' : 's', verb: editedCount === 1 ? 'was' : 'were',
              })
            : t('mercatify.report.editCount.none', "No mapping row was edited — this is the agent's pass as it came out")}
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold">{t('mercatify.report.previewHeading', 'What the client will see')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('mercatify.report.previewLead', 'This is the document itself — the same renderer the client portal uses, not an approximation of it.')}</p>
        <div className="mt-3 rounded-lg border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/50 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-border" /><span className="w-2 h-2 rounded-full bg-border" /><span className="w-2 h-2 rounded-full bg-border" />
            <span>{t('mercatify.report.previewUrl', 'client portal · your consolidation report')}</span>
          </div>
          <div className="p-4">
            {offer ? <OfferView offer={offer} /> : null}
          </div>
        </div>
      </section>

      {request.status === 'accepted' ? <WorkspacePreviewPanel id={id} /> : null}

      <div className="sticky bottom-0 flex items-center gap-3 rounded-lg border bg-card/95 backdrop-blur p-3">
        <div className="flex-1 text-sm text-muted-foreground">
          {request.sent_at
            ? t('mercatify.report.sendState.sent', 'Sent to the client on {date}. Sending again replaces the version they have.', { date: request.sent_at.slice(0, 10) })
            : t('mercatify.report.sendState.notSent', 'Not sent yet — the client cannot see any of this.')}
          {request.client_response ? (
            ' ' + (request.client_response.kind === 'accepted'
              ? t('mercatify.report.sendState.answeredAccepted', 'They answered on {date}: accepted.', { date: request.client_response.at })
              : t('mercatify.report.sendState.answeredConsult', 'They answered on {date}: asked for a call with Sales.', { date: request.client_response.at }))
          ) : ''}
        </div>
        <Button variant="outline" onClick={() => submit('draft')} disabled={saving !== null}>
          {t('mercatify.report.saveDraft', 'Save draft')}
        </Button>
        <Button onClick={() => submit('send')} disabled={saving !== null}>
          {request.sent_at ? t('mercatify.report.sendUpdated', 'Send the updated report') : t('mercatify.report.send', 'Send to the client')}
        </Button>
      </div>
    </>
  )
}
