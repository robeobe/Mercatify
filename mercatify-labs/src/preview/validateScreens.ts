/**
 * Jedyna brama między wynikiem agenta a resztą ścieżki podglądu. Wszystko
 * poniżej może zakładać, że dostało `ScreenSpec[]` - i tylko dlatego
 * `renderScreen`/`writePreview` mogą być tak proste.
 *
 * `OpenAiCompatibleLlmClient.runAgent` kończy na `parseJsonLoosely`
 * (`src/llmClient.ts:121`) i zwraca `unknown`. `strict: true` w
 * `response_format` jest prośbą do serwera, nie gwarancją - LM Studio
 * egzekwuje ją nierówno, a SPEC.md §10 opisuje dwa realne przebiegi, w
 * których agent oddał dane niezgodne z założeniem. Stąd zasada: albo typ,
 * albo błąd z nazwą pola, nigdy `as ScreenSpec[]` na surowym `unknown`.
 *
 * Funkcja jest czysta: nie dotyka dysku, nie woła sieci i nie mutuje
 * wejścia - buduje nowe obiekty, więc surowy wynik agenta nadaje się do
 * zalogowania po walidacji dokładnie w formie, w jakiej przyszedł.
 *
 * Poza siedmioma kształtami błędu z planu (nie-obiekt, brak `screens`,
 * pusta lista, zły `kind`, zła `name`, duplikat `name`, nie-stringowa
 * wartość komórki) ten plik odrzuca świadomie jeszcze kilka - wszystkie
 * przechodzą przez `resultSchema` agenta, bo schemat ich nie wyraża, i
 * większość daje cichą szkodę zamiast błędu:
 *
 *  1. PUSTE `columns` dla `kind` 'list' i 'dashboard'. `renderTable`
 *     (`templates.ts`) buduje wiersz z `spec.columns`, nie z komórek: przy
 *     `columns: []` renderuje pustą tabelę i po cichu KASUJE wszystkie
 *     komórki wiersza. Model wyprodukował dane, interesariusz widzi pusty
 *     ekran, nikt nie dostaje błędu. `agents/sandbox_engineer.json` nie ma
 *     `minItems` na `columns` - wymaga tego tylko proza instrukcji, więc
 *     schemat tego nie zatrzyma. Dla `kind: 'detail'` puste `columns` są
 *     POPRAWNE (szablon ich nie czyta) i przechodzą bez uwag.
 *  2. PUSTY albo SAM-BIAŁY-ZNAK `title`. Trafia do `<title>` i do
 *     `<header>`; pusty daje ekran bez tożsamości - w karcie przeglądarki
 *     i w nagłówku. Schemat pilnuje tylko `minLength: 1`, co przepuszcza
 *     `" "`.
 *  3. KOMÓRKA odwołująca się do kolumny spoza `columns`. To ta sama cicha
 *     szkoda co punkt 1, tylko trudniejsza do zauważenia: przy dryfie
 *     wielkości liter ('Name' w nagłówku, 'name' w komórce) render oddaje
 *     CAŁY wiersz jako pusty, a reszta tabeli wygląda poprawnie.
 *  4. PUSTA albo ZDUPLIKOWANA etykieta kolumny - kolumna, do której żadna
 *     komórka nie może trafić.
 *  5. SUFITY ROZMIARU. Bez nich model decyduje, ile plików powstanie na
 *     dysku hosta; `resultSchema` nie ma `maxItems`.
 *  6. TABLICE RZADKIE - `.map()` zachowuje dziury, więc deklarowany
 *     `ScreenSpec[]` zawierałby `undefined`.
 *
 * Nazwy ekranów waliduje `./screenName`, wspólny z `renderPreview`. Wcześniej
 * ta sama reguła żyła tu w drugiej kopii i kopie się rozjechały: brama
 * przepuszczała `con`, `nul`, `com1`, `aux` i nazwy dłuższe niż 64 znaki,
 * które pisarz odrzucał piętro niżej - `planScreens` raportowałby sukces na
 * wyniku, który `generatePreview` zaraz wywali.
 */
import type { ScreenKind, ScreenSpec } from './templates'
import { assertSafeScreenName } from './screenName'

const KINDS: ScreenKind[] = ['dashboard', 'list', 'detail']

/**
 * Sufity rozmiaru. Bez nich model kontroluje, ile plików powstanie na dysku
 * hosta (CWE-770): 5000 ekranów przechodziło bramę w 2 ms. `resultSchema`
 * agenta nie ma `maxItems`, więc egzekwuje to wyłącznie ten plik. Wartości są
 * hojne wobec realnego podglądu dla interesariusza (instrukcja agenta mówi o
 * 2-4 wierszach na ekran) i wciąż daleko od wyczerpania zasobów.
 */
const MAX_SCREENS = 50
const MAX_ROWS_PER_SCREEN = 200
const MAX_CELLS_PER_ROW = 50

function fail(path: string, expected: string): never {
  throw new Error(`[mercatify-labs] ${path}: expected ${expected}`)
}

/**
 * `Array.isArray` przechodzi na tablicy rzadkiej, a `.map()` zachowuje dziury -
 * deklarowany `ScreenSpec[]` zawierałby wtedy `undefined`. `parseJsonLoosely`
 * to czyste `JSON.parse`, które tablic rzadkich nie produkuje, ale ta funkcja
 * przyjmuje `unknown` i reklamuje kontrakt totalny.
 */
