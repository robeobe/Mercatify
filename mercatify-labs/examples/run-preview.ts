/**
 * Żywy przebieg podglądu od końca do końca: agent Sandbox Engineer planuje
 * ekrany, deterministyczny renderer zapisuje je jako HTML, agent QA ocenia
 * gotowy manifest względem golden path. Dwa prawdziwe wywołania LLM.
 *
 * Nie jest częścią `npm test`. Jest łapie wyłącznie pliki `*.test.ts` leżące
 * w katalogach `__tests__` (jest.config.cjs), a ten plik nie spełnia żadnego z
 * tych dwóch warunków. Tak ma być: testy jednostkowe nie robią połączeń
 * sieciowych (Global Constraints), a ten skrypt robi wyłącznie je.
 *
 * Uruchomienie (z katalogu z `package.json`; `package.json` jest zamrożony,
 * więc skrypt nie ma własnego wejścia w `scripts`):
 *   npx ts-node examples/run-preview.ts
 *
 * Zmienne środowiskowe (wszystkie opcjonalne, domyślne celują w lokalne
 * LM Studio). Pierwsze trzy są te same co w `.env.example` i
 * `examples/run-voltix.ts`; `LLM_TIMEOUT_MS` NIE występuje w żadnym z nich -
 * wprowadza je ten plan (Global Constraints), a `.env.example` jest zamrożony
 * do Etapu 4, więc do tego czasu ta lista jest jedyną jej dokumentacją:
 *   LLM_BASE_URL    domyślnie "http://127.0.0.1:1234/v1" (MUSI nieść segment /v1)
 *   LLM_MODEL       domyślnie "qwen/qwen3-vl-30b"
 *   LLM_API_KEY     domyślnie "lm-studio" (LM Studio je ignoruje)
 *   LLM_TIMEOUT_MS  domyślnie 180000, całkowita, od 1 do 2147483647
 *
 * KODY WYJŚCIA
 *   0  przebieg się udał - manifest i werdykt QA wypisane. Werdykt `blocked`
 *      też jest sukcesem: to poprawna ocena niekompletnego podglądu, nie awaria
 *      skryptu.
 *   2  środowisko nie nadaje się do pracy i NIC się nie wydarzyło - LM Studio
 *      nie odpowiada na `GET <LLM_BASE_URL>/models` albo `LLM_TIMEOUT_MS` ma
 *      niepoprawną wartość. Preflight istnieje po to, żeby martwy serwer nie
 *      wyglądał jak timeout w środku agenta (Global Constraints).
 *   1  przebieg ruszył i się nie udał.
 *
 * Jedynka celowo NIE jest rozbijana na kody per przyczyna, choć przyczyny są
 * różne. `verifyGoldenPath` rzuca w pięciu miejscach, a te pięć rzutów to DWA
 * różne zdarzenia:
 *   - niepoprawny `goldenPath` albo niepoprawny `manifest` - wykryte PRZED
 *     wywołaniem modelu, więc to błąd tego kodu: obie wartości podajemy tu sami
 *     (`DEFAULT_GOLDEN_PATH` i manifest z `writePreview`), model ich nie dotyka;
 *   - werdykt `ready` nazywający krok golden path, werdykt `blocked` ze stepem
 *     spoza listy, niepoprawny kształt wyniku - to model oddał śmieci
 *     (SPEC.md §10 dokumentuje dwa takie przebiegi).
 * Obie klasy przychodzą tym samym kanałem, zwykłym `Error`, i rozróżnia je
 * wyłącznie treść komunikatu. Zgadywanie po `message` zamieniłoby głośny błąd
 * w cichą heurystykę psującą się przy pierwszej korekcie literówki w tekście
 * wyjątku, więc skrypt wypisuje pełny komunikat i zostawia rozstrzygnięcie
 * człowiekowi, który i tak siedzi przed tym terminalem.
 */
