import { getCatalogCapability } from './catalog'
import type { MercatoMappingResult, SaaSCapabilityInput, SaaSProductInput } from './types'

/**
 * Pure lookup — the mapping engine from .ai/specs/2026-09-18-mercatify.md §5.2.
 * Off-catalog capability → decision 'build', confidence 'low',
 * evidence 'not in catalog'. Never reasons about a mapping; only reads one.
 */
export function mapCapabilities(
  stack: SaaSProductInput[],
  caps: SaaSCapabilityInput[],
): MercatoMappingResult[] {
  const productNameById = new Map(stack.map((product) => [product.id, product.name]))

  return caps.map((cap) => {
    const source = productNameById.get(cap.saasProductId) ?? 'Unknown'
    const catalogEntry = getCatalogCapability(source, cap.capability)

    if (!catalogEntry) {
      return {
        capability: cap.capability,
        source,
        targetFeature: 'TBD — needs discovery',
        decision: 'build',
        confidence: 'low',
        evidence: 'not in catalog',
      }
    }

    return {
      capability: cap.capability,
      source,
      targetFeature: catalogEntry.target,
      decision: catalogEntry.decision,
      confidence: catalogEntry.confidence,
      evidence: `${source}.${cap.capability} is a catalog-verified ${catalogEntry.decision} fit for ${catalogEntry.target}.`,
    }
  })
}
