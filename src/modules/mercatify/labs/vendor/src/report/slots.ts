import { count, isoToLongDate, money } from './format'
import type { ReportFacts, ReportProse } from './model'

/**
 * SLOTY - sposób, w jaki zdanie agenta może nieść liczbę, nie autorując jej.
 *
 * Pierwotne założenie brzmiało "proza nie zawiera liczb". Złoty raport
 * (`src/__tests__/fixtures/voltix.golden.html`) pokazał, że to złe założenie
 * PRODUKTOWO: 9 z 11 pól jego prozy niesie liczbę i to właśnie te zdania
 * czynią dokument czytelnym ("cutting them in the first four weeks returns
 * $389 a month"). Zdanie bez liczby brzmi jak unik.
 *
 * Rozluźnienie strażnika oddałoby jednak gwarancję z SPEC.md §10, gdzie agent
 * napisał "EUR 6,000 / 24 months" przy prawdziwych EUR 21,000 / 6,9. Slot
 * rozwiązuje oba naraz: agent pisze `{kpis.netRecurringAnnual}`, a wartość
 * wstawia renderer z `facts`. Agent NIE MA jak podać złej liczby, bo nie
 * podaje żadnej - a czytelnik i tak widzi liczbę w zdaniu.
 *
 * Ścieżki są ALLOWLISTĄ kształtów, nie dowolnym dostępem do obiektu:
 * nieznany slot rzuca, zamiast wyrenderować się jako pusty string albo
 * `undefined`. Cicha dziura w zdaniu o pieniądzach jest gorsza niż głośny
 * błąd.
 */

/**
 * `{coś}` - nazwa slotu. Spacja i myślnik są DOZWOLONE, bo nazwa narzędzia
 * bywa wielowyrazowa (`{stack.HubSpot Sales.termEnds}`). Bez tego slot z
 * taką nazwą nie pasował do wzorca i renderował się DOSŁOWNIE, czyli zdanie
 * o pieniądzach wychodziło do klienta z klamrami w środku - dokładnie ta
 * cicha awaria, przed którą ten mechanizm ma chronić.
 *
 * Separatorem pozostaje kropka, więc nazwa narzędzia z kropką jest
 * nieadresowalna; `resolvePath` mówi to wprost, zamiast rozjechać ścieżkę.
 */
const SLOT_RE = /\{([a-zA-Z0-9_. -]+)\}/g

/**
 * Pola, które formatujemy jako kwotę w walucie klienta.
 *
 * Lista jest WYLICZONA, nie zgadywana po nazwie - ale musi być kompletna,
 * bo jej brak jest cichy. `{stack.Xero.monthly}` renderowało się jako `78`
 * zamiast `$78`: pole przeszło do `count()`, zdanie o pieniądzach wyszło do
 * klienta bez symbolu waluty i nic tego nie zgłosiło. Dokładając pole
 * kwotowe gdziekolwiek w `facts`, dopisz je tutaj.
 */
const MONEY_FIELDS: ReadonlySet<string> = new Set([
  // kpis
  'licencesTodayMonthly',
  'licencesTodayAnnual',
  'licencesAfterMonthly',
  'netRecurringAnnual',
  'hostingMonthly',
  'implementationCost',
  // cash
  'netAtHorizon',
  'maxExposure',
  'cumulative',
  'monthlyNet',
  // wave
  'monthlyBanked',
  // stack row + totals
  'unitPrice',
  'monthly',
  'annual',
  'totalMonthly',
  'totalAnnual',
  // money table
  'rate',
  'cost',
  'totalImplementationCost',
  'buildOnlyCost',
  // kpis - podsumowania
  'licencesCancelledMonthly',
])

/**
 * Pola liczbowe, które CELOWO nie są kwotą: liczniki, godziny, tygodnie,
 * numery miesięcy.
 *
 * Ta lista istnieje po to, żeby klasyfikacja była WYCZERPUJĄCA. Wcześniej
 * `MONEY_FIELDS` była jednostronna: pole spoza niej po cichu spadało do
 * `count()` i zdanie o pieniądzach wychodziło bez symbolu waluty. Ten sam błąd
 * trafił się dwa razy (`stack.<tool>.monthly`, potem
 * `kpis.licencesCancelledMonthly`) - bo lista jednostronna nie ma jak się
 * upomnieć o brakujący wpis. Teraz pole nieznane obu listom RZUCA, więc
 * dokładając cokolwiek liczbowego do `facts`, trzeba je świadomie
 * zaklasyfikować.
 */
