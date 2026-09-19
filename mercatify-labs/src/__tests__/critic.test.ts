/** @jest-environment node */
import { getAgent } from '../agentLoader'
import { assertStrictModeCompatible } from './helpers/strictMode'


function collectTypes(node: any, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out
  if (typeof node.type === 'string') out.push(node.type)
  for (const child of Object.values(node.properties ?? {})) collectTypes(child, out)
  if (node.items) collectTypes(node.items, out)
  return out
}

describe('agents/critic.json', () => {
  it('declares no tools - it judges what it is handed', () => {
    const agent = getAgent('critic')
    expect(agent.tools).toEqual([])
    expect(agent.resultKind).toBe('research')
  })

  // Nazwa mówi dokładnie tyle, ile sprawdza asercja: KSZTAŁT schematu. Nie
  // twierdzi, że krytyk nie potrafi napisać kwoty - `claim`, `evidence`,
  // `location` i `notes` to wolne stringi i model może w nie wpisać cokolwiek.
  // Filtr cyfr na tych polach byłby fałszywie dodatni (identyfikator `MAP-1`,
  // ścieżka `mappings[0]`, a przede wszystkim `evidence`, które ma CYTOWAĆ
  // wartość z artefaktu - to po nie krytyk istnieje), więc go nie ma.
  // Realna obrona przed kwotą (ryzyko R11) jest w kodzie, nie w promptcie:
  // werdykt jest doradczy, a `validateCritique` przepisuje wynik pole po polu
  // i oddaje wyłącznie verdict/objections/notes - liczba od krytyka nie ma jak
  // zmienić artefaktu ani żadnej decyzji. Pilnuje tego test
  // "returns a verdict and nothing else - it cannot smuggle a fix back".
  it('has no numeric field in the result schema - a number is never a datum here', () => {
    const types = collectTypes(getAgent('critic').resultSchema)
    expect(types).not.toContain('number')
    expect(types).not.toContain('integer')
  })

  it('uses bands, not scores', () => {
    const schema = getAgent('critic').resultSchema as any
    expect(schema.properties.verdict.enum).toEqual(['accept', 'revise', 'reject'])
    expect(schema.properties.objections.items.properties.severity.enum).toEqual([
      'blocker',
      'major',
      'minor',
    ])
  })

  it('is strict-mode compatible', () => {
    assertStrictModeCompatible(getAgent('critic').resultSchema)
  })
})

import { critique, validateCritique, blockers } from '../critic'
import { getStageContract, type StageName } from '../critic/stageContracts'
import type { LlmClient } from '../llmClient'
import type { AgentDefinition } from '../agentLoader'

const noTools = async () => ({ results: [] })
const contract = getStageContract('mappings')
const objection = (over: Record<string, unknown> = {}) => ({
  severity: 'major',
  rule: 'MAP-2',
  location: 'mappings[0].confidence',
  claim: 'Confidence is a percentage, not a band.',
  evidence: '92%',
  ...over,
})

