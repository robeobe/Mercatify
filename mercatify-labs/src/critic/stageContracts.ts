/**
 * Zamknięte kontrakty, według których Critic ocenia artefakt danego etapu.
 * Krytyk nie wymyśla kryteriów - dostaje tę listę w `input`, a walidator
 * (Task A6.2) odrzuca obiekcję powołującą się na regułę spoza niej.
 */
export type StageName =
  | 'audit'
  | 'mappings'
  | 'blueprint'
  | 'scenario'
  | 'preview'
  | 'migration-plan'
  | 'om-requirements'
  | 'report'

export interface ContractRule {
  id: string
  text: string
}

export interface StageContract {
  stage: StageName
  rules: ContractRule[]
}

export const STAGE_NAMES: readonly StageName[] = Object.freeze([
  'audit',
  'mappings',
  'blueprint',
  'scenario',
  'preview',
  'migration-plan',
  'om-requirements',
  'report',
] as StageName[])

const CONTRACTS: Record<StageName, ContractRule[]> = {
  audit: [
    { id: 'AUD-1', text: 'Every audited product keeps the name it was submitted under.' },
    { id: 'AUD-2', text: 'Every capability key is snake_case and describes a use, not a product feature name.' },
    { id: 'AUD-3', text: 'A capability the catalog does not know is still reported honestly, never renamed to fit.' },
  ],
  mappings: [
    { id: 'MAP-1', text: 'Every capability carries exactly one of native, configure, build, integrate, keep.' },
    { id: 'MAP-2', text: 'Confidence is one of high, medium, low - never a percentage.' },
    { id: 'MAP-3', text: 'An off-catalog capability reads decision build, confidence low, evidence "not in catalog".' },
    { id: 'MAP-4', text: 'Do not propose a different decision; report only that the evidence does not support the one given.' },
  ],
  blueprint: [
    { id: 'BLU-1', text: 'Every entity, workflow and module traces back to at least one mapping.' },
    { id: 'BLU-2', text: 'A custom screen exists only where some capability resolved to build or configure.' },
    { id: 'BLU-3', text: 'Integrations name a tool that the scenario actually retained.' },
  ],
  scenario: [
    { id: 'SCE-1', text: 'A tool is removed only when every one of its capabilities resolved to native, configure or build.' },
    { id: 'SCE-2', text: 'Never state an amount or a number of your own; report only whether the stated inputs and outcome are consistent.' },
    { id: 'SCE-3', text: 'Operating and implementation cost are customer-provided inputs, never derived.' },
  ],
  preview: [
    { id: 'PRE-1', text: 'Every golden-path step a reviewer must complete has a screen that plausibly supports it.' },
    { id: 'PRE-2', text: 'Screen names are unique and usable as file names.' },
    { id: 'PRE-3', text: 'No screen presents invented client facts as if they were real records.' },
  ],
  'migration-plan': [
    { id: 'MIG-1', text: 'Every build or configure mapping has exactly one plan item, and nothing else does.' },
    { id: 'MIG-2', text: 'Never state an amount or a number of your own; effort is the plan author\'s estimate in hours.' },
    { id: 'MIG-3', text: 'The rollout order puts a capability after everything it depends on.' },
  ],
  'om-requirements': [
    { id: 'OMR-1', text: 'Every epic is journey-oriented, not an entity list.' },
    { id: 'OMR-2', text: 'Every story is role-goal-outcome and carries acceptance criteria.' },
    { id: 'OMR-3', text: 'Acceptance criteria cover empty, permission, error, optimistic, undo, keyboard and default-value states.' },
    { id: 'OMR-4', text: 'Every screen in the inventory maps to at least one story id and one requirement section.' },
    { id: 'OMR-5', text: 'The inventory includes first-run, empty, no-access and no-results states, plus role and permission variants.' },
    { id: 'OMR-6', text: 'Every sample value is fictional; no tenant, customer, credential or production identifier appears.' },
  ],
  /*
   * Ósmy etap - cały `ReportModel`, nie pojedynczy artefakt agenta.
   *
   * Te pięć reguł to zapisane wprost obietnice warstwy raportu: podział
   * `facts` / `prose` (REP-1, REP-2), derywacja fal zamiast propozycji
   * (REP-3), dwa modele zwrotu, które muszą wskazywać ten sam miesiąc
   * (REP-4), i uczciwość luki katalogowej (REP-5). Werdykt jest DORADCZY jak
   * każdy inny - `buildReport` niczego z niego nie stosuje i żaden kod
   * wyjścia od niego nie zależy.
   *
   * REP-2 nie powtarza allowlisty `assertNoFigures`, tylko każe krytykowi
   * czytać zdania: strażnik łapie CYFRĘ, a "roughly two thousand dollars a
   * month" cyfry nie ma i przechodzi. Człowiek czytający prozę jest jedyną
   * bramą na tę formę.
   */
  report: [
    { id: 'REP-1', text: 'Every number in the model comes from facts; no number comes from prose.' },
    { id: 'REP-2', text: 'No prose field states an amount, a percentage or a duration - only a slot.' },
    { id: 'REP-3', text: 'Every wave points at least one scope item at a real mapping.' },
    { id: 'REP-4', text: 'kpis.breakEvenMonth agrees with cash.breakEvenMonth.' },
    { id: 'REP-5', text: 'A capability outside the catalog enters no amount.' },
  ],
}

/**
 * Zbiór reguł ma być ZAMKNIĘTY (ryzyko R12). Bez zamrożenia `getStageContract`
 * oddawałby żywą referencję na tablicę modułową: jeden `push` na wyniku
 * trwale rozszerzyłby kontrakt dla wszystkich kolejnych wywołań, a
 * `validateCritique` (Task A6.3) przyjąłby wtedy regułę, której w tym pliku
 * nie ma. Zamrażamy rekurencyjnie: każdą regułę, każdą listę i mapę.
 */
for (const rules of Object.values(CONTRACTS)) {
  for (const rule of rules) Object.freeze(rule)
  Object.freeze(rules)
}
Object.freeze(CONTRACTS)

/**
 * Runtime'owe zawężenie `StageName`. Typ TypeScript znika po kompilacji, a
 * `critique()` jest publicznym API wołanym przez hosta własnym stringiem -
 * bez tego jedyną alternatywą byłoby `as StageName` na surowym `unknown`,
 * czego Global Constraints zabraniają wprost.
 */
export function isStageName(value: unknown): value is StageName {
  return typeof value === 'string' && (STAGE_NAMES as readonly string[]).includes(value)
}

export function getStageContract(stage: StageName): StageContract {
  // `Object.hasOwn`, nie truthy-check: literał obiektowy dziedziczy
  // `Object.prototype`, więc `CONTRACTS['__proto__']`, `['constructor']`,
  // `['toString']` i spółka zwracały prawdę i przepuszczały nie-tablicę dalej.
  if (!Object.hasOwn(CONTRACTS, stage)) {
    throw new Error(`[mercatify-labs] Unknown critic stage: ${stage}`)
  }
  return Object.freeze({ stage, rules: CONTRACTS[stage] })
}
