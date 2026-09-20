import { getCatalogCapability } from '../catalog'
import { findCatalogGaps } from '../catalogGaps'
import { proposeCatalogEntry } from '../catalogCurator'
import { critique, type Critique } from '../critic'
import { attachEffortHours } from '../effortHours'
import { normalizeBrief, briefToRequest } from '../intake/fromBrief'
import type { NormalizedBrief, NormalizedBriefModule } from '../intake/fromBrief'
import type { LlmClient, ToolExecutor } from '../llmClient'
import { planMigration, type MigrationPlanResult } from '../migrationPlanner'
import { Orchestrator } from '../orchestrator'
import { DEFAULT_GOLDEN_PATH, verifyGoldenPath } from '../qaVerifier'
import { generatePreview } from '../sandboxEngineer'
import { localToolExecutor } from '../toolExecutor'
import {
  writeExecutiveProse,
  writeGapProse,
  writeRiskProse,
  type ReportEvidenceNote,
} from '../reportProse'
import type { Confidence, MercatoMappingResult } from '../types'
import { assertNoFigures } from './assertNoFigures'
import { DEFAULT_HORIZON_MONTHS, computeCashSeries } from './cash'
import { OFF_CATALOG_EVIDENCE, resolveStatementCounts, type ProvidedStatementCounts } from './counts'
import { REPORT_GLOSSARY } from './glossary'
import { groupIntoWaves, type WaveStackRow } from './waves'
import type {
  CashSeries,
  CoverageRow,
  CoverageTable,
  ImplementationLine,
  MoneyLine,
  MoneyTable,
  PaidTwiceRow,
  PreviewFacts,
  ReportCompany,
  ReportFacts,
  ReportGap,
  ReportKpis,
  ReportMeta,
  ReportModel,
  ReportParty,
  ReportProse,
  ReportVerdict,
  StackRow,
  StackTable,
  TermType,
  VerdictCounts,
  Wave,
} from './model'

/**
 * `buildReport` - jedna funkcja od briefu klienta do `ReportModel`.
 *
 * To jest KOD ORKIESTRUJĄCY, nie agent, i to jest ta sama decyzja, którą
 * SPEC.md §8 podjął dla `Orchestrator`: sekwencjonowanie typowanych danych
 * między krokami jest robotą workflow, nie wywołania LLM. Przeczytaj komentarz
 * klasowy `src/orchestrator.ts` - ten plik trzyma dokładnie te same trzy
 * obietnice, tylko dla dokumentu zamiast dla JSON-a:
 *
 * 1. KAŻDA LICZBA W `facts` POCHODZI Z CZYSTEJ FUNKCJI. Ani jedna nie jest
 *    czytana z odpowiedzi agenta. Mapowania i werdykty daje
 *    `mapCapabilities` przez `Orchestrator`, fale `groupIntoWaves`, serię
 *    gotówki `computeCashSeries`, liczniki `resolveStatementCounts`, a
 *    tabele i KPI składa `buildFacts` niżej - też czysto, z tych samych
 *    danych. Z agenta wchodzą do dokumentu WYŁĄCZNIE zdania, i to bez ani
 *    jednej cyfry (`assertNoFigures`).
 *
 *    Jedyny wyjątek jest jawny i był nim od SPEC.md §11.2: GODZINY z
 *    Migration Plannera. Wchodzą przez `attachEffortHours`, nigdy nie
 *    dotykają `scenario.implementationCost` i - kiedy konsultant poda własny
 *    plan (`ConsultantInputs.plan`) - agent nie jest o nie nawet pytany.
 *
 * 2. TRYB BEZ LLM JEST PEŁNOPRAWNY. `buildReport` bez `llmClient` oddaje
 *    poprawny `ReportModel` z samym `facts`: wszystkie tabele, wszystkie
 *    liczby, obie figury, bez prozy, bez podglądu i bez krytyki (SPEC.md §8).
 *    Sekcje zdaniowe znikają, zamiast renderować się puste.
 *
 * 3. DEGRADACJA, NIE AWARIA. Każdy krok narracyjny (proza, podgląd, krytyk)
 *    siedzi we własnym `try/catch` - dokładnie jak kroki narracyjne
 *    `Orchestrator`. Padnięcie agenta gubi JEDNĄ sekcję i dopisuje wiersz do
 *    `degradations`; liczb nie rusza.
 *
 *    Jeden wyjątek, i jest nim cel istnienia całej warstwy: agent, który
 *    podał DOSŁOWNĄ LICZBĘ, nie jest degradacją - jest złamaniem kontraktu.
 *    Ciche zgubienie takiej sekcji ukryłoby dokładnie ten błąd, przed którym
 *    `assertNoFigures` powstało (SPEC.md §10), więc ten jeden błąd leci dalej
 *    głośno. Patrz `isFigureViolation`.
 */

// --- Wejścia od człowieka ----------------------------------------------------

/**
 * Warunki umowy jednego narzędzia - z faktury, nie z formularza.
 *
 * `normalizeBrief` świadomie NIE przepuszcza `plan`, `unitPrice`, `termEnds`
 * ani `termType`: brama wejściowa przebudowuje brief pole po polu i oddaje
 * tylko to, czego potrzebuje silnik. Raport potrzebuje więcej - tabela stacku
 * ma kolumnę taryfy i terminu, a `groupIntoWaves` przesuwa falę, żeby zdążyć
 * przed końcem umowy rocznej. Te dane podaje więc konsultant osobno, tak samo
 * jak koszty.
 */
export interface ConsultantToolTerm {
  /** Nazwa narzędzia DOKŁADNIE taka, jak w briefie. Literówka jest błędem, nie ciszą. */
  tool: string
  /** Nazwa taryfy, np. "Sales Professional". */
  plan?: string
  /** Cena za stanowisko. Pominięta -> kolumna pusta, nie zero. */
  unitPrice?: number
  /** ISO 8601 (`YYYY-MM-DD`) albo pusty string. */
  termEnds?: string
  /** Domyślnie `monthly` - umowa bez podanego terminu nie wiąże niczego. */
  termType?: TermType
}

/**
 * Wszystko, czego raport potrzebuje, a czego NIE MA w briefie klienta.
 *
 * Żelazna zasada 2 (SPEC.md §2) mówi o liczbach WYMYŚLANYCH PRZEZ MODEL, nie o
 * liczbach podawanych przez człowieka - `omOperatingCost`, `implementationCost`,
 * stawka i liczniki z sekcji 02 zawsze były wejściem konsultanta
 * (`src/report/counts.ts` opisuje to najdokładniej). Ten obiekt jest tego
 * jawnym miejscem: `buildReport` NICZEGO stąd nie zgaduje i niczego nie
 * wyprowadza z briefu klienta.
 *
 * Pola pieniężne są opcjonalne z powodu scenariusza S2 planu: przebieg, w
 * którym nikt nie podał kosztów platformy ani stawki, ma dać POPRAWNY raport
 * mówiący "nie podano kosztów", a nie wykres z zer.
 */
