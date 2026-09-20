/**
 * Formatowanie wartości do HTML raportu.
 *
 * Port `money()` z `assets/stack-tool/catalog.js:295` - CELOWO ten sam
 * algorytm, a nie "podobny". Przeglądarkowy prototyp i ten silnik renderują
 * dziś ten sam dokument dla tego samego klienta; dwie różne funkcje kwotowe
 * znaczyłyby, że podgląd w konsoli i plik wysłany mailem mogą pokazać inną
 * liczbę, a nikt by tego nie zauważył.
 *
 * Nic tutaj nie LICZY. Zaokrąglenie do pełnej jednostki jest prezentacją -
 * wartości wchodzą już policzone z `facts` (żelazna zasada 2, SPEC.md §2).
 */

const SYMBOLS: Readonly<Record<string, string>> = Object.freeze({
  EUR: '€',
  USD: '$',
  PLN: 'zł',
  GBP: '£',
})

/** To, co raport drukuje tam, gdzie klient nie podał liczby. */
export const NOT_GIVEN = '—'

/**
 * `zł` idzie ZA liczbą, reszta przed - tak jak w prototypie i tak, jak się
 * te waluty zapisuje. Nieznany kod waluty drukuje samą liczbę zamiast
 * wymyślać symbol.
 *
 * Minus stoi przed symbolem (`-$277`), nie między nim a cyfrą: raport używa
 * tej formy w tabeli kosztów, a `(-277).toLocaleString()` wstawiłby go w
 * środku.
 */
export function money(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_GIVEN
  const symbol = Object.hasOwn(SYMBOLS, currency) ? SYMBOLS[currency] : ''
  const rounded = Math.round(value)
  const sign = rounded < 0 ? '-' : ''
  const digits = Math.abs(rounded).toLocaleString('en-US')
  if (symbol.length === 0) return `${sign}${digits}`
  return currency === 'PLN' ? `${sign}${digits} ${symbol}` : `${sign}${symbol}${digits}`
}

/**
 * Liczba całkowita z separatorem tysięcy, albo kreska. Godziny, stanowiska,
 * sztuki.
 *
 * `|| 0` na końcu nie jest ozdobą: `Math.round(-0.4)` daje `-0`, a
 * `(-0).toLocaleString()` daje dosłowne `"-0"`. `count` obsługuje w `slots.ts`
 * każde pole liczbowe spoza `MONEY_FIELDS`, więc drobny błąd zaokrąglenia w
 * danych wejściowych wypisałby klientowi "-0 hours". `money` ma tę ochronę od
 * początku (`rounded < 0` jest fałszem dla `-0`); tutaj jej brakowało.
 */
export function count(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_GIVEN
  return (Math.round(value) || 0).toLocaleString('en-US')
}

const MONTHS: readonly string[] = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
])

/**
 * `2026-09-19` -> `19 September 2026`, czyli forma z okładki raportu.
 *
 * Parsowanie ręczne, NIE `new Date(iso)`: `new Date('2026-09-19')` czyta datę
 * jako UTC i w strefach na zachód od Greenwich `getDate()` oddaje dzień
 * wcześniej. Raport z datą wydania o dobę za wcześnie to nie kosmetyka -
 * `validUntil` jest w nim terminem handlowym.
 *
 * Wejście, które nie jest datą ISO, wraca nietknięte: pole bywa puste
 * (`termEnds` przy taryfie miesięcznej) i pusty string ma się wydrukować
 * jako pusty string, a nie jako "Invalid Date".
 */
export function isoToLongDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (match === null) return iso
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return iso
  // Sprawdzenie KALENDARZOWE, nie zakresowe. Sam zakres 1-31 przepuszczał
  // `2026-02-30`, które wychodziło jako "30 February 2026". To pole niesie
  // `validUntil` i `termEnds` - terminy handlowe - więc nieistniejąca data w
  // dokumencie u klienta to więcej niż literówka.
  // `Date.UTC`, nie `new Date(y, m, d)`: konstruktor lokalny przy przejściu
  // czasu letniego potrafi przesunąć dzień i odrzucić datę, która istnieje.
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return iso
  }
  return `${day} ${MONTHS[month - 1]} ${year}`
}
