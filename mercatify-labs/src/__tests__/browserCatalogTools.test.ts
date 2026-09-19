/** @jest-environment node */
/**
 * `CATALOG_TOOLS` - katalog, który naprawdę czytają strony.
 *
 * `catalogIntegrity.test.ts` pilnuje, że literał w `assets/stack-tool/catalog.js`
 * nie rozjeżdża się z `src/catalogData.json`. To jest obrona przed rozjazdem,
 * ale nie usunięcie duplikatu: dopóki strony renderowały werdykty Z LITERAŁU,
 * kanoniczny JSON był drugim opisem tego samego, a nie źródłem.
 *
 * Po scaleniu strony czytają `CATALOG_TOOLS` z `assets/shared/catalog.generated.js` -
 * tę samą strukturę modułów, ale z werdyktami wziętymi z JSON-a. Ten plik
 * sprawdza dwie rzeczy, których tamten test sprawdzić nie może:
 *
 *  1. Złączenie jest PEŁNE: każdy moduł literału ma odpowiednik, z tym samym
 *     `id`, `name`, `desc` i tym samym zestawem slugów. Bez tego "przepięcie"
 *     oznaczałoby ciche zgubienie połowy kart na `intake.html`.
 *  2. Werdykt w `CATALOG_TOOLS` pochodzi z JSON-a, nie z literału. Sprawdzamy
 *     to wprost, czytając JSON - porównanie z literałem odpowiadałoby tylko na
 *     pytanie "czy dwie kopie są zgodne", czyli na pytanie starego testu.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

const PACKAGE_ROOT = resolve(__dirname, '../..')
const GENERATOR = resolve(PACKAGE_ROOT, 'scripts/generate-browser-catalog.mjs')
const CATALOG_JSON = resolve(PACKAGE_ROOT, 'src/catalogData.json')
const CATALOG_JS = resolve(PACKAGE_ROOT, '../assets/stack-tool/catalog.js')
const GENERATED_JS = resolve(PACKAGE_ROOT, '../assets/shared/catalog.generated.js')

interface BrowserModule {
  id: string
  name: string
  desc: string
  caps: string[]
  om: string
  verdict: string
  conf: string
}
interface BrowserTool {
  id: string
  name: string
  kind: string
  modules: BrowserModule[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Ładuje wygenerowaną kopię tak, jak zrobiłby to `<script src="...">`: pusty
 * kontekst, tylko `window`. Pakiet ma się przypiąć do globalnego zasięgu i nie
 * potrzebować niczego z Node'a.
 */
function loadGenerated(): { CATALOG_TOOLS: BrowserTool[]; CATALOG_CAPABILITIES: unknown } {
  const sandbox: Record<string, unknown> = {}
  sandbox.window = sandbox
  runInNewContext(readFileSync(GENERATED_JS, 'utf8'), sandbox, { filename: 'catalog.generated.js' })
  const tools = sandbox.CATALOG_TOOLS
  if (!Array.isArray(tools)) throw new Error('catalog.generated.js nie wystawił CATALOG_TOOLS')
  return { CATALOG_TOOLS: tools as BrowserTool[], CATALOG_CAPABILITIES: sandbox.CATALOG_CAPABILITIES }
}

/** Literał z `catalog.js` - ta sama sztuczka z zasięgiem, co w generatorze. */
function loadLiteral(): BrowserTool[] {
  const source = readFileSync(CATALOG_JS, 'utf8')
  const value: unknown = runInNewContext(`${source};({ CATALOG })`, {})
  if (!isRecord(value) || !Array.isArray(value.CATALOG)) throw new Error('catalog.js: brak CATALOG')
  return value.CATALOG as BrowserTool[]
}

const generated = loadGenerated()
const literal = loadLiteral()
const canonical: unknown = JSON.parse(readFileSync(CATALOG_JSON, 'utf8'))

