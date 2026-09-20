import { money as fmtMoney, NOT_GIVEN } from '../format'
import type { ImplementationLine, MoneyLine, ReportFacts, ReportProse } from '../model'
import {
  escapeHtml,
  floorMoney,
  hoursCell,
  joinParts,
  lineMoney,
  monthsValue,
  sectionHead,
} from './shared'

/**
 * Zdanie sekcji 05 dla przebiegu bez ani jednej faktury (scenariusz S2 planu).
 *
 * Wzorowane na sekcji 02, która tę robotę robi dobrze od początku: karta bez
 * treści drukuje ZDANIE O BRAKU ("The client supplied no description of the
 * material this analysis was based on."), a nie pustą kartę. Tutaj brakowało
 * odpowiednika i tabela kosztów bieżących wychodziła jako kolumna kresek -
 * albo, przed poprawką B2, jako kolumna zer.
 *
 * Druga połowa zdania jest obietnicą, którą formularz przyjęcia składa
 * klientowi dosłownie (`assets/client/intake.html`): *"without them we can
 * only tell you what moves, not what it saves"*. Dokument ma ją dotrzymać, a
 * nie zaprzeczyć jej kwotą.
 */
const NO_COSTS_NOTE =
  'No licence costs were supplied for this stack. This report can tell you what moves, ' +
  'not what it saves: every verdict, every wave and every hour above still holds, but the ' +
  'saving and the payback need invoices.'

/**
 * Zdanie sekcji 05 dla przebiegu, w którym nie ma ani jednego wiersza `build`
 * (scenariusz S7 planu).
 *
 * "Nic do zbudowania" to nie to samo co "nic do zrobienia" - konfiguracja
 * nadal jest pracą, nadal ma swoje fale i nadal gasi narzędzia. Bez tego
 * zdania tabela jednorazowa mówi to samym milczeniem, a milczenie w tabeli
 * kosztów czyta się jak pominięcie.
 */
const ALL_CONFIGURATION_NOTE =
  'Nothing in this stack needs new code. Every hour above is configuration and migration ' +
  'of what you already have.'

/**
 * Sekcja 05, część pierwsza - dwie tabele: koszty bieżące i jednorazowe.
 *
 * `MoneyLine.basis` jest drukowany OBOK każdej kwoty i to nie jest ozdoba:
 * zasada 02 z Appendixu A ("every number can be recomputed by hand at the
 * table") jest spełniona tylko wtedy, gdy przy liczbie stoi jej wzór. Wiersz
 * bez `basis` przeszedłby przez typ, więc kolumna zostaje nawet pusta - żeby
 * brak było widać.
 */
function renderRecurringLine(line: MoneyLine, currency: string): string {
  return joinParts([
    '<tr>',
    `<td>${escapeHtml(line.label)}</td>`,
    `<td>${escapeHtml(line.basis)}</td>`,
    `<td class="num">${escapeHtml(lineMoney(line.monthly, line.isDeduction, currency))}</td>`,
    `<td class="num">${escapeHtml(lineMoney(line.annual, line.isDeduction, currency))}</td>`,
    '</tr>',
  ])
}

/**
 * Wiersz jednorazowy. Godziny i koszt idą przez `hoursCell`/`floorMoney`, bo
 * reguła z `assets/README.md` jest tu jedyną obroną przed najgorszym możliwym
 * wyjściem: fala bez estymaty wydrukowana jako `0 h` i `—` czyta się jako
 * "darmowa", a nie jako "niewyceniona".
 */
function renderImplementationLine(line: ImplementationLine, currency: string): string {
  return joinParts([
    '<tr>',
    `<td>${escapeHtml(line.label)}</td>`,
    `<td>${escapeHtml(line.scope)}</td>`,
    `<td class="num">${escapeHtml(hoursCell(line.hours, line.hoursAreFloor))}</td>`,
    `<td class="num">${escapeHtml(floorMoney(line.cost, line.hoursAreFloor, currency))}</td>`,
    '</tr>',
  ])
}

/**
 * S2: brief, w którym nie znamy ceny ANI JEDNEGO narzędzia.
 *
 * Pytamy STOS, nie tabelę kosztów: hosting i stawka pochodzą od konsultanta i
 * bywają znane przy zupełnie nieznanych licencjach - wtedy tabela ma jedną
 * prawdziwą kwotę, a mimo to nie wie, co klient płaci dzisiaj. Warunek
 * postawiony na tabeli przemilczałby dokładnie ten przypadek, czyli ten, w
 * którym dokument wychodzi najbardziej mylący: kolumna kresek i jedna kwota
 * kosztu pod spodem.
 *
 * Zdanie STOI OBOK tabeli, a nie zamiast niej. Linia hostingu jest realną
 * informacją i schowanie jej byłoby drugim brakiem w miejscu pierwszego.
 */
function noCostsNote(facts: ReportFacts): string {
  const rows = facts.stack.rows
  if (rows.length === 0 || rows.some((row) => row.monthly !== null)) return ''
  return `<p class="footnote">${escapeHtml(NO_COSTS_NOTE)}</p>`
}

