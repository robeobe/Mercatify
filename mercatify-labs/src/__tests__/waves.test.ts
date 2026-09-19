/** @jest-environment node */
/**
 * Fale sekcji 06 - `groupIntoWaves` (`src/report/waves.ts`).
 *
 * Pytanie, na które ten plik odpowiada, jest jedno: czy deterministyczna
 * funkcja układa te same cztery fale, które złoty raport
 * (`fixtures/voltix.golden.html`) ułożył ręcznie.
 *
 * Voltix wchodzi tu DWA razy, bo to są dwa różne pytania:
 *
 *  A. `GOLDEN_MAPPINGS` - werdykty ZE ZŁOTEGO RAPORTU (jego tabela pokrycia,
 *     `facts.coverage.rows`). Testuje REGUŁĘ: przy danych, z których raport
 *     powstał, funkcja ma odtworzyć jego cztery fale.
 *  B. `mapCapabilities` nad `voltix-brief.json` - werdykty z ŻYWEGO KATALOGU.
 *     Testuje DANE: katalog w trzech miejscach mówi dziś co innego niż
 *     zamrożony raport, więc kolejność fal wychodzi inna. To jest rozjazd
 *     DANYCH, nie reguły, i test opisuje go wprost zamiast go ukryć.
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { computeScenario } from '../computeScenario'
import { normalizeBrief } from '../intake/fromBrief'
import { mapCapabilities } from '../mapCapabilities'
import { TARGET_FAMILIES, canonicalToolLabel, groupIntoWaves, type WaveStackRow } from '../report/waves'
import type { MigrationPlanResult } from '../migrationPlanner'
import type { MercatoMappingResult, SaaSCapabilityInput, SaaSProductInput } from '../types'
import reportModel from './fixtures/voltix.reportmodel.json'
import brief from './fixtures/voltix-brief.json'

/** Start programu z sekcji 02 goldena: "one October 2026 start". */
const PROGRAMME_START = '2026-10-01'

/**
 * Stack wprost z fixture'a. `facts.stack.rows` niesie już `termEnds` i
 * `termType`, czyli dokładnie to, czego fale potrzebują od pieniędzy.
 */
const VOLTIX_STACK: WaveStackRow[] = reportModel.facts.stack.rows.map((row) => ({
  tool: row.tool,
  monthly: row.monthly,
  termEnds: row.termEnds,
  termType: row.termType === 'annual' ? 'annual' : 'monthly',
}))

/**
 * A. Mapowania z werdyktami ZŁOTEGO RAPORTU.
 *
 * `source`, `capability` i `decision` są przepisane z `facts.coverage.rows`.
 * `targetFeature` musiało zostać PRZETŁUMACZONE: golden pisze w tej kolumnie
 * prozę ("wms — multi-warehouse stock", "planner + business rules"), a silnik
 * operuje pozycjami `OM_TARGETS`. Tłumaczenie jest 1:1 z prozy goldena na
 * pozycję, którą ta proza nazywa, i dla sześciu z ośmiu wierszy pokrywa się z
 * tym, co dla tych samych narzędzi zwraca `mapCapabilities`.
 *
 * Godziny: złoty raport podaje je tylko NA FALĘ (tabela wdrożenia w sekcji 05:
 * 30 / 55 / 30 / 45) plus jedno zdanie "40 of the 45 hours" przy PandaDocu -
 * z czego wprost wynika 5 h dla Zendeska. Rozbicie 30 h fali 1 na Airtable i
 * Sortly (15 + 15) jest WYMYŚLONE przez ten test; żadna asercja nie patrzy na
 * te dwie liczby osobno, tylko na ich sumę, którą golden podaje.
 */