import { join } from 'node:path'
import { OpenAiCompatibleLlmClient } from '../src/llmClient'
import { localToolExecutor } from '../src/toolExecutor'
import { generatePreview } from '../src/sandboxEngineer'
import { verifyGoldenPath, DEFAULT_GOLDEN_PATH } from '../src/qaVerifier'

const DEFAULT_BASE_URL = 'http://127.0.0.1:1234/v1'
const DEFAULT_MODEL = 'qwen/qwen3-vl-30b'
const DEFAULT_API_KEY = 'lm-studio'
const DEFAULT_TIMEOUT_MS = 180_000

/**
 * Preflight ma własny, KRÓTKI budżet czasu - nie dzieli go z `timeoutMs`
 * agenta. Cały sens tej bramy to szybka, jednoznaczna odpowiedź "serwera nie
 * ma"; trzy minuty ciszy przed tą odpowiedzią byłyby dokładnie tym, czemu
 * preflight ma zapobiegać. Listing modeli to zapytanie lokalne i tanie.
 */
const PREFLIGHT_TIMEOUT_MS = 10_000

/**
 * Środowisko nie nadaje się do pracy - nic nie ruszyło. Kod wyjścia 2.
 *
 * `hint` jest osobnym polem, a nie doklejonym zdaniem, bo przyczyny mają różne
 * lekarstwa: martwy serwer naprawia się uruchomieniem LM Studio, a niepoprawne
 * `LLM_TIMEOUT_MS` poprawieniem zmiennej środowiskowej. Jedna wspólna rada
 * przy obu kazałaby połowie przypadków szukać problemu w złym miejscu.
 */
class StartupError extends Error {
  constructor(
    message: string,
    readonly hint: string,
  ) {
    super(message)
  }
}

/**
 * `Number(process.env.LLM_TIMEOUT_MS ?? 180000)` bez bramy jest pułapką z obu
 * stron zakresu.
 *
 * Dół: `Number('3min')` to NaN, a `setTimeout(fn, NaN)` odpala się natychmiast.
 * Góra: `setTimeout` Node'a trzyma opóźnienie w 32-bitowym incie ze znakiem, a
 * wartość powyżej 2147483647 jest ŚCINANA DO 1 ms - czyli
 * `LLM_TIMEOUT_MS=99999999999`, naturalny odruch "ustawię ogromny, żeby nigdy
 * nie ucinało", daje DOKŁADNIE ten sam objaw co literówka.
 *
 * W obu przypadkach każde wywołanie modelu ginie w pierwszej chwili i wygląda w
 * konsoli jak martwy serwer. Niepoprawna wartość to błąd konfiguracji, więc
 * zatrzymuje przebieg zanim cokolwiek się wydarzy.
 *
 * Pusta wartość (`LLM_TIMEOUT_MS=`) znaczy "nie ustawiono" i daje domyślne
 * 180000 - tak samo jak w `bin/preview-cli.ts`. Wcześniej ten plik liczył
 * `Number('') === 0` i kończył się błędem, a CLI cicho brało domyślną: jedna
 * zmienna, dwa zachowania w dwóch plikach tej samej ścieżki.
 */
const MAX_TIMEOUT_MS = 2_147_483_647

function readTimeoutMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim().length === 0) return DEFAULT_TIMEOUT_MS
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_TIMEOUT_MS) {
    throw new StartupError(
      `LLM_TIMEOUT_MS musi być całkowitą liczbą milisekund od 1 do ${MAX_TIMEOUT_MS}, dostałem ${JSON.stringify(raw)}`,
      `Popraw zmienną środowiskową albo ją usuń - bez niej obowiązuje ${DEFAULT_TIMEOUT_MS} ms.`,
    )
  }
  return parsed
}

