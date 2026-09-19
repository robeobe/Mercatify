/** @jest-environment node */
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { parseArgs, type PreviewCliArgs } from '../../bin/preview-cli'

/**
 * Testujemy WYŁĄCZNIE `parseArgs` - jedyną czystą funkcję tego CLI (Global
 * Constraints: "wrappery z `src/` zostają czystymi funkcjami, CLI jest cienką
 * skorupą nad nimi"). `main()` czyta dysk, woła LM Studio i kończy proces
 * kodem wyjścia, więc nie podlega testom jednostkowym - ostatni blok pilnuje
 * tylko tego, żeby sam import pliku jej NIE odpalał.
 *
 * Żaden test tutaj nie dotyka sieci ani dysku.
 */

const CASE = 'case.json'

describe('parseArgs - wartości i domyślne', () => {
  it('czyta ścieżkę blueprintu i stosuje domyślne wartości', () => {
    expect(parseArgs(['--blueprint', CASE])).toEqual({
      blueprintPath: CASE,
      outDir: 'preview-out',
      runQa: true,
    })
  })

  it('domyślny outDir wskazuje na ./preview-out względem katalogu roboczego', () => {
    // Kontrakt CLI zapisuje domyślny katalog jako `./preview-out`, a kod jako
    // `'preview-out'`. To ten sam katalog - ten test przybija tę równoważność,
    // żeby nikt nie "poprawił" jednego zapisu na drugi w przekonaniu, że
    // naprawia różnicę.
    const { outDir } = parseArgs(['--blueprint', CASE])
    expect(resolve(outDir)).toBe(resolve('./preview-out'))
  })

  it('honoruje --out', () => {
    expect(parseArgs(['--blueprint', CASE, '--out', 'tmp/x'])).toEqual({
      blueprintPath: CASE,
      outDir: 'tmp/x',
      runQa: true,
    })
  })

  it('honoruje --no-qa', () => {
    expect(parseArgs(['--blueprint', CASE, '--no-qa'])).toEqual({
      blueprintPath: CASE,
      outDir: 'preview-out',
      runQa: false,
    })
  })

  it('honoruje --out i --no-qa naraz', () => {
    expect(parseArgs(['--blueprint', CASE, '--out', 'tmp/x', '--no-qa'])).toEqual({
      blueprintPath: CASE,
      outDir: 'tmp/x',
      runQa: false,
    })
  })

  it('nie zależy od kolejności flag', () => {
    const expected: PreviewCliArgs = { blueprintPath: CASE, outDir: 'tmp/x', runQa: false }
    expect(parseArgs(['--no-qa', '--out', 'tmp/x', '--blueprint', CASE])).toEqual(expected)
    expect(parseArgs(['--out', 'tmp/x', '--no-qa', '--blueprint', CASE])).toEqual(expected)
    expect(parseArgs(['--blueprint', CASE, '--no-qa', '--out', 'tmp/x'])).toEqual(expected)
  })

  it('przyjmuje ścieżki bezwzględne i zagnieżdżone bez zmiany zapisu', () => {
    // `--out` idzie prosto do `mkdirSync(outDir, { recursive: true })`
    // (src/preview/renderPreview.ts:119), więc parser niczego nie normalizuje
    // ani nie obcina - katalog podaje człowiek i dostaje dokładnie to, co wpisał.
    expect(parseArgs(['--blueprint', '/abs/case.json', '--out', '/tmp/a/b/c']).outDir).toBe(
      '/tmp/a/b/c',
    )
    expect(parseArgs(['--blueprint', './x/../case.json']).blueprintPath).toBe('./x/../case.json')
  })
})

