/** @jest-environment node */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderReport } from '../report/renderReport'
import { writeReport } from '../report/writeReport'
import type { CashSeries, MoneyLine, PreviewFacts, ReportModel, ReportProse } from '../report/model'

/**
 * Renderer raportu kontra golden master.
 *
 * Porównanie jest PER SEKCJA i po TEKŚCIE WIDOCZNYM, nie bajt w bajt. Powody,
 * po kolei:
 *
 *  - Golden jest pisany ręcznie i łamie akapity w źródle; my składamy je w
 *    jedną linię. To różnica składu, nie treści, więc normalizator zwija białe
 *    znaki wewnątrz bloku.
 *  - Obie figury GENERUJEMY z liczb (tego wymaga zadanie), więc ich
 *    współrzędne nie mają prawa być kopią współrzędnych goldena. Porównywanie
 *    ich znak w znak sprawdzałoby, czy odtworzyliśmy cudzy rysunek, a nie czy
 *    narysowaliśmy własne dane - dlatego normalizator wycina `<svg>`, a
 *    figury mają własne testy niżej (proporcje, skala, `<title>`, `<desc>`).
 *  - Reszta MUSI się zgadzać. Różnica spoza `KNOWN_DEVIATIONS` to czerwony
 *    test, i to w obie strony: znikająca różnica też jest błędem, bo znaczy,
 *    że lista skłamała.
 */

const FIXTURES = join(__dirname, 'fixtures')

/**
 * Jedyne miejsce z `as` w tym pliku i jedyne w całej ścieżce renderera.
 * Fixture jest JSON-em, więc TypeScript widzi `verdict: string`, a nie unię -
 * konwencja repo (`slots.test.ts`) rozwiązuje to tak samo, jednym rzutowaniem
 * na granicy pliku testowego. Kod produkcyjny nie ma ani jednego.
 */
const baseModel = JSON.parse(
  readFileSync(join(FIXTURES, 'voltix.reportmodel.json'), 'utf8'),
) as ReportModel

const goldenHtml = readFileSync(join(FIXTURES, 'voltix.golden.html'), 'utf8')

// --- Uzupełnienie fixture'a -------------------------------------------------

/**
 * `voltix.reportmodel.json` powstał ZANIM model dostał pola opisane niżej i
 * jest celowo nietykany (patrz `fixtures/README.md`). Te wartości są
 * przepisane z goldena tak samo, jak przepisana jest reszta fixture'a - bez
 * nich renderer nie ma z czego zbudować akapitów wstępnych, wiersza sumy
 * kosztów bieżących i sekcji 07, więc porównanie mówiłoby "brakuje treści"
 * tam, gdzie prawdziwym problemem jest brak POLA.
 *
 * Każde pole jest opcjonalne, więc przebieg bez tego uzupełnienia nadal daje
 * poprawny dokument - i to sprawdzają testy degradacji niżej.
 */
