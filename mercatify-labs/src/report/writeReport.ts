import { closeSync, constants, lstatSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { ReportModel } from './model'
import { renderReport } from './renderReport'

/**
 * Jedyne I/O renderera raportu.
 *
 * Bezpieczeństwo zapisu jest przepisane z `writePreview`
 * (`src/preview/renderPreview.ts`) i z tego samego powodu: `writeFileSync`
 * PODĄŻA za dowiązaniem symbolicznym w ostatnim segmencie ścieżki i
 * nadpisuje cel, nie zgłaszając niczego (CWE-59). Tu stawka jest wyższa niż
 * przy podglądzie - wyjściem jest dokument handlowy z cennikiem klienta, a
 * ścieżkę podaje wywołujący, nie model.
 */
const O_NOFOLLOW: number = constants.O_NOFOLLOW ?? 0

function writeFileNoFollow(target: string, contents: string): void {
  const existing = lstatSync(target, { throwIfNoEntry: false })
  if (existing?.isSymbolicLink()) {
    throw new Error(
      `[mercatify-labs] refusing to write through a symlink: ${JSON.stringify(target)}`,
    )
  }
  if (existing && !existing.isFile()) {
    throw new Error(
      `[mercatify-labs] refusing to overwrite a non-regular file: ${JSON.stringify(target)}`,
    )
  }

  let fd: number | undefined
  try {
    fd = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | O_NOFOLLOW)
    writeSync(fd, contents, 0, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ELOOP') {
      throw new Error(
        `[mercatify-labs] refusing to write through a symlink: ${JSON.stringify(target)}`,
      )
    }
    if (code === 'EISDIR') {
      throw new Error(
        `[mercatify-labs] refusing to overwrite a non-regular file: ${JSON.stringify(target)}`,
      )
    }
    throw error
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

export interface WrittenReport {
  path: string
  /** Rozmiar w bajtach - do logu przebiegu i do kontroli limitu załącznika. */
  bytes: number
}

/**
 * Renderuje i zapisuje raport.
 *
 * Kolejność jest KONTRAKTEM, nie stylem, i jest ta sama co w `writePreview`:
 * cały dokument powstaje w pamięci, zanim otworzymy plik. `renderReport` rzuca
 * na nieznanym slocie i na nieznanym werdykcie, a plik otwarty z `O_TRUNC`
 * jest już PUSTY w chwili otwarcia - wyjątek po otwarciu zostawiłby na dysku
 * zerowy plik pod nazwą poprzedniego, poprawnego raportu.
 */
export function writeReport(model: ReportModel, target: string): WrittenReport {
  const html = renderReport(model)
  const absolute = resolve(target)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileNoFollow(absolute, html)
  return { path: absolute, bytes: Buffer.byteLength(html, 'utf8') }
}
