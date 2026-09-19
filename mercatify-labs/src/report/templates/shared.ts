import { count, isoToLongDate, money, NOT_GIVEN } from '../format'
import type { Confidence } from '../../types'
import type { ReportVerdict } from '../model'

/**
 * Wspólne prymitywy szablonów raportu.
 *
 * Wzorzec jest ten sam, co w `src/preview/templates.ts`: render jest CZYSTY,
 * a każda wartość z modelu przechodzi przez `escapeHtml`. Różnica jest tylko
 * w źródle danych - podgląd dostaje dane od agenta, raport od klienta I od
 * agenta, więc powodów do ucieczki jest tu więcej, nie mniej.
 */

const ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})

/**
 * Jedyna droga wartości modelu do dokumentu.
 *
 * Kopia z `src/preview/templates.ts` jest świadoma i NIE jest tą samą klasą
 * pomyłki, co dwie kopie reguł nazw ekranów opisane w `renderPreview.ts`:
 * tamte kopie się ROZJECHAŁY, bo definiowały politykę. Tu kopiowana jest
 * pięcioelementowa tabela encji HTML, która nie ma jak się zmienić. Import
 * przez pakiet podglądu wiązałby dwa niezależne wyjścia (podgląd jest
 * artefaktem sandboxu, raport - dokumentem handlowym) tylko po to.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char])
}

/** U+2212 MINUS SIGN. Golden używa go w każdej kwocie ujemnej, nie dywizu. */
export const MINUS = '−'

/**
 * Kwota ze ZNAKIEM, jak w tabeli kamieni milowych: `+$1,863` / `−$3,780`.
 *
 * Znak stawiamy sami, a `money()` dostaje wartość bezwzględną, bo `money()`
 * poprzedza liczbę zwykłym dywizem (`-$277`). W dokumencie, w którym kolumna
 * liczb jest wyrównana do prawej i złożona krojem tabularnym, dywiz jest o
 * połowę za krótki i o pół kreski za nisko - golden konsekwentnie używa
 * U+2212 i to jest różnica typograficzna, nie kosmetyczna.
 */
export function signedMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_GIVEN
  const digits = money(Math.abs(value), currency)
  return value < 0 ? `${MINUS}${digits}` : `+${digits}`
}

/**
 * Kwota linii ODEJMOWANEJ. Wejście jest dodatnie (`MoneyLine.monthly` niesie
 * wielkość, a `isDeduction` niesie kierunek), więc minus dokłada renderer.
 *
 * Zero jest wyjątkiem i drukuje się BEZ znaku. `−$0` nie jest kwotą, tylko
 * literówką typograficzną: odjęcie zera niczego nie odejmuje, a minus przed
 * zerem czyta się jak obcięta liczba ujemna. `money()` broni się tak samo
 * przed `-0` z zaokrąglenia (`rounded < 0` jest fałszem dla `-0`); tutaj tej
 * obrony brakowało, bo znak dokładał sam renderer.
 */
export function deductedMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_GIVEN
  const digits = money(Math.abs(value), currency)
  return Math.round(value) === 0 ? digits : `${MINUS}${digits}`
}

/** `MoneyLine` -> napis do komórki, z minusem tylko dla linii odejmowanych. */
export function lineMoney(
  value: number | null | undefined,
  isDeduction: boolean,
  currency: string,
): string {
  return isDeduction ? deductedMoney(value, currency) : money(value, currency)
}

const MONTH_ABBREV_LENGTH = 3

/**
 * `2026-09-19` -> `19 Sep 2026`, czyli forma z paska narzędzi i ze stopki.
 *
 * Woła `isoToLongDate` i skraca miesiąc, zamiast parsować datę po raz drugi.
 * Powód jest dokładnie ten, który `renderPreview.ts` opisuje przy nazwach
 * ekranów: druga kopia reguły to druga szansa na rozjazd, a ta reguła nie
 * jest trywialna - `isoToLongDate` odrzuca `2026-02-30` sprawdzeniem
 * kalendarzowym i celowo nie używa `new Date(iso)`. Data nieparsowalna wraca
 * nietknięta stamtąd i nietknięta stąd.
 */
export function isoToShortDate(iso: string): string {
  const long = isoToLongDate(iso)
  if (long === iso) return iso
  const parts = long.split(' ')
  if (parts.length !== 3) return long
  return `${parts[0]} ${parts[1].slice(0, MONTH_ABBREV_LENGTH)} ${parts[2]}`
}

/**
 * Godziny w komórce tabeli, z regułą `hoursAreFloor` z `assets/README.md`:
 * wiersz `build` bez estymaty drukuje się jako `to estimate`, a nie jako `0`,
 * a estymata niepełna jako dolna granica.
 *
 * Kolejność gałęzi jest kontraktem. Zero BEZ flagi to uczciwe zero (fala,
 * która nie zużywa godzin); zero Z flagą to brak estymaty i tylko ten drugi
 * przypadek wolno opisać słowem. Odwrotna kolejność drukowałaby "0+" dla
 * wiersza, którego nikt nie wycenił - czyli podawała kwotę tam, gdzie jej nie
 * ma.
 */