export interface ConsultantInputs {
  /** Metadane okładki. Przepisywane pole po polu, nigdy przekazywane dalej jako obiekt. */
  meta: ReportMeta
  /** Sekcja 02: co czytaliśmy, za jaki okres, co zostało poza zakresem. */
  basis: { readWhat: string; period: string; exclusions: string }
  /**
   * Roczny koszt utrzymania platformy - ta sama liczba, którą `computeScenario`
   * zna jako `omOperatingCost`. Podaj to ALBO `hostingMonthly`; podanie obu
   * jest legalne tylko wtedy, gdy się zgadzają.
   */
  omOperatingCost?: number
  /** Miesięczna forma tej samej kwoty. Tak ją drukuje sekcja 05 i kafelek KPI. */
  hostingMonthly?: number
  /**
   * Jednorazowy budżet klienta. Jedzie WYŁĄCZNIE do `computeScenario` i nie
   * wchodzi do `facts`: raport kwotuje `godziny * stawka`, bo tę liczbę
   * konsultant obroni linijka po linijce, a budżet klienta jest życzeniem,
   * nie wyceną.
   */
  implementationCost?: number
  /** Stawka blended za godzinę. Brak -> raport bez kosztu wdrożenia i bez Figure 2. */
  rate?: number
  /** Liczniki sekcji 02 z rozpoznania. Brak -> wyprowadzone z mapowań. */
  counts?: ProvidedStatementCounts
  /**
   * Godziny od delivery leada. Kiedy są, Migration Planner NIE JEST wołany -
   * ta sama pierwszeństwo co w `resolveStatementCounts`: liczba od człowieka
   * bije wyprowadzenie, a nie odwrotnie. Dzięki temu przebieg z LLM i bez LLM
   * dają IDENTYCZNE liczby, a różnią się wyłącznie zdaniami.
   */
  plan?: MigrationPlanResult
  /** Start programu, ISO 8601. Bez niego termin roczny nie ma czego wymusić. */
  programmeStart?: string
  /** Przepustowość dostawcza. Domyślnie `DEFAULT_WEEKLY_HOURS` z `waves.ts`. */
  weeklyHours?: number
  /** Horyzont serii gotówki. Domyślnie `DEFAULT_HORIZON_MONTHS`. */
  horizonMonths?: number
  /** Ile miesięcy RYSUJE Figure 2. Decyzja prezentacyjna, patrz `CashSeries`. */
  figureMonths?: number
  /** Taryfy i terminy umów, po jednym wpisie na narzędzie z briefu. */
  terms?: readonly ConsultantToolTerm[]
}

// --- Wejścia techniczne ------------------------------------------------------

export interface BuildReportPreviewOptions {
  /** Katalog na wygenerowany HTML podglądu. Podaje go CZŁOWIEK, nie model. */
  outDir: string
  goldenPath?: readonly string[]
}

export interface BuildReportOptions {
  /** Surowy brief - `unknown`, bo pochodzi z pliku klienta. Bramkuje go `normalizeBrief`. */
  brief: unknown
  consultant: ConsultantInputs
  /**
   * Pominięty -> tryb w pełni deterministyczny: ani jednego wywołania agenta,
   * `prose` nieobecna, `facts.preview` nieobecny, `critique` nieobecna.
   */
  llmClient?: LlmClient
  /** Domyślnie `localToolExecutor`. Kurator luk potrzebuje `createToolExecutor`. */
  toolExecutor?: ToolExecutor
  /** Pominięty -> sekcja 07 nie powstaje (`--no-preview`). */
  preview?: BuildReportPreviewOptions
  /** Domyślnie `true`, gdy jest `llmClient`. Werdykt jest doradczy i nic nie stosuje. */
  runCritic?: boolean
}

/**
 * Wynik przebiegu.
 *
 * `critique` stoi OBOK modelu, nie w nim, i to jest cała jego rola: werdykt
 * krytyka jest doradczy (SPEC.md §8), więc nie ma prawa wejść ani do `facts`,
 * ani do `prose`. Typ mówi to głośniej niż komentarz - nie ma pola, przez
 * które obiekcja mogłaby wpłynąć do dokumentu.
 *
 * `degradations` to lista kroków, które nie miały danych albo padły. Pusta w
 * pełnym przebiegu; w trybie bez LLM wymienia po nazwie każdą sekcję, której
 * ten raport nie ma - żeby "czegoś brakuje" nie trzeba było zgadywać z
 * wyjścia.
 */
export interface BuiltReport {
  model: ReportModel
  critique?: Critique
  /**
   * Propozycja godzin od Migration Plannera, kiedy konsultant swojego planu
   * nie podał. Stoi TUTAJ, obok modelu, a nie w nim - tak samo jak `critique`.
   * Typ jest jedynym miejscem, w którym da się tę zasadę wyrazić tak, żeby jej
   * złamanie nie skompilowało się: `ReportModel` nie ma pola, przez które
   * estymata modelu mogłaby wpłynąć do dokumentu (SPEC.md §11.2).
   *
   * Żeby ją przyjąć, człowiek przekazuje ją z powrotem jako `consultant.plan`.
   */
  suggestedPlan?: MigrationPlanResult
  degradations: string[]
}

// --- Bramy na wejścia konsultanta --------------------------------------------

function fail(detail: string): never {
  throw new Error(`[mercatify-labs] buildReport: ${detail}`)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const TERM_TYPES: readonly TermType[] = Object.freeze(['monthly', 'annual'])

function asText(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(`${path} must be a string, got ${JSON.stringify(value)}`)
  return value
}

function asIsoDateOrEmpty(value: unknown, path: string): string {
  const text = asText(value, path)
  if (text.length === 0) return text
  if (!ISO_DATE.test(text)) fail(`${path} must be an ISO date (YYYY-MM-DD) or empty, got ${JSON.stringify(text)}`)
  return text
}

function asMoney(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${path} must be a finite number >= 0, got ${JSON.stringify(value)}`)
  }
  return value
}

function asParty(value: unknown, path: string): ReportParty {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${path} must be an object with { organization, person, role }`)
  }
  const record: Record<string, unknown> = { ...value }
  return {
    organization: asText(record.organization, `${path}.organization`),
    person: asText(record.person, `${path}.person`),
    role: asText(record.role, `${path}.role`),
  }
}

/**
 * Metadane okładki są PRZEBUDOWYWANE pole po polu, nie przepuszczane obiektem.
 * Ta sama dyscyplina co w `readBlueprintFile` i w `briefToRequest`: cokolwiek
 * wywołujący dokleił obok kontraktu, nie wjeżdża do dokumentu, który pojedzie
 * do klienta.
 */
