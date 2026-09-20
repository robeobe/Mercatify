import { getAgent, getAgentTools } from './agentLoader'
import type { LlmClient, ToolExecutor } from './llmClient'
import { getStageContract, isStageName, STAGE_NAMES, type StageName } from './critic/stageContracts'
import { validateCritique, type Critique } from './critic/validateCritique'

export { validateCritique, blockers } from './critic/validateCritique'
export type { Critique, Objection, Severity } from './critic/validateCritique'
export { getStageContract, isStageName, STAGE_NAMES } from './critic/stageContracts'
export type { StageName, StageContract, ContractRule } from './critic/stageContracts'

/**
 * Uruchamia agenta Critic na artefakcie jednego etapu.
 *
 * Krytyk nie rozmawia z krytykowanym agentem (żelazna zasada 5) - artefakt
 * podaje mu ten kod w `input`, tak samo jak każde inne wejście. Wynik jest
 * doradczy: nic nie jest stosowane automatycznie (zasada 4), a wywołujący
 * decyduje, co zrobić z blokerami.
 */
export async function critique(
  llmClient: LlmClient,
  toolExecutor: ToolExecutor,
  stage: StageName,
  artifact: unknown,
): Promise<Critique> {
  // `StageName` znika przy kompilacji, a `critique()` jest publicznym API -
  // host woła je własnym stringiem i TypeScript tego nie widzi. Bez tego
  // zawężenia jedyną alternatywą byłoby `as StageName` na surowym wejściu,
  // czego Global Constraints zabraniają wprost. Sprawdzamy PRZED `getAgent`
  // i przed jakimkolwiek wywołaniem LLM: literówka w nazwie etapu ma kosztować
  // komunikat, nie trzech minut mielenia modelu na kontrakcie, którego nie ma.
  if (!isStageName(stage)) {
    throw new Error(
      `[mercatify-labs] critique: unknown stage "${String(stage)}" - expected one of ${STAGE_NAMES.join(', ')}`,
    )
  }

  const contract = getStageContract(stage)
  const agent = getAgent('critic')
  const raw = await llmClient.runAgent(agent, { stage, artifact, contract }, getAgentTools(agent), toolExecutor)
  return validateCritique(raw, contract)
}
