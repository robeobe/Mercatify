import { count, money } from '../format'
import type { ReportFacts, ReportProse } from '../model'
import {
  countedNoun,
  escapeHtml,
  floorMoney,
  hoursWithUnit,
  joinParts,
  numeralWord,
  sectionHead,
  signedMoney,
} from './shared'

/**
 * Sześć kafelków "At a glance" i callout z rekomendacją.
 *
 * Kafelki są BUDOWANE JAKO LISTA, a nie sześcioma sztywnymi blokami, bo
 * połowa z nich mówi o pieniądzach, a scenariusz "klient nie podał kosztów"
 * (S2, `ReportKpis`) musi dać dokument, nie dziurę. Kafelek bez wartości
 * ZNIKA; nie drukuje się jako `—/mo`, bo kreska w miejscu kwoty czyta się jak
 * "zero", a to jest nieprawda o darmowym stacku.
 *
 * Dwa kafelki mają wersję zastępczą zamiast zniknięcia - "Licences today" i
 * "One-off implementation" - bo niosą też liczby NIEPIENIĘŻNE (narzędzia,
 * stanowiska, godziny), które istnieją zawsze i są tym, co zostaje z raportu
 * bez kosztów.
 */
interface Tile {
  key: string
  value: string
  /** Mała jednostka wewnątrz wartości, np. `/mo`. Pusty string - brak. */
  unit: string
  note: string
  lead: boolean
}

function renderTile(tile: Tile): string {
  const unit = tile.unit.length === 0 ? '' : `<small>${escapeHtml(tile.unit)}</small>`
  return joinParts([
    `<div class="kpi${tile.lead ? ' kpi--lead' : ''}">`,
    `<span class="kpi__k">${escapeHtml(tile.key)}</span>`,
    `<span class="kpi__v">${escapeHtml(tile.value)}${unit}</span>`,
    `<span class="kpi__n">${escapeHtml(tile.note)}</span>`,
    '</div>',
  ])
}

/** Notka z kilku członów; puste znikają, żeby nie zostawić wiszącego " · ". */
function note(parts: readonly string[]): string {
  return parts.filter((part) => part.length > 0).join(' · ')
}

/** "7 tools · 34 seats" - część notki, która nie zależy od kosztów. */
function stackShape(facts: ReportFacts): string {
  const tools = countedNoun(facts.kpis.toolCount, 'tool')
  if (facts.kpis.seatCount === null) return tools
  return note([tools, countedNoun(facts.kpis.seatCount, 'seat')])
}

function licencesTodayTile(facts: ReportFacts): Tile {
  const { kpis, company } = facts
  if (kpis.licencesTodayMonthly === null) {
    return {
      key: 'Stack today',
      value: count(kpis.toolCount),
      unit: kpis.toolCount === 1 ? ' tool' : ' tools',
      note: note([stackShape(facts), 'no costs were supplied']),
      lead: false,
    }
  }
  return {
    key: 'Licences today',
    value: money(kpis.licencesTodayMonthly, company.currency),
    unit: '/mo',
    note: note([stackShape(facts), `${money(kpis.licencesTodayAnnual, company.currency)} a year`]),
    lead: false,
  }
}

/**
 * Kafelek wdrożenia. Obie wartości - godziny i kwota - idą przez funkcje, które
 * znają `hoursAreFloor`, i to jest cała poprawka B3 w tym miejscu.
 *
 * Wcześniej kwota szła przez samo `money()`, więc przebieg bez planu migracji
 * drukował tu `One-off implementation $0` z notką `to estimate h at $120/h` -
 * kafelek mówił dwie sprzeczne rzeczy naraz, a czytelnik brał tę z większą
 * czcionką. Zero razy stawka to nie jest darmowe wdrożenie, tylko wdrożenie
 * niewycenione.
 *
 * `programmeWeeks` bywa `null` (brak fal) i wtedy człon o tygodniach po prostu
 * znika. Kafelek bez długości programu jest krótszy; kafelek z "0 weeks"
 * byłby nieprawdziwy.
 */
function implementationTile(facts: ReportFacts): Tile {
  const { kpis, money: table, company } = facts
  const hours = hoursWithUnit(kpis.implementationHours, kpis.implementationHoursAreFloor)
  const weeks = kpis.programmeWeeks === null ? '' : countedNoun(kpis.programmeWeeks, 'week')
  if (kpis.implementationCost === null) {
    return {
      key: 'Implementation effort',
      value: hours,
      unit: '',
      note: note([weeks, 'no rate was supplied']),
      lead: false,
    }
  }
  const rate = table.rate === null ? '' : ` at ${money(table.rate, company.currency)}/h`
  return {
    key: 'One-off implementation',
    value: floorMoney(kpis.implementationCost, kpis.implementationHoursAreFloor, company.currency),
    unit: '',
    note: note([`${hours}${rate}`, weeks]),
    lead: false,
  }
}