/** Pełny opis błędu razem z `cause` - tam siedzi ECONNREFUSED i nazwa hosta. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = (error as { cause?: unknown }).cause
  return cause instanceof Error ? `${error.name}: ${error.message} (${cause.message})` : `${error.name}: ${error.message}`
}

/**
 * Brama z Global Constraints: `GET <LLM_BASE_URL>/models` przed jakąkolwiek
 * pracą. Bez niej brak serwera objawia się dopiero jako odrzucone `fetch`
 * gdzieś w środku pierwszego agenta, po nieoczywistym czasie i ze stosem
 * wołań, który wskazuje na `llmClient.ts`, a nie na wyłączone LM Studio.
 *
 * Listę modeli czytamy PRZY OKAZJI i wyłącznie po to, żeby ostrzec - nigdy
 * żeby zablokować. Druga najczęstsza pomyłka po martwym serwerze to zły
 * `LLM_MODEL`, ale LM Studio potrafi doładować model na żądanie, więc jego
 * brak na liście nie jest dowodem awarii i nie ma prawa zatrzymać przebiegu.
 */
async function preflight(baseURL: string, apiKey: string, model: string): Promise<void> {
  const url = `${baseURL.replace(/\/$/, '')}/models`
  const hint =
    'Uruchom LM Studio i załaduj model (albo wskaż inny serwer zgodny z OpenAI przez ' +
    'LLM_BASE_URL - adres musi nieść segment /v1), po czym powtórz komendę. ' +
    'Nic nie zostało zapisane do preview-out/.'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PREFLIGHT_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal,
    }).catch((error: unknown) => {
      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? `brak odpowiedzi w ${PREFLIGHT_TIMEOUT_MS} ms`
          : describeError(error)
      throw new StartupError(`preflight LM Studio nieudany: GET ${url} nie doszło do skutku - ${reason}`, hint)
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new StartupError(
        `preflight LM Studio nieudany: GET ${url} odpowiedziało ${response.status} ${body.slice(0, 300)}`.trim(),
        hint,
      )
    }

    // Kształt odpowiedzi jest tu wyłącznie wskazówką dla człowieka, więc
    // czytamy go defensywnie: cokolwiek nieoczekiwanego znaczy "nie wiem",
    // czyli brak ostrzeżenia, a nigdy wyjątek na ścieżce, która miała tylko
    // ostrzegać.
    const payload = (await response.json().catch(() => null)) as { data?: unknown } | null
    const entries = Array.isArray(payload?.data) ? (payload?.data as unknown[]) : []
    const ids = entries
      .map((entry) => (entry as { id?: unknown } | null)?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (ids.length > 0 && !ids.includes(model)) {
      console.warn(
        `[run-preview] uwaga: LLM_MODEL ${JSON.stringify(model)} nie jest na liście ${url}: ` +
          `${ids.join(', ')}. Lecę dalej - LM Studio potrafi doładować model na żądanie.`,
      )
    }
  } finally {
    clearTimeout(timer)
  }
}

