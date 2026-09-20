import { toolGoesOff } from './toolVerdict'
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
 * resolved to native/configure/build (OM covers it, now or via custom dev)
 * AND none of them fell off the catalog — an off-catalog capability is the
 * engine saying "we have no entry for this", and banking a licence on that is
 * banking on ignorance (see `toolGoesOff`).
 * A single 'integrate' or 'keep' capability keeps the whole subscription —
 * you don't half-cancel a SaaS contract. That rule now lives in exactly one
 * place — `toolGoesOff` (`src/toolVerdict.ts`) — because the report's wave
 * planner (`src/report/waves.ts`) decides the same thing about the same tools
 * and a second copy would let the ROI table and section 06 of one document
 * disagree about which subscriptions end.
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
    if (toolGoesOff(productMappings)) {
      removedSaaS.push(product.name)
    } else {
      retainedSaaS.push(product.name)
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
