import type { MercatoMappingResult } from '../types'
import { OFF_CATALOG_EVIDENCE } from '../toolVerdict'
import type { StatementCounts } from './model'

/**
 * Sygnał "poza katalogiem" to DOKŁADNIE ten string, który ustawia
 * `mapCapabilities` w ścieżce awaryjnej (SPEC.md §6.2). Ta sama stała stoi za
 * `findCatalogGaps` (`src/catalogGaps.ts`) - gdyby te dwa miejsca porównywały
 * różne teksty, Appendix B i licznik z sekcji 02 podawałyby inne liczby w tym
 * samym dokumencie.
 */
export { OFF_CATALOG_EVIDENCE } from '../toolVerdict'

/**
 * Liczniki, które da się wyprowadzić Z SAMYCH MAPOWAŃ.
 *
 * To NIE jest to samo, co "38 usage statements" z sekcji 02 raportu - patrz
 * `resolveStatementCounts` niżej. Ta funkcja liczy zdolności, które silnik
 * faktycznie zmapował, i jest dolną granicą dla liczby podanej przez
 * konsultanta.
 *
 * Liczy WYPOWIEDZI, nie unikalne pary narzędzie-zdolność - i tym różni się od
 * `findCatalogGaps`, które deduplikuje, bo kuratorowi nie ma sensu dawać tej
 * samej luki dwa razy.
 */
export function deriveStatementCounts(mappings: readonly MercatoMappingResult[]): StatementCounts {
  const offCatalog = mappings.reduce(
    (sum, mapping) => (mapping.evidence === OFF_CATALOG_EVIDENCE ? sum + 1 : sum),
    0,
  )
  return {
    statements: mappings.length,
    matched: mappings.length - offCatalog,
    offCatalog,
  }
}

/**
 * Liczniki sekcji 02 raportu, podane przez konsultanta.
 *
 * Złoty raport mówi: "38 usage statements were extracted from the above" -
 * gdzie "the above" to 62-minutowa rozmowa, siedem faktur i trzy
 * screen-share'y. Formularz tego nie zbiera i nie ma jak zebrać: to liczba z
 * rozpoznania, nie z listy narzędzi. Próba wyprowadzenia jej z mapowań daje
 * inną wielkość (dla Voltixa 15, nie 38), bo brief zapisuje jeden slug na
 * pracę, a rozpoznanie wyłuskuje wiele wypowiedzi na jedną zdolność.
 *
 * Dlatego jest to WEJŚCIE OD CZŁOWIEKA, tak samo jak `omOperatingCost`,
 * `implementationCost` i stawka (SPEC.md §2 zasada 2 dotyczy wymyślania
 * liczb przez model, nie podawania ich przez klienta i konsultanta).
 *
 * CO Z TEGO WYNIKA DLA DOKUMENTU: raport niesie obie liczby i MUSI powiedzieć,
 * że są różne. Figure 1 nazywa swoją jednostkę "mapped capabilities"
 * (`templates/coverage.ts`), a przypis sekcji 02 dopisuje zdanie o tej
 * różnicy, kiedy liczby się rozchodzą (`templates/basis.ts`). Dorobienie
 * rozkładu 38 na werdykty byłoby zmyślaniem - tych wypowiedzi nikt nie ocenił
 * po jednej.
 */
export interface ProvidedStatementCounts {
  statements: number
  offCatalog: number
}

function assertNonNegativeInt(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `[mercatify-labs] resolveStatementCounts: ${field} must be a non-negative whole number, got ${JSON.stringify(value)}`,
    )
  }
}

/**
 * Bierze liczby od konsultanta, jeśli podał - w przeciwnym razie wyprowadza je
 * z mapowań.
 *
 * Trzy bramy, wszystkie dlatego, że to jedyna liczba w raporcie, której nikt
 * nie przelicza automatycznie, a stoi na okładce sekcji 02 i pod Figure 1:
 *
 * 1. `matched + offCatalog === statements`. Arytmetyka sekcji 02 ma się
 *    zgadzać w dokumencie, a nie dopiero u czytelnika.
 * 2. `statements >= tyle, ile silnik zmapował`. Rozpoznanie może znaleźć
 *    WIĘCEJ wypowiedzi niż zdolności w formularzu - nigdy mniej. Liczba
 *    poniżej oznacza literówkę albo brief niezgodny z rozpoznaniem.
 * 3. `offCatalog >= tyle, ile silnik znalazł poza katalogiem`. Konsultant
 *    może dopisać luki, których w formularzu nie było (Appendix B goldena to
 *    dokładnie ten przypadek: cztery narzędzia, których klient nie zgłosił),
 *    ale nie może UKRYĆ luki, którą silnik zobaczył.
 */
export function resolveStatementCounts(
  mappings: readonly MercatoMappingResult[],
  provided?: ProvidedStatementCounts,
): StatementCounts {
  const derived = deriveStatementCounts(mappings)
  if (provided === undefined) return derived

  const statements = provided.statements
  const offCatalog = provided.offCatalog
  assertNonNegativeInt(statements, 'statements')
  assertNonNegativeInt(offCatalog, 'offCatalog')

  if (offCatalog > statements) {
    throw new Error(
      `[mercatify-labs] resolveStatementCounts: offCatalog (${offCatalog}) cannot exceed statements (${statements}).`,
    )
  }
  if (statements < derived.statements) {
    throw new Error(
      `[mercatify-labs] resolveStatementCounts: you reported ${statements} usage statements, but the stack ` +
        `submitted ${derived.statements} capabilities. Discovery can find more statements than the form lists, never fewer.`,
    )
  }
  if (offCatalog < derived.offCatalog) {
    throw new Error(
      `[mercatify-labs] resolveStatementCounts: you reported ${offCatalog} off-catalog statements, but the mapping ` +
        `engine found ${derived.offCatalog}. A gap the engine saw cannot be reported away.`,
    )
  }
  return { statements, matched: statements - offCatalog, offCatalog }
}
