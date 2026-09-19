import { describe, expect, it } from '@jest/globals'
import {
  buildInterviewCaseListFilters,
  caseMonthly,
  caseRef,
  caseSeats,
  caseToolNames,
  filterQueueCases,
  formatQueueMoney,
  majorityCurrency,
  matchesQueueFilter,
  queuePrimaryAction,
  queueStats,
  submittedQueueCases,
  type QueueCase,
} from './case-list-filters'

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

describe('staff queue derivations', () => {
  const caseWith = (overrides: Partial<QueueCase> & { id: string; status: string }): QueueCase => ({
    companyName: 'Acme',
    industry: 'Retail',
    currency: 'EUR',
    submittedAt: '2026-09-01T10:00:00.000Z',
    createdAt: '2026-08-31T10:00:00.000Z',
    tools: [],
    ...overrides,
  })

  it('builds the REQ ref from the first four hex characters of the id', () => {
    expect(caseRef(CASE_A)).toBe('REQ-1111')
    expect(caseRef('ab3f9c00-0000-4000-8000-000000000000')).toBe('REQ-AB3F')
  })

  it('totals monthly cost and seats across the declared tools', () => {
    const row = caseWith({
      id: CASE_A,
      status: 'new',
      tools: [
        { name: 'Slack', seats: 40, monthlyCost: 320.5 },
        { name: 'Notion', seats: 12, monthlyCost: null },
        { name: 'Jira', seats: null, monthlyCost: 180 },
      ],
    })
    expect(caseMonthly(row)).toBeCloseTo(500.5)
    expect(caseSeats(row)).toBe(52)
    expect(caseToolNames(row)).toEqual(['Slack', 'Notion', 'Jira'])
  })

  it('drops drafts from the queue', () => {
    const rows = [
      caseWith({ id: CASE_A, status: 'draft' }),
      caseWith({ id: USER_B, status: 'new' }),
    ]
    expect(submittedQueueCases(rows).map((row) => row.status)).toEqual(['new'])
  })

  it('matches the text filter against ref, company, industry and tool names', () => {
    const row = caseWith({
      id: CASE_A,
      status: 'new',
      companyName: 'Northwind',
      industry: 'Logistics',
      tools: [{ name: 'HubSpot', seats: 5, monthlyCost: 90 }],
    })
    expect(matchesQueueFilter(row, { text: 'req-1111' })).toBe(true)
    expect(matchesQueueFilter(row, { text: 'northw' })).toBe(true)
    expect(matchesQueueFilter(row, { text: 'logistics' })).toBe(true)
    expect(matchesQueueFilter(row, { text: 'hubspot' })).toBe(true)
    expect(matchesQueueFilter(row, { text: 'salesforce' })).toBe(false)
    expect(matchesQueueFilter(row, { status: 'mapped' })).toBe(false)
    expect(matchesQueueFilter(row, { status: 'new', text: '  ' })).toBe(true)
  })

  it('counts mapped with mapping and answers with each other', () => {
    const rows = [
      caseWith({ id: CASE_A, status: 'new', tools: [{ name: 'Slack', monthlyCost: 100 }] }),
      caseWith({ id: USER_A, status: 'mapping' }),
      caseWith({ id: USER_B, status: 'mapped' }),
      caseWith({ id: '2', status: 'sent', tools: [{ name: 'Jira', monthlyCost: 50 }] }),
      caseWith({ id: '3', status: 'accepted', currency: 'PLN' }),
      caseWith({ id: '4', status: 'consult' }),
    ]
    expect(queueStats(rows)).toEqual({
      newCount: 1,
      mappingCount: 2,
      sentCount: 1,
      acceptedCount: 1,
      consultCount: 1,
      answeredCount: 2,
      monthlyTotal: 150,
      currency: 'EUR',
    })
  })

  it('formats declared spend in the majority currency', () => {
    expect(formatQueueMoney(1234.6, 'EUR')).toBe('€1,235')
    expect(formatQueueMoney(1234, 'PLN')).toBe('1,234 zł')
    expect(formatQueueMoney(-90, 'USD')).toBe('−$90')
    expect(majorityCurrency([
      { id: 'a', status: 'new', currency: 'PLN' },
      { id: 'b', status: 'new', currency: 'PLN' },
      { id: 'c', status: 'new', currency: 'USD' },
    ])).toBe('PLN')
  })

  it('offers exactly one action per status, filled only once accepted', () => {
    const action = (status: string) => queuePrimaryAction({ id: CASE_A, status })
    expect(action('new')).toEqual({ key: 'map', href: `/backend/cases/${CASE_A}`, filled: false })
    expect(action('mapping')).toEqual({ key: 'continueMapping', href: `/backend/cases/${CASE_A}/mapping`, filled: false })
    expect(action('mapped')).toEqual({ key: 'buildReport', href: `/backend/cases/${CASE_A}/report`, filled: false })
    expect(action('sent')).toEqual({ key: 'report', href: `/backend/cases/${CASE_A}/report`, filled: false })
    expect(action('consult')).toEqual({ key: 'report', href: `/backend/cases/${CASE_A}/report`, filled: false })
    expect(action('accepted')).toEqual({
      key: 'integrate',
      href: `/backend/cases/${CASE_A}/handoff?integrate=1`,
      filled: true,
    })
  })

  it('filters a list down to what the toolbar asked for', () => {
    const rows = [
      caseWith({ id: CASE_A, status: 'new', companyName: 'Northwind' }),
      caseWith({ id: USER_A, status: 'sent', companyName: 'Contoso' }),
    ]
    expect(filterQueueCases(rows, { status: 'sent' }).map((row) => row.companyName)).toEqual(['Contoso'])
    expect(filterQueueCases(rows, { text: 'north' }).map((row) => row.companyName)).toEqual(['Northwind'])
  })
})