export function hoursCell(hours: number | null | undefined, isFloor: boolean): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) {
    return isFloor ? TO_ESTIMATE : NOT_GIVEN
  }
  if (isFloor && hours <= 0) return TO_ESTIMATE
  return isFloor ? `${count(hours)}+` : count(hours)
}

/** To, co raport drukuje zamiast liczby godzin, której nikt nie policzył. */
export const TO_ESTIMATE = 'to estimate'

/**
 * Godziny Z JEDNOSTKĄ. Jednostkę dokleja TA funkcja, a nie miejsce wywołania.
 *
 * `hoursCell` oddaje albo liczbę, albo słowo, i tylko przy liczbie "h" coś
 * znaczy. Doklejanie go w szablonie dawało `to estimate h` i `— h` - komórki,
 * w których jednostka stoi przy słowie "estimate". Wyszło to w trzech
 * miejscach naraz (kafelek KPI, pasek fali, zakres fali), bo reguła mieszkała
 * w każdym z nich osobno.
 */
export function hoursWithUnit(hours: number | null | undefined, isFloor: boolean): string {
  const cell = hoursCell(hours, isFloor)
  return cell === TO_ESTIMATE || cell === NOT_GIVEN ? cell : `${cell} h`
}

/**
 * Kwota, która jest dolną granicą, a nie wyceną.
 *
 * Trzy kształty, i granica między nimi jest dokładnie ta sama co w
 * `hoursCell` - inaczej godziny i kwota w jednym wierszu mówiłyby co innego:
 *
 *   nie jest granicą              -> zwykła kwota albo kreska
 *   granica, znana część > 0      -> `$14,400+`, czyli "co najmniej tyle"
 *   granica, znana część 0 lub brak -> `to estimate`
 *
 * Trzeci kształt jest tym, przed czym cała ta funkcja powstała. `$0+` czyta
 * się jako "od zera w górę", czyli jako kwota, a znaczy "nie policzono jej
 * wcale": fala bez ani jednej estymaty ma koszt 0 razy stawka i drukowała się
 * w tabeli wdrożenia jako `$0+`, a w kafelku KPI jako `$0`.
 */
export function floorMoney(
  value: number | null | undefined,
  isFloor: boolean,
  currency: string,
): string {
  const rendered = money(value, currency)
  if (!isFloor) return rendered
  if (value === null || value === undefined || !Number.isFinite(value)) return TO_ESTIMATE
  return Math.round(value) === 0 ? TO_ESTIMATE : `${rendered}+`
}

/**
 * Liczba z rzeczownikiem w poprawnej liczbie - `1 tool`, `7 tools`.
 *
 * Liczba mnoga jest tu treścią, nie stylistyką: `1 tools` i `1 weeks` czytają
 * się jak wynik złożenia napisów, więc podważają liczbę, która stoi obok.
 * Sekcja 04 miała już tę regułę u siebie dwa razy (`statementsWord`,
 * `usageStatements`); tu jest raz, dla wszystkich.
 */
export function countedNoun(
  value: number | null | undefined,
  singular: string,
  plural?: string,
): string {
  const word = value === 1 ? singular : (plural ?? `${singular}s`)
  return `${count(value)} ${word}`
}

/**
 * Klasa chipa werdyktu. Wyczerpujący `switch` z `never` - tak samo jak
 * `renderContent` w `src/preview/templates.ts` i z tego samego powodu:
 * `ReportVerdict` jest sumą `Decision` i `'drop'`, więc szósta wartość
 * dołożona w `src/types.ts` ma tu ZŁAMAĆ kompilację, a nie po cichu wyjść
 * jako chip bez tła.
 */
export function verdictChipClass(verdict: ReportVerdict | 'off-catalog'): string {
  switch (verdict) {
    case 'native':
      return 'chip--native'
    case 'configure':
      return 'chip--configure'
    case 'build':
      return 'chip--build'
    case 'integrate':
      return 'chip--integrate'
    case 'keep':
      return 'chip--keep'
    case 'drop':
      return 'chip--drop'
    case 'off-catalog':
      return 'chip--unknown'
    default: {
      const unknownVerdict: never = verdict
      throw new Error(`[mercatify-labs] renderReport: unknown verdict: ${String(unknownVerdict)}`)
    }
  }
}

export function verdictChip(verdict: ReportVerdict | 'off-catalog'): string {
  return `<span class="chip ${verdictChipClass(verdict)}">${escapeHtml(verdict)}</span>`
}

