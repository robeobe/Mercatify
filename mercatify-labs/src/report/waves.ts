import { MANUAL_TOOL_ALIASES, resolveToolAlias } from '../catalogToolAliases'
import { attachEffortHours } from '../effortHours'
import { OFF_CATALOG_EVIDENCE, toolGoesOff } from '../toolVerdict'
import type { MigrationPlanResult } from '../migrationPlanner'
import type { Decision, MercatoMappingResult } from '../types'
import { planWaveSpendWindows } from './cash'
import type { TermType, Wave, WaveScopeItem } from './model'

/**
 * Sekcja 06 raportu ("Recommended sequence") jako czysta funkcja.
 *
 * Wejściem są MAPOWANIA (co platforma przejmuje i jakim kosztem), PLAN
 * MIGRACJI (ile to godzin) i STACK (ile to pieniędzy i do kiedy trwa umowa).
 * Wyjściem jest `Wave[]` z `src/report/model.ts` - ta sama tablica, którą
 * dalej czyta `computeCashSeries` i renderer. Ani jedno pole nie pochodzi z
 * modelu językowego: SPEC.md §2, zasada 2.
 *
 * DLACZEGO PLAN MIGRACJI NIE JEST DRUGIM ARGUMENTEM RÓWNORZĘDNYM MAPOWANIOM:
 * plan niesie `sequence`, czyli KOLEJNOŚĆ zaproponowaną przez agenta. Gdyby
 * fale szły po niej, kolejność wdrożenia byłaby opinią modelu i zmieniałaby
 * się między przebiegami na tych samych danych. Z planu bierzemy wyłącznie
 * `estimatedHours`, i to istniejącą już funkcją `attachEffortHours`
 * (`src/effortHours.ts`) - kolejność liczymy tutaj, deterministycznie, z
 * werdyktów.
 *
 * Trzy reguły, które trzymają ten plik przy ziemi:
 *
 *  1. NARZĘDZIE, NIE ZDOLNOŚĆ, jest jednostką fali. Fala obiecuje w raporcie
 *     "ends with a tool switched off and a saving banked"; fala domykająca pół
 *     narzędzia nie bankuje ani złotówki, bo subskrypcji nie anuluje się w
 *     połowie (`toolGoesOff`, `src/toolVerdict.ts`).
 *  2. RODZINA CELU JEST JAWNA (`TARGET_FAMILIES` niżej). Żadnego dopasowania
 *     po podciągu, dokładnie z tego samego powodu co w `src/catalogAliases.ts`:
 *     cel, którego tablica nie zna, ma dostać WŁASNĄ falę, a nie wpaść po
 *     cichu do przypadkowej.
 *  3. `bankedFromMonth` liczy `planWaveSpendWindows` (`src/report/cash.ts`),
 *     nie ten plik. Dwie kopie kalendarza wydatku rozjechałyby się przy
 *     pierwszej zmianie długości fali - i rozjazd byłby widoczny dopiero na
 *     Figure 2.
 *  4. ZDOLNOŚĆ SPOZA KATALOGU NIE JEST PRACĄ TEJ FUNKCJI - patrz
 *     `isOffCatalog` niżej.
 */

// --- Rodziny celów ----------------------------------------------------------

/**
 * Domeny biznesowe, w których mogą stać fale. Skończona lista, bo tytuł fali
 * jest nazwą domeny - nowa domena to świadoma decyzja, nie efekt uboczny
 * dopisania celu.
 *
 * Kolejność deklaracji ma znaczenie tylko jako OSTATNI rozstrzygacz remisów
 * (patrz `compareWaves`), nigdy jako kolejność wdrożenia.
 */
const DOMAINS = Object.freeze({
  registers: 'Registers and stock',
  crm: 'CRM cut-over',
  fieldService: 'Field service',
  supportQuoting: 'Support and quoting',
  catalogue: 'Product catalogue',
  ordersFulfilment: 'Orders and fulfilment',
  billing: 'Billing and payments',
  portal: 'Customer portal',
  rules: 'Rules and automation',
  integrations: 'Integrations and sync',
  reporting: 'Reporting and search',
  backOffice: 'People and back office',
  aiOrchestration: 'AI orchestration',
  netNew: 'Net-new modules',
  kept: 'Kept systems',
})

export interface TargetFamily {
  /** Nazwa domeny - zostaje tytułem fali. */
  readonly domain: string
  /**
   * `true`, gdy cel potrafi SAM otworzyć falę.
   *
   * `false` znaczy "to jest MECHANIZM platformy, nie domena biznesowa".
   * `entities — custom entities & fields`, `business_rules`, `workflows`,
   * `documents`, `data_sync` obsługują dowolną domenę i pojawiają się przy
   * narzędziach, które z tą domeną nie mają nic wspólnego. Jobber jest tego
   * żywym przykładem: `field.scheduling` celuje w `planner — availabilities`
   * (serwis), a `field.jobsheets` w `entities — custom entities & fields`
   * (ten sam cel co rejestry Airtable'a). Gdyby mechanizm liczył się na równi
   * z domeną, Jobber wpadłby do fali rejestrów - i fala "Field service"
   * zniknęłaby z raportu.
   *
   * Mechanizm ma mimo to własną domenę: narzędzie, którego CAŁA praca to
   * jeden mechanizm (Airtable = same encje własne), musi gdzieś stanąć, a
   * "narzędzie do rejestrów własnych" to po prostu rejestr.
   */
  readonly owns: boolean
}

