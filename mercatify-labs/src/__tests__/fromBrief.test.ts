/** @jest-environment node */
/**
 * Brief klienta -> `ConsolidationRequest` -> `Orchestrator` -> liczniki.
 *
 * Testu tej drogi nie było i dlatego istniał bloker: `getCatalogTool` szukał
 * po nazwie DOSŁOWNEJ, a brief Voltixa mówi `HubSpot Sales`, `Zendesk Suite`,
 * `Jobber`, `Sortly`, `Xero`, podczas gdy scalony katalog niesie `HubSpot`,
 * `Zendesk`, `Jobber / ServiceTitan`, `Sortly / inFlow`, `Xero / QuickBooks`.
 * Pięć z siedmiu narzędzi wypadało poza katalog NA SAMEJ NAZWIE - razem z
 * każdą swoją zdolnością, choć wszystkie są w katalogu. Każdy element z
 * osobna miał testy; nie miała ich dopiero ich składanka.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { briefToRequest, normalizeBrief } from '../intake/fromBrief'
import { buildToolAliases, MANUAL_TOOL_ALIASES, TOOL_ALIASES } from '../catalogToolAliases'
import { getCatalogTool, listCatalogToolNames } from '../catalog'
import { Orchestrator } from '../orchestrator'
import { deriveStatementCounts } from '../report/counts'

const FIXTURES = resolve(__dirname, 'fixtures')

/**
 * Czytamy z dysku przez `JSON.parse`, a nie przez `import`: brama ma dostać
 * `unknown`, tak jak dostaje go od klienta. `import` dałby jej typ, którego w
 * produkcji nikt nie gwarantuje, i test sprawdzałby własne założenie.
 */
function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8'))
}

const brief = readFixture('voltix-brief.json')
const golden = readFixture('voltix.reportmodel.json')

