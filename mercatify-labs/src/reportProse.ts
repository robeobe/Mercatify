import { getAgent, getAgentTools } from './agentLoader'
import type { CatalogCuratorResult } from './catalogCurator'
import type { LlmClient, ToolExecutor } from './llmClient'
import { assertNoFigures } from './report/assertNoFigures'
import type {
  EvidenceKind,
  ProseFinding,
  ProseGap,
  ProseNextStep,
  ProseRisk,
  ReportCompany,
  ReportGap,
  ReportProse,
  StatementCounts,
  Wave,
} from './report/model'
import { slotsIn } from './report/slots'
import type { Confidence, Decision, MercatoMappingResult } from './types'

/**
 * TRZEJ AGENCI PROZY - jedyne miejsce w tym pakiecie, w którym model pisze
 * zdania trafiające do raportu klienta.
 *
 * Plik żyje POZA `src/report/`, choć produkuje `ReportProse`: `src/report/`
 * jest deterministycznym rdzeniem raportu (fakty, sloty, renderer) i nie ma
 * tam ani jednego wywołania LLM. Granica katalogu jest tu tym samym podziałem
 * co `facts` / `prose` w `ReportModel` - po jednej stronie to, co policzyła
 * czysta funkcja, po drugiej to, co napisał agent.
 *
 * TRZY RZECZY, KTÓRE TEN PLIK GWARANTUJE, każda w kodzie, nie w promptcie:
 *
 * 1. ŻADEN AGENT NIE DOSTAJE KWOTY. Wejście jest przebudowywane pole po polu
 *    i każde pole PIENIĘŻNE jest po drodze wycinane - `Wave.monthlyBanked`
 *    nigdy nie jedzie do promptu. Agent, który nie widział liczby, nie ma jak
 *    jej przekłamać; to jest mocniejsze niż `assertNoFigures`, który łapie
 *    dopiero skutek. SPEC.md §10 opisuje przebieg, w którym agent FinOps
 *    napisał "EUR 6,000 / 24 months" przy prawdziwych EUR 21,000 / ~6,9 -
 *    tamten agent te liczby widział.
 * 2. ŻADEN AGENT NIE PODAJE LICZBY, tylko SLOT. Wynik przechodzi przez
 *    `assertNoFigures` (`src/report/assertNoFigures.ts`) ZANIM wróci do
 *    wywołującego, więc cyfra, która nie jest ani slotem, ani liczbą po
 *    słowie-etykiecie, jest głośnym błędem, a nie zdaniem u klienta.
 * 3. KAŻDY SLOT DA SIĘ ROZWIĄZAĆ. `assertSlotsAddressable` sprawdza przez
 *    `slotsIn` kształt każdej ścieżki ORAZ - dla `wave.<n>` i `stack.<tool>` -
 *    czy nazwany obiekt w ogóle istnieje w tym przebiegu. `{wave.9.…}` w
 *    przebiegu o czterech falach pada tutaj, z nazwiskiem agenta, a nie pół
 *    pipeline'u dalej w rendererze.
 *
 * Wejście każdego agenta jest budowane POLE PO POLU, nigdy przez przekazanie
 * obiektu wywołującego (żelazna zasada 5, SPEC.md §2 - ten sam powód, który
 * `src/sandboxEngineer.ts` opisuje przy `narrative` i `scenario`): TypeScript
 * zgłasza nadmiarowe pola wyłącznie na literale, więc `JSON.stringify(input)`
 * wysłałby do promptu wszystko, co wywołujący doczepił obok kontraktu.
 */

// --- Wejścia ----------------------------------------------------------------

/**
 * Jak wiemy to, co piszemy w wierszu - materiał, z którego Risk Analyst robi
 * ryzyko. `inferred` i `estimated` to ryzyka, `observed` nim nie jest.
 *
 * Kształt jest PODZBIOREM `CoverageRow` (`src/report/model.ts`), a nie nim
 * samym: `CoverageRow` niesie `monthly`, czyli kwotę, a do agenta prozy kwota
 * nie jedzie. Osobny typ zamiast `Pick<>`, żeby wywołujący bez tabeli pokrycia
 * (sam brief) też miał co podać.
 */
