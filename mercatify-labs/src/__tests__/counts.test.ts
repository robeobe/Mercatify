/** @jest-environment node */
import { deriveStatementCounts, resolveStatementCounts, OFF_CATALOG_EVIDENCE } from '../report/counts'
import { findCatalogGaps } from '../catalogGaps'
import type { MercatoMappingResult } from '../types'

const mapping = (over: Partial<MercatoMappingResult>): MercatoMappingResult => ({
  capability: 'x',
  source: 'Tool',
  targetFeature: 'TBD — needs discovery',
  decision: 'build',
  confidence: 'low',
  evidence: OFF_CATALOG_EVIDENCE,
  ...over,
})

describe('deriveStatementCounts', () => {
  it('S11: splits statements into matched and off-catalog', () => {
    expect(
      deriveStatementCounts([
        mapping({ evidence: 'HubSpot.contacts is a catalog-verified native fit.' }),
        mapping({ evidence: 'HubSpot.deals is a catalog-verified native fit.' }),
        mapping({ source: 'Aurora', capability: 'panel_layout' }),
      ]),
    ).toEqual({ statements: 3, matched: 2, offCatalog: 1 })
  })

  it('counts an empty run as three zeros, not as a crash', () => {
    expect(deriveStatementCounts([])).toEqual({ statements: 0, matched: 0, offCatalog: 0 })
  })

  it('counts STATEMENTS, while findCatalogGaps dedupes - the two answer different questions', () => {
    const twice = [
      mapping({ source: 'Aurora', capability: 'panel_layout' }),
      mapping({ source: 'Aurora', capability: 'panel_layout' }),
    ]
    expect(deriveStatementCounts(twice).offCatalog).toBe(2)
    expect(findCatalogGaps(twice)).toHaveLength(1)
  })

  it('S10/S11: shares its off-catalog signal with the mapping engine fallback', () => {
    // Gdyby ta stała rozjechała się z `src/mapCapabilities.ts`, sekcja 02 i
    // Appendix B podawałyby inne liczby w jednym dokumencie.
    const off = mapping({})
    expect(off.evidence).toBe(OFF_CATALOG_EVIDENCE)
    expect(findCatalogGaps([off])).toHaveLength(1)
    expect(deriveStatementCounts([off]).offCatalog).toBe(1)
  })
})

describe('resolveStatementCounts - the consultant supplies the discovery count', () => {
  const engine = [
    mapping({ evidence: 'catalog-verified' }),
    mapping({ evidence: 'catalog-verified' }),
    mapping({ source: 'Aurora', capability: 'panel_layout' }),
  ]

  it('falls back to the derived counts when nobody supplied any', () => {
    expect(resolveStatementCounts(engine)).toEqual({ statements: 3, matched: 2, offCatalog: 1 })
  })

  it('takes the golden report shape: discovery found more than the form lists', () => {
    expect(resolveStatementCounts(engine, { statements: 38, offCatalog: 4 })).toEqual({
      statements: 38,
      matched: 34,
      offCatalog: 4,
    })
  })

  it('refuses fewer statements than the form actually submitted', () => {
    expect(() => resolveStatementCounts(engine, { statements: 2, offCatalog: 1 })).toThrow(
      /never fewer/,
    )
  })

  it('refuses to report away a gap the engine saw', () => {
    expect(() => resolveStatementCounts(engine, { statements: 38, offCatalog: 0 })).toThrow(
      /cannot be reported away/,
    )
  })

  it('refuses arithmetic that does not add up in the document', () => {
    expect(() => resolveStatementCounts(engine, { statements: 4, offCatalog: 9 })).toThrow(
      /cannot exceed statements/,
    )
  })

  it('refuses a fractional or negative count', () => {
    expect(() => resolveStatementCounts(engine, { statements: 3.5, offCatalog: 1 })).toThrow(/whole number/)
    expect(() => resolveStatementCounts(engine, { statements: 38, offCatalog: -1 })).toThrow(/whole number/)
  })
})
