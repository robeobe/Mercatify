import { count } from '../format'
import type { CashPoint, CashSeries, ReportFacts, ReportProse } from '../model'
import {
  amountInWords,
  escapeHtml,
  joinParts,
  MINUS,
  signedMoney,
  svgNum,
} from './shared'

/**
 * Figure 2 - skumulowana pozycja gotówkowa - i tabela kamieni milowych.
 *
 * Krzywa jest WYPROWADZANA z `cash.points`: skala pionowa bierze się z
 * najniższej i najwyższej wartości serii, skala pozioma z liczby miesięcy, a
 * znaczniki dna i break-evenu z `maxExposureMonth` i `breakEvenMonth`.
 * Współrzędne ze złotego raportu NIE są tu przepisane i nie mogłyby być:
 * przepisany wykres pokazywałby cudzą serię przy naszych liczbach i nikt by
 * tego nie zauważył, bo obrazek nie ma jak się nie zgadzać sam ze sobą.
 */

/** Ramka rysunku. Jedyne stałe; wszystko poza nimi liczy się z serii. */
const PLOT = Object.freeze({
  viewWidth: 720,
  viewHeight: 290,
  x0: 56,
  x1: 700,
  yTop: 24,
  yBottom: 250,
  /** `text-anchor="end"` opisów osi Y; 8 px na lewo od ramki. */
  axisX: 48,
  /** Przesunięcie linii bazowej tekstu, żeby opis siadł NA linii siatki. */
  baselineShift: 4,
  monthAxisY: 268,
  captionY: 285,
  /** Ile przedziałów siatki celujemy; `niceStep` dobiera resztę. */
  targetIntervals: 6,
  dotRadius: 4.5,
})

/**
 * Minimalny luz między skrajną wartością a ramką, w krokach siatki, oraz ile
 * kroku dokładamy, gdy go brakuje. Obie liczby są progami CZYTELNOŚCI, nie
 * matematyki: pierwszy mówi "kropka za blisko krawędzi", drugi daje jej tyle
 * miejsca, żeby zmieścił się podpis, i ani piksela więcej - każdy dodatkowy
 * spłaszcza krzywą.
 */
const MIN_HEADROOM = 0.2
const HEADROOM_PAD = 0.4

/** Kandydaci na krok siatki - klasyczna drabina 1/2/2,5/5/10. */
const STEP_MANTISSAS: readonly number[] = Object.freeze([1, 2, 2.5, 5, 10])

/**
 * Największy "okrągły" krok NIE WIĘKSZY niż podany. Bierzemy większy zamiast
 * mniejszego, bo to daje CO NAJMNIEJ `targetIntervals` linii siatki - przy
 * zaokrągleniu w drugą stronę seria o wąskim zakresie dostawała dwie linie i
 * wykres przestawał być czytelny.
 */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  let best = STEP_MANTISSAS[0] * magnitude
  for (const mantissa of STEP_MANTISSAS) {
    const candidate = mantissa * magnitude
    if (candidate <= raw) best = candidate
  }
  return best
}

interface Scale {
  months: number
  bottom: number
  top: number
  step: number
  x: (month: number) => number
  y: (value: number) => number
}

/**
 * Skala z serii.
 *
 * Zero jest WŁĄCZANE do zakresu zawsze, nawet gdy cała seria jest dodatnia:
 * ten wykres opowiada o pozycji WZGLĘDEM nicnierobienia, więc oś zerowa jest
 * jego treścią, a nie ozdobą. Bez tego krzywa, która nigdy nie schodzi pod
 * kreskę, rysowałaby się bez kreski i wyglądała jak dowolny wzrost.
 */
function buildScale(points: readonly CashPoint[], months: number): Scale {
  const values = points.map((point) => point.cumulative)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const step = niceStep((max - min) / PLOT.targetIntervals)
  let bottom = Math.floor(min / step) * step
  let top = Math.ceil(max / step) * step
  // Skrajna wartość, która wypada tuż PRZY ramce, rysuje się na niej: znacznik
  // dna nachodzi wtedy na dolną linię siatki i na opis osi, a jego podpis
  // wychodzi poza obszar rysunku. Dokładamy luz - zakres przestaje być wtedy
  // wielokrotnością kroku, ale LINIE SIATKI dalej nią są, bo `gridValues`
  // liczy je od pierwszej okrągłej wartości w zakresie, a nie od jego dna.
  if (min < bottom + step * MIN_HEADROOM) bottom -= step * HEADROOM_PAD
  if (max > top - step * MIN_HEADROOM) top += step * HEADROOM_PAD
  if (top === bottom) top = bottom + step

  const width = PLOT.x1 - PLOT.x0
  const height = PLOT.yBottom - PLOT.yTop
  return {
    months,
    bottom,
    top,
    step,
    x: (month) => (months === 0 ? PLOT.x0 : PLOT.x0 + (month * width) / months),
    y: (value) => PLOT.yBottom - ((value - bottom) * height) / (top - bottom),
  }
}

