import { getAgent, getAgentTools } from './agentLoader'
import type { LlmClient, ToolExecutor } from './llmClient'
import { writePreview, type PreviewManifest } from './preview/renderPreview'
import { validateScreens } from './preview/validateScreens'
import type { ScreenSpec } from './preview/templates'

export interface SandboxEngineerInput {
  company: unknown
  blueprint: unknown
  mappings: unknown
}

export interface SandboxEngineerResult {
  screens: ScreenSpec[]
}

/**
 * Uruchamia agenta Sandbox Engineer (agents/sandbox_engineer.json). Agent
 * WYBIERA szablony i wypełnia je danymi - nie oddaje HTML. Sam HTML powstaje
 * niżej, w czystej funkcji (SPEC.md §11.1).
 *
 * Wynik przechodzi przez `validateScreens`, a nie przez `as`. `runAgent`
 * zwraca `unknown` po `parseJsonLoosely` (`src/llmClient.ts:121`) i niczego
 * nie sprawdza - `strict: true` w żądaniu to prośba do serwera, nie gwarancja.
 *
 * Wejście jedzie JAWNIE w `input` (SPEC.md §2 zasada 5): nie ma tu historii
 * rozmowy ani kanału agent-agent, a `getAgentTools` oddaje pustą listę, bo
 * deskryptor deklaruje `"tools": []` - ten agent nie ma dostępu do sieci.
 */
export async function planScreens(
  llmClient: LlmClient,
  toolExecutor: ToolExecutor,
  input: SandboxEngineerInput,
): Promise<SandboxEngineerResult> {
  const agent = getAgent('sandbox_engineer')
  // Przebudowa pole po polu, NIE przekazanie obiektu wywołującego. SPEC.md §11.1
  // mówi, że wejściem Sandbox Engineera jest `ConsolidationResult` - czyli
  // najbardziej naturalne wywołanie niesie też `scenario` i `narrative`, a
  // `JSON.stringify(input)` wysłałby je do promptu w całości. TypeScript tego
  // nie łapie: nadmiarowe pola są zgłaszane tylko na literale, nigdy na
  // zmiennej ani na spreadzie.
  //
  // Dwa powody, oba z SPEC.md §2 zasada 5 ("passes only what that step needs"):
  // `narrative` to tekst NAPISANY PRZEZ INNEGO AGENTA, więc jego przekazanie
  // tworzy kanał agent-agent przepuszczony przez obiekt wywołującego; a liczby
  // ze `scenario` trafiłyby do agenta, który wypełnia komórki renderowane do
  // HTML dla interesariusza - SPEC.md §10 dokumentuje przebieg, w którym agent
  // przepisał 21 000 jako 6 000.
  const raw = await llmClient.runAgent(
    agent,
    { company: input.company, blueprint: input.blueprint, mappings: input.mappings },
    getAgentTools(agent),
    toolExecutor,
  )
  return { screens: validateScreens(raw) }
}

/**
 * Pełna ścieżka: agent planuje ekrany, deterministyczny renderer zapisuje je
 * na dysk i zwraca manifest. To manifest, nie HTML, jedzie dalej do QA.
 *
 * Kolejność jest kontraktem: `planScreens` musi się skończyć ZANIM cokolwiek
 * dotknie dysku. Odrzucony wynik agenta (pusta lista, zły `kind`, duplikat
 * nazwy) nie zostawia w `outDir` ani jednego pliku, bo `writePreview` nigdy
 * nie zostaje zawołane; samo `writePreview` renderuje cały HTML do pamięci
 * przed pierwszym zapisem, więc żaden błąd PRE-FLIGHT (zła nazwa, duplikat,
 * nieznany `kind`, niepoprawna data) nie zostawia połowy podglądu. To NIE jest
 * atomowość wobec awarii systemu plików: ENOSPC czy EACCES na pliku N z M
 * zostawia N-1 plików i tego pre-flight nie eliminuje (`renderPreview.ts`).
 */
export async function generatePreview(
  llmClient: LlmClient,
  toolExecutor: ToolExecutor,
  input: SandboxEngineerInput,
  outDir: string,
): Promise<PreviewManifest> {
  const { screens } = await planScreens(llmClient, toolExecutor, input)
  return writePreview(screens, outDir)
}
