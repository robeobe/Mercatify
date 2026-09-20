/**
 * Generator kopii katalogu dla przeglądarki.
 *
 * Po scaleniu źródłem prawdy o werdyktach jest `src/catalogData.json`, a
 * `assets/stack-tool/catalog.js` trzyma już tylko słowniki (`CAPS`,
 * `OM_TARGETS`) i dane prezentacyjne modułów. Ten skrypt zbiera jedno z
 * drugim i wypisuje `assets/shared/catalog.generated.js` - klasyczny skrypt,
 * jaki strony stack-toola potrafią wczytać.
 *
 * Plik wyjściowy jest KOPIĄ, nie drugim źródłem: nikt go nie edytuje ręcznie,
 * a `src/__tests__/catalogIntegrity.test.ts` uruchamia ten generator do
 * pamięci i porównuje wynik z tym, co leży na dysku. Rozjazd = czerwony test,
 * nie cicha rozbieżność, od której cała ta robota się zaczęła.
 *
 *   node scripts/generate-browser-catalog.mjs              zapisuje plik
 *   node scripts/generate-browser-catalog.mjs --stdout     tylko wypisuje
 *   node scripts/generate-browser-catalog.mjs --check      zero, gdy aktualny
 *   node scripts/generate-browser-catalog.mjs --vocabulary CAPS + OM_TARGETS jako JSON
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
export const CATALOG_JS_PATH = resolve(HERE, '../../assets/stack-tool/catalog.js')
export const CATALOG_JSON_PATH = resolve(HERE, '../src/catalogData.json')
export const OUTPUT_PATH = resolve(HERE, '../../assets/shared/catalog.generated.js')

/**
 * Czyta `CAPS` i `OM_TARGETS` z klasycznego skryptu przeglądarkowego.
 *
 * Plik deklaruje je jako `const` na najwyższym poziomie, więc nie lądują na
 * `globalThis` i nie da się ich po prostu odczytać po wykonaniu. Doklejone
 * wyrażenie jest ostatnią instrukcją TEGO SAMEGO skryptu, więc widzi ten sam
 * zasięg leksykalny i oddaje wartości jako wynik `runInNewContext`.
 *
 * Kontekst jest pusty celowo: skrypt sięga po `document` i `localStorage`
 * wyłącznie wewnątrz funkcji, których tu nikt nie woła. Gdyby ktoś dopisał
 * dostęp do DOM-u na najwyższym poziomie, ten generator wywali się od razu -
 * i dobrze, bo taki plik przestałby być czystym słownikiem.
 */
export function loadBrowserVocabulary(catalogJsPath = CATALOG_JS_PATH) {
  const source = readFileSync(catalogJsPath, 'utf8')
  const value = runInNewContext(`${source};({ CAPS, OM_TARGETS, CATALOG })`, {})
  if (value === null || typeof value !== 'object') {
    throw new Error(`[mercatify-labs] ${catalogJsPath}: nie oddał obiektu ze słownikami`)
  }
  const { CAPS, OM_TARGETS, CATALOG } = value
  if (CAPS === null || typeof CAPS !== 'object') {
    throw new Error(`[mercatify-labs] ${catalogJsPath}: brak obiektu CAPS`)
  }
  if (!Array.isArray(OM_TARGETS)) {
    throw new Error(`[mercatify-labs] ${catalogJsPath}: brak tablicy OM_TARGETS`)
  }
  if (!Array.isArray(CATALOG)) {
    throw new Error(`[mercatify-labs] ${catalogJsPath}: brak tablicy CATALOG`)
  }
  return { caps: CAPS, omTargets: OM_TARGETS, shape: CATALOG }
}

/**
 * Pełny katalog dla stron: STRUKTURA z `catalog.js`, WERDYKTY z JSON-a.
 *
 * Strony stack-toola potrzebują obu warstw naraz - `mapping.html` zasiewa
 * wiersze z `findModule(toolId, modId)` i czyta z nich `om`/`verdict`/`conf`,
 * a karty na `intake.html` stoją na `name`/`desc`/`caps`. Wygenerowana kopia
 * niosła dotąd tylko tę drugą połowę, więc strony i tak musiały czytać
 * werdykty z literału - czyli z kopii, nie ze źródła.
 *
 * Złączenie jest po parze narzędzie+slug, dokładnie tak, jak sprawdza je
 * `catalogIntegrity.test.ts`. Para bez odpowiednika w JSON-ie WYWALA
 * generator: cicho przepisany werdykt z literału byłby tym samym rozjazdem,
 * tylko wygenerowanym.
 */