/**
 * Cel z `OM_TARGETS` (`assets/stack-tool/catalog.js`) -> domena.
 *
 * Tablica jest JAWNA, SKOŃCZONA i kuratorowana ręcznie - ta sama dyscyplina co
 * `CAPABILITY_ALIASES` i `MANUAL_TOOL_ALIASES`. `OM_TARGETS` jest listą
 * MODUŁÓW PLATFORMY, a fale raportu są listą DOMEN KLIENTA; to nie jest to
 * samo słownictwo i żadna reguła tekstowa jednego na drugie nie przełoży.
 * Test `waves.test.ts` pilnuje, że każda pozycja `OM_TARGETS` ma tu wpis -
 * nowy cel bez decyzji o domenie zapala się na czerwono, zamiast po cichu
 * dostać własną falę.
 *
 * ŚWIADOMIE ARBITRALNE (jedyne takie miejsce): `sales — quotes` i
 * `catalog + sales — quotes` stoją w domenie "Support and quoting" razem z
 * kanałami wsparcia. Oferty i wsparcie to dwie różne rzeczy; scala je złoty
 * raport, którego fala 4 obejmuje Zendesk i PandaDoc naraz. Rozbicie na
 * osobną domenę "Quoting" jest równie obronne i daje Voltixowi PIĘĆ fal
 * zamiast czterech.
 */
export const TARGET_FAMILIES: Readonly<Record<string, TargetFamily>> = Object.freeze({
  // Klient i lejek.
  customers: { domain: DOMAINS.crm, owns: true },
  'customers + sales': { domain: DOMAINS.crm, owns: true },
  sales: { domain: DOMAINS.crm, owns: true },
  'customers + catalog — prices': { domain: DOMAINS.crm, owns: true },

  // Rejestry i magazyn. `entities` jest mechanizmem - patrz `owns`.
  wms: { domain: DOMAINS.registers, owns: true },
  'entities — custom entities & fields': { domain: DOMAINS.registers, owns: false },

  // Serwis w terenie.
  'planner — availabilities': { domain: DOMAINS.fieldService, owns: true },

  // Wsparcie i oferty.
  messages: { domain: DOMAINS.supportQuoting, owns: true },
  'messages + inbox_ops': { domain: DOMAINS.supportQuoting, owns: true },
  phone_calls: { domain: DOMAINS.supportQuoting, owns: true },
  warranty_claims: { domain: DOMAINS.supportQuoting, owns: true },
  'sales — quotes': { domain: DOMAINS.supportQuoting, owns: true },
  'catalog + sales — quotes': { domain: DOMAINS.supportQuoting, owns: true },
  documents: { domain: DOMAINS.supportQuoting, owns: false },

  // Katalog produktów.
  catalog: { domain: DOMAINS.catalogue, owns: true },
  'catalog — prices': { domain: DOMAINS.catalogue, owns: true },

  // Zamówienia i wysyłka.
  'sales — orders': { domain: DOMAINS.ordersFulfilment, owns: true },
  shipping_carriers: { domain: DOMAINS.ordersFulfilment, owns: true },
  'sales — orders + shipping_carriers': { domain: DOMAINS.ordersFulfilment, owns: true },

  // Pieniądze. Cele złożone idą za MODUŁEM PŁATNOŚCI, nie za koszykiem.
  'sales — invoices': { domain: DOMAINS.billing, owns: true },
  payment_gateways: { domain: DOMAINS.billing, owns: true },
  checkout: { domain: DOMAINS.billing, owns: true },
  'sales — invoices + payment_gateways': { domain: DOMAINS.billing, owns: true },
  'checkout + payment_gateways': { domain: DOMAINS.billing, owns: true },
  'payment_gateways + checkout': { domain: DOMAINS.billing, owns: true },

  // Portal i treści.
  'portal + customer_accounts': { domain: DOMAINS.portal, owns: true },
  content: { domain: DOMAINS.portal, owns: true },
  'content + portal': { domain: DOMAINS.portal, owns: true },

  // Reguły i automatyzacja - w całości mechanizmy.
  business_rules: { domain: DOMAINS.rules, owns: false },
  workflows: { domain: DOMAINS.rules, owns: false },
  notifications: { domain: DOMAINS.rules, owns: false },
  'business_rules + data_sync': { domain: DOMAINS.rules, owns: false },
  'business_rules + integrations': { domain: DOMAINS.rules, owns: false },
  'business_rules + notifications': { domain: DOMAINS.rules, owns: false },

  // Integracje i synchronizacja - też mechanizmy.
  integrations: { domain: DOMAINS.integrations, owns: false },
  data_sync: { domain: DOMAINS.integrations, owns: false },
  'stays external, wired in': { domain: DOMAINS.integrations, owns: false },

  // Raportowanie.
  dashboards: { domain: DOMAINS.reporting, owns: true },
  search: { domain: DOMAINS.reporting, owns: false },

  // Reszta.
  staff: { domain: DOMAINS.backOffice, owns: true },
  'agent_orchestrator (enterprise)': { domain: DOMAINS.aiOrchestration, owns: true },
  'no module yet — build': { domain: DOMAINS.netNew, owns: true },
  // Cel wierszy `keep`. Te wiersze nie wchodzą do żadnej fali, więc ta domena
  // nigdy nie powinna się pojawić w wyniku - wpis istnieje po to, żeby test
  // pokrycia `OM_TARGETS` nie musiał robić dla niego wyjątku.
  'not our business — keep it': { domain: DOMAINS.kept, owns: false },
})

