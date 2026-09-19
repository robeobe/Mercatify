import { getStageContract, isStageName, type StageContract } from './stageContracts'

export type Severity = 'blocker' | 'major' | 'minor'

export interface Objection {
  severity: Severity
  /** Identyfikator reguły z kontraktu etapu. Nigdy wymyślony. */
  rule: string
  location: string
  claim: string
  evidence: string
}

export interface Critique {
  verdict: 'accept' | 'revise' | 'reject'
  objections: Objection[]
  notes: string
}

const SEVERITIES: Severity[] = ['blocker', 'major', 'minor']
const VERDICTS: Critique['verdict'][] = ['accept', 'revise', 'reject']

function fail(path: string, expected: string): never {
  throw new Error(`[mercatify-labs] ${path}: expected ${expected}`)
}

/**
 * `.trim()`, nie `.length`. `resultSchema` agenta pilnuje tylko `minLength: 1`,
 * więc `" "`, `"\n\t"` i `"\u00a0"` przechodzą przez niego jako poprawne - a
 * obiekcja z `evidence: "   "` to dosłownie obiekcja bez cytatu, która dociera
 * do wywołującego jako pełnoprawny `blocker`. Siostrzana brama tej samej fali
 * (`src/preview/validateScreens.ts`, `title`) utwardza to tak samo.
 */
function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Kontrakt przychodzi PARAMETREM, a `StageContract` to zwykły kształt: obiekt
 * `{ stage: 'mappings', rules: [{ id: 'ANYTHING-GOES', text: '...' }] }`
 * spełnia go strukturalnie i przepchnąłby dowolną wymyśloną regułę przez
 * sprawdzenie niżej - typ nie jest tu obroną. Dziś `critique()` bierze kontrakt
 * wyłącznie z `getStageContract`, ale `validateCritique` jest eksportowane z
 * `src/critic.ts` i przy `critiqueRun` ktoś zbuduje kontrakt inline; wtedy
 * ryzyko R12 otwiera się od strony wywołującego. Dlatego zbiór reguł musi
 * zgadzać się z zamrożonym rejestrem co do identyfikatora.
 *
 * Porównujemy ZBIÓR ID, nie referencję: `getStageContract` oddaje nowy
 * `{ stage, rules }` przy każdym wywołaniu, więc `===` odrzucałoby też
 * uczciwego wywołującego, który przekazał wierną kopię. Zwracamy identyfikatory
 * Z REJESTRU - dalsze sprawdzenie reguł nie ufa nawet tej liście, którą dostało.
 */