const GOLDEN_MAPPINGS: MercatoMappingResult[] = [
  {
    source: 'HubSpot Sales',
    capability: 'CRM',
    targetFeature: 'customers + sales',
    decision: 'native',
    confidence: 'high',
    evidence: 'golden coverage row',
    customEffortHours: 55,
  },
  {
    source: 'Airtable',
    capability: 'Ad-hoc registers',
    targetFeature: 'entities — custom entities & fields',
    decision: 'native',
    confidence: 'high',
    evidence: 'golden coverage row',
    customEffortHours: 15,
  },
  {
    source: 'Sortly',
    capability: 'Inventory',
    targetFeature: 'wms',
    decision: 'native',
    confidence: 'high',
    evidence: 'golden coverage row',
    customEffortHours: 15,
  },
  {
    source: 'Jobber',
    capability: 'Field service',
    targetFeature: 'planner — availabilities',
    decision: 'configure',
    confidence: 'medium',
    evidence: 'golden coverage row',
    customEffortHours: 30,
  },
  {
    source: 'Zendesk',
    capability: 'Support',
    targetFeature: 'messages + inbox_ops',
    decision: 'configure',
    confidence: 'medium',
    evidence: 'golden coverage row',
    customEffortHours: 5,
  },
  {
    source: 'PandaDoc',
    capability: 'Quotes',
    targetFeature: 'sales — quotes',
    decision: 'build',
    confidence: 'medium',
    evidence: 'golden coverage row',
    customEffortHours: 40,
  },
  {
    source: 'PandaDoc',
    capability: 'Legally binding signature',
    targetFeature: 'stays external, wired in',
    decision: 'integrate',
    confidence: 'high',
    evidence: 'golden coverage row',
  },
  {
    source: 'Xero',
    capability: 'Accounting',
    targetFeature: 'not our business — keep it',
    decision: 'keep',
    confidence: 'high',
    evidence: 'golden coverage row',
  },
]

/** B. Mapowania z żywego katalogu, liczone z briefu tak, jak robi to przebieg. */
function engineMappings(): MercatoMappingResult[] {
  const normalized = normalizeBrief(brief)
  const stack: SaaSProductInput[] = normalized.tools.map((tool, index) => ({
    id: `t${index}`,
    name: tool.name,
    category: tool.category,
    // `NormalizedBriefTool.monthlyCost` jest od poprawki B2 `number | null`
    // ("nie podano" nie jest zerem), a kontrakt silnika nadal chce liczby -
    // ten sam most, co w `briefToRequest`. Dla briefu Voltixa i tak każda
    // cena jest dodatnia, więc `?? 0` nigdy się tu nie odpala.
    monthlyCost: tool.monthlyCost ?? 0,
  }))
  const caps: SaaSCapabilityInput[] = normalized.tools.flatMap((tool, index) =>
    tool.modules.flatMap((module) =>
      module.caps.map((capability, slot) => ({
        id: `c${index}-${slot}`,
        saasProductId: `t${index}`,
        capability,
        importance: 'core' as const,
        usageDescription: module.desc,
      })),
    ),
  )
  return mapCapabilities(stack, caps)
}

/**
 * Plan migracji dla przebiegu B. Sumy na narzędzie są te z tabeli wdrożenia
 * goldena (HubSpot 55, Jobber 30, Zendesk 5, PandaDoc 40, Airtable + Sortly
 * 30); rozbicie na slugi jest tego testu i żadna asercja nie patrzy na
 * pojedynczy slug.
 */
const ENGINE_PLAN: MigrationPlanResult = {
  summary: 'test plan',
  items: [
    { source: 'HubSpot Sales', capability: 'crm.contacts', estimatedHours: 25, sequence: 1, rationale: '' },
    { source: 'HubSpot Sales', capability: 'crm.pipeline', estimatedHours: 20, sequence: 2, rationale: '' },
    { source: 'HubSpot Sales', capability: 'crm.email', estimatedHours: 10, sequence: 3, rationale: '' },
    { source: 'Zendesk Suite', capability: 'support.tickets', estimatedHours: 3, sequence: 4, rationale: '' },
    { source: 'Zendesk Suite', capability: 'support.sla', estimatedHours: 2, sequence: 5, rationale: '' },
    { source: 'Jobber', capability: 'field.scheduling', estimatedHours: 10, sequence: 6, rationale: '' },
    { source: 'Jobber', capability: 'field.jobsheets', estimatedHours: 20, sequence: 7, rationale: '' },
    { source: 'Airtable', capability: 'data.custom', estimatedHours: 15, sequence: 8, rationale: '' },
    { source: 'PandaDoc', capability: 'quotes.cpq', estimatedHours: 40, sequence: 9, rationale: '' },
    { source: 'PandaDoc', capability: 'docs.templates', estimatedHours: 0, sequence: 10, rationale: '' },
    { source: 'Sortly', capability: 'inventory.stock', estimatedHours: 5, sequence: 11, rationale: '' },
    { source: 'Sortly', capability: 'inventory.multiwarehouse', estimatedHours: 5, sequence: 12, rationale: '' },
    { source: 'Sortly', capability: 'inventory.barcode', estimatedHours: 5, sequence: 13, rationale: '' },
  ],
}

