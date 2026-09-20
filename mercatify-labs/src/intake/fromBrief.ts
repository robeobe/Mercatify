/**
 * Jedyna brama między briefem klienta a silnikiem.
 *
 * `StackBrief` to kształt, który produkuje formularz przyjęcia
 * (`assets/stack-tool/intake.html`, funkcja `brief()`) i który leży w
 * `src/__tests__/fixtures/voltix-brief.json`. `ConsolidationRequest`
 * (`src/contract.ts`) to kształt, który czyta `Orchestrator`. Do tej pory nic
 * nie łączyło jednego z drugim: brief był formatem, którego nikt nie czytał,
 * a każdy przebieg zaczynał się od ręcznie przepisanego requestu.
 *
 * Wzorzec jest ten sam co w `readBlueprintFile` (`bin/preview-cli.ts`) i w
 * `validateScreens` (`src/preview/validateScreens.ts`):
 *
 *  1. Kształt sprawdzamy ZANIM cokolwiek pojedzie dalej. Brief przychodzi z
 *     przeglądarki albo z pliku od klienta - `unknown`, nie `StackBrief`.
 *     TypeScript nie broni tu niczego; obroną jest ten kod. Żadnego `as` na
 *     danych z zewnątrz.
 *  2. Wynik jest BUDOWANY OD NOWA, pole po polu. Cokolwiek wywołujący dokleił
 *     w pliku obok kontraktu (`pains`, `mustKeep`, `contact`, `termEnds`,
 *     `readWhat`), nie jedzie do silnika ani do promptu.
 *  3. Jest sufit rozmiaru. Cały request ląduje w prompcie agenta
 *     (`llmClient.ts` robi `JSON.stringify(input)`), a brief z przeglądarki
 *     nie miał żadnego ograniczenia.
 *  4. Każdy błąd nazywa POLE, którego dotyczy - razem ze ścieżką
 *     (`tools[2].modules[0].caps[1]`), bo brief bywa długi i "zły brief" nie
 *     mówi klientowi, co poprawić.
 *
 * Czego ten plik NIE robi: nie zgaduje kosztów. `costs.omOperatingCost` i
 * `costs.implementationCost` to wejścia konsultanta, nie klienta - w briefie
 * ich nie ma i nie wolno ich wyliczyć (żelazna zasada #2, SPEC.md §2).
 * Dlatego są drugim argumentem funkcji, a nie polem szukanym w pliku.
 */
import type { ConsolidationRequest, SaaSToolSubmission } from '../contract'

/**
 * Skąd wiemy to, co piszemy o module. Ta sama trójka co `EvidenceKind` w
 * `src/report/model.ts`, ale zadeklarowana tutaj osobno z rozmysłem: brief
 * jest WEJŚCIEM, a `report/model.ts` jest WYJŚCIEM, i brama wejściowa nie ma
 * powodu zależeć od kształtu raportu.
 */
export type BriefEvidenceKind = 'observed' | 'inferred' | 'estimated'

const EVIDENCE_KINDS: readonly BriefEvidenceKind[] = Object.freeze([
  'observed',
  'inferred',
  'estimated',
])

/**
 * `v: 1` to kształt, który emitują OBA żywe formularze przyjęcia
 * (`assets/stack-tool/intake.html`, `assets/client/intake.html`); `v: 2`
 * dokłada pola, które konsultant uzupełnia po rozmowie. Upgrader z v1 do v2
 * jest w `normalizeBrief` i sprowadza się do jednej decyzji: brief bez
 * deklaracji dowodu dostaje `inferred`.
 */
export const SUPPORTED_BRIEF_VERSIONS: readonly number[] = Object.freeze([1, 2])

/** Jedyna wartość `kind`, jaką ten pakiet uznaje za brief. */
export const BRIEF_KIND = 'mercatify-brief'

