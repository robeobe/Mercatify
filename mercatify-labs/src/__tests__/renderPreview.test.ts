/** @jest-environment node */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writePreview } from '../preview/renderPreview'
import type { ScreenKind, ScreenSpec } from '../preview/templates'

/** Minimalny poprawny spec - testom nazw nie zależy na treści ekranu. */
const named = (name: string): ScreenSpec => ({
  name,
  kind: 'list',
  title: 'x',
  columns: [],
  rows: [],
})

const STAMP = new Date('2026-09-19T10:00:00.000Z')

describe('writePreview', () => {
  /**
   * `parent` jest tu równie ważny jak `outDir`. Asercja wyłącznie na
   * `readdirSync(outDir)` jest ślepa na dokładnie ten błąd, przed którym ma
   * bronić: pisarz, który waliduje nazwę PO zapisie, tworzy `evil.html` w
   * KATALOGU-RODZICU i przechodzi taką asercję na zielono. Dopiero listing
   * `parent` przed i po dowodzi drugiej połowy kontraktu - "NIE tworzy
   * żadnego pliku poza `outDir`".
   */
  let parent: string
  let outDir: string
  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'mercatify-preview-'))
    outDir = join(parent, 'out')
    mkdirSync(outDir)
  })
  afterEach(() => {
    rmSync(parent, { recursive: true, force: true })
  })

  it('writes one HTML file per screen and returns a manifest of relative paths', () => {
    const manifest = writePreview(
      [
        {
          name: 'dashboard',
          kind: 'dashboard',
          title: 'Dashboard',
          columns: ['Metric'],
          rows: [{ cells: [{ column: 'Metric', value: 'Net saving' }] }],
        },
        {
          name: 'deals',
          kind: 'list',
          title: 'Deals',
          columns: ['Name'],
          rows: [{ cells: [{ column: 'Name', value: 'Voltix' }] }],
          lang: 'pl',
        },
      ],
      outDir,
      STAMP,
    )

    expect(manifest.screens).toEqual([
      { name: 'dashboard', path: 'dashboard.html' },
      { name: 'deals', path: 'deals.html' },
    ])
    expect(manifest.generatedAt).toBe('2026-09-19T10:00:00.000Z')
    expect(readdirSync(outDir).sort()).toEqual(['dashboard.html', 'deals.html'])
    expect(readFileSync(join(outDir, 'deals.html'), 'utf8')).toContain('<td>Voltix</td>')
    // `lang` jest polem hosta (templates.ts) - writePreview ma je tylko przepuścić.
    expect(readFileSync(join(outDir, 'deals.html'), 'utf8')).toContain('<html lang="pl"')
    expect(readFileSync(join(outDir, 'dashboard.html'), 'utf8')).toContain('<html lang="en"')
    // Nic nie wyciekło obok `outDir`.
    expect(readdirSync(parent)).toEqual(['out'])
  })

  it('creates the output directory when it does not exist yet', () => {
    const nested = join(parent, 'deep', 'preview')
    const manifest = writePreview([named('deals')], nested, STAMP)

    expect(manifest.screens).toEqual([{ name: 'deals', path: 'deals.html' }])
    expect(readdirSync(nested)).toEqual(['deals.html'])
  })

  it('overwrites a previous preview in place so regeneration stays idempotent', () => {
    writePreview([named('deals')], outDir, STAMP)
    const first = readFileSync(join(outDir, 'deals.html'), 'utf8')

    writePreview([{ ...named('deals'), title: 'Second run' }], outDir, STAMP)
    const second = readFileSync(join(outDir, 'deals.html'), 'utf8')

    expect(second).not.toBe(first)
    expect(second).toContain('<title>Second run</title>')
    // Zwykły plik zastąpiony w całości, bez ogona po dłuższej poprzedniej treści.
    expect(second).not.toContain('<title>x</title>')
    expect(readdirSync(outDir)).toEqual(['deals.html'])
  })

  it('rejects a screen name that would escape the output directory and writes nothing anywhere', () => {
    expect(readdirSync(parent)).toEqual(['out'])

    expect(() =>
      writePreview([{ name: '../evil', kind: 'list', title: 'x', columns: [], rows: [] }], outDir),
    ).toThrow(/screen name/i)

    // Cała rodzina ucieczek, bo `name` pochodzi od LLM: separatory obu systemów,
    // ścieżka absolutna, bajt NUL (obcina nazwę w warstwie C) i same kropki.
    const escapes = [
      '../../evil',
      '..',
      '.',
      'a/b',
      '..\\evil',
      'a\\b',
      '/etc/passwd',
      'evil .html',
      '',
    ]
    for (const name of escapes) {
      expect(() => writePreview([named(name)], outDir)).toThrow(/screen name/i)
    }

    // Zła nazwa W ŚRODKU listy nie może zostawić na dysku pół podglądu.
    expect(() => writePreview([named('good'), named('../evil')], outDir)).toThrow(/screen name/i)

    expect(readdirSync(outDir)).toEqual([])
    // Druga połowa kontraktu z planu: ŻADEN plik nie powstał poza `outDir`.
    // Pisarz walidujący po zapisie utworzyłby tu `evil.html` i przeszedł
    // poprzednią asercję na zielono.
    expect(readdirSync(parent)).toEqual(['out'])
  })

  it('refuses a screen path that a symlink would redirect out of the output directory', () => {
    // Dowiązanie WISZĄCE: `writeFileSync` podąża za nim i TWORZY plik pod
    // celem, czyli materializuje nowy plik w katalogu-rodzicu mimo poprawnej
    // nazwy ekranu. Nazwa nie ma tu nic do rzeczy - ucieczką jest sam wpis
    // w katalogu wyjściowym.
    symlinkSync(join(parent, 'evil.html'), join(outDir, 'deals.html'))

    expect(() => writePreview([named('deals')], outDir, STAMP)).toThrow(/symlink/i)

    expect(existsSync(join(parent, 'evil.html'))).toBe(false)
    expect(readdirSync(parent)).toEqual(['out'])
  })

  it('refuses to write through a symlink and leaves the victim file byte-identical', () => {
    const secretDir = join(parent, 'secret')
    mkdirSync(secretDir)
    const victim = join(secretDir, 'victim.txt')
    const VICTIM_CONTENTS = 'top secret\n'
    writeFileSync(victim, VICTIM_CONTENTS, 'utf8')

    symlinkSync(victim, join(outDir, 'deals.html'))

    expect(() => writePreview([named('deals')], outDir, STAMP)).toThrow(/symlink/i)

    // Sedno CWE-59: liczy się STAN PLIKU-OFIARY na dysku, a nie sam fakt
    // rzucenia. Przed naprawą `writePreview` nie rzucało w ogóle - zwracało
    // manifest z `path: "deals.html"` i nadpisywało ofiarę treścią podglądu.
    expect(readFileSync(victim, 'utf8')).toBe(VICTIM_CONTENTS)
  })

  it('refuses a screen path occupied by a directory instead of clobbering it', () => {
    mkdirSync(join(outDir, 'deals.html'))
    writeFileSync(join(outDir, 'deals.html', 'keep.txt'), 'keep', 'utf8')

    expect(() => writePreview([named('deals')], outDir, STAMP)).toThrow(
      /non-regular file|EISDIR/i,
    )
    expect(readFileSync(join(outDir, 'deals.html', 'keep.txt'), 'utf8')).toBe('keep')
  })

  it('still writes normally when the output directory is itself reached through a symlink', () => {
    const linkToOutDir = join(parent, 'link')
    symlinkSync(outDir, linkToOutDir)

    const manifest = writePreview([named('deals')], linkToOutDir, STAMP)

    expect(manifest.screens).toEqual([{ name: 'deals', path: 'deals.html' }])
    expect(readdirSync(outDir)).toEqual(['deals.html'])
  })

  it('rejects an uppercase or dotted name before it reaches the filesystem', () => {
    expect(() =>
      writePreview([{ name: 'Deals.v2', kind: 'list', title: 'x', columns: [], rows: [] }], outDir),
    ).toThrow(/screen name/i)

    const malformed = [
      'Deals',
      'deals.v2',
      '-deals',
      '_deals',
      'deals v2',
      'x'.repeat(65),
      'con',
      'nul',
      'com1',
    ]
    for (const name of malformed) {
      expect(() => writePreview([named(name)], outDir)).toThrow(/screen name/i)
    }

    // Duplikat cicho nadpisałby plik: manifest obiecywałby dwa ekrany, a na
    // dysku leżałby jeden.
    expect(() => writePreview([named('deals'), named('deals')], outDir)).toThrow(/screen name/i)

    expect(readdirSync(outDir)).toEqual([])
    expect(readdirSync(parent)).toEqual(['out'])
  })

  it('rejects a non-string name coming from the model without writing a "null.html"', () => {
    // `parseJsonLoosely` zwraca `unknown`; `validateScreens` jest bramą, ale
    // pisarz dostaje własne dane i jest ostatnim miejscem, w którym nazwa jest
    // jeszcze stringiem, a nie ścieżką.
    const rogue = [{ ...named('deals'), name: null as unknown as string }]
    expect(() => writePreview(rogue, outDir)).toThrow(/screen name/i)

    expect(readdirSync(outDir)).toEqual([])
    expect(readdirSync(parent)).toEqual(['out'])
  })

  it('writes nothing when rendering a screen in the middle of the list throws', () => {
    // `renderScreen` jest eksportowane i karmione danymi z `parseJsonLoosely`,
    // więc nieznany `kind` to realny przebieg, nie tylko łamanie typów; ten sam
    // kształt awarii daje ENOSPC/EACCES/EDQUOT na pliku N z M.
    const broken: ScreenSpec = { ...named('broken'), kind: 'carousel' as unknown as ScreenKind }

    expect(() => writePreview([named('good'), broken, named('later')], outDir, STAMP)).toThrow(
      /Unknown screen kind/,
    )

    // Przed naprawą zostawało tu `good.html` - pół podglądu na dysku, dokładnie
    // ten stan, przed którym komentarz w renderPreview.ts obiecywał bronić.
    expect(readdirSync(outDir)).toEqual([])
    expect(readdirSync(parent)).toEqual(['out'])
  })

  it('computes generatedAt before the first write so an invalid Date leaves nothing behind', () => {
    expect(() => writePreview([named('a'), named('b')], outDir, new Date('not-a-date'))).toThrow(
      RangeError,
    )

    // Przed naprawą wszystkie pliki były już zapisane, a `now.toISOString()`
    // wywalało się dopiero PO nich: wywołujący dostawał wyjątek i żadnego
    // manifestu, a na dysku leżał kompletny podgląd, o którym nie wiedział.
    expect(readdirSync(outDir)).toEqual([])
    expect(readdirSync(parent)).toEqual(['out'])
  })
})
