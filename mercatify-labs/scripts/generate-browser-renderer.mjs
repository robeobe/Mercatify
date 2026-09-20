/**
 * Generator kopii renderera raportu dla przeglądarki.
 *
 * `src/report/renderReport.ts` jest czystą funkcją `ReportModel -> HTML` i to
 * ONA jest źródłem prawdy o tym, jak wygląda dokument. Strony w `assets/` to
 * klasyczny HTML bez builda, więc nie potrafią zaimportować modułu TS - a
 * przepisanie renderera ręcznie do JS dałoby drugi renderer, czyli dokładnie
 * ten problem, od którego zaczęło się scalanie katalogu.
 *
 * Ten skrypt zamiast tego TRANSPILUJE domknięcie importów `renderReport.ts`
 * (czyli `src/report/**` - poza tym grafem nie ma ani jednego importu
 * wartościowego, same `import type`) do jednego IIFE z mikro-rejestrem
 * modułów CommonJS i wystawia `window.renderReport`. Kompilator to `typescript`
 * z devDependencies pakietu; żadnej nowej zależności ani builda w `assets/`.
 *
 * Plik wyjściowy jest KOPIĄ, nie drugim źródłem: nikt go nie edytuje ręcznie,
 * a `src/__tests__/browserRendererIntegrity.test.ts` uruchamia ten generator do
 * pamięci i porównuje wynik z tym, co leży na dysku - oraz, co ważniejsze,
 * przepuszcza TEN SAM `ReportModel` przez wersję TS i przez wygenerowaną i
 * wymaga identycznego stringa. Rozjazd = czerwony test.
 *
 *   node scripts/generate-browser-renderer.mjs              zapisuje plik
 *   node scripts/generate-browser-renderer.mjs --stdout     tylko wypisuje
 *   node scripts/generate-browser-renderer.mjs --check      zero, gdy aktualny
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const HERE = dirname(fileURLToPath(import.meta.url))
export const PACKAGE_ROOT = resolve(HERE, '..')
export const SOURCE_ROOT = resolve(PACKAGE_ROOT, 'src')
export const ENTRY_PATH = resolve(SOURCE_ROOT, 'report/renderReport.ts')
/**
 * Drugie wejście: słownik werdyktów z Appendixu A.
 *
 * `facts.glossary` jest polem WYMAGANYM, a jego treść to STAŁA METODY, nie
 * dane przebiegu (`src/report/glossary.ts` jest `Object.freeze`'owane).
 * Adapter w przeglądarce musi ją skądś wziąć - a jedyna alternatywa dla
 * wciągnięcia jej tutaj to przepisanie sześciu definicji i trzech zasad do
 * `assets/`, czyli druga kopia tego samego tekstu. Dokładnie to usuwamy.
 */
export const GLOSSARY_PATH = resolve(SOURCE_ROOT, 'report/glossary.ts')
export const OUTPUT_PATH = resolve(PACKAGE_ROOT, '../assets/shared/report-renderer.generated.js')

/**
 * ES2019, nie ES2022 jak `tsconfig.json`.
 *
 * Różnica dotyczy SKŁADNI, nie bibliotek: `??` i `?.` zjeżdżają do jawnych
 * porównań, więc plik wczyta się także tam, gdzie nowsza składnia wywala
 * parser całego skryptu (a klasyczny `<script>` bez `type="module"` wywala się
 * w całości, nie linijkę). Metod biblioteki - `Object.hasOwn`, `flatMap` - to
 * nie polyfilluje i nie ma udawać, że polyfilluje.
 */
const COMPILER_OPTIONS = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2019,
  esModuleInterop: true,
  removeComments: true,
  newLine: ts.NewLineKind.LineFeed,
}

/** `src/report/templates/cover.ts` -> `report/templates/cover`. */
function moduleId(absolutePath) {
  return relative(SOURCE_ROOT, absolutePath).replace(/\\/g, '/').replace(/\.ts$/, '')
}

/** Rozwija `./x` / `../x` wobec modułu, który to zaimportował. */
function resolveSpecifier(fromPath, specifier) {
  if (!specifier.startsWith('.')) {
    throw new Error(
      `[mercatify-labs] ${moduleId(fromPath)}: import spoza grafu renderera (${specifier}). ` +
        'Kopia dla przeglądarki nie ma jak tego wciągnąć - zostaw to poza `src/report/` ' +
        'albo zaimportuj jako `import type`.',
    )
  }
  return resolve(dirname(fromPath), `${specifier}.ts`)
}

/**
 * Wyciąga zależności WARTOŚCIOWE z wyniku transpilacji, nie ze źródła.
 *
 * To nie jest skrót - to jedyny odczyt, który zgadza się z tym, co naprawdę
 * trafia do przeglądarki. `import type { ReportModel } from './model'` znika
 * w emisji, więc `model.ts` (same interfejsy) nie ląduje w pakiecie i nie
 * powinien. Parsowanie źródła dokładałoby moduły, których emitowany kod nigdy
 * nie woła.
 */