/**
 * Trzy kształty zwrotu z `assets/README.md`: nie ma czego zwracać, zwraca się
 * w miesiącu N, albo nie zwraca się w horyzoncie. Trzeci przypadek drukuje
 * horyzont, żeby czytelnik wiedział, JAK DŁUGO patrzyliśmy - "nie zwraca się"
 * bez okresu jest twierdzeniem, którego nie da się sprawdzić.
 */
function breakEvenTile(facts: ReportFacts): Tile {
  const { kpis } = facts
  if (kpis.breakEvenMonth === null) {
    return {
      key: 'Break-even',
      value: 'None',
      unit: '',
      note: `Not reached within ${countedNoun(kpis.horizonMonths, 'month')}`,
      lead: false,
    }
  }
  return {
    key: 'Break-even',
    value: `Month ${count(kpis.breakEvenMonth)}`,
    unit: '',
    note: 'Cumulative position turns positive',
    lead: false,
  }
}

function tilesFor(facts: ReportFacts): Tile[] {
  const { kpis, company } = facts
  const tiles: Tile[] = [licencesTodayTile(facts)]

  if (kpis.licencesAfterMonthly !== null) {
    tiles.push({
      key: 'Licences after',
      value: money(kpis.licencesAfterMonthly, company.currency),
      unit: '/mo',
      note: kpis.licencesAfterNote,
      lead: false,
    })
  }
  if (kpis.netRecurringAnnual !== null) {
    const hosting =
      kpis.hostingMonthly === null
        ? 'Recurring licences only'
        : `After ${money(kpis.hostingMonthly, company.currency)}/mo hosting and support`
    tiles.push({
      key: 'Net recurring saving',
      value: money(kpis.netRecurringAnnual, company.currency),
      unit: '/yr',
      note: hosting,
      lead: true,
    })
  }
  tiles.push(implementationTile(facts))
  if (facts.cash !== undefined) tiles.push(breakEvenTile(facts))
  if (kpis.netAtHorizon !== null) {
    tiles.push({
      key: `${count(kpis.horizonMonths)}-month net`,
      value: signedMoney(kpis.netAtHorizon, company.currency),
      unit: '',
      note: 'All one-off and recurring costs included',
      lead: false,
    })
  }
  return tiles
}

/**
 * Scenariusz S8 planu: przebieg, w którym nic nie gaśnie.
 *
 * "Zero oszczędności" jest POPRAWNYM wynikiem doradztwa i musi paść zdaniem, a
 * nie samym brakiem kafelka: dokument, z którego zniknęły wszystkie liczby
 * pieniężne i który o tym milczy, czyta się jak raport, któremu coś się nie
 * policzyło.
 *
 * Brama wymaga, żeby fale ISTNIAŁY. Pusta lista fal nie znaczy "nic nie gaśnie"
 * - znaczy "nikt nie liczył sekwencji", a tak właśnie wygląda każdy model z
 * przeglądarkowego adaptera (`assets/shared/report-model.js` ustawia
 * `waves: []` bezwarunkowo). Twierdzenie o stosie postawione na cudzym braku
 * danych byłoby dokładnie tym błędem, który ten przegląd usuwa.
 */
function nothingGoesOff(facts: ReportFacts): boolean {
  return facts.waves.length > 0 && facts.waves.every((wave) => wave.toolsOff.length === 0)
}

function calloutBlock(heading: string, body: string): string {
  return joinParts([
    '<div class="callout callout--plain">',
    `<h4>${escapeHtml(heading)}</h4>`,
    `<p>${escapeHtml(body)}</p>`,
    '</div>',
  ])
}

export function renderKpis(facts: ReportFacts, prose: ReportProse): string {
  const tiles = tilesFor(facts)
  const everyToolStays = nothingGoesOff(facts)
    ? calloutBlock(
        'Every tool in your stack earns its place',
        'Nothing in this stack is switched off by this programme. What changes is how the ' +
          'tools are wired together, not what you pay for them.',
      )
    : ''
  const callout =
    prose.recommendation === undefined
      ? ''
      : joinParts([
          '<div class="callout">',
          '<h4>The recommendation in one sentence</h4>',
          `<p>${escapeHtml(prose.recommendation)}</p>`,
          '</div>',
        ])
  return joinParts([
    '<section class="pad band no-break">',
    sectionHead('At a glance', `The ${numeralWord(tiles.length)} numbers this report is about`),
    '<div class="kpis">',
    ...tiles.map(renderTile),
    '</div>',
    everyToolStays,
    callout,
    '</section>',
  ])
}
