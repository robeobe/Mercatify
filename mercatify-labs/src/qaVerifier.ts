import { getAgent, getAgentTools } from './agentLoader'
import type { LlmClient, ToolExecutor } from './llmClient'
import type { PreviewManifest } from './preview/renderPreview'

/**
 * Golden path z oryginalnej specyfikacji Mercatify (SPEC.md §11.1).
 *
 * `readonly` i `Object.freeze`, bo ta sama stała jest przekazywana przez
 * `examples/run-preview.ts` i `bin/preview-cli.ts` do każdego przebiegu w
 * procesie. Mutowalna tablica modułowa oznaczałaby, że jedno wywołanie
 * potrafi trwale dopisać krok, którego nie ma w specyfikacji, a każde
 * kolejne wywołanie w tym samym procesie odziedziczy to skażenie.
 */
export const DEFAULT_GOLDEN_PATH: readonly string[] = Object.freeze([
  'Lead',
  'Customer',
  'Deal',
  'Vertical step',
  'Quote',
  'Approval',
])

export interface QaInput {
  manifest: PreviewManifest
  goldenPath: readonly string[]
}

export interface QaResult {
  verdict: 'ready' | 'blocked'
  /** Pusty string, gdy `verdict === 'ready'` - pole jest zawsze obecne (strict mode). */
  blockedAtStep: string
  notes: string
}

/**
 * `.trim()`, nie `.length`. `resultSchema` pilnuje `minLength: 1` tylko na
 * `notes`, a na `blockedAtStep` nie pilnuje niczego - `'   '`, `'\n\t'` i
 * `' '` przechodzą przez strict mode jako poprawne stringi. Werdykt
 * `blocked` ze spacją w `blockedAtStep` to ten sam brak informacji co pusty
 * string, więc odrzucamy oba tak samo. Siostrzane bramy tej fali
 * (`src/critic/validateCritique.ts`, `src/preview/validateScreens.ts`) trzymają
 * ten sam próg.
 */
function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Golden path jest sprawdzany PRZED wywołaniem modelu. Bez tego pusta albo
 * wadliwa lista kosztowałaby kilka minut mielenia lokalnego modelu, po których
 * sprawdzenie kroku z werdyktu `blocked` i tak nie miałoby się o co oprzeć
 * (`[].includes(x)` jest zawsze fałszem, a `'Lead,Customer'.includes` porównuje
 * podciągi, nie kroki).
 *
 * `QaInput.goldenPath` jest typowany, ale `verifyGoldenPath` to publiczne API,
 * do którego host wchodzi własną tablicą z JSON-a - typ nie jest tu obroną.
 *
 * Pętla po indeksie, nie `forEach`: `Array.isArray` przechodzi na tablicy z
 * dziurą, a `forEach` dziurę POMIJA, więc `undefined` w środku listy dojechałby
 * do porównania kroków.
 */
function assertGoldenPath(goldenPath: unknown): string[] {
  if (!Array.isArray(goldenPath) || goldenPath.length === 0) {
    throw new Error(
      '[mercatify-labs] verifyGoldenPath: input.goldenPath must be a non-empty array of step names',
    )
  }
  for (let i = 0; i < goldenPath.length; i += 1) {
    if (!isNonBlankString(goldenPath[i])) {
      throw new Error(
        `[mercatify-labs] verifyGoldenPath: input.goldenPath[${i}] must be a non-empty step name, got ${JSON.stringify(goldenPath[i])}`,
      )
    }
  }
  // KOPIA, nie referencja. Ta sama tablica trafiała wcześniej do `runAgent` i
  // była potem używana jako lista autorytatywna: klient dopisujący jedną
  // pozycję przepychał werdykt z wymyślonym krokiem i trwale psuł
  // `DEFAULT_GOLDEN_PATH` dla całego procesu. Sprawdzone -> skopiowane ->
  // dopiero wtedy wydane stronie walidowanej.
  return [...(goldenPath as string[])]
}

/**
 * Manifest jest walidowany PRZED wywołaniem modelu, z tego samego powodu co
 * golden path: `verifyGoldenPath` to publiczne API, a `QaInput.manifest` jest
 * tylko typowany. `JSON.stringify` po cichu wycina klucz o wartości
 * `undefined`, więc bez tej bramy model dostawał prompt BEZ manifestu i mimo
 * to wydawał werdykt - "ostatni agent przebiegu" (SPEC.md §11.1) orzekał
 * gotowość, nie widząc ani jednego ekranu.
 */
