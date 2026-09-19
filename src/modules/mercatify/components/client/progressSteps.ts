import type { TranslateFn } from '@open-mercato/shared/lib/i18n/context'
import { isAnsweredStatus, isReportReadyStatus, type ClientProgressStepKey } from '../../lib/request-progress'
import { shortDate } from './clientRequest'

export type TrackStepState = 'done' | 'current' | 'pending'

export type TrackStep = {
  key: ClientProgressStepKey
  state: TrackStepState
  title: string
  when: string | null
  body: string
}

/**
 * The four steps of `clientProgress()` in `assets/shared/om-core.js`, in the
 * same order and with the same copy. Step three is green the moment the report
 * is out — the mockup treats "done" as winning over "current".
 */
export function buildTrackSteps(
  t: TranslateFn,
  args: { status: string; submittedAt: string | null | undefined; changedAt: string | null | undefined },
): TrackStep[] {
  const reportReady = isReportReadyStatus(args.status)
  const answered = isAnsweredStatus(args.status)
  // Neither the report-sent date nor the answer date is on the case JSON, so
  // `updatedAt` stands in for whichever of them last moved the request.
  const changed = reportReady ? shortDate(args.changedAt) : null

  return [
    {
      key: 'sent',
      state: 'done',
      title: t('mercatify.client.track.sent.title', 'You sent your stack'),
      when: shortDate(args.submittedAt),
      body: t('mercatify.client.track.sent.body', 'We have your list of tools and what you use them for.'),
    },
    {
      key: 'review',
      state: reportReady ? 'done' : 'current',
      title: t('mercatify.client.track.review.title', 'A consultant reads it'),
      when: null,
      body: t('mercatify.client.track.review.body', 'Someone goes through every tool by hand. Usually two working days.'),
    },
    {
      key: 'report',
      state: reportReady ? 'done' : 'pending',
      title: t('mercatify.client.track.report.title', 'Your report comes back'),
      when: changed,
      body: reportReady
        ? t('mercatify.client.track.report.bodyReady', 'Ready to read.')
        : t('mercatify.client.track.report.body', 'What moves, what stays, and what it saves.'),
    },
    {
      key: 'decision',
      state: answered ? 'done' : 'pending',
      title: t('mercatify.client.track.decision.title', 'You decide'),
      when: answered ? changed : null,
      body: args.status === 'accepted'
        ? t('mercatify.client.track.decision.bodyAccepted', 'You accepted. A consultant is putting the first step together.')
        : args.status === 'consult'
          ? t('mercatify.client.track.decision.bodyConsult', 'You asked for a call. Sales will be in touch.')
          : t('mercatify.client.track.decision.body', 'Accept it, or ask to talk it through with someone first.'),
    },
  ]
}