/** Wartości linii siatki, od dołu. Zero jedzie osobną, przerywaną linią. */
function gridValues(scale: Scale): number[] {
  const values: number[] = []
  const first = Math.ceil(scale.bottom / scale.step) * scale.step
  for (let value = first; value <= scale.top + scale.step / 2; value += scale.step) {
    values.push(Math.round(value * 100) / 100)
  }
  return values
}

/** `+20k` / `0` / `−10k`. Skrót do tysięcy tylko wtedy, gdy nie gubi cyfry. */
function axisLabel(value: number): string {
  if (value === 0) return '0'
  const sign = value < 0 ? MINUS : '+'
  const magnitude = Math.abs(value)
  if (magnitude >= 1000 && magnitude % 1000 === 0) return `${sign}${count(magnitude / 1000)}k`
  return `${sign}${count(magnitude)}`
}

/** Pięć podziałek miesięcy - początek, trzy ćwiartki, koniec. */
function monthTicks(months: number): number[] {
  if (months <= 0) return [0]
  const raw = [0, months / 4, months / 2, (months * 3) / 4, months].map((tick) => Math.round(tick))
  return [...new Set(raw)]
}

/**
 * `<desc>` dla czytnika ekranu - ta sama historia, co na obrazku, zdaniami.
 *
 * Trzy warianty, bo trzy kształty krzywej z `assets/README.md`: nie ma czego
 * zwracać, zwraca się w miesiącu N, nie zwraca się w horyzoncie. Kwoty idą
 * słowem ("minus 14,967 dollars"), bo symbol waluty czytany syntezatorem
 * bywa przestawiany.
 */
function cashDesc(cash: CashSeries, scale: Scale, last: CashPoint, currency: string): string {
  const end = `${last.cumulative < 0 ? 'minus' : 'plus'} ${amountInWords(last.cumulative, currency)}`
  const endClause = `reaches ${end} at month ${count(scale.months)}`
  if (cash.maxExposure >= 0) {
    return `Position never falls below zero and ${endClause}.`
  }
  const trough =
    `Position falls to minus ${amountInWords(cash.maxExposure, currency)} ` +
    `at month ${count(cash.maxExposureMonth)}`
  if (cash.breakEvenMonth === null || cash.breakEvenMonth > scale.months) {
    return `${trough} and is still ${end} at month ${count(scale.months)}.`
  }
  return `${trough}, crosses zero in month ${count(cash.breakEvenMonth)}, and ${endClause}.`
}

function renderGrid(scale: Scale): string[] {
  return gridValues(scale)
    .filter((value) => value !== 0)
    .map(
      (value) =>
        `<line x1="${PLOT.x0}" y1="${svgNum(scale.y(value))}" x2="${PLOT.x1}" y2="${svgNum(scale.y(value))}"></line>`,
    )
}

function renderAxis(scale: Scale): string[] {
  const yLabels = gridValues(scale).map(
    (value) =>
      `<text x="${PLOT.axisX}" y="${svgNum(scale.y(value) + PLOT.baselineShift)}" text-anchor="end">${escapeHtml(axisLabel(value))}</text>`,
  )
  const xLabels = monthTicks(scale.months).map(
    (month) =>
      `<text x="${svgNum(scale.x(month))}" y="${PLOT.monthAxisY}" text-anchor="middle">M${count(month)}</text>`,
  )
  const middle = svgNum((PLOT.x0 + PLOT.x1) / 2)
  return [
    '<g class="g-axis">',
    ...yLabels,
    ...xLabels,
    `<text x="${middle}" y="${PLOT.captionY}" text-anchor="middle">months from programme start</text>`,
    '</g>',
  ]
}

/**
 * Cieniowanie "investment period" - od startu do break-evenu. Bez break-evenu
 * nie ma czego cieniować: pas do końca osi mówiłby "cały program jest
 * inwestycją", co jest prawdą, ale nie jest informacją.
 */
