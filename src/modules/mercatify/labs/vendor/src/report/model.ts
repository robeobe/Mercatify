import type { Confidence, Decision } from '../types'

/**
 * `ReportModel` - jedyne wejście renderera raportu (`src/report/renderReport.ts`).
 *
 * Model jest ZAWSZE podzielony na dwie połowy i ten podział jest żelazną
 * zasadą 2 (SPEC.md §2) wyrażoną w typie:
 *
 *   `facts` - WSZYSTKO, co policzyła czysta funkcja. Ani jedno pole tutaj nie
 *             pochodzi z odpowiedzi modelu. Renderer formatuje te wartości,
 *             nigdy ich nie przelicza.
 *   `prose` - WSZYSTKO, co napisał agent. W CAŁOŚCI opcjonalne, bo SPEC.md §8
 *             ("Running with no LLM at all") wymaga, żeby raport bez ani
 *             jednego agenta nadal był poprawnym raportem: z tabelami,
 *             liczbami i wykresami, tylko bez zdań.
 *
 * Z tego podziału wynika kontrakt walidacyjny, który egzekwuje
 * `assertNoFigures` (`src/report/assertNoFigures.ts`): żadne pole w `prose`
 * nie ma prawa nieść kwoty, procentu, numeru miesiąca ani liczby godzin.
 * Powód jest udokumentowany w SPEC.md §10 - agent FinOps napisał w narracji
 * "net annual saving is EUR 6,000, payback 24 months", podczas gdy prawdziwe,
 * deterministyczne liczby to EUR 21,000 i ~6,9 miesiąca. Tamten przebieg
 * ocalał tylko dlatego, że `scenario` nigdy nie pochodziło od agenta.
 */
export interface ReportModel {
  facts: ReportFacts
  prose?: ReportProse
}

// --- FAKTY ------------------------------------------------------------------

export interface ReportFacts {
  meta: ReportMeta
  company: ReportCompany
  basis: ReportBasis
  kpis: ReportKpis
  stack: StackTable
  coverage: CoverageTable
  money: MoneyTable
  /**
   * Nieobecna, kiedy klient nie podał kosztów albo konsultant nie podał
   * stawki. Scenariusz S2 planu: raport wtedy nadal powstaje i uczciwie mówi
   * "nie podano kosztów", zamiast rysować wykres z zer.
   */
  cash?: CashSeries
  waves: Wave[]
  /** Nieobecny, kiedy przebieg nie generował podglądu (`--no-preview`). */
  preview?: PreviewFacts
  /** Definicje werdyktów i zasad - stałe, nie dane przebiegu. Appendix A. */
  glossary: Glossary
  /** Tożsamość każdej luki katalogowej. Proza do nich siedzi w `prose.gaps`. */
  gaps: ReportGap[]
}

export interface ReportMeta {
  caseId: string
  /** Wersja dokumentu, np. "1.0". Rośnie przy każdej ponownej wysyłce. */
  version: string
  /** ISO 8601, sama data. */
  issued: string
  /** ISO 8601. Do kiedy obowiązują wyceny i estymaty. */
  validUntil: string
  preparedFor: ReportParty
  preparedBy: ReportParty
  /**
   * Czas przebiegu w minutach. Opcjonalny, bo przebieg `--no-llm` nie mieli
   * modelu i ta liczba nie ma wtedy sensu.
   */
  runMinutes?: number
  /** Czy człowiek przejrzał mapowanie przed wydaniem dokumentu. */
  humanReviewed: boolean
  /** Na czym raport stoi, np. "Open Mercato - self-hosted, source available". */
  basis: string
  confidentialityNote: string
}

export interface ReportParty {
  organization: string
  person: string
  role: string
}

export interface ReportCompany {
  name: string
  industry: string
  employees: number
  /** Kod ISO 4217. Renderer dobiera symbol i jego pozycję (PLN jest sufiksem). */
  currency: string
}