/**
 * Kolejność deklaracji domen - ostatni rozstrzygacz remisów. Wyprowadzona z
 * `DOMAINS`, więc nie da się jej rozjechać z tablicą wyżej.
 */
const DOMAIN_ORDER: readonly string[] = Object.freeze(Object.values(DOMAINS))

/**
 * Rodzina celu albo `undefined`.
 *
 * `Object.hasOwn`, nie odczyt wprost: `target` przychodzi z mapowania, czyli
 * z wyjścia modelu albo z pliku klienta, a `TARGET_FAMILIES['constructor']`
 * oddałby funkcję z prototypu jako "znalezioną rodzinę".
 */
export function familyForTarget(target: string): TargetFamily | undefined {
  if (!Object.hasOwn(TARGET_FAMILIES, target)) return undefined
  return TARGET_FAMILIES[target]
}

// --- Wejście ----------------------------------------------------------------

/**
 * Tyle stacku, ile fala potrzebuje: nazwa, kwota i termin umowy. Celowo NIE
 * `StackRow` z `model.ts` - `StackRow` jest przypisywalny do tego kształtu, a
 * wywołujący bez tabeli stacku (np. sam brief) nie musi zmyślać `plan`,
 * `seats` ani `annual`.
 */
export interface WaveStackRow {
  tool: string
  /** `null`, gdy klient nie podał kosztu. Nie zero - zero znaczy "za darmo". */
  monthly: number | null
  /** ISO 8601 (`YYYY-MM-DD`) albo pusty string. */
  termEnds: string
  termType: TermType
}

export interface WaveInput {
  mappings: readonly MercatoMappingResult[]
  stack: readonly WaveStackRow[]
  /**
   * Plan migracji. Opcjonalny: kiedy jest, godziny wstrzykuje w mapowania
   * `attachEffortHours`; kiedy go nie ma, funkcja czyta `customEffortHours`
   * już obecne w mapowaniach. Z planu NIE jest czytane `sequence` - patrz
   * nota na górze pliku.
   */
  plan?: MigrationPlanResult
  /**
   * Data startu programu, ISO 8601 (`YYYY-MM-DD`). Bez niej nie ma kalendarza,
   * więc termin umowy rocznej nie ma czego wymusić - i wtedy nie wymusza
   * niczego. To jest świadome: raport bez daty startu nadal powstaje.
   */
  programmeStart?: string
  /** Przepustowość dostawcza. Domyślnie `DEFAULT_WEEKLY_HOURS`. */
  weeklyHours?: number
}

/**
 * Ile godzin wdrożenia mieści się w tygodniu kalendarzowym.
 *
 * 7,5 h to JEDEN DZIEŃ DOSTAWCZY W TYGODNIU - normalna kadencja konsultingu,
 * w której reszta tygodnia idzie na czekanie na klienta, testy po jego
 * stronie i pracę równoległą. Liczba nie jest dobrana pod wynik: złoty raport
 * wydaje 160 h w 22 tygodnie, czyli 7,27 h/tydzień, więc 7,5 wychodzi z jego
 * własnych sum.
 *
 * ZMIERZONE OGRANICZENIE: żadna stała nie odtworzy tygodni złotego raportu,
 * bo tam fala 1 (30 h) trwa 4 tygodnie, a fala 3 (te same 30 h) - 6. Różnica
 * to tydzień pracy równoległej przed odcięciem Jobbera, czyli fakt
 * HARMONOGRAMU, a nie pracochłonności; z samych godzin nie da się go wyliczyć
 * i ten plik nie udaje, że da. Przy 7,5 h/tydzień zgadza się DŁUGOŚĆ PROGRAMU
 * (22 tygodnie), fala 1 co do tygodnia, koniec fali 4 co do tygodnia i - co
 * dla pieniędzy najważniejsze - wszystkie cztery `bankedFromMonth`.
 */
export const DEFAULT_WEEKLY_HOURS = 7.5

/**
 * Ryzyko PROCESOWE werdyktu: ile zmienia się w sposobie pracy klienta.
 *
 * `native` nic nie zmienia (platforma już to ma). `integrate` zostawia
 * narzędzie na miejscu i dokłada tylko kabel - użytkownik nie uczy się
 * niczego nowego. `configure` przenosi proces na platformę i trzeba go tam
 * ustawić. `build` to kod, którego jeszcze nie ma.
 *
 * `keep` nie ma tu wpisu, bo wiersze `keep` nie wchodzą do żadnej fali.
 */
const PROCESS_RISK: Readonly<Record<Exclude<Decision, 'keep'>, number>> = Object.freeze({
  native: 0,
  integrate: 1,
  configure: 2,
  build: 3,
})

const DECISIONS: readonly Decision[] = Object.freeze([
  'native',
  'configure',
  'build',
  'integrate',
  'keep',
])

const TERM_TYPES: readonly TermType[] = Object.freeze(['monthly', 'annual'])

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// --- Bramy wejściowe --------------------------------------------------------

function fail(detail: string): never {
  throw new Error(`[mercatify-labs] groupIntoWaves: ${detail}`)
}

