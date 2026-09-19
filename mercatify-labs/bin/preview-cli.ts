/**
 * CLI ścieżki Preview: bierze plik z blueprintem, generuje ekrany HTML przez
 * agenta Sandbox Engineer i (domyślnie) ocenia je agentem QA. Rozmawia z
 * LM Studio przez `OpenAiCompatibleLlmClient` - ten sam klient, którego używa
 * `examples/run-voltix.ts` (SPEC.md §10).
 *
 * Uruchomienie:
 *   npx ts-node bin/preview-cli.ts --blueprint case.json --out preview-out
 *
 * Podział pracy w tym pliku jest kontraktem (Global Constraints): `parseArgs`
 * jest CZYSTA i eksportowana. Eksportowane i pokryte testami są też WSZYSTKIE
 * bramy walidacyjne - `readBlueprintFile`, `readTimeoutMs`, `readBaseUrl`,
 * `assertOutDirUsable` - oraz stałe `EXIT_*`. Wcześniej testy obejmowały sam
 * parser ścieżek, a jedyna brama między plikiem użytkownika a promptem modelu
 * nie miała żadnej: cztery jednoczesne mutacje gaszące te bramy przechodziły
 * na zielono. Nietestowane jednostkowo zostaje wyłącznie `main()` - ono jest
 * czystym okablowaniem tych funkcji. Logika merytoryczna siedzi w czystych
 * wrapperach z `src/`; ten plik ich NIE dubluje.
 *
 * Importy idą ścieżkami względnymi do konkretnych plików (`../src/qaVerifier`),
 * nigdy przez `../src` - `src/index.ts` jest zamrożony do Etapu 4.
 */
