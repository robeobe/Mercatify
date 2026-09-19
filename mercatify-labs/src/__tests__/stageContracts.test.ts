/** @jest-environment node */
import { STAGE_NAMES, getStageContract, isStageName } from '../critic/stageContracts'
import type { ContractRule, StageName } from '../critic/stageContracts'

describe('stage contracts', () => {
  it('covers all eight stages', () => {
    expect(STAGE_NAMES).toEqual([
      'audit',
      'mappings',
      'blueprint',
      'scenario',
      'preview',
      'migration-plan',
      'om-requirements',
      'report',
    ])
  })

  it('gives every stage at least one rule', () => {
    for (const stage of STAGE_NAMES) {
      expect(getStageContract(stage).rules.length).toBeGreaterThan(0)
    }
  })

  it('keeps every rule id unique across the whole file', () => {
    const ids = STAGE_NAMES.flatMap((s) => getStageContract(s).rules.map((r) => r.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('throws on an unknown stage and names it', () => {
    expect(() => getStageContract('invoicing' as never)).toThrow(/invoicing/)
  })

  it('forbids the critic from stating its own money on the numeric stages', () => {
    for (const stage of ['scenario', 'migration-plan'] as const) {
      const texts = getStageContract(stage).rules.map((r) => r.text).join(' ')
      expect(texts).toMatch(/never state.*(amount|number)/i)
    }
  })
})

/**
 * Domknięcie zbioru reguł (ryzyko R12). Bez tych trzech bloków
 * `stageContracts.ts` obiecywał zamkniętą listę, a oddawał żywą referencję
 * na tablicę modułową i przepuszczał klucze prototypu.
 */
describe('zamkniętość kontraktu', () => {
  it('nie da się rozszerzyć listy reguł przez mutację zwróconego kontraktu', () => {
    const first = getStageContract('mappings')
    expect(() => (first.rules as ContractRule[]).push({ id: 'FAKE-1', text: 'wstrzyknięta' })).toThrow()
    expect(getStageContract('mappings').rules.map((r) => r.id)).not.toContain('FAKE-1')
  })

  it('nie da się podmienić tekstu istniejącej reguły', () => {
    const rule = getStageContract('scenario').rules[0]
    expect(() => ((rule as ContractRule).text = 'podmienione')).toThrow()
    expect(getStageContract('scenario').rules[0].text).not.toBe('podmienione')
  })

  it('nie da się dopisać etapu do STAGE_NAMES', () => {
    expect(() => (STAGE_NAMES as StageName[]).push('invoicing' as StageName)).toThrow()
    expect(STAGE_NAMES).toHaveLength(8)
  })

  it.each(['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'])(
    'rzuca na kluczu prototypu %s zamiast oddawać nie-tablicę',
    (key) => {
      expect(() => getStageContract(key as StageName)).toThrow(/Unknown critic stage/)
    },
  )
})

/**
 * Ósmy etap - `report`. Krytykowanym artefaktem jest CAŁY `ReportModel`, więc
 * te pięć reguł musi nazwać dokładnie te obietnice, których nie pilnuje już
 * żadna czysta funkcja: podział `facts` / `prose`, realność fal, zgodność obu
 * miejsc, w których stoi break-even, i uczciwość luki katalogowej.
 */
describe('etap report (REP-1..5)', () => {
  const rules = () => getStageContract('report').rules

  it('ma dokładnie pięć reguł, po jednej na obietnicę warstwy raportu', () => {
    expect(rules().map((rule) => rule.id)).toEqual(['REP-1', 'REP-2', 'REP-3', 'REP-4', 'REP-5'])
  })

  it('pilnuje, że liczby pochodzą z faktów, a proza ich nie niesie', () => {
    const [rep1, rep2] = rules()
    expect(rep1.text).toMatch(/facts/)
    expect(rep1.text).toMatch(/prose/)
    // REP-2 wymienia trzy postacie liczby, bo `assertNoFigures` łapie tylko
    // CYFRĘ - "roughly two thousand a month" przechodzi przez strażnika i
    // zatrzymuje się dopiero tutaj, na czytającym człowieku.
    expect(rep2.text).toMatch(/amount/i)
    expect(rep2.text).toMatch(/percentage/i)
    expect(rep2.text).toMatch(/duration/i)
    expect(rep2.text).toMatch(/slot/i)
  })

  it('pilnuje fal, break-evenu i luk katalogowych', () => {
    const [, , rep3, rep4, rep5] = rules()
    expect(rep3.text).toMatch(/wave/i)
    expect(rep3.text).toMatch(/mapping/i)
    // Dwa pola, jedna liczba: `kpis.breakEvenMonth` jest kopią z serii i
    // rozjazd między nimi to dwa różne zdania o tym samym miesiącu.
    expect(rep4.text).toMatch(/kpis\.breakEvenMonth/)
    expect(rep4.text).toMatch(/cash\.breakEvenMonth/)
    expect(rep5.text).toMatch(/catalog/i)
    expect(rep5.text).toMatch(/amount/i)
  })

  it('jest zamknięty tak samo jak pozostałe siedem', () => {
    expect(() => (rules() as ContractRule[]).push({ id: 'REP-6', text: 'wstrzyknięta' })).toThrow()
    expect(() => ((rules()[0] as ContractRule).text = 'podmienione')).toThrow()
    expect(rules().map((rule) => rule.id)).not.toContain('REP-6')
  })

  it('jest rozpoznawany przez `isStageName`, więc `critique()` go przyjmie', () => {
    expect(isStageName('report')).toBe(true)
  })
})

describe('isStageName', () => {
  it('przepuszcza każdy z ośmiu etapów', () => {
    for (const stage of STAGE_NAMES) expect(isStageName(stage)).toBe(true)
  })

  it.each([['invoicing'], ['__proto__'], [''], [null], [undefined], [7], [{}]])(
    'odrzuca %p',
    (value) => {
      expect(isStageName(value)).toBe(false)
    },
  )
})
