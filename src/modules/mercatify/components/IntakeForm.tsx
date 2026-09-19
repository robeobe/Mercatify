"use client"
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { fetchCrudList, createCrud } from '@open-mercato/ui/backend/utils/crud'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CATALOG, capLabel, type CatalogTool } from '../lib/catalog'
import { REQUEST_STATUS_META, type RequestStatus } from '../lib/status'
import { refFor } from '../lib/ref'
import ClientReportView from './ClientReportView'
import './intake.css'

type Currency = 'EUR' | 'USD' | 'GBP' | 'PLN'

type ToolSelection = { mods: Record<string, boolean>; seats: string; monthly: string }

type CustomTool = { name: string; what: string; seats: string; monthly: string }

type RequestListItem = {
  id: string
  company: string
  industry: string | null
  people_count: number | null
  currency: string
  status: RequestStatus
  pains: string | null
  must_keep: string | null
  tools: { name: string; seats?: number | null; monthly?: number | null; caps: string[] }[]
  created_at?: string | null
  sent_at?: string | null
}

const CURRENCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', PLN: 'zł' }

function money(n: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency] || ''
  const v = Math.round(n).toLocaleString('en-US')
  return currency === 'PLN' ? `${v} ${sym}` : `${sym}${v}`
}

// Client-facing wording differs from the console's own status vocabulary
// (assets/shared/om-core.js REQUEST_STATUS) — mapping and mapped both read
// as "in review" to a client; only the badge color tells them apart.
const CLIENT_STATUS_KEY: Record<RequestStatus, string> = {
  new: 'mercatify.requests.client.status.new',
  mapping: 'mercatify.requests.client.status.mapping',
  mapped: 'mercatify.requests.client.status.mapped',
  sent: 'mercatify.requests.client.status.sent',
  accepted: 'mercatify.requests.client.status.accepted',
  consult: 'mercatify.requests.client.status.consult',
}
function clientStatusMeta(status: RequestStatus) {
  const meta = REQUEST_STATUS_META[status]
  return { badgeClass: `badge--${meta.badge}`, key: CLIENT_STATUS_KEY[status], fallback: meta.clientLabel }
}

type View = { kind: 'list' } | { kind: 'form' } | { kind: 'detail'; id: string } | { kind: 'report'; id: string }

export default function IntakeForm() {
  const t = useT()
  const queryClient = useQueryClient()
  const [view, setView] = React.useState<View>({ kind: 'list' })

  const { data, isLoading } = useQuery({
    queryKey: ['mercatify-my-requests'],
    queryFn: async () => fetchCrudList<RequestListItem>('mercatify/requests', { mine: true, page: 1, pageSize: 50, sortField: 'created_at', sortDir: 'desc' }),
  })

  const items = data?.items ?? []

  function handleSubmitted() {
    queryClient.invalidateQueries({ queryKey: ['mercatify-my-requests'] })
    setView({ kind: 'list' })
  }

  return (
    <div className="mercatify-portal">
      {isLoading ? (
        <p className="muted">{t('mercatify.intake.loading', 'Loading…')}</p>
      ) : view.kind === 'form' ? (
        <IntakeFormBody onSubmitted={handleSubmitted} onBack={items.length ? () => setView({ kind: 'list' }) : undefined} />
      ) : view.kind === 'detail' ? (
        <SentView
          request={items.find((r) => r.id === view.id) ?? null}
          onBack={() => setView({ kind: 'list' })}
          onSendCorrected={() => setView({ kind: 'form' })}
          onReadReport={() => setView({ kind: 'report', id: view.id })}
        />
      ) : view.kind === 'report' ? (
        <ClientReportView id={view.id} onBack={() => setView({ kind: 'detail', id: view.id })} />
      ) : (
        <RequestsList items={items} onNew={() => setView({ kind: 'form' })} onOpen={(id) => setView({ kind: 'detail', id })} />
      )}
    </div>
  )
}

