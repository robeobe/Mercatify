import { getAgent, getAgentTools } from './agentLoader'
import type { LlmClient, ToolExecutor } from './llmClient'
import { validateOmRequirements, type OmRequirements } from './om/validateRequirements'

export { renderRequirementsMarkdown, handoffCommand } from './om/renderRequirements'
export { validateOmRequirements } from './om/validateRequirements'
export type { OmRequirements, Epic, Story, ScreenEntry } from './om/validateRequirements'

export interface OmPrototyperInput {
  company: unknown
  blueprint: unknown
  mappings: unknown
  businessProcess?: unknown
}

/**
 * Uruchamia agenta OM Prototyper i zwraca wejście, którego wymaga skill
 * `om-mockup-prototype` (jego kroki 1 i 2).
 *
 * Ten pakiet NIE buduje prototypu. Skill wymaga checkoutu Open Mercato -
 * swojego skryptu `init-mockup.mjs`, `apps/mercato/src/app/globals.css` i
 * komponentów z `packages/ui/src/backend/` - a Mercatify Labs ma zero
 * zależności od Open Mercato i tak ma zostać (SPEC.md §1). Granica biegnie
 * dokładnie tutaj: my produkujemy wymagania, tamta strona rysuje ekrany.
 */
export async function prepareOmRequirements(
  llmClient: LlmClient,
  toolExecutor: ToolExecutor,
  input: OmPrototyperInput,
): Promise<OmRequirements> {
  const agent = getAgent('om_prototyper')
  const raw = await llmClient.runAgent(agent, input, getAgentTools(agent), toolExecutor)
  return validateOmRequirements(raw)
}
