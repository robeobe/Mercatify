import { count, money } from '../format'
import type { ReportFacts, ReportProse, Wave } from '../model'
import {
  escapeHtml,
  hoursCell,
  hoursWithUnit,
  joinParts,
  sectionHead,
  signedMoney,
} from './shared'

/**
 * Sekcja 06 - fale.
 *
 * Sekcja ZNIKA w całości przy pustej liście fal. Nagłówek "Recommended
 * sequence" nad niczym obiecuje plan, którego nie ma - a przebieg bez
 * Migration Plannera po prostu go nie ma i lepiej, żeby dokument o tym
 * milczał, niż żeby udawał pustą listę.
 */

/** Etykiety wyłączeń pod treścią fali - `Airtable off`, `PandaDoc reduced`. */
function drops(wave: Wave): string {
  const chips = [
    ...wave.toolsOff.map((tool) => `${tool} off`),
    ...wave.toolsReduced.map((tool) => `${tool} reduced`),
  ]
  if (chips.length === 0) return ''
  const spans = chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('')
  return `<div class="drops">${spans}</div>`
}

/**
 * Treść fali. Proza agenta, jeśli jest; w przebiegu `--no-llm` jej nie ma i
 * wtedy fala pokazuje SWÓJ ZAKRES - pary narzędzie/zdolność z werdyktem i
 * godzinami. To jest ta sama informacja, tylko bez zdań, i to jest cały sens
 * degradacji z SPEC.md §8: raport bez agentów ma tracić język, nie treść.
 *
 * Wiersz `build` bez estymaty drukuje się tutaj jako `to estimate`, zgodnie z
 * regułą z `assets/README.md` - i to jest jedyne miejsce dokumentu, w którym
 * ta reguła dotyczy pojedynczej pozycji zakresu, a nie sumy.
 */
function waveBody(wave: Wave, prose: ReportProse): string {
  const note = prose.waveNotes?.find((candidate) => candidate.waveNumber === wave.n)
  if (note !== undefined) return `<p>${escapeHtml(note.body)}</p>`
  if (wave.scope.length === 0) return ''
  const items = wave.scope.map((item) => {
    const hours =
      item.estimatedHours === null
        ? item.decision === 'build'
          ? ` · ${hoursCell(null, true)}`
          : ''
        : ` · ${count(item.estimatedHours)} h`
    return `<span>${escapeHtml(`${item.source} — ${item.capability} · ${item.decision}${hours}`)}</span>`
  })
  return `<div class="drops">${items.join('')}</div>`
}

/** "Weeks 5–12", a dla fali jednotygodniowej "Week 5" - nie "Weeks 1–1". */
function weekSpan(wave: Wave): string {
  if (wave.weekFrom === wave.weekTo) return `Week ${escapeHtml(count(wave.weekFrom))}`
  return `Weeks ${escapeHtml(count(wave.weekFrom))}–${escapeHtml(count(wave.weekTo))}`
}

/**
 * Prawa kolumna fali: ile miesięcznie ta fala odzyskuje i od kiedy.
 *
 * Trzy odpowiedzi, nie dwie. Zero jest tu OSOBNYM przypadkiem, bo "bankuje
 * zero dolarów od miesiąca 2" jest prawdą sformułowaną jak wynik: fala, która
 * nic nie gasi, nic nie bankuje i nie ma żadnej daty, od której zaczyna. Kwota
 * zostaje na swoim miejscu (jest policzona i jest prawdziwa), ale podpis pod
 * nią przestaje obiecywać wpływ, którego nie będzie.
 */
function bankedCell(wave: Wave, currency: string): string[] {
  if (wave.monthlyBanked === null) {
    return ['<b>—</b>', `<span>banked from month ${escapeHtml(count(wave.bankedFromMonth))}</span>`]
  }
  if (wave.monthlyBanked === 0) {
    return [
      `<b>${escapeHtml(money(0, currency))}<span class="sub">/mo</span></b>`,
      '<span>no tool switches off in this wave</span>',
    ]
  }
  return [
    `<b>${escapeHtml(signedMoney(wave.monthlyBanked, currency))}<span class="sub">/mo</span></b>`,
    `<span>banked from month ${escapeHtml(count(wave.bankedFromMonth))}</span>`,
  ]
}

function renderWave(wave: Wave, prose: ReportProse, currency: string): string {
  const when =
    `<b>Wave ${escapeHtml(count(wave.n))}</b>${weekSpan(wave)}` +
    `<br>${escapeHtml(hoursWithUnit(wave.hours, wave.hoursAreFloor))}`
  return joinParts([
    '<div class="wave">',
    `<div class="wave__when">${when}</div>`,
    '<div class="wave__body">',
    `<h3>${escapeHtml(wave.title)}</h3>`,
    waveBody(wave, prose),
    drops(wave),
    '</div>',
    '<div class="wave__save">',
    ...bankedCell(wave, currency),
    '</div>',
    '</div>',
  ])
}

export function renderSequence(facts: ReportFacts, prose: ReportProse): string {
  if (facts.waves.length === 0) return ''
  const note =
    prose.sequenceNote === undefined
      ? ''
      : `<p class="footnote">${escapeHtml(prose.sequenceNote)}</p>`
  return joinParts([
    '<section class="pad band pb">',
    sectionHead('Section 06', 'Recommended sequence', prose.sequenceIntro),
    '<div class="waves">',
    ...facts.waves.map((wave) => renderWave(wave, prose, facts.company.currency)),
    '</div>',
    note,
    '</section>',
  ])
}