const mapping = (over: Partial<MercatoMappingResult> & Pick<MercatoMappingResult, 'source' | 'capability' | 'targetFeature' | 'decision'>): MercatoMappingResult => ({
  confidence: 'medium',
  evidence: 'test',
  ...over,
})

const stackRow = (over: Partial<WaveStackRow> & Pick<WaveStackRow, 'tool'>): WaveStackRow => ({
  monthly: 100,
  termEnds: '',
  termType: 'monthly',
  ...over,
})

describe('groupIntoWaves - cztery fale złotego raportu', () => {
  const waves = groupIntoWaves({
    mappings: GOLDEN_MAPPINGS,
    stack: VOLTIX_STACK,
    programmeStart: PROGRAMME_START,
  })
  const golden = reportModel.facts.waves

  it('układa dokładnie cztery fale', () => {
    expect(waves).toHaveLength(golden.length)
  })

  it('odtwarza kolejność i tytuły fal', () => {
    expect(waves.map((wave) => [wave.n, wave.title])).toEqual([
      [1, 'Registers and stock'],
      [2, 'CRM cut-over'],
      [3, 'Field service'],
      [4, 'Support and quoting'],
    ])
    expect(waves.map((wave) => wave.title)).toEqual(golden.map((wave) => wave.title))
  })

  it('gasi te same narzędzia w tych samych falach', () => {
    expect(waves.map((wave) => wave.toolsOff)).toEqual(golden.map((wave) => wave.toolsOff))
    expect(waves.map((wave) => wave.toolsReduced)).toEqual(golden.map((wave) => wave.toolsReduced))
  })

  it('sumuje te same godziny co tabela wdrożenia goldena', () => {
    expect(waves.map((wave) => wave.hours)).toEqual([30, 55, 30, 45])
    expect(waves.map((wave) => wave.hours)).toEqual(golden.map((wave) => wave.hours))
    expect(waves.every((wave) => wave.hoursAreFloor === false)).toBe(true)
  })

  it('bankuje te same kwoty od tych samych miesięcy', () => {
    expect(waves.map((wave) => wave.monthlyBanked)).toEqual([389, 890, 349, 415])
    expect(waves.map((wave) => wave.monthlyBanked)).toEqual(golden.map((wave) => wave.monthlyBanked))
    expect(waves.map((wave) => wave.bankedFromMonth)).toEqual([2, 4, 5, 7])
    expect(waves.map((wave) => wave.bankedFromMonth)).toEqual(golden.map((wave) => wave.bankedFromMonth))
  })

  /**
   * ŚWIADOME ODSTĘPSTWO 1 - tygodnie fal 2 i 3.
   *
   * Golden: 1-4 / 5-10 / 11-16 / 17-22. Funkcja: 1-4 / 5-12 / 13-16 / 17-22.
   *
   * Rozjazd jest nieusuwalny przy JAKIEJKOLWIEK stałej przepustowości, bo w
   * goldenie fala 1 i fala 3 mają te same 30 h, a trwają 4 i 6 tygodni. Te
   * dwa tygodnie różnicy to tydzień pracy równoległej przed odcięciem Jobbera
   * ("Crews run one full week on both systems") - fakt harmonogramu, nie
   * pracochłonności. Dobranie stałej pod ten wynik byłoby naginaniem; przy
   * 7,5 h/tydzień zgadza się to, co z godzin WYNIKA: długość programu
   * (22 tygodnie), fala 1, koniec fali 4 i wszystkie cztery `bankedFromMonth`,
   * czyli wszystko, co widzi Figure 2 i tabela pieniędzy.
   */
  it('odstępstwo: tygodnie fal 2 i 3 różnią się od goldena, program trwa tyle samo', () => {
    expect(waves.map((wave) => [wave.weekFrom, wave.weekTo])).toEqual([
      [1, 4],
      [5, 12],
      [13, 16],
      [17, 22],
    ])
    const goldenSpans = golden.map((wave) => [wave.weekFrom, wave.weekTo])
    expect(goldenSpans).toEqual([
      [1, 4],
      [5, 10],
      [11, 16],
      [17, 22],
    ])
    // Program trwa tyle samo tygodni co w goldenie i jest ciągły - nie ma
    // dziur między falami ani fali zerowej długości.
    expect(waves[waves.length - 1].weekTo).toBe(golden[golden.length - 1].weekTo)
    expect(waves[0].weekFrom).toBe(1)
    for (let i = 1; i < waves.length; i += 1) {
      expect(waves[i].weekFrom).toBe(waves[i - 1].weekTo + 1)
      expect(waves[i].weekTo).toBeGreaterThanOrEqual(waves[i].weekFrom)
    }
  })

  /**
   * ŚWIADOME ODSTĘPSTWO 2 - ziarno `scope`.
   *
   * Golden opisuje zakres fali ETYKIETAMI MODUŁÓW z briefu ("CRM",
   * "Inventory"), bo tak czyta się go człowiekowi. `WaveScopeItem` obiecuje w
   * `model.ts`, że każda pozycja wskazuje REALNE mapowanie, więc niesie to,
   * co niesie mapowanie. Tu obie strony zgadzają się co do wiersza, bo
   * `GOLDEN_MAPPINGS` są przepisane z tabeli pokrycia goldena; przy wejściu z
   * żywego silnika (opis niżej) ziarno jest drobniejsze.
   */
  it('zakres każdej fali wskazuje realne mapowania', () => {
    expect(waves.map((wave) => wave.scope.map((item) => `${item.source}::${item.capability}`))).toEqual([
      ['Airtable::Ad-hoc registers', 'Sortly::Inventory'],
      ['HubSpot Sales::CRM'],
      ['Jobber::Field service'],
      ['Zendesk::Support', 'PandaDoc::Quotes', 'PandaDoc::Legally binding signature'],
    ])
    for (const wave of waves) {
      for (const item of wave.scope) {
        expect(
          GOLDEN_MAPPINGS.some((m) => m.source === item.source && m.capability === item.capability),
        ).toBe(true)
      }
    }
  })

  it('PandaDoc ma jeden integrate, więc nie gaśnie - schodzi na tańszy plan', () => {
    const wave = waves[3]
    expect(wave.toolsOff).not.toContain('PandaDoc')
    expect(wave.toolsReduced).toEqual(['PandaDoc'])
    // Kwota fali 4 to sam Zendesk: subskrypcji PandaDoca nikt nie anuluje.
    expect(wave.monthlyBanked).toBe(415)
  })

  it('Xero jest keep, więc nie ma go w ŻADNEJ fali', () => {
    for (const wave of waves) {
      expect(wave.toolsOff).not.toContain('Xero')
      expect(wave.toolsReduced).not.toContain('Xero')
      expect(wave.scope.map((item) => item.source)).not.toContain('Xero')
    }
  })

  /**
   * Termin HubSpota (28.02.2027) jest SUFITEM, nie kluczem sortowania - fala
   * CRM stoi druga i kończy się z zapasem, dokładnie jak tłumaczy to ustalenie
   * 1.4 goldena ("the point of sequencing it second rather than first").
   */
  it('umowa roczna HubSpota nie przestawia kolejności, bo termin jest dotrzymany', () => {
    const crm = waves[1]
    expect(crm.toolsOff).toEqual(['HubSpot'])
    const ends = Date.UTC(2026, 9, 1) + crm.weekTo * 7 * 24 * 60 * 60 * 1000
    expect(ends).toBeLessThan(Date.UTC(2027, 1, 28))
  })

  it('reguła "narzędzie gaśnie" daje ten sam wynik co computeScenario', () => {
    const scenario = computeScenario(
      GOLDEN_MAPPINGS,
      GOLDEN_MAPPINGS.map((m) => ({ id: m.source, name: m.source, category: '', monthlyCost: 0 })),
      { omOperatingCost: 0, implementationCost: 0 },
    )
    expect([...new Set(scenario.removedSaaS.map(canonicalToolLabel))].sort()).toEqual(
      waves.flatMap((wave) => wave.toolsOff).sort(),
    )
    expect(scenario.retainedSaaS.map(canonicalToolLabel)).toContain('Xero')
    expect(scenario.retainedSaaS.map(canonicalToolLabel)).toContain('PandaDoc')
  })
})

