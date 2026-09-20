/** @jest-environment node */
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  EXIT_AGENT,
  EXIT_LLM_UNREACHABLE,
  EXIT_USAGE,
  assertLlmReachable,
  assertOutFileUsable,
  parseArgs,
  previewDirFor,
  readBaseUrl,
  readBriefFile,
  readTimeoutMs,
  type ReportCliArgs,
} from '../../bin/report-cli'

/**
 * Testujemy CZYSTY parser i WSZYSTKIE bramy walidacyjne - dokładnie tę listę,
 * którą deklaruje komentarz na górze `bin/report-cli.ts`. `main()` czyta dysk,
 * woła LM Studio i kończy proces kodem wyjścia, więc nie podlega testom
 * jednostkowym; ostatni blok pilnuje tylko tego, żeby sam import jej NIE
 * odpalał.
 *
 * Powód, dla którego bram jest tu tyle: w `preview-cli.ts` warstwa walidacji
 * nie miała ani jednego testu i cztery jednoczesne mutacje - zgaszony kod 2,
 * zgaszona brama kształtu pliku, zgaszona brama tablicy i zgaszone
 * `LLM_TIMEOUT_MS` - dawały pełną zieloną suitę. Każdy blok poniżej musi się
 * zaczerwienić po zgaszeniu swojej bramy.
 *
 * Żaden test tutaj nie woła sieci; jedyny, który dotyka `fetch`, podstawia
 * własną atrapę.
 */

const BRIEF = 'brief.json'

/** Najmniejszy brief, który przechodzi `normalizeBrief`. */
const MINIMAL_BRIEF = {
  v: 2,
  kind: 'mercatify-brief',
  company: { name: 'Voltix', industry: '', people: 34 },
  currency: 'USD',
  tools: [
    {
      name: 'Xero',
      category: 'Accounting',
      seats: 3,
      monthly: 78,
      plan: 'Established',
      unitPrice: 26,
      termEnds: '',
      termType: 'monthly',
      modules: [{ name: 'Accounting', desc: 'Books', caps: ['accounting.ledger'], evidenceKind: 'observed', evidenceNote: 'n' }],
    },
  ],
}

// --- parseArgs ---------------------------------------------------------------

describe('parseArgs - wartosci i domyslne', () => {
  it('czyta sciezke briefu i stosuje domyslne wartosci', () => {
    expect(parseArgs(['--brief', BRIEF])).toEqual({
      briefPath: BRIEF,
      outPath: 'report-out/report.html',
      useLlm: true,
      runPreview: true,
    })
  })

  it('domyslny outPath wskazuje na ./report-out/report.html', () => {
    const { outPath } = parseArgs(['--brief', BRIEF])
    expect(resolve(outPath)).toBe(resolve('./report-out/report.html'))
  })

  it('honoruje --out', () => {
    expect(parseArgs(['--brief', BRIEF, '--out', 'tmp/x.html']).outPath).toBe('tmp/x.html')
  })

  it('honoruje --no-preview bez wylaczania modelu', () => {
    expect(parseArgs(['--brief', BRIEF, '--no-preview'])).toEqual({
      briefPath: BRIEF,
      outPath: 'report-out/report.html',
      useLlm: true,
      runPreview: false,
    })
  })

  it('--no-llm wylacza podglad niejawnie, bo Sandbox Engineer i QA SA agentami', () => {
    expect(parseArgs(['--brief', BRIEF, '--no-llm'])).toEqual({
      briefPath: BRIEF,
      outPath: 'report-out/report.html',
      useLlm: false,
      runPreview: false,
    })
  })

  it('nie zalezy od kolejnosci flag', () => {
    const expected: ReportCliArgs = {
      briefPath: BRIEF,
      outPath: 'tmp/x.html',
      useLlm: false,
      runPreview: false,
    }
    expect(parseArgs(['--no-llm', '--out', 'tmp/x.html', '--brief', BRIEF])).toEqual(expected)
    expect(parseArgs(['--out', 'tmp/x.html', '--brief', BRIEF, '--no-llm'])).toEqual(expected)
  })

  it('przyjmuje sciezki bezwzgledne i zagniezdzone bez zmiany zapisu', () => {
    expect(parseArgs(['--brief', '/abs/b.json', '--out', '/tmp/a/b/c.html']).outPath).toBe('/tmp/a/b/c.html')
    expect(parseArgs(['--brief', './x/../b.json']).briefPath).toBe('./x/../b.json')
  })
})

