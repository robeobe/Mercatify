/** @jest-environment node */
import { getAgent, getAgentTools } from '../agentLoader'
import type { AgentDefinition, ToolDefinition } from '../agentLoader'
import type { LlmClient, ToolExecutor } from '../llmClient'
import type { PreviewManifest } from '../preview/renderPreview'
import { assertStrictModeCompatible } from './helpers/strictMode'
import { verifyGoldenPath, DEFAULT_GOLDEN_PATH } from '../qaVerifier'

/** Żaden test tutaj nie dotyka sieci - fake `LlmClient` i fake `ToolExecutor`. */
const noTools: ToolExecutor = async () => ({ results: [] })

const manifest: PreviewManifest = {
  screens: [{ name: 'deals', path: 'deals.html' }],
  generatedAt: '2026-09-19T10:00:00.000Z',
}

const emptyManifest: PreviewManifest = { screens: [], generatedAt: '2026-09-19T10:00:00.000Z' }

interface SeenCall {
  id: string
  input: any
  tools: ToolDefinition[]
}

function fakeClient(raw: unknown, seen: SeenCall[] = []): LlmClient {
  return {
    async runAgent(agent: AgentDefinition, input: unknown, tools: ToolDefinition[]) {
      seen.push({ id: agent.id, input, tools })
      return raw
    },
  }
}

/** Skrót na najczęstsze wywołanie: jeden manifest, domyślny golden path. */
function run(raw: unknown, goldenPath: unknown = DEFAULT_GOLDEN_PATH) {
  return verifyGoldenPath(fakeClient(raw), noTools, {
    manifest: emptyManifest,
    goldenPath: goldenPath as string[],
  })
}

describe('agents/qa.json', () => {
  it('declares no tools and allows only ready/blocked', () => {
    const agent = getAgent('qa')
    expect(agent.tools).toEqual([])
    // Od strony wywołania, nie tylko deklaracji: lista narzędzi podana modelowi
    // też jest pusta, więc QA nie ma czym sięgnąć poza to, co dostał w `input`.
    expect(getAgentTools(agent)).toEqual([])
    expect((agent.resultSchema as any).properties.verdict.enum).toEqual(['ready', 'blocked'])
  })

  it('is strict-mode compatible - every property required, object closed', () => {
    const schema = getAgent('qa').resultSchema as any
    expect(schema.additionalProperties).toBe(false)
    expect([...schema.required].sort()).toEqual(['blockedAtStep', 'notes', 'verdict'])
    // Wspólny strażnik - jedna kopia dla wszystkich deskryptorów, rekurencyjna
    // także przez `anyOf`/`oneOf`/`allOf`/`$defs`.
    assertStrictModeCompatible(schema)
  })

  it('carries the full descriptor field set and a sample input shaped like QaInput', () => {
    const agent = getAgent('qa')
    expect(Object.keys(agent).sort()).toEqual([
      'description',
      'id',
      'instructions',
      'label',
      'resultKind',
      'resultSchema',
      'role',
      'sampleInput',
      'tools',
    ])
    expect(agent.resultKind).toBe('research')
    expect(Object.keys(agent.sampleInput as object).sort()).toEqual(['goldenPath', 'manifest'])
  })
})