/**
 * Domyślny rodzaj dowodu dla briefu `v: 1`.
 *
 * `inferred`, nie `observed`: v1 nie ma gdzie zapisać, że ktokolwiek to
 * widział, więc wpisanie `observed` byłoby wymyśleniem dowodu - dokładnie tym,
 * przed czym kolumna "Observed / Inferred / Estimated" ma bronić raport.
 * `estimated` też nie, bo nikt niczego nie szacował.
 */
export const DEFAULT_EVIDENCE_KIND: BriefEvidenceKind = 'inferred'

/*
 * SUFITY ROZMIARU. Brief pochodzi z przeglądarki albo z pliku od klienta i
 * nie ma żadnego naturalnego ograniczenia - a jego zawartość w całości
 * przechodzi do `mapCapabilities` i do promptu agenta. Wartości są hojne
 * wobec realnego stosu (Voltix: 7 narzędzi, 8 modułów, 15 zdolności) i wciąż
 * daleko od wyczerpania kontekstu modelu.
 */
const MAX_TOOLS = 100
const MAX_MODULES_PER_TOOL = 50
const MAX_CAPABILITIES_PER_MODULE = 50
const MAX_TEXT_CHARS = 4000

export interface NormalizedBriefModule {
  name: string
  desc: string
  caps: string[]
  evidenceKind: BriefEvidenceKind
  evidenceNote: string
}

export interface NormalizedBriefTool {
  name: string
  category: string
  /** Pominięte, gdy brief nie podaje liczby stanowisk - nie zgadujemy zera. */
  seatCount?: number
  /**
   * Cena miesięczna albo `null` - NIGDY zero. Powód i granica: `readMonthlyCost`.
   */
  monthlyCost: number | null
  modules: NormalizedBriefModule[]
}

/** Brief po walidacji i po upgradzie z `v: 1`: jeden kształt dla wszystkich wersji. */
export interface NormalizedBrief {
  company: { name: string; industry: string; people: number }
  currency: string
  tools: NormalizedBriefTool[]
}

function fail(path: string, expected: string): never {
  throw new Error(`[mercatify-labs] brief ${path}: expected ${expected}`)
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'a JSON object')
  }
  return value as Record<string, unknown>
}

/**
 * `Array.isArray` przechodzi na tablicy rzadkiej, a `.map()` zachowuje dziury -
 * deklarowana tablica stringów zawierałaby wtedy `undefined`. Ta sama kontrola
 * co w `validateScreens`.
 */
function asDenseArray(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(path, 'an array')
  if (Object.keys(value).length !== value.length) fail(path, 'a dense array without holes')
  if (value.length > max) fail(path, `at most ${max} entries, got ${value.length}`)
  return value
}

/** Tekst, który wolno zostawić pustym (`industry` w briefie Voltixa jest pusty). */
function asText(value: unknown, path: string): string {
  if (value === undefined) return ''
  if (typeof value !== 'string') fail(path, 'a string')
  if (value.length > MAX_TEXT_CHARS) {
    fail(path, `at most ${MAX_TEXT_CHARS} characters, got ${value.length}`)
  }
  return value
}

/** Tekst, bez którego wiersz raportu nie ma tożsamości - `" "` to też brak. */
function asNonBlankText(value: unknown, path: string): string {
  const text = asText(value, path)
  if (text.trim().length === 0) fail(path, 'a non-blank string')
  return text
}

/** Pieniądze i liczności: skończone, nieujemne, nigdy `NaN` z pustego inputu. */
function asNonNegativeNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(path, `a finite number >= 0, got ${JSON.stringify(value)}`)
  }
  return value
}

function asNonNegativeInteger(value: unknown, path: string): number {
  const parsed = asNonNegativeNumber(value, path)
  if (!Number.isInteger(parsed)) fail(path, `a whole number, got ${JSON.stringify(value)}`)
  return parsed
}

