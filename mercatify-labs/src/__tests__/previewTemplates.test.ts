/** @jest-environment node */
import { renderScreen, escapeHtml } from '../preview/templates'

describe('escapeHtml', () => {
  it('neutralizes markup coming from request data', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    )
  })
})

describe('renderScreen', () => {
  const row = (...cells: Array<[string, string]>) => ({
    cells: cells.map(([column, value]) => ({ column, value })),
  })

  it('renders a list screen with the given columns and rows', () => {
    const html = renderScreen({
      name: 'deals',
      kind: 'list',
      title: 'Deals',
      columns: ['Name', 'Stage'],
      rows: [row(['Name', 'Voltix retrofit'], ['Stage', 'Quote'])],
    })
    expect(html).toContain('<title>Deals</title>')
    expect(html).toContain('<th>Stage</th>')
    expect(html).toContain('<td>Voltix retrofit</td>')
  })

  it('escapes cell values instead of emitting raw markup', () => {
    const html = renderScreen({
      name: 'deals',
      kind: 'list',
      title: 'Deals',
      columns: ['Name'],
      rows: [row(['Name', '<img src=x onerror=1>'])],
    })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('escapes the title too - it lands in two places', () => {
    const html = renderScreen({
      name: 'x',
      kind: 'list',
      title: '<script>x</script>',
      columns: ['A'],
      rows: [],
    })
    expect(html).not.toContain('<script>')
    expect(html.match(/&lt;script&gt;/g)).toHaveLength(2)
  })

  it('renders an empty cell for a column the row does not carry', () => {
    const html = renderScreen({
      name: 'deals',
      kind: 'list',
      title: 'Deals',
      columns: ['Name', 'Stage'],
      rows: [row(['Name', 'Voltix retrofit'])],
    })
    expect(html).toContain('<td>Voltix retrofit</td><td></td>')
  })

  it('ignores a cell whose column is not declared - columns drive the table', () => {
    const html = renderScreen({
      name: 'deals',
      kind: 'list',
      title: 'Deals',
      columns: ['Name'],
      rows: [row(['Name', 'ok'], ['Smuggled', 'should not render'])],
    })
    expect(html).not.toContain('should not render')
  })

  it('is deterministic - same spec renders a byte-identical string', () => {
    const spec = {
      name: 'dash',
      kind: 'dashboard' as const,
      title: 'Dashboard',
      columns: ['Metric', 'Value'],
      rows: [row(['Metric', 'Net saving'], ['Value', '21000'])],
    }
    expect(renderScreen(spec)).toBe(renderScreen(spec))
  })

  it('renders a detail screen as label/value pairs, not a table head', () => {
    const html = renderScreen({
      name: 'deal-1',
      kind: 'detail',
      title: 'Deal - Voltix retrofit',
      columns: [],
      rows: [row(['Stage', 'Quote'], ['Owner', 'A. Nowak'])],
    })
    expect(html).toContain('<dt>Stage</dt>')
    expect(html).toContain('<dd>Quote</dd>')
    expect(html).not.toContain('<th>')
  })
})

/**
 * Trzy luki, przez które przechodziła zepsuta implementacja.
 * Test `is deterministic` porównywał ten sam obiekt ze sobą, więc przechodził
 * także dla renderu zależnego od kolejności wstawiania komórek; test
 * `escapeHtml` nie zawierał ani `&`, ani apostrofu, więc przechodził dla
 * implementacji gubiącej ampersand (ryzyko R5).
 */
describe('escapeHtml - pełna mapa znaków', () => {
  it('escapuje ampersand i apostrof, nie tylko nawiasy ostre', () => {
    expect(escapeHtml(`Tom & Jerry's <b>`)).toBe('Tom &amp; Jerry&#39;s &lt;b&gt;')
  })

  it('escapuje ampersand POJEDYNCZO - bez podwójnego escapowania encji', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('renderScreen - determinizm wobec różnych obiektów, nie wobec siebie', () => {
  const cell = (column: string, value: string) => ({ column, value })

  it('dwa strukturalnie równe, ale różne obiekty dają identyczny string', () => {
    const make = () => ({
      name: 'dash',
      kind: 'dashboard' as const,
      title: 'Dashboard',
      columns: ['Metric', 'Value'],
      rows: [{ cells: [cell('Metric', 'Net saving'), cell('Value', '21000')] }],
    })
    const a = make()
    const b = make()
    expect(a).not.toBe(b)
    expect(renderScreen(a)).toBe(renderScreen(b))
  })

  it('przetrwa podróż przez JSON - render nie zależy od tożsamości referencji', () => {
    const spec = {
      name: 'deals',
      kind: 'list' as const,
      title: 'Deals',
      columns: ['Name', 'Stage'],
      rows: [{ cells: [cell('Name', 'Voltix'), cell('Stage', 'Quote')] }],
    }
    expect(renderScreen(JSON.parse(JSON.stringify(spec)))).toBe(renderScreen(spec))
  })

  it('kolejność komórek w wierszu nie zmienia wyniku - rządzi columns', () => {
    const base = { name: 'deals', kind: 'list' as const, title: 'Deals', columns: ['Name', 'Stage'] }
    const forward = renderScreen({ ...base, rows: [{ cells: [cell('Name', 'Voltix'), cell('Stage', 'Quote')] }] })
    const reversed = renderScreen({ ...base, rows: [{ cells: [cell('Stage', 'Quote'), cell('Name', 'Voltix')] }] })
    expect(forward).toBe(reversed)
  })
})

describe('renderScreen - nieznany kind', () => {
  it('rzuca zamiast po cichu renderować się jako lista', () => {
    expect(() =>
      renderScreen({ name: 'x', kind: 'gallery' as any, title: 'X', columns: ['A'], rows: [] }),
    ).toThrow(/Unknown screen kind: gallery/)
  })
})

describe('renderScreen - jezyk dokumentu (WCAG 2.2 SC 3.1.1)', () => {
  const base = { name: 'x', kind: 'list' as const, title: 'T', columns: ['A'], rows: [] }

  it('domyslnie deklaruje en, gdy host nie podal jezyka', () => {
    expect(renderScreen(base)).toContain('<html lang="en">')
  })

  it('uzywa jezyka podanego przez hosta', () => {
    expect(renderScreen({ ...base, lang: 'pl' })).toContain('<html lang="pl">')
  })

  it('escapuje lang - atrybut nie jest wektorem wstrzykniecia', () => {
    const html = renderScreen({ ...base, lang: '"><script>x</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&quot;&gt;')
  })
})