export interface ReportBasis {
  /** Materiał wejściowy: rozmowy, faktury, screen-share'y. */
  readWhat: string
  /** Okres, którego dotyczą koszty i założenia. */
  period: string
  /** Co świadomie zostało poza analizą. */
  exclusions: string
  counts: StatementCounts
}

/**
 * Liczniki z sekcji 02 raportu ("38 usage statements ... 34 matched ... 4 did
 * not"). Czysta funkcja nad `mappings` - `src/report/counts.ts`.
 */
export interface StatementCounts {
  statements: number
  matched: number
  offCatalog: number
}

/**
 * Sześć kafelków "At a glance". Każdy niesie już policzoną wartość i już
 * policzoną notkę pod spodem - renderer nie liczy nic, nawet mnożenia razy 12.
 *
 * Pola kwotowe są `null`, a nie zerem, kiedy klient nie podał kosztów:
 * scenariusz S2 planu wymaga, żeby raport wtedy powstał i uczciwie powiedział
 * "nie podano kosztów", zamiast pokazać darmowy stack.
 */
export interface ReportKpis {
  licencesTodayMonthly: number | null
  licencesTodayAnnual: number | null
  toolCount: number
  seatCount: number | null
  licencesAfterMonthly: number | null
  /** Co dokładnie zostaje, np. "Accounting + e-signature only". */
  licencesAfterNote: string
  netRecurringAnnual: number | null
  hostingMonthly: number | null
  implementationCost: number | null
  implementationHours: number
  /** `true`, kiedy któryś wiersz `build` nie ma estymaty - suma jest dolną granicą. */
  implementationHoursAreFloor: boolean
  /**
   * Długość programu w tygodniach. `null`, kiedy nie ma ani jednej fali, czyli
   * kiedy nie wiadomo, ile to potrwa.
   *
   * NIGDY zero. "0 weeks" jest twierdzeniem - czyta się jako "to nic nie trwa"
   * - a w parze z kosztem 0 dawało w dokumencie kamień milowy "Month 1 - all 4
   * waves delivered". Ta sama reguła stoi w przeglądarkowej kopii buildera
   * (`assets/shared/report-model.js`, "It is never zero: '0 weeks' would be a
   * claim rather than a gap"), tylko tam braku nie ma jak być: liczbę wpisuje
   * konsultant przy dokumencie.
   */
  programmeWeeks: number | null
  /** `null`, kiedy program nie zwraca się w horyzoncie (netto <= 0). */
  breakEvenMonth: number | null
  netAtHorizon: number | null
  horizonMonths: number
  /**
   * Ile licencji miesięcznie faktycznie gaśnie: `licencesTodayMonthly`
   * minus `licencesAfterMonthly`. Osobne pole, a nie odejmowanie w
   * rendererze - renderer formatuje, nie liczy (żelazna zasada 2).
   *
   * Złoty raport używa tej kwoty DWA RAZY w prozie ("together cost $2,043 a
   * month" w ustaleniu 1.1 i stopka sekcji 06), a proza nie miała jak jej
   * dosięgnąć: `stack.totalMonthly` to wszystkie siedem narzędzi, a
   * `stack.<tool>.monthly` to jedno. Między nimi nie było nic.
   */
  licencesCancelledMonthly?: number | null
  /**
   * Największa pojedyncza estymata `build` w całym programie. Golden nazywa
   * ją wprost ("the single largest piece of new code"), a proza nie miała jak
   * jej wskazać: `WaveScopeItem.estimatedHours` żyje w tablicy, a nazwa
   * zdolności bywa z kropką (`quotes.cpq`), więc ścieżka slotu po niej się
   * rozjeżdża. Jedno pole zamiast piątego członu w składni.
   */
  largestBuildHours?: number | null
}

// --- Sekcja 03: stack -------------------------------------------------------

export type TermType = 'monthly' | 'annual'