const GOLDEN_PROSE: ReportProse = Object.freeze({
  coverLede:
    'We read the seven tools Voltix pays for each month, established what each one is actually ' +
    'used for, and matched that against the Open Mercato platform. This report states — per ' +
    'capability, with evidence — what is already native, what needs configuration, what has to ' +
    'be built, what stays where it is, and what the difference is worth.',
  stackIntro:
    'Costs as invoiced in August 2026. Renewal dates matter: they decide what can be cut in which ' +
    'month, and they are the reason the sequence in section 06 looks the way it does.',
  coverageIntro:
    'We do not compare products. Each tool is described as coverage over a canonical capability ' +
    'vocabulary, Open Mercato is described in the same vocabulary, and the comparison becomes ' +
    'arithmetic on sets. Verdict definitions are in Appendix A.',
  figure1Sub:
    'One segment per verdict. Off-catalog means we have no curated entry for it and refuse to ' +
    'guess; those four are itemised in Appendix B.',
  coverageNote:
    'PandaDoc appears twice because it does two unrelated jobs at two different verdicts. Splitting ' +
    'a tool by capability rather than by invoice line is the whole point of the method.',
  moneyIntro:
    'Every figure below is computed from the invoices in section 03 by a fixed formula, not ' +
    'estimated in prose. You can recompute any of them at this table.',
  figure2Sub:
    "Implementation is spent as it is worked; each wave's saving starts the month after that " +
    'wave completes. Hosting begins in month 1. The line is your bank balance relative to doing ' +
    'nothing.',
  figure2Cap:
    'Read together with the milestone table below, which carries the same series as numbers.',
  paybackNote:
    'The first number is the one that answers "is building this worth it"; the second is the one ' +
    'that belongs in your budget.',
  sequenceIntro:
    'Four waves, ordered by risk rather than by saving. Each one ends with a tool switched off and ' +
    'a saving banked. You can stop after any wave; nothing later depends on work you have not ' +
    'approved.',
  sequenceNote:
    'Full run rate from month 7: $2,043/mo of licences cancelled, $1,863/mo net of hosting.',
  previewIntro:
    'Attached to this report is a clickable preview of one Voltix process end to end: lead to ' +
    'quote to scheduled installation. It is not a mockup drawn in a design tool.',
  previewNotes: [
    {
      heading: 'Generated from the real system',
      body:
        'The screens come from actual Open Mercato entity definitions and the admin design ' +
        'system, so the preview cannot promise a field the platform does not have. What you click ' +
        'is what exists on day one of wave 1.',
    },
    {
      heading: 'Filled with your own data',
      body:
        'Seeded with Voltix product names, two warehouses, and three anonymised deals from the ' +
        'HubSpot export you shared. Nothing in it says "Acme Corp".',
    },
    {
      heading: 'Honest about what is not built',
      body:
        'The quote builder step is marked build in the preview itself. A prototype that hides its ' +
        'own gaps is a sales trick, and it surfaces in week three anyway.',
    },
  ],
  risksIntro:
    'These are the things that would change the numbers above. We would rather state them now ' +
    'than discover them in week three.',
  nextStepsIntro:
    'Nothing in this report commits you to the full programme. The only decision in front of you ' +
    'is whether wave 1 is worth four weeks.',
  appendixAIntro:
    'So that you can argue with any row in section 04 on its merits rather than on ours.',
  appendixBIntro:
    'Four of the 38 usage statements we extracted have no entry in our capability catalog. They ' +
    'are excluded from every figure in this report. They are listed because the gaps in our ' +
    'knowledge are part of the deliverable.',
})

const GOLDEN_RECURRING_TOTAL: MoneyLine = Object.freeze({
  label: 'Net recurring saving',
  basis: 'Steady state, from month 7 onward',
  monthly: 1863,
  annual: 22356,
  isDeduction: false,
})

/**
 * Golden nie wypisuje ekranów podglądu - mówi tylko, że podgląd jest w
 * załączniku. Pusta lista jest tu tą samą konwencją, co w reszcie fixture'a:
 * czego raport nie podaje, to zostaje puste, a nie zgadnięte.
 */
const GOLDEN_PREVIEW: PreviewFacts = Object.freeze({
  screens: [],
  generatedAt: '2026-09-19T09:00:00.000Z',
  verdict: 'ready',
  blockedAtStep: '',
})

/** Figure 2 goldena kończy się na miesiącu 24, choć seria biegnie do 36. */
const GOLDEN_FIGURE_MONTHS = 24

function goldenModel(): ReportModel {
  const cash: CashSeries = { ...requireCash(), figureMonths: GOLDEN_FIGURE_MONTHS }
  return {
    facts: {
      ...baseModel.facts,
      money: { ...baseModel.facts.money, recurringTotal: GOLDEN_RECURRING_TOTAL },
      cash,
      preview: GOLDEN_PREVIEW,
    },
    prose: { ...baseModel.prose, ...GOLDEN_PROSE },
  }
}

function requireCash(): CashSeries {
  const cash = baseModel.facts.cash
  if (cash === undefined) throw new Error('fixture lost its cash series')
  return cash
}

// --- Normalizacja -----------------------------------------------------------

const SECTION_MARKER = /<!-- ={6,} (.+?) ={6,} -->/g
const BLOCK_TAGS =
  'p|div|h1|h2|h3|h4|li|tr|td|th|dt|dd|figcaption|section|footer|header|table|thead|tbody|tfoot|ul|ol|dl|figure'
const INLINE_TAGS = 'span|b|i|small|a|button|br|strong|em'
/**
 * Separator bloków. U+0001, nie `\n`: w źródle goldena nowa linia stoi w
 * ŚRODKU akapitu i gdyby dzieliła, każdy akapit rozpadłby się na tyle
 * "różnic", ile miał wierszy.
 */
const BLOCK_SEPARATOR = ''
const ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
})

function splitSections(html: string): Map<string, string> {
  const out = new Map<string, string>()
  const names: string[] = []
  const bounds: Array<[number, number]> = []
  SECTION_MARKER.lastIndex = 0
  let match = SECTION_MARKER.exec(html)
  while (match !== null) {
    names.push(match[1])
    bounds.push([match.index, match.index + match[0].length])
    match = SECTION_MARKER.exec(html)
  }
  names.forEach((name, index) => {
    const from = bounds[index][1]
    const to = index + 1 < bounds.length ? bounds[index + 1][0] : html.length
    out.set(name, html.slice(from, to))
  })
  return out
}