function renderShade(cash: CashSeries, scale: Scale): string[] {
  if (cash.breakEvenMonth === null || cash.breakEvenMonth <= 0) return []
  const end = Math.min(cash.breakEvenMonth, scale.months)
  const width = scale.x(end) - PLOT.x0
  if (width <= 0) return []
  return [
    `<rect class="g-shade" x="${PLOT.x0}" y="${PLOT.yTop}" width="${svgNum(width)}" height="${svgNum(PLOT.yBottom - PLOT.yTop)}"></rect>`,
    `<text class="g-note" x="${PLOT.x0 + 8}" y="${PLOT.yTop + 14}">investment period</text>`,
  ]
}

interface Marker {
  month: number
  value: number
  text: string
  /** Podpis po prawej od kropki i pod nią, czy po lewej i nad nią. */
  trailing: boolean
}

function renderMarkers(markers: readonly Marker[], scale: Scale): string[] {
  return markers.flatMap((marker) => {
    const cx = scale.x(marker.month)
    const cy = scale.y(marker.value)
    const label = marker.trailing
      ? `<text class="g-note g-note--strong" x="${svgNum(cx + 8)}" y="${svgNum(cy + 14)}">${escapeHtml(marker.text)}</text>`
      : `<text class="g-note g-note--strong" x="${svgNum(cx - 8)}" y="${svgNum(cy - 8)}" text-anchor="end">${escapeHtml(marker.text)}</text>`
    return [
      `<circle class="g-dot" cx="${svgNum(cx)}" cy="${svgNum(cy)}" r="${PLOT.dotRadius}"></circle>`,
      label,
    ]
  })
}

/**
 * Trzy podpisy bezpośrednie, nie dwadzieścia pięć: dno, przecięcie zera i
 * koniec. Reszta punktów jest w tabeli pod wykresem i w dymkach - podpisanie
 * każdego miesiąca zamienia wykres w tabelę o gorszej czcionce.
 */
function markersFor(cash: CashSeries, scale: Scale, last: CashPoint, currency: string): Marker[] {
  const markers: Marker[] = []
  if (cash.maxExposure < 0 && cash.maxExposureMonth <= scale.months) {
    markers.push({
      month: cash.maxExposureMonth,
      value: cash.maxExposure,
      text: `${signedMoney(cash.maxExposure, currency)} max exposure (M${count(cash.maxExposureMonth)})`,
      trailing: true,
    })
  }
  if (cash.breakEvenMonth !== null && cash.breakEvenMonth <= scale.months) {
    const point = cash.points.find((candidate) => candidate.month === cash.breakEvenMonth)
    if (point !== undefined) {
      markers.push({
        month: point.month,
        value: point.cumulative,
        text: `break-even · M${count(point.month)}`,
        trailing: false,
      })
    }
  }
  markers.push({
    month: last.month,
    value: last.cumulative,
    text: signedMoney(last.cumulative, currency),
    trailing: false,
  })
  return markers
}

/** Punkty, które faktycznie trafiają na rysunek - okno `figureMonths`. */
export function plottedPoints(cash: CashSeries): CashPoint[] {
  const months = cash.figureMonths ?? cash.horizonMonths
  return cash.points.filter((point) => point.month >= 0 && point.month <= months)
}

