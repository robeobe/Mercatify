import { count, money, NOT_GIVEN } from '../format'
import type { ReportFacts, ReportProse, StackRow } from '../model'
import { countedNoun, escapeHtml, isoToShortDate, joinParts, sectionHead } from './shared'

/**
 * Sekcja 03 - stos, za który klient płaci dzisiaj.
 *
 * Kolumna "Term ends" niesie DWIE informacje na raz i kolejność ma znaczenie:
 * data mówi, KIEDY da się coś wyłączyć, a `termType` mówi, czy w ogóle jest
 * czego pilnować. Taryfa miesięczna bez daty to nie brak danych, tylko inna
 * odpowiedź ("Monthly"), i dlatego nie drukuje się jako kreska - kreska w tej
 * kolumnie znaczyłaby "nie wiemy", a wiemy.
 */
function termCell(row: StackRow): string {
  if (row.termType === 'monthly') return '<td>Monthly</td>'
  if (row.termEnds.length === 0) return '<td>Annual<span class="sub">End date not given</span></td>'
  return `<td>${escapeHtml(isoToShortDate(row.termEnds))}<span class="sub">Annual, locked</span></td>`
}

function renderRow(row: StackRow, currency: string): string {
  const plan = row.plan.length === 0 ? '' : `<span class="sub">${escapeHtml(row.plan)}</span>`
  return joinParts([
    '<tr>',
    `<td class="tool">${escapeHtml(row.tool)}${plan}</td>`,
    `<td>${escapeHtml(row.category)}</td>`,
    `<td class="num">${escapeHtml(count(row.seats))}</td>`,
    `<td class="num">${escapeHtml(money(row.unitPrice, currency))}</td>`,
    `<td class="num">${escapeHtml(money(row.monthly, currency))}</td>`,
    `<td class="num">${escapeHtml(money(row.annual, currency))}</td>`,
    termCell(row),
    '</tr>',
  ])
}

export function renderStackTable(facts: ReportFacts, prose: ReportProse): string {
  const { stack, company } = facts
  const currency = company.currency
  const total = joinParts([
    '<tfoot>',
    '<tr>',
    `<td colspan="2">Total across ${escapeHtml(countedNoun(stack.rows.length, 'tool'))}</td>`,
    `<td class="num">${escapeHtml(count(stack.totalSeats))}</td>`,
    `<td class="num">${NOT_GIVEN}</td>`,
    `<td class="num">${escapeHtml(money(stack.totalMonthly, currency))}</td>`,
    `<td class="num">${escapeHtml(money(stack.totalAnnual, currency))}</td>`,
    `<td>${NOT_GIVEN}</td>`,
    '</tr>',
    '</tfoot>',
  ])
  const note =
    stack.seatDuplicationNote.length === 0
      ? ''
      : `<p class="footnote">${escapeHtml(stack.seatDuplicationNote)}</p>`
  return joinParts([
    '<section class="pad band pb">',
    sectionHead('Section 03', 'Your stack today', prose.stackIntro),
    '<div class="tablewrap tablewrap--wide">',
    '<table>',
    '<thead>',
    '<tr>',
    '<th>Tool</th>',
    '<th>Category</th>',
    '<th class="num">Seats</th>',
    '<th class="num">Unit</th>',
    '<th class="num">Monthly</th>',
    '<th class="num">Annual</th>',
    '<th>Term ends</th>',
    '</tr>',
    '</thead>',
    '<tbody>',
    ...stack.rows.map((row) => renderRow(row, currency)),
    '</tbody>',
    total,
    '</table>',
    '</div>',
    note,
    '</section>',
  ])
}