/** Widoczny tekst sekcji, blok po bloku. `<svg>` wypada - patrz nagłówek pliku. */
function visibleBlocks(chunk: string): string[] {
  return chunk
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), BLOCK_SEPARATOR)
    .replace(new RegExp(`</?(?:${INLINE_TAGS})\\b[^>]*>`, 'gi'), ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .split(BLOCK_SEPARATOR)
    .map((part) => part.replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim())
    .filter((part) => part.length > 0)
}

/** Różnica MNOGOŚCIOWA - powtórzony blok liczy się tyle razy, ile wystąpił. */
function without(source: readonly string[], remove: readonly string[]): string[] {
  const pool = [...remove]
  const rest: string[] = []
  for (const item of source) {
    const at = pool.indexOf(item)
    if (at >= 0) pool.splice(at, 1)
    else rest.push(item)
  }
  return rest
}

// --- Świadome odstępstwa ----------------------------------------------------

interface Deviation {
  section: string
  why: string
  /** Bloki, które golden ma, a my nie. */
  goldenOnly: readonly string[]
  /** Bloki, które my drukujemy, a golden nie. */
  renderedOnly: readonly string[]
}

/**
 * JAWNA lista różnic wobec goldena. Test wymaga RÓWNOŚCI z nią, nie zawierania
 * się: nowa różnica jest czerwona i zniknięcie starej też, bo jedno i drugie
 * znaczy, że ten komentarz przestał opisywać rzeczywistość.
 *
 * Lista NIE zawiera trzech błędów arytmetycznych goldena opisanych w
 * `GOLDEN_ARITHMETIC` niżej - i to jest samo w sobie ustalenie: żaden z nich
 * nie ujawnia się na poziomie renderera.
 */
const KNOWN_DEVIATIONS: readonly Deviation[] = Object.freeze([
  {
    section: '4. COVERAGE',
    why:
      'Golden prefiksuje notkę dowodową rodzajem dowodu ("Observed: ...") w sześciu wierszach na ' +
      'osiem, a w dwóch ostatnich nie - bez reguły, którą dałoby się zapisać. Renderer prefiksuje ' +
      'ZAWSZE, bo kolumna dowodowa jest rdzeniem wiarygodności tabeli i wiersz bez rodzaju dowodu ' +
      'czyta się jak zdanie od autora.',
    goldenOnly: [
      'Customer signs the installation contract Retained on a signature-only plan at the same list price',
      'Statutory books, VAT filing Out of scope by recommendation, not by omission',
    ],
    renderedOnly: [
      'Customer signs the installation contract Inferred: Retained on a signature-only plan at the same list price',
      'Statutory books, VAT filing Inferred: Out of scope by recommendation, not by omission',
    ],
  },
  {
    section: '4. COVERAGE',
    why:
      'Golden podpisuje Figure 1 jednostką z sekcji 02 ("38 usage statements"), a to ta sama ' +
      'jednostka dla DWÓCH RÓŻNYCH ZBIORÓW. Sekcja 02 liczy wypowiedzi klienta z rozpoznania - ' +
      'rozmowę, faktury, screen-share\'y - i tę liczbę podaje konsultant. Figure 1 liczy ' +
      'MAPOWANIA, czyli pary narzędzie-zdolność ocenione przez silnik (`coverage.byVerdict`), ' +
      'i dla żywego przebiegu Voltixa jest ich 15, nie 38. Golden mógł je zrównać, bo był pisany ' +
      'ręcznie i jego autor rozpisał wszystkie 38 na werdykty; silnik takiego rozkładu nie ma i ' +
      'nie wolno mu go dorobić (SPEC.md §2, zasada 2). Renderer nazywa więc jednostkę wykresu po ' +
      'swojemu - "mapped capabilities" - żeby sąsiednie strony nie podawały dwóch liczb pod ' +
      'jednym słowem. Patrz nota na górze `src/report/templates/coverage.ts`.',
    goldenOnly: ['Figure 1 — Where your 38 usage statements land'],
    renderedOnly: ['Figure 1 — Where your 38 mapped capabilities land'],
  },
  {
    section: '5. MONEY',
    why:
      'CZWARTY, nieopisany w zadaniu rozjazd SAMEGO GOLDENA: kolumna "what has happened by then" ' +
      'w tabeli kamieni milowych niesie inne zdania niż tablica `months` w jego własnym skrypcie ' +
      '(np. "Programme has paid for itself" kontra "Break-even" dla tego samego miesiąca 15). ' +
      'Fixture przepisał wersję ze skryptu do `CashPoint.milestone` i renderer drukuje właśnie ją ' +
      '- jedyną, którą model zna. Same liczby w tych wierszach zgadzają się co do dolara.',
    goldenOnly: [
      'Wave 1 delivered, hosting live',
      'All four waves delivered — maximum exposure',
      'Six months of full run-rate saving',
      'Programme has paid for itself',
      '—',
    ],
    renderedOnly: [
      'Wave 1 delivered',
      'Wave 4 delivered — maximum exposure',
      'End of year 1',
      'Break-even',
      'End of year 2',
    ],
  },
  {
    section: '5. MONEY',
    why:
      'Callout o dwóch zwrotach: w goldenie liczby są WPLECIONE w zdanie ("the 40-hour quote ' +
      'builder, $4,800"), więc nie da się go rozciąć na prozę i fakty. Renderer składa zdanie z ' +
      'liczbami sam i dokłada komentarz autora - dzięki temu obie kwoty pochodzą z `facts`, a nie ' +
      'z pamięci agenta (SPEC.md §10). Traci przy tym przydawki, które napisał człowiek.',
    goldenOnly: [
      'The net-new build — the 40-hour quote builder, $4,800 — is repaid by the total saving in 2.4 months. ' +
        'The full programme, including configuration, data migration and training, breaks even in month 15. ' +
        'The first number is the one that answers "is building this worth it"; the second is the one that ' +
        'belongs in your budget.',
    ],
    renderedOnly: [
      'The net-new build ($4,800) is repaid by the total saving in 2.4 months. The full programme breaks even ' +
        'in month 15. The first number is the one that answers "is building this worth it"; the second is the ' +
        'one that belongs in your budget.',
    ],
  },
])