export interface StackRow {
  tool: string
  /** Nazwa taryfy, np. "Sales Professional". Pusty string, gdy nie podano. */
  plan: string
  category: string
  seats: number | null
  unitPrice: number | null
  monthly: number | null
  annual: number | null
  /** ISO 8601 albo pusty string. Steruje kolejnością fal, nie tylko kolumną. */
  termEnds: string
  termType: TermType
}

export interface StackTable {
  rows: StackRow[]
  totalSeats: number | null
  totalMonthly: number | null
  totalAnnual: number | null
  /**
   * Zdanie o duplikacji stanowisk ("52 seats across 34 people"), policzone z
   * `totalSeats` i `company.employees`. Pusty string, gdy brak danych.
   */
  seatDuplicationNote: string
}

// --- Sekcja 04: pokrycie ----------------------------------------------------

/**
 * Skąd wiemy to, co piszemy w wierszu. Kolumna "Observed / Inferred /
 * Estimated" w raporcie jest rdzeniem jego wiarygodności, więc jest polem
 * pierwszej kategorii, nie notatką.
 */
export type EvidenceKind = 'observed' | 'inferred' | 'estimated'

/**
 * Werdykt tak, jak go widzi CZYTELNIK raportu. Sześć wartości, nie pięć.
 *
 * `Decision` silnika (`src/types.ts`) zostaje piątkowe i takie ma zostać:
 * szósta wartość ruszyłaby każdy wyczerpujący `switch`, regułę MAP-1 krytyka
 * i enum `decision` w deskryptorach agentów - koszt nieproporcjonalny do
 * 2 wpisów na 88 w katalogu.
 *
 * `drop` ("nobody would miss it") NIE jest jednak tym samym co `native`
 * ("the platform already does this"). Dla pieniędzy zachowują się identycznie
 * - narzędzie gaśnie w obu przypadkach - ale zwinięcie ich w jedno wpisałoby
 * do raportu twierdzenie o platformie, które jest nieprawdziwe. Dlatego
 * `mapCapabilities` oddaje `native`, a katalog zachowuje `drop` i to ta
 * wartość trafia do wiersza tabeli pokrycia oraz do Appendix A.
 */
export type ReportVerdict = Decision | 'drop'

export interface CoverageRow {
  tool: string
  /** Etykieta zdolności ze słownika `CAPS`, nie surowy slug. */
  capability: string
  /** Do czego klient tego faktycznie używa. */
  usage: string
  evidenceKind: EvidenceKind
  evidenceNote: string
  /** Cel w Open Mercato ze słownika `OM_TARGETS`. */
  omTarget: string
  verdict: ReportVerdict
  confidence: Confidence
  /**
   * Koszt przypisany do wiersza. `null`, gdy nie podano; `'included'`, gdy to
   * drugi wiersz tego samego narzędzia - PandaDoc w raporcie występuje dwa
   * razy przy jednej fakturze, bo robi dwie niepowiązane rzeczy.
   */
  monthly: number | null | 'included'
}

export interface CoverageTable {
  rows: CoverageRow[]
  /** Liczniki do Figure 1. Klucz to werdykt albo `offCatalog`. */
  byVerdict: VerdictCounts
  /** Zdolności pokryte przez więcej niż jedno narzędzie - sekcja "paid twice". */
  paidTwice: PaidTwiceRow[]
}

export type VerdictCounts = Record<ReportVerdict, number> & { offCatalog: number }

export interface PaidTwiceRow {
  capability: string
  tools: string[]
  /** Łączny miesięczny wydatek narzędzi niosących tę zdolność. */
  monthlyAcrossTools: number | null
}

// --- Sekcja 05: pieniądze ---------------------------------------------------

/**
 * Jedna linia tabeli kosztów bieżących. `basis` jest obowiązkowy, bo zasada 02
 * z Appendix A ("every number can be recomputed by hand at the table") jest
 * spełniona tylko wtedy, gdy przy każdej kwocie stoi jej wzór.
 */
