/** @jest-environment node */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  EXIT_AGENT,
  EXIT_LLM_UNREACHABLE,
  EXIT_USAGE,
  parseArgs,
  readArtifactFile,
  readBaseUrl,
  readTimeoutMs,
} from '../../bin/critic-cli'
import { STAGE_NAMES } from '../critic'

/**
 * Wejście CLI agenta `critic`. Istnieje, bo Global Constraint planu wymaga, by
 * KAŻDY agent dawał się uruchomić z linii poleceń, a `critique()` nie było
 * osiągalne znikąd. Testowana jest czysta warstwa: parser i bramy walidacyjne.
 */
describe('parseArgs', () => {
  it('parsuje komplet poprawnych argumentow', () => {
    expect(parseArgs(['--stage', 'mappings', '--artifact', 'a.json'])).toEqual({
      stage: 'mappings',
      artifactPath: 'a.json',
    })
  })

  it('nie zalezy od kolejnosci flag', () => {
    expect(parseArgs(['--artifact', 'a.json', '--stage', 'preview'])).toEqual({
      stage: 'preview',
      artifactPath: 'a.json',
    })
  })

  it.each(STAGE_NAMES)('przyjmuje etap %s z zamknietego rejestru', (stage) => {
    expect(parseArgs(['--stage', stage, '--artifact', 'a.json']).stage).toBe(stage)
  })

  it.each([
    ['nieznany etap', ['--stage', 'invoicing', '--artifact', 'a.json'], /Unknown --stage/],
    ['klucz prototypu jako etap', ['--stage', '__proto__', '--artifact', 'a.json'], /Unknown --stage/],
    ['brak --stage', ['--artifact', 'a.json'], /--stage/],
    ['brak --artifact', ['--stage', 'mappings'], /--artifact/],
    ['nieznana flaga', ['--stage', 'mappings', '--artifact', 'a.json', '--force'], /Unknown flag/],
    ['powtorzony --stage', ['--stage', 'mappings', '--stage', 'preview', '--artifact', 'a.json'], /Repeated flag/],
    ['wartosc wygladajaca jak flaga', ['--stage', '--artifact', 'a.json'], /not a value/],
    ['wartosc z pojedynczym myslnikiem', ['--stage', 'mappings', '--artifact', '-h'], /not a value/],
    ['pusta wartosc', ['--stage', '   ', '--artifact', 'a.json'], /empty value/],
    ['brak wartosci na koncu', ['--stage'], /end of arguments/],
  ])('odrzuca %s', (_label, argv, pattern) => {
    expect(() => parseArgs(argv as string[])).toThrow(pattern as RegExp)
  })

  it('jest czysta - nie czyta process.argv', () => {
    const previous = process.argv
    process.argv = ['node', 'x', '--stage', 'audit', '--artifact', 'podmienione.json']
    try {
      expect(parseArgs(['--stage', 'preview', '--artifact', 'wlasciwe.json']).artifactPath).toBe(
        'wlasciwe.json',
      )
    } finally {
      process.argv = previous
    }
  })
})

describe('kontrakt kodow wyjscia - ten sam co w preview-cli', () => {
  it('jest przybity liczbami', () => {
    expect({ EXIT_USAGE, EXIT_LLM_UNREACHABLE, EXIT_AGENT }).toEqual({
      EXIT_USAGE: 1,
      EXIT_LLM_UNREACHABLE: 2,
      EXIT_AGENT: 3,
    })
  })
})

describe('readArtifactFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mercatify-critic-'))
  const write = (name: string, body: string) => {
    const path = join(dir, name)
    writeFileSync(path, body, 'utf8')
    return path
  }

  it('przepuszcza dowolny poprawny JSON - artefakt nie ma narzuconego ksztaltu', () => {
    expect(readArtifactFile(write('ok.json', '{"mappings":[]}'))).toEqual({ mappings: [] })
  })

  it('odrzuca nieistniejacy plik', () => {
    expect(() => readArtifactFile(join(dir, 'nie-ma.json'))).toThrow(/cannot read/)
  })

  it('odrzuca zepsuty JSON', () => {
    expect(() => readArtifactFile(write('zly.json', '{ nie-json'))).toThrow(/not valid JSON/)
  })

  it('odrzuca plik ponad limitem - cala zawartosc ladu je w prompcie', () => {
    const path = write('big.json', JSON.stringify({ note: 'x'.repeat(1_100_000) }))
    expect(() => readArtifactFile(path)).toThrow(/over the 1000000 byte limit/)
  })
})

describe('readTimeoutMs i readBaseUrl', () => {
  const withEnv = (key: string, value: string | undefined, fn: () => void) => {
    const previous = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
    try {
      fn()
    } finally {
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    }
  }

  it('domyslny timeout to 180000', () => {
    withEnv('LLM_TIMEOUT_MS', undefined, () => expect(readTimeoutMs()).toBe(180_000))
  })

  it.each(['abc', '0', '-1', '0.5', '99999999999'])('odrzuca LLM_TIMEOUT_MS=%s', (value) => {
    withEnv('LLM_TIMEOUT_MS', value, () => expect(() => readTimeoutMs()).toThrow(/LLM_TIMEOUT_MS/))
  })

  it('obcina koncowe ukosniki w LLM_BASE_URL', () => {
    withEnv('LLM_BASE_URL', 'http://127.0.0.1:1234/v1//', () =>
      expect(readBaseUrl()).toBe('http://127.0.0.1:1234/v1'),
    )
  })
})