function requiredSpecifiers(emittedJs) {
  const found = new Set()
  const source = ts.createSourceFile('emitted.js', emittedJs, ts.ScriptTarget.ES2019, true)
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.add(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(source, visit)
  return [...found]
}

/** Domknięcie importów od wejść, każdy moduł już przetranspilowany. */
export function collectModules(entryPaths = [ENTRY_PATH, GLOSSARY_PATH]) {
  const modules = new Map()
  const queue = [...entryPaths]

  while (queue.length > 0) {
    const filePath = queue.shift()
    const id = moduleId(filePath)
    if (modules.has(id)) continue

    const source = readFileSync(filePath, 'utf8')
    const { outputText, diagnostics } = ts.transpileModule(source, {
      compilerOptions: COMPILER_OPTIONS,
      fileName: filePath,
      reportDiagnostics: true,
    })
    if (diagnostics !== undefined && diagnostics.length > 0) {
      const first = ts.flattenDiagnosticMessageText(diagnostics[0].messageText, ' ')
      throw new Error(`[mercatify-labs] ${id}: transpilacja zgłosiła "${first}"`)
    }

    modules.set(id, outputText)
    for (const specifier of requiredSpecifiers(outputText)) {
      queue.push(resolveSpecifier(filePath, specifier))
    }
  }

  return modules
}

/**
 * Mikro-rejestr CommonJS. Specyfikatory zostają w kodzie NIETKNIĘTE - każdy
 * moduł dostaje własne `require`, które rozwija `./` i `../` wobec swojego id.
 * Przepisywanie `require("./x")` w tekście byłoby tańsze i myliłoby się na
 * pierwszym stringu, który tak wygląda.
 */
const RUNTIME = `  var __modules = {};
  var __cache = {};

  function __resolve(from, spec) {
    if (spec.charAt(0) !== '.') return spec;
    var parts = from.split('/');
    parts.pop();
    spec.split('/').forEach(function (seg) {
      if (seg === '' || seg === '.') return;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    });
    return parts.join('/');
  }

  function __load(id) {
    var cached = __cache[id];
    if (cached) return cached.exports;
    var factory = __modules[id];
    if (!factory) throw new Error('[mercatify] renderer: brak modułu ' + id);
    var mod = { exports: {} };
    __cache[id] = mod;
    factory(mod, mod.exports, function (spec) { return __load(__resolve(id, spec)); });
    return mod.exports;
  }

  function __define(id, factory) { __modules[id] = factory; }
`

export function renderBrowserRenderer(modules = collectModules()) {
  const entryId = moduleId(ENTRY_PATH)
  // Kolejność alfabetyczna, nie kolejność obchodzenia grafu: wynik ma się
  // różnić tylko wtedy, gdy różni się kod, a nie gdy ktoś przestawił importy.
  //
  // Ciała modułów idą DOSŁOWNIE, bez wcięcia. Wcięcie byłoby ładniejsze i
  // cicho zmieniałoby treść: `REPORT_STYLE` to wieloliniowy template literal,
  // więc każda dołożona spacja ląduje w `<style>` wysyłanego dokumentu, a nie
  // w wcięciu kodu. Kosztowało to jeden czerwony test i to jest dokładnie ten
  // test, po który ten plik istnieje.
  const bodies = [...modules.keys()]
    .sort()
    .map(
      (id) =>
        `  __define(${JSON.stringify(id)}, function (module, exports, require) {\n` +
        `${modules.get(id).replace(/\n+$/, '')}\n  });`,
    )
    .join('\n\n')

  return `/* WYGENEROWANE - nie edytuj ręcznie.
   Źródło: mercatify-labs/src/report/renderReport.ts wraz z domknięciem jego
   importów (transpilacja TypeScript -> ES2019, jeden IIFE, mikro-rejestr
   CommonJS). Odśwież: cd mercatify-labs && npm run renderer:generate
   Pilnuje tego mercatify-labs/src/__tests__/browserRendererIntegrity.test.ts,
   który porównuje nie tylko treść pliku, ale i WYNIK: ten sam ReportModel
   przepuszczony przez wersję TS i przez tę kopię musi dać identyczny string.

   Wystawia:
     window.renderReport(model)  -> string z pełnym dokumentem HTML
     window.REPORT_GLOSSARY      -> stała do facts.glossary (Appendix A)
   Model opisuje src/report/model.ts; adapter z mapowania stron w assets/
   siedzi w assets/shared/report-model.js. */
(function (globalScope) {
  'use strict';

${RUNTIME}
${bodies}

  var __entry = __load(${JSON.stringify(entryId)});
  var __glossary = __load(${JSON.stringify(moduleId(GLOSSARY_PATH))});
  globalScope.renderReport = __entry.renderReport;
  globalScope.REPORT_GLOSSARY = __glossary.REPORT_GLOSSARY;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      renderReport: __entry.renderReport,
      REPORT_GLOSSARY: __glossary.REPORT_GLOSSARY,
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
`
}

export function buildBrowserRenderer() {
  return renderBrowserRenderer(collectModules())
}

function main(argv) {
  if (argv.includes('--modules')) {
    process.stdout.write(`${JSON.stringify([...collectModules().keys()].sort())}\n`)
    return 0
  }

  const generated = buildBrowserRenderer()

  if (argv.includes('--stdout')) {
    process.stdout.write(generated)
    return 0
  }

  if (argv.includes('--check')) {
    let onDisk = null
    try {
      onDisk = readFileSync(OUTPUT_PATH, 'utf8')
    } catch {
      process.stderr.write(`[mercatify-labs] brak ${OUTPUT_PATH} - uruchom npm run renderer:generate\n`)
      return 1
    }
    if (onDisk !== generated) {
      process.stderr.write(`[mercatify-labs] ${OUTPUT_PATH} jest nieaktualny - uruchom npm run renderer:generate\n`)
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
   * `process.exitCode`, nie `process.exit()`.
   *
   * Pakiet ma ponad sto kilobajtów, a zapis na potok jest asynchroniczny -
   * `process.exit()` ucina to, co nie zmieściło się w buforze potoku (64 kB),
   * więc `--stdout` oddawałby obcięty plik i test "kopia jest aktualna" padałby
   * na różnicy, której na dysku nie ma. Ustawienie kodu wyjścia pozwala
   * Node'owi domknąć strumień.
   */
  process.exitCode = main(process.argv.slice(2))
}
