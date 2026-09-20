import { count } from '../format'
import type { ReportFacts, ReportProse } from '../model'
import { countedNoun, escapeHtml, joinParts, sectionHead } from './shared'

/**
 * Sekcja 02 - na czym raport stoi.
 *
 * Trzy karty są STAŁYM kształtem sekcji (wejścia / okres / wyłączenia), bo
 * "co pominęliśmy" jest równie częścią wiarygodności co "co przeczytaliśmy" -
 * karta wyłączeń, która znika przy pustym polu, zamienia świadome pominięcie
 * w przemilczenie. Dlatego pusty tekst drukuje się jako zdanie o braku, a nie
 * jako brak karty.
 */
interface BasisCard {
  tag: string
  title: string
  body: string
  /** Co postawić, gdy klient nie podał treści. */
  fallback: string
}

function renderCard(card: BasisCard): string {
  const body = card.body.trim().length === 0 ? card.fallback : card.body
  return joinParts([
    '<div class="card">',
    `<span class="card__tag">${escapeHtml(card.tag)}</span>`,
    `<h4>${escapeHtml(card.title)}</h4>`,
    `<p>${escapeHtml(body)}</p>`,
    '</div>',
  ])
}

/**
 * Ile par narzędzie-zdolność liczy Figure 1 - czyli suma `coverage.byVerdict`,
 * ta sama, którą sekcja 04 drukuje na osi.
 *
 * Liczymy ją TU JESZCZE RAZ z tego samego pola modelu, zamiast przyjmować
 * gotową: `facts` nie ma pola "suma Figure 1", a dodanie go dałoby drugie
 * miejsce, w którym ta suma może przestać zgadzać się z wykresem. Sumowanie
 * jednej tablicy dwa razy nie może się rozjechać; dwa pola mogą.
 */
function figureOneTotal(facts: ReportFacts): number {
  return Object.values(facts.coverage.byVerdict).reduce((sum, value) => sum + value, 0)
}

/**
 * Przypis z licznikami sekcji 02. Arytmetyka jest gwarantowana wcześniej -
 * `resolveStatementCounts` (`src/report/counts.ts`) odrzuca zestaw, w którym
 * `matched + offCatalog` nie daje `statements` - więc tutaj tylko formatujemy.
 *
 * DRUGIE ZDANIE ISTNIEJE PO TO, ŻEBY CZYTELNIK NIE ZGADYWAŁ.
 *
 * Ta sekcja podaje WYPOWIEDZI Z ROZPOZNANIA (dla Voltixa 38), a Figure 1 dwie
 * strony dalej - PARY NARZĘDZIE-ZDOLNOŚĆ, które silnik ocenił (15). To są dwa
 * różne zbiory i żadna arytmetyka jednego na drugi nie przełoży: rozkładu 38
 * na werdykty nikt nie policzył i nie wolno go dorobić (`coverage.ts` opisuje
 * tę decyzję w całości). Skoro obie liczby stoją w jednym dokumencie, MUSI w
 * nim stać też zdanie, które mówi, czym się różnią - inaczej sąsiednie strony
 * po prostu sobie przeczą.
 *
 * Zdanie drukuje się WYŁĄCZNIE wtedy, gdy jest co tłumaczyć: przy równych
 * liczbach byłoby szumem, a przy pustym `byVerdict` wskazywałoby na figurę,
 * której `renderFigureOne` w ogóle nie wypuścił.
 *
 * Kierunek ("smaller") jest bezpieczny, a nie założony: `resolveStatementCounts`
 * odrzuca zestaw, w którym konsultant podaje MNIEJ wypowiedzi, niż silnik
 * zmapował, więc różne znaczy tu zawsze większe.
 */
function countsNote(facts: ReportFacts): string {
  const { statements, matched, offCatalog } = facts.basis.counts
  // Liczba mnoga jest treścią zdania, nie jego ozdobą: "1 usage statements
  // were extracted" i "1 did not and are carried" czytają się jak sklejka
  // napisów, więc podważają liczbę, którą niosą. Ten sam wzorzec, co
  // `statementsWord` w sekcji 04.
  const note =
    `${countedNoun(statements, 'usage statement')} ${statements === 1 ? 'was' : 'were'} ` +
    `extracted from the above. ${count(matched)} matched a catalog capability; ` +
    `${count(offCatalog)} did not and ${offCatalog === 1 ? 'is' : 'are'} ` +
    'carried openly into Appendix B.'

  const mapped = figureOneTotal(facts)
  if (mapped === 0 || mapped === statements) return note
  return (
    `${note} Figure 1 in section 04 counts a different set — the ${count(mapped)} tool-and-capability ` +
    'pairs our mapping engine scored — because several statements can describe the same pair. ' +
    'That is why its total is the smaller of the two.'
  )
}

export function renderBasis(facts: ReportFacts, prose: ReportProse): string {
  const { basis } = facts
  const cards: BasisCard[] = [
    {
      tag: 'Inputs',
      title: 'What we read',
      body: basis.readWhat,
      fallback: 'The client supplied no description of the material this analysis was based on.',
    },
    {
      tag: 'Period',
      title: 'What it covers',
      body: basis.period,
      fallback: 'No billing period was stated for the costs in this report.',
    },
    {
      tag: 'Exclusions',
      title: 'What we left alone',
      body: basis.exclusions,
      fallback: 'Nothing was declared out of scope.',
    },
  ]
  return joinParts([
    '<section class="pad band pb">',
    sectionHead('Section 02', 'What this analysis is based on', prose.basisIntro),
    '<div class="cards">',
    ...cards.map(renderCard),
    '</div>',
    `<p class="footnote">${escapeHtml(countsNote(facts))}</p>`,
    '</section>',
  ])
}