describe('parseArgs - odrzucanie złych argumentów', () => {
  it('odrzuca brak wymaganego --blueprint', () => {
    expect(() => parseArgs([])).toThrow(/--blueprint/)
    expect(() => parseArgs(['--no-qa'])).toThrow(/--blueprint/)
    expect(() => parseArgs(['--out', 'tmp/x'])).toThrow(/--blueprint/)
  })

  it('odrzuca --blueprint bez wartości', () => {
    expect(() => parseArgs(['--blueprint'])).toThrow(/--blueprint/)
  })

  it('odrzuca --out bez wartości', () => {
    expect(() => parseArgs(['--blueprint', CASE, '--out'])).toThrow(/--out/)
  })

  it('odrzuca pustą i samobiałą wartość zamiast brać ją za ścieżkę', () => {
    // `--out ''` przeszłoby dalej jako `mkdirSync('')` -> ENOENT z wnętrza
    // renderera. Lepiej zginąć tu, z nazwą flagi.
    expect(() => parseArgs(['--blueprint', ''])).toThrow(/--blueprint/)
    expect(() => parseArgs(['--blueprint', CASE, '--out', ''])).toThrow(/--out/)
    expect(() => parseArgs(['--blueprint', CASE, '--out', '   '])).toThrow(/--out/)
  })

  it('nie zjada następnej flagi jako wartości', () => {
    // `--out --no-qa` to literówka, nie katalog o nazwie "--no-qa". Cichy
    // `mkdirSync('--no-qa')` zrobiłby katalog-śmiecia i po cichu włączył QA,
    // o którym użytkownik myślał, że go wyłączył.
    expect(() => parseArgs(['--blueprint', CASE, '--out', '--no-qa'])).toThrow(/--out/)
    expect(() => parseArgs(['--blueprint', '--out', 'tmp/x'])).toThrow(/--blueprint/)
  })

  it('odrzuca nieznaną flagę zamiast ją milcząco ignorować', () => {
    expect(() => parseArgs(['--blueprint', CASE, '--turbo'])).toThrow(/--turbo/)
    expect(() => parseArgs(['--qa', '--blueprint', CASE])).toThrow(/--qa/)
    // `--help` obsługuje `main()` PRZED wywołaniem parsera - dla samego
    // parsera to flaga spoza kontraktu i ma o tym powiedzieć.
    expect(() => parseArgs(['--help'])).toThrow(/--help/)
  })

  it('odrzuca argument pozycyjny bez flagi', () => {
    expect(() => parseArgs([CASE])).toThrow(/case\.json/)
    expect(() => parseArgs(['--blueprint', CASE, 'extra'])).toThrow(/extra/)
  })

  it('odrzuca powtórzoną flagę zamiast po cichu brać ostatnią', () => {
    // Listy argumentów bywają sklejane przez skrypty. "Ostatnia wygrywa"
    // znaczy wtedy, że blueprint z jednego miejsca cicho nadpisuje drugi.
    expect(() => parseArgs(['--blueprint', 'a.json', '--blueprint', 'b.json'])).toThrow(
      /--blueprint/,
    )
    expect(() => parseArgs(['--blueprint', CASE, '--out', 'a', '--out', 'b'])).toThrow(/--out/)
    expect(() => parseArgs(['--blueprint', CASE, '--no-qa', '--no-qa'])).toThrow(/--no-qa/)
  })

  it('każdy komunikat błędu nazywa flagę, której dotyczy', () => {
    const cases: Array<{ argv: string[]; flag: string }> = [
      { argv: [], flag: '--blueprint' },
      { argv: ['--blueprint'], flag: '--blueprint' },
      { argv: ['--blueprint', CASE, '--out'], flag: '--out' },
      { argv: ['--blueprint', CASE, '--out', '--no-qa'], flag: '--out' },
      { argv: ['--blueprint', CASE, '--turbo'], flag: '--turbo' },
      { argv: ['--blueprint', 'a.json', '--blueprint', 'b.json'], flag: '--blueprint' },
      { argv: ['--blueprint', CASE, '--no-qa', '--no-qa'], flag: '--no-qa' },
    ]
    for (const { argv, flag } of cases) {
      expect(() => parseArgs(argv)).toThrow(new RegExp(flag.replace(/-/g, '\\-')))
    }
  })

  it('rzuca Error, nie string ani obiekt bez komunikatu', () => {
    // `main()` łapie to i drukuje `err.message` - rzucony string wypisałby
    // `undefined`.
    expect(() => parseArgs([])).toThrow(Error)
    try {
      parseArgs([])
      throw new Error('parseArgs powinno rzucić')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message.length).toBeGreaterThan(0)
    }
  })
})

