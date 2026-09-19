/** @jest-environment node */
/**
 * Spójność katalogu po scaleniu dwóch rozjechanych źródeł.
 *
 * Do scalenia `assets/stack-tool/catalog.js` i `src/catalogData.json` opisywały
 * to samo w dwóch słownikach i nic tego nie porównywało - rozjazd rósł po
 * cichu. Ten plik jest tym porównaniem: JSON wolno rozszerzać, ale tylko o
 * slugi z `CAPS` i cele z `OM_TARGETS`, a kopia dla przeglądarki ma nadążać.
 *
 * Czyta surowy JSON z dysku, nie `catalog` z `src/catalog.ts`: tamten przeszedł
 * przez rzutowanie na `Catalog`, więc TypeScript wierzy mu na słowo i test
 * sprawdzałby własne założenie zamiast danych.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { CAPABILITY_ALIASES } from '../catalogAliases'
import { getCatalogCapability } from '../catalog'

const PACKAGE_ROOT = resolve(__dirname, '../..')
const GENERATOR = resolve(PACKAGE_ROOT, 'scripts/generate-browser-catalog.mjs')
const CATALOG_JSON = resolve(PACKAGE_ROOT, 'src/catalogData.json')
const CATALOG_JS = resolve(PACKAGE_ROOT, '../assets/stack-tool/catalog.js')
const GENERATED_JS = resolve(PACKAGE_ROOT, '../assets/shared/catalog.generated.js')

const DECISIONS: readonly string[] = Object.freeze(['native', 'configure', 'build', 'integrate', 'keep'])
const CONFIDENCES: readonly string[] = Object.freeze(['high', 'medium', 'low'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function runGenerator(flag: string): string {
  return execFileSync(process.execPath, [GENERATOR, flag], { encoding: 'utf8', cwd: PACKAGE_ROOT })
}

/** `CAPS` i `OM_TARGETS` biorę od generatora, żeby test i generator czytały ten sam plik jednym kodem. */
function loadVocabulary(): { caps: Set<string>; omTargets: Set<string> } {
  const parsed: unknown = JSON.parse(runGenerator('--vocabulary'))
  if (!isRecord(parsed)) throw new Error('--vocabulary nie oddał obiektu')
  const { caps, omTargets } = parsed
  if (!isRecord(caps)) throw new Error('--vocabulary: caps nie jest obiektem')
  if (!Array.isArray(omTargets)) throw new Error('--vocabulary: omTargets nie jest tablicą')
  return {
    caps: new Set(Object.keys(caps)),
    omTargets: new Set(omTargets.filter((target): target is string => typeof target === 'string')),
  }
}

interface FlatEntry {
  tool: string
  slug: string
  where: string
  entry: Record<string, unknown>
}

/** Płaska lista wszystkich wpisów, żeby każdy test mógł ją przejść bez ponownego rozbierania JSON-a. */
function loadCatalogEntries(): FlatEntry[] {
  const parsed: unknown = JSON.parse(readFileSync(CATALOG_JSON, 'utf8'))
  if (!isRecord(parsed)) throw new Error('catalogData.json nie jest obiektem narzędzi')

  const flat: FlatEntry[] = []
  for (const tool of Object.keys(parsed)) {
    const toolEntry = parsed[tool]
    if (!isRecord(toolEntry)) throw new Error(`catalogData.json: ${tool} nie jest obiektem`)
    const { capabilities } = toolEntry
    if (!isRecord(capabilities)) throw new Error(`catalogData.json: ${tool} nie ma obiektu capabilities`)
    for (const slug of Object.keys(capabilities)) {
      const entry = capabilities[slug]
      if (!isRecord(entry)) throw new Error(`catalogData.json: ${tool}.${slug} nie jest obiektem`)
      flat.push({ tool, slug, where: `${tool}.${slug}`, entry })
    }
  }
  return flat
}

