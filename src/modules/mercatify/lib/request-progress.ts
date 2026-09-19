import type { InterviewCaseStatus } from '../data/entities'

export const SUBMITTED_CASE_STATUSES: readonly InterviewCaseStatus[] = [
  'new',
  'mapping',
  'mapped',
  'sent',
  'accepted',
  'consult',
]

export type WhoseTurn = 'mercatify' | 'client'
export type ClientProgressStepKey = 'sent' | 'review' | 'report' | 'decision'
export type ProgressStepState = 'done' | 'current' | 'pending'

export type ClientProgressStep = {
  key: ClientProgressStepKey
  state: ProgressStepState
  at: string | null
}

export function isSubmittedCaseStatus(status: string): status is InterviewCaseStatus {
  return (SUBMITTED_CASE_STATUSES as readonly string[]).includes(status)
}

export function whoseTurnForStatus(status: string): WhoseTurn {
  if (status === 'sent' || status === 'accepted' || status === 'consult') return 'client'
  return 'mercatify'
}

export function isReportReadyStatus(status: string): boolean {
  return status === 'sent' || status === 'accepted' || status === 'consult'
}

export function isAnsweredStatus(status: string): boolean {
  return status === 'accepted' || status === 'consult'
}

export function clientProgressSteps(status: string, submittedAt: string | null): ClientProgressStep[] {
  const reportReady = isReportReadyStatus(status)
  const answered = isAnsweredStatus(status)
  return [
    { key: 'sent', state: 'done', at: submittedAt },
    { key: 'review', state: reportReady ? 'done' : 'current', at: null },
    { key: 'report', state: answered ? 'done' : reportReady ? 'current' : 'pending', at: null },
    { key: 'decision', state: answered ? 'done' : 'pending', at: null },
  ]
}

export function buildClientRequestView(status: string, submittedAt: string | null) {
  return {
    whoseTurn: whoseTurnForStatus(status),
    submittedAt,
    progress: isSubmittedCaseStatus(status) ? clientProgressSteps(status, submittedAt) : [],
  }
}
