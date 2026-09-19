import type {
  ConsolidationScenarioResult,
  MercatoMappingResult,
  SaaSProductInput,
} from './types'

/**
 * The ROI engine from .ai/specs/2026-09-18-mercatify.md §5.3. Fixed formula,
 * fully deterministic — nothing here is ever an LLM's job to compute (iron
 * rule #2). Inputs (omOperatingCost, implementationCost) are customer-provided
 * and only ever selected/passed through by an agent, never invented.
 *
 * A SaaS tool is "removed" only when every one of its mapped capabilities
 * resolved to native/configure/build (OM covers it, now or via custom dev).
 * A single 'integrate' or 'keep' capability keeps the whole subscription —
 * you don't half-cancel a SaaS contract.
 */
export function computeScenario(
  mappings: MercatoMappingResult[],
  stack: SaaSProductInput[],
  opts: { omOperatingCost: number; implementationCost: number },
): ConsolidationScenarioResult {
  const mappingsBySource = new Map<string, MercatoMappingResult[]>()
  for (const mapping of mappings) {
    const list = mappingsBySource.get(mapping.source) ?? []
    list.push(mapping)
    mappingsBySource.set(mapping.source, list)
  }

  const removedSaaS: string[] = []
  const retainedSaaS: string[] = []

  for (const product of stack) {
    const productMappings = mappingsBySource.get(product.name) ?? []
    const mustRetain = productMappings.some(
      (mapping) => mapping.decision === 'integrate' || mapping.decision === 'keep',
    )
    if (mustRetain || productMappings.length === 0) {
      retainedSaaS.push(product.name)
    } else {
      removedSaaS.push(product.name)
    }
  }

  const grossAnnualSaving = stack
    .filter((product) => removedSaaS.includes(product.name))
    .reduce((sum, product) => sum + product.monthlyCost * 12, 0)

  const netAnnualSaving = grossAnnualSaving - opts.omOperatingCost
  const netPaybackMonths =
    netAnnualSaving > 0 ? opts.implementationCost / (netAnnualSaving / 12) : Infinity

  return {
    removedSaaS,
    retainedSaaS,
    grossAnnualSaving,
    omOperatingCost: opts.omOperatingCost,
    netAnnualSaving,
    implementationCost: opts.implementationCost,
    netPaybackMonths,
  }
}
