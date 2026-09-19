/** @jest-environment node */
import { mapCapabilities } from '../mapCapabilities'
import type { SaaSCapabilityInput, SaaSProductInput } from '../types'

describe('mapCapabilities', () => {
  const stack: SaaSProductInput[] = [
    { id: 'p1', name: 'HubSpot', category: 'CRM', monthlyCost: 800 },
    { id: 'p2', name: 'Unknown Tool', category: 'Misc', monthlyCost: 50 },
  ]

  it('resolves a known SaaS capability from the catalog', () => {
    const caps: SaaSCapabilityInput[] = [
      { id: 'c1', saasProductId: 'p1', capability: 'contacts', importance: 'core' },
    ]
    const [mapping] = mapCapabilities(stack, caps)
    expect(mapping).toMatchObject({
      capability: 'contacts',
      source: 'HubSpot',
      // Stary klucz `contacts` rozwiązuje się przez `src/catalogAliases.ts` na
      // slug `crm.contacts`, a ten niesie prawdziwy cel z `OM_TARGETS`.
      // Poprzednio stało tu 'OM CRM' - nazwa modułu, która w platformie nie
      // istnieje i której scalony katalog nie powtarza.
      targetFeature: 'customers + sales',
      decision: 'native',
      confidence: 'high',
    })
    expect(mapping.evidence).toContain('catalog-verified')
  })

  it('S11: falls back to build/low/"not in catalog" for an off-catalog capability', () => {
    const caps: SaaSCapabilityInput[] = [
      { id: 'c2', saasProductId: 'p1', capability: 'quantum_forecasting', importance: 'nice' },
    ]
    const [mapping] = mapCapabilities(stack, caps)
    expect(mapping.decision).toBe('build')
    expect(mapping.confidence).toBe('low')
    expect(mapping.evidence).toBe('not in catalog')
  })

  it('S10: falls back the same way for a tool with no catalog entry at all', () => {
    const caps: SaaSCapabilityInput[] = [
      { id: 'c3', saasProductId: 'p2', capability: 'anything', importance: 'core' },
    ]
    const [mapping] = mapCapabilities(stack, caps)
    expect(mapping.source).toBe('Unknown Tool')
    expect(mapping.decision).toBe('build')
    expect(mapping.confidence).toBe('low')
  })

  it('never crashes and returns one mapping per input capability, in order', () => {
    const caps: SaaSCapabilityInput[] = [
      { id: 'c1', saasProductId: 'p1', capability: 'contacts', importance: 'core' },
      { id: 'c4', saasProductId: 'p1', capability: 'email_sequences', importance: 'nice' },
    ]
    const mappings = mapCapabilities(stack, caps)
    expect(mappings).toHaveLength(2)
    expect(mappings[1]).toMatchObject({ decision: 'keep', confidence: 'high' })
  })
})