/**
 * Trzy błędy arytmetyczne goldena wymienione w zadaniu.
 *
 * USTALENIE: żaden NIE ujawnia się w rendererze i nie może. Fixture przepisał
 * z goldena wynik, a nie składniki (`kpis.seatCount: 34`, `stack.monthly: 349`,
 * `paybacks.buildOnlyMonths: 2.4`), a renderer z żelaznej zasady 2 formatuje
 * `facts`, zamiast je przeliczać. Poprawienie tych liczb należy do budowniczego
 * modelu, nie do tego pliku.
 *
 * Test niżej sprawdza właśnie to: że renderer drukuje wartość Z MODELU, nawet
 * gdy inne pole tego samego modelu jej przeczy. Zmiana tego zachowania byłaby
 * drugą, niezależną wersją liczby w dokumencie - awarią ze SPEC.md §10.
 */
interface GoldenArithmetic {
  what: string
  printed: string
}

const GOLDEN_ARITHMETIC: GoldenArithmetic[] = ([
  {
    what: 'kafelek "Licences today" mówi o stanowiskach liczbą LUDZI (34), a tabela stacku ' +
      'liczbą stanowisk (52); model niesie obie i renderer drukuje obie tam, gdzie stoją',
    printed: '7 tools · 34 seats · $27,840 a year',
  },
  {
    what: 'seats x unit dla Jobbera daje 348, a faktura mówi 349 - renderer drukuje fakturę',
    printed: '<td class="num">$349</td>',
  },
  {
    what: 'zwrot samego builda to 4800/1863 = 2,58 miesiąca, golden mówi 2,4 - renderer drukuje model',
    printed: '2.4 months',
  },
] satisfies GoldenArithmetic[])

// --- Test właściwy ----------------------------------------------------------