export interface ReportEvidenceNote {
  tool: string
  capability: string
  evidenceKind: EvidenceKind
  evidenceNote: string
}

export interface ReportEditorInput {
  company: ReportCompany
  waves: readonly Wave[]
  mappings: readonly MercatoMappingResult[]
  counts: StatementCounts
}

export interface ReportRiskAnalystInput {
  mappings: readonly MercatoMappingResult[]
  waves: readonly Wave[]
  evidenceKinds: readonly ReportEvidenceNote[]
  gaps: readonly ReportGap[]
}

/**
 * Wejście czytelnika luk. `gap` jest `ReportGap`, nie `CatalogGap`, z dwóch
 * powodów: `described` ("jak klient to opisał") jest jedyną treścią, na której
 * ten agent może się oprzeć, a `id` jest etykietą Appendixu B, którą wrapper
 * STEMPLUJE na wyniku - agent jej nie widzi i nie ma jak jej przekłamać.
 */
export interface ReportGapReaderInput {
  gap: ReportGap
  proposal: CatalogCuratorResult
}

// --- Wyniki -----------------------------------------------------------------

export interface ReportEditorResult {
  recommendation: string
  findings: ProseFinding[]
  basisIntro: string
  disclaimer: string
}

export interface ReportRiskAnalystResult {
  risks: ProseRisk[]
  nextSteps: ProseNextStep[]
}

/** Jeden wpis `prose.gaps[]`, sparowany z `facts.gaps[]` przez `gapId`. */
export type ReportGapReaderResult = ProseGap

// --- Kształty jadące do promptu ---------------------------------------------

/**
 * Fala tak, jak widzi ją agent prozy. Różnica wobec `Wave` jest celowa i jest
 * gwarancją nr 1 z góry pliku: NIE MA `monthlyBanked`. Agent zna kształt
 * przebiegu (numer, tytuł, tygodnie, co gaśnie, co się zwęża, co ta fala
 * domyka) i nie zna ani jednej kwoty - kwotę wstawia renderer ze slotu.
 *
 * `hours`, `weekFrom` i `weekTo` zostają: to CZAS, nie pieniądz. Dzięki nim
 * agent może napisać "the first four weeks" słowem, tak jak robi to złoty
 * raport; przepisanie ich cyfrą łapie `assertNoFigures`.
 */
interface PromptWave {
  n: number
  title: string
  weekFrom: number
  weekTo: number
  hours: number
  hoursAreFloor: boolean
  toolsOff: string[]
  toolsReduced: string[]
  bankedFromMonth: number
  scope: Array<{ source: string; capability: string; decision: Decision }>
}

/** Mapowanie bez `customEffortHours` - godziny to wielkość, nie kształt. */
interface PromptMapping {
  capability: string
  source: string
  targetFeature: string
  decision: Decision
  confidence: Confidence
  evidence: string
}

function toPromptWaves(waves: readonly Wave[]): PromptWave[] {
  assertDenseArray(waves, 'waves')
  return waves.map((wave, index) => {
    assertObject(wave, `input.waves[${index}]`)
    const scope = Array.isArray(wave.scope) ? wave.scope : []
    return {
      n: wave.n,
      title: wave.title,
      weekFrom: wave.weekFrom,
      weekTo: wave.weekTo,
      hours: wave.hours,
      hoursAreFloor: wave.hoursAreFloor,
      toolsOff: [...(Array.isArray(wave.toolsOff) ? wave.toolsOff : [])],
      toolsReduced: [...(Array.isArray(wave.toolsReduced) ? wave.toolsReduced : [])],
      bankedFromMonth: wave.bankedFromMonth,
      // `monthlyBanked` NIE JEST tu przepisywane - to jedyne pole czysto
      // pieniężne fali i gwarancja nr 1 tego pliku polega właśnie na jego
      // nieobecności. Ze `scope` wypada z tego samego powodu `estimatedHours`:
      // to ta liczba, którą złoty raport niesie jako "40 of the 45 hours".
      scope: scope.map((item) => ({
        source: item.source,
        capability: item.capability,
        decision: item.decision,
      })),
    }
  })
}