export interface MoneyLine {
  label: string
  basis: string
  monthly: number | null
  annual: number | null
  /** `true` dla linii odejmowanych - renderer stawia minus. */
  isDeduction: boolean
}

export interface ImplementationLine {
  waveNumber: number
  label: string
  scope: string
  hours: number
  cost: number | null
  /** `true`, gdy któryś wiersz `build` tej fali nie ma estymaty. */
  hoursAreFloor: boolean
}

export interface MoneyTable {
  recurring: MoneyLine[]
  implementation: ImplementationLine[]
  totalHours: number
  /** Stawka blended. `null`, gdy konsultant jej nie podał. */
  rate: number | null
  totalImplementationCost: number | null
  totalHoursAreFloor: boolean
  paybacks: Paybacks
  /**
   * Wiersz podsumowujący tabelę kosztów bieżących - w goldenie
   * "Net recurring saving / Steady state, from month 7 onward".
   *
   * OPCJONALNY i osobny, a nie liczony przez renderer z `recurring`, bo
   * renderer nie ma prawa sumować pieniędzy (żelazna zasada 2, SPEC.md §2):
   * suma kolumny to nowa liczba, a nie sformatowanie istniejącej. `basis`
   * niesie przy tym informację, której w samych liniach nie ma - od którego
   * miesiąca ten stan obowiązuje.
   *
   * Nieobecny -> tabela renderuje się bez `<tfoot>`.
   */
  recurringTotal?: MoneyLine
}

/**
 * Dwie liczby zwrotu, świadomie obie. Raport tłumaczy różnicę wprost ("Two
 * payback numbers, and why they differ"): pierwsza odpowiada na pytanie "czy
 * warto to budować", druga trafia do budżetu.
 *
 * `buildOnlyMonths` jest PŁASKIE (koszt samego builda / miesięczna oszczędność)
 * i zgadza się z `computeScenario.netPaybackMonths`. `programmeMonths` pochodzi
 * z modelu CZASOWEGO (`cash.breakEvenMonth`) i jest większe. To nie jest
 * sprzeczność - to dwa różne pytania, i raport musi nazwać oba.
 */
export interface Paybacks {
  buildOnlyMonths: number | null
  buildOnlyCost: number | null
  programmeMonths: number | null
}

// --- Figure 2: przepływ gotówki ---------------------------------------------

export interface CashPoint {
  month: number
  /** Wynik netto samego tego miesiąca. */
  monthlyNet: number
  /** Skumulowana pozycja względem nicnierobienia. */
  cumulative: number
  /** Podpis kamienia milowego albo pusty string. */
  milestone: string
}

/**
 * Wynik `computeCashSeries` (`src/report/cash.ts`) - model CZASOWY, jedyny,
 * który potrafi odtworzyć Figure 2 raportu.
 *
 * Dwa istniejące w repo modele są płaskie i dają inną odpowiedź:
 * `computeTotals` (assets/stack-tool/catalog.js) liczy
 * `ceil(oneOff / monthlySaving)`, a `computeScenario`
 * `implementationCost / (netAnnual / 12)`. Oba ignorują KIEDY pieniądz
 * wychodzi i kiedy wchodzi. Tutaj fala wydaje godziny w trakcie pracy, jej
 * oszczędność startuje miesiąc po jej zakończeniu, a hosting leci od M1 -
 * i dopiero to daje "max exposure w M6" oraz "break-even w M15".
 *
 * `breakEvenMonth` jest `null`, a nie `Infinity`: to pole jedzie do JSON-a,
 * a `JSON.stringify(Infinity)` daje `null` po cichu. Lepiej mieć `null`
 * jawnie w typie niż niespodziankę po serializacji.
 */
