import type { Decision, MercatoMappingResult } from './types'

/**
 * JEDNA reguła: kiedy subskrypcja gaśnie, a kiedy zostaje.
 *
 * Reguła brzmi: narzędzie gaśnie tylko wtedy, gdy KAŻDA jego zmapowana
 * zdolność wyszła jako `native`, `configure` albo `build` - czyli platforma
 * przejmuje całą robotę, teraz albo po dorobieniu. Jeden `integrate` albo
 * `keep` trzyma CAŁĄ subskrypcję, bo kontraktu SaaS nie da się anulować w
 * połowie: PandaDoc z ofertami przeniesionymi na platformę i podpisem
 * zostawionym u siebie nadal wystawia fakturę co miesiąc.
 *
 * DLACZEGO OSOBNY PLIK: ta reguła decyduje o KWOCIE w raporcie (co wchodzi do
 * `grossAnnualSaving` i do `Wave.monthlyBanked`), a mieszkała w dwóch
 * kopiach - w `computeScenario` i w `toolVerdictState`
 * (`assets/stack-tool/mapping.html`). Trzecia kopia w `groupIntoWaves`
 * oznaczałaby, że tabela ROI i sekcja 06 tego samego dokumentu mogą podać
 * inną listę gasnących narzędzi. Silnik ROI (`src/computeScenario.ts`) i
 * raport (`src/report/waves.ts`) czytają odtąd TĘ funkcję; kopia
 * przeglądarkowa jest klasycznym skryptem w HTML-u i nie importuje TS-a, więc
 * zostaje jako jedyne lustro tej reguły - ale już nie jako trzecia definicja.
 *
 * Reguła jest też zapisana jako kontrakt krytyka SCE-1
 * (`src/critic/stageContracts.ts`) i jako zasada 01 w Appendix A raportu.
 */

/**
 * `true`, gdy któraś zdolność trzyma subskrypcję przy życiu.
 *
 * Oddzielone od `toolGoesOff`, bo to są DWA różne pytania i tylko jedno z nich
 * ma sensowną odpowiedź dla narzędzia bez mapowań: "czy coś je trzyma" to
 * `false`, ale "czy gaśnie" to też `false` - nie wiemy o nim nic, więc nie
 * wolno wpisać jego kosztu do oszczędności.
 */
export function toolSubscriptionSurvives(decisions: readonly Decision[]): boolean {
  return decisions.some((decision) => decision === 'integrate' || decision === 'keep')
}

/**
 * Sygnał "poza katalogiem" - DOKŁADNIE ten string, który ustawia
 * `mapCapabilities` w ścieżce awaryjnej (SPEC.md §6.2). Mieszka tutaj, bo
 * czytają go trzy miejsca (`catalogGaps`, `report/counts`, ta funkcja), a
 * trzy kopie literału to trzy okazje, żeby Appendix B, licznik sekcji 02 i
 * tabela ROI podały w jednym dokumencie inną liczbę.
 */
export const OFF_CATALOG_EVIDENCE = 'not in catalog'

/**
 * `true`, gdy narzędzie da się wyłączyć.
 *
 * DWA powody, dla których narzędzie zostaje, i oba sprowadzają się do tego
 * samego zdania: nie wolno wpisać do oszczędności kosztu narzędzia, którego
 * nie rozumiemy.
 *
 * 1. Pusta lista. Narzędzie, którego ani jedna zdolność nie przeszła przez
 *    mapowanie, nie jest "w pełni pokryte" - jest NIEZBADANE.
 *
 * 2. Zdolność POZA KATALOGIEM. `mapCapabilities` oddaje jej `decision:
 *    'build'` (SPEC.md §6.2) - i to `build` znaczy co innego niż zwykłe
 *    `build`. Zwykłe mówi "policzyliśmy, dorobimy to"; awaryjne mówi
 *    "nie mamy o tym wpisu", co widać po `confidence: 'low'`,
 *    `targetFeature: 'TBD — needs discovery'` i właśnie `evidence: 'not in
 *    catalog'`. Liczenie tego pierwszego jako drugiego kazało raportowi
 *    zabankować licencję narzędzia, o którym sam pisał, że go nie rozumie -
 *    zmierzone: Aurora Solar za 400/mies. wchodziła do `removedSaaS` i
 *    dokładała 4800 do `grossAnnualSaving`. Złoty raport mówi o tych
 *    pozycjach dosłownie: "They are excluded from every figure in this
 *    report."
 *
 * Punkt 2 to rozciągnięcie punktu 1, nie nowa reguła: jedno i drugie to
 * niewiedza, tylko na innym poziomie.
 */
export function toolGoesOff(mappings: readonly Pick<MercatoMappingResult, 'decision' | 'evidence'>[]): boolean {
  if (mappings.length === 0) return false
  if (mappings.some((mapping) => mapping.evidence === OFF_CATALOG_EVIDENCE)) return false
  return !toolSubscriptionSurvives(mappings.map((mapping) => mapping.decision))
}
