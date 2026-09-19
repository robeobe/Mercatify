#!/usr/bin/env node
/**
 * CLI agenta Critic (`agents/critic.json`).
 *
 * Istnieje, bo Global Constraint planu brzmi: "Każdy agent z tego planu musi
 * dać się uruchomić z CLI". Ścieżka A dostarcza trzech agentów
 * (`sandbox_engineer`, `qa`, `critic`); dwóch pierwszych uruchamia
 * `bin/preview-cli.ts`, a `critique()` nie było osiągalne znikąd - `src/index.ts`
 * jest zamrożony do Etapu 4. Sekcja File Structure planu wymienia dla ścieżki A
 * tylko jedno CLI, ale powstała przed Etapem A6 (nie ma w niej nawet
 * `agents/critic.json`), więc rozstrzyga jawny Global Constraint.
 *
 * Uruchomienie (z katalogu z `package.json`; `package.json` jest zamrożony):
 *   npx ts-node bin/critic-cli.ts --stage <etap> --artifact <plik.json>
 *
 * WERDYKT KRYTYKA JEST WYŁĄCZNIE DORADCZY (ryzyko R11, żelazne zasady 2 i 4).
 * Nie zmienia żadnej decyzji ani żadnej liczby - `resultSchema` nie ma ani
 * jednego pola numerycznego, a `validateCritique` przepisuje wynik pole po polu,
 * więc kwota od modelu nie ma dokąd wpłynąć. Kod wyjścia NIE zależy od werdyktu:
 * `reject` to poprawny wynik działania narzędzia, nie jego awaria.
 *
 * KODY WYJŚCIA (ten sam kontrakt co bin/preview-cli.ts)
 *   0  przebieg się udał; werdykt na stdout jako JSON (także `reject`)
 *   1  złe argumenty albo złe wejście od człowieka; nic nie poszło do modelu
 *   2  endpoint LLM nieosiągalny albo odmawia - środowisko, nie przebieg
 *   3  przebieg dotarł do modelu i padł; przede wszystkim model złamał kontrakt
 */
import { accessSync, constants, readFileSync, statSync } from 'node:fs'
import { OpenAiCompatibleLlmClient } from '../src/llmClient'
import { localToolExecutor } from '../src/toolExecutor'
import { critique, isStageName, STAGE_NAMES, blockers, type StageName } from '../src/critic'

export const EXIT_USAGE = 1
export const EXIT_LLM_UNREACHABLE = 2
export const EXIT_AGENT = 3

const DEFAULT_TIMEOUT_MS = 180_000
const MAX_TIMEOUT_MS = 2_147_483_647
const MAX_ARTIFACT_BYTES = 1_000_000
const PREFLIGHT_TIMEOUT_MS = 5_000

const USAGE = `Usage:
  npx ts-node bin/critic-cli.ts --stage <stage> --artifact <file.json>

  --stage     required; one of: ${STAGE_NAMES.join(', ')}
  --artifact  required; JSON file holding the artifact to critique

Environment (LM Studio by default):
  LLM_BASE_URL    default http://127.0.0.1:1234/v1 (must carry the /v1 segment)
  LLM_MODEL       default qwen/qwen3-vl-30b
  LLM_API_KEY     default lm-studio
  LLM_TIMEOUT_MS  default ${DEFAULT_TIMEOUT_MS}, whole number from 1 to ${MAX_TIMEOUT_MS}

Exit codes:
  0  Ran fine. stdout is valid JSON. A "reject" verdict is a RESULT, not a failure.
  1  Bad arguments or bad input file. Nothing was sent to the model.
  2  LLM endpoint unreachable or refusing credentials.
  3  The run reached the model and failed - usually the model broke its contract.

The verdict is ADVISORY ONLY: it never changes a decision or a number.`

export class CliError extends Error {
  constructor(readonly code: number, message: string, readonly showUsage = false) {
    super(message)
  }
}

function messageOf(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause
    return cause instanceof Error ? `${err.message}: ${cause.message}` : err.message
  }
  return String(err)
}

function clip(value: unknown, max = 200): string {
  const text = JSON.stringify(value) ?? String(value)
  return text.length <= max ? text : `${text.slice(0, max)}... (${text.length} znakow)`
}

export interface CriticCliArgs {
  stage: StageName
  artifactPath: string
}

/**
 * Czysty parser - nie czyta `process.argv`, nie dotyka dysku, nie woła sieci.
 * Te same trzy decyzje co w `bin/preview-cli.ts`: wartość wyglądająca jak flaga
 * jest błędem (także z pojedynczym `-`), powtórzona flaga jest błędem, pusta
 * wartość jest błędem.
 */
