/** @jest-environment node */
import { validateScreens } from '../preview/validateScreens'

const ok = {
  screens: [
    {
      name: 'deals',
      kind: 'list',
      title: 'Deals',
      columns: ['Name'],
      rows: [{ cells: [{ column: 'Name', value: 'Voltix' }] }],
    },
  ],
}

describe('validateScreens', () => {
  it('passes a well-formed result through unchanged', () => {
    expect(validateScreens(ok)).toEqual(ok.screens)
  })

  it('rejects a non-object result', () => {
    expect(() => validateScreens('nope')).toThrow(/screens/i)
  })

  it('rejects a missing screens array', () => {
    expect(() => validateScreens({})).toThrow(/screens/i)
  })

  it('rejects an empty screens array - an empty preview is a failed run', () => {
    expect(() => validateScreens({ screens: [] })).toThrow(/at least one/i)
  })

  it('rejects an unknown kind and names the offending index', () => {
    const bad = { screens: [{ ...ok.screens[0], kind: 'kanban' }] }
    expect(() => validateScreens(bad)).toThrow(/screens\[0\].kind/)
  })

  it('rejects a name the filesystem layer would refuse', () => {
    const bad = { screens: [{ ...ok.screens[0], name: '../evil' }] }
    expect(() => validateScreens(bad)).toThrow(/screens\[0\].name/)
  })

  it('rejects duplicate names before they overwrite each other on disk', () => {
    const bad = { screens: [ok.screens[0], ok.screens[0]] }
    expect(() => validateScreens(bad)).toThrow(/duplicate/i)
  })

  it('rejects a non-string cell value instead of letting it reach escapeHtml', () => {
    const bad = {
      screens: [{ ...ok.screens[0], rows: [{ cells: [{ column: 'Name', value: 42 }] }] }],
    }
    expect(() => validateScreens(bad)).toThrow(/screens\[0\].rows\[0\].cells\[0\].value/)
  })

  /**
   * Rozszerzenie 1 poza listę z planu. `renderTable` (`templates.ts`) buduje
   * wiersz z `spec.columns`, nie z komórek - przy `columns: []` renderuje
   * pustą tabelę i po cichu kasuje każdą komórkę. `sandbox_engineer.json`
   * nie ma `minItems` na `columns`, więc schemat tego nie zatrzyma.
   */
  describe('empty columns (extension 1)', () => {
    it('rejects an empty columns array on a list screen, which would silently drop every cell', () => {
      const bad = { screens: [{ ...ok.screens[0], columns: [] }] }
      expect(() => validateScreens(bad)).toThrow(/screens\[0\].columns/)
    })

    it('rejects an empty columns array on a dashboard screen', () => {
      const bad = { screens: [{ ...ok.screens[0], kind: 'dashboard', columns: [] }] }
      expect(() => validateScreens(bad)).toThrow(/screens\[0\].columns/)
    })

    it('accepts an empty columns array on a detail screen, whose template never reads columns', () => {
      const detail = {
        screens: [
          {
            name: 'site-survey',
            kind: 'detail',
            title: 'Site survey planner',
            columns: [],
            rows: [{ cells: [{ column: 'Owner', value: 'Ops' }] }],
          },
        ],
      }
      expect(validateScreens(detail)).toEqual(detail.screens)
    })
  })

  /**
   * Rozszerzenie 2 poza listę z planu. `title` trafia do `<title>` i do
   * `<header>`; pusty albo sam-biały-znak daje ekran bez tożsamości.
   */
  describe('blank title (extension 2)', () => {
    it('rejects an empty title, which would render a screen with no identity', () => {
      const bad = { screens: [{ ...ok.screens[0], title: '' }] }
      expect(() => validateScreens(bad)).toThrow(/screens\[0\].title/)
    })

    it('rejects a whitespace-only title', () => {
      const bad = { screens: [{ ...ok.screens[0], title: '   \t\n ' }] }
      expect(() => validateScreens(bad)).toThrow(/screens\[0\].title/)
    })
  })

  describe('the host-controlled lang field', () => {
    it('preserves lang so a valid ScreenSpec survives the gate unchanged', () => {
      const withLang = {
        screens: [{ ...ok.screens[0], lang: 'pl' }],
      }
      expect(validateScreens(withLang)).toEqual(withLang.screens)
    })

    it('rejects a non-string lang instead of letting it reach escapeHtml', () => {
      const bad = { screens: [{ ...ok.screens[0], lang: 7 }] }
      expect(() => validateScreens(bad)).toThrow(/screens\[0\].lang/)
    })
  })

  it('does not mutate its input - the raw agent result must survive the gate untouched', () => {
    const input = JSON.parse(
      JSON.stringify({
        screens: [
          { ...ok.screens[0], lang: 'pl' },
          {
            name: 'site-survey',
            kind: 'detail',
            title: 'Site survey planner',
            columns: [],
            rows: [{ cells: [{ column: 'Owner', value: 'Ops' }] }],
          },
        ],
      }),
    )
    const before = JSON.stringify(input)
    validateScreens(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})

/**
 * Rozszerzenia po audycie adversarialnym. Każdy przypadek poniżej PRZECHODZIŁ
 * przez poprzednią wersję bramy, a część z nich kończyła się cichą szkodą
 * zamiast błędu.
 */
const screen = (over: Record<string, unknown> = {}) => ({
  name: 'deals',
  kind: 'list',
  title: 'Deals',
  columns: ['Name', 'Stage'],
  rows: [{ cells: [{ column: 'Name', value: 'Voltix' }] }],
  ...over,
})
const wrap = (...screens: unknown[]) => ({ screens })

describe('wiazanie komorek z kolumnami (cicha utrata danych)', () => {
  it('odrzuca komorke o kolumnie spoza columns - dryf wielkosci liter kasowal caly wiersz', () => {
    expect(() =>
      validateScreens(
        wrap(screen({ rows: [{ cells: [{ column: 'name', value: 'Voltix' }] }] })),
      ),
    ).toThrow(/screens\[0\]\.rows\[0\]\.cells\[0\]\.column/)
  })

  it('odrzuca pusta etykiete kolumny', () => {
    expect(() => validateScreens(wrap(screen({ columns: ['', 'A'] })))).toThrow(
      /screens\[0\]\.columns\[0\].*non-blank/,
    )
  })

  it('odrzuca zduplikowane etykiety kolumn', () => {
    expect(() => validateScreens(wrap(screen({ columns: ['A', 'A'] })))).toThrow(
      /screens\[0\]\.columns\[1\]/,
    )
  })

  it('nie wiaze kolumn na ekranie detail - szablon ich nie czyta', () => {
    const out = validateScreens(
      wrap(
        screen({
          kind: 'detail',
          columns: [],
          rows: [{ cells: [{ column: 'Stage', value: 'Quote' }] }],
        }),
      ),
    )
    expect(out[0].rows[0].cells[0]).toEqual({ column: 'Stage', value: 'Quote' })
  })
})

describe('wspolny straznik nazw - brama i pisarz sie rozjezdzaly', () => {
  it.each(['con', 'nul', 'com1', 'aux'])('odrzuca zarezerwowana nazwe DOS %s', (name) => {
    expect(() => validateScreens(wrap(screen({ name })))).toThrow(/reserved screen name/i)
  })

  it('odrzuca nazwe dluzsza niz 64 znaki', () => {
    expect(() => validateScreens(wrap(screen({ name: 'a'.repeat(200) })))).toThrow(
      /longer than 64/,
    )
  })
})

describe('sufity rozmiaru (model nie decyduje, ile plikow powstanie)', () => {
  it('odrzuca wiecej niz 50 ekranow', () => {
    const many = Array.from({ length: 51 }, (_, i) => screen({ name: `s${i}` }))
    expect(() => validateScreens(wrap(...many))).toThrow(/at most 50 entries, got 51/)
  })

  it('odrzuca wiecej niz 200 wierszy na ekran', () => {
    const rows = Array.from({ length: 201 }, () => ({ cells: [{ column: 'Name', value: 'x' }] }))
    expect(() => validateScreens(wrap(screen({ rows })))).toThrow(/at most 200 entries/)
  })
})

describe('tablice rzadkie - .map zachowywal dziury w typowanym wyniku', () => {
  it('odrzuca rzadka liste ekranow', () => {
    const sparse: unknown[] = [screen()]
    sparse[3] = screen({ name: 'other' })
    expect(() => validateScreens({ screens: sparse })).toThrow(/dense array without holes/)
  })

  it('odrzuca rzadka liste wierszy', () => {
    const rows: unknown[] = [{ cells: [{ column: 'Name', value: 'x' }] }]
    rows[2] = { cells: [] }
    expect(() => validateScreens(wrap(screen({ rows })))).toThrow(/dense array without holes/)
  })
})

describe('czystosc - asercje tozsamosci, nie tylko JSON przed/po', () => {
  it('nie aliasuje ZADNEJ tablicy ani obiektu z wejscia', () => {
    const input = wrap(screen())
    const raw = input.screens[0] as Record<string, any>
    const out = validateScreens(input)

    expect(out[0]).not.toBe(raw)
    expect(out[0].columns).not.toBe(raw.columns)
    expect(out[0].rows).not.toBe(raw.rows)
    expect(out[0].rows[0]).not.toBe(raw.rows[0])
    expect(out[0].rows[0].cells).not.toBe(raw.rows[0].cells)
    expect(out[0].rows[0].cells[0]).not.toBe(raw.rows[0].cells[0])
  })

  it('mutacja wyniku nie siega surowego wyniku agenta', () => {
    const input = wrap(screen())
    const out = validateScreens(input)
    out[0].columns.push('Injected')
    out[0].rows[0].cells[0].value = 'Tampered'
    expect((input.screens[0] as any).columns).toEqual(['Name', 'Stage'])
    expect((input.screens[0] as any).rows[0].cells[0].value).toBe('Voltix')
  })

  it('przechodzi na gleboko zamrozonym wejsciu - nie probuje niczego zapisac', () => {
    const deepFreeze = (v: any): any => {
      if (v && typeof v === 'object') Object.values(v).forEach(deepFreeze)
      return Object.freeze(v)
    }
    expect(() => validateScreens(deepFreeze(wrap(screen())))).not.toThrow()
  })
})

describe('TOCTOU - kazde pole czytane raz', () => {
  it('nie wypuszcza spec z nazwa podmieniona przez getter', () => {
    let reads = 0
    const rogue = {
      get name() {
        reads += 1
        return reads > 1 ? '../../evil' : 'deals'
      },
      kind: 'list',
      title: 'Deals',
      columns: ['Name'],
      rows: [],
    }
    const out = validateScreens({ screens: [rogue] })
    expect(out[0].name).toBe('deals')
    expect(out[0].name).not.toContain('..')
  })
})
