import type { ReportFacts, ReportParty, ReportProse } from '../model'
import { escapeHtml, isoToShortDate, joinParts, optionalParagraph } from './shared'
import { isoToLongDate } from '../format'

/**
 * Okładka i pasek narzędzi.
 *
 * `HEADLINE` jest STAŁĄ, nie polem modelu, i to jest decyzja produktowa:
 * nagłówek nazywa USŁUGĘ, a nie klienta. Gdyby pisał go agent, każdy raport
 * zaczynałby się inaczej i pierwsza linia dokumentu przestałaby być rozpoznawalna;
 * gdyby był polem, ktoś by go w końcu wypełnił nazwą przypadku. Wszystko, co
 * różni jeden raport od drugiego, i tak stoi niżej - w eyebrow, w `<dl class="meta">`
 * i w akapicie `lede`, który JEST prozą.
 */
const HEADLINE = 'What you rent today, and what you could own instead.'

const BRAND = 'Mercatify'
const BRAND_MARK = 'M'

/** Rozdziela `"Open Mercato — self-hosted, source available"` na `<dd>` i jego `<span>`. */
const BASIS_SEPARATOR = ' — '

function partyEntry(label: string, party: ReportParty): string {
  const who = party.person.length === 0 ? '' : `<span>${escapeHtml(joinParty(party))}</span>`
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(party.organization)}${who}</dd></div>`
}

function joinParty(party: ReportParty): string {
  return party.role.length === 0 ? party.person : `${party.person}, ${party.role}`
}

/**
 * Notka pod numerem sprawy. Obie części są warunkowe z różnych powodów:
 * `runMinutes` nie istnieje w przebiegu bez LLM (nie ma czego mierzyć), a
 * status przeglądu istnieje ZAWSZE i musi być widoczny także wtedy, gdy jest
 * negatywny - dokument, który nie mówi, że nikt go nie sprawdził, kłamie
 * przemilczeniem.
 */
function caseNote(runMinutes: number | undefined, humanReviewed: boolean): string {
  const review = humanReviewed ? 'human-reviewed' : 'not human-reviewed'
  if (runMinutes === undefined) return review
  return `Analysis run ${runMinutes} min · ${review}`
}

/**
 * `<dd>` z podtytułem. `meta.basis` przychodzi jako jedno zdanie z myślnikiem
 * i golden łamie je na nazwę platformy oraz jej opis - dzielimy na PIERWSZYM
 * myślniku i nie ruszamy tekstu poza tym. Brak myślnika oznacza, że autor nie
 * przewidział podziału, więc całość idzie do `<dd>` bez `<span>`, zamiast
 * zgadywać, gdzie kończy się nazwa.
 */
function basisEntry(basis: string): string {
  const at = basis.indexOf(BASIS_SEPARATOR)
  if (at < 0) return `<div><dt>Basis</dt><dd>${escapeHtml(basis)}</dd></div>`
  const head = basis.slice(0, at)
  const tail = basis.slice(at + BASIS_SEPARATOR.length)
  const shown = tail.length === 0 ? tail : tail[0].toUpperCase() + tail.slice(1)
  return `<div><dt>Basis</dt><dd>${escapeHtml(head)}<span>${escapeHtml(shown)}</span></dd></div>`
}

/** Pasek narzędzi - jedyne miejsce dokumentu z przyciskami. Nie idzie na papier. */
export function renderToolbar(facts: ReportFacts): string {
  const { meta } = facts
  const note = `${meta.caseId} · v${meta.version} · ${isoToShortDate(meta.issued)}`
  return joinParts([
    '<div class="toolbar">',
    '<div class="toolbar__inner">',
    `<a class="brand" href="#top"><span class="brand__mark">${BRAND_MARK}</span>${BRAND}</a>`,
    `<span class="toolbar__note">${escapeHtml(note)}</span>`,
    '<button class="btn btn--ghost" type="button" id="themeToggle">Toggle theme</button>',
    '<button class="btn btn--primary" type="button" id="printBtn">Print / Save as PDF</button>',
    '</div>',
    '</div>',
  ])
}

export function renderCover(facts: ReportFacts, prose: ReportProse): string {
  const { meta, company } = facts
  const eyebrow = `Stack consolidation report · prepared for ${company.name}`
  return joinParts([
    '<header class="cover pad">',
    `<span class="eyebrow">${escapeHtml(eyebrow)}</span>`,
    `<h1>${escapeHtml(HEADLINE)}</h1>`,
    optionalParagraph(prose.coverLede, 'lede'),
    '<dl class="meta">',
    partyEntry('Prepared for', meta.preparedFor),
    partyEntry('Prepared by', meta.preparedBy),
    `<div><dt>Case</dt><dd class="mono">${escapeHtml(meta.caseId)}` +
      `<span>${escapeHtml(caseNote(meta.runMinutes, meta.humanReviewed))}</span></dd></div>`,
    `<div><dt>Issued</dt><dd>${escapeHtml(isoToLongDate(meta.issued))}` +
      `<span>Version ${escapeHtml(meta.version)}</span></dd></div>`,
    `<div><dt>Valid until</dt><dd>${escapeHtml(isoToLongDate(meta.validUntil))}` +
      '<span>Pricing and effort estimates</span></dd></div>',
    basisEntry(meta.basis),
    '</dl>',
    optionalParagraph(meta.confidentialityNote, 'confidential'),
    '</header>',
  ])
}

/** Stopka dokumentu - ostatni element wewnątrz `.doc`. */
export function renderDocFoot(facts: ReportFacts): string {
  const { meta } = facts
  const left =
    `${BRAND} — SaaS-to-Open-Mercato consolidation · ${meta.caseId} ` +
    `· v${meta.version} · ${isoToShortDate(meta.issued)}`
  const right = `Confidential — prepared for ${meta.preparedFor.organization}`
  return joinParts([
    '<footer class="docfoot">',
    `<span>${escapeHtml(left)}</span>`,
    `<span>${escapeHtml(right)} · <a href="https://www.openmercato.com/">openmercato.com</a></span>`,
    '</footer>',
  ])
}

/**
 * Stopka drukarska - powtarzana przez silnik druku na KAŻDEJ stronie, więc
 * stoi poza `.doc` i poza przepływem dokumentu. Niesie tożsamość sprawy i
 * klauzulę poufności, bo pojedyncza kartka wyjęta z wydruku musi wiedzieć,
 * czyja jest.
 */
export function renderPrintFooter(facts: ReportFacts): string {
  const { meta } = facts
  return joinParts([
    '<div class="print-footer">',
    `<span>${escapeHtml(`${BRAND} · ${meta.caseId} · ${meta.preparedFor.organization}`)}</span>`,
    `<span>${escapeHtml(`Confidential · ${isoToLongDate(meta.issued)} · v${meta.version}`)}</span>`,
    '</div>',
  ])
}