function isDecision(value: unknown): value is Decision {
  return DECISIONS.some((decision) => decision === value)
}

function isTermType(value: unknown): value is TermType {
  return TERM_TYPES.some((term) => term === value)
}

/**
 * ISO `YYYY-MM-DD` -> znacznik czasu UTC. `undefined`, gdy data jest pusta.
 *
 * Przez `Date.UTC`, nie przez `new Date(string)`: konstruktor na stringu bez
 * strefy daje północ UTC, ale na `"2027-02-28T00:00"` już północ LOKALNĄ - a
 * porównanie terminu umowy, które zmienia wynik razem ze strefą maszyny CI,
 * nie jest deterministyczne. Sprawdzamy też, czy data ISTNIEJE: `2026-02-30`
 * przechodzi przez regex, a `Date.UTC` po cichu przesuwa ją na marzec.
 */
function parseIsoDate(value: string, field: string): number | undefined {
  if (value.length === 0) return undefined
  if (!ISO_DATE.test(value)) fail(`${field} must be an ISO date (YYYY-MM-DD) or empty, got ${JSON.stringify(value)}`)
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const stamp = Date.UTC(year, month - 1, day)
  const back = new Date(stamp)
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    fail(`${field} is not a real calendar date: ${JSON.stringify(value)}`)
  }
  return stamp
}

/**
 * Mapowania przychodzą z wyjścia modelu, więc typ `MercatoMappingResult` nie
 * jest tu obroną - obroną jest ten kod. Ta sama zasada co w
 * `src/intake/fromBrief.ts` i `src/preview/validateScreens.ts`.
 */
function assertMappings(mappings: readonly MercatoMappingResult[]): void {
  mappings.forEach((mapping, index) => {
    const where = `mappings[${index}]`
    if (typeof mapping.source !== 'string' || mapping.source.trim().length === 0) {
      fail(`${where}.source must be a non-blank string`)
    }
    if (typeof mapping.capability !== 'string' || mapping.capability.trim().length === 0) {
      fail(`${where}.capability must be a non-blank string`)
    }
    if (typeof mapping.targetFeature !== 'string' || mapping.targetFeature.trim().length === 0) {
      fail(`${where}.targetFeature must be a non-blank string`)
    }
    if (!isDecision(mapping.decision)) {
      fail(`${where}.decision must be one of ${DECISIONS.join(', ')}, got ${JSON.stringify(mapping.decision)}`)
    }
    const hours = mapping.customEffortHours
    if (hours !== undefined && (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0)) {
      // `NaN` w godzinach zatruwał całą serię gotówki i czytał się jako "brak
      // ryzyka" - `computeCashSeries` ma na to własną bramę, ta łapie to
      // wcześniej i wskazuje konkretny wiersz planu.
      fail(`${where}.customEffortHours must be a non-negative finite number, got ${JSON.stringify(hours)}`)
    }
  })
}

/**
 * Stack po kanonizacji nazw. Dwa wiersze na jedno narzędzie (`HubSpot` i
 * `HubSpot Sales`) policzyłyby jego oszczędność dwa razy - i to w kwocie,
 * którą klient czyta jako "tyle odzyskuję". Zgłaszamy, zamiast sumować.
 */
function indexStack(stack: readonly WaveStackRow[]): Map<string, WaveStackRow> {
  const byTool = new Map<string, WaveStackRow>()
  stack.forEach((row, index) => {
    const where = `stack[${index}]`
    if (typeof row.tool !== 'string' || row.tool.trim().length === 0) {
      fail(`${where}.tool must be a non-blank string`)
    }
    if (row.monthly !== null && (typeof row.monthly !== 'number' || !Number.isFinite(row.monthly) || row.monthly < 0)) {
      fail(`${where}.monthly must be null or a non-negative finite number, got ${JSON.stringify(row.monthly)}`)
    }
    if (!isTermType(row.termType)) {
      fail(`${where}.termType must be one of ${TERM_TYPES.join(', ')}, got ${JSON.stringify(row.termType)}`)
    }
    if (typeof row.termEnds !== 'string') fail(`${where}.termEnds must be a string`)
    parseIsoDate(row.termEnds, `${where}.termEnds`)

    const identity = toolIdentity(row.tool)
    const claimedBy = byTool.get(identity)
    if (claimedBy !== undefined) {
      fail(
        `two stack rows resolve to the same tool ${JSON.stringify(identity)}: ` +
          `${JSON.stringify(claimedBy.tool)} and ${JSON.stringify(row.tool)}. ` +
          `Its saving would be banked twice.`,
      )
    }
    byTool.set(identity, row)
  })
  return byTool
}

/**
 * TOŻSAMOŚĆ narzędzia - klucz, po którym schodzą się mapowanie i wiersz
 * stacku. Most aliasów z `src/catalogToolAliases.ts`, bo porównanie dosłowne
 * gubiłoby kwotę 890 $ przy fali, która właśnie tę subskrypcję wyłącza: brief
 * mówi `HubSpot Sales`, tabela pokrycia goldena `HubSpot Sales`, a jego lista
 * gasnących narzędzi `HubSpot`.
 */
function toolIdentity(name: string): string {
  return resolveToolAlias(name) ?? name
}