import { accessSync, constants, lstatSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { OpenAiCompatibleLlmClient } from '../src/llmClient'
import { localToolExecutor } from '../src/toolExecutor'
import { generatePreview, type SandboxEngineerInput } from '../src/sandboxEngineer'
import { verifyGoldenPath, DEFAULT_GOLDEN_PATH } from '../src/qaVerifier'
import type { PreviewManifest } from '../src/preview/renderPreview'

export interface PreviewCliArgs {
  blueprintPath: string
  outDir: string
  runQa: boolean
}

/** Kontrakt CLI zapisuje ten katalog jako `./preview-out` - to ta sama ścieżka. */
const DEFAULT_OUT_DIR = 'preview-out'

/*
 * KODY WYJŚCIA
 *
 * 0  Przebieg się udał. Na stdout stoi poprawny JSON.
 *
 *    UWAGA: werdykt QA `blocked` też kończy się zerem. To POPRAWNY wynik
 *    działania narzędzia, nie awaria - agent QA obejrzał podgląd i orzekł, że
 *    golden path się urywa. Kod wyjścia odpowiada na pytanie "czy narzędzie
 *    zrobiło swoje", a nie "czy podgląd jest gotowy". Na to drugie odpowiada
 *    `qa.verdict` na stdout i TO trzeba czytać w skrypcie, nie `$?`.
 *    Dla wygody `blocked` dopisuje jednolinijkową notkę na stderr, żeby nie
 *    zniknął w oczach człowieka - stdout zostaje czystym JSON-em.
 *
 * 1  Zły argument albo złe wejście OD CZŁOWIEKA: nieznana flaga, brak
 *    `--blueprint`, flaga bez wartości, brakujący plik, niepoprawny JSON, brak
 *    wymaganych pól, bezsensowne `LLM_TIMEOUT_MS`. Nic nie poszło do modelu.
 *
 * 2  LM Studio nie odpowiada na preflighcie (`GET <LLM_BASE_URL>/models`).
 *    Osobny kod, bo to jedyna awaria, którą naprawia się poza tym repo:
 *    włącz serwer, załaduj model, popraw `LLM_BASE_URL`.
 *
 * 3  Przebieg dotarł do modelu i się wywrócił. Tu ląduje przypadek, dla
 *    którego ten kod w ogóle istnieje osobno: MODEL ODDAŁ ŚMIECI i złamał
 *    swój kontrakt - `validateScreens` albo `validateQaResult` rzuciło, bo
 *    `runAgent` kończy na `parseJsonLoosely` i zwraca `unknown`, którego nikt
 *    po drodze nie sprawdza (Global Constraints). Tym samym kodem wychodzi
 *    serwer, który padł w połowie przebiegu, i błąd zapisu podglądu na dysk.
 *
 *    To jest właśnie rozróżnienie, o które chodzi: "model złamał kontrakt"
 *    (3, awaria - nie ma czemu ufać) kontra "podgląd zablokowany" (0, wynik -
 *    werdykt jest wiarygodny i mówi, czego brakuje).
 */
export const EXIT_USAGE = 1
export const EXIT_LLM_UNREACHABLE = 2
export const EXIT_AGENT = 3

/**
 * Preflight ma własny, krótki budżet czasu - nie dzieli go z `LLM_TIMEOUT_MS`,
 * który dotyczy właściwego wywołania agenta i domyślnie wynosi 3 minuty.
 * `GET /models` na żywym serwerze odpowiada w milisekundach, a cały sens
 * preflightu to zginąć SZYBKO. Bez tego limitu adres, który nie odrzuca
 * połączenia tylko je połyka (zapora, zły host), wisiałby do końca świata.
 */
const PREFLIGHT_TIMEOUT_MS = 4000

const USAGE = `Usage:
  npx ts-node bin/preview-cli.ts --blueprint <file.json> [--out <dir>] [--no-qa]

  --blueprint <file.json>  Required. JSON object with the fields
                           { company, blueprint, mappings }. Its shape is
                           checked before anything is sent to the model.
  --out <dir>              Output directory for the generated HTML.
                           Default: ./preview-out
                           Created recursively, like "mkdir -p": a deep or
                           absolute path is created exactly as given. That is
                           deliberate - this directory comes from YOU, never
                           from the model. The model only names files inside it,
                           and those names go through a separate gate.
  --no-qa                  Skip the QA agent and print the manifest alone
                           (no "qa" key in the output).
  --help, -h               Print this text and exit 0.

Environment (LM Studio):
  LLM_BASE_URL    Default http://127.0.0.1:1234/v1
  LLM_MODEL       Default qwen/qwen3-vl-30b
  LLM_API_KEY     Default lm-studio
  LLM_TIMEOUT_MS  Per-request timeout for the agent. Default 180000.
                  Local "thinking" models need minutes, not the client's
                  built-in 60s.

Exit codes:
  0  Ran fine. stdout is valid JSON.
     A "blocked" QA verdict ALSO exits 0 - the QA agent did its job and
     reported that the golden path breaks. That is a result, not a failure.
     To gate a script on readiness, read qa.verdict from stdout, not $?.
  1  Bad arguments or bad input file (unknown flag, missing --blueprint,
     missing file, invalid JSON, missing required fields). Nothing was sent
     to the model.
  2  LM Studio did not answer the preflight GET <LLM_BASE_URL>/models.
     Start it, load a model, enable the local server, or set LLM_BASE_URL.
  3  The run reached the model and failed. Most importantly: the model broke
     its contract and returned a result the validators rejected. A server that
     died mid-run, or a preview that could not be written, lands here too.`

/**
 * Błąd, który zna swój kod wyjścia. Rzucany zamiast wołania `process.exit()`
 * w środku przebiegu, żeby jedno miejsce na dole pliku decydowało o wyjściu -
 * i żeby `process.exitCode` pozwolił Node'owi domknąć strumienie. `process.exit()`
 * potrafi uciąć wypisany tekst, kiedy stdout albo stderr idzie w potok.
 */
class CliError extends Error {
  constructor(
    readonly exitCode: number,
    message: string,
    readonly showUsage = false,
  ) {
    super(message)
    this.name = 'CliError'
  }
}

/**
 * Node zawija prawdziwą przyczynę sieciową w `cause`, a samo `fetch failed`
 * nie mówi, czy to odmowa połączenia, zły host, czy timeout - czyli nie mówi
 * tego, co użytkownik ma naprawić.
 */
function messageOf(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const cause = (err as { cause?: unknown }).cause
  if (cause instanceof Error && cause.message.length > 0) {
    return `${err.message}: ${cause.message}`
  }
  return err.message
}

/**
 * Czysty parser - jedyna część tego pliku objęta testami jednostkowymi.
 *
 * Nie czyta `process.argv`, nie dotyka dysku, nie woła sieci: dostaje tablicę,
 * oddaje obiekt albo rzuca. Każdy komunikat nazywa flagę, której dotyczy.
 *
 * Trzy decyzje, które łatwiej rozpoznać niż wymyślić drugi raz:
 *
 * 1. Wartość wyglądająca jak flaga jest błędem, nie wartością. `--out --no-qa`
 *    to literówka, a nie katalog o nazwie `--no-qa`; ciche wzięcie jej za
 *    wartość zrobiłoby katalog-śmiecia i po cichu ZOSTAWIŁO QA włączone,
 *    mimo że użytkownik napisał `--no-qa`.
 * 2. Powtórzona flaga jest błędem, nie "ostatnia wygrywa". Listy argumentów
 *    bywają sklejane przez skrypty i cicha wygrana ostatniego `--blueprint`
 *    znaczy podgląd zbudowany z innego pliku, niż ktokolwiek zamierzał.
 * 3. Pusta i samobiała wartość jest błędem. `--out ''` doszłoby do
 *    `mkdirSync('')` i wywróciło się ENOENT-em z wnętrza renderera, kilka
 *    warstw od miejsca, w którym powstał błąd.
 *
 * `--help` NIE jest tu obsługiwany - przechwytuje go `main()`, zanim zawoła
 * parser. Parser ma jeden kontrakt zwrotny (`PreviewCliArgs`) i nie ma w nim
 * sposobu na wyrażenie "nie uruchamiaj nic, wypisz pomoc".
 */
export function parseArgs(argv: string[]): PreviewCliArgs {
  let blueprintPath: string | undefined
  let outDir: string | undefined
  let runQa: boolean | undefined

  const takeValue = (flag: string, index: number): string => {
    const value = argv[index + 1]
    if (value === undefined) {
      throw new Error(`Missing value for ${flag}: expected a value after it, got end of arguments.`)
    }
    // Pojedynczy `-`, nie tylko `--`. `--out -h` brało `-h` za katalog, a
    // ponieważ pomoc była wcześniej wyłapywana skanem CAŁEGO argv, przebieg
    // kończył się kodem 0 z tekstem pomocy na stdout, nie robiąc nic - cicha
    // awaria udająca sukces. `--out -x` robił katalog-śmiecia o nazwie `-x`.
    if (value.startsWith('-')) {
      throw new Error(
        `Missing value for ${flag}: the next argument is the flag ${value}, not a value.`,
      )
    }
    if (value.trim().length === 0) {
      throw new Error(`Missing value for ${flag}: got an empty value.`)
    }
    return value
  }

  const rejectRepeat = (flag: string, seen: boolean): void => {
    if (seen) throw new Error(`Repeated flag: ${flag} was given more than once.`)
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--blueprint') {
      rejectRepeat('--blueprint', blueprintPath !== undefined)
      blueprintPath = takeValue('--blueprint', i)
      i += 1
    } else if (arg === '--out') {
      rejectRepeat('--out', outDir !== undefined)
      outDir = takeValue('--out', i)
      i += 1
    } else if (arg === '--no-qa') {
      rejectRepeat('--no-qa', runQa !== undefined)
      runQa = false
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}. Known flags: --blueprint, --out, --no-qa, --help.`)
    } else {
      throw new Error(
        `Unexpected argument: ${arg}. This CLI takes no positional arguments - did you mean --blueprint ${arg}?`,
      )
    }
  }

  if (blueprintPath === undefined) {
    throw new Error('Missing required flag: --blueprint <file.json>')
  }
  return { blueprintPath, outDir: outDir ?? DEFAULT_OUT_DIR, runQa: runQa ?? true }
}

/**
 * Brama na plik od użytkownika. Kształt sprawdzamy ZANIM cokolwiek pojedzie do
 * modelu, z tego samego powodu, dla którego `verifyGoldenPath` sprawdza swój
 * manifest przed wywołaniem agenta: `JSON.stringify` po cichu wycina klucz o
 * wartości `undefined`, więc plik bez `company` nie kończy się błędem, tylko
 * promptem BEZ firmy - i kilkoma minutami mielenia lokalnego modelu, który
 * wymyśla sobie brakujące wejście.
 *
 * `SandboxEngineerInput` typuje te trzy pola jako `unknown`, więc TypeScript
 * niczego tu nie broni - obroną jest ten kod.
 *
 * Obiekt jest BUDOWANY OD NOWA, pole po polu: cokolwiek użytkownik dokleił w
 * pliku obok kontraktu, nie jedzie do promptu. Ta sama dyscyplina co w
 * `planScreens` i `verifyGoldenPath`.
 */
/**
 * Sufit rozmiaru pliku wejściowego. Cała zawartość `--blueprint` ląduje w
 * prompcie (`llmClient.ts` robi `JSON.stringify(input)`), a WYJŚCIE modelu ma
 * swoje sufity od trzeciego audytu (`validateScreens`, CWE-770) - wejście nie
 * miało żadnego. Wielomegabajtowy plik zapychałby kontekst lokalnego modelu.
 */
const MAX_BLUEPRINT_BYTES = 1_000_000

/** Wrogie wejście lecące do logów obcinamy - komunikat nie ma być wielkości pliku. */
function clip(value: unknown, max = 200): string {
  const text = JSON.stringify(value) ?? String(value)
  return text.length <= max ? text : `${text.slice(0, max)}... (${text.length} znakow)`
}

export function readBlueprintFile(path: string): SandboxEngineerInput {
  const stat = statSync(path, { throwIfNoEntry: false })
  if (stat && stat.size > MAX_BLUEPRINT_BYTES) {
    throw new CliError(
      EXIT_USAGE,
      `--blueprint: ${path} is ${stat.size} bytes, over the ${MAX_BLUEPRINT_BYTES} byte limit. The whole file goes into the prompt.`,
    )
  }

  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    throw new CliError(EXIT_USAGE, `--blueprint: cannot read ${path}: ${messageOf(err)}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new CliError(EXIT_USAGE, `--blueprint: ${path} is not valid JSON: ${messageOf(err)}`)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CliError(
      EXIT_USAGE,
      `--blueprint: ${path} must contain a JSON object with { company, blueprint, mappings }, got ${clip(parsed)}`,
    )
  }

  const record = parsed as Record<string, unknown>
  const fail = (detail: string): never => {
    throw new CliError(EXIT_USAGE, `--blueprint: ${path} ${detail}`)
  }

  // Odczyt RAZ do lokalnej stałej, dalej wyłącznie kopia - ta sama konwencja
  // co w walidatorach w `src/`.
  const company = record.company
  const blueprint = record.blueprint
  const mappings = record.mappings

  const requireObject = (value: unknown, field: string): Record<string, unknown> => {
    if (value === undefined) fail(`is missing the required field "${field}".`)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      fail(`field "${field}" must be a JSON object, got ${JSON.stringify(value)}`)
    }
    return value as Record<string, unknown>
  }

  requireObject(company, 'company')
  requireObject(blueprint, 'blueprint')
  if (mappings === undefined) fail('is missing the required field "mappings".')
  // `mappings` pochodzi z rdzenia deterministycznego i wszędzie w tym repo jest
  // tablicą (`MappingResult[]`, src/contract.ts:96). Pusta tablica jest legalna -
  // przebieg bez mapowań to poprawne wejście, brak pola nie jest.
  if (!Array.isArray(mappings)) {
    fail(`field "mappings" must be an array, got ${JSON.stringify(mappings)}`)
  }

  return { company, blueprint, mappings }
}