function readMeta(meta: ReportMeta): ReportMeta {
  if (typeof meta !== 'object' || meta === null) fail('consultant.meta is required')
  const runMinutes = meta.runMinutes
  if (runMinutes !== undefined && (!Number.isFinite(runMinutes) || runMinutes < 0)) {
    fail(`consultant.meta.runMinutes must be a non-negative number, got ${JSON.stringify(runMinutes)}`)
  }
  if (typeof meta.humanReviewed !== 'boolean') {
    fail('consultant.meta.humanReviewed must be a boolean - a document that does not say whether a human read it lies by omission')
  }
  return {
    caseId: asText(meta.caseId, 'consultant.meta.caseId'),
    version: asText(meta.version, 'consultant.meta.version'),
    issued: asIsoDateOrEmpty(meta.issued, 'consultant.meta.issued'),
    validUntil: asIsoDateOrEmpty(meta.validUntil, 'consultant.meta.validUntil'),
    preparedFor: asParty(meta.preparedFor, 'consultant.meta.preparedFor'),
    preparedBy: asParty(meta.preparedBy, 'consultant.meta.preparedBy'),
    ...(runMinutes === undefined ? {} : { runMinutes }),
    humanReviewed: meta.humanReviewed,
    basis: asText(meta.basis, 'consultant.meta.basis'),
    confidentialityNote: asText(meta.confidentialityNote, 'consultant.meta.confidentialityNote'),
  }
}

/**
 * Hosting: roczny i miesięczny to TA SAMA kwota w dwóch formach.
 *
 * Konsultant może podać którąkolwiek - `omOperatingCost` jest nazwą z
 * `ConsolidationRequest`, `hostingMonthly` nazwą z kafelka KPI. Podanie obu
 * jest legalne tylko wtedy, gdy się zgadzają: jeden dokument, w którym sekcja
 * 05 mówi jedno, a silnik ROI drugie, jest gorszy niż brak dokumentu. To ta
 * sama brama co trzy sprawdzenia w `resolveStatementCounts`.
 */
function readHosting(input: ConsultantInputs): { annual: number; monthly: number } | undefined {
  const annual = input.omOperatingCost
  const monthly = input.hostingMonthly
  if (annual === undefined && monthly === undefined) return undefined
  if (annual !== undefined && monthly === undefined) {
    return { annual: asMoney(annual, 'consultant.omOperatingCost'), monthly: asMoney(annual, 'consultant.omOperatingCost') / 12 }
  }
  if (monthly !== undefined && annual === undefined) {
    return { annual: asMoney(monthly, 'consultant.hostingMonthly') * 12, monthly: asMoney(monthly, 'consultant.hostingMonthly') }
  }
  const checkedAnnual = asMoney(annual, 'consultant.omOperatingCost')
  const checkedMonthly = asMoney(monthly, 'consultant.hostingMonthly')
  if (checkedMonthly * 12 !== checkedAnnual) {
    fail(
      `consultant.omOperatingCost (${checkedAnnual}) and consultant.hostingMonthly (${checkedMonthly}) ` +
        `disagree: ${checkedMonthly} a month is ${checkedMonthly * 12} a year. One document cannot carry ` +
        'two answers to the same question - drop one of the two fields.',
    )
  }
  return { annual: checkedAnnual, monthly: checkedMonthly }
}

/**
 * Taryfy i terminy, zindeksowane nazwą narzędzia.
 *
 * Wpis wskazujący narzędzie spoza briefu RZUCA, a nie jest po cichu
 * pomijany - i to jest różnica wobec `attachEffortHours`, które pozycję planu
 * bez pokrycia gubi bez słowa. Tam dane pochodzą od MODELU i zmyślona nazwa
 * nie ma prawa stworzyć wiersza; tutaj pochodzą od CZŁOWIEKA i literówka
 * znaczy, że kolumna terminu jednego narzędzia cicho zostałaby pusta.
 */
function readTerms(
  terms: readonly ConsultantToolTerm[] | undefined,
  known: ReadonlySet<string>,
): Map<string, ConsultantToolTerm> {
  const byTool = new Map<string, ConsultantToolTerm>()
  if (terms === undefined) return byTool
  if (!Array.isArray(terms)) fail('consultant.terms must be an array')
  terms.forEach((entry, index) => {
    const at = `consultant.terms[${index}]`
    if (typeof entry !== 'object' || entry === null) fail(`${at} must be an object`)
    const tool = asText(entry.tool, `${at}.tool`)
    if (!known.has(tool)) {
      fail(
        `${at}.tool names ${JSON.stringify(tool)}, which is not a tool in this brief: ` +
          `${[...known].join(', ') || '(none)'}`,
      )
    }
    if (byTool.has(tool)) fail(`${at}.tool repeats ${JSON.stringify(tool)} - one entry per tool`)
    const termType = entry.termType ?? 'monthly'
    if (!TERM_TYPES.includes(termType)) {
      fail(`${at}.termType must be one of ${TERM_TYPES.join(', ')}, got ${JSON.stringify(entry.termType)}`)
    }
    byTool.set(tool, {
      tool,
      plan: entry.plan === undefined ? '' : asText(entry.plan, `${at}.plan`),
      ...(entry.unitPrice === undefined ? {} : { unitPrice: asMoney(entry.unitPrice, `${at}.unitPrice`) }),
      termEnds: asIsoDateOrEmpty(entry.termEnds ?? '', `${at}.termEnds`),
      termType,
    })
  })
  return byTool
}

// --- Czyste składanie faktów -------------------------------------------------

/**
 * Kolejność werdyktów według PRACY I PIENIĘDZY, nie alfabetu.
 *
 * Wiersz tabeli pokrycia opisuje MODUŁ, a moduł bywa wielozdolnościowy
 * (HubSpot "CRM" to trzy slugi). Czytelnik pyta o taki wiersz jedno: ile mnie
 * to kosztuje. Odpowiada za niego najcięższa zdolność w module - `build` (nowy
 * kod) bije `configure` (ustawienia), `configure` bije `integrate` (licencja
 * zostaje plus kabel), `integrate` bije `keep` (nic się nie zmienia), a
 * `native` jest najlżejsze, bo nie kosztuje nic.
 */
const VERDICT_WEIGHT: Readonly<Record<ReportVerdict, number>> = Object.freeze({
  build: 5,
  configure: 4,
  integrate: 3,
  keep: 2,
  drop: 1,
  native: 0,
})

/** Pewność wiersza to NAJNIŻSZA pewność jego zdolności - moduł nie jest pewniejszy od swojego najsłabszego ogniwa. */
const CONFIDENCE_WEIGHT: Readonly<Record<Confidence, number>> = Object.freeze({ low: 0, medium: 1, high: 2 })

function emptyVerdictCounts(): VerdictCounts {
  return { native: 0, configure: 0, build: 0, integrate: 0, keep: 0, drop: 0, offCatalog: 0 }
}

function isOffCatalog(mapping: MercatoMappingResult): boolean {
  return mapping.evidence === OFF_CATALOG_EVIDENCE
}

/**
 * Werdykt CZYTELNIKA dla jednego mapowania.
 *
 * `mapCapabilities` oddaje pięć `Decision`, a raport zna sześć - `drop`
 * ("nobody would miss it") zachowuje się wobec pieniędzy jak `native`, ale
 * nie wolno przy nim napisać, że platforma to potrafi (`ReportVerdict`,
 * `src/report/model.ts`). Katalog trzyma tę różnicę w `reportVerdict`, a
 * `mapCapabilities` jej nie przenosi, więc odczytujemy ją tutaj - z katalogu,
 * nie z mapowania.
 */
