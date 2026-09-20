import { closeSync, constants, lstatSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { renderScreen, type ScreenSpec } from './templates'
import { assertSafeScreenName } from './screenName'

/**
 * Manifest, który Sandbox Engineer oddaje dalej (SPEC.md §11.1): sam HTML
 * jest efektem ubocznym zapisanym przez hosta, a nie polem w wyniku agenta.
 */
export interface PreviewManifest {
  screens: Array<{ name: string; path: string }>
  generatedAt: string
}

/**
 * Reguły bezpiecznej nazwy mieszkają w `./screenName` i są współdzielone z
 * `validateScreens`. Wcześniej istniały tu w drugiej kopii i kopie się
 * rozjechały: brama przepuszczała `con`, `nul` i nazwy dłuższe niż 64 znaki,
 * które ten plik odrzucał piętro niżej.
 *
 * Ta kontrola NIE jest tu zbędna mimo istnienia bramy. Allowlista nazw
 * wyklucza `/`, `\`, `.` i bajt NUL, ale to NIE WYSTARCZA, żeby zapis został
 * w `outDir`: nazwa jest tylko ostatnim segmentem ścieżki, a sam wpis w
 * katalogu może już być DOWIĄZANIEM SYMBOLICZNYM wskazującym gdziekolwiek.
 * Zwykłe `writeFileSync` podąża za takim dowiązaniem i nadpisuje cel, nie
 * zgłaszając niczego - potwierdzone odtworzeniem (CWE-59).
 */
const O_NOFOLLOW: number = constants.O_NOFOLLOW ?? 0

/**
 * Otwiera plik docelowy tak, żeby dowiązanie symboliczne w ostatnim segmencie
 * ścieżki było BŁĘDEM, a nie przekierowaniem.
 *
 * Dwie warstwy, celowo:
 * 1. `O_NOFOLLOW` w `openSync` - jądro odmawia atomowo, więc nie ma okna
 *    TOCTOU między sprawdzeniem a otwarciem. Na Windows ta flaga nie istnieje
 *    (`constants.O_NOFOLLOW` jest `undefined`), stąd `?? 0`.
 * 2. `lstatSync` przed otwarciem - daje czytelny komunikat zamiast surowego
 *    `ELOOP`, a na platformach bez `O_NOFOLLOW` jest jedyną obroną.
 *
 * Dowiązanie na samym `outDir` jest w porządku i celowo przepuszczone:
 * `O_NOFOLLOW` dotyczy wyłącznie ostatniego segmentu, a katalog wyjściowy
 * podaje host, nie model.
 */
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

/**
 * Jedyne I/O całej ścieżki A.
 *
 * Kolejność jest kontraktem, nie stylem: WSZYSTKO, co może rzucić, dzieje się
 * przed pierwszym zapisem. Nazwy, duplikaty, znacznik czasu i cały HTML są
 * zmaterializowane w pamięci, a dopiero potem lecą na dysk. Inaczej zła nazwa
 * albo nieznany `kind` w środku listy zostawiały na dysku pół podglądu, a
 * `now.toISOString()` liczone po zapisach potrafiło oddać wywołującemu wyjątek
 * i żaden manifest, podczas gdy komplet plików już leżał na dysku. Ten sam
 * kształt awarii daje ENOSPC/EACCES/EDQUOT na pliku N z M - tego nie da się
 * wyeliminować zupełnie, ale pre-flight zdejmuje wszystkie przyczyny, na które
 * mamy wpływ.
 */
export function writePreview(
  specs: ScreenSpec[],
  outDir: string,
  now: Date = new Date(),
): PreviewManifest {
  // 1. Znacznik czasu - `toISOString()` na niepoprawnej dacie rzuca RangeError.
  const generatedAt = now.toISOString()

  // 2. Nazwy i duplikaty. Komunikat o duplikacie też zawiera frazę
  //    `screen name`, żeby wywołujący łapał całą klasę jednym wzorcem.
  const seen = new Set<string>()
  const planned = specs.map((spec, index) => {
    const name = assertSafeScreenName(spec.name, `screens[${index}].name`)
    if (seen.has(name)) {
      throw new Error(
        `[mercatify-labs] screens[${index}].name: duplicate screen name: ${JSON.stringify(name)}`,
      )
    }
    seen.add(name)
    return { spec, name, path: `${name}.html` }
  })

  // 3. Render do pamięci - `renderScreen` rzuca na nieznanym `kind`.
  const rendered = planned.map((entry) => ({ ...entry, html: renderScreen(entry.spec) }))

  // 4. Dopiero teraz dysk.
  mkdirSync(outDir, { recursive: true })
  for (const entry of rendered) {
    writeFileNoFollow(join(outDir, entry.path), entry.html)
  }

  return {
    screens: rendered.map(({ name, path }) => ({ name, path })),
    generatedAt,
  }
}
