/** @jest-environment node */
import { computeScenario } from '../computeScenario'
import type { MercatoMappingResult, SaaSProductInput } from '../types'

describe('computeScenario', () => {
  it('matches the Voltix reference numbers from the spec (~6.9 months net payback)', () => {
    // gross €29,400 − OM €8,400 = net €21,000/yr, implementation €12,000 → ~6.9 months
    const stack: SaaSProductInput[] = [
      { id: 'p1', name: 'HubSpot', category: 'CRM', monthlyCost: 2000 },
      { id: 'p2', name: 'PandaDoc', category: 'Docs', monthlyCost: 450 },
    ]
    const mappings: MercatoMappingResult[] = [
      { capability: 'contacts', source: 'HubSpot', targetFeature: 'OM CRM', decision: 'native', confidence: 'high', evidence: '' },
      { capability: 'quote_documents', source: 'PandaDoc', targetFeature: 'OM Sales Quotes', decision: 'native', confidence: 'high', evidence: '' },
    ]
    const scenario = computeScenario(mappings, stack, { omOperatingCost: 8400, implementationCost: 12000 })

    expect(scenario.grossAnnualSaving).toBeCloseTo(29400, 5)
    expect(scenario.netAnnualSaving).toBeCloseTo(21000, 5)
    expect(scenario.netPaybackMonths).toBeCloseTo(6.857, 2)
    expect(scenario.removedSaaS).toEqual(['HubSpot', 'PandaDoc'])
    expect(scenario.retainedSaaS).toEqual([])
  })

  it('reports SaaS saving, OM cost, and implementation as separate lines — never blended', () => {
    const stack: SaaSProductInput[] = [{ id: 'p1', name: 'HubSpot', category: 'CRM', monthlyCost: 100 }]
    const mappings: MercatoMappingResult[] = [
      { capability: 'contacts', source: 'HubSpot', targetFeature: 'OM CRM', decision: 'native', confidence: 'high', evidence: '' },
    ]
    const scenario = computeScenario(mappings, stack, { omOperatingCost: 200, implementationCost: 500 })
    expect(scenario.grossAnnualSaving).toBe(1200)
    expect(scenario.omOperatingCost).toBe(200)
    expect(scenario.implementationCost).toBe(500)
    expect(scenario.netAnnualSaving).toBe(1000)
  })

  it('keeps a tool retained when any of its capabilities resolve to integrate or keep', () => {
    const stack: SaaSProductInput[] = [{ id: 'p1', name: 'PandaDoc', category: 'Docs', monthlyCost: 300 }]
    const mappings: MercatoMappingResult[] = [
      { capability: 'quote_documents', source: 'PandaDoc', targetFeature: 'OM Sales Quotes', decision: 'native', confidence: 'high', evidence: '' },
      { capability: 'e_signature', source: 'PandaDoc', targetFeature: 'PandaDoc', decision: 'integrate', confidence: 'high', evidence: '' },
    ]
    const scenario = computeScenario(mappings, stack, { omOperatingCost: 0, implementationCost: 0 })
    expect(scenario.retainedSaaS).toEqual(['PandaDoc'])
    expect(scenario.removedSaaS).toEqual([])
    expect(scenario.grossAnnualSaving).toBe(0)
  })

  it('never divides by a non-positive net saving — payback is Infinity instead of NaN', () => {
    const stack: SaaSProductInput[] = [{ id: 'p1', name: 'HubSpot', category: 'CRM', monthlyCost: 10 }]
    const mappings: MercatoMappingResult[] = [
      { capability: 'contacts', source: 'HubSpot', targetFeature: 'OM CRM', decision: 'native', confidence: 'high', evidence: '' },
    ]
    const scenario = computeScenario(mappings, stack, { omOperatingCost: 999999, implementationCost: 1000 })
    expect(scenario.netAnnualSaving).toBeLessThan(0)
    expect(scenario.netPaybackMonths).toBe(Infinity)
  })

  it('treats a tool with no mappings as retained (unknown coverage, not a freebie removal)', () => {
    const stack: SaaSProductInput[] = [{ id: 'p1', name: 'Slack', category: 'Chat', monthlyCost: 60 }]
    const scenario = computeScenario([], stack, { omOperatingCost: 0, implementationCost: 0 })
    expect(scenario.retainedSaaS).toEqual(['Slack'])
    expect(scenario.grossAnnualSaving).toBe(0)
  })
})