export function parseArgs(argv: string[]): CriticCliArgs {
  let stage: string | undefined
  let artifactPath: string | undefined

  const takeValue = (flag: string, index: number): string => {
    const value = argv[index + 1]
    if (value === undefined) {
      throw new Error(`Missing value for ${flag}: expected a value after it, got end of arguments.`)
    }
    if (value.startsWith('-')) {
      throw new Error(`Missing value for ${flag}: the next argument is the flag ${value}, not a value.`)
    }
    if (value.trim().length === 0) throw new Error(`Missing value for ${flag}: got an empty value.`)
    return value
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--stage') {
      if (stage !== undefined) throw new Error('Repeated flag: --stage was given more than once.')
      stage = takeValue('--stage', i)
      i += 1
    } else if (arg === '--artifact') {
      if (artifactPath !== undefined) {
        throw new Error('Repeated flag: --artifact was given more than once.')
      }
      artifactPath = takeValue('--artifact', i)
      i += 1
    } else {
      throw new Error(`Unknown flag: ${arg}. Known flags: --stage, --artifact, --help`)
    }
  }

  if (stage === undefined) throw new Error('Missing required flag: --stage.')
  if (artifactPath === undefined) throw new Error('Missing required flag: --artifact.')
  // Runtime'owe zawężenie, nie `as StageName` - stage przychodzi z linii poleceń.
  if (!isStageName(stage)) {
    throw new Error(`Unknown --stage ${JSON.stringify(stage)}. Known stages: ${STAGE_NAMES.join(', ')}`)
  }
  return { stage, artifactPath }
}

export function readArtifactFile(path: string): unknown {
  const stat = statSync(path, { throwIfNoEntry: false })
  if (stat && stat.size > MAX_ARTIFACT_BYTES) {
    throw new CliError(
      EXIT_USAGE,
      `--artifact: ${path} is ${stat.size} bytes, over the ${MAX_ARTIFACT_BYTES} byte limit. The whole file goes into the prompt.`,
    )
  }
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    throw new CliError(EXIT_USAGE, `--artifact: cannot read ${path}: ${messageOf(err)}`)
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new CliError(EXIT_USAGE, `--artifact: ${path} is not valid JSON: ${messageOf(err)}`)
  }
}

export function readTimeoutMs(): number {
  const raw = process.env.LLM_TIMEOUT_MS
  if (raw === undefined || raw.trim().length === 0) return DEFAULT_TIMEOUT_MS
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
    throw new CliError(
      EXIT_USAGE,
      `LLM_TIMEOUT_MS must be a whole number of milliseconds between 1 and ${MAX_TIMEOUT_MS}, got ${clip(raw)}`,
    )
  }
  return value
}

export function readBaseUrl(): string {
  return (process.env.LLM_BASE_URL ?? 'http://127.0.0.1:1234/v1').replace(/\/+$/, '')
}

async function assertLlmReachable(baseUrl: string, apiKey: string): Promise<void> {
  const url = `${baseUrl}/models`
  let status: number | undefined
  try {
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

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv[0] === '--help' || argv[0] === '-h') {
    console.log(USAGE)
    return
  }

  let args: CriticCliArgs
  try {
    args = parseArgs(argv)
  } catch (err) {
    throw new CliError(EXIT_USAGE, messageOf(err), true)
  }

  const artifact = readArtifactFile(args.artifactPath)
  const timeoutMs = readTimeoutMs()
  const baseUrl = readBaseUrl()
  const apiKey = process.env.LLM_API_KEY ?? 'lm-studio'
  await assertLlmReachable(baseUrl, apiKey)

  const llmClient = new OpenAiCompatibleLlmClient({
    baseURL: baseUrl,
    model: process.env.LLM_MODEL ?? 'qwen/qwen3-vl-30b',
    apiKey,
    timeoutMs,
  })

  try {
    const result = await critique(llmClient, localToolExecutor, args.stage, artifact)
    // stdout zostaje czystym JSON-em; podsumowanie dla człowieka idzie na stderr.
    console.log(JSON.stringify(result, null, 2))
    const blocking = blockers(result)
    console.error(
      `[critic] stage=${args.stage} verdict=${result.verdict} objections=${result.objections.length} blockers=${blocking.length} (advisory only)`,
    )
  } catch (err) {
    throw new CliError(EXIT_AGENT, `Critique failed: ${messageOf(err)}`)
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    if (err instanceof CliError) {
      console.error(err.message)
      if (err.showUsage) console.error(`\n${USAGE}`)
      process.exitCode = err.code
      return
    }
    console.error(err)
    process.exitCode = EXIT_AGENT
  })
}
