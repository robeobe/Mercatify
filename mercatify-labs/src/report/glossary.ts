import type { Glossary, GlossaryEntry, GlossaryRule } from './model'

/**
 * Appendix A - definicje werdyktów i trzy zasady metody.
 *
 * To jest STAŁA, nie dane przebiegu: te same zdania stoją w każdym raporcie,
 * bo opisują metodę, a nie klienta. Dlatego siedzą w `facts`, a nie w `prose`
 * - nie pisze ich agent i nie przechodzą przez `assertNoFigures`. Ma to
 * praktyczny skutek widoczny niżej: treść zasady 03 zawiera "87%", czyli
 * dokładnie to, czego `assertNoFigures` zabrania agentom. Zabrania słusznie -
 * ta liczba jest tu PRZYKŁADEM czegoś, czego nie wolno napisać, a nie
 * wynikiem obliczenia. Gdyby słownik był prozą, strażnik odrzuciłby własną
 * regułę repo.
 *
 * Teksty przepisane z `src/__tests__/fixtures/voltix.golden.html`
 * (Appendix A). Wpis `drop` dochodzi z `VERDICTS` w
 * `assets/stack-tool/catalog.js` - złoty raport go nie ma, bo żadna zdolność
 * Voltixa tam nie wypadła.
 */
const VERDICT_ENTRIES: readonly GlossaryEntry[] = Object.freeze([
  {
    verdict: 'native',
    means: 'The platform already does this. Setup only.',
    costsYou: 'Configuration time, no new code',
  },
  {
    verdict: 'configure',
    means: 'The platform does this once settings, business rules or custom fields are in place.',
    costsYou: 'Analyst time, no new code',
  },
  {
    verdict: 'build',
    means: 'New code is required. Always accompanied by an hour estimate.',
    costsYou: 'Developer time, quoted per item',
  },
  {
    verdict: 'integrate',
    means: 'Better left to a specialist tool and wired in through its API.',
    costsYou: 'The retained licence, plus wiring',
  },
  {
    verdict: 'keep',
    means: 'We recommend you do not move it. Out of scope by judgement.',
    costsYou: 'Nothing changes',
  },
  {
    verdict: 'drop',
    means: 'Nobody would miss it. Switch it off without replacing it anywhere.',
    costsYou: 'Nothing to build and nothing to keep paying',
  },
  {
    verdict: 'off-catalog',
    means: 'No curated entry. Reported as unmapped rather than guessed.',
    costsYou: 'One follow-up conversation',
  },
])

const RULES: readonly GlossaryRule[] = Object.freeze([
  {
    id: 'Rule 01',
    title: 'The catalog decides, the model narrates',
    body:
      'Tool-to-platform verdicts come from a curated matrix by lookup, never from live model ' +
      'reasoning on the critical path. Language models write the explanations; they do not cast the votes.',
  },
  {
    id: 'Rule 02',
    title: 'The model never computes money',
    body:
      'It selects the inputs. A pure function returns the figure. Every number in section 05 can be ' +
      'recomputed by hand at the table, which is why the formula is shown next to each line.',
  },
  {
    id: 'Rule 03',
    title: 'Confidence is a band, not a decimal',
    body:
      'High - observed directly in your system or invoices. Medium - inferred from consistent evidence. ' +
      'Low - stated once, unverified. A "87% match" is a claim nobody can defend in a room full of ' +
      'people who know their own business.',
  },
])

export const REPORT_GLOSSARY: Glossary = Object.freeze({ verdicts: VERDICT_ENTRIES, rules: RULES })