const COUNT_FIELDS: ReadonlySet<string> = new Set([
  'toolCount',
  'seatCount',
  'totalSeats',
  'employees',
  'implementationHours',
  'programmeWeeks',
  'horizonMonths',
  'breakEvenMonth',
  'maxExposureMonth',
  'month',
  'statements',
  'matched',
  'offCatalog',
  'seats',
  'weekFrom',
  'weekTo',
  'hours',
  'bankedFromMonth',
  'n',
  'waveNumber',
  'totalHours',
  'largestBuildHours',
  'buildOnlyMonths',
  'programmeMonths',
  'estimatedHours',
])

/** Pola, które formatujemy jako datę długą. */
const DATE_FIELDS: ReadonlySet<string> = new Set(['issued', 'validUntil', 'termEnds'])

function formatLeaf(field: string, value: unknown, currency: string): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return DATE_FIELDS.has(field) ? isoToLongDate(value) : value
  if (typeof value === 'number') {
    if (MONEY_FIELDS.has(field)) return money(value, currency)
    if (COUNT_FIELDS.has(field)) return count(value)
    throw new Error(
      `[mercatify-labs] resolveSlots: numeric field "${field}" is classified neither as money nor as a ` +
        `count. Add it to MONEY_FIELDS or COUNT_FIELDS in src/report/slots.ts - guessing would either ` +
        `drop a currency symbol from a sentence about money or add one to a number of hours.`,
    )
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  throw new Error(
    `[mercatify-labs] resolveSlots: field "${field}" is not a renderable value, got ${JSON.stringify(value)}`,
  )
}

/**
 * Rozwiązuje jedną ścieżkę. Dozwolone kształty, wyczerpująco:
 *
 *   kpis.<pole>            np. {kpis.netRecurringAnnual}
 *   cash.<pole>            np. {cash.breakEvenMonth}
 *   counts.<pole>          np. {counts.offCatalog}
 *   meta.<pole>            np. {meta.validUntil}
 *   company.<pole>         np. {company.name}
 *   money.<pole>           np. {money.totalHours}, {money.rate}
 *   money.paybacks.<pole>  np. {money.paybacks.buildOnlyMonths}
 *   wave.<n>.cost          z tabeli wdrożenia, nie z `Wave`
 *   stack.<pole>           sumy tabeli, np. {stack.totalMonthly}
 *   wave.<n>.<pole>        np. {wave.1.monthlyBanked}, {wave.1.weekTo}
 *   stack.<nazwa>.<pole>   np. {stack.HubSpot.termEnds}
 *
 * Nazwa narzędzia w `stack.<nazwa>` jest porównywana DOKŁADNIE, bez
 * normalizacji: luźne dopasowanie zamieniłoby literówkę w cichą podmianę
 * jednego narzędzia na drugie, a stąd na złą kwotę w zdaniu.
 */