export function joinCatalogTools(shape, catalog) {
  const missing = []
  const tools = shape.map((tool) => ({
    id: tool.id,
    name: tool.name,
    kind: tool.kind,
    modules: (tool.modules ?? []).map((module) => {
      const caps = module.caps ?? []
      const verdicts = caps.map((slug) => {
        const entry = catalog[tool.name]?.capabilities?.[slug]
        if (entry === undefined) {
          missing.push(`${tool.name}.${slug}`)
          return undefined
        }
        return entry
      })
      const first = verdicts.find((entry) => entry !== undefined)
      return {
        id: module.id,
        name: module.name,
        desc: module.desc,
        caps: [...caps],
        /**
         * Moduł grupuje kilka slugów, a wiersz mapowania ma jeden werdykt, więc
         * bierzemy pierwszy - ten sam wybór, który literał robił ręcznie.
         * Rozjazd MIĘDZY slugami jednego modułu jest jednak informacją, a nie
         * szumem, więc wywala generator zamiast po cichu wygrać pierwszym.
         */
        om: first === undefined ? '' : first.target,
        verdict: first === undefined ? '' : (first.reportVerdict ?? first.decision),
        conf: first === undefined ? '' : first.confidence,
      }
    }),
  }))
  if (missing.length > 0) {
    throw new Error(
      `[mercatify-labs] catalogData.json nie zna par: ${missing.join(', ')}. ` +
        'Dopisz je w JSON-ie albo usuń z CATALOG - kopia dla przeglądarki nie ma czego złączyć.',
    )
  }
  return tools
}

export function loadCatalogJson(catalogJsonPath = CATALOG_JSON_PATH) {
  const parsed = JSON.parse(readFileSync(catalogJsonPath, 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`[mercatify-labs] ${catalogJsonPath}: oczekiwano obiektu narzędzi`)
  }
  return parsed
}

/** Stały, wcięty JSON - wynik ma się różnić tylko wtedy, gdy różnią się dane. */
function literal(value, indent) {
  return JSON.stringify(value, null, 2).split('\n').join(`\n${indent}`)
}

export function renderBrowserCatalog({ caps, omTargets, catalog, tools }) {
  return `/* WYGENEROWANE - nie edytuj ręcznie.
   Źródło: mercatify-labs/src/catalogData.json (werdykty) złączone ze
   strukturą modułów z assets/stack-tool/catalog.js (id, nazwa, opis,
   grupowanie slugów - tego JSON nie ma gdzie trzymać).
   Odśwież: cd mercatify-labs && npm run catalog:generate
   Pilnuje tego mercatify-labs/src/__tests__/catalogIntegrity.test.ts.

   Wystawia na globalny zasięg:
     CATALOG_CAPABILITIES  płasko: narzędzie -> slug -> werdykt
     CATALOG_TOOLS         to, co czytają strony: narzędzia -> moduły ->
                           caps + om/verdict/conf prosto z JSON-a

   Wszystko siedzi w IIFE i wychodzi na zewnątrz tylko pod tymi dwiema
   nazwami. CAPS i OM_TARGETS NIE lądują na globalu z rozmysłu: te nazwy
   należą do \`assets/stack-tool/catalog.js\`, gdzie są \`const\`, a drugie
   \`var\` o tej samej nazwie wywaliłoby parser całego skryptu. */
(function (globalScope) {
  var CAPS = ${literal(caps, '  ')};

  var OM_TARGETS = ${literal(omTargets, '  ')};

  var CATALOG_CAPABILITIES = ${literal(catalog, '  ')};

  var CATALOG_TOOLS = ${literal(tools, '  ')};

  globalScope.CATALOG_CAPABILITIES = CATALOG_CAPABILITIES;
  globalScope.CATALOG_TOOLS = CATALOG_TOOLS;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CAPS: CAPS,
      OM_TARGETS: OM_TARGETS,
      CATALOG_CAPABILITIES: CATALOG_CAPABILITIES,
      CATALOG_TOOLS: CATALOG_TOOLS
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
`
}

export function buildBrowserCatalog() {
  const { caps, omTargets, shape } = loadBrowserVocabulary()
  const catalog = loadCatalogJson()
  return renderBrowserCatalog({ caps, omTargets, catalog, tools: joinCatalogTools(shape, catalog) })
}

function main(argv) {
  if (argv.includes('--vocabulary')) {
    const { caps, omTargets } = loadBrowserVocabulary()
    process.stdout.write(`${JSON.stringify({ caps, omTargets })}\n`)
    return 0
  }

  const generated = buildBrowserCatalog()

  if (argv.includes('--stdout')) {
    process.stdout.write(generated)
    return 0
  }

  if (argv.includes('--check')) {
    let onDisk = null
    try {
      onDisk = readFileSync(OUTPUT_PATH, 'utf8')
    } catch {
      process.stderr.write(`[mercatify-labs] brak ${OUTPUT_PATH} - uruchom npm run catalog:generate\n`)
      return 1
    }
    if (onDisk !== generated) {
      process.stderr.write(`[mercatify-labs] ${OUTPUT_PATH} jest nieaktualny - uruchom npm run catalog:generate\n`)
      return 1
    }
    return 0
  }

  writeFileSync(OUTPUT_PATH, generated)
  process.stdout.write(`[mercatify-labs] zapisano ${OUTPUT_PATH}\n`)
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  /**
   * `process.exitCode`, nie `process.exit()`: plik urósł po dołożeniu
   * `CATALOG_TOOLS` i zapis na potok jest asynchroniczny, więc `process.exit()`
   * uciąłby `--stdout` na buforze potoku (64 kB) - a test "kopia jest
   * aktualna" porównuje właśnie to wyjście z plikiem na dysku.
   */
  process.exitCode = main(process.argv.slice(2))
}