function reportVerdictOf(mapping: MercatoMappingResult, lookup: CatalogVerdictLookup): ReportVerdict {
  return lookup(mapping.source, mapping.capability) ?? mapping.decision
}

type CatalogVerdictLookup = (tool: string, capability: string) => 'drop' | undefined

/** Suma, która zna `null`: jedna nieznana kwota czyni sumę nieznaną, nigdy zerową. */
function sumMoney(values: readonly (number | null)[]): number | null {
  let total = 0
  for (const value of values) {
    if (value === null) return null
    total += value
  }
  return total
}

/**
 * Kwota, której nie ma, ma być `null`, a nie zerem.
 *
 * Port `positiveOrNull` z `assets/shared/report-model.js` - CELOWO to samo
 * pojęcie, nie trzeci wariant. Przeglądarkowy builder `ReportModel` znał tę
 * regułę od początku i dlatego jego dokument mówi "no costs were supplied";
 * silnik jej nie znał i dlatego jego dokument twierdził, że stos jest darmowy.
 * Dwa buildery tego samego typu muszą czytać zero tak samo.
 */
function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

interface StackContext {
  table: StackTable
  /** Wiersze w kształcie, którego chce `groupIntoWaves` - bez taryf i sum. */
  waveRows: WaveStackRow[]
  monthlyByTool: Map<string, number | null>
  /**
   * Czy w tym przebiegu znamy CHOĆ JEDNĄ cenę licencji.
   *
   * Druga połowa portu z `assets/shared/report-model.js` (tamtejsza flaga
   * `hasCosts`): brak kosztów gasi KAŻDĄ linię pieniężną naraz, zamiast
   * pozwolić, żeby część z nich wyszła jako uczciwie policzone zero. Bez tej
   * flagi `sumMoney([])` oddaje `0` dla pustej listy zatrzymanych narzędzi i
   * dokument bez ani jednej faktury drukuje `Licence spend retained −$0`.
   */
  hasCosts: boolean
}

function buildStack(
  brief: NormalizedBrief,
  terms: ReadonlyMap<string, ConsultantToolTerm>,
): StackContext {
  const rows: StackRow[] = brief.tools.map((tool) => {
    const term = terms.get(tool.name)
    const seats = tool.seatCount ?? null
    const monthly = tool.monthlyCost
    return {
      tool: tool.name,
      plan: term?.plan ?? '',
      category: tool.category,
      seats,
      // Cena za stanowisko przechodzi przez tę samą bramę co cena narzędzia:
      // komentarz przy `ConsultantToolTerm.unitPrice` obiecuje "pominięta ->
      // kolumna pusta, nie zero", a `?? null` dotrzymywał tego tylko dla pola
      // POMINIĘTEGO - jawne `unitPrice: 0` szło do tabeli jako `Unit $0`.
      unitPrice: positiveOrNull(term?.unitPrice),
      monthly,
      // `* 12` jest tutaj, a nie w rendererze - renderer formatuje, nie liczy.
      // Nieznana cena daje nieznaną kwotę roczną, nigdy zerową.
      annual: monthly === null ? null : monthly * 12,
      termEnds: term?.termEnds ?? '',
      termType: term?.termType ?? 'monthly',
    }
  })

  const totalSeats = sumMoney(rows.map((row) => row.seats))
  const totalMonthly = sumMoney(rows.map((row) => row.monthly))
  const totalAnnual = sumMoney(rows.map((row) => row.annual))

  return {
    table: {
      rows,
      totalSeats,
      totalMonthly,
      totalAnnual,
      seatDuplicationNote: seatDuplicationNote(totalSeats, brief.company.people),
    },
    waveRows: rows.map((row) => ({
      tool: row.tool,
      monthly: row.monthly,
      termEnds: row.termEnds,
      termType: row.termType,
    })),
    monthlyByTool: new Map(rows.map((row) => [row.tool, row.monthly])),
    hasCosts: rows.some((row) => row.monthly !== null),
  }
}

/**
 * Zdanie o duplikacji stanowisk. Pusty string, gdy nie ma czego porównać albo
 * gdy duplikacji nie ma - raport nie ma udawać ustalenia tam, gdzie go nie ma.
 */
function seatDuplicationNote(totalSeats: number | null, people: number): string {
  if (totalSeats === null || people <= 0 || totalSeats <= people) return ''
  // "across 1 people" podważa zdanie, w którym stoi. `totalSeats` jest tu z
  // definicji > `people` >= 1, więc mnoga forma stanowisk jest pewna, a liczba
  // osób - nie.
  const who = people === 1 ? '1 person' : `${people} people`
  return (
    `${totalSeats} seats across ${who} — the same staff pay for more than one login. ` +
    'Consolidation removes that duplication before it removes any product.'
  )
}

interface CoverageContext {
  table: CoverageTable
  /** Materiał dla Risk Analysta - rodzaj dowodu bez ani jednej kwoty. */
  evidenceNotes: ReportEvidenceNote[]
}

/**
 * Tabela pokrycia: JEDEN WIERSZ NA MODUŁ briefu, nie na slug.
 *
 * Granularność nie jest wyborem estetycznym - `evidenceKind` i `evidenceNote`
 * istnieją w briefie wyłącznie na module, a kolumna "Observed / Inferred /
 * Estimated" jest rdzeniem wiarygodności tego dokumentu. Wiersz na slug
 * musiałby ten sam dowód powtórzyć albo zmyślić.
 *
 * `byVerdict` liczy natomiast MAPOWANIA, czyli pary narzędzie-zdolność, bo
 * Figure 1 pokazuje rozkład zdolności, a nie modułów.
 *
 * TO NIE JEST LICZNIK Z SEKCJI 02 i nigdy nim nie był - ten komentarz twierdził
 * inaczej i był to jeden z dwóch nieprawdziwych opisów tej samej różnicy.
 * Sekcja 02 podaje wypowiedzi klienta z rozpoznania (dla Voltixa 38, od
 * konsultanta), a ta suma - mapowania silnika (15). `src/report/counts.ts`
 * opisuje, dlaczego jednego nie da się wyprowadzić z drugiego, a
 * `templates/coverage.ts` - jak raport mówi o obu, nie myląc ich.
 */