describe('validateCritique', () => {
  it('passes a consistent revise verdict through', () => {
    const raw = { verdict: 'revise', objections: [objection()], notes: 'One band problem.' }
    expect(validateCritique(raw, contract)).toEqual(raw)
  })

  it('rejects an objection citing a rule outside the contract', () => {
    const raw = { verdict: 'revise', objections: [objection({ rule: 'MAP-99' })], notes: 'x' }
    expect(() => validateCritique(raw, contract)).toThrow(/MAP-99/)
  })

  it('rejects accept with objections', () => {
    const raw = { verdict: 'accept', objections: [objection()], notes: 'x' }
    expect(() => validateCritique(raw, contract)).toThrow(/accept/i)
  })

  it('rejects revise when an objection is a blocker', () => {
    const raw = { verdict: 'revise', objections: [objection({ severity: 'blocker' })], notes: 'x' }
    expect(() => validateCritique(raw, contract)).toThrow(/blocker/i)
  })

  it('rejects reject with no objections', () => {
    expect(() => validateCritique({ verdict: 'reject', objections: [], notes: 'x' }, contract)).toThrow(
      /at least one/i,
    )
  })

  it('rejects an unknown severity', () => {
    const raw = { verdict: 'revise', objections: [objection({ severity: 'critical' })], notes: 'x' }
    expect(() => validateCritique(raw, contract)).toThrow(/objections\[0\].severity/)
  })

  // Nazwa tego testu mówi "bez cytatu", więc asercja musi obejmować KAŻDY
  // string, który cytatem nie jest - a `'   '` nie jest nim tak samo jak `''`.
  // Schemat agenta ma tylko `minLength: 1`, więc spacja przechodzi przez niego
  // bez uwag i dociera do wywołującego jako pełnoprawny `blocker`.
  it('rejects empty evidence - an objection without a quote is an opinion', () => {
    for (const evidence of ['', '   ', '\n\t', '\u00a0']) {
      const raw = { verdict: 'revise', objections: [objection({ evidence })], notes: 'x' }
      expect(() => validateCritique(raw, contract)).toThrow(/objections\[0\].evidence/)
    }
  })

  it.each(['rule', 'location', 'claim', 'evidence'] as const)(
    'rejects a whitespace-only %s - a blank field is a missing field',
    (key) => {
      const raw = { verdict: 'revise', objections: [objection({ [key]: '   ' })], notes: 'x' }
      expect(() => validateCritique(raw, contract)).toThrow(
        new RegExp(`objections\\[0\\]\\.${key}`),
      )
    },
  )

  it('rejects whitespace-only notes', () => {
    const raw = { verdict: 'revise', objections: [objection()], notes: ' \n\t ' }
    expect(() => validateCritique(raw, contract)).toThrow(/result\.notes/)
  })

  // `Array.isArray` przechodzi na tablicy z dziurą, a `.map()` dziurę ZACHOWUJE:
  // wywołujący dostawał wtedy `Objection[]`, w którym siedzi `undefined`, i
  // wywracał się dopiero na `o.severity`. Nieosiągalne przez `parseJsonLoosely`
  // (czyste `JSON.parse`), ale funkcja przyjmuje `unknown` - bramy nie stawia
  // się pod jedno znane wejście.
  it('rejects a sparse objections array - a hole is not an objection', () => {
    const sparse: unknown[] = [objection()]
    sparse[2] = objection({ severity: 'minor' })
    expect(sparse).toHaveLength(3)
    expect(1 in sparse).toBe(false)

    const raw = { verdict: 'revise', objections: sparse, notes: 'x' }
    expect(() => validateCritique(raw, contract)).toThrow(/objections\[1\]/)
  })

  it('accepts a clean artifact', () => {
    const raw = { verdict: 'accept', objections: [], notes: 'Nothing failed the four rules.' }
    expect(validateCritique(raw, contract).verdict).toBe('accept')
  })
})

