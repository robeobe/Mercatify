/// <reference types="jest" />
import {
  CASH_HORIZON_MONTHS,
  buildReportModel,
  type ReportAuthoredInput,
  type ReportMappingRowInput,
  type ReportModelInput,
  type ReportProfileInput,
} from './report'

const profile: ReportProfileInput = {
  companyName: 'Voltix',
  industry: 'Manufacturing',
  peopleCount: 40,
  currency: 'EUR',
  pains: 'Stock numbers are never right.',
  mustKeep: 'Our accounting package.',
}

const authored: ReportAuthoredInput = {
  headline: null,
  notes: null,
  analyst: null,
  openQuestions: null,
  hourlyRate: null,
  implementationMonths: null,
  buildEstimates: {},
  sentAt: null,
  preparedAt: null,
}

function row(overrides: Partial<ReportMappingRowInput> & { id: string; source: string; decision: string }): ReportMappingRowInput {
  return {
    position: 0,
    capability: `${overrides.source} capability`,
    targetLabel: 'Sales',
    targetModuleId: 'sales',
    confidence: 'high',
    justification: 'because',
    flagged: false,
    flagReason: null,
    ...overrides,
  }
}

function model(input: Partial<ReportModelInput> = {}) {
  return buildReportModel({
    profile,
    rows: [],
    stack: [],
    costs: { omOperatingCost: null, implementationCost: null },
    authored,
    ...input,
  })
}

describe('buildReportModel — headline and summary', () => {
  it('computes the headline from the removed/retained split when no override is typed', () => {
    const result = model({
      stack: [
        { name: 'HubSpot', monthlyCost: 2000, seats: 10 },
        { name: 'PandaDoc', monthlyCost: 450, seats: 5 },
      ],
      rows: [
        row({ id: 'r1', source: 'HubSpot', decision: 'native' }),
        row({ id: 'r2', source: 'PandaDoc', decision: 'keep' }),
      ],
    })

    expect(result.headline).toEqual({ kind: 'computed', key: 'someRetired', params: { removed: 1, total: 2 } })
  })

  it('says nothing is retired when every tool earns its place', () => {
    const result = model({
      stack: [{ name: 'HubSpot', monthlyCost: 2000, seats: null }],
      rows: [row({ id: 'r1', source: 'HubSpot', decision: 'keep' })],
    })

    expect(result.headline).toEqual({ kind: 'computed', key: 'noneRetired', params: { removed: 0, total: 1 } })
  })

  it('prefers the admin override, trimmed', () => {
    const result = model({ authored: { ...authored, headline: '  Six of your fourteen tools duplicate the platform.  ' } })
    expect(result.headline).toEqual({ kind: 'override', text: 'Six of your fourteen tools duplicate the platform.' })
  })

  it('returns summary clauses as i18n keys and params, never as composed prose', () => {
    const result = model({
      stack: [
        { name: 'HubSpot', monthlyCost: 2000, seats: null },
        { name: 'PandaDoc', monthlyCost: 450, seats: null },
      ],
      rows: [
        row({ id: 'r1', source: 'HubSpot', decision: 'native' }),
        row({ id: 'r2', source: 'PandaDoc', decision: 'build' }),
      ],
    })

    expect(result.summary).toEqual([
      { key: 'spend', params: { amount: 2450, tools: 2 } },
      { key: 'covered', params: { covered: 1, capabilities: 2 } },
      { key: 'endToEnd', params: { tools: 2 } },
      { key: 'build', params: { items: 1 } },
    ])
  })
})

describe('buildReportModel — the four KPIs', () => {
  it('computes licences today, licences after, net annual saving and build effort', () => {
    const result = model({
      stack: [
        { name: 'HubSpot', monthlyCost: 2000, seats: 10 },
        { name: 'PandaDoc', monthlyCost: 450, seats: 5 },
      ],
      rows: [
        row({ id: 'r1', source: 'HubSpot', decision: 'native' }),
        row({ id: 'r2', source: 'PandaDoc', decision: 'keep' }),
        row({ id: 'r3', source: 'HubSpot', decision: 'build' }),
      ],
      costs: { omOperatingCost: 8400, implementationCost: 12000 },
      authored: { ...authored, hourlyRate: 90, buildEstimates: { r3: 20 } },
    })

    // Only HubSpot's two capabilities are native/build, so HubSpot goes and
    // PandaDoc stays: gross = 2000 × 12 = 24000.
    expect(result.kpis.licencesToday).toEqual({ amount: 2450, toolCount: 2 })
    expect(result.kpis.licencesAfter.amount).toBeCloseTo(450 + 700, 5)
    expect(result.kpis.licencesAfter.omOperatingMonthly).toBeCloseTo(700, 5)
    expect(result.kpis.netAnnualSaving).toEqual({ amount: 24000 - 8400, removedCount: 1 })
    expect(result.kpis.buildEffort).toEqual({ hours: 20, cost: 1800, itemCount: 1, unestimatedCount: 0 })
  })

  it('leaves the operating cost out of licences-after when it has not been entered', () => {
    const result = model({
      stack: [{ name: 'HubSpot', monthlyCost: 2000, seats: null }],
      rows: [row({ id: 'r1', source: 'HubSpot', decision: 'keep' })],
    })

    expect(result.kpis.licencesAfter).toEqual({ amount: 2000, omOperatingMonthly: null })
    expect(result.kpis.netAnnualSaving.amount).toBeNull()
  })
})