describe('groupIntoWaves - te same dane przez żywy katalog', () => {
  const waves = groupIntoWaves({
    mappings: engineMappings(),
    plan: ENGINE_PLAN,
    stack: VOLTIX_STACK,
    programmeStart: PROGRAMME_START,
  })

  it('grupuje narzędzia w te same cztery rodziny co golden', () => {
    expect(waves.map((wave) => wave.toolsOff.concat(wave.toolsReduced)).map((tools) => tools.sort())).toEqual(
      expect.arrayContaining([
        ['Airtable', 'Sortly'],
        ['HubSpot'],
        ['Jobber'],
        ['PandaDoc', 'Zendesk'],
      ]),
    )
    expect(waves).toHaveLength(4)
  })

  it('Jobber zostaje przy serwisie, choć jego arkusze robocze celują w encje własne', () => {
    // `field.jobsheets` -> `entities — custom entities & fields`, czyli w TEN
    // SAM cel co rejestry Airtable'a. Gdyby mechanizm platformy liczył się jak
    // domena, Jobber wpadłby do fali rejestrów, a fala "Field service"
    // zniknęłaby z raportu.
    const fieldService = waves.find((wave) => wave.title === 'Field service')
    expect(fieldService?.toolsOff).toEqual(['Jobber'])
    expect(fieldService?.scope.map((item) => item.capability).sort()).toEqual([
      'field.jobsheets',
      'field.scheduling',
    ])
    const registers = waves.find((wave) => wave.title === 'Registers and stock')
    expect(registers?.scope.map((item) => item.source)).not.toContain('Jobber')
  })

  /**
   * ŚWIADOME ODSTĘPSTWO 3 - kolejność fal na danych z żywego katalogu.
   *
   * Golden: rejestry, CRM, serwis, wsparcie. Tutaj: CRM, rejestry, wsparcie,
   * serwis. Rozjeżdżają się DANE, nie reguła - katalog w trzech miejscach
   * mówi dziś co innego niż zamrożony raport:
   *
   *   1. `Sortly.inventory.barcode` = `configure` (golden: cały Sortly
   *      `native`) -> fala rejestrów przestaje być falą samych `native`,
   *   2. `Jobber.field.jobsheets` = `build` (golden: cały Jobber
   *      `configure`) -> fala serwisu wskakuje na koniec.
   *
   * Punkt 3 - `PandaDoc.quotes.cpq` = `native`, gdy golden mówi `build`, 40 h,
   * "the only net-new module" - ZOSTAŁ ROZSTRZYGNIĘTY przez właściciela
   * produktu 2026-09-19 na korzyść raportu: Open Mercato nie ma konfiguratora
   * ofert, więc `quotes.cpq` jest `build` we wszystkich pięciu narzędziach,
   * które ją niosą. Skutek widać tutaj: fala "Support and quoting" niesie
   * odtąd jedyny `build` w stacku, staje się najbardziej ryzykowna i ląduje na
   * końcu - dokładnie tam, gdzie stawia ją golden. Rozbieżności zostały dwie
   * zamiast trzech, obie o granulacji, nie o treści.
   *
   * Zostająca różnica wobec goldena to kolejność DWÓCH PIERWSZYCH fal.
   * Wynika wprost z punktu 1: `Sortly.inventory.barcode` = `configure` podnosi
   * rangę ryzyka rejestrów powyżej CRM-u, który jest w całości `native`. Golden
   * agreguje Sortly do jednego wiersza `native` i dlatego stawia rejestry
   * pierwsze. Ta asercja istnieje po to, żeby rozjazd był WIDOCZNY, a nie po
   * to, żeby go zalegalizować.
   */
  it('odstępstwo: katalog daje inne werdykty niż golden, więc i inną kolejność', () => {
    expect(waves.map((wave) => wave.title)).toEqual([
      'CRM cut-over',
      'Registers and stock',
      'Field service',
      'Support and quoting',
    ])
    const engine = engineMappings()
    const decisionOf = (source: string, capability: string) =>
      engine.find((m) => m.source === source && m.capability === capability)?.decision
    expect(decisionOf('Sortly', 'inventory.barcode')).toBe('configure')
    expect(decisionOf('Jobber', 'field.jobsheets')).toBe('build')
    // Rozstrzygnięte 2026-09-19 na korzyść raportu: platforma nie ma
    // konfiguratora ofert, więc to `build`. Asercja pilnuje teraz ZGODNOŚCI
    // z goldenem, nie rozbieżności - gdyby ktoś cofnął katalog do `native`,
    // fala wsparcia znów przestałaby być najbardziej ryzykowna i zsunęłaby się
    // z ostatniego miejsca.
    expect(decisionOf('PandaDoc', 'quotes.cpq')).toBe('build')
  })

  it('mimo innej kolejności bankuje te same kwoty przy tych samych narzędziach', () => {
    const banked = new Map(waves.map((wave) => [wave.title, wave.monthlyBanked]))
    expect(banked.get('Registers and stock')).toBe(389)
    expect(banked.get('CRM cut-over')).toBe(890)
    expect(banked.get('Field service')).toBe(349)
    expect(banked.get('Support and quoting')).toBe(415)
  })
})

