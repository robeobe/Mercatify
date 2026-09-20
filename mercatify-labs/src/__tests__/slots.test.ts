/** @jest-environment node */
import { resolveProseSlots, resolveSlots, slotsIn } from '../report/slots'
import type { ReportFacts } from '../report/model'

const facts = require('./fixtures/voltix.reportmodel.json').facts as ReportFacts

describe('resolveSlots', () => {
  it('renders a money slot in the client currency', () => {
    expect(resolveSlots('You save {kpis.netRecurringAnnual} a year.', facts)).toBe(
      'You save $22,356 a year.',
    )
  })

  it('renders a wave slot - the recommendation sentence from the golden report', () => {
    expect(
      resolveSlots('cutting them in the first {wave.1.weekTo} weeks returns {wave.1.monthlyBanked} a month', facts),
    ).toBe('cutting them in the first 4 weeks returns $389 a month')
  })

  it('renders a stack date slot as a long date', () => {
    expect(resolveSlots('renews on {stack.HubSpot Sales.termEnds}', facts)).toContain('February 2027')
  })

  it('renders a count slot without a currency symbol', () => {
    expect(resolveSlots('{counts.offCatalog} statements we could not map', facts)).toBe(
      '4 statements we could not map',
    )
  })

  it('renders several slots in one sentence', () => {
    expect(resolveSlots('{counts.matched} of {counts.statements}', facts)).toBe('34 of 38')
  })

  it('leaves text with no slots untouched', () => {
    expect(resolveSlots('No figures here at all.', facts)).toBe('No figures here at all.')
  })

  it('THROWS on an unknown slot shape rather than rendering a hole', () => {
    expect(() => resolveSlots('{totally.made.up.path}', facts)).toThrow(/not an allowed slot shape/)
  })

  it('THROWS on a known shape with an unknown field', () => {
    expect(() => resolveSlots('{kpis.nonsense}', facts)).toThrow(/names no such field/)
  })

  it('THROWS on a wave the run does not have', () => {
    expect(() => resolveSlots('{wave.99.monthlyBanked}', facts)).toThrow(/names wave 99/)
  })

  it('THROWS on a tool that is not in the stack - no fuzzy matching on names', () => {
    expect(() => resolveSlots('{stack.hubspot.monthly}', facts)).toThrow(/not in the stack/)
  })

  it('does not reach Object.prototype through a field name', () => {
    expect(() => resolveSlots('{kpis.constructor}', facts)).toThrow(/names no such field/)
    expect(() => resolveSlots('{kpis.__proto__}', facts)).toThrow(/names no such field/)
  })
})

describe('slotsIn', () => {
  it('lists the slots a template uses', () => {
    expect(slotsIn('{kpis.toolCount} tools, {counts.statements} statements')).toEqual([
      'kpis.toolCount',
      'counts.statements',
    ])
  })

  it('returns nothing for plain text', () => {
    expect(slotsIn('plain')).toEqual([])
  })
})

describe('resolveProseSlots', () => {
  it('walks nested prose and fills every slot', () => {
    const out = resolveProseSlots(
      {
        recommendation: 'Start now and bank {wave.1.monthlyBanked} a month.',
        findings: [{ heading: 'Covered', body: '{counts.matched} of {counts.statements} map cleanly.' }],
      },
      facts,
    )
    expect(out.recommendation).toBe('Start now and bank $389 a month.')
    expect(out.findings?.[0].body).toBe('34 of 38 map cleanly.')
  })

  it('does not mutate the template - the same prose can be resolved twice', () => {
    const template = { recommendation: 'Bank {wave.1.monthlyBanked}.' }
    const first = resolveProseSlots(template, facts)
    const second = resolveProseSlots(template, facts)
    expect(template.recommendation).toBe('Bank {wave.1.monthlyBanked}.')
    expect(first.recommendation).toBe(second.recommendation)
  })
})

describe('slots - gaps found in review', () => {
  it('renders a stack row cost AS MONEY - it silently dropped the currency symbol', () => {
    expect(resolveSlots('{stack.Xero.monthly}', facts)).toBe('$78')
    expect(resolveSlots('{stack.HubSpot Sales.annual}', facts)).toMatch(/^\$/)
    expect(resolveSlots('{stack.HubSpot Sales.unitPrice}', facts)).toMatch(/^\$/)
  })

  it('reaches the stack totals, which live a level above the rows', () => {
    expect(resolveSlots('{stack.totalMonthly}', facts)).toMatch(/^\$/)
    expect(resolveSlots('{stack.totalSeats}', facts)).not.toMatch(/\$/)
  })

  it('reaches the money table', () => {
    expect(resolveSlots('{money.totalHours}', facts)).toBe('160')
    expect(resolveSlots('{money.rate}', facts)).toBe('$120')
  })

  it('explains a dotted tool name only when the path really is too long', () => {
    expect(() => resolveSlots('{stack.Sortly.Advanced.monthly}', facts)).toThrow(/too many parts/)
    // `{stack.nonsense}` to dwuczłonowa ścieżka do sumy, nie kropka w nazwie -
    // wcześniej oba dostawały ten sam, mylący komunikat.
    expect(() => resolveSlots('{stack.nonsense}', facts)).toThrow(/names no such field/)
  })
})