export interface CashSeries {
  points: CashPoint[]
  horizonMonths: number
  /** Najniższa skumulowana pozycja i miesiąc, w którym wypada. */
  maxExposure: number
  maxExposureMonth: number
  breakEvenMonth: number | null
  netAtHorizon: number
  /**
   * Ile miesięcy RYSUJE Figure 2. Nieobecne -> cały `horizonMonths`.
   *
   * Horyzont liczenia i horyzont rysowania to dwie różne decyzje i golden
   * pokazuje je obok siebie: seria biegnie do miesiąca 36 (kafelek
   * "36-month net" i wiersz "Month 36" tabeli kamieni milowych stoją na
   * miesiącu 36), a wykres urywa się na 24 - bo po break-evenie prosta
   * dokłada tylko piksele. To wybór PREZENTACYJNY, więc jest polem modelu,
   * a nie stałą renderera: przebieg, który nie ma o tym zdania, dostaje
   * całą serię.
   */
  figureMonths?: number
}

// --- Sekcja 06: fale --------------------------------------------------------

export interface Wave {
  /** Numer fali, od 1. */
  n: number
  title: string
  weekFrom: number
  weekTo: number
  hours: number
  /** `true`, gdy któryś wiersz `build` tej fali nie ma estymaty godzinowej. */
  hoursAreFloor: boolean
  /** Zdolności, które ta fala domyka - każda wskazuje realne mapowanie. */
  scope: WaveScopeItem[]
  /** Narzędzia gasnące z końcem tej fali. */
  toolsOff: string[]
  /** Narzędzia schodzące na tańszy plan, np. PandaDoc na signature-only. */
  toolsReduced: string[]
  /** Kwota miesięczna odzyskana po tej fali. `null`, gdy brak kosztów. */
  monthlyBanked: number | null
  /** Od którego miesiąca programu ta kwota faktycznie wpływa. */
  bankedFromMonth: number
}

export interface WaveScopeItem {
  source: string
  capability: string
  decision: Decision
  /** Z Migration Plannera. `null`, gdy planner nie estymował tego wiersza. */
  estimatedHours: number | null
}

// --- Sekcja 07: podgląd -----------------------------------------------------

export interface PreviewFacts {
  screens: Array<{ name: string; path: string }>
  generatedAt: string
  /** Werdykt agenta QA. `blocked` to poprawny wynik, nie awaria. */
  verdict: 'ready' | 'blocked'
  /** Krok golden path, na którym podgląd się urywa. Pusty przy `ready`. */
  blockedAtStep: string
}

// --- Appendix A: słownik ----------------------------------------------------

export interface GlossaryEntry {
  verdict: ReportVerdict | 'off-catalog'
  means: string
  costsYou: string
}

export interface GlossaryRule {
  id: string
  title: string
  body: string
}

/**
 * Tablice są `readonly`, bo słownik jest STAŁĄ metody, nie danymi przebiegu -
 * `REPORT_GLOSSARY` (`src/report/glossary.ts`) jest `Object.freeze`'owane i
 * bez `readonly` tutaj jedynym sposobem na przypisanie byłoby `as`, czego
 * konwencja repo zabrania.
 */
export interface Glossary {
  verdicts: readonly GlossaryEntry[]
  rules: readonly GlossaryRule[]
}

// --- Appendix B: luki katalogowe --------------------------------------------

/**
 * Tożsamość luki. To jest FAKT - pochodzi z `findCatalogGaps` nad
 * `mappings`. Zdania "czemu nieznane" i "nasz odczyt" pisze agent i siedzą
 * osobno, w `prose.gaps`, sparowane przez `id`.
 */
export interface ReportGap {
  id: string
  source: string
  capability: string
  /** Jak klient to opisał w formularzu. */
  described: string
}

// --- PROZA ------------------------------------------------------------------

/**
 * Wszystko, co napisał agent. KAŻDE pole jest opcjonalne, również cały ten
 * obiekt: przebieg bez LLM oddaje `ReportModel` z samym `facts`, a renderer
 * po prostu pomija te sekcje - nie renderuje ich pustych.
 *
 * Żadne pole tutaj nie ma prawa nieść liczby. Egzekwuje to `assertNoFigures`,
 * wołane w `buildReport` PRZED zbudowaniem modelu.
 */