describe('groupIntoWaves - reguły brzegowe', () => {
  it('zero mapowań to zero fal, bez wyjątku', () => {
    expect(groupIntoWaves({ mappings: [], stack: [] })).toEqual([])
    expect(groupIntoWaves({ mappings: [], stack: VOLTIX_STACK, programmeStart: PROGRAMME_START })).toEqual([])
  })

  it('S8: same wiersze keep to też zero fal - nie ma czego robić', () => {
    const waves = groupIntoWaves({
      mappings: [
        mapping({
          source: 'Xero',
          capability: 'accounting.ledger',
          targetFeature: 'not our business — keep it',
          decision: 'keep',
        }),
      ],
      stack: [stackRow({ tool: 'Xero', monthly: 78 })],
    })
    expect(waves).toEqual([])
  })

  it('S9: wiersz build bez estymaty stawia hoursAreFloor, a godziny zostają dolną granicą', () => {
    const waves = groupIntoWaves({
      mappings: [
        mapping({ source: 'Alpha', capability: 'a', targetFeature: 'wms', decision: 'native', customEffortHours: 8 }),
        mapping({ source: 'Alpha', capability: 'b', targetFeature: 'wms', decision: 'build' }),
      ],
      stack: [stackRow({ tool: 'Alpha' })],
    })
    expect(waves).toHaveLength(1)
    expect(waves[0].hoursAreFloor).toBe(true)
    // 8, nie 48: domyślnych 40 h dla builda bez estymaty NIE podstawiamy.
    expect(waves[0].hours).toBe(8)
    expect(waves[0].scope.map((item) => item.estimatedHours)).toEqual([8, null])
  })

  it('wiersz build Z estymatą nie stawia hoursAreFloor', () => {
    const waves = groupIntoWaves({
      mappings: [
        mapping({ source: 'Alpha', capability: 'b', targetFeature: 'wms', decision: 'build', customEffortHours: 12 }),
      ],
      stack: [stackRow({ tool: 'Alpha' })],
    })
    expect(waves[0].hoursAreFloor).toBe(false)
    expect(waves[0].hours).toBe(12)
  })

  it('cel spoza mapy rodzin dostaje WŁASNĄ falę, nie cichy przydział do cudzej', () => {
    const waves = groupIntoWaves({
      mappings: [
        mapping({ source: 'Known', capability: 'stock', targetFeature: 'wms', decision: 'native', customEffortHours: 5 }),
        mapping({
          source: 'Stranger',
          capability: 'panel_layout',
          targetFeature: 'TBD — needs discovery',
          decision: 'build',
          customEffortHours: 5,
        }),
      ],
      stack: [stackRow({ tool: 'Known' }), stackRow({ tool: 'Stranger' })],
    })
    expect(waves).toHaveLength(2)
    const stranger = waves.find((wave) => wave.toolsOff.includes('Stranger'))
    expect(stranger?.title).toBe('TBD — needs discovery')
    expect(stranger?.toolsOff).toEqual(['Stranger'])
    const known = waves.find((wave) => wave.toolsOff.includes('Known'))
    expect(known?.title).toBe('Registers and stock')
    expect(known?.toolsOff).toEqual(['Known'])
  })

  it('dwa nieznane cele to dwie osobne fale - nieznane nie zlepia się z nieznanym', () => {
    const waves = groupIntoWaves({
      mappings: [
        mapping({ source: 'A', capability: 'x', targetFeature: 'TBD — one', decision: 'build', customEffortHours: 1 }),
        mapping({ source: 'B', capability: 'y', targetFeature: 'TBD — two', decision: 'build', customEffortHours: 1 }),
      ],
      stack: [stackRow({ tool: 'A' }), stackRow({ tool: 'B' })],
    })
    expect(waves.map((wave) => wave.title).sort()).toEqual(['TBD — one', 'TBD — two'])
  })

  it('kwota jest null, a nie połową prawdy, gdy gasnące narzędzie nie ma ceny', () => {
    const waves = groupIntoWaves({
      mappings: [
        mapping({ source: 'Paid', capability: 'a', targetFeature: 'wms', decision: 'native', customEffortHours: 2 }),
        mapping({ source: 'Free', capability: 'b', targetFeature: 'wms', decision: 'native', customEffortHours: 2 }),
      ],
      stack: [stackRow({ tool: 'Paid', monthly: 100 }), stackRow({ tool: 'Free', monthly: null })],
    })
    expect(waves).toHaveLength(1)
    expect(waves[0].monthlyBanked).toBeNull()
  })

  it('narzędzia spoza stacku nie wymyślają kwoty', () => {
    const waves = groupIntoWaves({
      mappings: [mapping({ source: 'Ghost', capability: 'a', targetFeature: 'wms', decision: 'native' })],
      stack: [],
    })
    expect(waves[0].toolsOff).toEqual(['Ghost'])
    expect(waves[0].monthlyBanked).toBeNull()
  })
})