/**
 * Pasmo pewności. Trzy `<i>` ZAWSZE, a zapala je CSS (`.conf--high i:nth-child(-n+3)`)
 * - wysokość paska niesie wtedy informację także wtedy, gdy dokument idzie do
 * druku bez kolorów. Liczba pasków sterowana z TS-a dałaby ten sam obrazek i
 * zabrała czytnikowi ekranu stały kształt.
 */
export function confidenceBand(confidence: Confidence): string {
  return (
    `<span class="conf conf--${escapeHtml(confidence)}">` +
    '<span class="conf__bars"><i></i><i></i><i></i></span>' +
    `${escapeHtml(confidence)}</span>`
  )
}

/**
 * Nazwa waluty SŁOWEM, do `<desc>` wykresu.
 *
 * Czytnik ekranu czyta `$14,967` niekonsekwentnie (bywa "dollar fourteen
 * thousand"), a `<desc>` istnieje wyłącznie dla niego - golden pisze tam
 * "minus 14,967 dollars" i to jest właściwa forma. Nieznany kod waluty wraca
 * jako sam kod ("14,967 PLN" czyta się poprawnie, "14,967 unknown" nie).
 */
const CURRENCY_WORDS: Readonly<Record<string, string>> = Object.freeze({
  EUR: 'euro',
  USD: 'dollars',
  PLN: 'zloty',
  GBP: 'pounds',
})

export function amountInWords(value: number, currency: string): string {
  const digits = count(Math.abs(value))
  const unit = Object.hasOwn(CURRENCY_WORDS, currency) ? CURRENCY_WORDS[currency] : currency
  return `${digits} ${unit}`
}

/**
 * Liczba miesięcy, które NIE muszą być całkowite ("2.4 months").
 *
 * `count()` zaokrągliłaby 2,4 do 2 i raport podałby zwrot o dwa tygodnie za
 * krótki. Jedno miejsce po przecinku, bo druga cyfra udaje precyzję, której
 * w estymacie godzin nie ma; wartość całkowita drukuje się bez ogona ".0".
 */
export function monthsValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_GIVEN
  if (Number.isInteger(value)) return count(value)
  return (Math.round(value * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 })
}

const NUMERAL_WORDS: readonly string[] = Object.freeze([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
])

/**
 * Mała liczba SŁOWEM, w zdaniu ("The six numbers this report is about").
 *
 * To nie jest ozdoba: w ZDANIU cyfra wygląda jak wielkość do sprawdzenia, a
 * tu jest tylko zapowiedzią, ile kafelków stoi niżej. Golden trzyma tę
 * konwencję konsekwentnie ("the seven tools", "those four are itemised"), a
 * wszystkie wielkości, które da się przeliczyć, zapisuje cyframi. Powyżej
 * dwunastu słowo przestaje być krótsze od liczby, więc wracamy do cyfr.
 */
export function numeralWord(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= NUMERAL_WORDS.length) return count(value)
  return NUMERAL_WORDS[value]
}

/** Liczba do atrybutu SVG: dwa miejsca, bez ogona zer (`318`, nie `318.00`). */
export function svgNum(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/** Skleja fragmenty, wyrzucając te puste - sekcja bez prozy ma nie zostawić dziury. */
export function joinParts(parts: readonly string[]): string {
  return parts.filter((part) => part.length > 0).join('\n')
}

/**
 * Nagłówek sekcji: numer, tytuł i opcjonalny akapit wstępny.
 *
 * Numer sekcji jest ETYKIETĄ dokumentu, nie danymi przebiegu - stąd stoi w
 * wywołaniu szablonu, a nie w modelu. Agent, który dostałby to pole, mógłby
 * ponumerować sekcje niezgodnie z kolejnością, w jakiej renderer je składa,
 * i raport odsyłałby sam do siebie błędnie ("see section 08" przy sekcji 07).
 */
export function sectionHead(label: string, title: string, intro?: string): string {
  return joinParts([
    '<div class="sec__head">',
    `<span class="sec__no">${escapeHtml(label)}</span>`,
    `<h2>${escapeHtml(title)}</h2>`,
    optionalParagraph(intro),
    '</div>',
  ])
}

/**
 * Akapit renderowany TYLKO wtedy, gdy jest co renderować.
 *
 * To jest cała reguła degradacji z SPEC.md §8 zapisana w jednym miejscu:
 * przebieg bez LLM ma pomijać zdania, a nie drukować puste `<p>`. Pusty
 * element wygląda w dokumencie jak usterka składu, a nie jak brak danych.
 */
export function optionalParagraph(text: string | undefined, className?: string): string {
  if (text === undefined || text.trim().length === 0) return ''
  const attr = className === undefined ? '' : ` class="${escapeHtml(className)}"`
  return `<p${attr}>${escapeHtml(text)}</p>`
}
