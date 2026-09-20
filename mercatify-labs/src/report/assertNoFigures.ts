import type { ReportProse } from './model'

/**
 * Strażnik żelaznej zasady 2 (SPEC.md §2) na granicy prozy.
 *
 * SPEC.md §10 dokumentuje przebieg, w którym agent FinOps napisał
 * "net annual saving is EUR 6,000, with a payback period of 24 months",
 * podczas gdy deterministyczne liczby to EUR 21,000 i ~6,9 miesiąca. Raport
 * ocalał, bo `scenario` nigdy nie pochodziło od agenta - ale ZDANIE z błędnymi
 * liczbami i tak pojechało do klienta.
 *
 * REGUŁA, po przepisaniu: *każda cyfra w prozie musi być albo wewnątrz slotu,
 * albo bezpośrednio po słowie-etykiecie.* Nic innego nie przechodzi.
 *
 * Pierwsza wersja tego pliku szła od drugiej strony - wypisywała wzorce
 * "liczby z jednostką" (`40 h`, `24 months`, `$6,000`). Krytyk pokazał, że to
 * sito: wzorce wymagały jednostki PRZYKLEJONEJ do liczby, więc
 * "returns 389 per month", "pays back in month 15", "87 percent" i
 * "cost 2043 a month" przechodziły bez słowa. Naturalne sformułowanie buga ze
 * SPEC.md §10 - "pays back in month 24" - też przechodziło. Allowlista jest
 * jedyną formą tej reguły, której nie da się obejść przeformułowaniem zdania:
 * nie trzeba przewidzieć każdego sposobu zapisania liczby, tylko każdy
 * sposób, w jaki liczba jest DOZWOLONA.
 *
 * Konsekwencja jest celowa i kosztowna: "a sample of 200 contacts",
 * "adds roughly 25 h", "34 today" - autorskie wielkości, których `facts` nie
 * liczy - też zostaną odrzucone. Autor prozy ma wtedy dwa wyjścia: dołożyć
 * fakt i slot, albo napisać wielkość słowem. Jedno i drugie jest lepsze niż
 * liczba, której nikt nie policzył, w dokumencie, w którym każda inna liczba
 * jest policzona.
 */

/**
 * Pola strukturalne, nie zdania - pomijane PO MIEJSCU W DRZEWIE, nie po samej
 * nazwie klucza. `id` ryzyka to "8.1", `gapId` to "B.1": etykiety sekcji, nie
 * wielkości.
 *
 * Pomijanie po nazwie było realną furtką. `walk` chodzi po KAŻDYM kluczu, bo
 * model potrafi dokleić pole obok kontraktu - więc allowlista nazw pomijała
 * też pola, których w typie nie ma. Zmierzone: `findings[0].id = "actual
 * saving is $6,000/yr"` przechodziło bez słowa, mimo że `ProseFinding` nie ma
 * pola `id`. Czyli dokładnie scenariusz ze SPEC.md §10 wchodził tą samą
 * dziurą, której ten plik broni.
 *
 * Ścieżki są zakotwiczone (`^...$`), więc `id` gdziekolwiek indziej niż w
 * `risks[i]` jest normalnym zdaniem i podlega sprawdzeniu.
 */
const STRUCTURAL_PATHS: readonly RegExp[] = Object.freeze([
  /^risks\[\d+\]\.id$/,
  /^gaps\[\d+\]\.gapId$/,
  /^waveNotes\[\d+\]\.waveNumber$/,
])

function isStructuralPath(path: string): boolean {
  return STRUCTURAL_PATHS.some((re) => re.test(path))
}

/**
 * Słowa, po których liczba jest ETYKIETĄ, nie wielkością. "before wave 3 is
 * quoted" ma prawo stać w prozie; "in 15 months" nie ma.
 *
 * Lista jest krótka celowo. Każde dołożone słowo to nowa dziura, więc
 * dokładamy je wtedy, gdy realne zdanie raportu tego wymaga - nie na zapas.
 */
const LABEL_WORDS: readonly string[] = Object.freeze([
  'wave',
  'phase',
  'step',
  'section',
  'appendix',
  'rule',
  'risk',
  'figure',
  'table',
])

/** `{cokolwiek}` - slot. Wycinamy je PRZED sprawdzeniem (patrz `bareDigits`). */
const SLOT_RE = /\{[a-zA-Z0-9_. -]+\}/g