function buildCoverage(
  brief: NormalizedBrief,
  mappings: readonly MercatoMappingResult[],
  monthlyByTool: ReadonlyMap<string, number | null>,
  lookup: CatalogVerdictLookup,
): CoverageContext {
  const mappingsByKey = new Map<string, MercatoMappingResult>()
  for (const mapping of mappings) {
    mappingsByKey.set(`${mapping.source}::${mapping.capability}`, mapping)
  }

  const rows: CoverageRow[] = []
  const evidenceNotes: ReportEvidenceNote[] = []
  const chargedTools = new Set<string>()

  for (const tool of brief.tools) {
    for (const module of tool.modules) {
      const moduleMappings = module.caps
        .map((slug) => mappingsByKey.get(`${tool.name}::${slug}`))
        .filter((mapping): mapping is MercatoMappingResult => mapping !== undefined)
      if (moduleMappings.length === 0) continue

      const verdict = heaviestVerdict(moduleMappings, lookup)
      const confidence = weakestConfidence(moduleMappings)
      // `'included'` dla drugiego i dalszych wierszy tego samego narzędzia:
      // PandaDoc ma w raporcie dwa wiersze przy jednej fakturze, bo robi dwie
      // niepowiązane rzeczy. Wpisanie kwoty dwa razy podwoiłoby ją w oczach
      // czytelnika sumującego kolumnę.
      const charged = chargedTools.has(tool.name)
      chargedTools.add(tool.name)

      rows.push({
        tool: tool.name,
        capability: labelOf(module),
        usage: module.desc,
        evidenceKind: module.evidenceKind,
        evidenceNote: module.evidenceNote,
        omTarget: distinctTargets(moduleMappings),
        verdict,
        confidence,
        monthly: charged ? 'included' : (monthlyByTool.get(tool.name) ?? null),
      })
      evidenceNotes.push({
        tool: tool.name,
        capability: labelOf(module),
        evidenceKind: module.evidenceKind,
        evidenceNote: module.evidenceNote,
      })
    }
  }

  const byVerdict = emptyVerdictCounts()
  for (const mapping of mappings) {
    if (isOffCatalog(mapping)) {
      byVerdict.offCatalog += 1
      continue
    }
    byVerdict[reportVerdictOf(mapping, lookup)] += 1
  }

  return {
    table: { rows, byVerdict, paidTwice: buildPaidTwice(mappings, monthlyByTool) },
    evidenceNotes,
  }
}

/** Nazwa modułu, a gdy jej nie ma - jego slugi. Wiersz bez tożsamości jest nieczytelny. */
function labelOf(module: NormalizedBriefModule): string {
  return module.name.trim().length > 0 ? module.name : module.caps.join(', ')
}

function heaviestVerdict(
  mappings: readonly MercatoMappingResult[],
  lookup: CatalogVerdictLookup,
): ReportVerdict {
  return mappings
    .map((mapping) => reportVerdictOf(mapping, lookup))
    .reduce((worst, verdict) => (VERDICT_WEIGHT[verdict] > VERDICT_WEIGHT[worst] ? verdict : worst))
}

function weakestConfidence(mappings: readonly MercatoMappingResult[]): Confidence {
  return mappings
    .map((mapping) => mapping.confidence)
    .reduce((worst, confidence) =>
      CONFIDENCE_WEIGHT[confidence] < CONFIDENCE_WEIGHT[worst] ? confidence : worst,
    )
}

/** Cele modułu, bez powtórzeń i w kolejności pierwszego wystąpienia. */
function distinctTargets(mappings: readonly MercatoMappingResult[]): string {
  return [...new Set(mappings.map((mapping) => mapping.targetFeature))].join(', ')
}

/**
 * Zdolności kupione dwa razy. Duplikat WEWNĄTRZ narzędzia jest niemożliwy -
 * odrzuca go brama briefu - więc każdy tutaj jest prawdziwą duplikacją
 * wydatku, czyli dokładnie tym, co ten produkt ma pokazywać.
 */
function buildPaidTwice(
  mappings: readonly MercatoMappingResult[],
  monthlyByTool: ReadonlyMap<string, number | null>,
): PaidTwiceRow[] {
  const toolsByCapability = new Map<string, string[]>()
  for (const mapping of mappings) {
    const tools = toolsByCapability.get(mapping.capability) ?? []
    if (!tools.includes(mapping.source)) tools.push(mapping.source)
    toolsByCapability.set(mapping.capability, tools)
  }
  const rows: PaidTwiceRow[] = []
  for (const [capability, tools] of toolsByCapability) {
    if (tools.length < 2) continue
    rows.push({
      capability,
      tools,
      monthlyAcrossTools: sumMoney(tools.map((tool) => monthlyByTool.get(tool) ?? null)),
    })
  }
  return rows
}

interface MoneyContext {
  table: MoneyTable
  licencesAfterMonthly: number | null
  licencesCancelledMonthly: number | null
  netRecurringAnnual: number | null
  largestBuildHours: number | null
}

function buildMoney(
  stack: StackTable,
  waves: readonly Wave[],
  retained: readonly string[],
  hosting: { annual: number; monthly: number } | undefined,
  rate: number | undefined,
  cash: CashSeries | undefined,
  hasCosts: boolean,
): MoneyContext {
  // `sumMoney([])` daje 0 i to jest poprawne dla "nic nie zatrzymujemy, a ceny
  // znamy" - ale NIE dla "nie dostaliśmy ani jednej faktury". Flaga rozdziela
  // te dwa przypadki, zanim zero zdąży pojechać do kafelka jako kwota.
  const licencesAfterMonthly = hasCosts
    ? sumMoney(stack.rows.filter((row) => retained.includes(row.tool)).map((row) => row.monthly))
    : null
  const licencesCancelledMonthly =
    stack.totalMonthly === null || licencesAfterMonthly === null
      ? null
      : stack.totalMonthly - licencesAfterMonthly
  const hostingMonthly = hosting?.monthly ?? null
  const netRecurringAnnual =
    licencesCancelledMonthly === null || hostingMonthly === null
      ? null
      : (licencesCancelledMonthly - hostingMonthly) * 12

  const recurring: MoneyLine[] = [
    {
      label: 'Licence spend today',
      basis: `${stack.rows.length === 1 ? '1 tool' : `${stack.rows.length} tools`}, as submitted`,
      monthly: stack.totalMonthly,
      annual: stack.totalAnnual,
      isDeduction: false,
    },
  ]
  if (retained.length > 0) {
    recurring.push({
      label: 'Licence spend retained',
      basis: retained.join(' + '),
      monthly: licencesAfterMonthly,
      annual: licencesAfterMonthly === null ? null : licencesAfterMonthly * 12,
      isDeduction: true,
    })
  }
  if (hosting !== undefined) {
    recurring.push({
      label: 'Hosting, backup and platform support',
      basis: 'Managed instance',
      monthly: hosting.monthly,
      annual: hosting.annual,
      isDeduction: true,
    })
  }

  const implementation: ImplementationLine[] = waves.map((wave) => ({
    waveNumber: wave.n,
    label: `Wave ${wave.n} — ${wave.title}`,
    scope: [...new Set(wave.scope.map((item) => item.capability))].join(', '),
    hours: wave.hours,
    cost: rate === undefined ? null : wave.hours * rate,
    hoursAreFloor: wave.hoursAreFloor,
  }))

  const totalHours = waves.reduce((sum, wave) => sum + wave.hours, 0)
  const totalHoursAreFloor = waves.some((wave) => wave.hoursAreFloor)
  const buildHours = waves.flatMap((wave) =>
    wave.scope
      .filter((item) => item.decision === 'build' && item.estimatedHours !== null)
      .map((item) => item.estimatedHours ?? 0),
  )
  const buildOnlyHours = buildHours.reduce((sum, hours) => sum + hours, 0)
  const buildOnlyCost = rate === undefined ? null : buildOnlyHours * rate

  return {
    table: {
      recurring,
      implementation,
      totalHours,
      rate: rate ?? null,
      totalImplementationCost: rate === undefined ? null : totalHours * rate,
      totalHoursAreFloor,
      paybacks: {
        // PŁASKI zwrot: koszt samego builda / miesięczna oszczędność. Ta sama
        // arytmetyka co `computeScenario.netPaybackMonths` - i celowo obok
        // zwrotu CZASOWEGO z serii, bo to dwa różne pytania (SPEC.md §12.3).
        buildOnlyMonths:
          buildOnlyCost === null || netRecurringAnnual === null || netRecurringAnnual <= 0
            ? null
            : buildOnlyCost / (netRecurringAnnual / 12),
        buildOnlyCost,
        programmeMonths: cash?.breakEvenMonth ?? null,
      },
      ...(netRecurringAnnual === null
        ? {}
        : {
            recurringTotal: {
              label: 'Net recurring saving',
              basis: steadyStateBasis(waves),
              monthly: netRecurringAnnual / 12,
              annual: netRecurringAnnual,
              isDeduction: false,
            },
          }),
    },
    licencesAfterMonthly,
    licencesCancelledMonthly,
    netRecurringAnnual,
    largestBuildHours: buildHours.length === 0 ? null : Math.max(...buildHours),
  }
}

