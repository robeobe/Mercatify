import { getAgent, getAgentTools } from './agentLoader'
import type { LlmClient, ToolExecutor } from './llmClient'
import type { MercatoMappingResult } from './types'
import { validateMigrationPlan } from './migration/validatePlan'

export interface MigrationPlanItem {
  capability: string
  source: string
  /** Godziny inżynierskie. NIGDY kwota - SPEC.md §11.2. */
  estimatedHours: number
  /** Pozycja w kolejności wdrożenia, licząc od 1. */
  sequence: number
  rationale: string
}

export interface MigrationPlanResult {
  items: MigrationPlanItem[]
  summary: string
}

export interface MigrationPlannerInput {
  mappings: MercatoMappingResult[]
  businessProcess?: { name: string; steps: string[] }
}

/**
 * Uruchamia agenta Migration Planner (agents/migration_planner.json) i
 * wypełnia lukę z SPEC.md §11.2: `MercatoMappingResult.customEffortHours`
 * istnieje w typie, ale nic go nie ustawiało.
 *
 * Wynik jest ZAWSZE narracją obok pieniędzy: godziny nigdy nie wchodzą do
 * `scenario.implementationCost`, który pozostaje wartością od klienta
 * (SPEC.md §2 zasada 2). Do wstrzyknięcia godzin w mapowania służy czysta
 * funkcja `attachEffortHours` z `src/effortHours.ts`.
 */
export async function planMigration(
  llmClient: LlmClient,
  toolExecutor: ToolExecutor,
  input: MigrationPlannerInput,
): Promise<MigrationPlanResult> {
  const agent = getAgent('migration_planner')
  const raw = await llmClient.runAgent(agent, input, getAgentTools(agent), toolExecutor)
  return validateMigrationPlan(raw)
}