export interface ReportProse {
  /** "The recommendation in one sentence" z okładki. */
  recommendation?: string
  /** Sekcja 01 - ponumerowane ustalenia z nagłówkami. */
  findings?: ProseFinding[]
  /** Akapit otwierający sekcję 02. */
  basisIntro?: string
  /** "What this report is not" - akapit zamykający sekcję 01. */
  disclaimer?: string
  /** Proza pod każdą falą sekcji 06, kluczowana numerem fali. */
  waveNotes?: ProseWaveNote[]
  /** Sekcja 08. */
  risks?: ProseRisk[]
  /** Sekcja 09. */
  nextSteps?: ProseNextStep[]
  /** Appendix B - sparowane z `facts.gaps` przez `gapId`. */
  gaps?: ProseGap[]

  // --- Akapity, których pierwsza wersja typu nie miała ---------------------
  //
  // Wszystkie doszły z jednego powodu: golden je ma, a model nie miał ich
  // gdzie zapisać, więc renderer musiałby je ZMYŚLIĆ albo pominąć. Każde jest
  // osobnym, nazwanym polem, a nie mapą `sekcja -> tekst`, bo mapa jest
  // niewyrażalna w JSON Schema ze `strict: true`, którego wymaga
  // `src/llmClient.ts` na każdym wywołaniu agenta (ten sam powód, dla którego
  // `ScreenSpec` ma `ScreenCell[]`, a nie `Record<string, string>`).

  /** Akapit pod tytułem okładki ("We read the seven tools ..."). */
  coverLede?: string
  /** Akapit wstępny sekcji 03. */
  stackIntro?: string
  /** Akapit wstępny sekcji 04. */
  coverageIntro?: string
  /** Przypis pod tabelą pokrycia - np. czemu jedno narzędzie ma dwa wiersze. */
  coverageNote?: string
  /** Akapit wstępny sekcji 05. */
  moneyIntro?: string
  /** Callout "Two payback numbers, and why they differ" - samo ciało. */
  paybackNote?: string
  /** Akapit wstępny sekcji 06. */
  sequenceIntro?: string
  /** Przypis zamykający sekcję 06 ("Full run rate from month 7 ..."). */
  sequenceNote?: string
  /** Akapit wstępny sekcji 07. */
  previewIntro?: string
  /**
   * Ponumerowane punkty sekcji 07 (7.1, 7.2, 7.3). Ten sam kształt co
   * `findings`, bo to ta sama lista z nagłówkami - numer nadaje renderer z
   * pozycji, więc agent nie ma jak go przekłamać.
   */
  previewNotes?: ProseFinding[]
  /** Akapit wstępny sekcji 08. */
  risksIntro?: string
  /** Akapit wstępny sekcji 09. */
  nextStepsIntro?: string
  /** Akapit wstępny Appendixu A. */
  appendixAIntro?: string
  /** Akapit wstępny Appendixu B. */
  appendixBIntro?: string
  /** Podpis pod tytułem Figure 1 (`figure__sub`). */
  figure1Sub?: string
  /** Podpis pod tytułem Figure 2 (`figure__sub`). */
  figure2Sub?: string
  /** Zdanie POD Figure 2 (`figure__cap`), odsyłające do tabeli kamieni milowych. */
  figure2Cap?: string
}

export interface ProseFinding {
  heading: string
  body: string
}

export interface ProseWaveNote {
  waveNumber: number
  body: string
}

export interface ProseRisk {
  /** Numeracja sekcji, np. "8.1". */
  id: string
  risk: string
  /** Na czym opiera się założenie, np. "Assumed from a sample of 200 contacts". */
  basis: string
  effect: string
  handling: string
}

export interface ProseNextStep {
  action: string
  owner: string
  when: string
}

export interface ProseGap {
  gapId: string
  whyUnmapped: string
  ourRead: string
}