function toPromptMappings(mappings: readonly MercatoMappingResult[]): PromptMapping[] {
  assertDenseArray(mappings, 'mappings')
  return mappings.map((mapping, index) => {
    assertObject(mapping, `input.mappings[${index}]`)
    return {
      capability: mapping.capability,
      source: mapping.source,
      targetFeature: mapping.targetFeature,
      decision: mapping.decision,
      confidence: mapping.confidence,
      evidence: mapping.evidence,
    }
  })
}

/**
 * Wejście jest typowane, ale wrappery są publicznym API, do którego host wchodzi
 * własnym JSON-em - typ nie jest tu obroną. Bez tej bramy zły kształt wejścia
 * wychodzi jako `undefined` w promptcie (`JSON.stringify` po cichu wycina klucz
 * o wartości `undefined`), a model i tak wydaje prozę.
 */
function assertDenseArray(value: unknown, field: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `[mercatify-labs] reportProse: input.${field} must be an array, got ${JSON.stringify(value)}`,
    )
  }
  // Tablica z dziurą przechodzi przez `Array.isArray`, a `map` dziurę POMIJA -
  // do promptu pojechałaby wtedy lista krótsza niż ta, na której zbudowaliśmy
  // zakres slotów.
  if (Object.keys(value).length !== value.length) {
    throw new Error(`[mercatify-labs] reportProse: input.${field} must be a dense array without holes`)
  }
}

function assertObject(value: unknown, where: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`[mercatify-labs] reportProse: ${where} must be an object, got ${JSON.stringify(value)}`)
  }
}

// --- Sloty ------------------------------------------------------------------

/**
 * Co agent MOŻE zaadresować slotem w tym przebiegu.
 *
 * `stackTools` pochodzi z `mappings[].source`, bo dokładnie tę listę nazw
 * agent widzi w swoim wejściu - i jest to ta sama nazwa, którą niesie
 * `StackRow.tool` (`mapCapabilities` bierze `source` z `SaaSProductInput.name`,
 * czyli z tej samej nazwy produktu, z której powstaje wiersz stacku). Nie jest
 * nią natomiast `Wave.toolsOff`, gdzie stoi skrócona etykieta z
 * `canonicalToolLabel` ("HubSpot" zamiast "HubSpot Sales") - slot z etykietą
 * padłby dopiero w rendererze.
 */
export interface SlotScope {
  waveNumbers: readonly number[]
  stackTools: readonly string[]
}

/** Głowy ścieżek dwuczłonowych; `stack` jest i tu (sumy), i w `stack.<tool>.<f>`. */
const TWO_PART_HEADS: ReadonlySet<string> = new Set([
  'kpis',
  'cash',
  'counts',
  'meta',
  'company',
  'money',
  'stack',
])

const ALLOWED_SHAPES =
  'kpis.<f>, cash.<f>, counts.<f>, meta.<f>, company.<f>, money.<f>, stack.<f> (totals), wave.<n>.<f>, stack.<tool>.<f>'

/**
 * Sprawdza KSZTAŁT każdego slotu w jednym polu prozy i - tam, gdzie się da -
 * jego ADRESATA.
 *
 * Nazwa pola-liścia (`kpis.netRecurringAnnual`) NIE jest tu sprawdzana i to
 * jest świadome: sprawdzenie wymagałoby powtórzenia listy pól `ReportFacts` w
 * drugim pliku, a lista, która rozjedzie się z modelem, kłamie głośniej, niż
 * milczy. Nieznany liść rzuca w `resolveSlots` z listą dostępnych pól - o pół
 * pipeline'u później, ale nadal głośno i nadal przed klientem.
 */
