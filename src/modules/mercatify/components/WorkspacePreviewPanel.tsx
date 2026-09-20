"use client"
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import './labsPanel.css'

type WorkspacePreview = {
  builtAt: string
  sentAt: string | null
  html: string
  moduleIds: string[]
}

type RequestForPreview = {
  id: string
  workspace_preview: WorkspacePreview | null
}

/**
 * Lets a consultant build, inspect, and send a static "empty shell" mockup
 * of Open Mercato configured for this client — only rendered by the report
 * page once the request is `accepted` (see ReportComposer). Building never
 * sends anything; sending is a separate, explicit step.
 */
export default function WorkspacePreviewPanel({ id }: { id: string }) {
  const t = useT()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['mercatify-request', id],
    queryFn: async () => fetchCrudList<RequestForPreview>('mercatify/requests', { id, page: 1, pageSize: 1 }),
  })
  const preview = data?.items?.[0]?.workspace_preview ?? null

  const [building, setBuilding] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [showPreview, setShowPreview] = React.useState(false)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['mercatify-request', id] })
  }

  async function build() {
    setBuilding(true)
    try {
      await apiCallOrThrow('/api/mercatify/requests/preview-build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      flash(t('mercatify.preview.flash.built', 'Workspace preview built.'), 'success')
      invalidate()
    } catch (err) {
      flash(err instanceof Error ? err.message : t('mercatify.preview.error.generic', 'Could not build the workspace preview.'), 'error')
    } finally {
      setBuilding(false)
    }
  }

  async function send() {
    setSending(true)
    try {
      await apiCallOrThrow('/api/mercatify/requests/preview-send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      flash(t('mercatify.preview.flash.sent', 'Workspace preview sent to the client.'), 'success')
      invalidate()
    } catch (err) {
      flash(err instanceof Error ? err.message : t('mercatify.preview.error.generic', 'Could not build the workspace preview.'), 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold">{t('mercatify.preview.heading', 'Workspace preview')}</h2>
      <p className="text-sm text-muted-foreground mt-1">
        {t('mercatify.preview.lead', 'A static mockup — their name on the brand mark, only the modules their stack actually turns on in the sidebar. Nothing live, nothing clickable.')}
      </p>

      <div className="mt-3 rounded-lg border p-4 space-y-3">
        {!preview ? (
          <Button type="button" onClick={build} disabled={building}>
            {building ? t('mercatify.preview.action.building', 'Building…') : t('mercatify.preview.action.build', 'Build preview')}
          </Button>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge variant={preview.sentAt ? 'success' : 'info'} dot>
                {preview.sentAt
                  ? t('mercatify.preview.badge.sent', 'Sent to client')
                  : t('mercatify.preview.badge.draft', 'Draft — not sent')}
              </StatusBadge>
              <span className="text-muted-foreground">
                {t('mercatify.preview.moduleCount', '{count} module(s) enabled', { count: preview.moduleIds.length })}
                {preview.sentAt
                  ? ' · ' + t('mercatify.preview.sentOn', 'sent {date}', { date: new Date(preview.sentAt).toLocaleString() })
                  : ' · ' + t('mercatify.preview.builtOn', 'built {date}', { date: new Date(preview.builtAt).toLocaleString() })}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowPreview((v) => !v)}>
                {showPreview ? t('mercatify.preview.action.hide', 'Hide preview') : t('mercatify.preview.action.show', 'Show preview')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={build} disabled={building}>
                {building ? t('mercatify.preview.action.building', 'Building…') : t('mercatify.preview.action.rebuild', 'Rebuild')}
              </Button>
              <Button type="button" size="sm" onClick={send} disabled={sending}>
                {sending
                  ? t('mercatify.preview.action.sending', 'Sending…')
                  : preview.sentAt
                    ? t('mercatify.preview.action.resend', 'Send updated preview')
                    : t('mercatify.preview.action.send', 'Send to client')}
              </Button>
            </div>

            {showPreview ? (
              <iframe
                title={t('mercatify.preview.frameTitle', 'Workspace preview')}
                srcDoc={preview.html}
                sandbox=""
                className="mercatify-labs-frame w-full rounded-lg border"
              />
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
