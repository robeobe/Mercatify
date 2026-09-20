/**
 * JEDYNE źródło prawdy o tym, co jest bezpieczną nazwą ekranu.
 *
 * Wcześniej ta niezmienniczość żyła w dwóch kopiach - w `validateScreens.ts`
 * (brama) i w `renderPreview.ts` (pisarz) - i natychmiast się rozjechała:
 * brama przepuszczała `con`, `nul`, `com1`, `aux` oraz nazwy dłuższe niż 64
 * znaki, a pisarz je odrzucał. Skutkiem było `planScreens` raportujące sukces
 * na wyniku, który `generatePreview` wywalał piętro niżej, bez sygnału
 * zwrotnego dla modelu.
 *
 * Brama woła to PRZED zbudowaniem `ScreenSpec`, a pisarz woła to ponownie na
 * własnych danych tuż przed dotknięciem dysku. Ta druga kontrola NIE jest
 * zbędna: `validateScreens` dostaje surowy obiekt od modelu, a pisarz jest
 * ostatnim miejscem, w którym nazwa jest jeszcze tylko stringiem, a nie
 * ścieżką.
 */

/** Allowlista, nie blacklista. Nazwa pasująca tu nie zawiera `/`, `\`, `.` ani bajtu NUL. */
export const SAFE_NAME = /^[a-z0-9][a-z0-9_-]*$/

/**
 * Limit długości pilnuje, żeby zapis nie wywalił się na ENAMETOOLONG już PO
 * zapisaniu wcześniejszych ekranów.
 */
export const MAX_NAME_LENGTH = 64

/**
 * Nazwy urządzeń DOS-u. Przechodzą przez `SAFE_NAME` (same małe litery i
 * cyfry), ale na Windows są zarezerwowane nawet z rozszerzeniem: zapis do
 * `con.html` idzie do konsoli, a nie do pliku, i manifest obiecywałby ekran,
 * którego nikt nigdy nie otworzy.
 */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 10 }, (_, index) => `com${index}`),
  ...Array.from({ length: 10 }, (_, index) => `lpt${index}`),
])

/**
 * Waliduje nazwę i ZWRACA ją jako lokalną kopię. Zwracanie wartości, zamiast
 * samego rzucania, jest celowe: wywołujący ma użyć TEGO stringa, a nie czytać
 * `raw.name` po raz kolejny. Surowy obiekt pochodzi z `parseJsonLoosely`, więc
 * teoretycznie może mieć getter oddający inną wartość przy każdym odczycie
 * (TOCTOU) - jeden odczyt zamyka tę furtkę.
 *
 * Komunikat zawsze zawiera frazę `screen name` oraz nazwę w postaci
 * `JSON.stringify`, bo odrzucona nazwa to wrogie wejście lecące prosto do
 * logów: bajt NUL, nowa linia czy sekwencja ANSI mają się wypisać jako escape,
 * a nie wykonać w terminalu.
 */
export function assertSafeScreenName(raw: unknown, path: string): string {
  if (typeof raw !== 'string') {
    throw new Error(`[mercatify-labs] ${path}: expected a screen name as string, got ${typeof raw}`)
  }
  const name = raw
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(
      `[mercatify-labs] ${path}: screen name longer than ${MAX_NAME_LENGTH} chars: ${JSON.stringify(name)}`,
    )
  }
  if (!SAFE_NAME.test(name)) {
    throw new Error(`[mercatify-labs] ${path}: unsafe screen name: ${JSON.stringify(name)}`)
  }
  if (RESERVED_NAMES.has(name)) {
    throw new Error(`[mercatify-labs] ${path}: reserved screen name: ${JSON.stringify(name)}`)
  }
  return name
}