describe('buildReportModel — verdict, tools and duplicates', () => {
  it('counts every decision in bar order, and the counts sum to the row count', () => {
    const rows = [
      row({ id: 'r1', source: 'A', decision: 'native' }),
      row({ id: 'r2', source: 'A', decision: 'native' }),
      row({ id: 'r3', source: 'B', decision: 'build' }),
      row({ id: 'r4', source: 'B', decision: 'keep' }),
    ]
    const result = model({ rows, stack: [{ name: 'A', monthlyCost: 10, seats: null }, { name: 'B', monthlyCost: 20, seats: null }] })

    expect(result.verdict.map((segment) => segment.decision)).toEqual(['native', 'configure', 'integrate', 'keep', 'build'])
    expect(result.verdict.reduce((total, segment) => total + segment.count, 0)).toBe(rows.length)
    expect(result.verdict.find((segment) => segment.decision === 'native')).toEqual({ decision: 'native', count: 2, share: 0.5 })
  })

  it('groups rows under their tool and marks the ones being switched off', () => {
    const result = model({
      stack: [
        { name: 'HubSpot', monthlyCost: 2000, seats: null },
        { name: 'PandaDoc', monthlyCost: 450, seats: null },
      ],
      rows: [
        row({ id: 'r1', source: 'HubSpot', decision: 'native' }),
        row({ id: 'r2', source: 'PandaDoc', decision: 'integrate' }),
      ],
    })

    expect(result.toolGroups).toHaveLength(2)
    expect(result.toolGroups[0]).toMatchObject({ toolName: 'HubSpot', switchedOff: true })
    expect(result.toolGroups[1]).toMatchObject({ toolName: 'PandaDoc', switchedOff: false })
  })

  it('groups a row under its tool even when the analysis echoed the name back in a different case', () => {
    const result = model({
      stack: [{ name: 'HubSpot', monthlyCost: 2000, seats: null }],
      rows: [row({ id: 'r1', source: '  hubspot ', decision: 'native' })],
    })

    expect(result.toolGroups.find((group) => group.toolName === null)).toBeUndefined()
    expect(result.toolGroups[0]).toMatchObject({ toolName: 'HubSpot', switchedOff: true })
    expect(result.toolGroups[0].rows.map((r) => r.id)).toEqual(['r1'])
    // The saving follows the grouping: a casing difference must not quietly
    // value a switched-off subscription at zero.
    expect(result.savings.removedSaaS).toEqual(['HubSpot'])
    expect(result.savings.lines[0].amount).toBe(24000)
  })

  it('lists a row whose source names no tool in the stack rather than dropping it', () => {
    const result = model({
      stack: [{ name: 'HubSpot', monthlyCost: 2000, seats: null }],
      rows: [
        row({ id: 'r1', source: 'HubSpot', decision: 'native' }),
        row({ id: 'r2', source: 'Some shadow spreadsheet', decision: 'build' }),
      ],
    })

    const unattributed = result.toolGroups.find((group) => group.toolName === null)
    expect(unattributed?.rows.map((r) => r.id)).toEqual(['r2'])
  })

  it('calls out a capability paid for in more than one tool, exactly once', () => {
    const result = model({
      stack: [
        { name: 'HubSpot', monthlyCost: 2000, seats: null },
        { name: 'Pipedrive', monthlyCost: 300, seats: null },
      ],
      rows: [
        row({ id: 'r1', source: 'HubSpot', capability: 'Deal pipeline', decision: 'native' }),
        row({ id: 'r2', source: 'Pipedrive', capability: 'deal pipeline', decision: 'native' }),
        row({ id: 'r3', source: 'HubSpot', capability: 'Email campaigns', decision: 'native' }),
      ],
    })

    expect(result.duplicates).toEqual([{ capability: 'Deal pipeline', tools: ['HubSpot', 'Pipedrive'] }])
  })
})

describe('buildReportModel — saving lines', () => {
  it('keeps the three lines separate, each with a basis and a traceable source', () => {
    const result = model({
      stack: [{ name: 'HubSpot', monthlyCost: 2000, seats: null }],
      rows: [row({ id: 'r1', source: 'HubSpot', decision: 'native' })],
      costs: { omOperatingCost: 8400, implementationCost: 12000 },
    })

    expect(result.savings.lines).toEqual([
      {
        key: 'saasSaving',
        amount: 24000,
        source: 'customer',
        basis: { key: 'removedTools', params: { count: 1, tools: 'HubSpot' } },
      },
      { key: 'omOperatingCost', amount: 8400, source: 'admin', basis: { key: 'customerProvidedAnnual', params: {} } },
      { key: 'implementationCost', amount: 12000, source: 'admin', basis: { key: 'customerProvidedOneOff', params: {} } },
    ])
    expect(result.savings.netAnnualSaving).toBe(15600)
    expect(result.savings.netPaybackMonths).toBeCloseTo(12000 / (15600 / 12), 5)
  })
})

