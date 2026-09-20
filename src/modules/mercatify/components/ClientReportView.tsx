"use client"
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { buildOffer } from '../lib/offer'
import type { MercatifyCapOverride, MercatifyClientResponse, MercatifyReport, MercatifyRequestTool, MercatifyWorkspacePreview } from '../data/entities'
import type { RequestStatus } from '../lib/status'
import OfferView from './OfferView'

type RequestDetail = {
  id: string
  company: string
  industry: string | null
  people_count: number | null
  currency: string
  status: RequestStatus
  pains: string | null
  must_keep: string | null
  tools: MercatifyRequestTool[]
  overrides: Record<string, MercatifyCapOverride> | null
  report: MercatifyReport | null
  sent_at: string | null
  client_response: MercatifyClientResponse | null
  workspace_preview: MercatifyWorkspacePreview | null
  updatedAt: string | null
}

export default function ClientReportView({ id, onBack }: { id: string; onBack: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['mercatify-request', id],
    queryFn: async () => fetchCrudList<RequestDetail>('mercatify/requests', { id, page: 1, pageSize: 1 }),
  })
  const request = data?.items?.[0] ?? null

  const [kind, setKind] = React.useState<'accepted' | 'consult'>('accepted')
  const [message, setMessage] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [showWorkspacePreview, setShowWorkspacePreview] = React.useState(false)

  async function submitAnswer(e: React.FormEvent) {
    e.preventDefault()
    if (!request) return
    setSending(true)
    try {
      await apiCallOrThrow('/api/mercatify/requests/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: request.id, kind, message: message.trim() || undefined, expected_updated_at: request.updatedAt ?? undefined }),
      })
      flash(t('mercatify.requests.client.answer.flash.sent', 'Your answer was sent.'), 'success')
      queryClient.invalidateQueries({ queryKey: ['mercatify-request', id] })
      queryClient.invalidateQueries({ queryKey: ['mercatify-my-requests'] })
    } catch (err) {
      flash(err instanceof Error ? err.message : t('mercatify.requests.client.answer.error.generic', 'Failed to send your answer.'), 'error')
    } finally {
      setSending(false)
    }
  }

  if (isLoading) return <p className="muted">{t('mercatify.intake.loading', 'Loading…')}</p>

  if (error || !request || !request.sent_at) {
    return (
      <>
        <div className="pagehead">
          <div className="pagehead__text">
            <h1>{t('mercatify.requests.client.report.page.title', 'Your consolidation report')}</h1>
            <p>{t('mercatify.requests.client.report.notReady.subtitle', 'Not ready yet.')}</p>
          </div>
        </div>
        <div className="empty">
          {t('mercatify.requests.client.report.notReady.body', 'We are still reading what you sent. Your report will be here as soon as a consultant has been through it — usually within two working days.')}
          <div className="mt-16">
            <button type="button" className="btn btn--outline" onClick={onBack}>{t('mercatify.requests.client.backToRequests', '← Back to my requests')}</button>
          </div>
        </div>
      </>
    )
  }

  const offer = buildOffer({
    company: request.company,
    industry: request.industry,
    peopleCount: request.people_count,
    currency: request.currency,
    pains: request.pains,
    mustKeep: request.must_keep,
    tools: request.tools,
    overrides: request.overrides,
    report: request.report,
  })

  const response = request.client_response

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__text">
          <h1>{t('mercatify.requests.client.report.page.title', 'Your consolidation report')}</h1>
          <p>
            {t('mercatify.requests.client.report.subtitle', '{company} · {jobs} jobs across {tools} tools · prepared {date}', {
              company: request.company, jobs: offer.caps.length, tools: request.tools.length, date: offer.generatedAt,
            })}
          </p>
        </div>
        <div className="pagehead__actions">
          <button type="button" className="btn btn--ghost" onClick={onBack}>{t('mercatify.requests.client.report.backToRequest', '← Back to your request')}</button>
          <button type="button" className="btn btn--outline" onClick={() => window.print()}>{t('mercatify.requests.client.report.print', 'Print / PDF')}</button>
        </div>
      </div>

      {response ? (
        <div className="alert alert--success mb-16">
          <div>
            <strong>
              {response.kind === 'accepted'
                ? t('mercatify.requests.client.answer.acceptedOn', 'You accepted this on {date}.', { date: response.at })
                : t('mercatify.requests.client.answer.consultOn', 'You asked for a call on {date}.', { date: response.at })}
            </strong>
            <span className="block">
              {response.kind === 'accepted'
                ? t('mercatify.requests.client.answer.acceptedNext', 'A consultant is putting the first step together and will come back to you.')
                : t('mercatify.requests.client.answer.consultNext', 'Someone from Sales will get in touch to walk you through it.')}
            </span>
            {response.message ? (
              <span className="block small muted">{t('mercatify.requests.client.answer.youWrote', 'You wrote: {message}', { message: response.message })}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <OfferView offer={offer} />

      {response?.kind === 'accepted' && request.workspace_preview?.sentAt ? (
        <div className="section">
          <h2>{t('mercatify.requests.client.preview.heading', 'A first look at your workspace')}</h2>
          <p>{t('mercatify.requests.client.preview.body', "A static mockup — your name where the brand mark sits, and only the modules your accepted stack turns on. Nothing here is live yet.")}</p>
          <button type="button" className="btn btn--outline" onClick={() => setShowWorkspacePreview((v) => !v)}>
            {showWorkspacePreview
              ? t('mercatify.requests.client.preview.hide', 'Hide the preview')
              : t('mercatify.requests.client.preview.show', 'Show the preview')}
          </button>
          {showWorkspacePreview ? (
            <iframe
              title={t('mercatify.requests.client.preview.frameTitle', 'Your workspace preview')}
              srcDoc={request.workspace_preview.html}
              sandbox=""
              className="workspace-preview-frame"
            />
          ) : null}
        </div>
      ) : null}

      {!response ? (
        <>
          <div className="section">
            <h2>{t('mercatify.requests.client.answer.heading', 'What would you like to do?')}</h2>
            <p>{t('mercatify.requests.client.answer.description', 'No pressure either way — the report is yours to keep whichever you pick.')}</p>
          </div>
          <form className="answer" onSubmit={submitAnswer}>
            <label className="card answer__choice">
              <input type="radio" name="kind" checked={kind === 'accepted'} onChange={() => setKind('accepted')} />
              <span>
                <span className="m-name block">{t('mercatify.requests.client.answer.accept.title', "Accept — let's do this")}</span>
                <span className="small muted">{t('mercatify.requests.client.answer.accept.desc', 'We start with the first thing on the list and come back to you with a plan and a date. Nothing is signed by clicking here.')}</span>
              </span>
            </label>
            <label className="card answer__choice">
              <input type="radio" name="kind" checked={kind === 'consult'} onChange={() => setKind('consult')} />
              <span>
                <span className="m-name block">{t('mercatify.requests.client.answer.consult.title', 'I would like to talk to someone first')}</span>
                <span className="small muted">{t('mercatify.requests.client.answer.consult.desc', 'Someone from Sales calls you to go through the map. Say below what you would like them to cover.')}</span>
              </span>
            </label>
            <div>
              <label htmlFor="f-msg">{t('mercatify.requests.client.answer.message.label', 'Anything you want to add')}</label>
              <textarea id="f-msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('mercatify.requests.client.answer.message.placeholder', 'The stock numbers are the thing that hurts — can we start there? Best reached Tuesday mornings.')} />
            </div>
            <div className="actionbar">
              <div className="actionbar__text">{t('mercatify.requests.client.answer.hint', 'Your answer goes straight to the consultant who wrote this.')}</div>
              <button className="btn" type="submit" disabled={sending}>{t('mercatify.requests.client.answer.submit', 'Send my answer')}</button>
            </div>
          </form>
        </>
      ) : null}
    </>
  )
}
