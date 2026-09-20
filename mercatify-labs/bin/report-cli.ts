/**
 * CLI ścieżki Report: bierze brief klienta i oddaje gotowy, jednoplikowy
 * dokument HTML. Z modelem albo bez niego - `--no-llm` jest pełnoprawnym
 * trybem, nie awaryjnym (SPEC.md §8).
 *
 * Uruchomienie:
 *   npx ts-node bin/report-cli.ts --brief brief.json --out report.html --no-llm
 *   npm run report -- --brief brief.json --out report.html
 *
 * Podział pracy w tym pliku jest kontraktem i jest PRZEPISANY z
 * `bin/preview-cli.ts`, łącznie z powodami: `parseArgs` jest CZYSTA i
 * eksportowana, eksportowane i pokryte testami są też WSZYSTKIE bramy
 * walidacyjne - `readBriefFile`, `readTimeoutMs`, `readBaseUrl`,
 * `assertOutFileUsable`, `assertLlmReachable` - oraz stałe `EXIT_*`.
 * Nietestowane jednostkowo zostaje wyłącznie `main()`, bo ono jest czystym
 * okablowaniem tych funkcji.
 *
 * `assertLlmReachable` jest eksportowane, a jego odpowiednik w `preview-cli.ts`
 * nie jest - i to jest świadome dołożenie, nie rozjazd: kod 2 to JEDYNY kod
 * wyjścia, którego nie da się wywołać ani argumentem, ani plikiem, więc bez
 * eksportu nie miałby ani jednego testu i jego zamiana na 1 albo 3 przeszłaby
 * na zielono.
 * Logika merytoryczna siedzi w `src/report/buildReport.ts`; ten plik jej NIE
 * dubluje i nie liczy ani jednej liczby.
 */