// Test "cannot smuggle a fix back" pilnuje nietykalności ARTEFAKTU. Tu chodzi
// o coś innego i węższego: o surowe wejście krytyka. Funkcja jest dziś czysta
// i nie aliasuje - te testy istnieją po to, żeby została taka po następnej
// zmianie. Gdyby walidator kiedykolwiek zaczął przepisywać wejście w miejscu
// (trim, normalizacja, sortowanie obiekcji) albo oddawać tę samą referencję,
// wołający zobaczyłby zmutowaną odpowiedź modelu, a wspólna tablica dałaby się
// rozszerzyć po walidacji - czyli dokładnie tą drogą, którą walidator zamyka.
describe('validateCritique purity', () => {
  function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
      for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
      Object.freeze(value)
    }
    return value
  }

  it('does not touch its input', () => {
    const raw = {
      verdict: 'revise',
      objections: [objection(), objection({ severity: 'minor', rule: 'MAP-1' })],
      notes: 'Two problems.',
    }
    const before = JSON.stringify(raw)
    validateCritique(raw, contract)
    expect(JSON.stringify(raw)).toBe(before)
  })

  it('accepts a deeply frozen input without throwing', () => {
    const raw = deepFreeze({
      verdict: 'revise',
      objections: [objection()],
      notes: 'One band problem.',
    })
    expect(() => validateCritique(raw, contract)).not.toThrow()
    expect(validateCritique(raw, contract)).toEqual(raw)
  })

  it('returns fresh objects - nothing aliases the raw model output', () => {
    const raw = {
      verdict: 'revise',
      objections: [objection(), objection({ severity: 'minor', rule: 'MAP-1' })],
      notes: 'Two problems.',
    }
    const out = validateCritique(raw, contract)

    expect(out).not.toBe(raw)
    expect(out.objections).not.toBe(raw.objections)
    out.objections.forEach((o, i) => {
      expect(o).not.toBe(raw.objections[i])
      expect(o).toEqual(raw.objections[i])
    })

    // Dowód, że to nie jest kosmetyka: dopisanie do wyniku nie może wrócić do
    // wejścia i odwrotnie.
    out.objections.push({
      severity: 'minor',
      rule: 'MAP-1',
      location: 'mappings[1].decision',
      claim: 'Added after validation.',
      evidence: 'build',
    })
    expect(raw.objections).toHaveLength(2)
  })
})

// Ryzyko R12 od strony WYWOŁUJĄCEGO. `critique()` bierze kontrakt wyłącznie z
// `getStageContract`, więc dziś ta furtka jest zamknięta - ale `validateCritique`
// jest eksportowane z `src/critic.ts` i przy `critiqueRun` (krok 4.6) ktoś zbuduje
// kontrakt inline. Podrobiony obiekt strukturalnie spełnia `StageContract`, więc
// sam typ nie obroni niczego: zbiór reguł musi zgadzać się z ZAMROŻONYM rejestrem.
describe('validateCritique contract provenance', () => {
  const forged = { verdict: 'revise', objections: [objection({ rule: 'ANYTHING-GOES' })], notes: 'x' }

  it('rejects a hand-built contract carrying an invented rule', () => {
    const fake = {
      stage: 'mappings' as const,
      rules: [{ id: 'ANYTHING-GOES', text: 'Whatever the caller felt like.' }],
    }
    expect(() => validateCritique(forged, fake)).toThrow(/ANYTHING-GOES/)
  })

  it('rejects a contract that merely EXTENDS the registry', () => {
    const widened = {
      stage: 'mappings' as const,
      rules: [...contract.rules, { id: 'MAP-99', text: 'Smuggled in next to the real four.' }],
    }
    expect(() => validateCritique(forged, widened)).toThrow(/MAP-99/)
  })

  it('rejects a contract missing a rule of its own stage', () => {
    const narrowed = { stage: 'mappings' as const, rules: contract.rules.slice(0, 2) }
    const raw = { verdict: 'revise', objections: [objection()], notes: 'x' }
    expect(() => validateCritique(raw, narrowed)).toThrow(/MAP-3|MAP-4/)
  })

  it('rejects a contract whose rules belong to a different stage', () => {
    const swapped = { stage: 'mappings' as const, rules: getStageContract('audit').rules }
    const raw = { verdict: 'revise', objections: [objection({ rule: 'AUD-1' })], notes: 'x' }
    expect(() => validateCritique(raw, swapped)).toThrow(/AUD-1/)
  })

  // Jak w teście "rejects an unknown stage before anything reaches the model":
  // rzutowanie UDAJE hosta, który podał etap spoza rejestru.
  it('rejects a contract whose stage is not in the registry', () => {
    const raw = { verdict: 'revise', objections: [], notes: 'x' }
    const offStage = { stage: 'mapings' as unknown as StageName, rules: [] }
    expect(() => validateCritique({ ...raw, verdict: 'accept' }, offStage)).toThrow(/mapings/)
  })

  // Sprawdzamy TOŻSAMOŚĆ ZBIORU REGUŁ, nie referencję obiektu - `getStageContract`
  // oddaje nowy `{ stage, rules }` przy każdym wywołaniu, więc porównanie przez
  // `===` odrzucałoby nawet uczciwego wywołującego.
  it('accepts a faithful copy of the registry contract', () => {
    const copy = { stage: 'mappings' as const, rules: [...contract.rules] }
    const raw = { verdict: 'revise', objections: [objection()], notes: 'x' }
    expect(validateCritique(raw, copy)).toEqual(raw)
  })
})