function registeredRuleIds(contract: StageContract): Set<string> {
  if (typeof contract !== 'object' || contract === null) fail('contract', 'a stage contract')
  if (!isStageName(contract.stage)) {
    throw new Error(
      `[mercatify-labs] contract.stage: unknown critic stage "${String(contract.stage)}"`,
    )
  }
  if (!Array.isArray(contract.rules)) fail('contract.rules', 'an array of rules')

  const given = new Set<string>()
  for (let i = 0; i < contract.rules.length; i += 1) {
    const rule = contract.rules[i] as unknown
    if (typeof rule !== 'object' || rule === null) fail(`contract.rules[${i}]`, 'an object')
    const id = (rule as Record<string, unknown>).id
    if (typeof id !== 'string') fail(`contract.rules[${i}].id`, 'a string')
    given.add(id)
  }

  const registered = new Set(getStageContract(contract.stage).rules.map((r) => r.id))
  const extra = [...given].filter((id) => !registered.has(id))
  const missing = [...registered].filter((id) => !given.has(id))
  if (extra.length > 0 || missing.length > 0) {
    const detail = [
      extra.length > 0 ? `not in the registry: ${extra.join(', ')}` : '',
      missing.length > 0 ? `missing: ${missing.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('; ')
    throw new Error(
      `[mercatify-labs] contract: rules do not match the frozen ${contract.stage} contract (${detail})`,
    )
  }
  return registered
}

/**
 * Brama między wynikiem krytyka a kodem. Poza kształtem sprawdza trzy
 * rzeczy, których żaden schemat JSON nie wyrazi:
 *
 * 1. Obiekcja musi cytować regułę Z KONTRAKTU. Wymyślona reguła to ta sama
 *    klasa błędu co wymyślona nazwa zdolności w SPEC.md §10 - i tak samo
 *    nie wolno jej przepuścić.
 * 2. Sam KONTRAKT musi pochodzić z zamrożonego rejestru (`registeredRuleIds`),
 *    bo inaczej punkt 1 sprawdza regułę względem listy, którą przyniósł
 *    wywołujący - a wtedy nie sprawdza niczego.
 * 3. Werdykt musi być spójny z obiekcjami. `accept` z listą zastrzeżeń albo
 *    `reject` bez żadnego to sprzeczność, nie osąd.
 *
 * Funkcja jest czysta: czyta wejście, niczego w nim nie zmienia i buduje nowy
 * wynik - żadne pole zwróconej obiekcji nie aliasuje obiektu od modelu, więc
 * surowa odpowiedź nadaje się do zalogowania dokładnie w formie, w jakiej
 * przyszła. Pilnuje tego `describe('validateCritique purity')`.
 *
 * Czego ta funkcja CELOWO nie robi: nie filtruje kwot w tekście. `evidence`
 * ma z definicji cytować wartość z artefaktu, więc zakaz cyfr wycinałby
 * dokładnie te obiekcje, po które krytyk istnieje - "92%" przy MAP-2,
 * przepisaną kwotę przy SCE-2/SCE-3, godziny przy MIG-2 - a identyfikatory
 * reguł (`MAP-1`) i ścieżki (`mappings[0]`) legalnie zawierają cyfry.
 * Filtr na wolnym tekście byłby fałszywie dodatni i GORSZY niż jego brak.
 * Obroną przed kwotą jest budowa wyniku, nie jego treść: ta funkcja
 * przepisuje wynik pole po polu i oddaje WYŁĄCZNIE verdict/objections/notes,
 * więc cokolwiek model dołoży obok - poprawiony artefakt, liczba, nowa
 * decyzja - nie ma czym wypłynąć. Werdykt jest doradczy (żelazna zasada 4),
 * nie zmienia artefaktu ani żadnej liczby, a pieniądze liczy wyłącznie
 * rdzeń deterministyczny (SPEC.md §2 zasada 2, ryzyko R11).
 */
export function validateCritique(raw: unknown, contract: StageContract): Critique {
  // Kontrakt sprawdzamy PIERWSZY: to wejście od wywołującego, nie od modelu,
  // a bez niego sprawdzenie reguły niżej nie znaczy nic.
  const knownRules = registeredRuleIds(contract)

  if (typeof raw !== 'object' || raw === null) fail('result', 'an object')
  const root = raw as Record<string, unknown>

  if (!VERDICTS.includes(root.verdict as Critique['verdict'])) {
    fail('result.verdict', `one of ${VERDICTS.join(', ')}`)
  }
  if (!isNonBlankString(root.notes)) fail('result.notes', 'a non-blank string')
  if (!Array.isArray(root.objections)) fail('result.objections', 'an array')
  const rawObjections: unknown[] = root.objections

  // Zwykły `for` po indeksach, nie `.map()`: `Array.isArray` przechodzi na
  // tablicy RZADKIEJ, a `.map()` zachowuje jej dziury - zwracany `Objection[]`
  // miałby wtedy `undefined` w środku i wywracał wołającego dopiero na
  // `o.severity`. `parseJsonLoosely` takiej tablicy nie wyprodukuje (czyste
  // `JSON.parse`), ale ta funkcja przyjmuje `unknown` i jest bramą, więc nie
  // zakłada jednego znanego wejścia. Tu dziura to po prostu `undefined`, czyli
  // "nie obiekt", i leci w to samo `fail` co każdy inny śmieć.
  const objections: Objection[] = []
  for (let i = 0; i < rawObjections.length; i += 1) {
    const base = `objections[${i}]`
    const rawObjection = rawObjections[i]
    if (typeof rawObjection !== 'object' || rawObjection === null) fail(base, 'an object')
    const entry = rawObjection as Record<string, unknown>

    if (!SEVERITIES.includes(entry.severity as Severity)) {
      fail(`${base}.severity`, `one of ${SEVERITIES.join(', ')}`)
    }
    for (const key of ['rule', 'location', 'claim', 'evidence'] as const) {
      if (!isNonBlankString(entry[key])) fail(`${base}.${key}`, 'a non-blank string')
    }
    if (!knownRules.has(entry.rule as string)) {
      throw new Error(
        `[mercatify-labs] ${base}.rule: "${entry.rule}" is not a rule of the ${contract.stage} contract`,
      )
    }

    objections.push({
      severity: entry.severity as Severity,
      rule: entry.rule as string,
      location: entry.location as string,
      claim: entry.claim as string,
      evidence: entry.evidence as string,
    })
  }

  const verdict = root.verdict as Critique['verdict']
  const hasBlocker = objections.some((o) => o.severity === 'blocker')

  if (verdict === 'accept' && objections.length > 0) {
    throw new Error('[mercatify-labs] result.verdict: accept cannot carry objections')
  }
  if (verdict === 'revise' && hasBlocker) {
    throw new Error('[mercatify-labs] result.verdict: revise cannot carry a blocker objection')
  }
  if (verdict === 'reject' && objections.length === 0) {
    throw new Error('[mercatify-labs] result.verdict: reject needs at least one objection')
  }

  return { verdict, objections, notes: root.notes }
}

export function blockers(c: Critique): Objection[] {
  return c.objections.filter((o) => o.severity === 'blocker')
}