/**
 * ETYKIETA narzędzia - nazwa, którą raport pokazuje klientowi.
 *
 * To NIE jest to samo co tożsamość i tu most aliasów okazał się
 * niewystarczający: `resolveToolAlias('Jobber')` oddaje `Jobber / ServiceTitan`,
 * czyli scalony wpis katalogu. To jest nazwa KSIĘGOWA katalogu (jeden wpis
 * obsługuje dwa produkty), a nie nazwa, którą klient ma na fakturze - złoty
 * raport pisze w falach `Jobber off`, `Sortly off`, nigdy `Jobber / ServiceTitan`.
 * Co gorsza, z samego wpisu `A / B` nie da się odgadnąć, którego z dwóch
 * produktów używa TEN klient.
 *
 * Do etykiety idzie więc tylko ta połowa mostu, która jest jednoznaczna:
 * `MANUAL_TOOL_ALIASES`, czyli nazwa handlowa lub planowa tego samego produktu
 * (`HubSpot Sales` -> `HubSpot`). Reszta zostaje tak, jak napisał ją klient.
 */
export function canonicalToolLabel(name: string): string {
  if (!Object.hasOwn(MANUAL_TOOL_ALIASES, name)) return name
  return MANUAL_TOOL_ALIASES[name]
}

// --- Składanie fal ----------------------------------------------------------

/**
 * Zdolność, której katalog nie zna (`mapCapabilities`, ścieżka awaryjna ze
 * SPEC.md §6.2). Ta sama stała co w `toolGoesOff` i w `deriveStatementCounts` -
 * trzy miejsca porównujące trzy różne teksty rozjechałyby raport z samym sobą.
 *
 * ROZSTRZYGNIĘCIE: TAKA ZDOLNOŚĆ NIE WCHODZI DO FAL W OGÓLE.
 *
 * Nie do `scope`, nie do `hours`, nie do wyboru domeny, nie do `toolsOff` ani
 * `toolsReduced`. Złoty raport mówi o tych pozycjach dosłownie: *"They are
 * excluded from every figure in this report"* - a fala JEST kwotą, i to w
 * czterech miejscach naraz (`Wave.hours` -> `money.totalHours` ->
 * `kpis.implementationCost`, plus tygodnie programu, plus break-even, plus
 * `netAtHorizon`).
 *
 * `toolVerdict.ts` trzymał już połowę tej obietnicy - stronę OSZCZĘDNOŚCI:
 * narzędzie ze zdolnością spoza katalogu nie gaśnie, więc jego abonament nie
 * wchodzi do `removedSaaS`. Strona KOSZTU była dziurawa, bo ten plik o
 * pojęciu "poza katalogiem" nie wiedział. Zmierzone na briefie Voltixa z
 * dopisanym Aurora Solar (jedna zdolność `panel_layout`, 16 h w planie):
 * `implementationCost` 19 800 -> 21 720, `programmeWeeks` 23 -> 26,
 * `breakEvenMonth` 15 -> 16, `netAtHorizon` 40 435 -> 37 751, a w sekcji 06
 * wyrastała fala **"TBD — needs discovery"** bankująca 0/mies. - czyli raport
 * obiecywał dostarczyć w trzech tygodniach coś, o czym sam pisał, że nie ma o
 * tym wpisu.
 *
 * DLACZEGO CAŁKOWICIE, A NIE JAKO POZYCJA "DO OSZACOWANIA PO ROZPOZNANIU":
 * fala o zerowych godzinach nadal trwa tydzień (`scheduleWeeks` ma podłogę
 * `Math.max(1, ...)`), więc przesuwa kalendarz każdej następnej fali i mimo
 * zerowej kwoty rusza break-even. Pozycja bez godzin w CUDZEJ fali byłaby z
 * kolei niespójna: narzędzie mieszane pokazywałoby ją w sekcji 06, a
 * narzędzie w całości spoza katalogu nie ma fali, w której mogłaby stanąć.
 *
 * NIC SIĘ NIE GUBI I NIC NIE ZNIKA PO CICHU. Jawnie nazwanym miejscem tych
 * pozycji jest Appendix B (`facts.gaps`, `findCatalogGaps`) - dokładnie tam,
 * gdzie stawia je golden: z opisem klienta, powodem braku wpisu i "naszym
 * odczytem" kuratora. Liczy je też przypis sekcji 02. Sekcja 06 milczy o nich
 * dlatego, że jest PLANEM DOSTAWY, a pozycji bez wpisu w katalogu nie da się
 * zaplanować - i to jest cała treść tej decyzji.
 */
function isOffCatalog(mapping: Pick<MercatoMappingResult, 'evidence'>): boolean {
  return mapping.evidence === OFF_CATALOG_EVIDENCE
}

interface ToolBucket {
  /** Klucz spinający mapowanie z wierszem stacku. Nigdy nie idzie do raportu. */
  identity: string
  /** Nazwa dla czytelnika - ta trafia do `toolsOff` / `toolsReduced`. */
  label: string
  /** Kolejność pierwszego pojawienia się w mapowaniach - stabilny porządek. */
  firstSeen: number
  /**
   * WSZYSTKIE mapowania narzędzia, razem z `keep` i z tymi spoza katalogu -
   * decydują, czy gaśnie. `toolGoesOff` MUSI widzieć tu pozycję spoza
   * katalogu, bo to ona trzyma subskrypcję przy życiu.
   */
  all: MercatoMappingResult[]
  /**
   * Mapowania, które są pracą - bez `keep` i bez pozycji spoza katalogu
   * (`isOffCatalog`). Z nich powstaje `scope`, `hours` i domena fali.
   */
  work: MercatoMappingResult[]
}