describe('verifyGoldenPath', () => {
  it('passes the manifest and golden path to the qa agent and returns its verdict', async () => {
    const seen: SeenCall[] = []
    const client = fakeClient(
      { verdict: 'blocked', blockedAtStep: 'Quote', notes: 'No quote screen in the manifest.' },
      seen,
    )
    const result = await verifyGoldenPath(client, noTools, {
      manifest,
      goldenPath: DEFAULT_GOLDEN_PATH,
    })
    expect(seen[0].id).toBe('qa')
    expect(seen[0].input.goldenPath).toContain('Quote')
    expect(result.verdict).toBe('blocked')
    expect(result.blockedAtStep).toBe('Quote')
  })

  // Żelazna zasada 5 (SPEC.md §2): agent nie rozmawia z agentem. Manifest
  // Sandbox Engineera dociera do QA JAWNIE w `input`, nigdy historią rozmowy -
  // i nic poza tymi dwoma polami nie ma jak się tam przemycić.
  it('hands the agent exactly manifest and goldenPath - no conversation history', async () => {
    const seen: SeenCall[] = []
    const client = fakeClient({ verdict: 'ready', blockedAtStep: '', notes: 'ok' }, seen)
    await verifyGoldenPath(client, noTools, { manifest, goldenPath: DEFAULT_GOLDEN_PATH })
    expect(Object.keys(seen[0].input).sort()).toEqual(['goldenPath', 'manifest'])
    expect(seen[0].input.manifest).toEqual(manifest)
    expect(seen[0].tools).toEqual([])
  })

  it('normalizes a ready verdict to an empty blockedAtStep', async () => {
    const client: LlmClient = {
      async runAgent() {
        return { verdict: 'ready', blockedAtStep: '', notes: 'Every step is covered.' }
      },
    }
    const result = await verifyGoldenPath(client, noTools, {
      manifest: emptyManifest,
      goldenPath: DEFAULT_GOLDEN_PATH,
    })
    expect(result).toEqual({ verdict: 'ready', blockedAtStep: '', notes: 'Every step is covered.' })
  })

  // Punkt 4 z "Done when" od strony modelu, który pola NIE wypełnił zgodnie z
  // kontraktem. Dla `ready` to pole nic nie niesie, więc brak klucza, spacja i
  // wypełniacz w rodzaju "n/a" znaczą to samo co `''` - ale wywołujący dostaje
  // string, nigdy `undefined`.
  it.each([
    ['klucza brak', { verdict: 'ready', notes: 'ok' }],
    ['undefined', { verdict: 'ready', blockedAtStep: undefined, notes: 'ok' }],
    ['spacje', { verdict: 'ready', blockedAtStep: '   ', notes: 'ok' }],
    ['wypełniacz', { verdict: 'ready', blockedAtStep: 'n/a', notes: 'ok' }],
    ['liczba', { verdict: 'ready', blockedAtStep: 42, notes: 'ok' }],
  ])('returns blockedAtStep as an empty string when a ready verdict carries %s', async (_label, raw) => {
    const result = await run(raw)
    expect(result.blockedAtStep).toBe('')
    expect(typeof result.blockedAtStep).toBe('string')
    expect(result).toStrictEqual({ verdict: 'ready', blockedAtStep: '', notes: 'ok' })
  })

  // Wypełniacz to szum, ale NAZWA KROKU Z GOLDEN PATH to sprzeczność: "gotowe,
  // zablokowane na Quote" nie jest werdyktem, na którym da się oprzeć decyzję.
  // Ciche zwrócenie `ready` przepuściłoby podgląd, o którym model sam napisał,
  // że jest niepełny.
  it('rejects a ready verdict that names a real golden path step', async () => {
    await expect(run({ verdict: 'ready', blockedAtStep: 'Quote', notes: 'ok' })).rejects.toThrow(
      /qa\.blockedAtStep/,
    )
  })

  it('rejects a blocked verdict pointing at a step that is not on the golden path', async () => {
    const client: LlmClient = {
      async runAgent() {
        return { verdict: 'blocked', blockedAtStep: 'Invoicing', notes: 'made up' }
      },
    }
    await expect(
      verifyGoldenPath(client, noTools, {
        manifest: emptyManifest,
        goldenPath: DEFAULT_GOLDEN_PATH,
      }),
    ).rejects.toThrow(/Invoicing/)
  })

  // `.trim()`, nie `.length`. Schemat agenta nie stawia na tym polu żadnego
  // `minLength`, więc `'   '` przechodzi przez strict mode bez uwag i dociera
  // do wywołującego jako pełnoprawny `blocked` bez wskazania kroku - czyli
  // dokładnie ten sam brak informacji co pusty string.
  it.each(['', '   ', '\n\t', ' '])(
    'rejects a blocked verdict whose blockedAtStep is blank (%j)',
    async (blockedAtStep) => {
      await expect(run({ verdict: 'blocked', blockedAtStep, notes: 'x' })).rejects.toThrow(
        /qa\.blockedAtStep/,
      )
    },
  )

  // Blank jest odrzucany NIEZALEŻNIE od golden path: gdyby wywołujący podał
  // krok złożony z samych spacji, `includes` powiedziałoby "jest na liście".
  // Ta sama brama stoi po stronie wejścia (test o wadliwym goldenPath), ale
  // walidator wyniku nie opiera się na tym, że ktoś ją przeszedł.
  it('rejects a blank blockedAtStep even if the golden path itself contains blanks', async () => {
    await expect(run({ verdict: 'blocked', blockedAtStep: '   ', notes: 'x' }, ['   ', 'Quote'])).rejects.toThrow(
      /goldenPath/,
    )
  })

  // Porównanie jest DOKŁADNE - bez `trim()`, bez zmiany wielkości liter, bez
  // obcinania interpunkcji. Normalizacja kusi, ale zamienia głośny błąd w cichą
  // zgadywankę: "quote" mogłoby znaczyć krok "Quote" albo nazwę ekranu, a
  // wywołujący porównuje potem ten string z własną listą kroków. Model dostaje
  // w instrukcji wprost "copied CHARACTER FOR CHARACTER".
  it.each([' Quote ', 'quote', 'QUOTE', 'Quote.', 'Quote step'])(
    'compares blockedAtStep exactly - %j is not "Quote"',
    async (blockedAtStep) => {
      await expect(run({ verdict: 'blocked', blockedAtStep, notes: 'x' })).rejects.toThrow(
        /qa\.blockedAtStep/,
      )
    },
  )

  it.each(['', '   ', '\n\t', 42, undefined])(
    'rejects a verdict with unusable notes (%j)',
    async (notes) => {
      await expect(run({ verdict: 'ready', blockedAtStep: '', notes })).rejects.toThrow(/qa\.notes/)
    },
  )

  it.each([
    ['nieznany werdykt', { verdict: 'maybe', blockedAtStep: '', notes: 'x' }],
    ['brak werdyktu', { blockedAtStep: '', notes: 'x' }],
    ['werdykt inną wielkością liter', { verdict: 'Ready', blockedAtStep: '', notes: 'x' }],
  ])('rejects %s with the field name in the message', async (_label, raw) => {
    await expect(run(raw)).rejects.toThrow(/qa\.verdict/)
  })

  it.each([null, 'ready', 42, ['ready']])(
    'rejects a non-object agent answer (%j)',
    async (raw) => {
      await expect(run(raw)).rejects.toThrow(/\[mercatify-labs\] qa/)
    },
  )

  // Wynik jest BUDOWANY OD NOWA, nie przepisywany z referencji. Gdyby wracał
  // ten sam obiekt, mutacja u wywołującego sięgałaby surowej odpowiedzi modelu
  // (i odwrotnie), a pola, których nie ma w kontrakcie - podrzucony werdykt,
  // kwota, "poprawiony" manifest - jechałyby dalej razem z nim.
  it('returns a fresh object - nothing aliases the raw agent answer', async () => {
    const raw: Record<string, unknown> = {
      verdict: 'blocked',
      blockedAtStep: 'Quote',
      notes: 'No quote screen.',
      patchedManifest: { screens: [{ name: 'quote', path: 'quote.html' }] },
      estimatedSavings: 4200,
    }
    const snapshot = JSON.stringify(raw)
    const result = await run(raw)

    expect(result).not.toBe(raw)
    expect(Object.keys(result).sort()).toEqual(['blockedAtStep', 'notes', 'verdict'])

    result.notes = 'zmienione po walidacji'
    result.blockedAtStep = 'Approval'
    expect(JSON.stringify(raw)).toBe(snapshot)
  })

  it('does not mutate the agent answer - a deeply frozen result passes', async () => {
    const raw = Object.freeze({ verdict: 'blocked', blockedAtStep: 'Deal', notes: 'No deal screen.' })
    await expect(run(raw)).resolves.toStrictEqual({
      verdict: 'blocked',
      blockedAtStep: 'Deal',
      notes: 'No deal screen.',
    })
  })

  // Wadliwy golden path ma kosztować komunikat, a nie trzy minuty mielenia
  // modelu na liście, której nie da się potem użyć do niczego: bez niej
  // sprawdzenie kroku z werdyktu `blocked` jest puste.
  it.each([
    ['pusta tablica', []],
    ['nie tablica', 'Lead,Customer'],
    ['null', null],
    ['pusty krok', ['Lead', '']],
    ['krok ze spacji', ['Lead', '   ']],
    ['krok nie-string', ['Lead', 7]],
  ])('rejects %s as goldenPath before the model is called', async (_label, goldenPath) => {
    let calls = 0
    const client: LlmClient = {
      async runAgent() {
        calls += 1
        return { verdict: 'ready', blockedAtStep: '', notes: 'ok' }
      },
    }
    await expect(
      verifyGoldenPath(client, noTools, {
        manifest: emptyManifest,
        goldenPath: goldenPath as string[],
      }),
    ).rejects.toThrow(/goldenPath/)
    expect(calls).toBe(0)
  })

  // `Array.isArray` przechodzi na tablicy z dziurą, a `forEach` dziurę POMIJA -
  // walidacja po `forEach` przepuściłaby golden path z `undefined` w środku i
  // wywróciłaby się dopiero przy porównaniu kroku.
  it('rejects a sparse goldenPath - a hole is not a step', async () => {
    const sparse: unknown[] = ['Lead']
    sparse[2] = 'Quote'
    expect(sparse).toHaveLength(3)
    expect(1 in sparse).toBe(false)

    await expect(
      verifyGoldenPath(fakeClient({ verdict: 'ready', blockedAtStep: '', notes: 'ok' }), noTools, {
        manifest: emptyManifest,
        goldenPath: sparse as string[],
      }),
    ).rejects.toThrow(/goldenPath\[1\]/)
  })

  it('accepts a caller-supplied golden path instead of the default one', async () => {
    const goldenPath = ['Intake', 'Triage', 'Dispatch']
    const result = await run({ verdict: 'blocked', blockedAtStep: 'Dispatch', notes: 'x' }, goldenPath)
    expect(result.blockedAtStep).toBe('Dispatch')
    // Krok z DOMYŚLNEJ listy nie jest automatycznie legalny - liczy się ta,
    // którą podał wywołujący.
    await expect(run({ verdict: 'blocked', blockedAtStep: 'Quote', notes: 'x' }, goldenPath)).rejects.toThrow(
      /Quote/,
    )
  })

  it('ships a default golden path matching the original Mercatify spec', () => {
    expect(DEFAULT_GOLDEN_PATH).toEqual(['Lead', 'Customer', 'Deal', 'Vertical step', 'Quote', 'Approval'])
  })
})