describe('katalog dla przeglądarki', () => {
  it('jest aktualny wobec generatora', () => {
    const fresh = execFileSync(process.execPath, [GENERATOR, '--stdout'], {
      encoding: 'utf8',
      cwd: PACKAGE_ROOT,
      maxBuffer: 32 * 1024 * 1024,
    })
    expect(readFileSync(GENERATED_JS, 'utf8')).toBe(fresh)
  })

  it('wychodzi na globalny zasięg tylko pod dwiema nazwami', () => {
    const sandbox: Record<string, unknown> = {}
    sandbox.window = sandbox
    runInNewContext(readFileSync(GENERATED_JS, 'utf8'), sandbox)
    // CAPS i OM_TARGETS NIE mogą tu być: `assets/stack-tool/catalog.js`
    // deklaruje je jako `const`, a druga deklaracja tej samej nazwy w kolejnym
    // klasycznym skrypcie wywala parser CAŁEGO pliku.
    expect(Object.keys(sandbox).sort()).toEqual(['CATALOG_CAPABILITIES', 'CATALOG_TOOLS', 'window'])
  })
})

describe('CATALOG_TOOLS wobec struktury z catalog.js', () => {
  it('niesie te same narzędzia, w tej samej kolejności', () => {
    expect(generated.CATALOG_TOOLS.map((tool) => tool.id)).toEqual(literal.map((tool) => tool.id))
    expect(generated.CATALOG_TOOLS.length).toBeGreaterThan(10)
  })

  it('niesie każdy moduł z jego warstwą prezentacyjną - nic się nie gubi po drodze', () => {
    const shapeOf = (tools: BrowserTool[]): string[] =>
      tools.flatMap((tool) =>
        tool.modules.map(
          (module) =>
            `${tool.id}.${module.id}|${module.name}|${module.desc}|${[...module.caps].join(',')}`,
        ),
      )
    expect(shapeOf(generated.CATALOG_TOOLS)).toEqual(shapeOf(literal))
  })
})

describe('werdykty w CATALOG_TOOLS', () => {
  /** Werdykt czytelnika: `reportVerdict` wygrywa z `decision`, jak w raporcie. */
  function canonicalEntry(tool: string, slug: string): Record<string, unknown> {
    if (!isRecord(canonical)) throw new Error('catalogData.json nie jest obiektem')
    const toolEntry = canonical[tool]
    if (!isRecord(toolEntry) || !isRecord(toolEntry.capabilities)) {
      throw new Error(`catalogData.json nie zna narzędzia ${tool}`)
    }
    const entry = toolEntry.capabilities[slug]
    if (!isRecord(entry)) throw new Error(`catalogData.json nie zna pary ${tool}.${slug}`)
    return entry
  }

  it('pochodzą z catalogData.json, a nie z literału obok', () => {
    const wrong = generated.CATALOG_TOOLS.flatMap((tool) =>
      tool.modules.flatMap((module) => {
        const slug = module.caps[0]
        if (slug === undefined) return []
        const entry = canonicalEntry(tool.name, slug)
        const verdict = Object.hasOwn(entry, 'reportVerdict') ? entry.reportVerdict : entry.decision
        const problems: string[] = []
        if (module.om !== entry.target) problems.push(`om ${module.om} != ${String(entry.target)}`)
        if (module.verdict !== verdict) problems.push(`verdict ${module.verdict} != ${String(verdict)}`)
        if (module.conf !== entry.confidence) {
          problems.push(`conf ${module.conf} != ${String(entry.confidence)}`)
        }
        return problems.length === 0 ? [] : [`${tool.name}.${module.id}: ${problems.join('; ')}`]
      }),
    )
    expect(wrong).toEqual([])
  })

  it('niosą werdykt drop tam, gdzie niesie go JSON', () => {
    const dropped = generated.CATALOG_TOOLS.flatMap((tool) =>
      tool.modules.filter((module) => module.verdict === 'drop').map((module) => `${tool.name}.${module.id}`),
    )
    expect(dropped.sort()).toEqual(['Intercom.tours', 'PandaDoc.analytics'])
  })

  it('żaden moduł nie został bez werdyktu - pusty znaczyłby cichą lukę w złączeniu', () => {
    const blank = generated.CATALOG_TOOLS.flatMap((tool) =>
      tool.modules
        .filter((module) => module.om === '' || module.verdict === '' || module.conf === '')
        .map((module) => `${tool.name}.${module.id}`),
    )
    expect(blank).toEqual([])
  })
})