/** Ścieżka do pola golden mastera - bez `as`, z błędem nazywającym pole. */
function goldenField(path: string): unknown {
  let current: unknown = golden
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, key)) {
      throw new Error(`voltix.reportmodel.json: brak pola ${path}`)
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/** Koszty są wejściem konsultanta, nie klienta - w briefie ich nie ma. */
const COSTS = { omOperatingCost: 18_000, implementationCost: 42_000 }

describe('brief Voltixa przez cały silnik', () => {
  it('rozwiązuje w katalogu KAŻDĄ nazwę narzędzia z briefu', () => {
    const names = normalizeBrief(brief).tools.map((tool) => tool.name)
    expect(names).toEqual(['HubSpot Sales', 'Zendesk Suite', 'Jobber', 'Airtable', 'PandaDoc', 'Sortly', 'Xero'])

    const unresolved = names.filter((name) => getCatalogTool(name) === undefined)
    expect(unresolved).toEqual([])
  })

  it('nie zostawia ani jednego mapowania poza katalogiem', async () => {
    const result = await new Orchestrator().run(briefToRequest(brief, COSTS))
    const offCatalog = result.mappings
      .filter((mapping) => mapping.evidence === 'not in catalog')
      .map((mapping) => `${mapping.source}.${mapping.capability}`)

    // To jest oracle tego blokera. Przed naprawą wypadało tu 11 z 15 pozycji,
    // wszystkie z powodu nazwy narzędzia, nie zdolności.
    expect(offCatalog).toEqual([])
  })

  /**
   * LICZNIKI: 15/15/0, nie 38/34/4 z golden mastera - i to NIE jest usterka
   * silnika ani naginanie fixture'a.
   *
   * Golden (sekcja 02, `facts.basis.counts`) mówi: "38 usage statements were
   * extracted from the above. 34 matched a catalog capability; 4 did not and
   * are carried openly into Appendix B". "The above" to `basis.readWhat`:
   * 62-minutowa rozmowa, siedem faktur i trzy sesje screen-share. To jest
   * materiał z rozpoznania, a nie `tools[]` z briefu.
   *
   * Brief niesie 15 slugów w 8 modułach 7 narzędzi. Dwie rzeczy rozchodzą się
   * jednocześnie i żadnej nie da się naprawić nazwami narzędzi:
   *
   *  1. GRANULACJA. 38 wypowiedzi agreguje się w golden masterze do 8 wierszy
   *    tabeli pokrycia - dokładnie tylu, ile brief ma modułów (asercja niżej).
   *    Brief zapisuje jeden slug na pracę, nie jedną wypowiedź klienta.
   *  2. ŹRÓDŁA. Cztery pozycje poza katalogiem to Appendix B: Aurora Solar,
   *    dwa portale operatorów, arkusze na dotacje i Gusto. Żadnego z tych
   *    czterech narzędzi nie ma w `tools[]`, więc żaden przebieg z tego pliku
   *    nie ma prawa ich wyprodukować. Wyprodukowanie ich wymagałoby
   *    zmyślenia narzędzi, których klient nie zgłosił.
   *
   * Liczba jest tu PRZYPIĘTA, żeby zmiana silnika albo briefu zapaliła się na
   * czerwono. Gdy brief zostanie uzupełniony o pełne rozpoznanie (pozostałe
   * wypowiedzi plus cztery źródła z Appendix B), ten test ma pójść na 38/34/4
   * świadomą ręką - nie przez poluzowanie asercji.
   */
  it('liczy 15 wypowiedzi z briefu - golden master opisuje 38 z szerszego rozpoznania', async () => {
    const result = await new Orchestrator().run(briefToRequest(brief, COSTS))
    expect(deriveStatementCounts(result.mappings)).toEqual({ statements: 15, matched: 15, offCatalog: 0 })

    // Golden trzyma swoje liczby i ma je trzymać dalej: różnica jest w
    // fixture'cie wejściowym, nie w tym, co raport twierdzi.
    expect(goldenField('facts.basis.counts')).toEqual({ statements: 38, matched: 34, offCatalog: 4 })
  })

  it('brief ma tyle modułów, ile golden ma wierszy pokrycia, i te same narzędzia w stosie', () => {
    const tools = normalizeBrief(brief).tools
    const moduleCount = tools.reduce((sum, tool) => sum + tool.modules.length, 0)

    const coverageRows = goldenField('facts.coverage.rows')
    if (!Array.isArray(coverageRows)) throw new Error('facts.coverage.rows nie jest tablicą')
    expect(moduleCount).toBe(coverageRows.length)

    const stackRows = goldenField('facts.stack.rows')
    if (!Array.isArray(stackRows)) throw new Error('facts.stack.rows nie jest tablicą')
    const stackToolNames = stackRows.map((row, i) => {
      if (typeof row !== 'object' || row === null || !Object.hasOwn(row, 'tool')) {
        throw new Error(`facts.stack.rows[${i}] nie ma pola tool`)
      }
      return (row as Record<string, unknown>).tool
    })
    expect(stackToolNames).toEqual(tools.map((tool) => tool.name))

    // 38 - 34 = 4 = Appendix B. Ta relacja w golden masterze trzyma i to ona
    // pokazuje, skąd wzięłyby się cztery pozycje poza katalogiem.
    const gaps = goldenField('facts.gaps')
    if (!Array.isArray(gaps)) throw new Error('facts.gaps nie jest tablicą')
    expect(gaps.length).toBe(4)
  })

  it('przepisuje pieniądze i stanowiska bez zaokrągleń i bez zgadywania', () => {
    const request = briefToRequest(brief, COSTS)
    expect(request.company).toEqual({
      name: 'Voltix Energy Sp. z o.o.',
      industry: '',
      employees: 34,
      currency: 'USD',
    })
    expect(request.costs).toEqual(COSTS)
    expect(request.stack.map((tool) => tool.monthlyCost)).toEqual([890, 415, 349, 240, 199, 149, 78])
    expect(request.stack.map((tool) => tool.seatCount)).toEqual([10, 5, 12, 12, 5, 5, 3])
    // PandaDoc ma dwa moduły; ich slugi lądują w jednej liście zdolności.
    expect(request.stack[4].capabilities?.map((cap) => cap.capability)).toEqual([
      'quotes.cpq',
      'docs.templates',
      'esignature',
    ])
  })

  it('nie przepuszcza dalej niczego, co klient dokleił obok kontraktu', () => {
    const request = briefToRequest(brief, COSTS)
    const serialized = JSON.stringify(request)
    // Pola, które brief NIESIE, a `ConsolidationRequest` ich nie zna.
    for (const stray of ['Marta Nowak', 'termEnds', 'Sales Professional', 'readWhat', 'evidenceNote']) {
      expect(serialized).not.toContain(stray)
    }
  })
})

describe('brama briefu', () => {
  const v1Brief = {
    v: 1,
    kind: 'mercatify-brief',
    created: '2026-09-19',
    company: { name: 'Voltix', industry: '', people: 34 },
    currency: 'USD',
    pains: '',
    mustKeep: '',
    tools: [
      {
        id: 'hubspot',
        name: 'HubSpot Sales',
        kind: 'CRM',
        seats: 10,
        monthly: 890,
        modules: [{ id: 'sales', name: 'CRM', desc: 'Contacts', caps: ['crm.contacts'] }],
      },
    ],
  }

  it('S19: podnosi brief v1 do v2: brak deklaracji dowodu to "inferred"', () => {
    const normalized = normalizeBrief(v1Brief)
    expect(normalized.tools[0].modules[0].evidenceKind).toBe('inferred')
    // v1 nie ma `category`, ma `kind` - i to ta sama informacja.
    expect(normalized.tools[0].category).toBe('CRM')
  })

  it('zachowuje rodzaj dowodu zadeklarowany w v2', () => {
    const kinds = normalizeBrief(brief).tools.flatMap((tool) =>
      tool.modules.map((module) => module.evidenceKind),
    )
    expect(kinds).toEqual([
      'observed',
      'observed',
      'inferred',
      'observed',
      'estimated',
      'inferred',
      'observed',
      'inferred',
    ])
  })

  it('odrzuca rodzaj dowodu spoza trójki, zamiast brać go za "coś tam było"', () => {
    const broken = { ...v1Brief, tools: [{ ...v1Brief.tools[0], modules: [{ ...v1Brief.tools[0].modules[0], evidenceKind: 'observ' }] }] }
    expect(() => normalizeBrief(broken)).toThrow(/tools\[0\]\.modules\[0\]\.evidenceKind/)
  })

  it('moduł bez zdolności jest błędem z nazwą pola, nie ciszą', () => {
    // Narzędzia "custom" z formularza przyjęcia wyglądają dokładnie tak.
    const noCaps = { ...v1Brief, tools: [{ ...v1Brief.tools[0], modules: [{ id: 'use', name: 'What it is used for', desc: '', caps: [] }] }] }
    expect(() => normalizeBrief(noCaps)).toThrow(/tools\[0\]\.modules\[0\]\.caps/)

    const missingCaps = { ...v1Brief, tools: [{ ...v1Brief.tools[0], modules: [{ id: 'use', name: 'x', desc: '' }] }] }
    expect(() => normalizeBrief(missingCaps)).toThrow(/tools\[0\]\.modules\[0\]\.caps/)
  })

  it('odrzuca ten sam slug dwa razy w jednym narzędziu', () => {
    const doubled = {
      ...v1Brief,
      tools: [
        {
          ...v1Brief.tools[0],
          modules: [
            { id: 'a', name: 'a', desc: '', caps: ['crm.contacts'] },
            { id: 'b', name: 'b', desc: '', caps: ['crm.contacts'] },
          ],
        },
      ],
    }
    expect(() => normalizeBrief(doubled)).toThrow(/already declared by tools\[0\]\.modules\[0\]/)
  })

  it('odrzuca nieznaną wersję i obcy kind, nazywając pole', () => {
    expect(() => normalizeBrief({ ...v1Brief, v: 3 })).toThrow(/brief v:/)
    expect(() => normalizeBrief({ ...v1Brief, kind: 'mercatify-case' })).toThrow(/brief kind:/)
    expect(() => normalizeBrief('{}')).toThrow(/brief root:/)
  })

  it('odrzuca koszty, których nie da się policzyć, zanim ruszy silnik', () => {
    expect(() => briefToRequest(v1Brief, { omOperatingCost: Number.NaN, implementationCost: 0 })).toThrow(
      /costs\.omOperatingCost/,
    )
    expect(() => briefToRequest(v1Brief, { omOperatingCost: 0, implementationCost: -1 })).toThrow(
      /costs\.implementationCost/,
    )
    expect(() => briefToRequest(v1Brief, undefined)).toThrow(/brief costs:/)
  })

  it('odrzuca kwotę i liczbę stanowisk, które nie są liczbami', () => {
    expect(() => normalizeBrief({ ...v1Brief, tools: [{ ...v1Brief.tools[0], monthly: '890' }] })).toThrow(
      /tools\[0\]\.monthly/,
    )
    expect(() => normalizeBrief({ ...v1Brief, tools: [{ ...v1Brief.tools[0], seats: 2.5 }] })).toThrow(
      /tools\[0\]\.seats/,
    )
  })

  it('pomija liczbę stanowisk, gdy brief jej nie podaje - nie wpisuje zera', () => {
    const noSeats = { ...v1Brief, tools: [{ id: 'x', name: 'Airtable', kind: 'Registers', monthly: 240, modules: v1Brief.tools[0].modules }] }
    expect(normalizeBrief(noSeats).tools[0].seatCount).toBeUndefined()
    expect(Object.hasOwn(briefToRequest(noSeats, COSTS).stack[0], 'seatCount')).toBe(false)
  })
})

describe('aliasy nazw narzędzi', () => {
  it('generuje oba człony każdego wpisu "A / B" z danych katalogu', () => {
    const canonical = listCatalogToolNames()
    const generated = Object.keys(TOOL_ALIASES).filter((alias) => !Object.hasOwn(MANUAL_TOOL_ALIASES, alias))
    expect(generated.sort()).toEqual(
      ['Jobber', 'Klaviyo', 'Mailchimp', 'QuickBooks', 'ServiceTitan', 'Sortly', 'Xero', 'inFlow'].sort(),
    )
    // Każdy człon celuje w narzędzie, które naprawdę jest w katalogu.
    const dangling = Object.entries(TOOL_ALIASES).filter(([, target]) => !canonical.includes(target))
    expect(dangling).toEqual([])
  })

  it('wpisy ręczne to dokładnie nazwy handlowe, świadomie dopisane', () => {
    expect(MANUAL_TOOL_ALIASES).toEqual({ 'HubSpot Sales': 'HubSpot', 'Zendesk Suite': 'Zendesk' })
  })

  it('żaden alias nie przesłania nazwy kanonicznej', () => {
    const canonical = new Set(listCatalogToolNames())
    const shadowing = Object.keys(TOOL_ALIASES).filter((alias) => canonical.has(alias))
    expect(shadowing).toEqual([])

    // Odczyt dosłowny nadal wygrywa i oddaje dokładnie ten sam wpis.
    expect(getCatalogTool('HubSpot')).toBe(getCatalogTool('HubSpot Sales'))
    expect(getCatalogTool('Jobber / ServiceTitan')).toBe(getCatalogTool('Jobber'))
  })

  it('nie dopasowuje po podciągu - nieznana nazwa uczciwie wypada z katalogu', () => {
    for (const name of ['HubSpot Sales Hub Enterprise', 'Hubspot', 'hubspot sales', 'Jobbe', 'Xer', 'constructor', '__proto__']) {
      expect(getCatalogTool(name)).toBeUndefined()
    }
  })

  it('rzuca, gdy dwa narzędzia roszczą sobie ten sam człon', () => {
    expect(() => buildToolAliases(['Alpha / Shared', 'Beta / Shared'], {})).toThrow(
      /człon "Shared" jest zgłaszany przez dwa narzędzia: "Alpha \/ Shared" i "Beta \/ Shared"/,
    )
  })

  it('rzuca, gdy człon przesłaniałby osobne narzędzie z katalogu', () => {
    expect(() => buildToolAliases(['Alpha / Beta', 'Beta'], {})).toThrow(/jest jednocześnie osobnym narzędziem/)
  })

  it('rzuca na ręcznym aliasie w nieistniejące narzędzie i na aliasie dublującym człon', () => {
    expect(() => buildToolAliases(['Alpha'], { 'Alpha Pro': 'Alfa' })).toThrow(/celuje w "Alfa", którego nie ma/)
    expect(() => buildToolAliases(['Alpha / Beta'], { Beta: 'Alpha / Beta' })).toThrow(/powstaje już z członów/)
    expect(() => buildToolAliases(['Alpha'], { Alpha: 'Alpha' })).toThrow(/przesłaniałby odczyt dosłowny/)
  })
})
