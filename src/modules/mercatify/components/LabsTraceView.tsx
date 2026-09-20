"use client"
import * as React from 'react'
import { ActivityFeed, ActivityFeedItem, ActivityFeedStatusChip } from '@open-mercato/ui/primitives/activity-feed'
import { Avatar } from '@open-mercato/ui/primitives/avatar'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type LabsTraceToolCall = {
  tool: string
  argsPreview: string
  resultPreview?: string
  error?: string
}

export type LabsTraceStep = {
  seq: number
  agentId: string
  agentLabel: string
  agentRole: string
  status: 'running' | 'done' | 'error'
  startedAt: string
  finishedAt?: string
  durationMs?: number
  inputPreview: string
  outputPreview?: string
  error?: string
  toolCalls: LabsTraceToolCall[]
}

function fmtDuration(ms?: number): string | null {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Renders the agent-by-agent trace of one Mercatify Labs run — live (polled
 * while the request is still in flight, one row flips from "Working…" to
 * "Done" as each agent settles) or historical (the persisted trace on an
 * already-processed request, with an optional replay animation).
 */
export default function LabsTraceView({ steps, live = false }: { steps: LabsTraceStep[]; live?: boolean }) {
  const t = useT()
  const [replaying, setReplaying] = React.useState(false)
  const [revealCount, setRevealCount] = React.useState(steps.length)
  const replayTimer = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!replaying) setRevealCount(steps.length)
  }, [steps.length, replaying])

  React.useEffect(() => () => {
    if (replayTimer.current != null) window.clearTimeout(replayTimer.current)
  }, [])

  function startReplay() {
    if (steps.length === 0) return
    setReplaying(true)
    setRevealCount(0)
    let i = 0
    const tick = () => {
      i += 1
      setRevealCount(i)
      if (i < steps.length) {
        replayTimer.current = window.setTimeout(tick, 550)
      } else {
        setReplaying(false)
      }
    }
    replayTimer.current = window.setTimeout(tick, 250)
  }

  if (steps.length === 0) {
    return live ? (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="sm" />
        {t('mercatify.labs.trace.starting', 'Starting…')}
      </div>
    ) : null
  }

  const visible = steps.slice(0, revealCount)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{t('mercatify.labs.trace.title', 'How this ran')}</h4>
        {!live ? (
          <Button type="button" variant="outline" size="sm" onClick={startReplay} disabled={replaying}>
            {t('mercatify.labs.trace.replay', 'Replay')}
          </Button>
        ) : null}
      </div>
      <ActivityFeed>
        {visible.map((step) => {
          const isRevealing = replaying && step.seq === visible.length - 1
          const displayStatus = isRevealing ? 'running' : step.status
          return (
            <ActivityFeedItem
              key={step.seq}
              avatar={<Avatar label={step.agentLabel} size="sm" />}
              title={
                <>
                  {step.agentLabel}
                  <span className="font-normal text-muted-foreground"> — {step.agentRole}</span>
                </>
              }
              timestamp={displayStatus === 'running' ? null : fmtDuration(step.durationMs)}
            >
              <StepStatusChip status={displayStatus} />
              {step.toolCalls.length ? (
                <span className="text-xs text-muted-foreground">
                  {t('mercatify.labs.trace.toolCalls', 'used {count} tool call(s)', { count: step.toolCalls.length })}
                </span>
              ) : null}
              {displayStatus !== 'running' ? (
                <details className="w-full text-xs text-muted-foreground">
                  <summary className="cursor-pointer">{t('mercatify.labs.trace.details', 'Input / output')}</summary>
                  <div className="mt-1 space-y-1">
                    <div><strong>{t('mercatify.labs.trace.input', 'Input')}:</strong> {step.inputPreview}</div>
                    {step.outputPreview ? (
                      <div><strong>{t('mercatify.labs.trace.output', 'Output')}:</strong> {step.outputPreview}</div>
                    ) : null}
                    {step.error ? (
                      <div className="text-status-error-icon">
                        <strong>{t('mercatify.labs.trace.error', 'Error')}:</strong> {step.error}
                      </div>
                    ) : null}
                    {step.toolCalls.map((tc, i) => (
                      <div key={i}>
                        {t('mercatify.labs.trace.toolCall', 'Tool {name}: {args}', { name: tc.tool, args: tc.argsPreview })}
                        {tc.resultPreview ? ` → ${tc.resultPreview}` : ''}
                        {tc.error ? ` (${tc.error})` : ''}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </ActivityFeedItem>
          )
        })}
      </ActivityFeed>
    </div>
  )
}

function StepStatusChip({ status }: { status: 'running' | 'done' | 'error' }) {
  const t = useT()
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Spinner size="sm" /> {t('mercatify.labs.trace.status.running', 'Working…')}
      </span>
    )
  }
  if (status === 'error') {
    return <ActivityFeedStatusChip status="error">{t('mercatify.labs.trace.status.error', 'Failed')}</ActivityFeedStatusChip>
  }
  return <ActivityFeedStatusChip status="success">{t('mercatify.labs.trace.status.done', 'Done')}</ActivityFeedStatusChip>
}
