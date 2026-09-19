import { count, money } from '../format'
import type { CoverageRow, ReportFacts, ReportProse, VerdictCounts } from '../model'
import {
  confidenceBand,
  escapeHtml,
  joinParts,
  numeralWord,
  sectionHead,
  svgNum,
  verdictChip,
} from './shared'

/**
 * Sekcja 04 - pokrycie zdolności plus Figure 1.
 *
 * Figure 1 jest GENEROWANA z `coverage.byVerdict`, nie przepisana: szerokość
 * segmentu to jego udział w sumie, więc obrazek nie ma jak powiedzieć czegoś
 * innego niż legenda pod nim. Wykres przepisany ręcznie jest dokładnie tą
 * klasą błędu, którą opisuje SPEC.md §10 - druga, niezależna wersja tej samej
 * liczby.
 *
 * FIGURE 1 NIE LICZY TEGO, CO PRZYPIS SEKCJI 02, I MÓWI TO WPROST.
 *
 * `byVerdict` sumuje MAPOWANIA, czyli pary narzędzie-zdolność, które silnik
 * faktycznie ocenił (dla Voltixa 15). Przypis sekcji 02 podaje WYPOWIEDZI
 * KLIENTA Z ROZPOZNANIA - rozmowę, faktury, screen-share'y - i tę liczbę daje
 * konsultant (dla Voltixa 38). Jedna wypowiedź nie jest jednym mapowaniem:
 * rozpoznanie wyłuskuje kilka zdań o tej samej parze, a brief zapisuje ją raz
 * (`src/report/counts.ts` opisuje to najdokładniej).
 *
 * Rozkładu 38 na werdykty NIE DA SIĘ WYPROWADZIĆ - nikt tych wypowiedzi nie
 * ocenił po jednej - więc jedyna uczciwa opcja to nazwać obie jednostki
 * różnymi słowami i nie udawać, że to jedna liczba. Dlatego Figure 1 mówi
 * "mapped capabilities", a nie "usage statements", w tytule, w podpisie, na
 * osi i w dymku segmentu. Zdanie łączące obie liczby stoi w sekcji 02
 * (`basis.ts`), czyli tam, gdzie czytelnik spotyka tę większą jako pierwszą.
 *
 * Alternatywa - dorobienie werdyktów do 38 - jest wymyślaniem liczb, czyli
 * żelazną zasadą 2 ze SPEC.md §2 złamaną w najgorszym możliwym miejscu:
 * na obrazku, który czytelnik bierze za pomiar.
 */

/** Geometria paska. Współrzędne SĄ w tych stałych; z modelu biorą się tylko udziały. */
const BAR = Object.freeze({
  viewWidth: 720,
  viewHeight: 76,
  x0: 56,
  x1: 700,
  y: 10,
  height: 30,
  /**
   * Przerwa między segmentami. Bez niej dwa sąsiednie wypełnienia o podobnej
   * jasności zlewają się w jeden - a `keep` i `drop` dzielą krok neutralny,
   * więc bywają sąsiadami o IDENTYCZNYM wypełnieniu.
   */
  gap: 2,
  /**
   * Poniżej tej szerokości liczba w segmencie nachodzi na sąsiada, więc
   * segment zostaje bez podpisu. Nic się nie gubi: legenda pod wykresem
   * podaje każdą wartość, a `<desc>` podaje je czytnikowi ekranu.
   */
  labelMinWidth: 100,
})

interface Segment {
  key: keyof VerdictCounts
  /** Etykieta w legendzie i w `<desc>`. */
  label: string
  /** Pełne zdanie do dymka - `data-label` w goldenie. */
  description: string
  fill: string
  /** Próbka w legendzie; `offCatalog` jest kreskowany, nie wypełniony. */
  swatch: string
  value: number
}