function assertManifest(manifest: unknown): PreviewManifest {
  const fail = (detail: string): never => {
    throw new Error(`[mercatify-labs] verifyGoldenPath: input.manifest ${detail}`)
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    fail(`must be an object, got ${JSON.stringify(manifest)}`)
  }
  const record = manifest as Record<string, unknown>
  const screens = record.screens
  if (!Array.isArray(screens)) fail('must carry a screens array')
  const list = screens as unknown[]
  if (Object.keys(list).length !== list.length) fail('.screens must be a dense array without holes')
  // PUSTA lista jest legalna i celowo przepuszczona: manifest bez ekranów to
  // dokładnie ten przypadek, na który QA ma odpowiedzieć werdyktem `blocked`.
  // Bramą jest brak manifestu, nie brak ekranów.
  const entries = list.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      fail(`.screens[${i}] must be an object, got ${JSON.stringify(entry)}`)
    }
    const screen = entry as Record<string, unknown>
    const name = screen.name
    const path = screen.path
    if (!isNonBlankString(name)) fail(`.screens[${i}].name must be a non-empty string`)
    if (!isNonBlankString(path)) fail(`.screens[${i}].path must be a non-empty string`)
    return { name: name as string, path: path as string }
  })
  const generatedAt = record.generatedAt
  if (!isNonBlankString(generatedAt)) fail('.generatedAt must be a non-empty string')
  // Przebudowa, nie przepuszczenie: cokolwiek wywołujący dokleił WEWNĄTRZ
  // manifestu, nie jedzie do promptu razem z kontraktem.
  return { screens: entries, generatedAt: generatedAt as string }
}

/**
 * Normalizacja WYŁĄCZNIE do decyzji "czy ten string nazywa krok golden path".
 * Nigdy nie buduje wartości zwracanej.
 *
 * W gałęzi `blocked` porównanie musi być bajt-dokładne, bo wynik dopasowania
 * STAJE SIĘ wartością oddaną wywołującemu - luźne dopasowanie zamieniłoby
 * głośny błąd w cichą zgadywankę. W gałęzi `ready` wynikiem dopasowania jest
 * RZUT, a nie fakt: nic tu nie może sfabrykować nazwy kroku, więc precyzja
 * bajtowa tylko szkodzi. Bez normalizacji strażnik sprzeczności łapał wyłącznie
 * dokładne `"Quote"`, a `"quote"`, `" Quote "`, `"Quote."`, `"QUOTE"` i
 * `"Quote step"` cicho przechodziły jako `ready` - mimo `notes` opisujących
 * brakujący ekran.
 */
function namesAGoldenStep(candidate: unknown, goldenPath: readonly string[]): boolean {
  if (typeof candidate !== 'string') return false
  const normalized = candidate.trim().toLowerCase().replace(/[.,;:!?]+$/, '')
  if (normalized.length === 0) return false
  return goldenPath.some((step) => {
    const target = step.trim().toLowerCase()
    if (normalized === target) return true
    // Granice słów, nie podciąg: krok "Deal" nie ma pasować do "Deals".
    return new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalized)
  })
}

/**
 * Walidacja wyniku agenta. `runAgent` kończy na `parseJsonLoosely` i zwraca
 * `unknown` - nic po drodze nie sprawdza zgodności ze schematem, więc surowa
 * odpowiedź nie ma prawa wejść do kodu przez `as QaResult` (Global Constraints).
 * Każde rzucenie niesie nazwę pola.
 *
 * Zwracany obiekt jest BUDOWANY OD NOWA, pole po polu: wywołujący nie dostaje
 * referencji do odpowiedzi modelu (mutacja wyniku nie sięga wstecz), a pola,
 * których nie ma w kontrakcie - podrzucony manifest, kwota, druga decyzja - nie
 * jadą dalej razem z werdyktem.
 */