describe('S1: renderReport kontra golden master', () => {
  const rendered = renderReport(goldenModel())
  const goldenSections = splitSections(goldenHtml)
  const renderedSections = splitSections(rendered)

  it('dzieli dokument na te same sekcje, w tej samej kolejności', () => {
    expect([...renderedSections.keys()]).toEqual([...goldenSections.keys()])
  })

  for (const name of [...splitSections(goldenHtml).keys()]) {
    it(`sekcja ${name} zgadza się z goldenem poza świadomymi odstępstwami`, () => {
      const goldenBlocks = visibleBlocks(goldenSections.get(name) ?? '')
      const ourBlocks = visibleBlocks(renderedSections.get(name) ?? '')
      const deviations = KNOWN_DEVIATIONS.filter((entry) => entry.section === name)
      const expectedGoldenOnly = deviations.flatMap((entry) => [...entry.goldenOnly])
      const expectedRenderedOnly = deviations.flatMap((entry) => [...entry.renderedOnly])

      expect(without(goldenBlocks, ourBlocks).sort()).toEqual([...expectedGoldenOnly].sort())
      expect(without(ourBlocks, goldenBlocks).sort()).toEqual([...expectedRenderedOnly].sort())

      // Kolejność też jest treścią - po zdjęciu odstępstw obie sekcje muszą
      // być tą samą listą bloków w tej samej kolejności.
      expect(without(ourBlocks, expectedRenderedOnly)).toEqual(
        without(goldenBlocks, expectedGoldenOnly),
      )
    })
  }

  it.each(GOLDEN_ARITHMETIC)('drukuje wartość z modelu, nie przeliczoną: $what', ({ printed }) => {
    expect(rendered).toContain(printed)
  })

  it('nie ciągnie ani jednego zasobu z sieci - dokument jedzie mailem', () => {
    expect(rendered).not.toMatch(/<link\b/i)
    expect(rendered).not.toMatch(/<img\b/i)
    expect(rendered).not.toMatch(/<iframe\b/i)
    // Sprawdzamy ATRYBUTY, którymi przeglądarka faktycznie pobiera zasób.
    // Samo wystąpienie adresu w tekście nie jest pobraniem - w skrypcie stoi
    // przestrzeń nazw SVG (`http://www.w3.org/2000/svg`), której nikt nigdy nie
    // odpytuje, a wykluczenie jej wzorcem po adresie kasowałoby też prawdziwe
    // znalezisko o ten sam host.
    const fetched = [...rendered.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/gi)].map((m) => m[1])
    const external = fetched.filter((url) => /^(?:https?:)?\/\//i.test(url))
    expect(external).toEqual(['https://www.openmercato.com/'])
  })

  it('niesie obie figury inline, z rolą, tytułem i opisem', () => {
    expect(rendered).toContain('<svg viewBox="0 0 720 76" role="img" aria-labelledby="fig1title fig1desc">')
    // "mapped capabilities", nie "usage statements" - i to NIE jest osłabienie
    // asercji, tylko poprawienie jej przedmiotu. `<title>` Figure 1 opisuje
    // sumę `coverage.byVerdict`, czyli mapowania silnika; "usage statements"
    // to jednostka przypisu sekcji 02, którą podaje konsultant i której nikt
    // nie rozkłada na werdykty. Golden mylił jedno z drugim - patrz wpis
    // "4. COVERAGE" w `KNOWN_DEVIATIONS` i nota w `templates/coverage.ts`.
    expect(rendered).toContain(
      '<title id="fig1title">Coverage of 38 mapped capabilities by verdict</title>',
    )
    expect(rendered).toContain(
      '<desc id="fig1desc">Native 19, configure 9, build 4, integrate 2, off-catalog 4.</desc>',
    )
    expect(rendered).toContain('<title id="fig2title">Cumulative net cash position over 24 months</title>')
    expect(rendered).toContain(
      '<desc id="fig2desc">Position falls to minus 14,967 dollars at month 6, ' +
        'crosses zero in month 15, and reaches plus 18,567 dollars at month 24.</desc>',
    )
  })
})

// --- Degradacja -------------------------------------------------------------

/**
 * Cztery braki, cztery odpowiedzi.
 *
 * Każdy z nich jest POPRAWNYM przebiegiem, nie awarią: `--no-llm` (SPEC.md §8)
 * nie ma prozy, klient bez faktur nie ma kosztów, `--no-preview` nie ma
 * podglądu, a przebieg bez Migration Plannera nie ma fal. Renderer ma wtedy
 * oddać dokument uboższy, nigdy uszkodzony - i nigdy pustych bloków, bo pusty
 * `<p>` u klienta czyta się jak usterka składu, a nie jak brak danych.
 */
