import type { ProseRisk, ReportProse } from '../model'
import { escapeHtml, joinParts, sectionHead } from './shared'

/**
 * Sekcja 08 - ryzyka i założenia.
 *
 * Kolumna `basis` stoi POD samym ryzykiem, drobnym drukiem, i to jest cała
 * jej rola: zdanie "crews may rely on Jobber offline" bez "not confirmed on
 * the call" jest twierdzeniem o kliencie, a z nim - pytaniem do niego.
 *
 * Numer (`8.1`) pochodzi od autora prozy, nie z pozycji na liście, i to jest
 * jedyna taka lista w dokumencie. Powód: `waveNotes`, `nextSteps` i tabela
 * pokrycia ODSYŁAJĄ do tych numerów tekstem ("see risk 8.2"), więc numer jest
 * tu identyfikatorem, a nie porządkiem - przenumerowanie przy zmianie
 * kolejności zerwałoby odsyłacze w innych sekcjach. `assertNoFigures` zna ten
 * wyjątek (`STRUCTURAL_PATHS`).
 */
function renderRisk(risk: ProseRisk): string {
  const basis = risk.basis.length === 0 ? '' : `<span class="sub">${escapeHtml(risk.basis)}</span>`
  return joinParts([
    '<tr>',
    `<td class="num">${escapeHtml(risk.id)}</td>`,
    `<td><b>${escapeHtml(risk.risk)}</b>${basis}</td>`,
    `<td>${escapeHtml(risk.effect)}</td>`,
    `<td>${escapeHtml(risk.handling)}</td>`,
    '</tr>',
  ])
}

export function renderRisks(prose: ReportProse): string {
  const risks = prose.risks ?? []
  if (risks.length === 0) return ''
  return joinParts([
    '<section class="pad band pb">',
    sectionHead('Section 08', 'Risks and assumptions', prose.risksIntro),
    '<div class="tablewrap tablewrap--wide">',
    '<table>',
    '<thead>',
    '<tr><th>#</th><th>Risk or assumption</th><th>Effect if it turns out otherwise</th><th>How we would handle it</th></tr>',
    '</thead>',
    '<tbody>',
    ...risks.map(renderRisk),
    '</tbody>',
    '</table>',
    '</div>',
    '</section>',
  ])
}