describe('parseArgs - odrzucanie zlych argumentow', () => {
  it('odrzuca brak wymaganego --brief', () => {
    expect(() => parseArgs([])).toThrow(/--brief/)
    expect(() => parseArgs(['--no-llm'])).toThrow(/--brief/)
    expect(() => parseArgs(['--out', 'x.html'])).toThrow(/--brief/)
  })

  it('odrzuca flage bez wartosci', () => {
    expect(() => parseArgs(['--brief'])).toThrow(/--brief/)
    expect(() => parseArgs(['--brief', BRIEF, '--out'])).toThrow(/--out/)
  })

  it('odrzuca pusta i samobiala wartosc zamiast brac ja za sciezke', () => {
    expect(() => parseArgs(['--brief', ''])).toThrow(/--brief/)
    expect(() => parseArgs(['--brief', BRIEF, '--out', '   '])).toThrow(/--out/)
  })

  it('nie zjada nastepnej flagi jako wartosci', () => {
    // `--out --no-llm` to literowka, nie plik o nazwie "--no-llm". Ciche
    // wziecie jej za wartosc zapisaloby raport pod smieciowa nazwa i ZOSTAWILO
    // agenty wlaczone, mimo ze uzytkownik napisal --no-llm.
    expect(() => parseArgs(['--brief', BRIEF, '--out', '--no-llm'])).toThrow(/--out/)
    expect(() => parseArgs(['--brief', '--out', 'x.html'])).toThrow(/--brief/)
    expect(() => parseArgs(['--brief', BRIEF, '--out', '-h'])).toThrow(/--out/)
  })

  it('odrzuca nieznana flage zamiast ja milczaco ignorowac', () => {
    expect(() => parseArgs(['--brief', BRIEF, '--turbo'])).toThrow(/--turbo/)
    // `--no-qa` to flaga SIOSTRZANEGO CLI. Cicha akceptacja znaczylaby, ze
    // ktos wpisal ja z pamieci i dostal podglad, ktory chcial pominac.
    expect(() => parseArgs(['--brief', BRIEF, '--no-qa'])).toThrow(/--no-qa/)
    expect(() => parseArgs(['--help'])).toThrow(/--help/)
  })

  it('odrzuca argument pozycyjny bez flagi', () => {
    expect(() => parseArgs([BRIEF])).toThrow(/brief\.json/)
    expect(() => parseArgs(['--brief', BRIEF, 'extra'])).toThrow(/extra/)
  })

  it('odrzuca powtorzona flage zamiast po cichu brac ostatnia', () => {
    expect(() => parseArgs(['--brief', 'a.json', '--brief', 'b.json'])).toThrow(/--brief/)
    expect(() => parseArgs(['--brief', BRIEF, '--out', 'a.html', '--out', 'b.html'])).toThrow(/--out/)
    expect(() => parseArgs(['--brief', BRIEF, '--no-llm', '--no-llm'])).toThrow(/--no-llm/)
    expect(() => parseArgs(['--brief', BRIEF, '--no-preview', '--no-preview'])).toThrow(/--no-preview/)
  })

  it('kazdy komunikat bledu nazywa flage, ktorej dotyczy', () => {
    const cases: Array<{ argv: string[]; flag: string }> = [
      { argv: [], flag: '--brief' },
      { argv: ['--brief'], flag: '--brief' },
      { argv: ['--brief', BRIEF, '--out'], flag: '--out' },
      { argv: ['--brief', BRIEF, '--out', '--no-llm'], flag: '--out' },
      { argv: ['--brief', BRIEF, '--turbo'], flag: '--turbo' },
      { argv: ['--brief', 'a.json', '--brief', 'b.json'], flag: '--brief' },
      { argv: ['--brief', BRIEF, '--no-preview', '--no-preview'], flag: '--no-preview' },
    ]
    for (const { argv, flag } of cases) {
      expect(() => parseArgs(argv)).toThrow(new RegExp(flag.replace(/-/g, '\\-')))
    }
  })

  it('rzuca Error, nie string ani obiekt bez komunikatu', () => {
    expect(() => parseArgs([])).toThrow(Error)
  })
})