describe('slots - shapes the prose agents asked for', () => {
  it('reaches the cancelled-licence subtotal the golden states twice in prose', () => {
    // "HubSpot, Airtable, Sortly, Jobber and Zendesk together cost $2,043 a
    // month" (ustalenie 1.1) i stopka sekcji 06. Ani `stack.totalMonthly`
    // (siedem narzędzi), ani `stack.<tool>.monthly` (jedno) tego nie dawały.
    expect(resolveSlots('{kpis.licencesCancelledMonthly}', facts)).toBe('$2,043')
  })

  it('reaches the largest single build estimate', () => {
    // "We estimate 40 hours ... the single largest piece of new code."
    expect(resolveSlots('{kpis.largestBuildHours}', facts)).toBe('40')
  })

  it('reaches one wave cost, taken from the implementation table not from Wave', () => {
    // "Approve wave 1 only — $3,600". `Wave` celowo nie niesie pieniędzy.
    expect(resolveSlots('{wave.1.cost}', facts)).toBe('$3,600')
  })

  it('reaches both payback numbers the callout is about', () => {
    expect(resolveSlots('{money.paybacks.buildOnlyCost}', facts)).toMatch(/^\$/)
    expect(resolveSlots('{money.paybacks.buildOnlyMonths}', facts)).toBeTruthy()
  })

  it('still throws on a wave cost the implementation table has no line for', () => {
    expect(() => resolveSlots('{wave.99.cost}', facts)).toThrow(/no implementation line/)
  })

  it('renders the golden sentence end to end', () => {
    expect(
      resolveSlots(
        'HubSpot, Airtable, Sortly, Jobber and Zendesk together cost {kpis.licencesCancelledMonthly} a month.',
        facts,
      ),
    ).toBe('HubSpot, Airtable, Sortly, Jobber and Zendesk together cost $2,043 a month.')
  })
})

describe('slots - numeric classification is exhaustive', () => {
  /**
   * Strażnik na regresję, która trafiła się DWA RAZY: pole kwotowe spoza
   * `MONEY_FIELDS` spadało po cichu do `count()` i zdanie o pieniądzach
   * wychodziło bez symbolu waluty. Ten test chodzi po KAŻDYM polu liczbowym
   * osiągalnym slotem i wymusza świadomą klasyfikację.
   */
  const numericLeaves = (source: Record<string, unknown>, prefix: string): string[] =>
    Object.entries(source)
      .filter(([, v]) => typeof v === 'number')
      .map(([k]) => `${prefix}.${k}`)

  const paths = [
    ...numericLeaves(facts.kpis as unknown as Record<string, unknown>, 'kpis'),
    ...numericLeaves(facts.basis.counts as unknown as Record<string, unknown>, 'counts'),
    ...numericLeaves(facts.company as unknown as Record<string, unknown>, 'company'),
    ...numericLeaves(facts.stack as unknown as Record<string, unknown>, 'stack'),
    ...numericLeaves(facts.money as unknown as Record<string, unknown>, 'money'),
    ...numericLeaves(facts.money.paybacks as unknown as Record<string, unknown>, 'money.paybacks'),
    ...(facts.cash ? numericLeaves(facts.cash as unknown as Record<string, unknown>, 'cash') : []),
    ...facts.waves.flatMap((w) => numericLeaves(w as unknown as Record<string, unknown>, `wave.${w.n}`)),
    ...facts.stack.rows.flatMap((r) => numericLeaves(r as unknown as Record<string, unknown>, `stack.${r.tool}`)),
  ]

  it('covers every numeric field the fixture exposes', () => {
    expect(paths.length).toBeGreaterThan(20)
    const unclassified = paths.filter((path) => {
      try {
        resolveSlots(`{${path}}`, facts)
        return false
      } catch (err) {
        return err instanceof Error && err.message.includes('classified neither')
      }
    })
    expect(unclassified).toEqual([])
  })

  it('throws loudly on a numeric field nobody classified', () => {
    const bolted = { ...facts, kpis: { ...facts.kpis, mysteryAmount: 500 } }
    expect(() => resolveSlots('{kpis.mysteryAmount}', bolted)).toThrow(/classified neither/)
  })
})
