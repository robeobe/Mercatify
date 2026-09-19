/**
 * Most między nazwą narzędzia, którą pisze klient, a nazwą, pod którą to
 * narzędzie stoi w katalogu.
 *
 * Aliasy ZDOLNOŚCI mieszkają obok, w `src/catalogAliases.ts`, i rozwiązują
 * drugą połowę klucza (`HubSpot` + `contacts`). Ten plik rozwiązuje pierwszą.
 * Bez niego cały brief klienta wypadał poza katalog na samej nazwie: scalony
 * katalog niesie `HubSpot`, `Zendesk`, `Jobber / ServiceTitan`,
 * `Sortly / inFlow`, `Xero / QuickBooks`, a brief z formularza mówi
 * `HubSpot Sales`, `Zendesk Suite`, `Jobber`, `Sortly`, `Xero` - pięć z
 * siedmiu narzędzi Voltixa nie trafiało w nic.
 *
 * DLACZEGO JAWNA TABLICA, A NIE DOPASOWANIE PO PODCIĄGU: dokładnie ten sam
 * powód co przy zdolnościach (SPEC.md §6.2). Nieznane narzędzie ma UCZCIWIE
 * wypaść jako `build` / `low` / `not in catalog` i pokazać się w
 * `src/catalogGaps.ts`. Luźne dopasowanie ("`HubSpot Sales` zawiera
 * `HubSpot`, pewnie o to chodzi") zamieniłoby literówkę albo obcy produkt o
 * podobnej nazwie w CICHĄ PODMIANĘ narzędzia - a stąd w werdykt `native` i
 * złą kwotę w raporcie, bez jednego ostrzeżenia po drodze.
 *
 * Tablica powstaje z dwóch źródeł i oba są skończone:
 *
 *  1. CZŁONY WPISÓW `A / B` - generowane z danych katalogu. Katalog zapisuje
 *     `Jobber / ServiceTitan` właśnie dlatego, że jeden wpis obsługuje dwa
 *     produkty; klient ma u siebie jeden z nich i tak go nazywa. Ten krok
 *     jest GENERATYWNY, a nie ręczną listą, żeby nowe narzędzie `A / B` nie
 *     wymagało pamiętania o dopisaniu członów.
 *  2. NAZWY HANDLOWE I PLANOWE - wpisywane ręcznie, po jednej świadomej
 *     decyzji na wpis (`MANUAL_TOOL_ALIASES`).
 *
 * Kolizja (dwa narzędzia roszczące sobie ten sam człon, człon przesłaniający
 * nazwę kanoniczną, ręczny alias w nieistniejące narzędzie) RZUCA przy
 * ładowaniu modułu. Cicha wygrana jednego z dwóch narzędzi to dokładnie ta
 * klasa błędu, przed którą broni ta tablica.
 */
import rawCatalog from './catalogData.json'

/**
 * Separator członów w scalonym wpisie katalogu. Spacje po obu stronach są
 * częścią separatora: rozbicie po samym `/` rozerwałoby nazwę w rodzaju
 * `A/B Testing` na dwa bezsensowne człony.
 */
const MEMBER_SEPARATOR = ' / '

/**
 * Aliasy wpisane RĘCZNIE - każdy to osobna decyzja, nie reguła.
 *
 * `HubSpot Sales`, `Zendesk Suite`: nazwa planu doklejona do nazwy produktu.
 * Katalog opisuje produkt, nie cennik, więc plan nie zmienia werdyktów -
 * a formularze i faktury klienta noszą właśnie tę pełną nazwę.
 *
 * Tu NIE dopisuje się nowego narzędzia: nowe narzędzie dostaje własny wpis w
 * `catalogData.json`. Tu trafia wyłącznie inna nazwa narzędzia, które w
 * katalogu już jest.
 */
export const MANUAL_TOOL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'HubSpot Sales': 'HubSpot',
  'Zendesk Suite': 'Zendesk',
})

function fail(detail: string): never {
  throw new Error(`[mercatify-labs] catalogToolAliases: ${detail}`)
}