describe('parseArgs jest czysta', () => {
  it('nie czyta process.argv', () => {
    const original = process.argv
    try {
      process.argv = ['node', 'report-cli.ts', '--brief', 'z-procesu.json', '--turbo']
      expect(parseArgs(['--brief', BRIEF]).briefPath).toBe(BRIEF)
    } finally {
      process.argv = original
    }
  })

  it('nie dotyka dysku', () => {
    // Obserwacja, nie szpiegowanie modulu: patrzymy na SKUTEK, nie na wywolanie.
    const ghostDir = join(tmpdir(), `reportCli-ghost-${process.pid}`)
    const ghostFile = join(ghostDir, 'brief.json')
    expect(existsSync(ghostDir)).toBe(false)

    const args = parseArgs(['--brief', ghostFile, '--out', join(ghostDir, 'r.html')])

    expect(args.briefPath).toBe(ghostFile)
    expect(existsSync(ghostDir)).toBe(false)
  })

  it('nie wola sieci', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    try {
      parseArgs(['--brief', BRIEF])
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('nie modyfikuje przekazanej tablicy i oddaje swiezy obiekt', () => {
    const argv = ['--brief', BRIEF, '--out', 'tmp/x.html', '--no-llm']
    const snapshot = [...argv]
    const first = parseArgs(argv)
    expect(argv).toEqual(snapshot)
    first.outPath = 'zmienione'
    expect(parseArgs(argv).outPath).toBe('tmp/x.html')
  })

  it('nie zalezy od zmiennych srodowiskowych LLM_*', () => {
    const saved = { ...process.env }
    try {
      process.env.LLM_BASE_URL = 'http://przyklad.invalid/v1'
      process.env.LLM_TIMEOUT_MS = 'to-nie-liczba'
      expect(parseArgs(['--brief', BRIEF]).useLlm).toBe(true)
    } finally {
      process.env = saved
    }
  })
})

// --- Kody wyjscia ------------------------------------------------------------

/** `CliError` nie jest eksportowany; jego kod czytamy z rzuconego obiektu. */
function exitCodeOf(run: () => unknown): number | undefined {
  try {
    run()
  } catch (err) {
    return (err as { exitCode?: number }).exitCode
  }
  throw new Error('oczekiwano rzutu')
}

describe('kontrakt kodow wyjscia', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mercatify-report-exit-'))

  it('jest przybity liczbami, nie tylko opisem w pomocy', () => {
    expect({ EXIT_USAGE, EXIT_LLM_UNREACHABLE, EXIT_AGENT }).toEqual({
      EXIT_USAGE: 1,
      EXIT_LLM_UNREACHABLE: 2,
      EXIT_AGENT: 3,
    })
  })

  it('kod 1: kazda brama na wejscie CZLOWIEKA konczy jedynka', () => {
    // To jest cala roznica miedzy 1 a 3: jedynka znaczy "popraw swoj plik",
    // trojka znaczy "model zlamal kontrakt". Bramy ponizej sa po stronie
    // czlowieka, wiec zadna z nich nie ma prawa oddac trojki.
    expect(exitCodeOf(() => readBriefFile(join(dir, 'nie-ma.json')))).toBe(EXIT_USAGE)
    expect(exitCodeOf(() => assertOutFileUsable('/nie-wolno-tu/pisac/r.html'))).toBe(EXIT_USAGE)
    const saved = process.env.LLM_TIMEOUT_MS
    process.env.LLM_TIMEOUT_MS = 'abc'
    try {
      expect(exitCodeOf(() => readTimeoutMs())).toBe(EXIT_USAGE)
    } finally {
      if (saved === undefined) delete process.env.LLM_TIMEOUT_MS
      else process.env.LLM_TIMEOUT_MS = saved
    }
  })

  it('kod 2: preflight, ktory nie dostal odpowiedzi, nazywa serwer i LLM_BASE_URL', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(Object.assign(new Error('fetch failed'), { cause: new Error('ECONNREFUSED') }))
    try {
      await expect(assertLlmReachable('http://127.0.0.1:65535/v1', 'k')).rejects.toMatchObject({
        exitCode: EXIT_LLM_UNREACHABLE,
      })
      await expect(assertLlmReachable('http://127.0.0.1:65535/v1', 'k')).rejects.toThrow(
        /http:\/\/127\.0\.0\.1:65535\/v1\/models[\s\S]*LLM_BASE_URL/,
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('kod 2: serwer, ktory ODMOWIL, dostaje rade o kluczu, nie o uruchomieniu', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('no', { status: 401, statusText: 'Unauthorized' }))
    try {
      await expect(assertLlmReachable('http://127.0.0.1:1234/v1', 'zly-klucz')).rejects.toThrow(
        /LLM_API_KEY/,
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('kod 2: preflight niesie ten sam klucz co wlasciwe wywolania', async () => {
    // Bez naglowka kazdy serwer wymagajacy klucza odpowiada 401, a CLI
    // radziloby uruchomic LM Studio zamiast poprawic klucz.
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    try {
      await assertLlmReachable('http://127.0.0.1:1234/v1', 'sekret')
      const init = fetchSpy.mock.calls[0][1]
      expect(init?.headers).toEqual({ Authorization: 'Bearer sekret' })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('kod 3 jest ZAREZERWOWANY dla przebiegu - zadna brama go nie oddaje', () => {
    const codes = [
      exitCodeOf(() => readBriefFile(join(dir, 'nie-ma.json'))),
      exitCodeOf(() => readBriefFile(dir)),
      exitCodeOf(() => assertOutFileUsable('/nie-wolno-tu/pisac/r.html')),
    ]
    expect(codes).not.toContain(EXIT_AGENT)
    expect(new Set(codes)).toEqual(new Set([EXIT_USAGE]))
  })
})

// --- Srodowisko --------------------------------------------------------------

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
    withEnv('http://127.0.0.1:1234/v1///', () => expect(readBaseUrl()).toBe('http://127.0.0.1:1234/v1'))
  })
})

// --- readBriefFile -----------------------------------------------------------

describe('readBriefFile - jedyna brama miedzy plikiem uzytkownika a przebiegiem', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mercatify-report-brief-'))
  const write = (name: string, body: unknown) => {
    const path = join(dir, name)
    writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body), 'utf8')
    return path
  }

  it('przepuszcza poprawny brief i oddaje surowy brief plus wejscia konsultanta', () => {
    const out = readBriefFile(write('ok.json', MINIMAL_BRIEF))
    expect(Object.keys(out).sort()).toEqual(['brief', 'consultant'])
    expect(out.consultant.meta.preparedFor.organization).toBe('Voltix')
    expect(out.consultant.terms).toEqual([
      { tool: 'Xero', plan: 'Established', unitPrice: 26, termEnds: '', termType: 'monthly' },
    ])
  })

  it('nie zgaduje niczego, czego w pliku nie ma', () => {
    const out = readBriefFile(write('bare.json', MINIMAL_BRIEF))
    // Brak kosztow, brak stawki, brak licznikow - i tak ma zostac. Raport
    // powstanie bez Figure 2 i powie o tym wprost, zamiast pokazac zera.
    expect(out.consultant.rate).toBeUndefined()
    expect(out.consultant.hostingMonthly).toBeUndefined()
    expect(out.consultant.omOperatingCost).toBeUndefined()
    expect(out.consultant.counts).toBeUndefined()
    expect(out.consultant.plan).toBeUndefined()
    // Nadawcy nie ma skad wziac - pusta rubryka jest uczciwsza niz wymyslone
    // nazwisko konsultanta na okladce dokumentu handlowego.
    expect(out.consultant.meta.preparedBy).toEqual({ organization: '', person: '', role: '' })
    expect(out.consultant.meta.humanReviewed).toBe(false)
  })

  it('czyta blok consultant, kiedy jest, i date wydania ze stempla formularza', () => {
    const out = readBriefFile(
      write('full.json', {
        ...MINIMAL_BRIEF,
        created: '2026-09-19',
        readWhat: 'Jedna rozmowa',
        consultant: {
          caseId: 'CASE-0041',
          hostingMonthly: 180,
          rate: 120,
          counts: { statements: 38, offCatalog: 4 },
          humanReviewed: true,
          preparedBy: { organization: 'Mercatify', person: 'J. P.', role: 'consultant' },
        },
      }),
    )
    expect(out.consultant.meta.caseId).toBe('CASE-0041')
    expect(out.consultant.meta.issued).toBe('2026-09-19')
    expect(out.consultant.meta.version).toBe('1.0')
    expect(out.consultant.rate).toBe(120)
    expect(out.consultant.hostingMonthly).toBe(180)
    expect(out.consultant.counts).toEqual({ statements: 38, offCatalog: 4 })
    expect(out.consultant.basis.readWhat).toBe('Jedna rozmowa')
  })

  it('nie przepuszcza pol spoza kontraktu do wejsc konsultanta', () => {
    const out = readBriefFile(
      write('extra.json', { ...MINIMAL_BRIEF, consultant: { caseId: 'X', margin: 0.42 } }),
    )
    expect(JSON.stringify(out.consultant)).not.toContain('0.42')
  })

  it('odrzuca nieistniejacy plik i nazywa go', () => {
    expect(() => readBriefFile(join(dir, 'nie-ma.json'))).toThrow(/nie-ma\.json/)
  })

  it('odrzuca katalog podany zamiast pliku', () => {
    const sub = join(dir, 'jestem-katalogiem')
    mkdirSync(sub, { recursive: true })
    expect(() => readBriefFile(sub)).toThrow()
  })

  it.each([
    ['pusty plik', ''],
    ['zepsuty JSON', '{ nie-json'],
    ['tablica zamiast obiektu', '[]'],
    ['null', 'null'],
    ['string', '"brief"'],
  ])('odrzuca %s', (label, body) => {
    expect(() => readBriefFile(write(`${label.replace(/[^a-z]/gi, '_')}.json`, body))).toThrow()
  })

  it.each([
    ['zla wersje', { ...MINIMAL_BRIEF, v: 9 }],
    ['zly kind - to moglby byc ReportModel albo case', { ...MINIMAL_BRIEF, kind: 'mercatify-case' }],
    ['brak tools', { v: 2, kind: 'mercatify-brief', company: { name: 'V', people: 1 }, currency: 'USD' }],
    ['modul bez zdolnosci', {
      ...MINIMAL_BRIEF,
      tools: [{ ...MINIMAL_BRIEF.tools[0], modules: [{ name: 'X', desc: '', caps: [] }] }],
    }],
  ])('odrzuca brief, ktory nie przeszedl bramy wejsciowej: %s', (label, body) => {
    // Ta sama brama, ktorej uzyje `buildReport` - sprawdzona TUTAJ, zeby zly
    // plik kosztowal komunikat, a nie kilku minut mielenia lokalnego modelu.
    expect(() => readBriefFile(write(`${label.replace(/[^a-z]/gi, '_')}.json`, body))).toThrow(
      /is not a usable brief/,
    )
  })

  it('odrzuca plik ponad sufitem rozmiaru, zanim cokolwiek pojdzie dalej', () => {
    const path = join(dir, 'big.json')
    writeFileSync(path, JSON.stringify({ ...MINIMAL_BRIEF, pains: 'x'.repeat(1_100_000) }), 'utf8')
    expect(() => readBriefFile(path)).toThrow(/over the 1000000 byte limit/)
  })

  it('komunikat bledu nie jest wielkosci odrzuconego pliku', () => {
    const path = write('noisy.json', { ...MINIMAL_BRIEF, consultant: { caseId: 'y'.repeat(5000) } })
    // `caseId` jest stringiem, wiec ten plik przechodzi - zly jest dopiero
    // `rate`, i to jego komunikat ma byc krotki.
    const bad = write('noisy2.json', { ...MINIMAL_BRIEF, consultant: { rate: 'y'.repeat(5000) } })
    expect(() => readBriefFile(path)).not.toThrow()
    try {
      readBriefFile(bad)
      throw new Error('mialo rzucic')
    } catch (err) {
      expect((err as Error).message.length).toBeLessThan(500)
    }
  })
})

// --- assertOutFileUsable -----------------------------------------------------

describe('assertOutFileUsable - blad argumentu czlowieka przed wywolaniem modelu', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mercatify-report-out-'))

  it('przepuszcza nowy plik w istniejacym katalogu', () => {
    expect(() => assertOutFileUsable(join(dir, 'report.html'))).not.toThrow()
  })

  it('przepuszcza sciezke w jeszcze nieistniejacym drzewie - writeReport je zaklada', () => {
    expect(() => assertOutFileUsable(join(dir, 'a', 'b', 'c', 'report.html'))).not.toThrow()
  })

  it('przepuszcza nadpisanie istniejacego zwyklego pliku', () => {
    const path = join(dir, 'stary.html')
    writeFileSync(path, '<html></html>', 'utf8')
    expect(() => assertOutFileUsable(path)).not.toThrow()
  })

  it('odrzuca sciezke istniejaca jako KATALOG', () => {
    const sub = join(dir, 'katalog')
    mkdirSync(sub, { recursive: true })
    expect(() => assertOutFileUsable(sub)).toThrow(/not a regular file/)
  })

  it('odrzuca symlink - CWE-59 - zanim cokolwiek policzy model', () => {
    // `writeReport` odrzuca go tez, ale tam jest to ostatnia linia obrony po
    // calym przebiegu. Tu jest to komunikat dla czlowieka, ktory zdazy
    // poprawic sciezke.
    const target = join(dir, 'cel.html')
    const link = join(dir, 'link.html')
    writeFileSync(target, 'x', 'utf8')
    symlinkSync(target, link)
    expect(() => assertOutFileUsable(link)).toThrow(/symlink/)
  })

  it('odrzuca sciezke w niezapisywalnym drzewie', () => {
    expect(() => assertOutFileUsable('/nie-wolno-tu/pisac/report.html')).toThrow(
      /not writable|not a directory/,
    )
  })
})

describe('previewDirFor', () => {
  it('kladzie podglad OBOK raportu - jeden katalog na jedna sprawe', () => {
    expect(previewDirFor('/tmp/case/report.html')).toBe(resolve('/tmp/case/preview'))
  })
})

// --- Modul -------------------------------------------------------------------

describe('bin/report-cli.ts jako modul', () => {
  it('import nie odpala main() - zadnego fetcha, zadnego kodu wyjscia', async () => {
    const argvBefore = process.argv
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as unknown as typeof process.exit)
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      // Te argumenty sa tu po to, zeby brak bramki BOLAL: przechodza przez
      // parser, wiec `main()` doszlaby do odczytu pliku, wywrocila sie na
      // ENOENT i zostawila slad - `console.error` i kod wyjscia 1.
      process.argv = ['node', 'report-cli.ts', '--brief', '/nie/ma/takiego/pliku.json']
      process.exitCode = undefined

      jest.isolateModules(() => {
        const mod = require('../../bin/report-cli') as { parseArgs: typeof parseArgs }
        expect(typeof mod.parseArgs).toBe('function')
      })
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

  it('eksportuje parser i wszystkie bramy, a nie eksportuje main()', () => {
    const mod = require('../../bin/report-cli') as Record<string, unknown>
    for (const name of [
      'parseArgs',
      'readBriefFile',
      'readTimeoutMs',
      'readBaseUrl',
      'assertOutFileUsable',
      'assertLlmReachable',
      'previewDirFor',
    ]) {
      expect(typeof mod[name]).toBe('function')
    }
    expect(mod.main).toBeUndefined()
  })
})