/**
 * Domena narzędzia. Jedna, bo narzędzie gaśnie w całości albo wcale.
 *
 * Mechanizmy (`owns: false`) liczą się dopiero wtedy, gdy narzędzie nie ma ani
 * jednego celu domenowego. Gdy mimo to zostaje więcej niż jedna domena,
 * wygrywa ta z największą liczbą mapowań, a przy remisie - wcześniejsza w
 * `DOMAIN_ORDER`. TEN OSTATNI KROK JEST ARBITRALNY i jest tu wyłącznie po to,
 * żeby wynik był deterministyczny: na stosie Voltixa nigdy się nie odpala, bo
 * po odsianiu mechanizmów każde narzędzie ma dokładnie jedną domenę.
 */
function domainForTool(bucket: ToolBucket): string {
  const owning = bucket.work.filter((mapping) => {
    const family = familyForTarget(mapping.targetFeature)
    // Cel nieznany tablicy JEST domeną samą w sobie - własną falą, nigdy
    // cichym dołączeniem do cudzej.
    return family === undefined || family.owns
  })
  const pool = owning.length > 0 ? owning : bucket.work

  const counts = new Map<string, number>()
  for (const mapping of pool) {
    const family = familyForTarget(mapping.targetFeature)
    const domain = family === undefined ? mapping.targetFeature : family.domain
    counts.set(domain, (counts.get(domain) ?? 0) + 1)
  }

  let best: string | undefined
  let bestCount = 0
  for (const [domain, count] of counts) {
    if (best === undefined || count > bestCount || (count === bestCount && compareDomains(domain, best) < 0)) {
      best = domain
      bestCount = count
    }
  }
  if (best === undefined) fail(`tool ${JSON.stringify(bucket.label)} has no work to place in a wave`)
  return best
}

/** Domeny znane idą w kolejności deklaracji, nieznane (cel jako domena) po nich. */
function compareDomains(a: string, b: string): number {
  const indexA = DOMAIN_ORDER.indexOf(a)
  const indexB = DOMAIN_ORDER.indexOf(b)
  if (indexA !== indexB) {
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  }
  return a < b ? -1 : a > b ? 1 : 0
}

interface DraftWave {
  domain: string
  tools: ToolBucket[]
  scope: WaveScopeItem[]
  hours: number
  hoursAreFloor: boolean
  riskRank: number
  toolsOff: string[]
  toolsReduced: string[]
  monthlyBanked: number | null
  /** Najwcześniejszy termin umowy rocznej wśród gasnących narzędzi. */
  deadline: number | undefined
}

function buildDraft(domain: string, tools: ToolBucket[], stackByTool: Map<string, WaveStackRow>): DraftWave {
  const ordered = [...tools].sort((a, b) => a.firstSeen - b.firstSeen)

  const scope: WaveScopeItem[] = []
  let hours = 0
  let hoursAreFloor = false
  let riskRank = 0
  for (const tool of ordered) {
    for (const mapping of tool.work) {
      const estimatedHours = mapping.customEffortHours ?? null
      scope.push({
        source: mapping.source,
        capability: mapping.capability,
        decision: mapping.decision,
        estimatedHours,
      })
      hours += estimatedHours ?? 0
      // Tylko `build`: konfiguracja bez estymaty mieści się w ryczałcie fali,
      // ale kod, którego nikt nie wycenił, NIE. Zasada 5 planu - i nigdy nie
      // podstawiamy tu domyślnych 40 h, bo raport podałby wtedy liczbę,
      // której nikt nie policzył.
      if (mapping.decision === 'build' && estimatedHours === null) hoursAreFloor = true
      // `work` nie zawiera `keep`, ale typ `Decision` o tym nie wie - a
      // `PROCESS_RISK` celowo nie ma wpisu dla werdyktu, który nie jest pracą.
      if (mapping.decision !== 'keep') riskRank = Math.max(riskRank, PROCESS_RISK[mapping.decision])
    }
  }

  // Druga brama tej samej reguły, i to ONA broni przebiegu BEZ planu migracji.
  //
  // Powyższa gałąź pyta o pojedynczy wiersz `build`. Fala złożona z samych
  // `native`/`configure` nie ma takiego wiersza, więc dostawała `hours = 0`
  // BEZ flagi - twarde zero, choć ten sam przebieg dopisywał do `degradations`
  // "no migration plan, wave totals are lower bounds". Dokument mówił wtedy
  // dwie różne rzeczy o tej samej liczbie, a czytelnik widział tylko tę
  // gorszą: `Wave 1 · 0 h · $0`, a stąd koszt wdrożenia 0, break-even w
  // miesiącu 2 i kamień milowy "all 4 waves delivered - −$180".
  //
  // Rozróżnienie jest w DANYCH, nie w werdyktach: zero policzone (plan
  // przypisał `estimatedHours: 0`) to pomiar, a zero z braku wszystkich
  // estymat to jego brak. Fala, w której NIC nie zostało wycenione, jest więc
  // dolną granicą - fala z choć jedną estymatą pozostaje sumą, jaką była.
  if (scope.length > 0 && scope.every((item) => item.estimatedHours === null)) {
    hoursAreFloor = true
  }

  // Werdykt "gaśnie / zostaje" liczymy RAZ na narzędzie i dalej chodzimy po
  // obiektach, nie po etykietach: etykieta jest tekstem dla czytelnika i dwa
  // różne narzędzia mogłyby ją kiedyś dzielić, a wtedy szukanie po nazwie
  // przypisałoby kwotę nie temu wierszowi stacku.
  const closing = ordered.filter((tool) => toolGoesOff(tool.all))
  const toolsOff = closing.map((tool) => tool.label)
  const toolsReduced = ordered.filter((tool) => !closing.includes(tool)).map((tool) => tool.label)

  // Kwota: `null`, gdy któregoś gasnącego narzędzia nie ma w stacku albo nie
  // podano jego kosztu. Zsumowanie reszty dałoby liczbę WYGLĄDAJĄCĄ na pełną,
  // a raport obiecuje w Appendix A, że każdą kwotę da się przeliczyć ręcznie.
  let monthlyBanked: number | null = 0
  for (const tool of closing) {
    const row = stackByTool.get(tool.identity)
    if (row === undefined || row.monthly === null) {
      monthlyBanked = null
      break
    }
    monthlyBanked += row.monthly
  }

  let deadline: number | undefined
  for (const tool of closing) {
    const row = stackByTool.get(tool.identity)
    if (row === undefined || row.termType !== 'annual') continue
    const ends = parseIsoDate(row.termEnds, `stack row ${JSON.stringify(row.tool)}.termEnds`)
    if (ends === undefined) continue
    if (deadline === undefined || ends < deadline) deadline = ends
  }

  return {
    domain,
    tools: ordered,
    scope,
    hours,
    hoursAreFloor,
    riskRank,
    toolsOff,
    toolsReduced,
    monthlyBanked,
    deadline,
  }
}

