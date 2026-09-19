import type { MercatoMappingResult } from './types'

/** Jedna nieznana katalogowi para narzędzie plus zdolność, gotowa dla kuratora. */
export interface CatalogGap {
  source: string
  capability: string
}

/**
 * Czysty odczyt: które zdolności wypadły poza katalog. Sygnałem jest
 * `evidence === 'not in catalog'` - dokładnie ten string ustawia
 * `mapCapabilities` w ścieżce awaryjnej (SPEC.md §6.2). To wejście do pętli
 * wzrostu katalogu z SPEC.md §8: uruchom `proposeCatalogEntry` dla każdej
 * luki, a człowiek decyduje, co trafi do `catalogData.json`.
 */
export function findCatalogGaps(mappings: MercatoMappingResult[]): CatalogGap[] {
  const seen = new Set<string>()
  const gaps: CatalogGap[] = []
  for (const mapping of mappings) {
    if (mapping.evidence !== 'not in catalog') continue
    const key = `${mapping.source}::${mapping.capability}`
    if (seen.has(key)) continue
    seen.add(key)
    gaps.push({ source: mapping.source, capability: mapping.capability })
  }
  return gaps
}
