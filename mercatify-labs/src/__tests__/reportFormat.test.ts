/** @jest-environment node */
import { count, isoToLongDate, money, NOT_GIVEN } from '../report/format'

describe('money', () => {
  it('prints the figures the golden report prints', () => {
    expect(money(2320, 'USD')).toBe('$2,320')
    expect(money(22356, 'USD')).toBe('$22,356')
    expect(money(40923, 'USD')).toBe('$40,923')
  })

  it('S13: PLN is a suffix, every other currency a prefix', () => {
    expect(money(1234, 'PLN')).toBe('1,234 zł')
    expect(money(1234, 'EUR')).toBe('€1,234')
    expect(money(1234, 'GBP')).toBe('£1,234')
  })

  it('puts the minus before the symbol, as the cost table does', () => {
    expect(money(-277, 'USD')).toBe('-$277')
    expect(money(-277, 'PLN')).toBe('-277 zł')
  })

  it('prints a dash rather than a zero when the client gave no figure', () => {
    expect(money(null, 'USD')).toBe(NOT_GIVEN)
    expect(money(undefined, 'USD')).toBe(NOT_GIVEN)
    expect(money(Number.NaN, 'USD')).toBe(NOT_GIVEN)
    expect(money(Number.POSITIVE_INFINITY, 'USD')).toBe(NOT_GIVEN)
  })

  it('prints the bare number for a currency it has no symbol for', () => {
    expect(money(1234, 'JPY')).toBe('1,234')
  })

  it('does not inherit a symbol from Object.prototype', () => {
    expect(money(5, 'constructor')).toBe('5')
    expect(money(5, 'toString')).toBe('5')
  })

  it('matches the browser prototype byte for byte', () => {
    // Port `money()` z assets/stack-tool/catalog.js:295 - ta sama odpowiedź
    // dla tych samych wejść, inaczej podgląd w konsoli i wysłany plik
    // pokazywałyby inną liczbę.
    const browser = (n: number, cur: string): string => {
      const symbols: Record<string, string> = { EUR: '€', USD: '$', PLN: 'zł', GBP: '£' }
      const sym = symbols[cur] || ''
      const v = Math.round(Number(n) || 0).toLocaleString('en-US')
      return cur === 'PLN' ? v + ' ' + sym : sym + v
    }
    for (const cur of ['EUR', 'USD', 'PLN', 'GBP']) {
      for (const n of [0, 1, 99, 100, 1234, 22356, 1000000]) {
        expect(money(n, cur)).toBe(browser(n, cur))
      }
    }
  })
})

describe('count', () => {
  it('formats whole numbers and falls back to a dash', () => {
    expect(count(160)).toBe('160')
    expect(count(1240)).toBe('1,240')
    expect(count(null)).toBe(NOT_GIVEN)
  })
})

describe('isoToLongDate', () => {
  it('prints the cover date the way the report does', () => {
    expect(isoToLongDate('2026-09-19')).toBe('19 September 2026')
    expect(isoToLongDate('2027-02-28')).toBe('28 February 2027')
  })

  it('does not shift the day in timezones west of Greenwich', () => {
    // `new Date('2026-01-01').getDate()` oddaje 31 grudnia w UTC-5.
    expect(isoToLongDate('2026-01-01')).toBe('1 January 2026')
  })

  it('returns anything that is not an ISO date untouched', () => {
    expect(isoToLongDate('')).toBe('')
    expect(isoToLongDate('monthly')).toBe('monthly')
    expect(isoToLongDate('2026-13-01')).toBe('2026-13-01')
  })
})

describe('regressions found in review', () => {
  it('never prints a literal "-0" - a rounding wobble would read as "-0 hours"', () => {
    expect(count(-0)).toBe('0')
    expect(count(-0.4)).toBe('0')
    expect(count(-0.001)).toBe('0')
    expect(money(-0, 'USD')).toBe('$0')
    expect(money(-0.4, 'USD')).toBe('$0')
  })

  it('rejects a date that does not exist in the calendar', () => {
    // `validUntil` i `termEnds` to terminy handlowe - "30 February 2026"
    // w dokumencie u klienta to więcej niż literówka.
    expect(isoToLongDate('2026-02-30')).toBe('2026-02-30')
    expect(isoToLongDate('2026-04-31')).toBe('2026-04-31')
    expect(isoToLongDate('2026-02-29')).toBe('2026-02-29') // 2026 nie jest przestępny
  })

  it('accepts a real leap day', () => {
    expect(isoToLongDate('2028-02-29')).toBe('29 February 2028')
  })
})
