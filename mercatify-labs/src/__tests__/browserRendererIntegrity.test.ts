/** @jest-environment node */
/**
 * Kopia renderera raportu dla przeglądarki wobec oryginału w TypeScripcie.
 *
 * Strony w `assets/` miały własną, gorszą implementację tego samego dokumentu.
 * Zastąpienie jej wygenerowanym pakietem rozwiązuje problem tylko wtedy, gdy
 * ktoś pilnuje, że kopia nadąża - inaczej dostajemy dwa rendererry zamiast
 * dwóch katalogów i zmienia się wyłącznie nazwa kłopotu.
 *
 * Testy niżej są dwa i tylko DRUGI naprawdę broni:
 *
 *  1. Plik na dysku jest tym, co oddaje generator. Wyłapuje ręczną edycję i
 *     zapomniane `npm run renderer:generate` - to samo, co
 *     `catalogIntegrity.test.ts` robi dla katalogu.
 *  2. Ten sam `ReportModel` przepuszczony przez `renderReport` z `src/report/`
 *     i przez wygenerowaną kopię daje IDENTYCZNY string. Punkt 1 przechodzi
 *     także wtedy, gdy generator jest popsuty i produkuje konsekwentnie zły
 *     plik; ten nie.
 *
 * Kopię ładujemy w `runInNewContext` do kontekstu BEZ `module` i bez `require`,
 * czyli tak, jak wygląda klasyczny `<script>`. Gdyby pakiet zaczął sięgać po
 * cokolwiek z Node'a, wywali się tutaj, a nie dopiero w przeglądarce.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { renderReport } from '../report/renderReport'
import { REPORT_GLOSSARY } from '../report/glossary'
import type { ReportModel } from '../report/model'

const PACKAGE_ROOT = resolve(__dirname, '../..')
const GENERATOR = resolve(PACKAGE_ROOT, 'scripts/generate-browser-renderer.mjs')
const GENERATED_JS = resolve(PACKAGE_ROOT, '../assets/shared/report-renderer.generated.js')
const FIXTURE = resolve(__dirname, 'fixtures/voltix.reportmodel.json')

function runGenerator(flag: string): string {
  return execFileSync(process.execPath, [GENERATOR, flag], {
    encoding: 'utf8',
    cwd: PACKAGE_ROOT,
    // Golden model ma kilkaset kilobajtów HTML-a; domyślne 1 MB bufora na
    // stdout starcza, ale limit podnosimy, żeby test nie padał na rozmiarze.
    maxBuffer: 32 * 1024 * 1024,
  })
}

/**
 * Jedyne rzutowanie w tym pliku i ten sam powód co w `renderReport.test.ts`:
 * fixture jest JSON-em, więc TypeScript widzi `verdict: string`, a nie unię.
 */
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ReportModel

/** Świeża kopia modelu - testy degradacji kasują z niej pola. */
function model(): ReportModel {
  return JSON.parse(JSON.stringify(fixture)) as ReportModel
}

type BrowserRender = (input: ReportModel) => string

/** Kontekst po wykonaniu pakietu - `window` tego, co wystawia klasyczny skrypt. */
let browserGlobals: Record<string, unknown> = {}

/**
 * Ładuje wygenerowany plik tak, jak zrobiłby to `<script src="...">`.
 *
 * Kontekst dostaje `window` wskazujące na siebie i NIC poza tym: bez `module`,
 * bez `require`, bez `process`. Pakiet ma się przypiąć do globalnego zasięgu i
 * niczego więcej nie potrzebować.
 */
function loadBrowserRenderer(source: string): BrowserRender {
  const sandbox: Record<string, unknown> = {}
  sandbox.window = sandbox
  runInNewContext(source, sandbox, { filename: 'report-renderer.generated.js' })
  browserGlobals = sandbox
  const exported = sandbox.renderReport
  if (typeof exported !== 'function') {
    throw new Error('report-renderer.generated.js nie wystawił window.renderReport')
  }
  return exported as BrowserRender
}

