/** @jest-environment node */
import { getAgent } from '../agentLoader'
import { assertStrictModeCompatible } from './helpers/strictMode'


describe('agents/sandbox_engineer.json', () => {
  it('declares no tools - it selects templates, it does not call anything', () => {
    const agent = getAgent('sandbox_engineer')
    expect(agent.tools).toEqual([])
    expect(agent.resultKind).toBe('research')
  })

  it('constrains screen kinds to the three shipped templates', () => {
    const agent = getAgent('sandbox_engineer')
    const schema = agent.resultSchema as any
    expect(schema.properties.screens.items.properties.kind.enum).toEqual(['dashboard', 'list', 'detail'])
  })

  it('has a strict-mode compatible result schema', () => {
    assertStrictModeCompatible(getAgent('sandbox_engineer').resultSchema)
  })
})

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generatePreview, planScreens } from '../sandboxEngineer'
import type { AgentDefinition, ToolDefinition } from '../agentLoader'
import type { LlmClient, ToolExecutor } from '../llmClient'

/**
 * Zapis jednego wywołania agenta. Samo `agent.id` nie wystarczy do
 * udowodnienia zasady 5 (SPEC.md §2): trzeba jeszcze pokazać, że dane
 * jadą JAWNIE w `input`, a nie bokiem przez historię rozmowy, i że agent
 * nie dostaje ani jednego narzędzia - w tym `web_search`.
 */
type RecordedCall = { agentId: string; input: unknown; toolNames: string[] }

function fakeClient(screens: unknown): {
  client: LlmClient
  seen: string[]
  calls: RecordedCall[]
} {
  const seen: string[] = []
  const calls: RecordedCall[] = []
  const client: LlmClient = {
    async runAgent(agent: AgentDefinition, input: unknown, tools: ToolDefinition[]) {
      seen.push(agent.id)
      calls.push({ agentId: agent.id, input, toolNames: tools.map((tool) => tool.name) })
      return { screens }
    },
  }
  return { client, seen, calls }
}

const noTools: ToolExecutor = async () => ({ results: [] })
const emptyInput = { company: {}, blueprint: {}, mappings: [] }

/**
 * Poprawny ekran listy. Każda komórka MUSI używać etykiety zadeklarowanej w
 * `columns` - `validateScreens` odrzuca komórkę spoza `columns`, bo
 * `renderTable` po cichu gubi taki wiersz.
 */
const listScreen = (title: string, value: string) => ({
  name: 'deals',
  kind: 'list',
  title,
  columns: ['Name'],
  rows: [{ cells: [{ column: 'Name', value }] }],
})

/**
 * Sprzątanie BEZ `recursive`: podgląd zapisuje wyłącznie płaskie pliki
 * `.html` w `out`, więc pętla po wpisach jest zupełna i nie może skasować
 * niczego, czego test sam nie stworzył.
 */
function removeFlatDir(dir: string): void {
  for (const entry of readdirSync(dir)) unlinkSync(join(dir, entry))
  rmdirSync(dir)
}

/**
 * `parent` jest tu równie ważny jak `outDir` - ten sam powód co w
 * `renderPreview.test.ts`: asercja wyłącznie na `readdirSync(outDir)` jest
 * ślepa na plik wypuszczony do katalogu-rodzica.
 */
function withTempDir(run: (outDir: string, parent: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const parent = mkdtempSync(join(tmpdir(), 'mercatify-gen-'))
    const outDir = join(parent, 'out')
    mkdirSync(outDir)
    try {
      await run(outDir, parent)
    } finally {
      removeFlatDir(outDir)
      rmdirSync(parent)
    }
  }
}

describe('planScreens', () => {
  it('calls the sandbox_engineer agent and returns its screens', async () => {
    const { client, seen, calls } = fakeClient([
      {
        name: 'dashboard',
        kind: 'dashboard',
        title: 'Voltix',
        columns: ['Metric'],
        rows: [{ cells: [{ column: 'Metric', value: '7 tools' }] }],
      },
    ])

    const result = await planScreens(client, noTools, emptyInput)

    expect(seen).toEqual(['sandbox_engineer'])
    expect(result.screens[0].name).toBe('dashboard')

    // Zasada 5 (SPEC.md §2): dane jadą jawnie w `input`, nie kanałem
    // agent-agent, a agent nie dostaje żadnego narzędzia - w tym sieci.
    expect(calls).toHaveLength(1)
    // `toEqual(emptyInput)` porównywałoby obiekt sam ze sobą i przechodziło
    // także wtedy, gdy wrapper oddaje wejście wywołującego w całości. Liczy
    // się, że do promptu trafiają DOKŁADNIE trzy klucze kontraktu.
    expect(Object.keys(calls[0].input as object).sort()).toEqual([
      'blueprint',
      'company',
      'mappings',
    ])
    expect(calls[0].toolNames).toEqual([])
  })

  it('throws instead of returning a lie when the agent breaks the schema', async () => {
    const { client } = fakeClient([
      { name: 'deals', kind: 'kanban', title: 'x', columns: ['A'], rows: [] },
    ])
    await expect(planScreens(client, noTools, emptyInput)).rejects.toThrow(/screens\[0\]\.kind/)
  })
})