/**
 * Buduje tablicę aliasów nazw z listy nazw kanonicznych i z wpisów ręcznych.
 *
 * Czysta i eksportowana, bo inaczej kolizji nie da się przetestować inaczej
 * niż psując `catalogData.json` - a to jedyna reguła w tym pliku, która ma
 * prawo kogoś zatrzymać, więc musi mieć własny test.
 *
 * Wynik budowany jest przez `Object.fromEntries`, nie przez przypisania do
 * literału: przypisanie `aliases['__proto__'] = x` trafiłoby w setter
 * prototypu i NIE utworzyło własnego pola, więc `Object.hasOwn` niżej nigdy
 * by go nie zobaczył, a alias zniknąłby bez śladu.
 */
export function buildToolAliases(
  canonicalNames: readonly string[],
  manual: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const canonical = new Set(canonicalNames)
  // Alias -> nazwa kanoniczna. `claimedBy` pamięta, kto zgłosił się pierwszy,
  // żeby komunikat o kolizji mógł wymienić OBU pretendentów - sama informacja
  // "kolizja" nie mówi, który wpis katalogu poprawić.
  const aliases = new Map<string, string>()

  for (const name of canonicalNames) {
    if (!name.includes(MEMBER_SEPARATOR)) continue
    const members = name.split(MEMBER_SEPARATOR)
    for (const member of members) {
      if (member.trim().length === 0) {
        fail(`nazwa "${name}" rozbija się na pusty człon - popraw wpis w catalogData.json`)
      }
      if (canonical.has(member)) {
        // Odczyt dosłowny w `getCatalogTool` idzie pierwszy, więc taki alias
        // byłby martwy, a katalog miałby dwa wpisy na jedno narzędzie.
        fail(`człon "${member}" nazwy "${name}" jest jednocześnie osobnym narzędziem w katalogu`)
      }
      const claimedBy = aliases.get(member)
      if (claimedBy !== undefined && claimedBy !== name) {
        fail(`człon "${member}" jest zgłaszany przez dwa narzędzia: "${claimedBy}" i "${name}"`)
      }
      aliases.set(member, name)
    }
  }

  for (const alias of Object.keys(manual)) {
    const target = manual[alias]
    if (canonical.has(alias)) {
      fail(`ręczny alias "${alias}" jest nazwą narzędzia w katalogu - przesłaniałby odczyt dosłowny`)
    }
    if (!canonical.has(target)) {
      fail(`ręczny alias "${alias}" celuje w "${target}", którego nie ma w katalogu`)
    }
    const claimedBy = aliases.get(alias)
    if (claimedBy !== undefined) {
      fail(`ręczny alias "${alias}" powstaje już z członów nazwy "${claimedBy}"`)
    }
    aliases.set(alias, target)
  }

  return Object.freeze(Object.fromEntries(aliases))
}

/**
 * Tablica żywa w tym procesie. Budowana przy ładowaniu modułu, więc wpis
 * katalogu, który łamie którąkolwiek regułę wyżej, wywala pakiet od razu -
 * nie po cichu, w środku przebiegu, na jednym narzędziu.
 */
export const TOOL_ALIASES: Readonly<Record<string, string>> = buildToolAliases(
  Object.keys(rawCatalog),
  MANUAL_TOOL_ALIASES,
)

/**
 * Nazwa kanoniczna dla aliasu albo `undefined`, gdy aliasu nie ma w tablicy.
 *
 * `Object.hasOwn`, a nie odczyt wprost: `name` przychodzi z briefu klienta
 * albo z wyjścia modelu, a `TOOL_ALIASES['constructor']` bez tej kontroli
 * oddałby funkcję z prototypu jako "znalezioną nazwę narzędzia".
 */
export function resolveToolAlias(name: string): string | undefined {
  if (!Object.hasOwn(TOOL_ALIASES, name)) return undefined
  return TOOL_ALIASES[name]
}

/** Aliasy celujące w podaną nazwę kanoniczną. Do komunikatów i testów. */
export function toolAliasesFor(canonicalName: string): string[] {
  return Object.keys(TOOL_ALIASES).filter((alias) => TOOL_ALIASES[alias] === canonicalName)
}