describe('S15: groupIntoWaves - umowa roczna wymusza termin', () => {
  const annualCase = (programmeStart?: string) =>
    groupIntoWaves({
      mappings: [
        mapping({ source: 'Calm', capability: 'a', targetFeature: 'customers', decision: 'native', customEffortHours: 10 }),
        mapping({ source: 'Locked', capability: 'b', targetFeature: 'wms', decision: 'build', customEffortHours: 10 }),
      ],
      stack: [
        stackRow({ tool: 'Calm' }),
        stackRow({ tool: 'Locked', termEnds: '2026-10-10', termType: 'annual' }),
      ],
      weeklyHours: 10,
      ...(programmeStart === undefined ? {} : { programmeStart }),
    })

  it('samo ryzyko stawia build na końcu', () => {
    expect(annualCase().map((wave) => wave.toolsOff)).toEqual([['Calm'], ['Locked']])
  })

  it('termin, którego ryzyko by nie dotrzymało, przesuwa falę do przodu', () => {
    const waves = annualCase('2026-10-01')
    expect(waves.map((wave) => wave.toolsOff)).toEqual([['Locked'], ['Calm']])
    const ends = Date.UTC(2026, 9, 1) + waves[0].weekTo * 7 * 24 * 60 * 60 * 1000
    expect(ends).toBeLessThanOrEqual(Date.UTC(2026, 9, 10))
  })

  it('bez daty startu nie ma kalendarza, więc termin nie ma czego wymusić', () => {
    expect(annualCase(undefined).map((wave) => wave.title)).toEqual(['CRM cut-over', 'Registers and stock'])
  })

  it('termin, którego nie da się dotrzymać, nie zapętla planowania', () => {
    const waves = annualCase('2026-01-01')
    expect(waves).toHaveLength(2)
    expect(waves.map((wave) => wave.n)).toEqual([1, 2])
  })
})