function assertSlotsAddressable(text: string, where: string, scope: SlotScope): void {
  for (const path of slotsIn(text)) {
    const parts = path.split('.')
    const head = parts[0]

    if (parts.length === 2 && TWO_PART_HEADS.has(head)) {
      if (parts[1].trim().length === 0) {
        throw new Error(`[mercatify-labs] ${where}: "{${path}}" names no field after "${head}".`)
      }
      continue
    }

    if (parts.length === 3 && head === 'wave') {
      const n = Number(parts[1])
      if (!Number.isInteger(n) || !scope.waveNumbers.includes(n)) {
        throw new Error(
          `[mercatify-labs] ${where}: "{${path}}" names wave ${parts[1]}, but this run has waves ` +
            `${scope.waveNumbers.join(', ') || '(none)'}.`,
        )
      }
      if (parts[2].trim().length === 0) {
        throw new Error(`[mercatify-labs] ${where}: "{${path}}" names no field after the wave number.`)
      }
      continue
    }

    if (parts.length === 3 && head === 'stack') {
      // Porównanie DOKŁADNE, bez normalizacji - tak samo jak w `resolveSlots`.
      // Luźne dopasowanie zamieniłoby literówkę w cichą podmianę jednego
      // narzędzia na drugie, a stąd na złą kwotę w zdaniu o pieniądzach.
      if (!scope.stackTools.includes(parts[1])) {
        throw new Error(
          `[mercatify-labs] ${where}: "{${path}}" names tool ${JSON.stringify(parts[1])}, which is not ` +
            `one of the tools this agent was shown: ${scope.stackTools.join(', ') || '(none)'}.`,
        )
      }
      if (parts[2].trim().length === 0) {
        throw new Error(`[mercatify-labs] ${where}: "{${path}}" names no field after the tool name.`)
      }
      continue
    }

    throw new Error(
      `[mercatify-labs] ${where}: "{${path}}" is not an allowed slot shape. Allowed: ${ALLOWED_SHAPES}. ` +
        `(A tool name containing a dot cannot be addressed by a slot at all.)`,
    )
  }
}

/**
 * Wariant dla agenta, który nie dostał ŻADNYCH faktów - czytelnika luk.
 * Slot jest tam zgadywaniem wartości, której agent nie widział, więc klamra
 * gdziekolwiek w odpowiedzi jest błędem, a nie niedozwolonym kształtem.
 */
function assertNoSlots(text: string, where: string): void {
  const used = slotsIn(text)
  if (used.length === 0) return
  throw new Error(
    `[mercatify-labs] ${where}: writes slot(s) ${used.map((p) => `"{${p}}"`).join(', ')}, but this agent ` +
      `is given no computed figures, so it has nothing to address. Write the sentence without a quantity.`,
  )
}

/** Każdy string zbudowanego fragmentu prozy, ze ścieżką do komunikatu błędu. */
function eachProseString(value: unknown, path: string, visit: (path: string, text: string) => void): void {
  if (typeof value === 'string') {
    visit(path, value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => eachProseString(item, `${path}[${index}]`, visit))
    return
  }
  if (typeof value !== 'object' || value === null) return
  for (const [key, nested] of Object.entries(value)) {
    eachProseString(nested, path.length === 0 ? key : `${path}.${key}`, visit)
  }
}

/**
 * Obie bramy prozy naraz, na GOTOWYM fragmencie `ReportProse` - czyli na tym
 * samym obiekcie, który pojedzie do `buildReport`, a nie na surowej odpowiedzi
 * modelu. `scope === null` znaczy "ten agent nie ma prawa do żadnego slotu".
 */
function assertProseIsSafe(fragment: ReportProse, agentId: string, scope: SlotScope | null): void {
  assertNoFigures(fragment)
  eachProseString(fragment, '', (path, text) => {
    const where = `${agentId}.${path}`
    if (scope === null) assertNoSlots(text, where)
    else assertSlotsAddressable(text, where, scope)
  })
}

// --- Wspólne odczyty wyniku modelu ------------------------------------------

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function asRecord(raw: unknown, where: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`[mercatify-labs] ${where}: expected an object, got ${JSON.stringify(raw)}`)
  }
  return raw as Record<string, unknown>
}

/**
 * Jeden odczyt pola, jedna lokalna stała. Odpowiedź przychodzi jako `unknown`
 * i własna implementacja `LlmClient` (SPEC.md §9 wprost do tego zaprasza) może
 * oddać obiekt z getterem, który przy drugim odczycie zwraca co innego - wtedy
 * "zwalidowane" zdanie niosłoby treść, której walidator nigdy nie widział.
 */