describe('parseArgs jest czysta', () => {
  it('nie czyta process.argv', () => {
    const original = process.argv
    try {
      // Gdyby parser sięgał po `process.argv`, ten zestaw albo by go wywrócił
      // na `--turbo`, albo podmienił blueprint.
      process.argv = ['node', 'preview-cli.ts', '--blueprint', 'z-procesu.json', '--turbo']
      expect(parseArgs(['--blueprint', CASE])).toEqual({
        blueprintPath: CASE,
        outDir: 'preview-out',
        runQa: true,
      })
    } finally {
      process.argv = original
    }
  })

  it('nie dotyka dysku', () => {
    // Obserwacja, nie szpiegowanie modułu: `node:fs` eksportuje funkcje jako
    // właściwości niekonfigurowalne, więc `jest.spyOn` ich nie opakuje. Ten
    // test i tak mówi więcej - patrzy na skutek, nie na wywołanie.
    const ghostDir = join(tmpdir(), `previewCli-ghost-${process.pid}`)
    const ghostFile = join(ghostDir, 'case.json')
    expect(existsSync(ghostDir)).toBe(false)

    const args = parseArgs(['--blueprint', ghostFile, '--out', ghostDir])

    // Gdyby parser czytał blueprint, poleciałoby stąd ENOENT zamiast wyniku.
    expect(args.blueprintPath).toBe(ghostFile)
    expect(args.outDir).toBe(ghostDir)
    // Gdyby zakładał katalog wyjściowy, zostałby on tu po teście.
    expect(existsSync(ghostDir)).toBe(false)
    expect(existsSync(ghostFile)).toBe(false)
  })

  it('nie woła sieci', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    try {
      parseArgs(['--blueprint', CASE])
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('nie modyfikuje przekazanej tablicy argumentów', () => {
    const argv = ['--blueprint', CASE, '--out', 'tmp/x', '--no-qa']
    const snapshot = [...argv]
    parseArgs(argv)
    expect(argv).toEqual(snapshot)
  })

  it('daje ten sam wynik przy powtórnym wywołaniu i świeży obiekt za każdym razem', () => {
    const argv = ['--blueprint', CASE, '--out', 'tmp/x']
    const first = parseArgs(argv)
    const second = parseArgs(argv)
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    // Mutacja wyniku nie może wyciec na kolejne wywołanie.
    first.outDir = 'zmienione'
    expect(parseArgs(argv).outDir).toBe('tmp/x')
  })

  it('nie zależy od zmiennych środowiskowych LLM_*', () => {
    const saved = { ...process.env }
    try {
      process.env.LLM_BASE_URL = 'http://przyklad.invalid/v1'
      process.env.LLM_MODEL = 'inny-model'
      process.env.LLM_TIMEOUT_MS = 'to-nie-liczba'
      expect(parseArgs(['--blueprint', CASE])).toEqual({
        blueprintPath: CASE,
        outDir: 'preview-out',
        runQa: true,
      })
    } finally {
      process.env = saved
    }
  })
})

describe('bin/preview-cli.ts jako moduł', () => {
  it('import nie odpala main() - żadnego fetcha, żadnego kodu wyjścia', async () => {
    const argvBefore = process.argv
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as unknown as typeof process.exit)
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      // Te argumenty są tu po to, żeby brak bramki BOLAŁ. Przechodzą przez
      // parser, więc `main()` doszłaby do odczytu pliku, wywróciła się na
      // ENOENT i zostawiła po sobie ślad: `console.error` i kod wyjścia 1.
      // Bez tego zestawu test był pusty - argv jesta nie ma `--blueprint`,
      // więc każdy ślad powstawał już przy imporcie na górze tego pliku,
      // czyli przed założeniem podsłuchów.
      process.argv = ['node', 'preview-cli.ts', '--blueprint', '/nie/ma/takiego/pliku.json']
      process.exitCode = undefined

      jest.isolateModules(() => {
        const mod = require('../../bin/preview-cli') as { parseArgs: typeof parseArgs }
        expect(typeof mod.parseArgs).toBe('function')
      })
      // `main()` kończy asynchronicznie - dajemy pętli zdarzeń szansę, żeby
      // ewentualny przebieg zdążył zostawić po sobie ślad.
      await new Promise((done) => setImmediate(done))

      expect(errorSpy).not.toHaveBeenCalled()
      expect(process.exitCode).toBeUndefined()
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(exitSpy).not.toHaveBeenCalled()
    } finally {
      process.argv = argvBefore
      process.exitCode = undefined
      fetchSpy.mockRestore()
      exitSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })

  it('eksportuje parseArgs i nie eksportuje main()', () => {
    const mod = require('../../bin/preview-cli') as Record<string, unknown>
    expect(typeof mod.parseArgs).toBe('function')
    // `main()` ma efekty uboczne i nie jest testowana jednostkowo (Interfaces
    // z Task A5.1) - nie ma powodu, żeby dało się ją zaimportować.
    expect(mod.main).toBeUndefined()
  })
})

/**
 * Warstwa walidacji CLI. Wcześniej nie miała ani jednego testu: cztery
 * jednoczesne mutacje - kod 2 zamieniony na 1, zgaszona brama kształtu
 * blueprintu, zgaszona brama `Array.isArray(mappings)` i zgaszona brama
 * `LLM_TIMEOUT_MS` - dawały 249/249 PASS. Każdy blok poniżej musi zaczerwienić
 * się po zgaszeniu swojej bramy.
 */
import {
  EXIT_AGENT,
  EXIT_LLM_UNREACHABLE,
  EXIT_USAGE,
  assertOutDirUsable,
  readBaseUrl,
  readBlueprintFile,
  readTimeoutMs,
} from '../../bin/preview-cli'

describe('kontrakt kodow wyjscia', () => {
  it('jest przybity liczbami, nie tylko opisem w pomocy', () => {
    expect({ EXIT_USAGE, EXIT_LLM_UNREACHABLE, EXIT_AGENT }).toEqual({
      EXIT_USAGE: 1,
      EXIT_LLM_UNREACHABLE: 2,
      EXIT_AGENT: 3,
    })
  })
})

describe('readTimeoutMs - zakres domkniety z obu stron', () => {
  const withEnv = (value: string | undefined, fn: () => void) => {
    const previous = process.env.LLM_TIMEOUT_MS
    if (value === undefined) delete process.env.LLM_TIMEOUT_MS
    else process.env.LLM_TIMEOUT_MS = value
    try {
      fn()
    } finally {
      if (previous === undefined) delete process.env.LLM_TIMEOUT_MS
      else process.env.LLM_TIMEOUT_MS = previous
    }
  }

  it.each([
    ['brak zmiennej', undefined],
    ['pusta wartosc', ''],
    ['same spacje', '   '],
  ])('%s daje domyslne 180000', (_label, value) => {
    withEnv(value, () => expect(readTimeoutMs()).toBe(180_000))
  })

  it('przepuszcza poprawna wartosc calkowita', () => {
    withEnv('240000', () => expect(readTimeoutMs()).toBe(240_000))
  })

  it.each([
    ['NaN', 'abc'],
    ['zero', '0'],
    ['ujemna', '-1'],
    ['ulamkowa', '0.5'],
    ['ponad 32-bitowy int - setTimeout scina do 1 ms', '99999999999'],
    ['Infinity', 'Infinity'],
  ])('odrzuca %s', (_label, value) => {
    withEnv(value, () => expect(() => readTimeoutMs()).toThrow(/LLM_TIMEOUT_MS/))
  })
})

describe('readBaseUrl', () => {
  const withEnv = (value: string | undefined, fn: () => void) => {
    const previous = process.env.LLM_BASE_URL
    if (value === undefined) delete process.env.LLM_BASE_URL
    else process.env.LLM_BASE_URL = value
    try {
      fn()
    } finally {
      if (previous === undefined) delete process.env.LLM_BASE_URL
      else process.env.LLM_BASE_URL = previous
    }
  }

  it('domyslnie celuje w lokalne LM Studio', () => {
    withEnv(undefined, () => expect(readBaseUrl()).toBe('http://127.0.0.1:1234/v1'))
  })

  it('obcina koncowe ukosniki - inaczej powstaloby /v1//models', () => {
    withEnv('http://127.0.0.1:1234/v1///', () =>
      expect(readBaseUrl()).toBe('http://127.0.0.1:1234/v1'),
    )
  })
})

describe('readBlueprintFile - jedyna brama miedzy plikiem uzytkownika a promptem', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mercatify-cli-'))
  const write = (name: string, body: string) => {
    const path = join(dir, name)
    writeFileSync(path, body, 'utf8')
    return path
  }
  const valid = { company: { name: 'Voltix' }, blueprint: { customScreens: [] }, mappings: [] }

  it('przepuszcza poprawny plik i zwraca dokladnie trzy pola kontraktu', () => {
    const out = readBlueprintFile(write('ok.json', JSON.stringify(valid)))
    expect(Object.keys(out).sort()).toEqual(['blueprint', 'company', 'mappings'])
  })

  it('nie przepuszcza pol spoza kontraktu do promptu', () => {
    const path = write('extra.json', JSON.stringify({ ...valid, scenario: { netAnnualSaving: 21000 } }))
    expect(JSON.stringify(readBlueprintFile(path))).not.toContain('21000')
  })

  it('odrzuca nieistniejacy plik i nazywa go', () => {
    expect(() => readBlueprintFile(join(dir, 'nie-ma.json'))).toThrow(/nie-ma\.json/)
  })

  it('odrzuca katalog podany zamiast pliku', () => {
    const sub = join(dir, 'jestem-katalogiem')
    mkdirSync(sub, { recursive: true })
    expect(() => readBlueprintFile(sub)).toThrow()
  })

  it.each([
    ['pusty plik', ''],
    ['zepsuty JSON', '{ nie-json'],
    ['tablica zamiast obiektu', '[]'],
    ['null', 'null'],
    ['string', '"blueprint"'],
    ['brak company', JSON.stringify({ blueprint: {}, mappings: [] })],
    ['brak blueprint', JSON.stringify({ company: {}, mappings: [] })],
    ['brak mappings', JSON.stringify({ company: {}, blueprint: {} })],
    ['mappings nie jest tablica', JSON.stringify({ company: {}, blueprint: {}, mappings: {} })],
  ])('odrzuca %s', (label, body) => {
    expect(() => readBlueprintFile(write(`${label.replace(/[^a-z]/gi, '_')}.json`, body))).toThrow()
  })
})