function resolvePath(path: string, facts: ReportFacts): string {
  const parts = path.split('.')
  const currency = facts.company.currency
  const head = parts[0]

  if (parts.length === 2) {
    const field = parts[1]
    if (head === 'kpis') return leafOf(facts.kpis, field, path, currency)
    if (head === 'cash') {
      if (facts.cash === undefined) {
        throw new Error(
          `[mercatify-labs] resolveSlots: "{${path}}" needs a cash series, but this run has none (no costs given).`,
        )
      }
      return leafOf(facts.cash, field, path, currency)
    }
    if (head === 'counts') return leafOf(facts.basis.counts, field, path, currency)
    if (head === 'meta') return leafOf(facts.meta, field, path, currency)
    if (head === 'company') return leafOf(facts.company, field, path, currency)
    // Sumy tabeli stacku żyją o poziom wyżej niż wiersze, więc adresuje je
    // ścieżka dwuczłonowa. Bez tego `{stack.totalMonthly}` wpadało w bramę
    // "za dużo członów" z komunikatem o kropce w nazwie narzędzia.
    if (head === 'stack') return leafOf(facts.stack, field, path, currency)
    if (head === 'money') return leafOf(facts.money, field, path, currency)
  }

  // `money.paybacks.<pole>` - jedyna trzyczłonowa ścieżka pod `money`.
  // Bez niej callout "Two payback numbers" nie miał jak podać ani jednej z
  // dwóch liczb, o których jest.
  if (parts.length === 3 && head === 'money' && parts[1] === 'paybacks') {
    return leafOf(facts.money.paybacks, parts[2], path, currency)
  }

  // `wave.<n>.cost` NIE żyje na `Wave` - koszt to godziny razy stawka, czyli
  // pieniądz, a `Wave` celowo ich nie niesie. Bierzemy go z tabeli wdrożenia
  // po numerze fali, więc jedno źródło zamiast dwóch.
  if (parts.length === 3 && head === 'wave' && parts[2] === 'cost') {
    const n = Number(parts[1])
    const line = facts.money.implementation.find((item) => item.waveNumber === n)
    if (line === undefined) {
      throw new Error(
        `[mercatify-labs] resolveSlots: "{${path}}" names wave ${parts[1]}, which has no implementation line.`,
      )
    }
    return leafOf(line, 'cost', path, currency)
  }

  if (parts.length === 3 && head === 'wave') {
    const n = Number(parts[1])
    const wave = facts.waves.find((w) => w.n === n)
    if (wave === undefined) {
      throw new Error(
        `[mercatify-labs] resolveSlots: "{${path}}" names wave ${parts[1]}, but this run has waves ${facts.waves.map((w) => w.n).join(', ') || '(none)'}.`,
      )
    }
    return leafOf(wave, parts[2], path, currency)
  }

  if (head === 'stack' && parts.length > 3) {
    // Nazwa narzędzia z kropką rozjechałaby ścieżkę na 4+ części. Głośno,
    // z nazwą narzędzia, zamiast po cichu nie znaleźć wiersza. Ten komunikat
    // padał wcześniej także na `{stack.totalMonthly}`, czyli na dwuczłonową
    // ścieżkę do sumy - i tłumaczył wtedy zupełnie nie ten problem.
    throw new Error(
      `[mercatify-labs] resolveSlots: "{${path}}" has too many parts for stack.<tool>.<field>. ` +
        `A tool name containing a dot cannot be addressed by a slot - rename it or use a kpis/wave slot.`,
    )
  }

  if (parts.length === 3 && head === 'stack') {
    const row = facts.stack.rows.find((r) => r.tool === parts[1])
    if (row === undefined) {
      throw new Error(
        `[mercatify-labs] resolveSlots: "{${path}}" names tool ${JSON.stringify(parts[1])}, which is not in the stack: ${facts.stack.rows.map((r) => r.tool).join(', ')}.`,
      )
    }
    return leafOf(row, parts[2], path, currency)
  }

  throw new Error(
    `[mercatify-labs] resolveSlots: "{${path}}" is not an allowed slot shape. ` +
      `Allowed: kpis.<f>, cash.<f>, counts.<f>, meta.<f>, company.<f>, money.<f>, ` +
      `stack.<f> (totals), wave.<n>.<f>, stack.<tool>.<f>.`,
  )
}

function leafOf(source: object, field: string, path: string, currency: string): string {
  if (!Object.hasOwn(source, field)) {
    throw new Error(
      `[mercatify-labs] resolveSlots: "{${path}}" names no such field. Available: ${Object.keys(source).join(', ')}.`,
    )
  }
  return formatLeaf(field, (source as Record<string, unknown>)[field], currency)
}

/** Podmienia każdy `{slot}` w jednym stringu. Nieznany slot rzuca. */
export function resolveSlots(text: string, facts: ReportFacts): string {
  return text.replace(SLOT_RE, (_match, path: string) => resolvePath(path, facts))
}

/** Nazwy slotów użyte w tekście - do walidacji bez renderowania. */
export function slotsIn(text: string): string[] {
  return [...text.matchAll(SLOT_RE)].map((m) => m[1])
}

/**
 * Przechodzi całą prozę i rozwiązuje sloty w każdym stringu.
 *
 * Struktura jest ODBUDOWYWANA, nie mutowana: wywołujący trzyma szablon (ten
 * sam obiekt jedzie do `assertNoFigures` i do testów), a renderer dostaje
 * osobny obiekt z wartościami. Mutacja w miejscu znaczyłaby, że drugie
 * wywołanie na tej samej prozie nie ma już czego podmienić.
 */
export function resolveProseSlots(prose: ReportProse, facts: ReportFacts): ReportProse {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return resolveSlots(value, facts)
    if (Array.isArray(value)) return value.map(walk)
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]))
    }
    return value
  }
  const resolved = walk(prose)
  if (typeof resolved !== 'object' || resolved === null || Array.isArray(resolved)) {
    throw new Error('[mercatify-labs] resolveProseSlots: prose must be an object')
  }
  return resolved
}