/**
 * Zakres jest domknięty z OBU stron.
 *
 * Dół: `LLM_TIMEOUT_MS=abc` dałoby `NaN`, a `setTimeout(fn, NaN)` odpala się
 * natychmiast - każde wywołanie modelu byłoby ucinane w pierwszej chwili.
 *
 * Góra: `setTimeout` Node'a trzyma opóźnienie w 32-bitowym incie ze znakiem.
 * Wartość powyżej 2147483647 jest ŚCINANA DO 1 ms (z ostrzeżeniem
 * `TimeoutOverflowWarning`), czyli daje dokładnie ten sam objaw co `NaN`.
 * `LLM_TIMEOUT_MS=99999999999` to naturalny odruch "ustawię ogromny, żeby
 * nigdy nie ucinało" - bez tego sufitu kończyłby się awarią przypisaną
 * modelowi (kod 3), a nie literówce w środowisku.
 */
const MAX_TIMEOUT_MS = 2_147_483_647

export function readTimeoutMs(): number {
  const raw = process.env.LLM_TIMEOUT_MS
  if (raw === undefined || raw.trim().length === 0) return 180_000
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
    throw new CliError(
      EXIT_USAGE,
      `LLM_TIMEOUT_MS must be a whole number of milliseconds between 1 and ${MAX_TIMEOUT_MS}, got ${JSON.stringify(raw)}`,
    )
  }
  return value
}