import { accessSync, constants, existsSync, lstatSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { OpenAiCompatibleLlmClient } from '../src/llmClient'
import { createToolExecutor } from '../src/toolExecutor'
import { normalizeBrief } from '../src/intake/fromBrief'
import { buildReport, type BuiltReport, type ConsultantInputs, type ConsultantToolTerm } from '../src/report/buildReport'
import { writeReport } from '../src/report/writeReport'
import type { MigrationPlanResult } from '../src/migrationPlanner'
import type { ReportParty, TermType } from '../src/report/model'

export interface ReportCliArgs {
  briefPath: string
  outPath: string
  useLlm: boolean
  runPreview: boolean
}

/** Kontrakt CLI zapisuje ten plik jako `./report-out/report.html` - to ta sama ścieżka. */
const DEFAULT_OUT_PATH = 'report-out/report.html'

/** Wersja dokumentu, od której zaczyna każda sprawa; kolejna wysyłka podbija ją ręcznie. */
const DEFAULT_VERSION = '1.0'

/*
 * KODY WYJŚCIA - ta sama semantyka co w `bin/preview-cli.ts`.
 *
 * 0  Przebieg się udał. Dokument leży na dysku, na stdout stoi poprawny JSON.
 *
 *    UWAGA: werdykt QA `blocked` też kończy się zerem, dokładnie jak tam.
 *    Agent QA obejrzał podgląd i orzekł, że golden path się urywa - to jest
 *    WYNIK narzędzia, nie jego awaria, i raport z taką sekcją 07 jest
 *    poprawnym raportem. Zerem kończy się też przebieg, w którym padła proza
 *    albo krytyk: dokument powstaje bez tych sekcji, a `degradations` na
 *    stdout wymienia każdą po nazwie. To jest cała różnica między "nie ma
 *    zdania" a "nie ma liczby" - drugie nigdy się nie zdarza.
 *
 * 1  Zły argument albo złe wejście OD CZŁOWIEKA: nieznana flaga, brak
 *    `--brief`, flaga bez wartości, brakujący plik, niepoprawny JSON, brief
 *    odrzucony przez `normalizeBrief`, nieużywalne `--out`, bezsensowne
 *    `LLM_TIMEOUT_MS`. Nic nie poszło do modelu i nic nie powstało na dysku.
 *
 * 2  LM Studio nie odpowiada na preflighcie (`GET <LLM_BASE_URL>/models`).
 *    Osobny kod, bo to jedyna awaria naprawiana poza tym repo. W trybie
 *    `--no-llm` ten kod nie może wystąpić - preflight się wtedy nie odbywa.
 *
 * 3  Przebieg dotarł do modelu i się wywrócił. Tu ląduje przypadek, dla
 *    którego ten kod istnieje osobno: MODEL ZŁAMAŁ SWÓJ KONTRAKT - napisał w
 *    prozie dosłowną kwotę i `assertNoFigures` rzuciło (SPEC.md §10). Tym
 *    samym kodem wychodzi serwer, który padł w połowie, oraz błąd zapisu
 *    dokumentu na dysk.
 *
 *    Zapis jest ostatni i całościowy (`writeReport` materializuje cały
 *    dokument w pamięci przed pierwszym bajtem), więc kod 3 NIGDY nie
 *    zostawia połowy raportu pod nazwą poprzedniego, poprawnego.
 */
export const EXIT_USAGE = 1
export const EXIT_LLM_UNREACHABLE = 2
export const EXIT_AGENT = 3

/**
 * Preflight ma własny, krótki budżet czasu - ten sam powód co w
 * `preview-cli.ts`: `GET /models` na żywym serwerze odpowiada w
 * milisekundach, a adres, który połyka połączenia zamiast je odrzucać,
 * wisiałby bez tego limitu w nieskończoność.
 */
const PREFLIGHT_TIMEOUT_MS = 4000

const USAGE = `Usage:
  npx ts-node bin/report-cli.ts --brief <file.json> [--out <file.html>] [--no-llm] [--no-preview]

  --brief <file.json>  Required. A StackBrief (v1 or v2) as produced by the
                       intake form, optionally carrying a "consultant" object
                       with the costs, the rate, the section 02 counters and
                       the cover metadata. Its shape is checked before
                       anything is sent to the model.
  --out <file.html>    Output FILE for the rendered report.
                       Default: ./report-out/report.html
                       Parent directories are created, like "mkdir -p". The
                       path comes from YOU, never from the model, and a
                       symlink is refused (CWE-59).
  --no-llm             Run with no agents at all. Every table, number and
                       figure is still produced; the sentence-only sections
                       are omitted rather than rendered empty.
  --no-preview         Skip the Sandbox Engineer and QA. Section 07 is then
                       omitted. Implied by --no-llm.
  --help, -h           Print this text and exit 0.

Environment (LM Studio) - ignored under --no-llm:
  LLM_BASE_URL    Default http://127.0.0.1:1234/v1
  LLM_MODEL       Default qwen/qwen3-vl-30b
  LLM_API_KEY     Default lm-studio
  LLM_TIMEOUT_MS  Per-request timeout for one agent. Default 180000.
  FIRECRAWL_API_KEY  Optional. Only the Catalog Curator uses it, to research
                     an off-catalog capability for Appendix B.

Exit codes:
  0  Ran fine. The report is on disk and stdout is valid JSON.
     A "blocked" QA verdict ALSO exits 0 - the QA agent did its job and
     reported that the golden path breaks. So does a run whose prose or
     critic step failed: read "degradations" from stdout, not $?.
  1  Bad arguments or bad input file (unknown flag, missing --brief, missing
     file, invalid JSON, a brief the intake gate rejected, an unusable --out).
     Nothing was sent to the model and nothing was written.
  2  LM Studio did not answer the preflight GET <LLM_BASE_URL>/models.
     Start it, load a model, enable the local server, or set LLM_BASE_URL.
     Cannot happen under --no-llm.
  3  The run reached the model and failed. Most importantly: the model stated
     a bare figure in prose and the guard rejected it. A server that died
     mid-run, or a report that could not be written, lands here too.`

/**
 * Błąd, który zna swój kod wyjścia. Rzucany zamiast `process.exit()` w środku
 * przebiegu, żeby jedno miejsce na dole pliku decydowało o wyjściu - i żeby
 * `process.exitCode` pozwolił Node'owi domknąć strumienie.
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

/** Node zawija prawdziwą przyczynę sieciową w `cause`; samo `fetch failed` nic nie mówi. */
function messageOf(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const cause = (err as { cause?: unknown }).cause
  if (cause instanceof Error && cause.message.length > 0) {
    return `${err.message}: ${cause.message}`
  }
  return err.message
}

/**
 * Czysty parser - nie czyta `process.argv`, nie dotyka dysku, nie woła sieci.
 *
 * Trzy decyzje są przepisane z `preview-cli.ts` razem z powodami, bo są tam
 * opłacone błędami: wartość wyglądająca jak flaga jest błędem (`--out --no-llm`
 * to literówka, nie plik o nazwie `--no-llm`, a ciche wzięcie jej za wartość
 * ZOSTAWIŁOBY agenty włączone mimo `--no-llm`); powtórzona flaga jest błędem,
 * nie "ostatnia wygrywa"; pusta i samobiała wartość jest błędem.
 *
 * `--help` NIE jest tu obsługiwany - przechwytuje go `main()` przed
 * wywołaniem parsera, bo `ReportCliArgs` nie ma jak wyrazić "nie rób nic".
 */
export function parseArgs(argv: string[]): ReportCliArgs {
  let briefPath: string | undefined
  let outPath: string | undefined
  let useLlm: boolean | undefined
  let runPreview: boolean | undefined

  const takeValue = (flag: string, index: number): string => {
    const value = argv[index + 1]
    if (value === undefined) {
      throw new Error(`Missing value for ${flag}: expected a value after it, got end of arguments.`)
    }
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
    if (arg === '--brief') {
      rejectRepeat('--brief', briefPath !== undefined)
      briefPath = takeValue('--brief', i)
      i += 1
    } else if (arg === '--out') {
      rejectRepeat('--out', outPath !== undefined)
      outPath = takeValue('--out', i)
      i += 1
    } else if (arg === '--no-llm') {
      rejectRepeat('--no-llm', useLlm !== undefined)
      useLlm = false
    } else if (arg === '--no-preview') {
      rejectRepeat('--no-preview', runPreview !== undefined)
      runPreview = false
    } else if (arg.startsWith('-')) {
      throw new Error(
        `Unknown flag: ${arg}. Known flags: --brief, --out, --no-llm, --no-preview, --help.`,
      )
    } else {
      throw new Error(
        `Unexpected argument: ${arg}. This CLI takes no positional arguments - did you mean --brief ${arg}?`,
      )
    }
  }

  if (briefPath === undefined) {
    throw new Error('Missing required flag: --brief <file.json>')
  }
  const llm = useLlm ?? true
  return {
    briefPath,
    outPath: outPath ?? DEFAULT_OUT_PATH,
    useLlm: llm,
    // `--no-llm` wyłącza podgląd niejawnie i to nie jest uprzejmość: Sandbox
    // Engineer i QA SĄ agentami, więc bez modelu nie ma czego uruchomić.
    runPreview: llm && (runPreview ?? true),
  }
}

/**
 * Sufit rozmiaru pliku wejściowego. Cała treść briefu przechodzi przez
 * `normalizeBrief` do mapowań i - w przebiegu z modelem - do promptu
 * (`llmClient.ts` robi `JSON.stringify(input)`). `fromBrief.ts` ma własne
 * sufity na LICZBĘ narzędzi i modułów, ale nie na bajty; wielomegabajtowy
 * plik z jednym narzędziem przeszedłby przez tamte bramy bez słowa.
 */
const MAX_BRIEF_BYTES = 1_000_000

/** Wrogie wejście lecące do logów obcinamy - komunikat nie ma być wielkości pliku. */
function clip(value: unknown, max = 200): string {
  const text = JSON.stringify(value) ?? String(value)
  return text.length <= max ? text : `${text.slice(0, max)}... (${text.length} znakow)`
}

export interface ReportCliInput {
  /** Surowy brief, przekazywany dalej bez zmian - `buildReport` ma własną bramę. */
  brief: unknown
  consultant: ConsultantInputs
}

/**
 * Jedyna brama między plikiem użytkownika a przebiegiem.
 *
 * Robi trzy rzeczy i każda musi się zdarzyć PRZED pierwszym wywołaniem modelu:
 *
 * 1. Sprawdza rozmiar i składnię pliku.
 * 2. Przepuszcza brief przez `normalizeBrief` - tę samą bramę, której użyje
 *    `buildReport`. Sprawdzenie tutaj kosztuje jeden przebieg walidatora, a
 *    oszczędza kilka minut mielenia lokalnego modelu przed błędem, który i
 *    tak by padł - i zamienia kod 3 ("model złamał kontrakt") na kod 1
 *    ("popraw swój plik"), czyli mówi prawdę o tym, kto ma co naprawić.
 * 3. WYŁUSKUJE wejścia konsultanta. Brief klienta ich nie zna - koszty,
 *    stawka, liczniki z rozpoznania i metadane okładki nie są pytaniem do
 *    klienta - więc czytamy je z opcjonalnego obiektu `consultant` w tym samym
 *    pliku, a pola, których nikt nie podał, zostają NIEOBECNE. Nic nie jest
 *    tu zgadywane: raport bez stawki powstaje bez kosztu wdrożenia i bez
 *    Figure 2, zamiast pokazać wykres z zer.
 *
 * Wynik jest BUDOWANY OD NOWA, pole po polu - cokolwiek użytkownik dokleił
 * obok kontraktu, nie jedzie dalej. Ta sama dyscyplina co w
 * `readBlueprintFile` i w `briefToRequest`.
 */
export function readBriefFile(path: string): ReportCliInput {
  const stat = statSync(path, { throwIfNoEntry: false })
  if (stat && stat.size > MAX_BRIEF_BYTES) {
    throw new CliError(
      EXIT_USAGE,
      `--brief: ${path} is ${stat.size} bytes, over the ${MAX_BRIEF_BYTES} byte limit.`,
    )
  }

  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    throw new CliError(EXIT_USAGE, `--brief: cannot read ${path}: ${messageOf(err)}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new CliError(EXIT_USAGE, `--brief: ${path} is not valid JSON: ${messageOf(err)}`)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CliError(
      EXIT_USAGE,
      `--brief: ${path} must contain a JSON object (a StackBrief), got ${clip(parsed)}`,
    )
  }

  // Brama briefu - ta sama, której użyje `buildReport`. Jej komunikaty nazywają
  // ścieżkę pola (`tools[2].modules[0].caps[1]`), więc przekazujemy je dalej.
  try {
    normalizeBrief(parsed)
  } catch (err) {
    throw new CliError(EXIT_USAGE, `--brief: ${path} is not a usable brief: ${messageOf(err)}`)
  }

  const record: Record<string, unknown> = { ...parsed }
  return { brief: parsed, consultant: readConsultant(record, path) }
}

// --- Wyłuskanie wejść konsultanta -------------------------------------------

function gate(path: string, detail: string): never {
  throw new CliError(EXIT_USAGE, `--brief: ${path} ${detail}`)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return { ...value }
}

function readText(value: unknown, fallback: string, field: string, path: string): string {
  if (value === undefined) return fallback
  if (typeof value !== 'string') gate(path, `field "${field}" must be a string, got ${clip(value)}`)
  return value
}

function readNumber(value: unknown, field: string, path: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    gate(path, `field "${field}" must be a finite number >= 0, got ${clip(value)}`)
  }
  return value
}

function readParty(value: unknown, field: string, path: string): ReportParty {
  const record = asRecord(value)
  if (record === undefined) {
    if (value === undefined) return { organization: '', person: '', role: '' }
    gate(path, `field "${field}" must be an object with { organization, person, role }`)
  }
  return {
    organization: readText(record.organization, '', `${field}.organization`, path),
    person: readText(record.person, '', `${field}.person`, path),
    role: readText(record.role, '', `${field}.role`, path),
  }
}

/**
 * Taryfy i terminy umów, po jednym wpisie na narzędzie.
 *
 * Czytane z samych narzędzi briefu, nie z obiektu `consultant`: to te same
 * pola, które wypełnia formularz przyjęcia w wersji v2 (`plan`, `unitPrice`,
 * `termEnds`, `termType`), a `normalizeBrief` celowo ich nie przepuszcza -
 * silnik ich nie potrzebuje, tabela stacku i kolejność fal owszem.
 */
function readTerms(tools: unknown, path: string): ConsultantToolTerm[] {
  if (!Array.isArray(tools)) return []
  const terms: ConsultantToolTerm[] = []
  tools.forEach((entry, index) => {
    const tool = asRecord(entry)
    if (tool === undefined) return
    const name = tool.name
    if (typeof name !== 'string' || name.trim().length === 0) return
    const termType = tool.termType
    if (termType !== undefined && termType !== 'monthly' && termType !== 'annual') {
      gate(path, `tools[${index}].termType must be "monthly" or "annual", got ${clip(termType)}`)
    }
    const unitPrice = readNumber(tool.unitPrice, `tools[${index}].unitPrice`, path)
    terms.push({
      tool: name,
      plan: readText(tool.plan, '', `tools[${index}].plan`, path),
      ...(unitPrice === undefined ? {} : { unitPrice }),
      termEnds: readText(tool.termEnds, '', `tools[${index}].termEnds`, path),
      ...(termType === undefined ? {} : { termType: termType as TermType }),
    })
  })
  return terms
}

function readCounts(value: unknown, path: string): { statements: number; offCatalog: number } | undefined {
  const record = asRecord(value)
  if (record === undefined) {
    if (value === undefined) return undefined
    gate(path, 'field "consultant.counts" must be an object with { statements, offCatalog }')
  }
  const statements = readNumber(record.statements, 'consultant.counts.statements', path)
  const offCatalog = readNumber(record.offCatalog, 'consultant.counts.offCatalog', path)
  if (statements === undefined || offCatalog === undefined) {
    gate(path, 'field "consultant.counts" needs both "statements" and "offCatalog"')
  }
  return { statements, offCatalog }
}

/**
 * Plan wysiłku od delivery leada. Przepuszczany dalej NIESPRAWDZONY co do
 * treści - `groupIntoWaves` gatuje każdą godzinę po swojemu (`NaN`, ujemna,
 * wiersz bez pokrycia) i robi to lepiej niż drugie sito tutaj. Sprawdzamy
 * tylko, czy to w ogóle ma kształt planu, bo inaczej błąd wyszedłby z
 * wnętrza `attachEffortHours` bez nazwy pliku.
 */
function readPlan(value: unknown, path: string): MigrationPlanResult | undefined {
  const record = asRecord(value)
  if (record === undefined) {
    if (value === undefined) return undefined
    gate(path, 'field "consultant.plan" must be an object with { items, summary }')
  }
  if (!Array.isArray(record.items)) {
    gate(path, 'field "consultant.plan.items" must be an array')
  }
  return { items: record.items, summary: readText(record.summary, '', 'consultant.plan.summary', path) }
}

function readConsultant(record: Record<string, unknown>, path: string): ConsultantInputs {
  const raw = asRecord(record.consultant) ?? {}
  const company = asRecord(record.company) ?? {}
  const contact = asRecord(record.contact) ?? {}

  const omOperatingCost = readNumber(raw.omOperatingCost, 'consultant.omOperatingCost', path)
  const hostingMonthly = readNumber(raw.hostingMonthly, 'consultant.hostingMonthly', path)
  const implementationCost = readNumber(raw.implementationCost, 'consultant.implementationCost', path)
  const rate = readNumber(raw.rate, 'consultant.rate', path)
  const weeklyHours = readNumber(raw.weeklyHours, 'consultant.weeklyHours', path)
  const horizonMonths = readNumber(raw.horizonMonths, 'consultant.horizonMonths', path)
  const figureMonths = readNumber(raw.figureMonths, 'consultant.figureMonths', path)
  const runMinutes = readNumber(raw.runMinutes, 'consultant.runMinutes', path)
  const counts = readCounts(raw.counts, path)
  const plan = readPlan(raw.plan, path)
  const programmeStart = readText(raw.programmeStart, '', 'consultant.programmeStart', path)

  return {
    meta: {
      caseId: readText(raw.caseId, '', 'consultant.caseId', path),
      version: readText(raw.version, DEFAULT_VERSION, 'consultant.version', path),
      // `created` to data, którą stempluje sam formularz przyjęcia - użycie
      // jej jako daty wydania jest ODCZYTEM, nie zgadywaniem. Konsultant
      // nadpisuje ją, kiedy wydaje dokument innego dnia.
      issued: readText(raw.issued, readText(record.created, '', 'created', path), 'consultant.issued', path),
      validUntil: readText(raw.validUntil, '', 'consultant.validUntil', path),
      // Odbiorca jest w briefie: nazwa firmy i osoba kontaktowa. Nadawcy w nim
      // nie ma i nie ma go skąd wziąć, więc pozostaje pusty, dopóki ktoś go
      // nie wpisze - pusta rubryka jest uczciwsza niż wymyślone nazwisko.
      preparedFor: {
        organization: readText(company.name, '', 'company.name', path),
        person: readText(contact.name, '', 'contact.name', path),
        role: readText(contact.role, '', 'contact.role', path),
      },
      preparedBy: readParty(raw.preparedBy, 'consultant.preparedBy', path),
      ...(runMinutes === undefined ? {} : { runMinutes }),
      humanReviewed: raw.humanReviewed === true,
      basis: readText(raw.basis, '', 'consultant.basis', path),
      confidentialityNote: readText(raw.confidentialityNote, '', 'consultant.confidentialityNote', path),
    },
    basis: {
      readWhat: readText(record.readWhat, '', 'readWhat', path),
      period: readText(record.period, '', 'period', path),
      exclusions: readText(record.exclusions, '', 'exclusions', path),
    },
    ...(omOperatingCost === undefined ? {} : { omOperatingCost }),
    ...(hostingMonthly === undefined ? {} : { hostingMonthly }),
    ...(implementationCost === undefined ? {} : { implementationCost }),
    ...(rate === undefined ? {} : { rate }),
    ...(counts === undefined ? {} : { counts }),
    ...(plan === undefined ? {} : { plan }),
    ...(programmeStart.length === 0 ? {} : { programmeStart }),
    ...(weeklyHours === undefined ? {} : { weeklyHours }),
    ...(horizonMonths === undefined ? {} : { horizonMonths }),
    ...(figureMonths === undefined ? {} : { figureMonths }),
    terms: readTerms(record.tools, path),
  }
}

// --- Środowisko --------------------------------------------------------------

/**
 * Zakres jest domknięty z OBU stron, z tych samych dwóch powodów co w
 * `preview-cli.ts`: `NaN` sprawia, że `setTimeout` odpala się natychmiast, a
 * wartość powyżej 32-bitowego inta jest ŚCINANA DO 1 ms - czyli daje dokładnie
 * ten sam objaw. `LLM_TIMEOUT_MS=99999999999` to naturalny odruch "ustawię
 * ogromny, żeby nigdy nie ucinało".
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
 * `--out` to argument CZŁOWIEKA, więc jego błędy należą do kodu 1 i muszą
 * wyjść PRZED pierwszym wywołaniem modelu. Bez tego literówka trafiała do
 * `writeReport` na samym końcu przebiegu - po wszystkich agentach - i
 * wychodziła kodem 3, udokumentowanym jako "model złamał kontrakt".
 *
 * Symlink odrzucamy TUTAJ, choć `writeReport` odrzuca go też: tam jest to
 * ostatnia linia obrony przed CWE-59, tu jest to komunikat dla człowieka,
 * który zdąży poprawić ścieżkę, zanim cokolwiek policzy model.
 */
export function assertOutFileUsable(outPath: string): void {
  const absolute = resolve(outPath)
  const existing = lstatSync(absolute, { throwIfNoEntry: false })
  if (existing?.isSymbolicLink()) {
    throw new CliError(
      EXIT_USAGE,
      `--out ${JSON.stringify(outPath)} is a symlink. Refusing to write through it (CWE-59).`,
    )
  }
  if (existing && !existing.isFile()) {
    throw new CliError(
      EXIT_USAGE,
      `--out ${JSON.stringify(outPath)} exists but is not a regular file. Nothing was sent to the model.`,
    )
  }

  // `writeReport` zakłada brakujące katalogi rekurencyjnie, więc pytamy o
  // prawo zapisu NAJBLIŻSZEGO ISTNIEJĄCEGO przodka, a nie samego rodzica -
  // inaczej `--out a/b/c/report.html` wyglądałby na błąd, choć jest poprawny.
  let probe = dirname(absolute)
  while (!existsSync(probe)) {
    const parent = dirname(probe)
    if (parent === probe) break
    probe = parent
  }
  const probeStat = lstatSync(probe, { throwIfNoEntry: false })
  if (probeStat === undefined || !probeStat.isDirectory()) {
    throw new CliError(
      EXIT_USAGE,
      `--out ${JSON.stringify(outPath)} cannot be created: ${probe} is not a directory.`,
    )
  }
  try {
    accessSync(probe, constants.W_OK)
  } catch (err) {
    throw new CliError(
      EXIT_USAGE,
      `--out ${JSON.stringify(outPath)} is not writable (${messageOf(err)}). Nothing was sent to the model.`,
    )
  }
}

/**
 * Preflight: LM Studio odpowiada? Lepiej zginąć tu niż w timeoucie agenta.
 * Bez tego brak serwera objawia się minutami ciszy, a potem błędem z wnętrza
 * klienta, który nie mówi, co naprawić.
 */
export async function assertLlmReachable(baseUrl: string, apiKey: string): Promise<void> {
  const url = `${baseUrl}/models`
  let status: number | undefined
  try {
    // Preflight MUSI nieść ten sam klucz co właściwe wywołania - bez nagłówka
    // serwer wymagający klucza odpowiada 401, a CLI radziłoby uruchomić
    // LM Studio zamiast poprawić klucz.
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
    })
    status = response.status
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
  } catch (err) {
    const hint =
      status === 401 || status === 403
        ? 'The endpoint answered but rejected the credentials - check LLM_API_KEY.'
        : 'Start LM Studio, load a model, enable its local server, or set LLM_BASE_URL.'
    throw new CliError(EXIT_LLM_UNREACHABLE, `LLM endpoint unusable at ${url} (${messageOf(err)}).\n${hint}`)
  }
}

/** Podgląd pisze pliki OBOK raportu - jeden katalog na jedną sprawę. */
export function previewDirFor(outPath: string): string {
  return join(dirname(resolve(outPath)), 'preview')
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)

  // Pomoc WYŁĄCZNIE jako pierwszy argument. Skan całego `argv` przechwytywał
  // `-h` także tam, gdzie był wartością flagi (`--out -h`): przebieg kończył
  // się kodem 0 z pomocą na stdout, nie robiąc nic - cicha awaria udająca sukces.
  if (argv[0] === '--help' || argv[0] === '-h') {
    console.log(USAGE)
    return
  }

  let args: ReportCliArgs
  try {
    args = parseArgs(argv)
  } catch (err) {
    throw new CliError(EXIT_USAGE, messageOf(err), true)
  }

  // Najpierw wejście od człowieka, potem serwer. Jeśli zepsute jest jedno i
  // drugie, użytkownik dostaje najpierw tę usterkę, którą naprawia sam i od
  // ręki. Jedno i drugie dzieje się PRZED pierwszym wywołaniem modelu.
  const input = readBriefFile(args.briefPath)
  assertOutFileUsable(args.outPath)

  let llmClient: OpenAiCompatibleLlmClient | undefined
  if (args.useLlm) {
    const timeoutMs = readTimeoutMs()
    const baseUrl = readBaseUrl()
    const apiKey = process.env.LLM_API_KEY ?? 'lm-studio'
    await assertLlmReachable(baseUrl, apiKey)
    llmClient = new OpenAiCompatibleLlmClient({
      baseURL: baseUrl,
      model: process.env.LLM_MODEL ?? 'qwen/qwen3-vl-30b',
      apiKey,
      // Modele "thinking" na LM Studio potrafią mielić 2-3 minuty; domyślne
      // 60000 ms zabija wywołanie w połowie.
      timeoutMs,
    })
  }

  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY

  let built: BuiltReport
  try {
    built = await buildReport({
      brief: input.brief,
      consultant: input.consultant,
      ...(llmClient === undefined ? {} : { llmClient }),
      toolExecutor: createToolExecutor(firecrawlApiKey ? { firecrawlApiKey } : {}),
      ...(args.runPreview ? { preview: { outDir: previewDirFor(args.outPath) } } : {}),
    })
  } catch (err) {
    throw new CliError(EXIT_AGENT, `Report build failed: ${messageOf(err)}`)
  }

  let written: ReturnType<typeof writeReport>
  try {
    written = writeReport(built.model, args.outPath)
  } catch (err) {
    throw new CliError(EXIT_AGENT, `Writing the report failed: ${messageOf(err)}`)
  }

  const preview = built.model.facts.preview
  console.log(
    JSON.stringify(
      {
        report: written,
        degradations: built.degradations,
        ...(preview === undefined ? {} : { qa: { verdict: preview.verdict, blockedAtStep: preview.blockedAtStep } }),
        ...(built.critique === undefined ? {} : { critique: built.critique }),
      },
      null,
      2,
    ),
  )

  if (preview?.verdict === 'blocked') {
    // Na stderr, żeby stdout został poprawnym JSON-em. Kod wyjścia zostaje 0.
    console.error(
      `QA verdict: blocked at "${preview.blockedAtStep}". Exit code is still 0 - read qa.verdict, not $?.`,
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