function readString(source: Record<string, unknown>, field: string, where: string): string {
  const value = source[field]
  if (!isNonBlankString(value)) {
    throw new Error(
      `[mercatify-labs] ${where}.${field}: expected a non-empty string, got ${JSON.stringify(value)}`,
    )
  }
  return value
}

function readArray(source: Record<string, unknown>, field: string, where: string): unknown[] {
  const value = source[field]
  if (!Array.isArray(value)) {
    throw new Error(
      `[mercatify-labs] ${where}.${field}: expected an array, got ${JSON.stringify(value)}`,
    )
  }
  if (Object.keys(value).length !== value.length) {
    throw new Error(`[mercatify-labs] ${where}.${field}: expected a dense array without holes`)
  }
  if (value.length === 0) {
    throw new Error(
      `[mercatify-labs] ${where}.${field}: expected at least one entry — an empty section is not prose, ` +
        `and a run with nothing to say should omit this agent rather than render an empty heading.`,
    )
  }
  return [...value]
}

// --- Agent 1: Report Editor -------------------------------------------------

/**
 * Walidacja odpowiedzi Report Editora. `runAgent` kończy na `parseJsonLoosely`
 * i zwraca `unknown` - `strict: true` w żądaniu to prośba do serwera, nie
 * gwarancja - więc surowa odpowiedź nie ma prawa wejść do kodu przez `as`.
 *
 * Wynik jest BUDOWANY OD NOWA, pole po polu: pole doklejone obok kontraktu
 * (a `assertNoFigures` mierzył już taki przypadek - `findings[0].id = "actual
 * saving is $6,000/yr"`) nie jedzie dalej razem z prozą.
 */
export function validateEditorResult(raw: unknown, scope: SlotScope): ReportEditorResult {
  const where = 'report_editor'
  const result = asRecord(raw, where)

  const recommendation = readString(result, 'recommendation', where)
  const basisIntro = readString(result, 'basisIntro', where)
  const disclaimer = readString(result, 'disclaimer', where)
  const findings = readArray(result, 'findings', where).map((entry, index) => {
    const item = asRecord(entry, `${where}.findings[${index}]`)
    return {
      heading: readString(item, 'heading', `${where}.findings[${index}]`),
      body: readString(item, 'body', `${where}.findings[${index}]`),
    }
  })

  const validated: ReportEditorResult = { recommendation, findings, basisIntro, disclaimer }
  assertProseIsSafe(validated, where, scope)
  return validated
}

/**
 * Uruchamia agenta Report Editor (agents/report_editor.json) - okładkowa
 * rekomendacja, sekcja 01 i akapit otwierający sekcję 02.
 *
 * Wejście jest przebudowywane pole po polu, a wraz z nim wycięta jest KAŻDA
 * kwota: `Wave.monthlyBanked` nie jedzie do promptu (patrz `PromptWave`).
 * Agent nie ma narzędzi (`"tools": []`), więc `getAgentTools` oddaje pustą
 * listę - nie ma czym sięgnąć po nic spoza tego, co dostał.
 */
export async function writeExecutiveProse(
  llmClient: LlmClient,
  toolExecutor: ToolExecutor,
  input: ReportEditorInput,
): Promise<ReportEditorResult> {
  const company = input.company
  const counts = input.counts
  const waves = toPromptWaves(input.waves)
  const mappings = toPromptMappings(input.mappings)

  const agent = getAgent('report_editor')
  const raw = await llmClient.runAgent(
    agent,
    {
      company: {
        name: company.name,
        industry: company.industry,
        employees: company.employees,
        currency: company.currency,
      },
      waves,
      mappings,
      counts: {
        statements: counts.statements,
        matched: counts.matched,
        offCatalog: counts.offCatalog,
      },
    },
    getAgentTools(agent),
    toolExecutor,
  )
  return validateEditorResult(raw, scopeOf(waves, mappings))
}

// --- Agent 2: Report Risk Analyst -------------------------------------------

/**
 * Numer sekcji ryzyk w raporcie. `ProseRisk.id` jest ETYKIETĄ ("8.1"), nie
 * wielkością - `assertNoFigures` pomija tę ścieżkę strukturalnie - i dlatego
 * stempluje go TEN KOD z pozycji na liście, a nie model. Agent, który nie
 * autoruje numeru, nie ma jak przenumerować sekcji ani wskazać ryzyka, którego
 * nie napisał.
 */