/**
 * Cena narzędzia: liczba DODATNIA albo `null`. Nigdy zero.
 *
 * ROZSTRZYGNIĘCIE GRANICY "0 świadome" vs "0 z pustego pola". Oba żywe
 * formularze przyjęcia koercują puste pole ceny do zera - `briefNumber` w
 * `assets/stack-tool/catalog.js` robi dosłownie `return n > 0 ? n : 0`, a
 * `assets/client/intake.html` obiecuje przy tym kliencie wprost: *"Seats and
 * monthly cost are optional, but without them we can only tell you what moves,
 * not what it saves"*. Brief niosący `monthly: 0` znaczy więc "nie podałem"
 * DUŻO CZĘŚCIEJ niż "to jest darmowe", a silnik nie ma drugiego kanału, którym
 * mógłby te dwa przypadki rozróżnić.
 *
 * Przy takiej niejednoznaczności wybieramy odczyt, który NIE MOŻE postawić
 * fałszywego twierdzenia:
 *
 *  - "puste jako zero" drukuje `Licences today $0/mo`, `$0 a year` i
 *    `Net recurring saving −$2,160/yr`, czyli dokument twierdzi, że stos jest
 *    darmowy, a konsolidacja kosztuje. To jest kłamstwo o kliencie.
 *  - "zero jako brak" drukuje "no costs were supplied". Dla pustego pola jest
 *    to prawda, a dla narzędzia naprawdę darmowego - tylko mniej informacji:
 *    darmowe narzędzie wnosi zero do każdej sumy i gasnąc bankuje zero, więc
 *    jedyne, co tracimy, to możliwość wypisania obok niego nic nie wnoszącego
 *    `$0`.
 *
 * Kiedy brief będzie musiał rozróżnić te dwa przypadki, zrobi to POLEM, a nie
 * ponownym odczytem zera - stąd `null` jest już tutaj legalnym wejściem
 * ("wiem, że nie wiem") i czeka na formularz, który potrafi je wysłać.
 * Domyślanie się z samej wartości `0` nigdy nie stanie się poprawne.
 *
 * Brak POLA to nadal błąd: `monthly` jest w kontrakcie briefu wymagane i
 * przemilczenie go znaczyłoby, że nadawca wysłał inny kształt, a nie że klient
 * czegoś nie wiedział.
 */
function readMonthlyCost(value: unknown, path: string): number | null {
  if (value === null) return null
  const amount = asNonNegativeNumber(value, path)
  return amount > 0 ? amount : null
}

/**
 * Upgrader v1 -> v2 siedzi TUTAJ, w jednym miejscu: moduł bez `evidenceKind`
 * dostaje `DEFAULT_EVIDENCE_KIND`. Brief v2, który podaje własną wartość, musi
 * podać jedną z trzech - literówka (`"observ"`) nie przechodzi po cichu jako
 * "coś tam było".
 */
function readEvidenceKind(value: unknown, path: string): BriefEvidenceKind {
  if (value === undefined) return DEFAULT_EVIDENCE_KIND
  if (typeof value !== 'string' || !EVIDENCE_KINDS.includes(value as BriefEvidenceKind)) {
    fail(path, `one of ${EVIDENCE_KINDS.join(', ')}, got ${JSON.stringify(value)}`)
  }
  return value as BriefEvidenceKind
}

