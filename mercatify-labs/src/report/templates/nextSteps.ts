import type { ReportFacts, ReportParty, ReportProse } from '../model'
import { escapeHtml, joinParts, sectionHead } from './shared'

/**
 * Sekcja 09 - lista do odhaczenia i miejsce na podpisy.
 *
 * Każdy krok ma WŁAŚCICIELA i TERMIN w jednej linii pod spodem, bo lista
 * kroków bez nazwiska przy każdym jest listą życzeń. Puste pole właściciela
 * nie ukrywa kroku - drukuje się bez linii `who`, żeby brak było widać przy
 * czytaniu, a nie dopiero przy egzekwowaniu.
 *
 * Blok podpisów renderuje się ZAWSZE, także w przebiegu bez prozy: to jest
 * miejsce na dwa nazwiska z `meta`, a nie treść, którą pisze agent.
 */
/**
 * Linia podpisu. Puste pola NIE mają zostawiać po sobie interpunkcji.
 *
 * Wcześniej ta funkcja skladala string bezwarunkowo, więc brak osoby dawał w
 * dokumencie u klienta `, Voltix Energy` - osierocony przecinek zamiast
 * nazwiska. Osoba kontaktowa jest zbierana na intake'u, ale `send()` w
 * `assets/client/intake.html` ją gubi przy spłaszczaniu zgłoszenia, więc ta
 * ścieżka trafia tu z pustym `person` za każdym razem.
 *
 * Składamy z niepustych części i łączymy przecinkiem; gdy nie ma żadnej,
 * oddajemy pusty string i wywołujący pomija całą linię.
 */
function signatory(party: ReportParty): string {
  const role = party.role.length === 0 ? '' : ` — ${party.role}`
  const who = party.person.length === 0 ? '' : `${party.person}${role}`
  return [who, party.organization].filter((part) => part.length > 0).join(', ')
}

export function renderNextSteps(facts: ReportFacts, prose: ReportProse): string {
  const steps = prose.nextSteps ?? []
  const list =
    steps.length === 0
      ? ''
      : joinParts([
          '<ul class="checklist">',
          ...steps.map((step) => {
            const who = [step.owner, step.when].filter((part) => part.length > 0).join(' · ')
            const line = who.length === 0 ? '' : `<span class="who">${escapeHtml(who)}</span>`
            return `<li><span class="box"></span><div><b>${escapeHtml(step.action)}</b>${line}</div></li>`
          }),
          '</ul>',
        ])
  return joinParts([
    '<section class="pad band pb">',
    sectionHead('Section 09', 'What happens next', prose.nextStepsIntro),
    list,
    '<div class="sign">',
    '<div>',
    '<div class="sign__line"></div>',
    `<p class="sign__who">${escapeHtml(signatory(facts.meta.preparedFor))}</p>`,
    '</div>',
    '<div>',
    '<div class="sign__line"></div>',
    `<p class="sign__who">${escapeHtml(signatory(facts.meta.preparedBy))}</p>`,
    '</div>',
    '</div>',
    '</section>',
  ])
}