describe('degradacja', () => {
  function closesCleanly(html: string): void {
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html.trimEnd().endsWith('</html>')).toBe(true)
    // Pusty akapit/nagłówek to ślad po pominiętej treści, nie po jej braku.
    expect(html).not.toMatch(/<(p|h2|h3|h4)\b[^>]*>\s*<\/\1>/)
  }

  it('S3: bez prozy w ogóle: tabele i figury zostają, sekcje czysto prozatorskie znikają', () => {
    const html = renderReport({ facts: goldenModel().facts })
    closesCleanly(html)

    // Sekcje, których treść to wyłącznie zdania agenta - nie ma ich.
    expect(html).not.toContain('Executive summary')
    expect(html).not.toContain('Risks and assumptions')
    expect(html).not.toContain('The recommendation in one sentence')
    expect(html).not.toContain('Two payback numbers')

    // Wszystko, co policzone, stoi na swoim miejscu.
    expect(html).toContain('Your stack today')
    expect(html).toContain('Capability coverage')
    expect(html).toContain('<desc id="fig1desc">Native 19, configure 9, build 4, integrate 2, off-catalog 4.</desc>')
    expect(html).toContain('$27,840')
    expect(html).toContain('How we reach a verdict')
    expect(html).toContain('Off-catalog items')

    // Fala bez prozy pokazuje swój ZAKRES, zamiast zostać pustym kafelkiem.
    expect(html).toContain('Registers and stock')
    expect(html).toContain('Airtable — Ad-hoc registers · native')
  })

  /**
   * MODEL WEJŚCIOWY WZMOCNIONY WRAZ Z POPRAWKĄ B2 - asercje zostały te same.
   *
   * Poprzednia wersja gasiła same KPI i zostawiała w `stack.rows` ceny ze
   * złotego modelu. Taki model NIE JEST scenariuszem S2, tylko modelem
   * sprzecznym: kafelki mówią "nie podano kosztów", a tabela sekcji 03 obok
   * podaje siedem kwot. Zdanie pod nieistniejącym wykresem nazywa teraz
   * POWÓD braku serii (`cashflow.ts`, `noCashReason`), więc na sprzecznym
   * modelu mówiło - poprawnie - o brakującej stawce, a nie o brakujących
   * fakturach. Zerujemy więc też stos: to jest ten stan, o którym ten test
   * miał być od początku.
   */
  it('S2: bez serii gotówkowej: nie ma Figure 2 ani KPI pieniężnych, jest zdanie o braku kosztów', () => {
    const facts = goldenModel().facts
    const html = renderReport({
      facts: {
        ...facts,
        cash: undefined,
        stack: {
          ...facts.stack,
          rows: facts.stack.rows.map((row) => ({
            ...row,
            unitPrice: null,
            monthly: null,
            annual: null,
          })),
          totalMonthly: null,
          totalAnnual: null,
        },
        kpis: {
          ...facts.kpis,
          licencesTodayMonthly: null,
          licencesTodayAnnual: null,
          licencesAfterMonthly: null,
          netRecurringAnnual: null,
          hostingMonthly: null,
          implementationCost: null,
          breakEvenMonth: null,
          netAtHorizon: null,
        },
      },
    })
    closesCleanly(html)

    expect(html).not.toContain('id="fig-cash"')
    expect(html).not.toContain('Figure 2')
    expect(html).toContain('No costs were supplied for this stack, so there is nothing to plot.')

    // Kafelki pieniężne znikają; kafelki o kształcie stosu zostają.
    expect(html).not.toContain('Net recurring saving</span>')
    expect(html).not.toContain('Break-even')
    expect(html).toContain('Stack today')
    expect(html).toContain('7 tools · 34 seats · no costs were supplied')
    expect(html).toContain('Implementation effort')

    // Ani jednej kwoty udającej zero.
    expect(html).not.toContain('$0')
  })

  it('bez podglądu: sekcja 07 nie powstaje', () => {
    const facts = goldenModel().facts
    const html = renderReport({ facts: { ...facts, preview: undefined }, prose: goldenModel().prose })
    closesCleanly(html)
    expect(html).not.toContain('Section 07')
    expect(html).not.toContain('Your preview')
    // Sekcje sąsiednie dalej są i dalej mają swoje numery.
    expect(html).toContain('Section 06')
    expect(html).toContain('Section 08')
  })

  it('S8: bez fal: sekcja 06 nie powstaje', () => {
    const facts = goldenModel().facts
    const html = renderReport({ facts: { ...facts, waves: [] }, prose: goldenModel().prose })
    closesCleanly(html)
    expect(html).not.toContain('Recommended sequence')
    expect(html).not.toContain('class="waves"')
    expect(html).toContain('Section 05')
    expect(html).toContain('Section 07')
  })
})

// --- hoursAreFloor ----------------------------------------------------------

/**
 * Reguła z `assets/README.md`: godziny nigdy nie są zgadywane. Wiersz `build`
 * bez estymaty drukuje się jako "to estimate", a suma mówi, że jest dolną
 * granicą. Zero w tym miejscu byłoby najgorszym możliwym wyjściem - czyta się
 * jako "za darmo", a znaczy "nikt tego nie wycenił".
 */