/** Jedna para narzędzie+slug tak, jak opisuje ją katalog przeglądarkowy. */
interface BrowserEntry {
  tool: string
  slug: string
  where: string
  om: string
  verdict: string
  conf: string
}

/**
 * Rozwija `CATALOG` z `assets/stack-tool/catalog.js` do płaskiej listy par.
 *
 * Ten plik deklaruje `CATALOG` jako `const` na najwyższym poziomie, więc nie
 * ląduje na `globalThis`. Doklejone wyrażenie jest ostatnią instrukcją TEGO
 * SAMEGO skryptu, więc widzi ten sam zasięg leksykalny - ta sama sztuczka co
 * w `scripts/generate-browser-catalog.mjs`, tylko po inną stałą. Kontekst jest
 * pusty celowo: gdyby ktoś dopisał dostęp do DOM-u na najwyższym poziomie,
 * test wywali się od razu, bo taki plik przestałby być czystymi danymi.
 */
function loadBrowserEntries(): BrowserEntry[] {
  const source = readFileSync(CATALOG_JS, 'utf8')
  const value: unknown = runInNewContext(`${source};({ CATALOG })`, {})
  if (!isRecord(value)) throw new Error('catalog.js: nie oddał obiektu ze stałymi')
  const { CATALOG } = value
  if (!Array.isArray(CATALOG)) throw new Error('catalog.js: CATALOG nie jest tablicą')

  const flat: BrowserEntry[] = []
  for (const rawTool of CATALOG) {
    if (!isRecord(rawTool)) throw new Error('catalog.js: wpis narzędzia nie jest obiektem')
    const toolName = rawTool.name
    if (typeof toolName !== 'string') throw new Error('catalog.js: narzędzie bez nazwy')
    const modules = rawTool.modules
    if (!Array.isArray(modules)) throw new Error(`catalog.js: ${toolName} nie ma tablicy modules`)
    for (const rawModule of modules) {
      if (!isRecord(rawModule)) throw new Error(`catalog.js: ${toolName} ma moduł, który nie jest obiektem`)
      const { caps, om, verdict, conf } = rawModule
      if (!Array.isArray(caps)) throw new Error(`catalog.js: ${toolName} ma moduł bez tablicy caps`)
      if (typeof om !== 'string' || typeof verdict !== 'string' || typeof conf !== 'string') {
        throw new Error(`catalog.js: ${toolName} ma moduł bez om/verdict/conf`)
      }
      for (const slug of caps) {
        if (typeof slug !== 'string') throw new Error(`catalog.js: ${toolName} ma slug, który nie jest stringiem`)
        flat.push({ tool: toolName, slug, where: `${toolName}.${slug}`, om, verdict, conf })
      }
    }
  }
  return flat
}

const vocabulary = loadVocabulary()
const entries = loadCatalogEntries()
const browserEntries = loadBrowserEntries()
const slugsInCatalog = new Set(entries.map((flat) => flat.slug))

describe('catalogData.json wobec słowników z assets/stack-tool/catalog.js', () => {
  it('nie jest puste - inaczej reszta testów przechodzi na zero wpisów', () => {
    expect(entries.length).toBeGreaterThan(100)
    expect(new Set(entries.map((flat) => flat.tool)).size).toBeGreaterThan(10)
  })

  it('każdy klucz zdolności jest slugiem z CAPS', () => {
    const unknown = entries.filter((flat) => !vocabulary.caps.has(flat.slug)).map((flat) => flat.where)
    expect(unknown).toEqual([])
  })

  it('każdy target jest pozycją z OM_TARGETS', () => {
    const unknown = entries
      .filter((flat) => typeof flat.entry.target !== 'string' || !vocabulary.omTargets.has(String(flat.entry.target)))
      .map((flat) => `${flat.where} -> ${String(flat.entry.target)}`)
    expect(unknown).toEqual([])
  })

  it('każdy decision jest jedną z pięciu wartości Decision', () => {
    const unknown = entries
      .filter((flat) => typeof flat.entry.decision !== 'string' || !DECISIONS.includes(String(flat.entry.decision)))
      .map((flat) => `${flat.where} -> ${String(flat.entry.decision)}`)
    expect(unknown).toEqual([])
  })

  it('każdy confidence jest jedną z trzech wartości', () => {
    const unknown = entries
      .filter((flat) => typeof flat.entry.confidence !== 'string' || !CONFIDENCES.includes(String(flat.entry.confidence)))
      .map((flat) => `${flat.where} -> ${String(flat.entry.confidence)}`)
    expect(unknown).toEqual([])
  })

  it('wpis ma tylko znane pola', () => {
    const allowed = new Set(['target', 'decision', 'confidence', 'reportVerdict'])
    const extra = entries.flatMap((flat) =>
      Object.keys(flat.entry)
        .filter((field) => !allowed.has(field))
        .map((field) => `${flat.where}.${field}`),
    )
    expect(extra).toEqual([])
  })
})