function RequestsList({ items, onNew, onOpen }: { items: RequestListItem[]; onNew: () => void; onOpen: (id: string) => void }) {
  const t = useT()

  if (!items.length) {
    return (
      <>
        <div className="pagehead">
          <div className="pagehead__text">
            <h1>{t('mercatify.requests.client.title', 'Your requests')}</h1>
            <p>{t('mercatify.requests.client.empty.subtitle', 'Nothing here yet.')}</p>
          </div>
        </div>
        <div className="empty">
          {t('mercatify.requests.client.empty.body', 'You have not sent us a stack yet. It takes about four minutes and you keep the map whether or not you go ahead with us.')}
          <div className="mt-16">
            <button type="button" className="btn" onClick={onNew}>{t('mercatify.requests.client.mapMyStack', 'Map my stack')}</button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__text">
          <h1>{t('mercatify.requests.client.title', 'Your requests')}</h1>
          <p>{t('mercatify.requests.client.description', 'Everything you have sent us, and where each one got to. Open one to see what you sent and to read the report when it comes back.')}</p>
        </div>
        <div className="pagehead__actions">
          <button type="button" className="btn btn--outline" onClick={onNew}>{t('mercatify.requests.client.sendAnother', 'Send another stack')}</button>
        </div>
      </div>
      <div className="tiles">
        {items.map((req) => {
          const meta = clientStatusMeta(req.status)
          const monthly = req.tools.reduce((sum, tool) => sum + (Number(tool.monthly) || 0), 0)
          const openThis = () => onOpen(req.id)
          return (
            <div
              key={req.id}
              className="tile"
              role="button"
              tabIndex={0}
              onClick={openThis}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openThis() }}
            >
              <div className="tile__top">
                <span className="tile__ref">{refFor(req.id)}</span>
                <span className={`badge ${meta.badgeClass}`}>{t(meta.key, meta.fallback)}</span>
              </div>
              <div>
                <div className="tile__title">{req.company || t('mercatify.requests.client.unnamed', 'Your stack')}</div>
                <div className="tile__meta">
                  {t('mercatify.requests.client.tileMeta', '{count} tools · {amount}/mo · sent {date}', {
                    count: req.tools.length,
                    amount: money(monthly, req.currency),
                    date: req.created_at ? req.created_at.slice(0, 10) : '',
                  })}
                </div>
              </div>
              <div className="tile__meta">{t('mercatify.requests.client.withConsultant', 'With a consultant. We usually come back within two working days.')}</div>
              <div className="tile__foot">
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={(e) => { e.stopPropagation(); openThis() }}
                >
                  {t('mercatify.requests.client.seeWhatYouSent', 'See what you sent')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

type ProgressStep = { key: string; title: string; when: string | null; body: string; done: boolean; current: boolean }

function clientProgress(request: RequestListItem, t: ReturnType<typeof useT>): ProgressStep[] {
  const sentDate = request.created_at ? request.created_at.slice(0, 10) : null
  const reviewing = request.status === 'new'
  const mapping = request.status === 'mapping'
  const mappedOrLater = request.status === 'mapped' || request.status === 'sent' || request.status === 'accepted' || request.status === 'consult'
  return [
    {
      key: 'sent',
      title: t('mercatify.requests.client.track.sent.title', 'You sent your stack'),
      when: sentDate,
      body: t('mercatify.requests.client.track.sent.body', 'We have your list of tools and what you use them for.'),
      done: true,
      current: false,
    },
    {
      key: 'review',
      title: t('mercatify.requests.client.track.review.title', 'A consultant reviews it'),
      when: null,
      body: t('mercatify.requests.client.track.review.body', 'Someone goes through every tool by hand. Usually two working days.'),
      done: mapping || mappedOrLater,
      current: reviewing,
    },
    {
      key: 'ready',
      title: t('mercatify.requests.client.track.ready.title', 'Your mapping is ready'),
      when: null,
      body: t('mercatify.requests.client.track.ready.body', 'What moves, what stays, and what it saves.'),
      done: mappedOrLater,
      current: mapping,
    },
  ]
}

function SentView({ request, onBack, onSendCorrected, onReadReport }: { request: RequestListItem | null; onBack: () => void; onSendCorrected: () => void; onReadReport: () => void }) {
  const t = useT()
  if (!request) {
    return <div className="empty">{t('mercatify.requests.client.notFound', 'Request not found.')}</div>
  }
  const monthly = request.tools.reduce((sum, tool) => sum + (Number(tool.monthly) || 0), 0)
  const sentDate = request.created_at ? request.created_at.slice(0, 10) : null
  const steps = clientProgress(request, t)
  const reportReady = !!request.sent_at
  const answered = request.status === 'accepted' || request.status === 'consult'
  return (
    <>
      <div className="pagehead">
        <div className="pagehead__text">
          <h1>{t('mercatify.requests.client.detail.title', 'Your request {ref}', { ref: refFor(request.id) })}</h1>
          <p>
            {sentDate
              ? t('mercatify.requests.client.detail.subtitle', 'Sent on {date}. This is what we are working from.', { date: sentDate })
              : t('mercatify.requests.client.detail.subtitleNoDate', 'This is what we are working from.')}
          </p>
        </div>
        <div className="pagehead__actions">
          <button type="button" className="btn btn--ghost" onClick={onBack}>{t('mercatify.requests.client.backToRequests', '← Back to my requests')}</button>
        </div>
      </div>

      {reportReady ? (
        <div className="card mb-16">
          <div className="card__head">
            <h2>{answered ? t('mercatify.requests.client.report.titleAnswered', 'Your report') : t('mercatify.requests.client.report.titleReady', 'Your report is ready')}</h2>
            <span className="badge badge--info">{t(clientStatusMeta(request.status).key, clientStatusMeta(request.status).fallback)}</span>
          </div>
          <p className="muted">
            {answered
              ? (request.status === 'accepted'
                  ? t('mercatify.requests.client.report.bodyAccepted', 'You accepted it. It stays here for you to re-read.')
                  : t('mercatify.requests.client.report.bodyConsult', 'You asked for a call. Sales will be in touch.'))
              : t('mercatify.requests.client.report.bodyReady', 'A consultant has been through your stack and sent the report back. Read it, then accept it or ask for a call — whichever suits.')}
          </p>
          <div className="row">
            <button type="button" className="btn" onClick={onReadReport}>
              {answered ? t('mercatify.requests.client.report.readAgain', 'Read it again') : t('mercatify.requests.client.report.read', 'Read the report')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="split">
        <div>
          <div className="card">
            <div className="card__head">
              <h2>{request.company}</h2>
              <span className="badge badge--outline mono">{refFor(request.id)}</span>
              <p className="ml-auto">
                {request.industry || ''}
                {request.people_count ? ` · ${t('mercatify.common.peopleCount', '{count} people', { count: request.people_count })}` : ''}
                {' · '}{t('mercatify.common.perMonth', '{amount}/mo', { amount: money(monthly, request.currency) })}
              </p>
            </div>
            <ul className="sent__list">
              {request.tools.map((tool) => (
                <li key={tool.name}>
                  <div className="sent__tool">
                    <b>{tool.name}</b>
                    <span className="small muted">
                      {[tool.seats ? t('mercatify.common.seatsCount', '{count} seats', { count: tool.seats }) : null, tool.monthly ? t('mercatify.common.perMonth', '{amount}/mo', { amount: money(Number(tool.monthly), request.currency) }) : null].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <div className="sent__caps">{(tool.caps || []).map(capLabel).join(', ') || '—'}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <div className="grid grid--2">
              <div>
                <div className="small muted mb-4">{t('mercatify.report.pains.label', 'What hurts today')}</div>
                <p>{request.pains || '—'}</p>
              </div>
              <div>
                <div className="small muted mb-4">{t('mercatify.report.mustKeep.label', 'Must not be touched')}</div>
                <p>{request.must_keep || '—'}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <h2>{t('mercatify.requests.client.change.heading', 'Something to change?')}</h2>
              <p>{t('mercatify.requests.client.change.description', 'Send a corrected list and we will work from the newer one.')}</p>
            </div>
            <button type="button" className="btn btn--outline" onClick={onSendCorrected}>
              {t('mercatify.requests.client.change.cta', 'Send a corrected list')}
            </button>
          </div>
        </div>

        <aside className="card" aria-label={t('mercatify.requests.client.progress.label', 'Progress')}>
          <div className="card__head"><h2>{t('mercatify.requests.client.progress.heading', 'Where it is')}</h2></div>
          <ol className="track">
            {steps.map((step) => (
              <li key={step.key} className={step.done ? 'is-done' : step.current ? 'is-current' : 'is-pending'}>
                <div>
                  <span className="track__title">{step.title}</span>
                  {step.when ? <span className="track__when">{step.when}</span> : null}
                </div>
                <div className="track__body">{step.body}</div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  )
}

function IntakeFormBody({ onSubmitted, onBack }: { onSubmitted: () => void; onBack?: () => void }) {
  const t = useT()
  const [company, setCompany] = React.useState('')
  const [people, setPeople] = React.useState('')
  const [currency, setCurrency] = React.useState<Currency>('EUR')
  const [pains, setPains] = React.useState('')
  const [mustKeep, setMustKeep] = React.useState('')
  const [sel, setSel] = React.useState<Record<string, ToolSelection>>({})
  const [custom, setCustom] = React.useState<CustomTool[]>([])
  const [search, setSearch] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  function toggleTool(toolId: string) {
    setSel((prev) => {
      const next = { ...prev }
      if (next[toolId]) delete next[toolId]
      else next[toolId] = { mods: {}, seats: '', monthly: '' }
      return next
    })
  }

  function toggleModule(toolId: string, modId: string, on: boolean) {
    setSel((prev) => {
      const cur = prev[toolId]
      if (!cur) return prev
      const mods = { ...cur.mods }
      if (on) mods[modId] = true
      else delete mods[modId]
      return { ...prev, [toolId]: { ...cur, mods } }
    })
  }

  function updateToolField(toolId: string, field: 'seats' | 'monthly', value: string) {
    setSel((prev) => {
      const cur = prev[toolId]
      if (!cur) return prev
      return { ...prev, [toolId]: { ...cur, [field]: value } }
    })
  }

  const filteredCatalog = React.useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return CATALOG
    return CATALOG.filter((tool: CatalogTool) => {
      const hay = [tool.name, tool.kind, ...tool.modules.map((m) => `${m.name} ${m.desc} ${m.caps.map(capLabel).join(' ')}`)].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [search])

  // A capability ticked under two different tools is the duplicate the mock
  // flags with "also elsewhere" — counted here so the tag can appear on both.
  const dupCapCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    for (const tool of CATALOG) {
      const s = sel[tool.id]
      if (!s) continue
      const seen = new Set<string>()
      for (const mod of tool.modules) {
        if (!s.mods[mod.id]) continue
        mod.caps.forEach((c) => seen.add(c))
      }
      seen.forEach((c) => { counts[c] = (counts[c] || 0) + 1 })
    }
    return counts
  }, [sel])

  const builtTools = React.useMemo(() => {
    const list: { name: string; seats: number | null; monthly: number | null; caps: string[] }[] = []
    for (const tool of CATALOG) {
      const s = sel[tool.id]
      if (!s) continue
      const caps = new Set<string>()
      for (const mod of tool.modules) {
        if (s.mods[mod.id]) mod.caps.forEach((c) => caps.add(c))
      }
      list.push({
        name: tool.name,
        seats: s.seats ? Number(s.seats) : null,
        monthly: s.monthly ? Number(s.monthly) : null,
        caps: Array.from(caps),
      })
    }
    for (const c of custom) {
      if (!c.name) continue
      list.push({ name: c.name, seats: c.seats ? Number(c.seats) : null, monthly: c.monthly ? Number(c.monthly) : null, caps: [] })
    }
    return list
  }, [sel, custom])

  const totals = React.useMemo(() => {
    const monthly = builtTools.reduce((s, t) => s + (t.monthly || 0), 0)
    const seats = builtTools.reduce((s, t) => s + (t.seats || 0), 0)
    const mods = Object.values(sel).reduce((s, v) => s + Object.keys(v.mods).length, 0)
    const dupLabels = Object.keys(dupCapCounts).filter((c) => dupCapCounts[c] > 1).map(capLabel)
    return { monthly, seats, mods, tools: builtTools.length, dups: dupLabels }
  }, [builtTools, sel, dupCapCounts])

  async function handleSubmit() {
    if (!company.trim()) {
      flash(t('mercatify.intake.error.company', 'Company name is required.'), 'error')
      return
    }
    if (!builtTools.length) {
      flash(t('mercatify.intake.error.noTools', 'Tick at least one tool before sending.'), 'error')
      return
    }
    setSubmitting(true)
    try {
      await createCrud('mercatify/requests', {
        company: company.trim(),
        peopleCount: people ? Number(people) : undefined,
        currency,
        pains: pains.trim() || undefined,
        mustKeep: mustKeep.trim() || undefined,
        tools: builtTools,
      })
      flash(t('mercatify.intake.flash.sent', 'Your stack was sent to Mercatify.'), 'success')
      onSubmitted()
    } catch (err) {
      flash(err instanceof Error ? err.message : t('mercatify.intake.error.generic', 'Failed to send your stack.'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__text">
          <h1>{t('mercatify.intake.form.title', 'Which tools do you pay for?')}</h1>
          <p>{t('mercatify.intake.form.description', 'Tick the tools you have, then the modules you genuinely use — not the ones that came with the plan. Seats and monthly cost are optional, but without them we can only tell you what moves, not what it saves. It takes about four minutes.')}</p>
        </div>
        {onBack ? (
          <div className="pagehead__actions">
            <button type="button" className="btn btn--ghost" onClick={onBack}>{t('mercatify.requests.client.backToRequests', '← Back to my requests')}</button>
          </div>
        ) : null}
      </div>

      <div className="layout">
        <div>
          <div className="card">
            <div className="card__head"><h2>{t('mercatify.intake.company.heading', 'Your company')}</h2></div>
            <div className="grid grid--2">
              <div>
                <label htmlFor="f-company">{t('mercatify.intake.company.name', 'Company')}</label>
                <input type="text" id="f-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder={t('mercatify.intake.company.name.placeholder', 'Voltix Energy')} />
              </div>
              <div>
                <label htmlFor="f-people">{t('mercatify.intake.company.people', 'People using software')}</label>
                <input type="number" id="f-people" min={0} value={people} onChange={(e) => setPeople(e.target.value)} placeholder="34" />
              </div>
              <div>
                <label htmlFor="f-currency">{t('mercatify.intake.company.currency', 'Currency')}</label>
                <select id="f-currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                  <option value="EUR">{t('mercatify.currency.eur', 'EUR €')}</option>
                  <option value="USD">{t('mercatify.currency.usd', 'USD $')}</option>
                  <option value="PLN">{t('mercatify.currency.pln', 'PLN zł')}</option>
                  <option value="GBP">{t('mercatify.currency.gbp', 'GBP £')}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="section">
            <h2>{t('mercatify.intake.stack.heading', 'Your stack')}</h2>
            <p>
              {t('mercatify.intake.stack.description.pre', 'Click a tool to open its modules. An')}
              {' '}<span className="badge badge--warning">{t('mercatify.intake.stack.alsoElsewhere', 'also elsewhere')}</span>{' '}
              {t('mercatify.intake.stack.description.post', 'tag means another tool you ticked already does that same job — those are the rows where the money usually is.')}
            </p>
          </div>

          <div className="mb-10">
            <label className="sr-only" htmlFor="f-search">{t('mercatify.intake.stack.filter', 'Filter tools')}</label>
            <input type="text" id="f-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('mercatify.intake.stack.filter.placeholder', 'Filter tools — hubspot, inventory, support…')} />
          </div>

          <div className="tools">
            {filteredCatalog.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                selection={sel[tool.id]}
                currency={currency}
                dupCapCounts={dupCapCounts}
                onToggleTool={() => toggleTool(tool.id)}
                onToggleModule={(modId, on) => toggleModule(tool.id, modId, on)}
                onField={(field, value) => updateToolField(tool.id, field, value)}
              />
            ))}
          </div>

          <div className="section">
            <h2>{t('mercatify.intake.custom.heading', 'Anything not on the list')}</h2>
            <p>{t('mercatify.intake.custom.description', 'In-house apps, spreadsheets that run a process, a tool we have not catalogued. We report those as unmapped rather than guess at them.')}</p>
          </div>
          <div className="card">
            {custom.map((c, i) => (
              <div key={i} className="grid grid--2 mb-10">
                <div>
                  <label htmlFor={`c${i}-name`}>{t('mercatify.intake.custom.name', 'Tool')}</label>
                  <input type="text" id={`c${i}-name`} value={c.name} onChange={(e) => setCustom((prev) => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} placeholder={t('mercatify.intake.custom.name.placeholder', 'Google Sheets — installer rota')} />
                </div>
                <div>
                  <label htmlFor={`c${i}-what`}>{t('mercatify.intake.custom.what', 'What it is used for')}</label>
                  <input type="text" id={`c${i}-what`} value={c.what} onChange={(e) => setCustom((prev) => prev.map((x, idx) => idx === i ? { ...x, what: e.target.value } : x))} placeholder={t('mercatify.intake.custom.what.placeholder', 'Weekly crew planning')} />
                </div>
                <div>
                  <label htmlFor={`c${i}-seats`}>{t('mercatify.intake.custom.seats', 'Seats')}</label>
                  <input type="number" id={`c${i}-seats`} min={0} value={c.seats} onChange={(e) => setCustom((prev) => prev.map((x, idx) => idx === i ? { ...x, seats: e.target.value } : x))} placeholder="0" />
                </div>
                <div className="row items-end">
                  <div className="flex-1">
                    <label htmlFor={`c${i}-monthly`}>{t('mercatify.intake.tool.monthlyLabel', 'Monthly ({currency})', { currency })}</label>
                    <input type="number" id={`c${i}-monthly`} min={0} value={c.monthly} onChange={(e) => setCustom((prev) => prev.map((x, idx) => idx === i ? { ...x, monthly: e.target.value } : x))} placeholder="0" />
                  </div>
                  <button className="btn btn--ghost btn--sm" type="button" onClick={() => setCustom((prev) => prev.filter((_, idx) => idx !== i))}>
                    {t('mercatify.intake.custom.remove', 'Remove')}
                  </button>
                </div>
              </div>
            ))}
            <button className="btn btn--outline btn--sm" type="button" onClick={() => setCustom((prev) => [...prev, { name: '', what: '', seats: '', monthly: '' }])}>
              {t('mercatify.intake.custom.add', '+ Add a tool')}
            </button>
          </div>

          <div className="section">
            <h2>{t('mercatify.intake.questions.heading', 'Two questions that shape everything')}</h2>
          </div>
          <div className="card">
            <div className="grid grid--2">
              <div>
                <label htmlFor="f-pains">{t('mercatify.intake.pains.label', 'What hurts today?')}</label>
                <textarea id="f-pains" value={pains} onChange={(e) => setPains(e.target.value)} placeholder={t('mercatify.intake.pains.placeholder', 'Stock numbers in three places. Quotes take a day. Nobody knows which installer has which certificate.')} />
              </div>
              <div>
                <label htmlFor="f-keep">{t('mercatify.intake.mustKeep.label', 'What must not be touched?')}</label>
                <textarea id="f-keep" value={mustKeep} onChange={(e) => setMustKeep(e.target.value)} placeholder={t('mercatify.intake.mustKeep.placeholder', 'Accounting stays with our bookkeeper. The e-signature provider is in our contracts.')} />
              </div>
            </div>
          </div>

          <div className="card mt-16">
            <div className="card__head">
              <h2>{t('mercatify.intake.send.heading', 'Send it to Mercatify')}</h2>
              <p>{t('mercatify.intake.send.description', 'Nothing is sent until you press the button — until then the answers only exist in this browser.')}</p>
            </div>
            <div className="row">
              <button className="btn" type="button" onClick={handleSubmit} disabled={submitting}>
                {t('mercatify.intake.submit', 'Send my stack')}
              </button>
            </div>
          </div>
        </div>

        <aside className="rail" aria-label={t('mercatify.intake.summary.label', 'Summary')}>
          <div className="stat">
            <div className="stat__k">{t('mercatify.intake.stat.tools', 'Tools')}</div>
            <div className="stat__v">{totals.tools}</div>
            <div className="stat__s">{totals.seats ? t('mercatify.intake.stat.seatsTotal', '{count} seats in total', { count: totals.seats }) : t('mercatify.intake.stat.noSeats', 'no seats entered')}</div>
          </div>
          <div className="stat">
            <div className="stat__k">{t('mercatify.intake.stat.modules', 'Modules in use')}</div>
            <div className="stat__v">{totals.mods}</div>
            <div className="stat__s">{t('mercatify.intake.stat.willLookAt', 'what we will look at')}</div>
          </div>
          <div className="stat">
            <div className="stat__k">{t('mercatify.intake.stat.cost', 'Licences today')}</div>
            <div className="stat__v">{totals.monthly ? money(totals.monthly, currency) : '—'}</div>
            <div className="stat__s">{t('mercatify.intake.stat.perMonth', 'per month, as entered')}</div>
          </div>
          <div className="stat">
            <div className="stat__k">{t('mercatify.intake.stat.dups', 'Paid for twice')}</div>
            <div className="stat__v">{totals.dups.length}</div>
            <div className="stat__s">
              {totals.dups.length
                ? totals.dups.slice(0, 3).map((d) => d.toLowerCase()).join(', ') + (totals.dups.length > 3 ? '…' : '')
                : t('mercatify.intake.stat.noDups', 'nothing overlapping yet')}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}

function ToolCard({
  tool,
  selection,
  currency,
  dupCapCounts,
  onToggleTool,
  onToggleModule,
  onField,
}: {
  tool: CatalogTool
  selection?: ToolSelection
  currency: string
  dupCapCounts: Record<string, number>
  onToggleTool: () => void
  onToggleModule: (modId: string, on: boolean) => void
  onField: (field: 'seats' | 'monthly', value: string) => void
}) {
  const t = useT()
  const on = !!selection
  const n = selection ? Object.keys(selection.mods).length : 0
  return (
    <div className={`tool${on ? ' is-on' : ''}`}>
      <button type="button" className="tool__head" aria-expanded={on} onClick={onToggleTool}>
        <span className="tool__tick" aria-hidden="true">✓</span>
        <span>
          <span className="tool__name">{tool.name}</span>
          <span className="tool__kind"> — {tool.kind}</span>
        </span>
        <span className="tool__count">
          {on
            ? t('mercatify.intake.tool.selectedCount', '{n} of {total}', { n, total: tool.modules.length })
            : t('mercatify.intake.tool.moduleCount', '{count} modules', { count: tool.modules.length })}
        </span>
      </button>
      {on ? (
        <div className="tool__body">
          <ul className="mods">
            {tool.modules.map((mod) => {
              const modOn = !!selection?.mods[mod.id]
              const isDup = modOn && mod.caps.some((c) => (dupCapCounts[c] || 0) > 1)
              return (
                <li key={mod.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={modOn}
                      onChange={(e) => onToggleModule(mod.id, e.target.checked)}
                    />
                    <span>
                      <span className="m-name">{mod.name}</span>
                      {isDup ? <span className="badge badge--warning m-dup">{t('mercatify.intake.stack.alsoElsewhere', 'also elsewhere')}</span> : null}
                      <span className="m-desc">{mod.desc}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="tool__cost">
            <div>
              <label htmlFor={`seats-${tool.id}`}>{t('mercatify.intake.custom.seats', 'Seats')}</label>
              <input type="number" min={0} id={`seats-${tool.id}`} value={selection?.seats ?? ''} onChange={(e) => onField('seats', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label htmlFor={`cost-${tool.id}`}>{t('mercatify.intake.tool.monthlyAllSeatsLabel', 'Monthly, all seats ({currency})', { currency })}</label>
              <input type="number" min={0} id={`cost-${tool.id}`} value={selection?.monthly ?? ''} onChange={(e) => onField('monthly', e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