describe('blockers', () => {
  it('returns only blocker-severity objections', () => {
    const c = {
      verdict: 'reject' as const,
      objections: [objection({ severity: 'blocker' }), objection()] as any,
      notes: 'x',
    }
    expect(blockers(c)).toHaveLength(1)
  })
})

describe('critique', () => {
  it('hands the agent exactly stage, artifact and contract', async () => {
    const seen: Array<{ id: string; input: any }> = []
    const client: LlmClient = {
      async runAgent(agent: AgentDefinition, input: unknown) {
        seen.push({ id: agent.id, input })
        return { verdict: 'accept', objections: [], notes: 'Clean.' }
      },
    }
    await critique(client, noTools, 'mappings', { mappings: [] })
    expect(seen[0].id).toBe('critic')
    expect(Object.keys(seen[0].input).sort()).toEqual(['artifact', 'contract', 'stage'])
    expect(seen[0].input.contract.rules.map((r: any) => r.id)).toContain('MAP-2')
  })

  // `StageName` znika przy kompilacji, a `critique()` jest publicznym API,
  // do którego host wchodzi własnym stringiem. Rzutowanie poniżej UDAJE
  // właśnie takiego hosta - to jedyny sposób, żeby w typowanym teście wyrazić
  // "ktoś podał etap, którego nie ma".
  it('rejects an unknown stage before anything reaches the model', async () => {
    let calls = 0
    const client: LlmClient = {
      async runAgent() {
        calls += 1
        return { verdict: 'accept', objections: [], notes: 'Clean.' }
      },
    }
    await expect(critique(client, noTools, 'mapings' as unknown as StageName, {})).rejects.toThrow(
      /mapings/,
    )
    expect(calls).toBe(0)
  })

  it('validates what the agent returned - an invented rule never reaches the caller', async () => {
    const client: LlmClient = {
      async runAgent() {
        return { verdict: 'revise', objections: [objection({ rule: 'MAP-42' })], notes: 'x' }
      },
    }
    await expect(critique(client, noTools, 'mappings', { mappings: [] })).rejects.toThrow(/MAP-42/)
  })

  // Żelazna zasada 4 / ryzyko R11, wyegzekwowane w kodzie: cokolwiek model
  // dopisze obok werdyktu - poprawiony artefakt, kwota, nowa decyzja - nie
  // przechodzi przez walidator, a artefakt wraca nietknięty.
  it('returns a verdict and nothing else - it cannot smuggle a fix back', async () => {
    const artifact = { mappings: [{ capability: 'quoting', confidence: '92%' }] }
    const snapshot = JSON.stringify(artifact)
    const client: LlmClient = {
      async runAgent() {
        return {
          verdict: 'revise',
          objections: [objection()],
          notes: 'x',
          patchedArtifact: { mappings: [{ capability: 'quoting', confidence: 'high' }] },
          estimatedSavings: 4200,
        }
      },
    }
    const result = await critique(client, noTools, 'mappings', artifact)
    expect(Object.keys(result).sort()).toEqual(['notes', 'objections', 'verdict'])
    expect(Object.keys(result.objections[0]).sort()).toEqual([
      'claim',
      'evidence',
      'location',
      'rule',
      'severity',
    ])
    expect(JSON.stringify(artifact)).toBe(snapshot)
  })
})
