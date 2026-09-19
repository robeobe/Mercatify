import type { ReportFacts, ReportProse } from '../model'
import { escapeHtml, joinParts, sectionHead } from './shared'

/**
 * Appendix B - luki katalogowe.
 *
 * Tożsamość luki (`facts.gaps`) i jej wyjaśnienie (`prose.gaps`) są
 * PAROWANE PO `id`, a nie po pozycji na liście. Parowanie po indeksie
 * podmieniłoby wyjaśnienia miejscami przy pierwszym przebiegu, w którym agent
 * odda luki w innej kolejności - a to jest sekcja, której cała wartość polega
 * na tym, że przy każdej luce stoi WŁAŚCIWE zdanie.
 *
 * Luka bez wyjaśnienia renderuje się z kreskami. To jest uczciwsze niż jej
 * pominięcie: sekcja istnieje po to, żeby policzyć rzeczy, których nie
 * zmapowaliśmy, i zniknięcie takiego wiersza rozjechałoby ją z licznikiem
 * `offCatalog` z sekcji 02.
 */
export function renderAppendixB(facts: ReportFacts, prose: ReportProse): string {
  if (facts.gaps.length === 0) return ''
  const byId = new Map((prose.gaps ?? []).map((gap) => [gap.gapId, gap]))
  const rows = facts.gaps.map((gap) => {
    const explained = byId.get(gap.id)
    const source = gap.source.length === 0 ? '' : `<span class="sub">${escapeHtml(gap.source)}</span>`
    const described = gap.described.length === 0 ? gap.capability : gap.described
    return joinParts([
      '<tr>',
      `<td class="num">${escapeHtml(gap.id)}</td>`,
      `<td><b>${escapeHtml(described)}</b>${source}</td>`,
      `<td>${escapeHtml(explained?.whyUnmapped ?? '—')}</td>`,
      `<td>${escapeHtml(explained?.ourRead ?? '—')}</td>`,
      '</tr>',
    ])
  })
  return joinParts([
    '<section class="pad band pb">',
    sectionHead('Appendix B', 'Off-catalog items', prose.appendixBIntro),
    '<div class="tablewrap tablewrap--wide">',
    '<table>',
    '<thead><tr><th>#</th><th>What you described</th><th>Why it is unmapped</th><th>Our read</th></tr></thead>',
    '<tbody>',
    ...rows,
    '</tbody>',
    '</table>',
    '</div>',
    '</section>',
  ])
}
