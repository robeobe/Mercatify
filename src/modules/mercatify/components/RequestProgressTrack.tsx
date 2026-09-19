"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { TrackStep, TrackStepState } from './client/progressSteps'

/** `.track li::before` in `assets/shared/om.css` — a 12px dot on the rail. */
function dotClass(state: TrackStepState): string {
  if (state === 'done') return 'border-status-success-icon bg-status-success-icon'
  if (state === 'current') return 'border-foreground bg-background ring-2 ring-muted'
  return 'border-border bg-background'
}

/** `.track li::after` — the connector down to the next step. */
function connectorClass(state: TrackStepState): string {
  return state === 'done' ? 'bg-status-success-icon' : 'bg-border'
}

export function RequestProgressTrack({ steps }: { steps: TrackStep[] }) {
  const t = useT()
  return (
    <ol className="grid" aria-label={t('mercatify.client.track.label', 'Request progress')}>
      {steps.map((step, index) => {
        const last = index === steps.length - 1
        return (
          <li
            key={step.key}
            className={`relative pl-8 ${last ? 'pb-0' : 'pb-4'}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <span
              aria-hidden="true"
              className={`absolute left-1 top-1 h-3 w-3 rounded-full border-2 ${dotClass(step.state)}`}
            />
            {last ? null : (
              <span
                aria-hidden="true"
                className={`absolute bottom-0 left-2 top-4 w-0.5 ${connectorClass(step.state)}`}
              />
            )}
            <div>
              <span className={`text-sm font-medium ${step.state === 'pending' ? 'text-muted-foreground' : ''}`}>
                {step.title}
              </span>
              {step.when ? (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{step.when}</span>
              ) : null}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">{step.body}</div>
          </li>
        )
      })}
    </ol>
  )
}