/**
 * Kolejność jest STAŁA i celowo nie sortuje malejąco: czytelnik porównuje ten
 * sam pasek między raportami, a sortowanie po wartości przestawiałoby kolory
 * przy każdym kliencie. Idzie od "nic nie kosztuje" do "wymaga rozmowy".
 */
const SEGMENT_ORDER: ReadonlyArray<Omit<Segment, 'value'>> = Object.freeze([
  {
    key: 'native',
    label: 'Native',
    description: 'Native — already in the platform',
    fill: 'var(--cat-native)',
    swatch: 'background:var(--cat-native)',
  },
  {
    key: 'configure',
    label: 'Configure',
    description: 'Configure — settings and business rules',
    fill: 'var(--cat-configure)',
    swatch: 'background:var(--cat-configure)',
  },
  {
    key: 'build',
    label: 'Build',
    description: 'Build — new code required',
    fill: 'var(--cat-build)',
    swatch: 'background:var(--cat-build)',
  },
  {
    key: 'integrate',
    label: 'Integrate',
    description: 'Integrate — stays external, wired in',
    fill: 'var(--cat-integrate)',
    swatch: 'background:var(--cat-integrate)',
  },
  {
    key: 'keep',
    label: 'Keep',
    description: 'Keep — we recommend you do not move it',
    fill: 'var(--cat-unknown)',
    swatch: 'background:var(--cat-unknown)',
  },
  {
    key: 'drop',
    label: 'Drop',
    description: 'Drop — switched off and not replaced',
    fill: 'var(--cat-unknown)',
    swatch: 'background:var(--cat-unknown)',
  },
  {
    key: 'offCatalog',
    label: 'Off-catalog',
    description: 'Off-catalog — needs a follow-up conversation',
    fill: 'url(#hatch)',
    swatch: 'background:var(--surface-2); border:1px solid var(--cat-unknown)',
  },
])

function presentSegments(byVerdict: VerdictCounts): Segment[] {
  return SEGMENT_ORDER.filter((spec) => byVerdict[spec.key] > 0).map((spec) => ({
    ...spec,
    value: byVerdict[spec.key],
  }))
}

/** Dymek segmentu - "19 capabilities". Ta sama jednostka co oś, krócej. */
function capabilitiesWord(value: number): string {
  return value === 1 ? '1 capability' : `${count(value)} capabilities`
}

/**
 * Suma, czyli jednostka OSI - "15 mapped capabilities".
 *
 * NIE "usage statements": tamto słowo należy do przypisu sekcji 02 i opisuje
 * inny zbiór. Patrz nota na górze pliku - to jest ta jedna nazwa, od której
 * zależy, czy sąsiednie strony raportu sobie przeczą.
 */
function mappedCapabilities(value: number): string {
  return value === 1 ? '1 mapped capability' : `${count(value)} mapped capabilities`
}

/**
 * `<desc>` z liczb: "Native 19, configure 9, build 4, integrate 2, off-catalog 4."
 * Pierwszy człon wielką literą, reszta małą - to jedno zdanie, nie lista.
 */
function coverageDesc(segments: readonly Segment[]): string {
  const parts = segments.map((segment, index) => {
    const label = index === 0 ? segment.label : segment.label.toLowerCase()
    return `${label} ${count(segment.value)}`
  })
  return `${parts.join(', ')}.`
}

/**
 * Szerokości liczone z UDZIAŁÓW, a pozycje akumulowane z szerokości JUŻ
 * ZAOKRĄGLONYCH. Kolejność jest istotna: sumowanie wartości niezaokrąglonych
 * i zaokrąglanie dopiero przy zapisie rozjeżdża styk segmentów o ułamek
 * piksela, co przy sąsiadujących wypełnieniach widać jako włos tła.
 */
