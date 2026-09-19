import type { Where, WhereValue } from '@open-mercato/shared/lib/query/types'
import { isSubmittedCaseStatus, SUBMITTED_CASE_STATUSES } from './request-progress'

export type InterviewCaseListQuery = {
  id?: string
  ids?: string
  status?: string
  mine?: boolean
}

export type InterviewCaseListFilterInput = InterviewCaseListQuery & {
  actorUserId: string | null
  canSeeAllOrgCases: boolean
}

export type InterviewCaseListFilterResult =
  | { ok: true; filters: Where<Record<string, unknown>> }
  | { ok: false; error: 'actor_required' }

/**
 * Own-list and submitted-only narrowing for interview cases.
 *
 * Tenant/organization scope is applied by `makeCrudRoute`. This helper only adds
 * owner and lifecycle filters and must fail closed when an actor is required.
 */
export function buildInterviewCaseListFilters(
  input: InterviewCaseListFilterInput,
): InterviewCaseListFilterResult {
  const restrictToOwner = Boolean(input.mine) || !input.canSeeAllOrgCases
  if (restrictToOwner && !input.actorUserId) {
    return { ok: false, error: 'actor_required' }
  }

  const filters: Where<Record<string, unknown>> = {}
  const F = filters as Record<string, WhereValue>

  if (input.ids) {
    const ids = input.ids.split(',').map((value) => value.trim()).filter((value) => value.length > 0)
    if (ids.length > 0) F.id = { $in: ids }
  }
  if (input.id) F.id = input.id
  if (restrictToOwner && input.actorUserId) F.created_by_user_id = input.actorUserId

  if (input.mine) {
    if (input.status) {
      if (!isSubmittedCaseStatus(input.status)) F.id = { $in: [] }
      else F.status = input.status
    } else {
      F.status = { $in: [...SUBMITTED_CASE_STATUSES] }
    }
  } else if (input.status) {
    F.status = input.status
  }

  return { ok: true, filters }
}