async function main(): Promise<void> {
  // Konfiguracja czytana RAZ, do stałych. Preflight i klient muszą celować w
  // dokładnie ten sam endpoint; dwa niezależne odczyty `process.env` w dwóch
  // miejscach to dwie wartości, które mogą się rozjechać, a wtedy sprawdzamy
  // jeden serwer i rozmawiamy z drugim.
  const baseURL = process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL
  const model = process.env.LLM_MODEL ?? DEFAULT_MODEL
  const apiKey = process.env.LLM_API_KEY ?? DEFAULT_API_KEY
  const timeoutMs = readTimeoutMs(process.env.LLM_TIMEOUT_MS)

  await preflight(baseURL, apiKey, model)

  // Klient budowany INLINE w tym pliku, wzorem `examples/run-voltix.ts`. To
  // świadomy koszt zamiast współdzielonego helpera, który blokowałby drugą
  // osobę pracującą równolegle (Global Constraints).
  //
  // `timeoutMs` jest tu obowiązkowe, a nie kosmetyczne: domyślne 60 s z
  // `OpenAiCompatibleLlmClientOptions` ucina lokalny model "thinking" w
  // połowie odpowiedzi, bo Qwen3 na LM Studio potrafi mielić 2-3 minuty na
  // jedno wywołanie.
  const llmClient = new OpenAiCompatibleLlmClient({ baseURL, model, apiKey, timeoutMs })

  const outDir = join(__dirname, '..', 'preview-out')

  // Wejście niesie DOKŁADNIE trzy pola kontraktu `SandboxEngineerInput`.
  // `planScreens` i tak przepisuje `{ company, blueprint, mappings }` pole po
  // polu i nic poza nimi nie jedzie do promptu, ale podanie tu czegokolwiek
  // więcej byłoby fałszywą obietnicą wobec czytelnika tego pliku.
  const manifest = await generatePreview(
    llmClient,
    localToolExecutor,
    {
      company: { name: 'Voltix', industry: 'solar installation', employees: 45, currency: 'EUR' },
      blueprint: {
        entities: ['Lead', 'Customer', 'Deal', 'Quote'],
        workflows: ['lead to quote'],
        modules: ['CRM', 'Sales Quotes', 'Workflows'],
        customScreens: ['Site survey planner'],
        integrations: ['Slack'],
      },
      mappings: [],
    },
    outDir,
  )

  console.log('Manifest:', JSON.stringify(manifest, null, 2))
  console.log('Screens written to:', outDir)

  // `DEFAULT_GOLDEN_PATH` jedzie JAK JEST. Jest zamrożony (`Object.freeze`) i
  // typowany `readonly string[]`, a `verifyGoldenPath` sam robi sobie kopię,
  // zanim poda listę modelowi - kopiowanie, sortowanie czy "normalizowanie"
  // go tutaj tylko wprowadzałoby drugą wersję prawdy.
  const qa = await verifyGoldenPath(llmClient, localToolExecutor, {
    manifest,
    goldenPath: DEFAULT_GOLDEN_PATH,
  })

  console.log('QA verdict:', JSON.stringify(qa, null, 2))

  // Bez powtórnego sprawdzania, czy `blockedAtStep` jest krokiem golden path:
  // `verifyGoldenPath` NIE ZWRACA werdyktu `blocked` ze stepem spoza listy,
  // tylko rzuca. Kopia tej kontroli tutaj byłaby martwym kodem udającym
  // zabezpieczenie.
  if (qa.verdict === 'blocked') {
    console.log(
      `Podgląd jest niegotowy na kroku "${qa.blockedAtStep}". To poprawny wynik przebiegu, ` +
        'nie awaria skryptu - blueprint bez ekranu dla tego kroku ma dostać właśnie taki werdykt.',
    )
  }
}

main().catch((error: unknown) => {
  // `process.exitCode`, nie `process.exit()`. Zapis na potok (`| tee log.txt`)
  // jest w Node asynchroniczny, a `process.exit()` kończy proces natychmiast i
  // potrafi uciąć własny komunikat o błędzie w połowie zdania. Ustawienie kodu
  // i oddanie sterowania pętli zdarzeń daje ten sam kod wyjścia i pełny tekst.
  if (error instanceof StartupError) {
    console.error(`[run-preview] ${error.message}`)
    console.error(error.hint)
    process.exitCode = 2
    return
  }

  // Na tej ścieżce stos ZOSTAJE, w odróżnieniu od kodu 2. To jedyny sygnał,
  // który rozdziela dwie klasy rzutów `verifyGoldenPath` opisane w nagłówku:
  // ramka w `assertGoldenPath`/`assertManifest` znaczy "ten skrypt podał złe
  // wejście", a ramka w `validateQaResult` - "model oddał śmieci". Sam
  // komunikat tego nie niesie. Pierwsza linia stosu to powtórzony `message`,
  // więc drukujemy ją raz, w wariancie z `cause` (tam siedzi ECONNREFUSED).
  const frames = error instanceof Error && error.stack ? error.stack.split('\n').slice(1) : []
  console.error(`[run-preview] przebieg przerwany: ${describeError(error)}`)
  if (frames.length > 0) console.error(frames.join('\n'))
  process.exitCode = 1
})
