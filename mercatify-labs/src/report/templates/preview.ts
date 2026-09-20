import type { ReportFacts, ReportProse } from '../model'
import { escapeHtml, joinParts, sectionHead } from './shared'
import { renderNumberedList } from './execSummary'

/**
 * Sekcja 07 - podgląd.
 *
 * Bramą jest `facts.preview`, nie proza: podgląd albo POWSTAŁ, albo nie, a o
 * czymś, czego nie ma, nie piszemy zdań. Przebieg `--no-preview` pomija tę
 * sekcję w całości.
 *
 * Werdykt `blocked` jest POPRAWNYM wynikiem QA, nie awarią - i właśnie
 * dlatego ma własny blok w dokumencie. Podgląd, który urywa się na trzecim
 * kroku golden path, i raport, który o tym milczy, to razem dokładnie ta
 * "sales trick", którą sekcja 07 goldena nazywa po imieniu.
 */
export function renderPreview(facts: ReportFacts, prose: ReportProse): string {
  const { preview } = facts
  if (preview === undefined) return ''

  const blocked =
    preview.verdict === 'blocked'
      ? joinParts([
          '<div class="callout callout--plain">',
          '<h4>Where the preview stops</h4>',
          `<p>${escapeHtml(
            preview.blockedAtStep.length === 0
              ? 'QA could not walk the golden path end to end in this build.'
              : `QA could not get past this step: ${preview.blockedAtStep}`,
          )}</p>`,
          '</div>',
        ])
      : ''

  // Lista ekranów jest PRZYPISEM, nie treścią: podgląd jedzie jako załącznik,
  // a raport ma powiedzieć, co w nim jest, nie zastąpić go spisem plików.
  const screens =
    preview.screens.length === 0
      ? ''
      : `<p class="footnote">${escapeHtml(
          `Screens in the attached preview: ${preview.screens.map((screen) => screen.name).join(', ')}.`,
        )}</p>`

  return joinParts([
    '<section class="pad band pb">',
    sectionHead('Section 07', 'Your preview', prose.previewIntro),
    renderNumberedList(7, prose.previewNotes ?? []),
    blocked,
    screens,
    '</section>',
  ])
}