function readModule(
  raw: unknown,
  path: string,
  claimedSlugs: Map<string, string>,
): NormalizedBriefModule {
  const record = asRecord(raw, path)

  // Każde pole czytamy RAZ do lokalnej stałej i dalej używamy wyłącznie kopii.
  // Wejście pochodzi z `unknown` i teoretycznie może mieć getter oddający przy
  // drugim odczycie coś innego, niż widział walidator (TOCTOU).
  const name = asText(record.name, `${path}.name`)
  const desc = asText(record.desc, `${path}.desc`)
  const evidenceKind = readEvidenceKind(record.evidenceKind, `${path}.evidenceKind`)
  const evidenceNote = asText(record.evidenceNote, `${path}.evidenceNote`)

  const rawCaps = record.caps
  if (rawCaps === undefined) fail(`${path}.caps`, 'an array of capability slugs')
  const entries = asDenseArray(rawCaps, `${path}.caps`, MAX_CAPABILITIES_PER_MODULE)
  /**
   * Moduł bez zdolności nie ma czego mapować - i nie wolno tego przemilczeć.
   *
   * Dotyczy to wprost narzędzi "custom" z formularza przyjęcia: obie wersje
   * `intake.html` wpisują im `modules: [{ id: 'use', ..., caps: [] }]`. Taki
   * wpis przechodząc dalej byłby narzędziem, które nic nie kosztuje uwagi
   * silnika, znika z tabeli pokrycia i po cichu nie wchodzi do oszczędności.
   * Lepszy błąd z nazwą pola: ktoś musi nadać tej pozycji slug albo ją usunąć.
   */
  if (entries.length === 0) {
    fail(`${path}.caps`, 'at least one capability slug - a module with none cannot be mapped')
  }

  const caps: string[] = []
  for (let i = 0; i < entries.length; i += 1) {
    const slug = asNonBlankText(entries[i], `${path}.caps[${i}]`)
    const claimedBy = claimedSlugs.get(slug)
    if (claimedBy !== undefined) {
      // Ten sam slug dwa razy w JEDNYM narzędziu to jedna praca policzona
      // dwa razy: dwa wiersze mapowania, dwie wypowiedzi w liczniku z sekcji
      // 02 i dwa razy ten sam werdykt w raporcie. Między RÓŻNYMI narzędziami
      // duplikat jest poprawny i istotny - to właśnie duplikacja, którą ten
      // produkt ma pokazywać.
      fail(
        `${path}.caps[${i}]`,
        `a capability this tool has not claimed yet: ${JSON.stringify(slug)} is already declared by ${claimedBy}`,
      )
    }
    claimedSlugs.set(slug, path)
    caps.push(slug)
  }

  return { name, desc, caps, evidenceKind, evidenceNote }
}

function readTool(raw: unknown, path: string): NormalizedBriefTool {
  const record = asRecord(raw, path)

  const name = asNonBlankText(record.name, `${path}.name`)
  // `category` doszło w v2; v1 niesie tylko `kind`. Jedno i drugie opisuje tę
  // samą rzecz - do czego narzędzie służy - więc v1 nie traci nic.
  const rawCategory = record.category
  const category = asText(rawCategory === undefined ? record.kind : rawCategory, `${path}.category`)
  const monthlyCost = readMonthlyCost(record.monthly, `${path}.monthly`)

  const rawSeats = record.seats
  const seatCount = rawSeats === undefined ? undefined : asNonNegativeInteger(rawSeats, `${path}.seats`)

  const rawModules = record.modules
  if (rawModules === undefined) fail(`${path}.modules`, 'an array of modules')
  const entries = asDenseArray(rawModules, `${path}.modules`, MAX_MODULES_PER_TOOL)
  if (entries.length === 0) {
    fail(`${path}.modules`, 'at least one module - a tool with none carries no capability')
  }

  const claimedSlugs = new Map<string, string>()
  const modules = entries.map((entry, i) => readModule(entry, `${path}.modules[${i}]`, claimedSlugs))

  return {
    name,
    category,
    ...(seatCount === undefined ? {} : { seatCount }),
    monthlyCost,
    modules,
  }
}

/**
 * Brief dowolnej wspieranej wersji -> jeden kształt po walidacji.
 *
 * Wydzielone z `briefToRequest`, bo `evidenceKind`/`evidenceNote` nie mają
 * gdzie zamieszkać w `ConsolidationRequest` (kontrakt silnika nie zna pojęcia
 * dowodu), a tabela pokrycia w raporcie ich potrzebuje. Kto renderuje raport,
 * czyta je stąd - zamiast rozbierać surowy brief drugi raz, po swojemu.
 */