describe('groupIntoWaves - bramy wejściowe', () => {
  it('odrzuca dwa wiersze stacku sprowadzające się do jednego narzędzia', () => {
    expect(() =>
      groupIntoWaves({
        mappings: [mapping({ source: 'HubSpot', capability: 'a', targetFeature: 'customers', decision: 'native' })],
        stack: [stackRow({ tool: 'HubSpot' }), stackRow({ tool: 'HubSpot Sales' })],
      }),
    ).toThrow(/banked twice/)
  })

  it('odrzuca NaN w godzinach, zamiast zatruć sumę fali', () => {
    expect(() =>
      groupIntoWaves({
        mappings: [
          mapping({
            source: 'A',
            capability: 'a',
            targetFeature: 'wms',
            decision: 'build',
            customEffortHours: Number.NaN,
          }),
        ],
        stack: [],
      }),
    ).toThrow(/customEffortHours/)
  })

  it('odrzuca datę, która wygląda jak data, ale nie istnieje', () => {
    expect(() =>
      groupIntoWaves({
        mappings: [mapping({ source: 'A', capability: 'a', targetFeature: 'wms', decision: 'native' })],
        stack: [stackRow({ tool: 'A', termEnds: '2026-02-30', termType: 'annual' })],
      }),
    ).toThrow(/not a real calendar date/)
  })

  it('odrzuca zerową przepustowość, zamiast dzielić przez zero', () => {
    expect(() =>
      groupIntoWaves({
        mappings: [mapping({ source: 'A', capability: 'a', targetFeature: 'wms', decision: 'native' })],
        stack: [],
        weeklyHours: 0,
      }),
    ).toThrow(/weeklyHours/)
  })
})