/** Od którego miesiąca obowiązuje stan ustalony - ostatnia fala wyznacza tę datę. */
function steadyStateBasis(waves: readonly Wave[]): string {
  if (waves.length === 0) return 'Steady state'
  const from = waves.reduce((max, wave) => Math.max(max, wave.bankedFromMonth), 0)
  return `Steady state, from month ${from} onward`
}

function buildKpis(
  stack: StackTable,
  money: MoneyContext,
  waves: readonly Wave[],
  retained: readonly string[],
  hosting: { annual: number; monthly: number } | undefined,
  cash: CashSeries | undefined,
): ReportKpis {
  return {
    licencesTodayMonthly: stack.totalMonthly,
    licencesTodayAnnual: stack.totalAnnual,
    toolCount: stack.rows.length,
    // Stanowiska LICENCJONOWANE, nie ludzie. Złoty raport pokazuje w tym
    // kafelku 34 (czyli liczbę osób) i plan wymienia to wprost jako jeden ze
    // swoich trzech błędów arytmetycznych (R9) - duplikacja stanowisk jest
    // ustaleniem tego dokumentu, więc kafelek nie ma prawa jej ukrywać.
    seatCount: stack.totalSeats,
    licencesAfterMonthly: money.licencesAfterMonthly,
    licencesAfterNote: retained.length === 0 ? 'Nothing retained' : `${retained.join(' + ')} only`,
    netRecurringAnnual: money.netRecurringAnnual,
    hostingMonthly: hosting?.monthly ?? null,
    implementationCost: money.table.totalImplementationCost,
    implementationHours: money.table.totalHours,
    implementationHoursAreFloor: money.table.totalHoursAreFloor,
    // `null`, nie 0, kiedy nie ma ani jednej fali. Przebieg bez planu migracji
    // nie wie, ile trwa program, a "0 weeks" jest TWIERDZENIEM - i to takim,
    // które w parze z kosztem 0 dawało kamień milowy "Month 1 - all 4 waves
    // delivered". Przeglądarkowa kopia buildera podstawia tu domyślne trzy
    // miesiące (`DEFAULT_PROGRAMME_MONTHS`), bo tam liczbę wpisuje konsultant
    // przy dokumencie; silnik nie ma jej od kogo wziąć i nie wolno mu jej
    // wymyślić (żelazna zasada 2, SPEC.md §2), więc mówi, że nie wie.
    programmeWeeks: positiveOrNull(waves.reduce((max, wave) => Math.max(max, wave.weekTo), 0)),
    breakEvenMonth: cash?.breakEvenMonth ?? null,
    netAtHorizon: cash?.netAtHorizon ?? null,
    horizonMonths: cash?.horizonMonths ?? DEFAULT_HORIZON_MONTHS,
    licencesCancelledMonthly: money.licencesCancelledMonthly,
    largestBuildHours: money.largestBuildHours,
  }
}

/**
 * Luki katalogowe -> wiersze Appendixu B.
 *
 * Etykieta (`B.1`, `B.2`, ...) nadawana jest TUTAJ, z pozycji na liście, a nie
 * przez model - `writeGapProse` stempluje ją na wyniku agenta z tego samego
 * powodu, dla którego numer ryzyka stempluje `validateRiskAnalystResult`.
 */
function buildGaps(mappings: readonly MercatoMappingResult[], brief: NormalizedBrief): ReportGap[] {
  const describedBy = new Map<string, string>()
  for (const tool of brief.tools) {
    for (const module of tool.modules) {
      for (const slug of module.caps) describedBy.set(`${tool.name}::${slug}`, module.desc)
    }
  }
  return findCatalogGaps([...mappings]).map((gap, index) => ({
    id: `B.${index + 1}`,
    source: gap.source,
    capability: gap.capability,
    described: describedBy.get(`${gap.source}::${gap.capability}`) ?? '',
  }))
}

// --- Degradacja --------------------------------------------------------------

/**
 * Czy ten błąd to złamanie kontraktu pieniężnego, a nie awaria kroku.
 *
 * `try/catch` wokół kroku narracyjnego istnieje po to, żeby padnięcie modelu
 * kosztowało sekcję, a nie raport. Ale agent, który NAPISAŁ LICZBĘ, nie padł -
 * on złamał jedyną regułę, dla której cała ta warstwa istnieje (SPEC.md §10).
 * Ciche zgubienie takiej sekcji zamieniłoby głośną awarię w brakujący akapit,
 * czyli dokładnie w to, czego `assertNoFigures` ma nie dopuścić.
 */
function isFigureViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('assertNoFigures:')
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// --- Funkcja główna ----------------------------------------------------------