function renderFigureTwo(facts: ReportFacts, prose: ReportProse, cash: CashSeries): string {
  const points = plottedPoints(cash)
  // Jeden punkt to nie krzywa. Rysunek z samym punktem M0 sugerowałby, że
  // policzyliśmy serię i wyszła płaska - a my jej po prostu nie mamy.
  if (points.length < 2) return ''

  const last = points[points.length - 1]
  const scale = buildScale(points, last.month)
  const currency = facts.company.currency
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${svgNum(scale.x(point.month))},${svgNum(scale.y(point.cumulative))}`,
    )
    .join(' ')
  const zeroLine =
    scale.bottom < 0 && scale.top > 0
      ? `<line class="g-zero" x1="${PLOT.x0}" y1="${svgNum(scale.y(0))}" x2="${PLOT.x1}" y2="${svgNum(scale.y(0))}"></line>`
      : ''
  const title = `Cumulative net cash position over ${count(scale.months)} months`

  return joinParts([
    '<figure class="figure no-break" id="fig-cash">',
    '<figcaption>',
    `<span class="figure__title">Figure 2 — Cumulative net cash position, months 0 to ${escapeHtml(count(scale.months))}</span>`,
    prose.figure2Sub === undefined
      ? ''
      : `<p class="figure__sub">${escapeHtml(prose.figure2Sub)}</p>`,
    '</figcaption>',
    `<svg viewBox="0 0 ${PLOT.viewWidth} ${PLOT.viewHeight}" role="img" aria-labelledby="fig2title fig2desc" id="cashSvg">`,
    `<title id="fig2title">${escapeHtml(title)}</title>`,
    `<desc id="fig2desc">${escapeHtml(cashDesc(cash, scale, last, currency))}</desc>`,
    ...renderShade(cash, scale),
    '<g class="g-grid">',
    ...renderGrid(scale),
    '</g>',
    zeroLine,
    ...renderAxis(scale),
    `<path class="g-line" d="${path}"></path>`,
    ...renderMarkers(markersFor(cash, scale, last, currency), scale),
    '<g id="cashHits"></g>',
    '</svg>',
    prose.figure2Cap === undefined
      ? ''
      : `<p class="figure__cap">${escapeHtml(prose.figure2Cap)}</p>`,
    '</figure>',
  ])
}

/**
 * Tabela kamieni milowych - te same liczby, co krzywa, tylko czytelne bez
 * wzroku i bez kolorów.
 *
 * Wiersze wybierają PUNKTY ZWROTNE serii, a nie każdy podpisany miesiąc:
 * pierwszy miesiąc, dno, break-even, każdy koniec roku i horyzont. Tabela z
 * wierszem na każdy kamień milowy rośnie z liczbą fal i przy ośmiu falach
 * przestaje być streszczeniem, a zaczyna być drugą kopią serii - podczas gdy
 * czytelnik szuka tu czterech rzeczy: ile wychodzi na początku, ile najgorzej,
 * kiedy się zwraca i ile zostaje.
 *
 * Miesiąc 0 celowo wypada - to punkt odniesienia (zero względem zera), a nie
 * zdarzenie, i wiersz "0 / 0" tylko rozcieńcza tabelę.
 *
 * Tabela używa PEŁNEJ serii, nie okna rysunku: kafelek "36-month net" mówi o
 * miesiącu 36 i czytelnik musi znaleźć tę liczbę także wtedy, gdy wykres
 * urywa się na 24.
 */
const MONTHS_IN_YEAR = 12

function milestoneMonths(cash: CashSeries): number[] {
  const wanted = new Set<number>([1])
  if (cash.maxExposureMonth > 0) wanted.add(cash.maxExposureMonth)
  if (cash.breakEvenMonth !== null && cash.breakEvenMonth > 0) wanted.add(cash.breakEvenMonth)
  for (let month = MONTHS_IN_YEAR; month <= cash.horizonMonths; month += MONTHS_IN_YEAR) {
    wanted.add(month)
  }
  if (cash.horizonMonths > 0) wanted.add(cash.horizonMonths)
  return [...wanted].sort((a, b) => a - b)
}

function renderMilestoneTable(facts: ReportFacts, cash: CashSeries): string {
  const currency = facts.company.currency
  const wanted = new Set(milestoneMonths(cash))
  const chosen = cash.points.filter((point) => wanted.has(point.month))
  if (chosen.length === 0) return ''
  const rows = chosen.map((point) =>
    joinParts([
      '<tr>',
      `<td>Month ${escapeHtml(count(point.month))}</td>`,
      `<td>${point.milestone.length === 0 ? '—' : escapeHtml(point.milestone)}</td>`,
      `<td class="num">${escapeHtml(signedMoney(point.monthlyNet, currency))}</td>`,
      `<td class="num">${escapeHtml(signedMoney(point.cumulative, currency))}</td>`,
      '</tr>',
    ]),
  )
  return joinParts([
    '<div class="tablewrap">',
    '<table>',
    '<thead>',
    '<tr><th>Milestone</th><th>What has happened by then</th><th class="num">Monthly net</th><th class="num">Cumulative</th></tr>',
    '</thead>',
    '<tbody>',
    ...rows,
    '</tbody>',
    '</table>',
    '</div>',
  ])
}

/**
 * Zamiennik wykresu dla przebiegu bez serii (scenariusz S2 z `ReportKpis`).
 *
 * Mówi wprost, czego nie ma, zamiast rysować płaską linię na zerach. Wykres z
 * samych zer jest gorszy niż brak wykresu: wygląda na wynik obliczenia i
 * czyta się jako "nic nie zyskujesz", a prawdziwa odpowiedź brzmi "nie
 * policzyliśmy, bo czegoś nie dostaliśmy".
 *
 * TRZY POWODY, TRZY ZDANIA, i to nie jest kosmetyka. Blok mówił dotąd zawsze
 * "no costs were supplied" - także w przebiegu, w którym faktury BYŁY, a
 * brakowało estymaty godzin (brief Voltixa bez `consultant.plan`). Czytelnik
 * dostawał wtedy zdanie o brakujących fakturach obok tabeli, w której te
 * faktury stoją, i jedyne, czego nie mógł się dowiedzieć, to czego naprawdę
 * brakuje. Nazwanie złego braku jest tym samym błędem co wydrukowanie zera:
 * odpowiedzią tam, gdzie jej nie ma.
 */
function noCashReason(facts: ReportFacts): string {
  const rows = facts.stack.rows
  if (rows.length > 0 && rows.every((row) => row.monthly === null)) {
    return (
      'No costs were supplied for this stack, so there is nothing to plot. ' +
      'Everything above still holds — what each tool is used for, what the platform covers ' +
      'and what has to be built — but the saving, the payback and the cash curve need invoices.'
    )
  }
  if (facts.money.totalHoursAreFloor && facts.money.totalHours <= 0) {
    return (
      'Not one wave carries an effort estimate, so there is nothing to plot. ' +
      'A curve drawn from these figures would show a programme that costs nothing and pays ' +
      'back at once — everything above still holds, but the payback needs the hours first.'
    )
  }
  return (
    'This run has no blended rate or no hosting cost, so there is nothing to plot. ' +
    'Everything above still holds, but a cash curve needs both to place the spending in time.'
  )
}

function renderNoCashNote(facts: ReportFacts): string {
  return joinParts([
    '<div class="callout callout--plain">',
    '<h4>No cash curve in this report</h4>',
    `<p>${escapeHtml(noCashReason(facts))}</p>`,
    '</div>',
  ])
}

/**
 * Punkty trafień dla dymków Figure 2 - JEDYNE dane, jakie dostaje skrypt.
 *
 * Współrzędne i podpisy liczy ten sam `buildScale`, co krzywa, i są już
 * policzone, kiedy trafiają do `<script>`. To jest celowe: skrypt ze swoją
 * kopią skali byłby drugą, niezależną wersją tego samego wykresu - a złoty
 * raport ma tam wpisaną na sztywno tablicę 25 kwot, czyli dokładnie ten
 * rozjazd czekający, aż ktoś poprawi liczby w jednym miejscu.
 *
 * Dokument musi być czytelny BEZ tego skryptu (klienty pocztowe wycinają
 * `<script>` bez pytania), więc dymek nie niesie ani jednej informacji,
 * której nie ma w tabeli kamieni milowych.
 */
export interface CashHit {
  month: number
  x: number
  y: number
  label: string
  note: string
}

export function cashHits(facts: ReportFacts): CashHit[] {
  const cash = facts.cash
  if (cash === undefined) return []
  const points = plottedPoints(cash)
  if (points.length < 2) return []
  const scale = buildScale(points, points[points.length - 1].month)
  return points.map((point) => ({
    month: point.month,
    x: Math.round(scale.x(point.month) * 100) / 100,
    y: Math.round(scale.y(point.cumulative) * 100) / 100,
    label: signedMoney(point.cumulative, facts.company.currency),
    note: point.milestone,
  }))
}

/** Szerokość paska trafień - jeden miesiąc, wyśrodkowany na punkcie. */
export function cashHitWidth(facts: ReportFacts): number {
  const cash = facts.cash
  if (cash === undefined) return 0
  const months = cash.figureMonths ?? cash.horizonMonths
  if (months <= 0) return 0
  return Math.round(((PLOT.x1 - PLOT.x0) / months) * 100) / 100
}

/** Pionowy zakres paska trafień - ten sam, co obszar rysunku. */
export const CASH_PLOT_BOX = Object.freeze({
  top: PLOT.yTop,
  height: PLOT.yBottom - PLOT.yTop,
})

export function renderCashflow(facts: ReportFacts, prose: ReportProse): string {
  if (facts.cash === undefined) return renderNoCashNote(facts)
  return joinParts([
    renderFigureTwo(facts, prose, facts.cash),
    renderMilestoneTable(facts, facts.cash),
  ])
}