/** Trailing slash w `LLM_BASE_URL` dałby `.../v1//models`. */
export function readBaseUrl(): string {
  return (process.env.LLM_BASE_URL ?? 'http://127.0.0.1:1234/v1').replace(/\/+$/, '')
}

/**
 * Preflight: LM Studio odpowiada? Lepiej zginąć tu niż w timeoucie agenta
 * (Global Constraints). Bez tego brak serwera objawia się minutami ciszy, a
 * potem błędem z wnętrza klienta, który nie mówi, co naprawić.
 */
async function assertLlmReachable(baseUrl: string, apiKey: string): Promise<void> {
  const url = `${baseUrl}/models`
  let status: number | undefined
  try {
    // Preflight MUSI nieść ten sam klucz co właściwe wywołania. Bez nagłówka
    // każdy serwer wymagający klucza - w tym `https://api.openai.com/v1`, który
    // Global Constraints wymieniają wprost jako wspierany - odpowiadał 401, a
    // CLI raportowało "LM Studio not reachable" i radziło uruchomić LM Studio.
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
    })
    status = response.status
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
  } catch (err) {
    // 401/403 to nie jest "serwer nie odpowiada" - serwer odpowiedział i
    // odmówił. Rada musi wskazywać klucz, nie uruchomienie serwera.
    const hint =
      status === 401 || status === 403
        ? 'The endpoint answered but rejected the credentials - check LLM_API_KEY.'
        : 'Start LM Studio, load a model, enable its local server, or set LLM_BASE_URL.'
    throw new CliError(EXIT_LLM_UNREACHABLE, `LLM endpoint unusable at ${url} (${messageOf(err)}).\n${hint}`)
  }
}

