/**
 * CLI ścieżki Migration: mapuje stack deterministycznie, prosi agenta
 * Migration Planner o godziny i kolejność, i wypisuje wynik razem z
 * niezmienionymi liczbami ze scenariusza. Rozmawia z LM Studio przez
 * `OpenAiCompatibleLlmClient` (SPEC.md §10).
 *
 * Uruchomienie:
 *   npx ts-node bin/migrate-cli.ts --request voltix.json --format table
 */
import { readFileSync } from 'node:fs'
import { OpenAiCompatibleLlmClient } from '../src/llmClient'
import { localToolExecutor } from '../src/toolExecutor'
import { mapCapabilities } from '../src/mapCapabilities'
import { computeScenario } from '../src/computeScenario'
import { planMigration, type MigrationPlanItem } from '../src/migrationPlanner'
import { attachEffortHours, totalEstimatedHours } from '../src/effortHours'
import { findCatalogGaps } from '../src/catalogGaps'
import type { SaaSCapabilityInput, SaaSProductInput } from '../src/types'

export interface MigrateCliArgs {
  requestPath: string
  format: 'json' | 'table'
}

/** Czysty parser - testówany jednostkowo. */
export function parseArgs(argv: string[]): MigrateCliArgs {
  let requestPath = ''
  let format: 'json' | 'table' = 'json'

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--request') {
      requestPath = argv[i + 1] ?? ''
      i += 1
    } else if (flag === '--format') {
      const value = argv[i + 1] ?? ''
      if (value !== 'json' && value !== 'table') throw new Error(`Unsupported --format: ${value}`)
      format = value
      i += 1
    } else {
      throw new Error(`Unknown flag: ${flag}`)
    }
  }

  if (!requestPath) throw new Error('Missing required flag: --request <file.json>')
  return { requestPath, format }
}

/** Czysty formatter - testówany jednostkowo. */
export function formatTable(items: MigrationPlanItem[]): string {
  return [...items]
    .sort((a, b) => a.sequence - b.sequence)
    .map((item) => `${item.sequence}. ${item.source}.${item.capability} - ${item.estimatedHours}h - ${item.rationale}`)
    .join('\n')
}

export interface MigrateCliRequest {
  stack: SaaSProductInput[]
  capabilities: SaaSCapabilityInput[]
  costs: { omOperatingCost: number; implementationCost: number }
}

/**
 * Czysty walidator kształtu - testówany jednostkowo. Nie jest pełnym
 * walidatorem schematu (celowo, patrz brief) - sprawdza tylko, że wejście
 * jest obiektem i że trzy pola, których CLI faktycznie używa, istnieją i
 * mają odpowiedni ogólny kształt. Bez tego zły plik wejściowy (np. brak
 * `stack`) rozbija się dopiero w `mapCapabilities` z nieczytelnym
 * `TypeError: Cannot read properties of undefined (reading 'map')`.
 */
export function validateRequestShape(request: unknown): MigrateCliRequest {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    throw new Error('Invalid request file: expected a JSON object with "stack", "capabilities", "costs"')
  }
  const req = request as Record<string, unknown>
  if (!Array.isArray(req.stack)) throw new Error('Invalid request file: missing "stack"')
  if (!Array.isArray(req.capabilities)) throw new Error('Invalid request file: missing "capabilities"')
  if (typeof req.costs !== 'object' || req.costs === null || Array.isArray(req.costs)) {
    throw new Error('Invalid request file: missing "costs"')
  }
  return {
    stack: req.stack as SaaSProductInput[],
    capabilities: req.capabilities as SaaSCapabilityInput[],
    costs: req.costs as { omOperatingCost: number; implementationCost: number },
  }
}

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'http://127.0.0.1:1234/v1'
/** Osobny, krótki deadline na sam preflight - niezależny od LLM_TIMEOUT_MS,
 * który rządzi wywołaniem agenta (180000 ms), a nie sprawdzeniem "czy LM
 * Studio w ogóle żyje". Bez tego zawieszony/czarnodziurowy adres nie kończy
 * się w 5 sekundach, tylko na systemowym timeoucie TCP connect. */
const PREFLIGHT_TIMEOUT_MS = 1000

/** Preflight: LM Studio odpowiada? Lepiej zginąć tu niż w timeoucie agenta. */
async function assertLlmReachable(): Promise<void> {
  try {
    const response = await fetch(`${LLM_BASE_URL}/models`, { signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  } catch (err) {
    console.error(`LM Studio not reachable at ${LLM_BASE_URL} (${(err as Error).message}).`)
    console.error('Start LM Studio, load a model, enable its local server, or set LLM_BASE_URL.')
    process.exit(2)
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  await assertLlmReachable()

  const request = validateRequestShape(JSON.parse(readFileSync(args.requestPath, 'utf8')))
  const mappings = mapCapabilities(request.stack, request.capabilities)
  const scenario = computeScenario(mappings, request.stack, request.costs)

  const llmClient = new OpenAiCompatibleLlmClient({
    baseURL: LLM_BASE_URL,
    model: process.env.LLM_MODEL ?? 'qwen/qwen3-vl-30b',
    apiKey: process.env.LLM_API_KEY ?? 'lm-studio',
    // Modele "thinking" na LM Studio potrafia mielic 2-3 minuty; domyslne
    // 60000 ms zabija wywolanie w polowie (Global Constraints, R3).
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 180000),
  })

  const plan = await planMigration(llmClient, localToolExecutor, { mappings })
  const enriched = attachEffortHours(mappings, plan)

  if (args.format === 'table') {
    console.log(formatTable(plan.items))
    console.log(`\nTotal estimated hours: ${totalEstimatedHours(plan)}`)
    console.log(`implementationCost (customer-provided, untouched): ${scenario.implementationCost}`)
    console.log(`netPaybackMonths: ${scenario.netPaybackMonths}`)
    return
  }

  console.log(
    JSON.stringify(
      { mappings: enriched, scenario, migrationPlan: plan, catalogGaps: findCatalogGaps(mappings) },
      null,
      2,
    ),
  )
}

if (require.main === module) {
  main().catch((err) => {
    console.error((err as Error).message)
    process.exit(1)
  })
}
