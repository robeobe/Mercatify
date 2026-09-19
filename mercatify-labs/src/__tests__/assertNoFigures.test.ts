/** @jest-environment node */
import { assertNoFigures } from '../report/assertNoFigures'
import type { ReportProse } from '../report/model'

const throws = (text: string): void =>
  expect(() => assertNoFigures({ recommendation: text })).toThrow(/assertNoFigures/)
const passes = (text: string): void =>
  expect(() => assertNoFigures({ recommendation: text })).not.toThrow()

// S5 (TEST-005): cały ten plik JEST oracle'em regresji dla scenariusza
// "agent wpisuje liczbę w prozę" - dokładnie buga ze SPEC.md §10, gdzie FinOps
// napisał "€6 000 / 24 miesiące" przy prawdziwych €21 000 / 6,9 miesiąca.
describe('S5: assertNoFigures', () => {
  it('S3/S5: passes undefined prose - a run with no LLM is a valid report (SPEC.md §8)', () => {
    expect(() => assertNoFigures(undefined)).not.toThrow()
  })

  it('passes prose that states no figure', () => {
    passes('Start with the ad-hoc registers and the inventory app. They carry the least process risk.')
  })

  /**
   * Te osiem przypadków to regresja na realną dziurę: pierwsza wersja
   * strażnika wypisywała wzorce "liczba z jednostką" i wymagała jednostki
   * PRZYKLEJONEJ do liczby, więc każdy z nich przechodził bez słowa. Naturalne
   * sformułowanie buga ze SPEC.md §10 jest w tej liście dwa razy.
   */
  it.each([
    ['unit one word away', 'It returns 389 per month.'],
    ['number after the unit', 'The programme pays back in month 15.'],
    ['percent spelled out', 'We matched 87 percent of your statements.'],
    ['currency spelled out', 'It saves 389 dollars a month.'],
    ['bare four-digit amount', 'Those five tools cost 2043 a month.'],
    ['two bare numbers, no unit at all', 'The quote builder is 40 of the 45.'],
    ['SPEC.md §10, verbatim', 'Net annual saving is EUR 6,000, with a payback period of 24 months.'],
    ['SPEC.md §10, reworded', 'It pays back in month 24 and saves six thousand euro — or 6000.'],
  ])('rejects %s', (_label, text) => throws(text))

  it.each([
    ['symbol before the number', '$19,200 over the programme'],
    ['symbol after the number', 'about 1200 zł a month'],
    ['currency code', 'roughly 500 USD per seat'],
    ['hours', 'we estimate 40 h for the quote builder'],
    ['months', 'it pays for itself in 15 months'],
    ['weeks', 'the programme runs 22 weeks'],
    ['percentage sign', 'an 87% match'],
    ['a date', 'your term renews on 28 February 2027'],
    ['a range', 'adds roughly 10-20 h to wave three'],
  ])('still rejects %s', (_label, text) => throws(text))

  describe('what is allowed', () => {
    it('allows a number after a label word', () => {
      passes('Answer this before wave 3 is quoted.')
      passes('See section 04 and appendix B, plus rule 02.')
      passes('Risk 8 covers it.')
    })

    it('allows a slot - that is the whole point of the mechanism', () => {
      passes('Cutting them returns {wave.1.monthlyBanked} a month.')
      passes('You save {kpis.netRecurringAnnual} a year and break even in month {cash.breakEvenMonth}.')
    })

    it('does not let a literal hide inside slot-looking braces', () => {
      // Sloty wycinamy PRZED liczbami etykietowanymi, więc `{...}` nie jest
      // przykrywką: cyfra poza klamrami nadal wpada.
      throws('You save {kpis.netRecurringAnnual}, which is 22356 a year.')
    })

    it('does not treat a slot containing a wave index as a bare figure', () => {
      passes('{wave.1.monthlyBanked} and {wave.4.hours}')
    })

    it('skips structural id fields - a risk is numbered "8.1", that is a section label', () => {
      const prose: ReportProse = {
        risks: [
          { id: '8.1', risk: 'Exports may be messy', basis: 'Assumed from a sample', effect: 'The wave grows', handling: 'Reviewed up front' },
        ],
        gaps: [{ gapId: 'B.1', whyUnmapped: 'Specialist CAD, no catalog entry', ourRead: 'Almost certainly stays where it is' }],
      }
      expect(() => assertNoFigures(prose)).not.toThrow()
    })
  })

  it('reports EVERY offending field, not just the first', () => {
    const prose: ReportProse = {
      recommendation: 'You save $22,356 a year.',
      disclaimer: 'It breaks even in 15 months.',
      findings: [{ heading: 'A 40 h build', body: 'Fine.' }],
    }
    let message = ''
    try {
      assertNoFigures(prose)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain('3 prose field(s)')
    expect(message).toContain('prose.recommendation')
    expect(message).toContain('prose.disclaimer')
    expect(message).toContain('prose.findings[0].heading')
  })

  it('names the slot mechanism in the error, so the fix is obvious', () => {
    expect(() => assertNoFigures({ recommendation: 'saves 500 a month' })).toThrow(/\{kpis\./)
  })

  it('walks keys the contract does not declare - the model can bolt on extra fields', () => {
    const prose = { recommendation: 'Fine.', bolted: { on: 'costs $500' } } as ReportProse
    expect(() => assertNoFigures(prose)).toThrow(/prose\.bolted\.on/)
  })

  it('survives a cycle rather than blowing the stack', () => {
    const cyclic: Record<string, unknown> = { recommendation: 'Fine.' }
    cyclic.self = cyclic
    expect(() => assertNoFigures(cyclic as ReportProse)).not.toThrow()
  })

  it('is not stateful across calls - the same pattern objects see hundreds of fields', () => {
    const bad: ReportProse = { recommendation: 'It costs 100 a month.' }
    for (let i = 0; i < 3; i += 1) expect(() => assertNoFigures(bad)).toThrow()
    const good: ReportProse = { recommendation: 'See wave 2.' }
    for (let i = 0; i < 3; i += 1) expect(() => assertNoFigures(good)).not.toThrow()
  })
})

describe('assertNoFigures - structural keys are scoped by PATH, not by name', () => {
  it('rejects a figure hidden in an `id` the contract does not declare', () => {
    // Regresja: pomijanie po nazwie klucza przepuszczało to bez słowa, mimo
    // że `ProseFinding` nie ma pola `id`. To ta sama furtka, której broni
    // cały ten plik (SPEC.md §10).
    const prose = {
      findings: [{ heading: 'Savings', body: 'See below.', id: 'actual saving is $6,000/yr' }],
    } as unknown as ReportProse
    expect(() => assertNoFigures(prose)).toThrow(/findings\[0\]\.id/)
  })

  it('rejects a figure hidden in a `gapId` outside gaps', () => {
    const prose = { risks: [{ id: '8.1', gapId: 'really 24 months', risk: 'x', basis: 'y', effect: 'z', handling: 'w' }] } as unknown as ReportProse
    expect(() => assertNoFigures(prose)).toThrow(/risks\[0\]\.gapId/)
  })

  it('still skips the real structural fields at their real paths', () => {
    const prose: ReportProse = {
      risks: [{ id: '8.1', risk: 'x', basis: 'y', effect: 'z', handling: 'w' }],
      gaps: [{ gapId: 'B.1', whyUnmapped: 'x', ourRead: 'y' }],
      waveNotes: [{ waveNumber: 3, body: 'Runs alongside the old system.' }],
    }
    expect(() => assertNoFigures(prose)).not.toThrow()
  })
})