describe('werdykt drop', () => {
  /**
   * `Decision` zostaje pięciowartościowe (patrz `src/types.ts`), więc `drop`
   * jedzie obok, w `reportVerdict`. Warunek działa w obie strony: `drop`
   * zawsze siedzi na `native`, bo dla pieniędzy zachowuje się tak samo -
   * `computeScenario` ma z niego nie zatrzymywać subskrypcji.
   */
  it('jedyną wartością reportVerdict jest "drop", zawsze przy decision "native"', () => {
    const wrong = entries
      .filter((flat) => Object.hasOwn(flat.entry, 'reportVerdict'))
      .filter((flat) => flat.entry.reportVerdict !== 'drop' || flat.entry.decision !== 'native')
      .map((flat) => `${flat.where} -> ${String(flat.entry.reportVerdict)}/${String(flat.entry.decision)}`)
    expect(wrong).toEqual([])
  })

  it('niesie dokładnie te wpisy, które w CATALOG miały verdict "drop"', () => {
    const dropped = entries.filter((flat) => flat.entry.reportVerdict === 'drop').map((flat) => flat.where)
    expect(dropped.sort()).toEqual(['Intercom.onboarding.tours', 'PandaDoc.docs.analytics'])
  })
})

describe('tablica aliasów', () => {
  it('każdy alias celuje w slug, który naprawdę jest w katalogu', () => {
    const dangling = Object.entries(CAPABILITY_ALIASES)
      .filter(([, slug]) => !slugsInCatalog.has(slug))
      .map(([alias, slug]) => `${alias} -> ${slug}`)
    expect(dangling).toEqual([])
  })

  it('każdy alias celuje w slug z CAPS', () => {
    const outside = Object.entries(CAPABILITY_ALIASES)
      .filter(([, slug]) => !vocabulary.caps.has(slug))
      .map(([alias, slug]) => `${alias} -> ${slug}`)
    expect(outside).toEqual([])
  })

  it('żaden alias nie przesłania slugu kanonicznego', () => {
    // Odczyt dosłowny idzie pierwszy, więc alias o nazwie slugu byłby martwy
    // dla jednych narzędzi, a żywy dla innych - i nikt by tego nie zauważył.
    const shadowing = Object.keys(CAPABILITY_ALIASES).filter((alias) => vocabulary.caps.has(alias))
    expect(shadowing).toEqual([])
  })

  it('stare klucze nadal rozwiązują się przez getCatalogCapability', () => {
    expect(getCatalogCapability('HubSpot', 'contacts')).toEqual(
      getCatalogCapability('HubSpot', 'crm.contacts'),
    )
    expect(getCatalogCapability('PandaDoc', 'e_signature')).toEqual(
      getCatalogCapability('PandaDoc', 'esignature'),
    )
    // Alias bez pokrycia w TYM narzędziu to nadal brak trafienia, nie podmiana.
    expect(getCatalogCapability('Slack', 'contacts')).toBeUndefined()
  })
})