describe('generatePreview', () => {
  it(
    'renders the agent-selected screens through the deterministic templates',
    withTempDir(async (outDir) => {
      const { client } = fakeClient([listScreen('Deals', 'Voltix retrofit')])

      const manifest = await generatePreview(client, noTools, emptyInput, outDir)

      expect(manifest.screens).toEqual([{ name: 'deals', path: 'deals.html' }])
      expect(readFileSync(join(outDir, 'deals.html'), 'utf8')).toContain('<td>Voltix retrofit</td>')
    }),
  )

  it(
    'escapes markup an agent tried to smuggle into a title',
    withTempDir(async (outDir) => {
      const { client } = fakeClient([listScreen('<script>x</script>', 'ok')])

      await generatePreview(client, noTools, emptyInput, outDir)

      const html = readFileSync(join(outDir, 'deals.html'), 'utf8')
      expect(html).not.toContain('<script>x</script>')
      // Mocniej niż plan: w pliku nie ma ANI JEDNEGO otwarcia `<script`,
      // więc nie da się przejść tego testu samym przecięciem tagu.
      expect(html).not.toContain('<script')
      expect(html).toContain('&lt;script&gt;')
    }),
  )

  it(
    'writes nothing when the agent returns zero screens',
    withTempDir(async (outDir, parent) => {
      const { client } = fakeClient([])

      await expect(generatePreview(client, noTools, emptyInput, outDir)).rejects.toThrow(
        /at least one/i,
      )

      expect(readdirSync(outDir)).toEqual([])
      expect(readdirSync(parent)).toEqual(['out'])
    }),
  )

  it(
    'writes nothing when two screens share a name',
    withTempDir(async (outDir, parent) => {
      const { client } = fakeClient([listScreen('Deals', 'a'), listScreen('Deals', 'b')])

      await expect(generatePreview(client, noTools, emptyInput, outDir)).rejects.toThrow(
        /duplicate/i,
      )

      expect(readdirSync(outDir)).toEqual([])
      expect(readdirSync(parent)).toEqual(['out'])
    }),
  )
})

/**
 * SPEC.md §11.1 mówi, że wejściem Sandbox Engineera jest `ConsolidationResult`,
 * więc najbardziej naturalne wywołanie fali 4 i Etapu 4 niesie także
 * `scenario` i `narrative`. Wcześniej wrapper oddawał obiekt wywołującego
 * wprost do `runAgent`, a `JSON.stringify` wkładał oba do promptu.
 */
describe('zasada 5 - do promptu jada wylacznie pola kontraktu', () => {
  it('nie przepuszcza scenario ani narrative z ConsolidationResult', async () => {
    const { client, calls } = fakeClient([
      { name: 'dashboard', kind: 'dashboard', title: 'D', columns: ['A'], rows: [] },
    ])

    const consolidationResult = {
      company: { name: 'Voltix' },
      blueprint: { customScreens: [] },
      mappings: [],
      scenario: { netAnnualSaving: 21000, netPaybackMonths: 6.9 },
      narrative: { architectRationale: 'tekst napisany przez innego agenta' },
    }

    await planScreens(client, noTools, consolidationResult as never)

    const sent = calls[0].input as Record<string, unknown>
    expect(Object.keys(sent).sort()).toEqual(['blueprint', 'company', 'mappings'])
    expect(sent).not.toHaveProperty('scenario')
    expect(sent).not.toHaveProperty('narrative')

    // Dowód na tym, co faktycznie leci na drut (`llmClient.ts` robi
    // `JSON.stringify(input)`), a nie tylko na kształcie obiektu.
    const wire = JSON.stringify(sent)
    expect(wire).not.toContain('21000')
    expect(wire).not.toContain('architectRationale')
  })
})
