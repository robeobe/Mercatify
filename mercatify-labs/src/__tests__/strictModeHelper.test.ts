/** @jest-environment node */
import { assertStrictModeCompatible } from './helpers/strictMode'

/**
 * Meta-testy strażnika. Poprzednia wersja (kopiowana do dwóch plików)
 * rekurencyjna była tylko z nazwy: wchodziła wyłącznie w węzeł o jawnym
 * `type: 'object'`, więc przepuszczała każdy z poniższych kształtów.
 * Strażnik bez pokrycia jest gorszy niż brak strażnika, bo pozwala odhaczyć
 * "Done when" o rekurencyjnym teście strict mode.
 */
const closed = (props: Record<string, any>) => ({
  type: 'object',
  properties: props,
  required: Object.keys(props),
  additionalProperties: false,
})

describe('assertStrictModeCompatible - wykrywa to, co stary strażnik przepuszczał', () => {
  it('łapie mapę w additionalProperties na węźle BEZ jawnego type', () => {
    expect(() =>
      assertStrictModeCompatible({
        properties: { rows: { additionalProperties: { type: 'string' } } },
        required: ['rows'],
        additionalProperties: false,
      }),
    ).toThrow(/additionalProperties jest mapą/)
  })

  it('łapie otwarty obiekt schowany pod anyOf', () => {
    expect(() =>
      assertStrictModeCompatible(
        closed({ v: { anyOf: [closed({ a: { type: 'string' } }), { type: 'object', properties: { b: { type: 'string' } }, required: [], additionalProperties: true }] } }),
      ),
    ).toThrow()
  })

  it('łapie otwarty obiekt w $defs', () => {
    expect(() =>
      assertStrictModeCompatible({
        ...closed({ a: { type: 'string' } }),
        $defs: { leak: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] } },
      }),
    ).toThrow()
  })

  it('łapie required niepokrywające wszystkich properties', () => {
    expect(() =>
      assertStrictModeCompatible({
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' } },
        required: ['a'],
        additionalProperties: false,
      }),
    ).toThrow()
  })

  it('przepuszcza poprawnie domknięty schemat zagnieżdżony w tablicy', () => {
    expect(() =>
      assertStrictModeCompatible(
        closed({ items: { type: 'array', items: closed({ id: { type: 'string' } }) } }),
      ),
    ).not.toThrow()
  })
})

describe('slowa kluczowe spoza podzbioru strict mode', () => {
  it.each(['minLength', 'maxLength', 'pattern', 'format'])('odrzuca %s na stringu', (keyword) => {
    expect(() =>
      assertStrictModeCompatible(closed({ title: { type: 'string', [keyword]: 1 } })),
    ).toThrow(new RegExp(keyword))
  })

  it.each(['minItems', 'maxItems', 'uniqueItems', 'prefixItems'])(
    'odrzuca %s na tablicy',
    (keyword) => {
      expect(() =>
        assertStrictModeCompatible(
          closed({ rows: { type: 'array', [keyword]: 1, items: closed({ a: { type: 'string' } }) } }),
        ),
      ).toThrow(new RegExp(keyword))
    },
  )

  it('lapie slowo zakazane glęboko w zagniezdzeniu, nie tylko w korzeniu', () => {
    expect(() =>
      assertStrictModeCompatible(
        closed({
          rows: {
            type: 'array',
            items: closed({ cells: { type: 'array', items: closed({ v: { type: 'string', minLength: 1 } }) } }),
          },
        }),
      ),
    ).toThrow(/minLength/)
  })
})