function validateQaResult(raw: unknown, goldenPath: readonly string[]): QaResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`[mercatify-labs] qa: expected an object result, got ${JSON.stringify(raw)}`)
  }
  const result = raw as Record<string, unknown>

  // Każde pole czytamy RAZ do lokalnej stałej i dalej używamy wyłącznie kopii.
  // Odpowiedź przychodzi jako `unknown`: własna implementacja `LlmClient`
  // (SPEC.md §9 wprost do tego zaprasza) może oddać obiekt z getterem, który
  // przy kolejnym odczycie zwraca co innego - wtedy "zwalidowany" werdykt
  // niósłby wartość, której walidator nigdy nie widział. Ta sama konwencja co
  // w `src/preview/screenName.ts` i `src/preview/validateScreens.ts`.
  const verdict = result.verdict
  const blockedAtStep = result.blockedAtStep
  const notes = result.notes

  if (verdict !== 'ready' && verdict !== 'blocked') {
    throw new Error(
      `[mercatify-labs] qa.verdict: expected "ready" or "blocked", got ${JSON.stringify(verdict)}`,
    )
  }
  if (!isNonBlankString(notes)) {
    throw new Error(
      `[mercatify-labs] qa.notes: expected a non-empty string, got ${JSON.stringify(notes)}`,
    )
  }

  if (verdict === 'ready') {
    // Dla `ready` to pole nic nie niesie, więc brak klucza, `undefined`, spacja
    // i wypełniacz w rodzaju "n/a" znaczą to samo co `''` - wywołujący zawsze
    // dostaje string, nigdy `undefined`.
    //
    // Wyjątkiem jest NAZWA KROKU Z GOLDEN PATH: "gotowe, zablokowane na Quote"
    // to sprzeczność, nie szum. Ciche zwrócenie `ready` przepuściłoby podgląd,
    // o którym model sam napisał, że jest niepełny.
    if (namesAGoldenStep(blockedAtStep, goldenPath)) {
      throw new Error(
        `[mercatify-labs] qa.blockedAtStep: verdict "ready" cannot name a blocking step, got ${JSON.stringify(blockedAtStep)}`,
      )
    }
    return { verdict: 'ready', blockedAtStep: '', notes }
  }

  if (!isNonBlankString(blockedAtStep)) {
    throw new Error(
      `[mercatify-labs] qa.blockedAtStep: verdict "blocked" requires a golden path step, got ${JSON.stringify(blockedAtStep)}`,
    )
  }
  // Porównanie DOKŁADNE - bez `trim()`, bez zmiany wielkości liter, bez
  // obcinania interpunkcji. `trim()` wyżej tylko WYKRYWA pustkę, nigdy nie
  // buduje zwracanej wartości. Normalizacja kusi, ale zamieniłaby głośny błąd w
  // cichą zgadywankę: `"quote"` mogłoby znaczyć krok `"Quote"` albo nazwę
  // ekranu, a wywołujący porównuje ten string z własną listą kroków - jeden
  // znak różnicy po obu stronach i podgląd zostaje zablokowany "na kroku",
  // którego nikt nie ma w planie. Model dostaje to samo wprost w instrukcji
  // ("copied CHARACTER FOR CHARACTER"), więc odstępstwo jest jego błędem, nie
  // nieporozumieniem. Ta sama dyscyplina co przy regułach krytyka i nazwach
  // zdolności (SPEC.md §6.2): nieznana nazwa nie staje się faktem.
  if (!goldenPath.includes(blockedAtStep)) {
    throw new Error(
      `[mercatify-labs] qa.blockedAtStep: "${blockedAtStep}" is not one of the golden path steps: ${goldenPath.join(', ')}`,
    )
  }
  return { verdict: 'blocked', blockedAtStep, notes }
}

/**
 * Uruchamia agenta QA (agents/qa.json) - ostatni krok każdego przebiegu
 * podglądu, bo ocenia wszystko powyżej siebie (SPEC.md §11.1). Ocenia manifest
 * Sandbox Engineera, nie liczby i nie mapowania: tamte pochodzą z rdzenia
 * deterministycznego i nie podlegają ocenie modelu.
 *
 * QA nie rozmawia z Sandbox Engineerem (żelazna zasada 5, SPEC.md §2) - manifest
 * i golden path podaje mu ten kod JAWNIE w `input`, bez historii rozmowy.
 * Przepisujemy przy tym oba pola do świeżego obiektu, żeby nic, co wywołujący
 * dokleił obok kontraktu, nie dojechało do modelu.
 *
 * Agent nie ma narzędzi (`tools: []`), więc `getAgentTools` oddaje pustą listę -
 * QA nie ma czym sięgnąć po nic spoza tego, co dostał.
 */
export async function verifyGoldenPath(
  llmClient: LlmClient,
  toolExecutor: ToolExecutor,
  input: QaInput,
): Promise<QaResult> {
  const goldenPath = assertGoldenPath(input.goldenPath)
  const manifest = assertManifest(input.manifest)

  const agent = getAgent('qa')
  const raw = await llmClient.runAgent(
    agent,
    { manifest, goldenPath: [...goldenPath] },
    getAgentTools(agent),
    toolExecutor,
  )
  return validateQaResult(raw, goldenPath)
}