function segmentGeometry(segments: readonly Segment[], total: number): Array<{
  segment: Segment
  x: number
  width: number
}> {
  const usable = BAR.x1 - BAR.x0 - BAR.gap * Math.max(0, segments.length - 1)
  let cursor = BAR.x0
  return segments.map((segment) => {
    const width = Math.round(((usable * segment.value) / total) * 100) / 100
    const placed = { segment, x: cursor, width }
    cursor = Math.round((cursor + width + BAR.gap) * 100) / 100
    return placed
  })
}

function renderFigureOne(facts: ReportFacts, prose: ReportProse): string {
  const segments = presentSegments(facts.coverage.byVerdict)
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  // Pasek zerowej długości nie jest wykresem, tylko ramką. Bez tej bramy
  // dzielenie przez zero zrobiłoby z każdej szerokości NaN i SVG wyszedłby
  // pusty, ale formalnie poprawny - czyli awaria niewidoczna w teście HTML-a.
  if (total === 0) return ''

  const placed = segmentGeometry(segments, total)
  const rects = placed.map(
    ({ segment, x, width }) =>
      `<rect class="seg" x="${svgNum(x)}" y="${BAR.y}" width="${svgNum(width)}" height="${BAR.height}" ` +
      `fill="${segment.fill}" data-label="${escapeHtml(segment.description)}" ` +
      `data-value="${escapeHtml(capabilitiesWord(segment.value))}"></rect>`,
  )
  const labels = placed
    .filter(({ width }) => width >= BAR.labelMinWidth)
    .map(
      ({ segment, x }) =>
        `<text class="g-seg-label" x="${svgNum(x + 14)}" y="${BAR.y + 20}">${escapeHtml(count(segment.value))}</text>`,
    )
  const legend = segments.map(
    (segment) =>
      `<span><i style="${segment.swatch}"></i>${escapeHtml(segment.label)} ` +
      `<b class="num">${escapeHtml(count(segment.value))}</b></span>`,
  )
  const title = `Coverage of ${mappedCapabilities(total)} by verdict`

  return joinParts([
    '<figure class="figure no-break" id="fig-coverage">',
    '<figcaption>',
    `<span class="figure__title">Figure 1 — Where your ${mappedCapabilities(total)} land</span>`,
    prose.figure1Sub === undefined
      ? ''
      : `<p class="figure__sub">${escapeHtml(prose.figure1Sub)}</p>`,
    '</figcaption>',
    `<svg viewBox="0 0 ${BAR.viewWidth} ${BAR.viewHeight}" role="img" aria-labelledby="fig1title fig1desc">`,
    `<title id="fig1title">${escapeHtml(title)}</title>`,
    `<desc id="fig1desc">${escapeHtml(coverageDesc(segments))}</desc>`,
    '<defs>',
    `<clipPath id="barClip"><rect x="${BAR.x0}" y="${BAR.y}" width="${BAR.x1 - BAR.x0}" height="${BAR.height}" rx="4"></rect></clipPath>`,
    '<pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">',
    '<rect width="6" height="6" fill="var(--surface-2)"></rect>',
    '<line x1="0" y1="0" x2="0" y2="6" stroke="var(--cat-unknown)" stroke-width="2.4"></line>',
    '</pattern>',
    '</defs>',
    '<g clip-path="url(#barClip)">',
    ...rects,
    '</g>',
    ...labels,
    '<g class="g-axis">',
    `<text x="${BAR.x0}" y="60">0</text>`,
    `<text x="${BAR.x1}" y="60" text-anchor="end">${escapeHtml(mappedCapabilities(total))}</text>`,
    '</g>',
    '</svg>',
    '<div class="legend">',
    ...legend,
    '</div>',
    '</figure>',
  ])
}

/**
 * Koszt w wierszu pokrycia. `'included'` NIE jest zerem i nie jest kreską:
 * PandaDoc stoi w tabeli dwa razy przy jednej fakturze, więc drugi wiersz
 * musi powiedzieć "ta kwota jest już policzona wyżej". Zero sumowałoby się
 * fałszywie, kreska sugerowałaby brak danych.
 */
