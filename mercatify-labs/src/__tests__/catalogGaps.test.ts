/** @jest-environment node */
import { findCatalogGaps } from '../catalogGaps'
import { mapCapabilities } from '../mapCapabilities'
import type { MercatoMappingResult } from '../types'

const mapping = (over: Partial<MercatoMappingResult>): MercatoMappingResult => ({
  capability: 'x',
  source: 'Tool',
  targetFeature: 'TBD — needs discovery', // literal from src/mapCapabilities.ts:24
  decision: 'build',
  confidence: 'low',
  evidence: 'not in catalog',
  ...over,
})

describe('findCatalogGaps', () => {
  it('returns only off-catalog mappings', () => {
    const gaps = findCatalogGaps([
      mapping({ source: 'Notion', capability: 'knowledge_base' }),
      mapping({
        source: 'HubSpot',
        capability: 'contacts',
        evidence: 'HubSpot.contacts is a catalog-verified native fit for CRM.',
      }),
    ])
    expect(gaps).toEqual([{ source: 'Notion', capability: 'knowledge_base' }])
  })

  it('deduplicates the same tool plus capability pair', () => {
    const gaps = findCatalogGaps([
      mapping({ source: 'Notion', capability: 'knowledge_base' }),
      mapping({ source: 'Notion', capability: 'knowledge_base' }),
    ])
    expect(gaps).toHaveLength(1)
  })

  it('returns an empty array for a fully catalogued stack', () => {
    expect(findCatalogGaps([])).toEqual([])
  })

  it('picks up the real gap mapCapabilities produces for an unknown tool', () => {
    const mappings = mapCapabilities(
      [{ id: 'p1', name: 'Notion', category: 'docs', monthlyCost: 100 }],
      [{ id: 'c1', saasProductId: 'p1', capability: 'knowledge_base', importance: 'core' }],
    )
    expect(findCatalogGaps(mappings)).toEqual([{ source: 'Notion', capability: 'knowledge_base' }])
  })
})