function assertDenseArray(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(path, 'an array')
  if (Object.keys(value).length !== value.length) fail(path, 'a dense array without holes')
  if (value.length > max) fail(path, `at most ${max} entries, got ${value.length}`)
  return value
}

function asRecord(value: unknown, path: string, expected = 'an object'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, expected)
  return value as Record<string, unknown>
}

/**
 * Etykiety kolumn rządzą tabelą, więc muszą być rozróżnialne i niepuste.
 * Pusta etykieta albo duplikat dają dokładnie ten sam skutek co puste
 * `columns`: `renderTable` renderuje kolumnę, do której żadna komórka nie
 * może trafić, i wiersz wychodzi pusty bez jednego błędu.
 */
function asColumnLabels(value: unknown, path: string): string[] {
  const entries = assertDenseArray(value, path, MAX_CELLS_PER_ROW)
  const seen = new Set<string>()
  const labels: string[] = []
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    if (typeof entry !== 'string') fail(`${path}[${i}]`, 'a string')
    if (entry.trim().length === 0) fail(`${path}[${i}]`, 'a non-blank column label')
    if (seen.has(entry)) fail(`${path}[${i}]`, `a column label not already used: ${JSON.stringify(entry)}`)
    seen.add(entry)
    labels.push(entry)
  }
  return labels
}

export function validateScreens(raw: unknown): ScreenSpec[] {
  const root = asRecord(raw, 'result', 'an object with a screens array')
  const rawScreens = assertDenseArray(root.screens, 'result.screens', MAX_SCREENS)
  if (rawScreens.length === 0) fail('result.screens', 'at least one screen')

  const seen = new Set<string>()
  return rawScreens.map((rawScreen, i) => {
    const base = `screens[${i}]`
    const screen = asRecord(rawScreen, base)

    // Każde pole czytamy RAZ do lokalnej stałej i dalej używamy wyłącznie
    // kopii. Surowy obiekt pochodzi z `unknown` i teoretycznie może mieć
    // getter oddający inną wartość przy kolejnym odczycie (TOCTOU) - wtedy
    // "zwalidowany" spec niósłby wartość, której walidator nigdy nie widział.
    const name = assertSafeScreenName(screen.name, `${base}.name`)
    if (seen.has(name)) {
      throw new Error(`[mercatify-labs] ${base}.name: duplicate screen name "${name}"`)
    }
    seen.add(name)

    const rawKind = screen.kind
    if (typeof rawKind !== 'string' || !KINDS.includes(rawKind as ScreenKind)) {
      fail(`${base}.kind`, `one of ${KINDS.join(', ')}`)
    }
    const kind = rawKind as ScreenKind

    const title = screen.title
    if (typeof title !== 'string' || title.trim().length === 0) {
      fail(`${base}.title`, 'a non-blank string')
    }

    const columns = asColumnLabels(screen.columns, `${base}.columns`)
    if (kind !== 'detail' && columns.length === 0) {
      fail(`${base}.columns`, 'at least one column for a dashboard or list screen')
    }

    const declared = new Set(columns)
    const rawRows = assertDenseArray(screen.rows, `${base}.rows`, MAX_ROWS_PER_SCREEN)
    const rows = rawRows.map((rawRow, r) => {
      const rowPath = `${base}.rows[${r}]`
      const row = asRecord(rawRow, rowPath)
      const rawCells = assertDenseArray(row.cells, `${rowPath}.cells`, MAX_CELLS_PER_ROW)
      const cells = rawCells.map((rawCell, c) => {
        const cellPath = `${rowPath}.cells[${c}]`
        const cell = asRecord(rawCell, cellPath)
        const column = cell.column
        if (typeof column !== 'string' || column.trim().length === 0) {
          fail(`${cellPath}.column`, 'a non-empty string')
        }
        /**
         * Komórka MUSI odwoływać się do zadeklarowanej kolumny. `renderTable`
         * buduje wiersz z `spec.columns` przez `byColumn.get(column) ?? ''`,
         * więc komórka o niepasującej etykiecie znika bez śladu - dryf
         * wielkości liter między nagłówkiem a kluczem komórki ('Name' vs
         * 'name') renderował CAŁY wiersz jako pusty, bez jednego błędu.
         * Ekran 'detail' nie czyta `columns`, więc tam wiązania nie ma.
         */
        if (kind !== 'detail' && !declared.has(column)) {
          fail(
            `${cellPath}.column`,
            `one of the declared columns [${columns.map((c2) => JSON.stringify(c2)).join(', ')}], got ${JSON.stringify(column)}`,
          )
        }
        const value = cell.value
        if (typeof value !== 'string') fail(`${cellPath}.value`, 'a string')
        return { column, value }
      })
      return { cells }
    })

    const spec: ScreenSpec = { name, kind, title, columns, rows }

    /**
     * `lang` jest opcjonalne i kontrolowane przez hosta, nie przez agenta
     * (`resultSchema` ma `additionalProperties: false`, więc model go nigdy
     * nie odda). Przepuszczamy je mimo to, bo walidator zwraca `ScreenSpec[]`
     * i musi być zamknięty na poprawnym `ScreenSpec` - ciche zgubienie pola
     * ustawionego przez hosta złamałoby "przechodzi bez zmian". Nie-string
     * odrzucamy, zamiast pozwolić mu dojść do `escapeHtml(spec.lang ?? 'en')`.
     */
    const lang = screen.lang
    if (lang !== undefined) {
      if (typeof lang !== 'string') fail(`${base}.lang`, 'a string')
      spec.lang = lang
    }

    return spec
  })
}
