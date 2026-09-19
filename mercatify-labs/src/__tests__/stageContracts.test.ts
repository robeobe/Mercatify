/** @jest-environment node */
import { STAGE_NAMES, getStageContract, isStageName } from '../critic/stageContracts'
import type { ContractRule, StageName } from '../critic/stageContracts'

describe('stage contracts', () => {
  it('covers all seven stages', () => {
    expect(STAGE_NAMES).toEqual([
      'audit',
      'mappings',
      'blueprint',
      'scenario',
      'preview',
      'migration-plan',
      'om-requirements',
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
    expect(STAGE_NAMES).toHaveLength(7)
  })

  it.each(['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'])(
    'rzuca na kluczu prototypu %s zamiast oddawać nie-tablicę',
    (key) => {
      expect(() => getStageContract(key as StageName)).toThrow(/Unknown critic stage/)
    },
  )
})

describe('isStageName', () => {
  it('przepuszcza każdy z siedmiu etapów', () => {
    for (const stage of STAGE_NAMES) expect(isStageName(stage)).toBe(true)
  })

  it.each([['invoicing'], ['__proto__'], [''], [null], [undefined], [7], [{}]])(
    'odrzuca %p',
    (value) => {
      expect(isStageName(value)).toBe(false)
    },
  )
})