/**
 * Cyfra poprzedzona słowem-etykietą. `\b` na końcu listy, żeby "waves 3" i
 * "wave 3" przeszły, a "waving 3" nie.
 */
const LABELLED_NUMBER_RE = new RegExp(
  `\\b(?:${LABEL_WORDS.join('|')})s?\\s+#?\\d+(?:[.,]\\d+)?`,
  'gi',
)

/**
 * Cyfry, które zostały po wycięciu slotów i liczb etykietowanych.
 *
 * BEZ flagi `g`: wzorzec jest modułową stałą, a `test()` na wyrażeniu z `g`
 * jest stanowy przez `lastIndex` i przy drugim wywołaniu na tym samym
 * stringu zwraca `false`. Ten sam obiekt jedzie tu przez setki pól.
 */
const ANY_DIGIT_RE = /\d/

/**
 * Zwraca fragment tekstu z pierwszą niedozwoloną cyfrą, albo `undefined`.
 *
 * Kolejność wycinania jest kontraktem: najpierw sloty, potem liczby
 * etykietowane. Odwrotnie `{wave.1.monthlyBanked}` zostałby rozpoznany jako
 * "wave" + "1" i zniknąłby jako liczba etykietowana - a wtedy slot
 * `{stack.X.1}` też by zniknął i strażnik przepuściłby literał w slotowej
 * przebierance.
 */
function firstBareFigure(value: string): string | undefined {
  const withoutSlots = value.replace(SLOT_RE, ' ')
  const withoutLabels = withoutSlots.replace(LABELLED_NUMBER_RE, ' ')
  if (!ANY_DIGIT_RE.test(withoutLabels)) return undefined
  // Kontekst wokół pierwszej cyfry, żeby komunikat wskazywał miejsce w zdaniu,
  // a nie samą cyfrę wyrwaną ze środka akapitu.
  const index = withoutLabels.search(/\d/)
  const from = Math.max(0, index - 24)
  return withoutLabels.slice(from, index + 24).trim()
}

function walk(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
  onFinding: (path: string, text: string, excerpt: string) => void,
): void {
  if (typeof value === 'string') {
    const excerpt = firstBareFigure(value)
    if (excerpt !== undefined) onFinding(path, value, excerpt)
    return
  }
  if (typeof value !== 'object' || value === null) return
  // Cykl w obiekcie od hosta zapętliłby rekurencję w nieskończoność. Typ tego
  // nie broni - `ReportProse` jest publicznym wejściem.
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, seen, onFinding))
    return
  }
  for (const [key, nested] of Object.entries(value)) {
    const childPath = path.length === 0 ? key : `${path}.${key}`
    if (isStructuralPath(childPath)) continue
    walk(nested, childPath, seen, onFinding)
  }
}

/** Wrogie wejście w komunikacie obcinamy - błąd ma nazwać pole, nie przepisać akapit. */
function clip(text: string, max = 100): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`
}

/**
 * Rzuca, gdy w prozie została choć jedna cyfra, która nie jest ani slotem,
 * ani etykietą.
 *
 * Zbiera WSZYSTKIE naruszenia, nie tylko pierwsze: przebieg z pięcioma
 * zepsutymi zdaniami ma kosztować jedną poprawkę promptu, nie pięć
 * przebiegów lokalnego modelu po trzy minuty.
 *
 * `undefined` przechodzi bez słowa - przebieg bez LLM nie ma prozy i to jest
 * poprawny raport (SPEC.md §8).
 */
export function assertNoFigures(prose: ReportProse | undefined): void {
  if (prose === undefined) return
  const findings: string[] = []
  walk(prose, '', new WeakSet(), (path, text, excerpt) => {
    findings.push(`  prose.${path}: ...${clip(excerpt)}...  (in ${JSON.stringify(clip(text))})`)
  })
  if (findings.length === 0) return
  throw new Error(
    `[mercatify-labs] assertNoFigures: ${findings.length} prose field(s) state a bare figure. ` +
      `Every amount, duration and count the report knows is already in \`facts\` - write it as a slot ` +
      `(e.g. {kpis.netRecurringAnnual}, {wave.1.monthlyBanked}) so the renderer fills in the computed ` +
      `value. An agent restating a figure can only contradict it (SPEC.md §10). ` +
      `A number is allowed bare only after a label word: ${LABEL_WORDS.join(', ')}.\n${findings.join('\n')}`,
  )
}
