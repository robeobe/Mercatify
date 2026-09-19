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
import { planMigration, type MigrationPlanItem, type MigrationPlanResult } from '../src/migrationPlanner'
import { attachEffortHours, totalEstimatedHours } from '../src/effortHours'
import { findCatalogGaps, type CatalogGap } from '../src/catalogGaps'
import { auditPlanCoverage, type PlanCoverage } from '../src/migration/validatePlan'
import type {
  ConsolidationScenarioResult,
  MercatoMappingResult,
  SaaSCapabilityInput,
  SaaSProductInput,
} from '../src/types'

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

/**
 * Czysty formatter - testówany jednostkowo. Zamienia `PlanCoverage`
 * (`auditPlanCoverage`, SPEC.md R4) na linie do trybu table. Pusta lista,
 * gdy wszystkie trzy kategorie są puste - to jest zwykły przypadek i nie ma
 * co go zaśmiecać liniami w stylu "0 missing".
 */
export function formatCoverageLines(coverage: PlanCoverage): string[] {
  const lines: string[] = []
  if (coverage.missing.length > 0) {
    lines.push(
      `Coverage: ${coverage.missing.length} mapping(s) missing from the plan (unpriced build/configure work).`,
    )
  }
  if (coverage.orphaned.length > 0) {
    lines.push(`Coverage: ${coverage.orphaned.length} plan item(s) orphaned (no matching mapping).`)
  }
  if (coverage.duplicateSequences.length > 0) {
    lines.push(`Coverage: duplicate rollout sequence number(s): ${coverage.duplicateSequences.join(', ')}.`)
  }
  return lines
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
 *
 * Pieniądze dostają własną, jawną kontrolę: `costs.omOperatingCost`,
 * `costs.implementationCost` i każdy `stack[].monthlyCost` muszą być
 * skończonymi liczbami. Bez tego np. `"costs": {}` przechodziłoby dalej,
 * `implementationCost` byłoby `undefined`, arytmetyka dawałaby `NaN`, a
 * `JSON.stringify` po cichu zamieniłoby to na `null` w wyjściu CLI - dokładnie
 * ta klasa cichego złego wyniku pieniężnego, przed którą chroni żelazna
 * zasada 2.
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
  const costs = req.costs as Record<string, unknown>
  if (!Number.isFinite(costs.omOperatingCost)) {
    throw new Error('Invalid request file: "costs.omOperatingCost" must be a finite number')
  }
  if (!Number.isFinite(costs.implementationCost)) {
    throw new Error('Invalid request file: "costs.implementationCost" must be a finite number')
  }
  req.stack.forEach((entry: unknown, i: number) => {
    const monthlyCost =
      typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>).monthlyCost : undefined
    if (!Number.isFinite(monthlyCost)) {
      throw new Error(`Invalid request file: "stack[${i}].monthlyCost" must be a finite number`)
    }
  })
  return {
    stack: req.stack as SaaSProductInput[],
    capabilities: req.capabilities as SaaSCapabilityInput[],
    costs: costs as { omOperatingCost: number; implementationCost: number },
  }
}

export interface MigrateCliJsonOutput {
  mappings: MercatoMappingResult[]
  scenario: ConsolidationScenarioResult
  migrationPlan: MigrationPlanResult
  catalogGaps: CatalogGap[]
  coverage: PlanCoverage
}

/**
 * Czysty budowniczy wyjścia JSON - testówany jednostkowo, bez odpalania
 * całego `main()` (plik, preflight LM Studio, agent). `coverage`
 * (`auditPlanCoverage`, SPEC.md R4) jedzie obok `catalogGaps` - to ten sam
 * gatunek sygnału: rozjazd, który dotąd ginął, teraz trafia na wyjście CLI.
 */
export function buildJsonOutput(
  mappings: MercatoMappingResult[],
  enrichedMappings: MercatoMappingResult[],
  scenario: ConsolidationScenarioResult,
  plan: MigrationPlanResult,
): MigrateCliJsonOutput {
  return {
    mappings: enrichedMappings,
    scenario,
    migrationPlan: plan,
    catalogGaps: findCatalogGaps(mappings),
    coverage: auditPlanCoverage(mappings, plan),
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
    for (const line of formatCoverageLines(auditPlanCoverage(mappings, plan))) console.log(line)
    return
  }

  console.log(JSON.stringify(buildJsonOutput(mappings, enriched, scenario, plan), null, 2))
}

if (require.main === module) {
  main().catch((err) => {
    console.error((err as Error).message)
    process.exit(1)
  })
}