export async function buildReport(options: BuildReportOptions): Promise<BuiltReport> {
  const consultant = options.consultant
  if (typeof consultant !== 'object' || consultant === null) fail('options.consultant is required')

  const degradations: string[] = []
  const llmClient = options.llmClient
  const toolExecutor = options.toolExecutor ?? localToolExecutor

  // --- Bramy na wejścia CZŁOWIEKA, wszystkie przed pierwszym wywołaniem modelu
  const meta = readMeta(consultant.meta)
  const basis = {
    readWhat: asText(consultant.basis?.readWhat ?? '', 'consultant.basis.readWhat'),
    period: asText(consultant.basis?.period ?? '', 'consultant.basis.period'),
    exclusions: asText(consultant.basis?.exclusions ?? '', 'consultant.basis.exclusions'),
  }
  const hosting = readHosting(consultant)
  const rate = consultant.rate === undefined ? undefined : asMoney(consultant.rate, 'consultant.rate')

  // Brief czytamy DWA RAZY, każdą stroną przez jej własną bramę:
  // `briefToRequest` buduje wejście silnika, `normalizeBrief` oddaje pola,
  // których `ConsolidationRequest` nie zna (rodzaj dowodu, opis modułu).
  // Trzeci czytelnik surowego pliku by nie powstał - i nie powstaje.
  const brief = normalizeBrief(options.brief)
  const request = briefToRequest(options.brief, {
    omOperatingCost: hosting?.annual ?? 0,
    implementationCost:
      consultant.implementationCost === undefined
        ? 0
        : asMoney(consultant.implementationCost, 'consultant.implementationCost'),
  })
  const terms = readTerms(consultant.terms, new Set(brief.tools.map((tool) => tool.name)))

  // --- Rdzeń deterministyczny -----------------------------------------------
  const result = await new Orchestrator(llmClient ? { llmClient } : {}).run(request)
  const baseMappings = result.mappings

  // Godziny wchodzą do `facts` WYŁĄCZNIE od człowieka.
  //
  // Migration Planner nadal biega, kiedy jest `llmClient`, ale jego wynik jedzie
  // do `suggestedPlan` OBOK modelu - nigdy do mapowań. SPEC.md §11.2 mówi to
  // wprost: "effort estimates are ALWAYS narrative-adjacent, never folded into
  // `scenario.implementationCost` ... never let it silently override the input
  // cost". Wcześniej ten kod robił dokładnie to, czego §11.2 zabrania, i był to
  // jedyny kanał, którym liczba modelu docierała do pieniędzy.
  //
  // Zmierzone na zatrutym kliencie (`estimatedHours: 9999`) przed naprawą:
  // `implementationCost` 0 -> 1 199 880, `programmeWeeks` 4 -> 1 337,
  // `breakEvenMonth` 2 -> null, `netAtHorizon` 62 693 -> -135 792, a
  // `money.recurringTotal.basis` - POLE TEKSTOWE W `facts`, więc poza zasięgiem
  // `assertNoFigures`, który pilnuje tylko `prose` - drukowało "Steady state,
  // from month 338 onward".
  //
  // Test, który miał tego bronić, porównywał przebieg z modelem i bez TYLKO w
  // konfiguracji z planem od konsultanta i sam asercjonował, że planner nie
  // został wywołany. Ścieżka domyślna - `report-cli` bez ręcznie napisanego
  // pliku planu - nie była pokryta ani razu.
  const plan: MigrationPlanResult | undefined = consultant.plan
  let suggestedPlan: MigrationPlanResult | undefined
  if (plan === undefined && llmClient !== undefined) {
    try {
      suggestedPlan = await planMigration(llmClient, toolExecutor, {
        mappings: [...baseMappings],
        ...(result.businessProcess
          ? { businessProcess: { name: result.businessProcess.name, steps: result.businessProcess.steps } }
          : {}),
      })
      degradations.push(
        'effort hours: the Migration Planner proposed an estimate, but hours reach the figures only from a ' +
          'human plan (SPEC.md §11.2) - see `suggestedPlan`, and pass it as `consultant.plan` to adopt it',
      )
    } catch (error) {
      degradations.push(`migration plan: ${messageOf(error)}`)
    }
  }
  if (plan === undefined && suggestedPlan === undefined) {
    degradations.push('effort hours: no migration plan, wave totals are lower bounds')
  }

  const mappings = plan === undefined ? baseMappings : attachEffortHours([...baseMappings], plan)

  const stack = buildStack(brief, terms)
  const waves = groupIntoWaves({
    mappings,
    stack: stack.waveRows,
    ...(consultant.programmeStart === undefined ? {} : { programmeStart: consultant.programmeStart }),
    ...(consultant.weeklyHours === undefined ? {} : { weeklyHours: consultant.weeklyHours }),
  })

  // Przebieg, w którym NIKT nie wycenił ani jednej godziny.
  //
  // To jest trzeci warunek Figure 2 i doszedł razem z B3. `computeCashSeries`
  // liczy wydatek fali jako `godziny × stawka`, więc program bez ani jednej
  // estymaty wychodzi mu DARMOWY - i cała krzywa opowiada wtedy historię,
  // której nie ma: "maximum exposure −$180 w miesiącu 1", "break-even w
  // miesiącu 2", "36-month net +$62,693". Zmierzone na briefie Voltixa bez
  // `consultant.plan`. Tabela kamieni milowych dopisywała do tego "all 4 waves
  // delivered" przy miesiącu 1, czyli dokument twierdził, że czterofalowy
  // program dostarcza się w miesiąc za 180 dolarów.
  //
  // Warunek jest CIASNY z rozmysłem: fala z częściową estymatą daje krzywą,
  // która jest dolną granicą kosztu - optymistyczną, ale opartą na czymś, i
  // tabela mówi przy niej "a floor, not a quote". Dopiero zero znanych godzin
  // przy włączonej fladze znaczy, że nie ma podstawy w ogóle.
  const nothingEstimated =
    waves.length > 0 &&
    waves.every((wave) => wave.hoursAreFloor) &&
    waves.reduce((sum, wave) => sum + wave.hours, 0) === 0

  // Seria gotówki potrzebuje OBU liczb od konsultanta ORAZ choć jednej ceny
  // licencji. Bez nich raport powstaje bez Figure 2 - scenariusz S2 planu,
  // wykres z zer byłby kłamstwem.
  //
  // `hasCosts` doszło do tej bramy razem z B2. `computeCashSeries` sumuje
  // `wave.monthlyBanked ?? 0` (`cash.ts`), więc przebieg ze stawką i hostingiem,
  // ale bez ani jednej faktury, rysował krzywą samych kosztów: "36-month net
  // −$19,920" i "Break-even None" przy stosie, o którego cenie nie wiemy nic.
  // To nie jest wynik "program się nie zwraca", tylko brak danych przebrany za
  // wynik.
  let cash: CashSeries | undefined
  if (rate !== undefined && hosting !== undefined && stack.hasCosts && !nothingEstimated) {
    const series = computeCashSeries({
      waves,
      rate,
      hostingMonthly: hosting.monthly,
      ...(consultant.horizonMonths === undefined ? {} : { horizonMonths: consultant.horizonMonths }),
    })
    cash =
      consultant.figureMonths === undefined ? series : { ...series, figureMonths: consultant.figureMonths }
  } else if (!stack.hasCosts) {
    degradations.push('cash series: the brief carries no licence cost, so there is nothing to plot')
  } else if (nothingEstimated) {
    degradations.push(
      'cash series: not one wave carries an effort estimate, so the payback curve would be drawn ' +
        'against a programme that costs nothing',
    )
  } else {
    degradations.push('cash series: no rate or no hosting cost was supplied')
  }

  const counts = resolveStatementCounts(mappings, consultant.counts)
  const gaps = buildGaps(mappings, brief)

  const company: ReportCompany = {
    name: request.company.name,
    industry: request.company.industry,
    employees: request.company.employees,
    currency: request.company.currency,
  }
  const coverage = buildCoverage(brief, mappings, stack.monthlyByTool, catalogDropLookup)
  const money = buildMoney(
    stack.table,
    waves,
    result.scenario.retainedSaaS,
    hosting,
    rate,
    cash,
    stack.hasCosts,
  )

  // --- Proza (opcjonalna w całości) -----------------------------------------
  const prose: ReportProse = {}
  if (llmClient === undefined) {
    degradations.push('prose: no llmClient, the report carries tables and numbers only')
  } else {
    await writeProse(prose, degradations, {
      llmClient,
      toolExecutor,
      company,
      waves,
      mappings,
      counts,
      gaps,
      evidenceNotes: coverage.evidenceNotes,
    })
  }

  // --- Podgląd (sekcja 07) ---------------------------------------------------
  let preview: PreviewFacts | undefined
  if (options.preview === undefined) {
    degradations.push('preview: not requested')
  } else if (llmClient === undefined) {
    degradations.push('preview: no llmClient')
  } else if (result.blueprint === undefined) {
    degradations.push('preview: the strategist produced no blueprint, there is nothing to draw')
  } else {
    try {
      const manifest = await generatePreview(
        llmClient,
        toolExecutor,
        { company: request.company, blueprint: result.blueprint, mappings },
        options.preview.outDir,
      )
      const qa = await verifyGoldenPath(llmClient, toolExecutor, {
        manifest,
        goldenPath: options.preview.goldenPath ?? DEFAULT_GOLDEN_PATH,
      })
      preview = {
        screens: manifest.screens.map((screen) => ({ name: screen.name, path: screen.path })),
        generatedAt: manifest.generatedAt,
        verdict: qa.verdict,
        blockedAtStep: qa.blockedAtStep,
      }
    } catch (error) {
      degradations.push(`preview: ${messageOf(error)}`)
    }
  }

  // Strażnik stoi PRZED zbudowaniem modelu, na całej złożonej prozie - nie
  // tylko wewnątrz każdego wrappera. Cyfra, którą przepuściłby pojedynczy
  // agent, nie ma jak wejść do dokumentu przez złożenie kilku wyników.
  const hasProse = Object.keys(prose).length > 0
  assertNoFigures(hasProse ? prose : undefined)

  const facts: ReportFacts = {
    meta,
    company,
    basis: { ...basis, counts },
    kpis: buildKpis(stack.table, money, waves, result.scenario.retainedSaaS, hosting, cash),
    stack: stack.table,
    coverage: coverage.table,
    money: money.table,
    ...(cash === undefined ? {} : { cash }),
    waves,
    ...(preview === undefined ? {} : { preview }),
    glossary: REPORT_GLOSSARY,
    gaps,
  }
  const model: ReportModel = { facts, ...(hasProse ? { prose } : {}) }

  // --- Krytyk: doradczo, nic nie stosuje -------------------------------------
  let verdict: Critique | undefined
  const runCritic = options.runCritic ?? llmClient !== undefined
  if (runCritic && llmClient !== undefined) {
    try {
      verdict = await critique(llmClient, toolExecutor, 'report', model)
    } catch (error) {
      degradations.push(`critic: ${messageOf(error)}`)
    }
  } else {
    degradations.push('critic: not run')
  }

  return {
    model,
    ...(verdict === undefined ? {} : { critique: verdict }),
    ...(suggestedPlan === undefined ? {} : { suggestedPlan }),
    degradations,
  }
}

