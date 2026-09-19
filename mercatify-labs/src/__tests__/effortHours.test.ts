/** @jest-environment node */
import { attachEffortHours, totalEstimatedHours } from '../effortHours'
import { computeScenario } from '../computeScenario'
import type { MercatoMappingResult } from '../types'

const mappings: MercatoMappingResult[] = [
  {
    capability: 'site_survey_tracking',
    source: 'Airtable',
    targetFeature: 'Custom Entities',
    decision: 'build',
    confidence: 'medium',
    evidence: 'not in catalog',
  },
  {
    capability: 'contacts',
    source: 'HubSpot',
    targetFeature: 'CRM',
    decision: 'native',
    confidence: 'high',
    evidence: 'HubSpot.contacts is a catalog-verified native fit for CRM.',
  },
]

const plan = {
  items: [
    { capability: 'site_survey_tracking', source: 'Airtable', estimatedHours: 24, sequence: 1, rationale: 'first' },
    { capability: 'ghost_capability', source: 'Nowhere', estimatedHours: 999, sequence: 2, rationale: 'hallucinated' },
  ],
  summary: 'x',
}

describe('attachEffortHours', () => {
  it('fills customEffortHours on the matching mapping', () => {
    const [airtable] = attachEffortHours(mappings, plan)
    expect(airtable.customEffortHours).toBe(24)
  })

  it('ignores plan items that match no real mapping', () => {
    const result = attachEffortHours(mappings, plan)
    expect(result).toHaveLength(2)
    expect(result.some((m) => m.capability === 'ghost_capability')).toBe(false)
  })

  it('leaves unmatched mappings without a customEffortHours field', () => {
    const [, hubspot] = attachEffortHours(mappings, plan)
    expect(hubspot.customEffortHours).toBeUndefined()
  })

  it('does not mutate the input array', () => {
    attachEffortHours(mappings, plan)
    expect(mappings[0].customEffortHours).toBeUndefined()
  })

  it('never changes the scenario numbers - iron rule 2', () => {
    const stack = [{ id: 'p1', name: 'Airtable', category: 'db', monthlyCost: 100 }]
    const costs = { omOperatingCost: 0, implementationCost: 12000 }
    const before = computeScenario(mappings, stack, costs)
    const after = computeScenario(attachEffortHours(mappings, plan), stack, costs)
    expect(after).toEqual(before)
    expect(after.implementationCost).toBe(12000)
  })
})

describe('totalEstimatedHours', () => {
  it('sums the plan items', () => {
    expect(totalEstimatedHours(plan)).toBe(1023)
  })
})