const onDisk = readFileSync(GENERATED_JS, 'utf8')
const browserRender = loadBrowserRenderer(onDisk)

describe('kopia renderera dla przeglądarki', () => {
  it('assets/shared/report-renderer.generated.js jest aktualny wobec src/report/', () => {
    // Porównanie całych treści, a nie długości: rozjazd ma pokazać wiersz.
    expect(onDisk).toBe(runGenerator('--stdout'))
  })

  it('niesie cały graf importów renderera, nie sam plik wejściowy', () => {
    const ids: unknown = JSON.parse(runGenerator('--modules'))
    expect(Array.isArray(ids)).toBe(true)
    const list = ids as string[]
    expect(list).toContain('report/renderReport')
    expect(list).toContain('report/reportStyle')
    expect(list).toContain('report/templates/cashflow')
    // `model.ts` to same interfejsy, więc w emisji go NIE MA - i to jest
    // poprawne. Gdyby się pojawił, znaczyłoby, że ktoś dołożył tam wartość.
    expect(list).not.toContain('report/model')
  })

  it('jest klasycznym skryptem - wczytuje się bez module, require i process', () => {
    // `loadBrowserRenderer` wykonuje plik w pustym kontekście; gdyby sięgnął
    // po cokolwiek z Node'a, rzuciłoby ReferenceError przy ładowaniu modułu.
    expect(typeof browserRender).toBe('function')
    // Rejestr modułów zostaje w domknięciu - do globalnego zasięgu wychodzą
    // tylko te dwie nazwy, więc pakiet nie potrafi nadpisać niczego na stronie.
    expect(Object.keys(browserGlobals).sort()).toEqual([
      'REPORT_GLOSSARY',
      'renderReport',
      'window',
    ])
  })

  it('wystawia REPORT_GLOSSARY - adapter nie przepisuje Appendixu A ręcznie', () => {
    const glossary = browserGlobals.REPORT_GLOSSARY as {
      verdicts: Array<{ verdict: string }>
      rules: Array<{ id: string }>
    }
    expect(glossary.verdicts.map((entry) => entry.verdict)).toEqual(
      REPORT_GLOSSARY.verdicts.map((entry) => entry.verdict),
    )
    expect(glossary.rules.map((rule) => rule.id)).toEqual(REPORT_GLOSSARY.rules.map((rule) => rule.id))
  })
})

describe('ten sam model, ten sam dokument', () => {
  it('pełny golden model daje identyczny string po obu stronach', () => {
    const input = model()
    const fromBrowser = browserRender(input)
    expect(fromBrowser).toBe(renderReport(input))
    // Asercja na treść, żeby "identyczne" nie oznaczało "oba puste".
    expect(fromBrowser.length).toBeGreaterThan(10000)
    expect(fromBrowser).toContain('<!doctype html>')
  })

  it('model bez prozy - sekcje znikają po obu stronach tak samo', () => {
    const input = model()
    delete input.prose
    expect(browserRender(input)).toBe(renderReport(input))
  })

  it('model bez serii gotówkowej - wykres znika po obu stronach tak samo', () => {
    const input = model()
    delete input.facts.cash
    expect(browserRender(input)).toBe(renderReport(input))
  })

  it('same fakty, bez prozy, gotówki i fal - nadal identycznie', () => {
    const input = model()
    delete input.prose
    delete input.facts.cash
    delete input.facts.preview
    input.facts.waves = []
    expect(browserRender(input)).toBe(renderReport(input))
  })

  it('nieznany slot wywala obie wersje, a nie tylko jedną', () => {
    const input = model()
    input.prose = { recommendation: 'Coverage stands at {facts.kpis.nieMaTakiegoPola}.' }
    expect(() => renderReport(input)).toThrow()
    expect(() => browserRender(input)).toThrow()
  })
})
