import { describe, expect, it } from '@jest/globals'
import { buildInterviewCaseListFilters } from './case-list-filters'

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CASE_A = '11111111-1111-4111-8111-111111111111'

describe('interview case list filters', () => {
  it('fail-closes own-list requests without an actor', () => {
    expect(
      buildInterviewCaseListFilters({
        mine: true,
        actorUserId: null,
        canSeeAllOrgCases: true,
      }),
    ).toEqual({ ok: false, error: 'actor_required' })
    expect(
      buildInterviewCaseListFilters({
        actorUserId: null,
        canSeeAllOrgCases: false,
      }),
    ).toEqual({ ok: false, error: 'actor_required' })
  })

  it('scopes employee lists to the current user including drafts', () => {
    const result = buildInterviewCaseListFilters({
      actorUserId: USER_A,
      canSeeAllOrgCases: false,
    })
    expect(result).toEqual({
      ok: true,
      filters: { created_by_user_id: USER_A },
    })
  })

  it('restricts mine=true to the actor and submitted statuses', () => {
    const result = buildInterviewCaseListFilters({
      mine: true,
      actorUserId: USER_A,
      canSeeAllOrgCases: true,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.filters).toEqual({
      created_by_user_id: USER_A,
      status: { $in: ['new', 'mapping', 'mapped', 'sent', 'accepted', 'consult'] },
    })
  })

  it('does not let mine=true widen to another user or to drafts', () => {
    const result = buildInterviewCaseListFilters({
      mine: true,
      actorUserId: USER_A,
      canSeeAllOrgCases: true,
      status: 'draft',
      ids: `${CASE_A},${USER_B}`,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.filters.created_by_user_id).toBe(USER_A)
    expect(result.filters.id).toEqual({ $in: [] })
  })

  it('lets mapping.view callers list the org when mine is off', () => {
    const result = buildInterviewCaseListFilters({
      actorUserId: USER_A,
      canSeeAllOrgCases: true,
      status: 'mapping',
    })
    expect(result).toEqual({
      ok: true,
      filters: { status: 'mapping' },
    })
  })
})
