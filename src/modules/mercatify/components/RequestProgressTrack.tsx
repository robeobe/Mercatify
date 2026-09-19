"use client"

import * as React from 'react'
import type { ClientProgressStep, ClientProgressStepKey } from '../lib/request-progress'
import { useT } from '@open-mercato/shared/lib/i18n/context'

const TITLE_KEYS: Record<ClientProgressStepKey, string> = {
  sent: 'mercatify.requests.progress.sent.title',
  review: 'mercatify.requests.progress.review.title',
  report: 'mercatify.requests.progress.report.title',
  decision: 'mercatify.requests.progress.decision.title',
}

const BODY_KEYS: Record<ClientProgressStepKey, string> = {
  sent: 'mercatify.requests.progress.sent.body',
  review: 'mercatify.requests.progress.review.body',
  report: 'mercatify.requests.progress.report.body',
  decision: 'mercatify.requests.progress.decision.body',
}

function stepClassName(state: ClientProgressStep['state']): string {
  if (state === 'done') return 'border-primary text-foreground'
  if (state === 'current') return 'border-primary text-foreground'
  return 'border-border text-muted-foreground'
}

export function RequestProgressTrack({
  steps,
}: {
  steps: ClientProgressStep[]
}) {
  const t = useT()
  return (
    <ol className="space-y-4" aria-label={t('mercatify.requests.progress.label')}>
      {steps.map((step) => (
        <li
          key={step.key}
          className={`border-l-2 pl-4 ${stepClassName(step.state)}`}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <div className="text-sm font-medium">{t(TITLE_KEYS[step.key])}</div>
          <p className="text-sm text-muted-foreground">{t(BODY_KEYS[step.key])}</p>
        </li>
      ))}
    </ol>
  )
}