describe('buildReportModel — build backlog', () => {
  it('prints an unestimated item as null hours rather than zero, and counts it', () => {
    const result = model({
      stack: [{ name: 'HubSpot', monthlyCost: 2000, seats: null }],
      rows: [
        row({ id: 'r1', source: 'HubSpot', decision: 'build', capability: 'Stock sync' }),
        row({ id: 'r2', source: 'HubSpot', decision: 'build', capability: 'Quote approval' }),
      ],
      authored: { ...authored, hourlyRate: 90, buildEstimates: { r1: 12 } },
    })

    expect(result.backlog.items).toEqual([
      { id: 'r1', capability: 'Stock sync', targetLabel: 'Sales', confidence: 'high', hours: 12, cost: 1080 },
      { id: 'r2', capability: 'Quote approval', targetLabel: 'Sales', confidence: 'high', hours: null, cost: null },
    ])
    expect(result.backlog.unestimatedCount).toBe(1)
    expect(result.backlog.totalHours).toBe(12)
    expect(result.backlog.totalCost).toBe(1080)
  })

  it('leaves every cost null when no hourly rate has been entered', () => {
    const result = model({
      stack: [{ name: 'HubSpot', monthlyCost: 2000, seats: null }],
      rows: [row({ id: 'r1', source: 'HubSpot', decision: 'build' })],
      authored: { ...authored, buildEstimates: { r1: 8 } },
    })

    expect(result.backlog.totalCost).toBeNull()
    expect(result.backlog.items[0].cost).toBeNull()
  })
})

describe('buildReportModel — cash curve', () => {
  const stack = [{ name: 'HubSpot', monthlyCost: 2000, seats: null }]
  const rows = [row({ id: 'r1', source: 'HubSpot', decision: 'native' })]

  it('refuses to draw a curve when a cost input is missing', () => {
    expect(model({ stack, rows, costs: { omOperatingCost: 8400, implementationCost: null } }).cashCurve).toBeNull()
    expect(model({ stack, rows, costs: { omOperatingCost: null, implementationCost: 12000 } }).cashCurve).toBeNull()
  })

  it('dips across the ramp, then crosses zero on the first month it is whole again', () => {
    const result = model({
      stack,
      rows,
      costs: { omOperatingCost: 8400, implementationCost: 12000 },
      authored: { ...authored, implementationMonths: 3 },
    })
    const curve = result.cashCurve
    if (!curve) throw new Error('expected a cash curve')

    expect(curve.points).toHaveLength(CASH_HORIZON_MONTHS + 1)
    expect(curve.rampMonths).toBe(3)
    expect(curve.troughMonth).toBe(3)
    expect(curve.trough).toBeCloseTo(-12000, 5)
    // net 15600/yr = 1300/mo; 12000 / 1300 ≈ 9.2 months of saving after the ramp
    expect(curve.breakEvenMonth).toBe(13)
    expect(curve.monthlyNetSaving).toBeCloseTo(1300, 5)
  })

  it('reports no break-even rather than stretching the axis when it never pays back', () => {
    const result = model({
      stack,
      rows,
      costs: { omOperatingCost: 23000, implementationCost: 12000 },
      authored: { ...authored, implementationMonths: 3 },
    })
    const curve = result.cashCurve
    if (!curve) throw new Error('expected a cash curve')

    expect(curve.breakEvenMonth).toBeNull()
    expect(curve.endValue).toBeLessThan(0)
  })

  it('flags a scenario where nothing was spent up front', () => {
    const result = model({ stack, rows, costs: { omOperatingCost: 8400, implementationCost: 0 } })
    expect(result.cashCurve?.paidNothing).toBe(true)
    expect(result.cashCurve?.breakEvenMonth).toBeNull()
  })
})

describe('buildReportModel — what the client told us and what we are unsure about', () => {
  it('carries the intake pains and must-keep through verbatim', () => {
    const result = model()
    expect(result.pains).toBe('Stock numbers are never right.')
    expect(result.mustKeep).toBe('Our accounting package.')
  })

  it('lists the admin lines, then every low-confidence row, then the unestimated note', () => {
    const result = model({
      stack: [{ name: 'HubSpot', monthlyCost: 2000, seats: null }],
      rows: [
        row({ id: 'r1', source: 'HubSpot', decision: 'build', capability: 'Stock sync', confidence: 'low' }),
        row({ id: 'r2', source: 'HubSpot', decision: 'native', confidence: 'high' }),
      ],
      authored: { ...authored, openQuestions: 'Their e-signature contract runs to March.\n\n  ' },
    })

    expect(result.openQuestions).toEqual([
      { key: 'authored', text: 'Their e-signature contract runs to March.' },
      { key: 'lowConfidence', capability: 'Stock sync' },
      { key: 'unestimated', count: 1 },
    ])
  })
})