const RISK_SECTION = '8'

/** `risk 8.2` / `risks 8.2` - odwołanie do ryzyka po jego etykiecie. */
const RISK_REFERENCE_RE = /\brisks?\s+#?(\d+\.\d+)/gi

export function validateRiskAnalystResult(raw: unknown, scope: SlotScope): ReportRiskAnalystResult {
  const where = 'report_risk_analyst'
  const result = asRecord(raw, where)

  const risks: ProseRisk[] = readArray(result, 'risks', where).map((entry, index) => {
    const at = `${where}.risks[${index}]`
    const item = asRecord(entry, at)
    return {
      id: `${RISK_SECTION}.${index + 1}`,
      risk: readString(item, 'risk', at),
      basis: readString(item, 'basis', at),
      effect: readString(item, 'effect', at),
      handling: readString(item, 'handling', at),
    }
  })

  const nextSteps: ProseNextStep[] = readArray(result, 'nextSteps', where).map((entry, index) => {
    const at = `${where}.nextSteps[${index}]`
    const item = asRecord(entry, at)
    return {
      action: readString(item, 'action', at),
      owner: readString(item, 'owner', at),
      when: readString(item, 'when', at),
    }
  })

  const validated: ReportRiskAnalystResult = { risks, nextSteps }
  assertProseIsSafe(validated, where, scope)
  assertRiskReferences(validated, where)
  return validated
}

/**
 * "Answer the offline-crew question in risk 8.2" jest LEGALNE dla
 * `assertNoFigures` - `risk` jest słowem-etykietą - więc nic poza tym
 * sprawdzeniem nie zauważyłoby odwołania do ryzyka 8.7 w przebiegu, który ma
 * pięć ryzyk. Klient dostałby wtedy krok wskazujący na wiersz, którego w
 * tabeli nie ma.
 */
function assertRiskReferences(result: ReportRiskAnalystResult, where: string): void {
  const known = new Set(result.risks.map((risk) => risk.id))
  eachProseString(result, '', (path, text) => {
    for (const match of text.matchAll(RISK_REFERENCE_RE)) {
      const referenced = match[1]
      if (known.has(referenced)) continue
      throw new Error(
        `[mercatify-labs] ${where}.${path}: refers to risk ${referenced}, but this run has risks ` +
          `${[...known].join(', ') || '(none)'}. Risks are numbered by position, ${RISK_SECTION}.1 upwards.`,
      )
    }
  })
}

/**
 * Uruchamia agenta Report Risk Analyst (agents/report_risk_analyst.json) -
 * sekcje 08 i 09. Tak jak Editor nie widzi ani jednej kwoty.
 */
export async function writeRiskProse(
  llmClient: LlmClient,
  toolExecutor: ToolExecutor,
  input: ReportRiskAnalystInput,
): Promise<ReportRiskAnalystResult> {
  const waves = toPromptWaves(input.waves)
  const mappings = toPromptMappings(input.mappings)

  assertDenseArray(input.evidenceKinds, 'evidenceKinds')
  const evidenceKinds = input.evidenceKinds.map((note) => ({
    tool: note.tool,
    capability: note.capability,
    evidenceKind: note.evidenceKind,
    evidenceNote: note.evidenceNote,
  }))

  assertDenseArray(input.gaps, 'gaps')
  const gaps = input.gaps.map((gap) => ({
    id: gap.id,
    source: gap.source,
    capability: gap.capability,
    described: gap.described,
  }))

  const agent = getAgent('report_risk_analyst')
  const raw = await llmClient.runAgent(
    agent,
    { mappings, waves, evidenceKinds, gaps },
    getAgentTools(agent),
    toolExecutor,
  )
  return validateRiskAnalystResult(raw, scopeOf(waves, mappings))
}

// --- Agent 3: Report Curator Reader -----------------------------------------

/**
 * `gapId` pochodzi z WEJŚCIA, nie z odpowiedzi modelu: to tożsamość wiersza
 * Appendixu B, po której renderer paruje prozę z faktem (`facts.gaps[].id`).
 * Model, który mógłby ją napisać, mógłby też napisać cudzą - i dwa wiersze
 * tabeli zamieniłyby się treścią bez jednego błędu po drodze.
 */