/**
 * `assets/stack-tool/catalog.js` deklaruje w komentarzu "SOURCE OF TRUTH:
 * catalogData.json", ale do tej pory była to obietnica bez egzekucji: obie
 * strony niosły te same 116 par narzędzie+slug i nic ich nie porównywało.
 * Dokładnie od takiej sytuacji zaczęło się całe scalenie - dwa pliki opisujące
 * to samo, rozjeżdżające się po cichu.
 *
 * Porównanie jest JEDNOSTRONNE z rozmysłu: JSON wolno mieć więcej (niesie 128
 * par, w tym Typeform, Zapier, Calendly i Slack, których w katalogu
 * przeglądarkowym nigdy nie było - doszły przy scalaniu silnika). Czego NIE
 * wolno, to żeby para obecna w przeglądarce niosła tam inny werdykt.
 */
describe('katalog przeglądarkowy wobec kanonicznego JSON-a', () => {
  it('niesie sensowną liczbę par - inaczej reszta przechodzi na pustej liście', () => {
    expect(browserEntries.length).toBeGreaterThan(100)
    expect(new Set(browserEntries.map((flat) => flat.where)).size).toBe(browserEntries.length)
  })

  it('każda para narzędzie+slug ma w JSON-ie ten sam om, verdict i conf', () => {
    const byKey = new Map(entries.map((flat) => [flat.where, flat.entry]))
    const drift = browserEntries.flatMap((browser) => {
      const canonical = byKey.get(browser.where)
      if (canonical === undefined) return [`${browser.where}: jest w catalog.js, nie ma w catalogData.json`]
      /**
       * `drop` nie jest wartością `Decision`, więc JSON trzyma go w
       * `reportVerdict` obok `decision: 'native'` (patrz `src/types.ts`).
       * Porównujemy z werdyktem, który CZYTELNIK zobaczy - inaczej dwa wpisy
       * z `drop` zgłaszałyby rozjazd przy każdym uruchomieniu.
       */
      const verdict = Object.hasOwn(canonical, 'reportVerdict') ? canonical.reportVerdict : canonical.decision
      const differences: string[] = []
      if (canonical.target !== browser.om) {
        differences.push(`om ${JSON.stringify(browser.om)} != target ${JSON.stringify(canonical.target)}`)
      }
      if (verdict !== browser.verdict) {
        differences.push(`verdict ${JSON.stringify(browser.verdict)} != ${JSON.stringify(verdict)}`)
      }
      if (canonical.confidence !== browser.conf) {
        differences.push(`conf ${JSON.stringify(browser.conf)} != confidence ${JSON.stringify(canonical.confidence)}`)
      }
      return differences.length === 0 ? [] : [`${browser.where}: ${differences.join('; ')}`]
    })
    expect(drift).toEqual([])
  })
})

describe('kopia dla przeglądarki', () => {
  it('assets/shared/catalog.generated.js jest aktualny wobec JSON-a i słowników', () => {
    const fresh = runGenerator('--stdout')
    const onDisk = readFileSync(GENERATED_JS, 'utf8')
    // Porównanie całych treści, a nie tylko długości: rozjazd ma pokazać
    // wiersz, nie tylko fakt.
    expect(onDisk).toBe(fresh)
  })

  it('wygenerowana kopia da się wczytać i niesie te same narzędzia co JSON', () => {
    const loaded: unknown = require(GENERATED_JS)
    if (!isRecord(loaded)) throw new Error('catalog.generated.js nie oddał obiektu')
    const { CATALOG_CAPABILITIES } = loaded
    if (!isRecord(CATALOG_CAPABILITIES)) throw new Error('catalog.generated.js: brak CATALOG_CAPABILITIES')
    expect(Object.keys(CATALOG_CAPABILITIES).sort()).toEqual([...new Set(entries.map((flat) => flat.tool))].sort())
  })
})
