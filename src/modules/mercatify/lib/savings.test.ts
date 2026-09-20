/// <reference types="jest" />
import { computeSavingsScenario } from './savings'

describe('computeSavingsScenario', () => {
  it('matches the mercatify-labs Voltix reference numbers (~6.9 months net payback)', () => {
    // gross €29,400 − OM €8,400 = net €21,000/yr, implementation €12,000 → ~6.9 months
    // Cross-checks mercatify-labs/src/__tests__/computeScenario.test.ts's own fixture.
    const stack = [
      { name: 'HubSpot', monthlyCost: 2000 },
      { name: 'PandaDoc', monthlyCost: 450 },
    ]
    const mappings = [
      { source: 'HubSpot', decision: 'native' },
      { source: 'PandaDoc', decision: 'native' },
    ]
    const scenario = computeSavingsScenario(mappings, stack, { omOperatingCost: 8400, implementationCost: 12000 })

    expect(scenario.grossAnnualSaving).toBeCloseTo(29400, 5)
    expect(scenario.netAnnualSaving).toBeCloseTo(21000, 5)
    expect(scenario.netPaybackMonths).toBeCloseTo(6.857, 2)
    expect(scenario.removedSaaS).toEqual(['HubSpot', 'PandaDoc'])
    expect(scenario.retainedSaaS).toEqual([])
  })

  it('reports SaaS saving, OM cost, and implementation as separate lines — never blended', () => {
    const stack = [{ name: 'HubSpot', monthlyCost: 100 }]
    const mappings = [{ source: 'HubSpot', decision: 'native' }]
    const scenario = computeSavingsScenario(mappings, stack, { omOperatingCost: 200, implementationCost: 500 })
    expect(scenario.grossAnnualSaving).toBe(1200)
    expect(scenario.omOperatingCost).toBe(200)
    expect(scenario.implementationCost).toBe(500)
    expect(scenario.netAnnualSaving).toBe(1000)
  })

  it('keeps a tool retained when any of its capabilities resolve to integrate or keep', () => {
    const stack = [{ name: 'PandaDoc', monthlyCost: 300 }]
    const mappings = [
      { source: 'PandaDoc', decision: 'native' },
      { source: 'PandaDoc', decision: 'integrate' },
    ]
    const scenario = computeSavingsScenario(mappings, stack, { omOperatingCost: 0, implementationCost: 0 })
    expect(scenario.retainedSaaS).toEqual(['PandaDoc'])
    expect(scenario.removedSaaS).toEqual([])
    expect(scenario.grossAnnualSaving).toBe(0)
  })

  it('treats a tool with no mappings as retained (unknown coverage, not a freebie removal)', () => {
    const stack = [{ name: 'Slack', monthlyCost: 60 }]
    const scenario = computeSavingsScenario([], stack, { omOperatingCost: 0, implementationCost: 0 })
    expect(scenario.retainedSaaS).toEqual(['Slack'])
    expect(scenario.grossAnnualSaving).toBe(0)
  })

  it('payback is null (not reached) when net saving is non-positive, never NaN or a blended figure', () => {
    const stack = [{ name: 'HubSpot', monthlyCost: 10 }]
    const mappings = [{ source: 'HubSpot', decision: 'native' }]
    const scenario = computeSavingsScenario(mappings, stack, { omOperatingCost: 999999, implementationCost: 1000 })
    expect(scenario.netAnnualSaving).toBeLessThan(0)
    expect(scenario.netPaybackMonths).toBeNull()
  })

  it('leaves netAnnualSaving/netPaybackMonths null when a cost input has not been entered yet', () => {
    const stack = [{ name: 'HubSpot', monthlyCost: 100 }]
    const mappings = [{ source: 'HubSpot', decision: 'native' }]

    const scenario = computeSavingsScenario(mappings, stack, { omOperatingCost: null, implementationCost: null })
    expect(scenario.grossAnnualSaving).toBe(1200)
    expect(scenario.netAnnualSaving).toBeNull()
    expect(scenario.netPaybackMonths).toBeNull()
  })
})
