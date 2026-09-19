/**
 * Mapuje stack deterministycznie, prosi Migration Plannera o godziny i
 * kolejność, wstrzykuje je w mapowania i pokazuje, że liczby w scenariuszu
 * pozostają nietknięte (SPEC.md §2 zasada 2).
 *
 * Uruchomienie:
 *   npx ts-node examples/run-migration.ts
 */
import { OpenAiCompatibleLlmClient } from '../src/llmClient'
import { localToolExecutor } from '../src/toolExecutor'
import { mapCapabilities } from '../src/mapCapabilities'
import { computeScenario } from '../src/computeScenario'
import { planMigration } from '../src/migrationPlanner'
import { attachEffortHours, totalEstimatedHours } from '../src/effortHours'

async function main() {
  const stack = [
    { id: 'p1', name: 'Airtable', category: 'database', monthlyCost: 400 },
    { id: 'p2', name: 'HubSpot', category: 'crm', monthlyCost: 800 },
  ]
  const caps = [
    { id: 'c1', saasProductId: 'p1', capability: 'site_survey_tracking', importance: 'core' as const },
    { id: 'c2', saasProductId: 'p2', capability: 'contacts', importance: 'core' as const },
  ]

  const mappings = mapCapabilities(stack, caps)
  const costs = { omOperatingCost: 8400, implementationCost: 12000 }
  const scenarioBefore = computeScenario(mappings, stack, costs)

  const llmClient = new OpenAiCompatibleLlmClient({
    baseURL: process.env.LLM_BASE_URL ?? 'http://127.0.0.1:1234/v1',
    model: process.env.LLM_MODEL ?? 'qwen/qwen3-vl-30b',
    apiKey: process.env.LLM_API_KEY ?? 'lm-studio',
    // Modele "thinking" na LM Studio potrafia mielic 2-3 minuty; domyslne
    // 60000 ms zabija wywolanie w polowie (Global Constraints, R3).
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 180000),
  })

  const plan = await planMigration(llmClient, localToolExecutor, {
    mappings,
    businessProcess: { name: 'lead to quote', steps: ['Lead', 'Site survey', 'Quote', 'Approval'] },
  })

  const enriched = attachEffortHours(mappings, plan)
  const scenarioAfter = computeScenario(enriched, stack, costs)

  console.log('Plan:', JSON.stringify(plan, null, 2))
  console.log('Total estimated hours:', totalEstimatedHours(plan))
  console.log('implementationCost before/after:', scenarioBefore.implementationCost, scenarioAfter.implementationCost)
  console.log('scenario unchanged:', JSON.stringify(scenarioBefore) === JSON.stringify(scenarioAfter))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