describe('assertOutDirUsable - blad argumentu czlowieka przed wywolaniem modelu', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mercatify-out-'))

  it('przepuszcza istniejacy zapisywalny katalog', () => {
    expect(() => assertOutDirUsable(dir)).not.toThrow()
  })

  it('przepuszcza jeszcze nieistniejacy katalog wewnatrz zapisywalnego rodzica', () => {
    expect(() => assertOutDirUsable(join(dir, 'jeszcze-nie-ma'))).not.toThrow()
  })

  it('odrzuca sciezke istniejaca jako PLIK - wczesniej wychodzilo to kodem 3 po obu wywolaniach modelu', () => {
    const asFile = join(dir, 'plik.txt')
    writeFileSync(asFile, 'x', 'utf8')
    expect(() => assertOutDirUsable(asFile)).toThrow(/not a directory/)
  })

  it('odrzuca sciezke w nieistniejacym drzewie', () => {
    expect(() => assertOutDirUsable('/nie-wolno-tu/pisac/x')).toThrow(/not writable/)
  })
})

describe('sufit rozmiaru blueprintu - cala zawartosc ladu je w prompcie', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mercatify-big-'))

  it('odrzuca plik ponad limitem, zanim cokolwiek pojdzie do modelu', () => {
    const path = join(dir, 'big.json')
    const filler = 'x'.repeat(1_100_000)
    writeFileSync(path, JSON.stringify({ company: { name: filler }, blueprint: {}, mappings: [] }), 'utf8')
    expect(() => readBlueprintFile(path)).toThrow(/over the 1000000 byte limit/)
  })

  it('komunikat bledu nie jest wielkosci odrzuconego pliku', () => {
    const path = join(dir, 'noisy.json')
    writeFileSync(path, JSON.stringify({ company: { note: 'y'.repeat(5000) }, blueprint: {} }), 'utf8')
    try {
      readBlueprintFile(path)
      throw new Error('mialo rzucic')
    } catch (err) {
      expect((err as Error).message.length).toBeLessThan(600)
    }
  })
})