function coverageMonthly(row: CoverageRow, currency: string): string {
  if (row.monthly === 'included') return 'incl.'
  return money(row.monthly, currency)
}

function evidenceSub(row: CoverageRow): string {
  if (row.evidenceNote.length === 0) return ''
  const kind = row.evidenceKind[0].toUpperCase() + row.evidenceKind.slice(1)
  return `<span class="sub">${escapeHtml(`${kind}: ${row.evidenceNote}`)}</span>`
}

function renderCoverageRow(row: CoverageRow, currency: string): string {
  const capability =
    row.capability.length === 0 ? '' : `<span class="sub">${escapeHtml(row.capability)}</span>`
  return joinParts([
    '<tr>',
    `<td class="tool">${escapeHtml(row.tool)}${capability}</td>`,
    `<td>${escapeHtml(row.usage)}${evidenceSub(row)}</td>`,
    `<td>${escapeHtml(row.omTarget)}</td>`,
    `<td>${verdictChip(row.verdict)}</td>`,
    `<td>${confidenceBand(row.confidence)}</td>`,
    `<td class="num">${escapeHtml(coverageMonthly(row, currency))}</td>`,
    '</tr>',
  ])
}

/**
 * "Paid twice" - zdolność niesiona przez więcej niż jedno narzędzie. Golden
 * tego bloku nie ma, bo u Voltixa lista jest pusta; blok renderuje się TYLKO
 * z danych, więc jego brak tam nie jest pominięciem.
 */
function renderPaidTwice(facts: ReportFacts): string {
  const rows = facts.coverage.paidTwice
  if (rows.length === 0) return ''
  const items = rows.map((row) => {
    // Kwota tylko wtedy, gdy jest dodatnia. `$0/mo across them` to nie jest
    // wielkość duplikacji, tylko zero doklejone do zdania, które istnieje po
    // to, żeby pokazać wydatek - a zero w tym miejscu bierze się albo z
    // nieznanych cen, albo z narzędzi bez faktury. Ta sama reguła
    // (`positiveOrNull`) co przy budowaniu faktów.
    const spend =
      row.monthlyAcrossTools === null || row.monthlyAcrossTools <= 0
        ? ''
        : ` · ${money(row.monthlyAcrossTools, facts.company.currency)}/mo across them`
    return `<li><span class="n">·</span><div><h3>${escapeHtml(row.capability)}</h3><p>${escapeHtml(row.tools.join(', ') + spend)}</p></div></li>`
  })
  const capabilities = rows.length === 1 ? 'capability' : 'capabilities'
  return joinParts([
    `<h3>Paid twice — ${escapeHtml(numeralWord(rows.length))} ${capabilities} you buy in more than one place</h3>`,
    '<ul class="rule-list">',
    ...items,
    '</ul>',
  ])
}

export function renderCoverage(facts: ReportFacts, prose: ReportProse): string {
  const currency = facts.company.currency
  const note =
    prose.coverageNote === undefined
      ? ''
      : `<p class="footnote">${escapeHtml(prose.coverageNote)}</p>`
  return joinParts([
    '<section class="pad band pb">',
    sectionHead('Section 04', 'Capability coverage', prose.coverageIntro),
    renderFigureOne(facts, prose),
    '<div class="tablewrap tablewrap--wide">',
    '<table>',
    '<thead>',
    '<tr>',
    '<th>Tool in use</th>',
    '<th>What it is actually used for</th>',
    '<th>Open Mercato</th>',
    '<th>Verdict</th>',
    '<th>Confidence</th>',
    '<th class="num">Monthly</th>',
    '</tr>',
    '</thead>',
    '<tbody>',
    ...facts.coverage.rows.map((row) => renderCoverageRow(row, currency)),
    '</tbody>',
    '</table>',
    '</div>',
    renderPaidTwice(facts),
    note,
    '</section>',
  ])
}
