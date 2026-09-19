import type { ReportFacts, ReportProse } from '../model'
import { escapeHtml, joinParts, sectionHead, verdictChip } from './shared'

/**
 * Appendix A - słownik werdyktów i trzy zasady metody.
 *
 * Wszystko tutaj pochodzi z `facts.glossary`, czyli ze STAŁEJ
 * (`src/report/glossary.ts`), a nie od agenta. Dzięki temu ta sekcja
 * renderuje się IDENTYCZNIE w przebiegu z modelem i bez niego - i to jest
 * właściwe: czytelnik ma móc sprawdzić, jak stawiamy werdykty, niezależnie od
 * tego, czy tym razem ktoś napisał do raportu choć jedno zdanie.
 *
 * Przypis zamykający jest stałą renderera, nie prozą: mówi o Mercatify, nie o
 * kliencie, i jest ten sam w każdym dokumencie. Pole modelu tylko dałoby
 * agentowi okazję, żeby napisał to inaczej.
 */
const METHOD_NOTE =
  'Every case, artifact and figure in this report is a record in an Open Mercato instance ' +
  '— the same platform this report recommends. Mercatify runs its own business on it.'

export function renderAppendixA(facts: ReportFacts, prose: ReportProse): string {
  const { glossary } = facts
  const verdicts = glossary.verdicts.map((entry) =>
    joinParts([
      '<tr>',
      `<td>${verdictChip(entry.verdict)}</td>`,
      `<td>${escapeHtml(entry.means)}</td>`,
      `<td>${escapeHtml(entry.costsYou)}</td>`,
      '</tr>',
    ]),
  )
  const rules = glossary.rules.map((rule) =>
    joinParts([
      '<div class="card">',
      `<span class="card__tag">${escapeHtml(rule.id)}</span>`,
      `<h4>${escapeHtml(rule.title)}</h4>`,
      `<p>${escapeHtml(rule.body)}</p>`,
      '</div>',
    ]),
  )
  return joinParts([
    '<section class="pad band pb">',
    sectionHead('Appendix A', 'How we reach a verdict', prose.appendixAIntro),
    '<div class="tablewrap">',
    '<table>',
    '<thead><tr><th>Verdict</th><th>Means</th><th>What it costs you</th></tr></thead>',
    '<tbody>',
    ...verdicts,
    '</tbody>',
    '</table>',
    '</div>',
    '<div class="cards">',
    ...rules,
    '</div>',
    `<p class="footnote">${escapeHtml(METHOD_NOTE)}</p>`,
    '</section>',
  ])
}