export function validateGapReaderResult(raw: unknown, gapId: string): ReportGapReaderResult {
  const where = 'report_curator_reader'
  if (!isNonBlankString(gapId)) {
    throw new Error(
      `[mercatify-labs] ${where}: input.gap.id must be a non-empty Appendix B label, got ${JSON.stringify(gapId)}`,
    )
  }
  const result = asRecord(raw, where)

  const whyUnmapped = readString(result, 'whyUnmapped', where)
  const ourRead = readString(result, 'ourRead', where)

  const validated: ReportGapReaderResult = { gapId, whyUnmapped, ourRead }
  // `{ gaps: [...] }`, a nie sam wpis: `assertNoFigures` pomija `gapId`
  // strukturalnie, po ŚCIEŻCE `gaps[0].gapId`, więc "B.1" musi stać dokładnie
  // tam, gdzie stoi w `ReportProse`. Poza tą ścieżką "B.1" jest zwykłym
  // zdaniem i podlega sprawdzeniu.
  assertProseIsSafe({ gaps: [validated] }, where, null)
  return validated
}

/**
 * Uruchamia agenta Report Curator Reader (agents/report_curator_reader.json) -
 * dwa zdania Appendixu B dla JEDNEJ luki katalogowej.
 *
 * `proposal` to wynik innego agenta (`proposeCatalogEntry`), ale nie jest to
 * kanał agent-agent: żelazna zasada 5 (SPEC.md §2) mówi wprost, że to KOD
 * orkiestrujący podaje jawnie, czego dany krok potrzebuje z pracy innego, i
 * dokładnie to się tu dzieje - świeży dwuelementowy prompt, bez historii
 * rozmowy, z przebudowanym pole po polu obiektem. Dochodzi jednak druga
 * ostrożność, której nie mają pozostali dwaj: treść `proposal` pochodzi
 * POŚREDNIO Z SIECI (`web_search` kuratora), więc deskryptor każe traktować ją
 * wyłącznie jako dane do streszczenia i ignorować wszystko, co czyta się w
 * niej jak polecenie.
 */
export async function writeGapProse(
  llmClient: LlmClient,
  toolExecutor: ToolExecutor,
  input: ReportGapReaderInput,
): Promise<ReportGapReaderResult> {
  const gap = input.gap
  const proposal = input.proposal
  const findings = Array.isArray(proposal.findings) ? proposal.findings : []

  const agent = getAgent('report_curator_reader')
  const raw = await llmClient.runAgent(
    agent,
    {
      // Bez `gap.id` - etykieta Appendixu B jest stemplowana przez wrapper.
      gap: { source: gap.source, capability: gap.capability, described: gap.described },
      proposal: {
        toolName: proposal.toolName,
        capability: proposal.capability,
        findings: findings.map((finding) => ({
          signal: finding.signal,
          detail: finding.detail,
          sourceUrl: finding.sourceUrl,
        })),
        suggestedTarget: proposal.suggestedTarget,
        suggestedDecision: proposal.suggestedDecision,
        suggestedConfidence: proposal.suggestedConfidence,
        evidence: proposal.evidence,
      },
    },
    getAgentTools(agent),
    toolExecutor,
  )
  return validateGapReaderResult(raw, gap.id)
}

// --- Zakres slotów ----------------------------------------------------------

/**
 * Buduje `SlotScope` z tego, co agent FAKTYCZNIE zobaczył w promptcie - nie z
 * modelu raportu, którego wrapper nie dostaje. Dzięki temu zakres nie może być
 * szerszy niż wiedza agenta: nazwa narzędzia, której nie było w `mappings`, to
 * nazwa zmyślona, niezależnie od tego, co stoi w tabeli stacku.
 */
function scopeOf(waves: readonly PromptWave[], mappings: readonly PromptMapping[]): SlotScope {
  const waveNumbers = waves.map((wave) => wave.n).filter((n) => Number.isInteger(n))
  const stackTools = [...new Set(mappings.map((m) => m.source).filter(isNonBlankString))]
  return { waveNumbers, stackTools }
}