/**
 * Kolejność fal: ROSNĄCE RYZYKO PROCESOWE.
 *
 * Deterministyczne proxy ryzyka to najwyższy werdykt w zakresie fali:
 * najpierw fale o samych `native`, potem `integrate`, `configure`, na końcu
 * te z `build`. Remis rozstrzyga mniejsza liczba godzin (krótsza fala niesie
 * mniej ryzyka przy tym samym werdykcie), a ostatni remis - kolejność domen,
 * żeby wynik nigdy nie zależał od kolejności wierszy na wejściu.
 *
 * Zmierzone na Voltixie: na werdyktach ZE ZŁOTEGO RAPORTU ta reguła odtwarza
 * jego kolejność co do fali (rejestry 30 h, CRM 55 h, serwis, wsparcie).
 * Na werdyktach z ŻYWEGO KATALOGU już nie - szczegóły w `waves.test.ts`,
 * bo rozjeżdżają się tam DANE, nie reguła.
 */
function compareWaves(a: DraftWave, b: DraftWave): number {
  if (a.riskRank !== b.riskRank) return a.riskRank - b.riskRank
  if (a.hours !== b.hours) return a.hours - b.hours
  return compareDomains(a.domain, b.domain)
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

interface WeekSpan {
  weekFrom: number
  weekTo: number
}

/** Fale idą jedna po drugiej, od tygodnia 1. Fala trwa co najmniej tydzień. */
function scheduleWeeks(waves: readonly DraftWave[], weeklyHours: number): WeekSpan[] {
  let previous = 0
  return waves.map((wave) => {
    const length = Math.max(1, Math.ceil(wave.hours / weeklyHours))
    const weekFrom = previous + 1
    const weekTo = previous + length
    previous = weekTo
    return { weekFrom, weekTo }
  })
}

/**
 * Umowa roczna wymusza termin: fala gasząca narzędzie z `termType: 'annual'`
 * musi się domknąć PRZED `termEnds`, inaczej klient płaci kolejny rok.
 *
 * Termin jest SUFITEM, nie podłogą - dlatego nie jest kluczem sortowania.
 * HubSpot Voltixa (28.02.2027) przy starcie w październiku 2026 kończy się w
 * fali 2 z ogromnym zapasem, więc reguła ryzyka zostaje nietknięta i raport
 * może napisać "the point of sequencing it second rather than first". Dopiero
 * gdy harmonogram faktycznie mija termin, przesuwamy falę o jedno miejsce w
 * przód i liczymy jeszcze raz.
 *
 * Pętla jest ograniczona `n^2` przesunięciami i kończy się też wtedy, gdy
 * naruszająca fala stoi już na pierwszym miejscu - wcześniej nie da się jej
 * postawić. Taki termin jest po prostu nie do dotrzymania; `Wave` nie ma pola,
 * w którym dałoby się to powiedzieć, więc mówi to o nim sam harmonogram.
 */
function enforceAnnualTerms(
  waves: DraftWave[],
  weeklyHours: number,
  programmeStart: number | undefined,
): DraftWave[] {
  if (programmeStart === undefined) return waves

  const order = [...waves]
  const limit = order.length * order.length
  for (let guard = 0; guard < limit; guard += 1) {
    const spans = scheduleWeeks(order, weeklyHours)
    const violating = order.findIndex((wave, index) => {
      if (wave.deadline === undefined) return false
      return programmeStart + spans[index].weekTo * WEEK_MS > wave.deadline
    })
    if (violating <= 0) break
    const previous = order[violating - 1]
    order[violating - 1] = order[violating]
    order[violating] = previous
  }
  return order
}

// --- Funkcja główna ---------------------------------------------------------

/**
 * Mapowania + plan + stack -> fale sekcji 06.
 *
 * Wynik jest gotowym wejściem `computeCashSeries` - i to nie przypadek:
 * `bankedFromMonth` liczy tu `planWaveSpendWindows`, ta sama funkcja, którą
 * seria gotówki rozkłada wydatek na miesiące.
 */
export function groupIntoWaves(input: WaveInput): Wave[] {
  const weeklyHours = input.weeklyHours ?? DEFAULT_WEEKLY_HOURS
  if (typeof weeklyHours !== 'number' || !Number.isFinite(weeklyHours) || weeklyHours <= 0) {
    fail(`weeklyHours must be a positive finite number, got ${JSON.stringify(weeklyHours)}`)
  }

  const stackByTool = indexStack(input.stack)
  const programmeStart =
    input.programmeStart === undefined ? undefined : parseIsoDate(input.programmeStart, 'programmeStart')

  // Godziny z planu wstrzykuje JEDNA funkcja - `attachEffortHours`. Kopiowanie
  // jej dopasowania `source::capability` tutaj dałoby drugie miejsce, w którym
  // wiersz planu może przestać trafiać w mapowanie.
  const mappings =
    input.plan === undefined ? [...input.mappings] : attachEffortHours([...input.mappings], input.plan)
  // Brama stoi PO wstrzyknięciu godzin, bo plan bywa budowany ręcznie i to on
  // jest źródłem `customEffortHours` - sprawdzanie mapowań przed nim
  // przepuściłoby `NaN` prosto do sumy godzin fali.
  assertMappings(mappings)

  // Zero mapowań to zero fal - bez wyjątku i bez fali "pustej".
  if (mappings.length === 0) return []

  const buckets = new Map<string, ToolBucket>()
  mappings.forEach((mapping, index) => {
    const identity = toolIdentity(mapping.source)
    const bucket =
      buckets.get(identity) ?? {
        identity,
        label: canonicalToolLabel(mapping.source),
        firstSeen: index,
        all: [],
        work: [],
      }
    bucket.all.push(mapping)
    // `keep` to nie praca: Xero nie wchodzi do żadnej fali, bo nikt niczego z
    // nim nie robi. Werdykt zostaje jednak w `all`, bo trzyma subskrypcję.
    //
    // Pozycja spoza katalogu też nie jest pracą, i to z MOCNIEJSZEGO powodu:
    // `keep` znaczy "policzyliśmy i zostawiamy", a ta znaczy "nie mamy o tym
    // wpisu". `mapCapabilities` daje jej `decision: 'build'`, więc bez tej
    // bramy weszłaby do zakresu jako zwykły kod do napisania - patrz
    // `isOffCatalog` wyżej. W `all` zostaje, bo `toolGoesOff` czyta właśnie
    // stamtąd.
    if (mapping.decision !== 'keep' && !isOffCatalog(mapping)) bucket.work.push(mapping)
    buckets.set(identity, bucket)
  })

  const byDomain = new Map<string, ToolBucket[]>()
  for (const bucket of buckets.values()) {
    // Narzędzie bez ani jednej pozycji pracy nie ma fali. Dotyczy to zarówno
    // narzędzia w całości na `keep` (Xero), jak i narzędzia w całości spoza
    // katalogu (Aurora Solar) - to drugie jedzie do Appendix B, nie tutaj.
    if (bucket.work.length === 0) continue
    const domain = domainForTool(bucket)
    const list = byDomain.get(domain) ?? []
    list.push(bucket)
    byDomain.set(domain, list)
  }
  if (byDomain.size === 0) return []

  const drafts = [...byDomain.entries()].map(([domain, tools]) => buildDraft(domain, tools, stackByTool))
  drafts.sort(compareWaves)
  const ordered = enforceAnnualTerms(drafts, weeklyHours, programmeStart)
  const spans = scheduleWeeks(ordered, weeklyHours)

  // `bankedFromMonth` dostaje na razie 1, bo `planWaveSpendWindows` waliduje
  // wejście i odrzuciłoby 0. Prawdziwa wartość wchodzi zaraz niżej - z TEJ
  // funkcji, nie z arytmetyki przepisanej tutaj (zasada 6 planu).
  const waves: Wave[] = ordered.map((draft, index) => ({
    n: index + 1,
    title: draft.domain,
    weekFrom: spans[index].weekFrom,
    weekTo: spans[index].weekTo,
    hours: draft.hours,
    hoursAreFloor: draft.hoursAreFloor,
    scope: draft.scope,
    toolsOff: draft.toolsOff,
    toolsReduced: draft.toolsReduced,
    monthlyBanked: draft.monthlyBanked,
    bankedFromMonth: 1,
  }))

  const windows = planWaveSpendWindows(waves)
  const endByWave = new Map(windows.map((window) => [window.waveNumber, window.endMonth]))
  return waves.map((wave) => {
    const endMonth = endByWave.get(wave.n)
    if (endMonth === undefined) {
      fail(`planWaveSpendWindows returned no spend window for wave ${wave.n}`)
    }
    // Oszczędność startuje MIESIĄC PO domknięciu fali - licencja gaśnie z
    // końcem okresu rozliczeniowego, nie w dniu odcięcia.
    return { ...wave, bankedFromMonth: endMonth + 1 }
  })
}
