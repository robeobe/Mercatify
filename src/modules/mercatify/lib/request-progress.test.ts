import { describe, expect, it } from '@jest/globals'
import {
  buildClientRequestView,
  clientProgressSteps,
  isSubmittedCaseStatus,
  whoseTurnForStatus,
} from './request-progress'

describe('client request progress', () => {
  it('treats draft as unsubmitted', () => {
    expect(isSubmittedCaseStatus('draft')).toBe(false)
    expect(buildClientRequestView('draft', null).progress).toEqual([])
  })

  it('marks Mercatify as having the turn while the consultant is working', () => {
    for (const status of ['new', 'mapping', 'mapped'] as const) {
      expect(whoseTurnForStatus(status)).toBe('mercatify')
      const steps = clientProgressSteps(status, '2026-09-19T10:00:00.000Z')
      expect(steps.map((step) => step.state)).toEqual(['done', 'current', 'pending', 'pending'])
      expect(steps[0]?.at).toBe('2026-09-19T10:00:00.000Z')
    }
  })

  it('marks the client as having the turn once the report is back', () => {
    expect(whoseTurnForStatus('sent')).toBe('client')
    expect(clientProgressSteps('sent', null).map((step) => step.state)).toEqual([
      'done',
      'done',
      'current',
      'pending',
    ])
  })

  it('completes the track after the client answers', () => {
    for (const status of ['accepted', 'consult'] as const) {
      expect(whoseTurnForStatus(status)).toBe('client')
      expect(clientProgressSteps(status, null).map((step) => step.state)).toEqual([
        'done',
        'done',
        'done',
        'done',
      ])
    }
  })
})