export function normalizeBrief(raw: unknown): NormalizedBrief {
  const record = asRecord(raw, 'root')

  const version = record.v
  if (typeof version !== 'number' || !SUPPORTED_BRIEF_VERSIONS.includes(version)) {
    fail('v', `one of ${SUPPORTED_BRIEF_VERSIONS.join(', ')}, got ${JSON.stringify(version)}`)
  }

  // `kind` odróżnia brief od każdego innego JSON-a o podobnym kształcie
  // (`mercatify-case`, `ReportModel`). Bez tej kontroli pomyłka pliku kończy
  // się błędem o brakującym `tools`, który nie mówi, co naprawdę się stało.
  const kind = record.kind
  if (kind !== BRIEF_KIND) {
    fail('kind', `${JSON.stringify(BRIEF_KIND)}, got ${JSON.stringify(kind)}`)
  }

  const companyRecord = asRecord(record.company, 'company')
  const company = {
    name: asNonBlankText(companyRecord.name, 'company.name'),
    industry: asText(companyRecord.industry, 'company.industry'),
    people: asNonNegativeInteger(companyRecord.people, 'company.people'),
  }

  const currency = asNonBlankText(record.currency, 'currency')

  const rawTools = record.tools
  if (rawTools === undefined) fail('tools', 'an array of tools')
  const entries = asDenseArray(rawTools, 'tools', MAX_TOOLS)
  if (entries.length === 0) fail('tools', 'at least one tool')
  const tools = entries.map((entry, i) => readTool(entry, `tools[${i}]`))

  return { company, currency, tools }
}

function readCosts(raw: unknown): ConsolidationRequest['costs'] {
  const record = asRecord(raw, 'costs')
  return {
    omOperatingCost: asNonNegativeNumber(record.omOperatingCost, 'costs.omOperatingCost'),
    implementationCost: asNonNegativeNumber(record.implementationCost, 'costs.implementationCost'),
  }
}

/**
 * Brief klienta + koszty konsultanta -> `ConsolidationRequest` gotowy dla
 * `Orchestrator.run()`.
 *
 * Mapowanie jest płaskie i jawne:
 *   `tools[].modules[].caps[]` -> `stack[].capabilities[]` (jedna zdolność na slug)
 *   `tools[].monthly`          -> `stack[].monthlyCost`
 *   `tools[].seats`            -> `stack[].seatCount`
 *   `company.people`           -> `company.employees`
 *
 * `importance` zostaje NIEUSTAWIONE. Brief nie pyta klienta, czy dana praca
 * jest krytyczna, a `Orchestrator` i tak domyśla `core` - wpisanie tego tutaj
 * udawałoby, że klient to zadeklarował. `processHint` i `scenarioLabel` z tego
 * samego powodu nie powstają z `pains`/`mustKeep`.
 */
export function briefToRequest(raw: unknown, costs: unknown): ConsolidationRequest {
  const brief = normalizeBrief(raw)
  const validatedCosts = readCosts(costs)

  const stack: SaaSToolSubmission[] = brief.tools.map((tool) => ({
    name: tool.name,
    category: tool.category,
    // `SaaSToolSubmission.monthlyCost` jest w kontrakcie silnika LICZBĄ i taką
    // zostaje: rozszerzanie go o `null` ruszyłoby `computeScenario`,
    // `mapCapabilities` i każdy deskryptor agenta, a żadna z tych rzeczy nie
    // opowiada o pieniądzach W DOKUMENCIE. Zero jedzie więc tylko do
    // `scenario`, z którego raport czyta WYŁĄCZNIE `retainedSaaS` - lista nazw,
    // nie kwota (`buildReport.ts`, wywołanie `buildMoney`). Do `facts` kwoty
    // wchodzą osobną drogą, z `NormalizedBriefTool.monthlyCost`, gdzie brak
    // pozostaje brakiem.
    monthlyCost: tool.monthlyCost ?? 0,
    ...(tool.seatCount === undefined ? {} : { seatCount: tool.seatCount }),
    capabilities: tool.modules.flatMap((module) =>
      module.caps.map((capability) => ({ capability, usageDescription: module.desc })),
    ),
  }))

  return {
    company: {
      name: brief.company.name,
      industry: brief.company.industry,
      employees: brief.company.people,
      currency: brief.currency,
    },
    stack,
    costs: validatedCosts,
  }
}