function renderRecurringTable(facts: ReportFacts): string {
  const currency = facts.company.currency
  const total = facts.money.recurringTotal
  const tfoot =
    total === undefined
      ? ''
      : joinParts([
          '<tfoot>',
          '<tr>',
          `<td>${escapeHtml(total.label)}</td>`,
          `<td>${escapeHtml(total.basis)}</td>`,
          `<td class="num">${escapeHtml(lineMoney(total.monthly, total.isDeduction, currency))}</td>`,
          `<td class="num">${escapeHtml(lineMoney(total.annual, total.isDeduction, currency))}</td>`,
          '</tr>',
          '</tfoot>',
        ])
  return joinParts([
    '<div class="tablewrap">',
    '<table>',
    '<thead>',
    '<tr><th>Line</th><th>Basis</th><th class="num">Monthly</th><th class="num">Annual</th></tr>',
    '</thead>',
    '<tbody>',
    ...facts.money.recurring.map((line) => renderRecurringLine(line, currency)),
    '</tbody>',
    tfoot,
    '</table>',
    '</div>',
  ])
}

/**
 * Podstawa sumy godzin. Stawka bywa nieznana (konsultant jej nie podał) i
 * wtedy zdanie mówi to wprost, zamiast pokazywać `—/h` - kreska przy stawce
 * czyta się jak "za darmo". Gdy suma jest dolną granicą, dopisujemy to w tym
 * samym miejscu, bo tu czytelnik szuka warunków wyceny.
 */
function implementationBasis(facts: ReportFacts): string {
  const { rate } = facts.money
  const rateText =
    rate === null
      ? 'No blended rate was supplied'
      : `Blended rate ${fmtMoney(rate, facts.company.currency)}/h`
  return facts.money.totalHoursAreFloor
    ? `${rateText} · a floor, not a quote`
    : rateText
}

/**
 * S7: przebieg, w którym żadna fala nie niesie wiersza `build`.
 *
 * Brama wymaga, żeby fale ISTNIAŁY - pusta lista fal nie znaczy "nie ma czego
 * budować", tylko "nikt nie liczył sekwencji" (tak wygląda każdy model z
 * przeglądarkowego adaptera). To ta sama ostrożność co przy S8 w `kpis.ts`.
 */
function everythingIsConfiguration(facts: ReportFacts): boolean {
  return (
    facts.waves.length > 0 &&
    facts.waves.every((wave) => wave.scope.every((item) => item.decision !== 'build'))
  )
}

function renderImplementationTable(facts: ReportFacts): string {
  const currency = facts.company.currency
  const { money: table } = facts
  const allConfiguration = everythingIsConfiguration(facts)
    ? `<p class="footnote">${escapeHtml(ALL_CONFIGURATION_NOTE)}</p>`
    : ''
  return joinParts([
    '<div class="tablewrap">',
    '<table>',
    '<thead>',
    '<tr><th>One-off implementation</th><th>Scope</th><th class="num">Hours</th><th class="num">Cost</th></tr>',
    '</thead>',
    '<tbody>',
    ...table.implementation.map((line) => renderImplementationLine(line, currency)),
    '</tbody>',
    '<tfoot>',
    '<tr>',
    '<td>Total</td>',
    `<td>${escapeHtml(implementationBasis(facts))}</td>`,
    `<td class="num">${escapeHtml(hoursCell(table.totalHours, table.totalHoursAreFloor))}</td>`,
    `<td class="num">${escapeHtml(floorMoney(table.totalImplementationCost, table.totalHoursAreFloor, currency))}</td>`,
    '</tr>',
    '</tfoot>',
    '</table>',
    '</div>',
    allConfiguration,
  ])
}

export function renderMoney(facts: ReportFacts, prose: ReportProse): string {
  return joinParts([
    sectionHead('Section 05', 'What it costs and what it returns', prose.moneyIntro),
    noCostsNote(facts),
    renderRecurringTable(facts),
    renderImplementationTable(facts),
  ])
}

/**
 * Callout "Two payback numbers, and why they differ".
 *
 * Obie liczby są WSTRZYKIWANE przez renderer, a agent pisze tylko zdanie
 * wokół nich. To jest ta sama decyzja co sloty (`src/report/slots.ts`),
 * postawiona o piętro wyżej: gdyby ten akapit niósł liczby w tekście, byłby
 * jedynym miejscem raportu, w którym zwrot ma dwie niezależne wersje - a
 * SPEC.md §10 opisuje dokładnie tę awarię.
 *
 * Nie renderuje się bez którejkolwiek z liczb: "dwie liczby zwrotu" z jedną
 * liczbą to nie skrócona wersja akapitu, tylko inne twierdzenie.
 */
export function renderPaybackCallout(facts: ReportFacts, prose: ReportProse): string {
  const { paybacks } = facts.money
  if (paybacks.buildOnlyMonths === null || paybacks.programmeMonths === null) return ''
  if (prose.paybackNote === undefined) return ''
  const buildCost =
    paybacks.buildOnlyCost === null
      ? NOT_GIVEN
      : fmtMoney(paybacks.buildOnlyCost, facts.company.currency)
  // "repaid in 1 months" podważa liczbę, obok której stoi. Liczba mnoga idzie
  // za WARTOŚCIĄ, nie za jej zapisem: `monthsValue` drukuje 1 i 1.0 tak samo.
  const buildOnlyUnit = paybacks.buildOnlyMonths === 1 ? 'month' : 'months'
  const figures =
    `The net-new build (${escapeHtml(buildCost)}) is repaid by the total saving in ` +
    `<b>${escapeHtml(monthsValue(paybacks.buildOnlyMonths))} ${buildOnlyUnit}</b>. ` +
    `The full programme breaks even in ` +
    `<b>month ${escapeHtml(monthsValue(paybacks.programmeMonths))}</b>.`
  return joinParts([
    '<div class="callout callout--plain">',
    '<h4>Two payback numbers, and why they differ</h4>',
    `<p>${figures} ${escapeHtml(prose.paybackNote)}</p>`,
    '</div>',
  ])
}
