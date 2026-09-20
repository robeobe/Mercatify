import type { ProseFinding, ReportProse } from '../model'
import { escapeHtml, joinParts, sectionHead } from './shared'

/**
 * Sekcja 01 - ustalenia i akapit "What this report is not".
 *
 * Numeracja (1.1, 1.2, ...) jest WYPROWADZANA z pozycji na liście, a nie
 * przechowywana w modelu. Gdyby numer pisał agent, dwa ustalenia mogłyby
 * dostać ten sam numer albo numer niezgodny z kolejnością - a `prose.risks`
 * i `nextSteps` odsyłają do tych numerów tekstem ("see risk 8.2"), więc
 * pomyłka byłaby cicha i wyszłaby dopiero u czytelnika.
 *
 * Cała sekcja ZNIKA, gdy nie ma ani ustaleń, ani akapitu zamykającego: sekcja
 * 01 bez zdań to nagłówek nad pustką, a przebieg `--no-llm` (SPEC.md §8) ma
 * oddać dokument z tabelami, nie szkielet.
 */
export function renderNumberedList(sectionNumber: number, items: readonly ProseFinding[]): string {
  if (items.length === 0) return ''
  const rows = items.map((item, index) =>
    joinParts([
      '<li>',
      `<span class="n">${sectionNumber}.${index + 1}</span>`,
      '<div>',
      `<h3>${escapeHtml(item.heading)}</h3>`,
      `<p>${escapeHtml(item.body)}</p>`,
      '</div>',
      '</li>',
    ]),
  )
  return joinParts(['<ul class="rule-list">', ...rows, '</ul>'])
}

export function renderExecSummary(prose: ReportProse): string {
  const findings = prose.findings ?? []
  if (findings.length === 0 && prose.disclaimer === undefined) return ''
  const disclaimer =
    prose.disclaimer === undefined
      ? ''
      : joinParts([
          '<div class="callout callout--plain">',
          '<h4>What this report is not</h4>',
          `<p>${escapeHtml(prose.disclaimer)}</p>`,
          '</div>',
        ])
  return joinParts([
    '<section class="pad band pb">',
    sectionHead('Section 01', 'Executive summary'),
    renderNumberedList(1, findings),
    disclaimer,
    '</section>',
  ])
}
