import type { MercatoMappingResult } from './types'
import type { MigrationPlanResult } from './migrationPlanner'

/**
 * Wstrzykuje estymaty godzin z Migration Plannera w mapowania - czysto, bez
 * mutacji wejścia. Dopasowuje po parze `source` plus `capability`; pozycje
 * planu, które nie trafiają w żadne realne mapowanie, są po cichu pomijane
 * (ten sam duch co awaryjna ścieżka `mapCapabilities`: zmyślona nazwa nigdy
 * nie tworzy nowego wiersza, SPEC.md §6.2).
 *
 * Godziny NIGDY nie dotykają `ConsolidationScenarioResult` -
 * `implementationCost` zostaje wartością od klienta (SPEC.md §2 zasada 2,
 * §11.2).
 */
export function attachEffortHours(
  mappings: MercatoMappingResult[],
  plan: MigrationPlanResult,
): MercatoMappingResult[] {
  const hoursByKey = new Map(
    plan.items.map((item) => [`${item.source}::${item.capability}`, item.estimatedHours]),
  )
  return mappings.map((mapping) => {
    const hours = hoursByKey.get(`${mapping.source}::${mapping.capability}`)
    return hours === undefined ? { ...mapping } : { ...mapping, customEffortHours: hours }
  })
}

/** Suma godzin w planie. Godziny, nie pieniądze - nigdy nie mnóż jej tu przez stawkę. */
export function totalEstimatedHours(plan: MigrationPlanResult): number {
  return plan.items.reduce((sum, item) => sum + item.estimatedHours, 0)
}