describe('TARGET_FAMILIES', () => {
  /**
   * Ta sama droga do `OM_TARGETS` co w `catalogIntegrity.test.ts`: przez
   * generator, żeby test i generator czytały ten sam plik jednym kodem.
   */
  function loadOmTargets(): string[] {
    const generator = resolve(__dirname, '../../scripts/generate-browser-catalog.mjs')
    const raw: unknown = JSON.parse(
      execFileSync(process.execPath, [generator, '--vocabulary'], { encoding: 'utf8' }),
    )
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error('--vocabulary nie oddał obiektu')
    }
    const targets = Object.hasOwn(raw, 'omTargets') ? Reflect.get(raw, 'omTargets') : undefined
    if (!Array.isArray(targets)) throw new Error('--vocabulary: omTargets nie jest tablicą')
    return targets.filter((target): target is string => typeof target === 'string')
  }

  it('każda pozycja OM_TARGETS ma przypisaną rodzinę', () => {
    const missing = loadOmTargets().filter((target) => !Object.hasOwn(TARGET_FAMILIES, target))
    expect(missing).toEqual([])
  })

  it('nie ma rodziny dla celu, którego OM_TARGETS nie zna', () => {
    const known = new Set(loadOmTargets())
    expect(Object.keys(TARGET_FAMILIES).filter((target) => !known.has(target))).toEqual([])
  })

  it('tablica jest zamrożona - rodzina nie dopisuje się w czasie działania', () => {
    expect(Object.isFrozen(TARGET_FAMILIES)).toBe(true)
  })
})