/**
 * Naprawy po trzecim audycie adversarialnym. Każdy przypadek poniżej
 * PRZECHODZIŁ przez poprzednią wersję bramy.
 */
describe('sprzecznosc "ready + krok golden path" - odpornosc na dryf pisowni', () => {
  it.each([
    ['dokladny', 'Quote'],
    ['inna wielkosc liter', 'quote'],
    ['wersaliki', 'QUOTE'],
    ['biale znaki', '  Quote  '],
    ['kropka na koncu', 'Quote.'],
    ['krok w zdaniu', 'Quote step'],
  ])('odrzuca ready z blockedAtStep w pisowni: %s', async (_label, step) => {
    await expect(
      run({ verdict: 'ready', blockedAtStep: step, notes: 'brak ekranu Quote' }),
    ).rejects.toThrow(/cannot name a blocking step/)
  })

  it.each([
    ['szum bez znaczenia', 'n/a'],
    ['pusty', ''],
    ['sam bialy znak', '   '],
    ['krok podobny, ale nie ten', 'Quotes of the day'],
  ])('nadal koercuje do pustego stringa: %s', async (_label, step) => {
    const result = await run({ verdict: 'ready', blockedAtStep: step, notes: 'ok' })
    expect(result).toEqual({ verdict: 'ready', blockedAtStep: '', notes: 'ok' })
  })

  it('nie myli kroku "Deal" z wyrazem "Deals" - granice slow, nie podciag', async () => {
    const result = await run({ verdict: 'ready', blockedAtStep: 'Deals list', notes: 'ok' })
    expect(result.verdict).toBe('ready')
  })
})