// --- Proza -------------------------------------------------------------------

interface ProseContext {
  llmClient: LlmClient
  toolExecutor: ToolExecutor
  company: ReportCompany
  waves: readonly Wave[]
  mappings: readonly MercatoMappingResult[]
  counts: { statements: number; matched: number; offCatalog: number }
  gaps: readonly ReportGap[]
  evidenceNotes: readonly ReportEvidenceNote[]
}

/**
 * Trzy agenci, trzy niezależne `try/catch`. Padnięcie Editora nie zabiera
 * ryzyk, padnięcie kuratora nie zabiera nic poza dwoma zdaniami jednej luki.
 * Żaden z nich nie widzi ani jednej kwoty - wycina je `src/reportProse.ts`.
 */
async function writeProse(
  prose: ReportProse,
  degradations: string[],
  context: ProseContext,
): Promise<void> {
  try {
    const executive = await writeExecutiveProse(context.llmClient, context.toolExecutor, {
      company: context.company,
      waves: context.waves,
      mappings: context.mappings,
      counts: context.counts,
    })
    prose.recommendation = executive.recommendation
    prose.findings = executive.findings
    prose.basisIntro = executive.basisIntro
    prose.disclaimer = executive.disclaimer
  } catch (error) {
    if (isFigureViolation(error)) throw error
    degradations.push(`report_editor: ${messageOf(error)}`)
  }

  try {
    const risk = await writeRiskProse(context.llmClient, context.toolExecutor, {
      mappings: context.mappings,
      waves: context.waves,
      evidenceKinds: context.evidenceNotes,
      gaps: context.gaps,
    })
    prose.risks = risk.risks
    prose.nextSteps = risk.nextSteps
  } catch (error) {
    if (isFigureViolation(error)) throw error
    degradations.push(`report_risk_analyst: ${messageOf(error)}`)
  }

  const gapProse = []
  for (const gap of context.gaps) {
    try {
      // Kurator i czytelnik NIE ROZMAWIAJĄ ze sobą (żelazna zasada 5): ten kod
      // uruchamia jednego, czyta jego typowany wynik i podaje drugiemu dokładnie
      // te pola, których ten drugi potrzebuje.
      const proposal = await proposeCatalogEntry(context.llmClient, context.toolExecutor, {
        toolName: gap.source,
        capability: gap.capability,
        usageDescription: gap.described,
      })
      gapProse.push(await writeGapProse(context.llmClient, context.toolExecutor, { gap, proposal }))
    } catch (error) {
      if (isFigureViolation(error)) throw error
      degradations.push(`report_curator_reader ${gap.id}: ${messageOf(error)}`)
    }
  }
  if (gapProse.length > 0) prose.gaps = gapProse
}

// --- Katalog -----------------------------------------------------------------

/**
 * Jedyny odczyt katalogu poza `mapCapabilities`, i jest wąski z rozmysłem:
 * pyta wyłącznie o `reportVerdict`, czyli o jedyną różnicę między werdyktem
 * SILNIKA a werdyktem CZYTELNIKA (`drop` - "nobody would miss it" nie znaczy
 * "platforma to potrafi", `ReportVerdict` w `model.ts`). Wszystko inne - cel,
 * decyzja, pewność - przychodzi z mapowania, żeby raport nie miał drugiego,
 * własnego zdania w sprawie, którą już rozstrzygnął rdzeń.
 */
function catalogDropLookup(tool: string, capability: string): 'drop' | undefined {
  return getCatalogCapability(tool, capability)?.reportVerdict
}
