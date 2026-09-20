/**
 * The ROI formula from `mercatify-labs/src/computeScenario.ts`, mirrored
 * (not imported — that package is a separate, un-imported prototype) against
 * this app's own mapping/tool shapes. Fixed and fully deterministic: money is
 * never an analysis step's job to compute (see `change.md`'s business-rule
 * decision). `omOperatingCost`/`implementationCost` are customer-provided
 * inputs, only ever passed through here, never invented.
 *
 * A SaaS product is "removed" only when every one of its mapped capabilities
 * resolved to native/configure/build (OM covers it, now or via custom dev).
 * A single 'integrate' or 'keep' capability keeps the whole subscription —
 * you don't half-cancel a SaaS contract.
 */

/** Kept here rather than imported from `./report`, which imports this module. */
function normalizeToolName(name: string): string {
  return name.trim().toLowerCase()
}

export type SavingsMappingInput = {
  source: string
  decision: string
}

export type SavingsStackInput = {
  name: string
  monthlyCost: number
}

export type SavingsCostsInput = {
  omOperatingCost: number | null
  implementationCost: number | null
}

export type SavingsScenario = {
  removedSaaS: string[]
  retainedSaaS: string[]
  grossAnnualSaving: number
  omOperatingCost: number | null
  netAnnualSaving: number | null
  implementationCost: number | null
  /** null = not reached (net saving <= 0), or an input cost is missing. */
  netPaybackMonths: number | null
}

export function computeSavingsScenario(
  mappings: SavingsMappingInput[],
  stack: SavingsStackInput[],
  costs: SavingsCostsInput,
): SavingsScenario {
  // Same normalization as `lib/report.ts`'s tool grouping: the analysis echoes
  // the tool name back as free text, so a casing difference must not read as a
  // different subscription — that would silently value the saving at zero.
  const mappingsBySource = new Map<string, SavingsMappingInput[]>()
  for (const mapping of mappings) {
    const key = normalizeToolName(mapping.source)
    const list = mappingsBySource.get(key) ?? []
    list.push(mapping)
    mappingsBySource.set(key, list)
  }

  const removedSaaS: string[] = []
  const retainedSaaS: string[] = []

  for (const product of stack) {
    const productMappings = mappingsBySource.get(normalizeToolName(product.name)) ?? []
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

  const netAnnualSaving = costs.omOperatingCost != null ? grossAnnualSaving - costs.omOperatingCost : null
  const netPaybackMonths =
    netAnnualSaving != null && netAnnualSaving > 0 && costs.implementationCost != null
      ? costs.implementationCost / (netAnnualSaving / 12)
      : null

  return {
    removedSaaS,
    retainedSaaS,
    grossAnnualSaving,
    omOperatingCost: costs.omOperatingCost,
    netAnnualSaving,
    implementationCost: costs.implementationCost,
    netPaybackMonths,
  }
}