describe('S9: hoursAreFloor', () => {
  function floorModel(): ReportModel {
    const base = goldenModel()
    return {
      ...base,
      facts: {
        ...base.facts,
        kpis: { ...base.facts.kpis, implementationHours: 120, implementationHoursAreFloor: true },
        money: {
          ...base.facts.money,
          totalHours: 120,
          totalHoursAreFloor: true,
          totalImplementationCost: 14400,
          implementation: [
            { waveNumber: 1, label: 'Wave 1', scope: 'Registers', hours: 30, cost: 3600, hoursAreFloor: false },
            { waveNumber: 2, label: 'Wave 2', scope: 'Quote builder', hours: 0, cost: null, hoursAreFloor: true },
            { waveNumber: 3, label: 'Wave 3', scope: 'Field service', hours: 90, cost: 10800, hoursAreFloor: true },
          ],
        },
      },
    }
  }

  it('wiersz bez estymaty drukuje "to estimate", nigdy 0', () => {
    const html = renderReport(floorModel())
    expect(html).toContain('<td class="num">to estimate</td>')
    expect(html).not.toContain('<td class="num">0</td>')
  })

  it('suma godzin i kwota są dolną granicą, a podstawa mówi to wprost', () => {
    const html = renderReport(floorModel())
    expect(html).toContain('<td class="num">120+</td>')
    expect(html).toContain('<td class="num">$14,400+</td>')
    expect(html).toContain('Blended rate $120/h · a floor, not a quote')
  })

  it('kafelek KPI też podaje dolną granicę, a nie okrągłą liczbę', () => {
    const html = renderReport(floorModel())
    expect(html).toContain('120+ h at $120/h')
  })

  it('zero BEZ flagi zostaje zerem - to uczciwa wartość, nie brak estymaty', () => {
    const base = floorModel()
    const html = renderReport({
      ...base,
      facts: {
        ...base.facts,
        money: {
          ...base.facts.money,
          implementation: [
            { waveNumber: 1, label: 'Wave 1', scope: 'Nothing to build', hours: 0, cost: 0, hoursAreFloor: false },
          ],
        },
      },
    })
    expect(html).toContain('<td class="num">0</td>')
  })
})

// --- Ucieczka znaków --------------------------------------------------------

/**
 * Dane wchodzą do tego dokumentu z DWÓCH nieufanych źródeł: od klienta
 * (formularz) i od modelu językowego. Żadne z nich nie ma prawa wstrzyknąć
 * znacznika - ani do treści, ani do atrybutu, ani do tablicy w `<script>`.
 */