/**
 * `--out` to argument CZŁOWIEKA, więc jego błędy należą do kodu 1 i muszą
 * wyjść PRZED pierwszym wywołaniem modelu. Wcześniej trafiały do `mkdirSync`
 * wewnątrz `writePreview`, czyli dopiero po obu wywołaniach agentów: literówka
 * kosztowała kilka minut mielenia modelu i wychodziła kodem 3, udokumentowanym
 * jako "model złamał kontrakt".
 */
export function assertOutDirUsable(outDir: string): void {
  const existing = lstatSync(outDir, { throwIfNoEntry: false })
  if (existing && !existing.isDirectory()) {
    throw new CliError(
      EXIT_USAGE,
      `--out ${JSON.stringify(outDir)} exists but is not a directory. Nothing was sent to the model.`,
    )
  }
  const probe = existing ? outDir : dirname(resolve(outDir))
  try {
    accessSync(probe, constants.W_OK)
  } catch (err) {
    throw new CliError(
      EXIT_USAGE,
      `--out ${JSON.stringify(outDir)} is not writable (${messageOf(err)}). Nothing was sent to the model.`,
    )
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)

  // Pomoc WYŁĄCZNIE jako pierwszy argument. Skan całego `argv` przechwytywał
  // `-h` także tam, gdzie był wartością flagi (`--out -h`): przebieg kończył
  // się kodem 0, wypisywał pomoc na stdout zamiast JSON-a i nie robił nic.
  // Skrypt bramkujący na `$?` uznałby, że podgląd powstał.
  if (argv[0] === '--help' || argv[0] === '-h') {
    console.log(USAGE)
    return
  }

  let args: PreviewCliArgs
  try {
    args = parseArgs(argv)
  } catch (err) {
    throw new CliError(EXIT_USAGE, messageOf(err), true)
  }

  // Najpierw wejście od człowieka, potem serwer. Jeśli zepsute jest jedno i
  // drugie, użytkownik dostaje najpierw tę usterkę, którą naprawia sam i od
  // ręki. Jedno i drugie dzieje się i tak PRZED pierwszym wywołaniem modelu.
  const input = readBlueprintFile(args.blueprintPath)
  assertOutDirUsable(args.outDir)
  const timeoutMs = readTimeoutMs()
  const baseUrl = readBaseUrl()
  const apiKey = process.env.LLM_API_KEY ?? 'lm-studio'
  await assertLlmReachable(baseUrl, apiKey)

  const llmClient = new OpenAiCompatibleLlmClient({
    baseURL: baseUrl,
    model: process.env.LLM_MODEL ?? 'qwen/qwen3-vl-30b',
    apiKey,
    // Modele "thinking" na LM Studio potrafią mielić 2-3 minuty; domyślne
    // 60000 ms zabija wywołanie w połowie (Global Constraints).
    timeoutMs,
  })

  let manifest: PreviewManifest
  try {
    manifest = await generatePreview(llmClient, localToolExecutor, input, args.outDir)
  } catch (err) {
    throw new CliError(EXIT_AGENT, `Preview generation failed: ${messageOf(err)}`)
  }

  if (!args.runQa) {
    console.log(JSON.stringify({ manifest }, null, 2))
    return
  }

  let qa: Awaited<ReturnType<typeof verifyGoldenPath>>
  try {
    qa = await verifyGoldenPath(llmClient, localToolExecutor, {
      manifest,
      goldenPath: DEFAULT_GOLDEN_PATH,
    })
  } catch (err) {
    throw new CliError(
      EXIT_AGENT,
      `QA verification failed: ${messageOf(err)}\n` +
        `The generated preview is already on disk in ${args.outDir} - only the verdict is missing.`,
    )
  }

  console.log(JSON.stringify({ manifest, qa }, null, 2))

  if (qa.verdict === 'blocked') {
    // Na stderr, żeby stdout został poprawnym JSON-em. Kod wyjścia zostaje 0 -
    // patrz blok KODY WYJŚCIA na górze pliku.
    console.error(
      `QA verdict: blocked at "${qa.blockedAtStep}". Exit code is still 0 - read qa.verdict, not $?.`,
    )
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    if (err instanceof CliError) {
      console.error(err.message)
      if (err.showUsage) console.error(`\n${USAGE}`)
      process.exitCode = err.exitCode
      return
    }
    // Nieprzewidziany błąd: traktujemy jak awarię przebiegu, nie jak złe
    // argumenty - argumenty przeszły już przez parser.
    console.error(messageOf(err))
    process.exitCode = EXIT_AGENT
  })
}