describe('golden path jest kopiowany, nie wspoldzielony', () => {
  it('DEFAULT_GOLDEN_PATH jest zamrozony', () => {
    expect(() => (DEFAULT_GOLDEN_PATH as string[]).push('Invoicing')).toThrow()
    expect(DEFAULT_GOLDEN_PATH).toHaveLength(6)
  })

  it('klient dopisujacy krok do otrzymanej listy nie przepycha wymyslonego werdyktu', async () => {
    const rogue: LlmClient = {
      async runAgent(_agent, input: any) {
        input.goldenPath.push('Invoicing')
        return { verdict: 'blocked', blockedAtStep: 'Invoicing', notes: 'wymyslony krok' }
      },
    }
    const steps = [...DEFAULT_GOLDEN_PATH]
    await expect(
      verifyGoldenPath(rogue, noTools, { manifest, goldenPath: steps }),
    ).rejects.toThrow(/is not one of the golden path steps/)
    expect(steps).toHaveLength(6)
    expect(DEFAULT_GOLDEN_PATH).toHaveLength(6)
  })
})

describe('manifest ma wlasna brame, tak jak golden path', () => {
  const withManifest = (m: unknown, seen: SeenCall[] = []) =>
    verifyGoldenPath(fakeClient({ verdict: 'ready', blockedAtStep: '', notes: 'ok' }, seen), noTools, {
      manifest: m as PreviewManifest,
      goldenPath: DEFAULT_GOLDEN_PATH,
    })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['tablica', []],
    ['string', 'manifest'],
  ])('odrzuca manifest: %s', async (_label, value) => {
    await expect(withManifest(value)).rejects.toThrow(/input\.manifest/)
  })

  it('nie wola modelu, gdy manifest jest niepoprawny', async () => {
    const seen: SeenCall[] = []
    await expect(withManifest(undefined, seen)).rejects.toThrow(/input\.manifest/)
    expect(seen).toHaveLength(0)
  })

  it('odrzuca wpis ekranu bez name albo path', async () => {
    await expect(
      withManifest({ screens: [{ path: 'deals.html' }], generatedAt: 'x' }),
    ).rejects.toThrow(/screens\[0\]\.name/)
    await expect(
      withManifest({ screens: [{ name: 'deals' }], generatedAt: 'x' }),
    ).rejects.toThrow(/screens\[0\]\.path/)
  })

  it('odrzuca rzadka liste ekranow', async () => {
    const sparse: unknown[] = [{ name: 'a', path: 'a.html' }]
    sparse[3] = { name: 'b', path: 'b.html' }
    await expect(withManifest({ screens: sparse, generatedAt: 'x' })).rejects.toThrow(/dense array/)
  })

  it('nie przepuszcza pol doklejonych WEWNATRZ manifestu do promptu', async () => {
    const seen: SeenCall[] = []
    await withManifest(
      { screens: [{ name: 'deals', path: 'deals.html', secret: 'sk-live-123' }], generatedAt: 'x', secret: 'sk-live-123' },
      seen,
    )
    expect(JSON.stringify(seen[0].input)).not.toContain('sk-live-123')
  })
})

describe('TOCTOU - kazde pole werdyktu czytane raz', () => {
  it('nie wypuszcza kroku spoza golden path podmienionego przez getter', async () => {
    let reads = 0
    const rogue = {
      verdict: 'blocked',
      get blockedAtStep() {
        reads += 1
        return reads > 1 ? 'Invoicing' : 'Deal'
      },
      notes: 'brak ekranu',
    }
    const result = await verifyGoldenPath(fakeClient(rogue), noTools, {
      manifest,
      goldenPath: DEFAULT_GOLDEN_PATH,
    })
    expect(result.blockedAtStep).toBe('Deal')
    expect(DEFAULT_GOLDEN_PATH).toContain(result.blockedAtStep)
  })
})