describe('ucieczka znaków', () => {
  const NASTY = '<script>alert(1)</script> & "quoted" \'single\''

  it('ucieka wartość z faktów w treści i w atrybucie', () => {
    const base = goldenModel()
    const html = renderReport({
      ...base,
      facts: {
        ...base.facts,
        company: { ...base.facts.company, name: NASTY },
        meta: { ...base.facts.meta, confidentialityNote: NASTY },
      },
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot; &#39;single&#39;')
  })

  it('ucieka wartość z prozy', () => {
    const base = goldenModel()
    const html = renderReport({ ...base, prose: { ...base.prose, recommendation: NASTY } })
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('nie pozwala zamknąć bloku <script> podpisem kamienia milowego', () => {
    const base = goldenModel()
    const cash = base.facts.cash
    if (cash === undefined) throw new Error('fixture lost its cash series')
    const html = renderReport({
      ...base,
      facts: {
        ...base.facts,
        cash: {
          ...cash,
          points: cash.points.map((point) =>
            point.month === 1 ? { ...point, milestone: '</script><img src=x>' } : point,
          ),
        },
      },
    })
    // Dokument ma DOKŁADNIE jeden blok skryptu i ani jednego <img>.
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).not.toMatch(/<img\b/i)
  })
})

// --- Figury z liczb ---------------------------------------------------------

/**
 * Figury są tu sprawdzane WOBEC DANYCH, nie wobec rysunku goldena - bo tak
 * zostały napisane. Test pyta o to, co czyni je prawdziwymi: czy segment
 * dwa razy większy jest dwa razy szerszy i czy punkt o wyższej wartości leży
 * wyżej.
 */
describe('figury są wyprowadzone z liczb', () => {
  function segments(html: string): Array<{ width: number; fill: string }> {
    return [...html.matchAll(/<rect class="seg"[^>]*width="([\d.]+)"[^>]*fill="([^"]+)"/g)].map(
      (m) => ({ width: Number(m[1]), fill: m[2] }),
    )
  }

  it('Figure 1: szerokości są proporcjonalne do liczników werdyktów', () => {
    const html = renderReport(goldenModel())
    const found = segments(html)
    const counts = goldenModel().facts.coverage.byVerdict
    expect(found).toHaveLength(5)
    const perStatement = found[0].width / counts.native
    expect(found[1].width / counts.configure).toBeCloseTo(perStatement, 2)
    expect(found[2].width / counts.build).toBeCloseTo(perStatement, 2)
    expect(found[3].width / counts.integrate).toBeCloseTo(perStatement, 2)
    expect(found[4].width / counts.offCatalog).toBeCloseTo(perStatement, 2)
  })

  it('Figure 1: inne liczniki dają inny rysunek - nic nie jest zaszyte', () => {
    const base = goldenModel()
    const html = renderReport({
      ...base,
      facts: {
        ...base.facts,
        coverage: {
          ...base.facts.coverage,
          byVerdict: { native: 1, configure: 1, build: 0, integrate: 0, keep: 0, drop: 0, offCatalog: 0 },
        },
      },
    })
    const found = segments(html)
    expect(found).toHaveLength(2)
    expect(found[0].width).toBeCloseTo(found[1].width, 2)
    expect(html).toContain('<desc id="fig1desc">Native 1, configure 1.</desc>')
  })

  it('Figure 2: wyższa wartość leży wyżej, a dno i break-even są w okolicy swoich miesięcy', () => {
    const html = renderReport(goldenModel())
    const path = /<path class="g-line" d="([^"]+)"/.exec(html)
    if (path === null) throw new Error('brak krzywej')
    const pts = path[1]
      .split(' ')
      .map((token) => token.replace(/^[ML]/, '').split(','))
      .map(([x, y]) => ({ x: Number(x), y: Number(y) }))
    const cash = goldenModel().facts.cash
    if (cash === undefined) throw new Error('fixture lost its cash series')

    expect(pts).toHaveLength(GOLDEN_FIGURE_MONTHS + 1)
    // Miesiące rosną w prawo, bez cofek.
    for (let i = 1; i < pts.length; i += 1) expect(pts[i].x).toBeGreaterThan(pts[i - 1].x)
    // Najniższy punkt krzywej (największe `y` w SVG) to miesiąc maksymalnej ekspozycji.
    const lowest = pts.reduce((worst, point, index) => (point.y > pts[worst].y ? index : worst), 0)
    expect(lowest).toBe(cash.maxExposureMonth)
    // Ostatni punkt jest najwyżej, bo seria kończy się na maksimum.
    expect(pts[pts.length - 1].y).toBeLessThan(Math.min(...pts.slice(0, -1).map((p) => p.y)))
  })

  it('S6: Figure 2: bez break-evenu nie ma pasa inwestycji ani znacznika zwrotu', () => {
    const base = goldenModel()
    const cash = base.facts.cash
    if (cash === undefined) throw new Error('fixture lost its cash series')
    const html = renderReport({
      ...base,
      facts: { ...base.facts, cash: { ...cash, breakEvenMonth: null } },
    })
    expect(html).not.toContain('investment period')
    expect(html).not.toContain('break-even ·')
    expect(html).toContain('<desc id="fig2desc">Position falls to minus 14,967 dollars at month 6 and is still')
  })
})

// --- Zapis ------------------------------------------------------------------

/**
 * `writeReport` jest jedynym I/O tej ścieżki i powtarza obronę z
 * `writePreview`: `writeFileSync` podąża za dowiązaniem symbolicznym w
 * ostatnim segmencie ścieżki i nadpisuje cel bez słowa (CWE-59). Wyjściem jest
 * dokument z cennikiem klienta, więc próba zapisu "przez" dowiązanie ma być
 * błędem, a nie skutkiem ubocznym.
 */
describe('writeReport', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mercatify-report-'))

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('zapisuje dokument i zwraca jego rozmiar', () => {
    const target = join(tmp, 'nested', 'report.html')
    const written = writeReport(goldenModel(), target)
    expect(written.path).toBe(target)
    const onDisk = readFileSync(target, 'utf8')
    expect(written.bytes).toBe(Buffer.byteLength(onDisk, 'utf8'))
    expect(onDisk).toBe(renderReport(goldenModel()))
  })

  it('S21: ODMAWIA zapisu przez dowiązanie symboliczne', () => {
    const outside = join(tmp, 'outside.html')
    writeFileSync(outside, 'nie ruszaj')
    const link = join(tmp, 'link.html')
    symlinkSync(outside, link)
    expect(() => writeReport(goldenModel(), link)).toThrow(/symlink/)
    expect(readFileSync(outside, 'utf8')).toBe('nie ruszaj')
  })

  it('S4: nie zostawia pliku po nieudanym renderze - najpierw pamięć, potem dysk', () => {
    const base = goldenModel()
    const target = join(tmp, 'never-written.html')
    const broken: ReportModel = {
      ...base,
      prose: { ...base.prose, recommendation: 'saves {kpis.thereIsNoSuchField} a year' },
    }
    expect(() => writeReport(broken, target)).toThrow(/names no such field/)
    expect(existsSync(target)).toBe(false)
  })
})
