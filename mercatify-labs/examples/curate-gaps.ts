/**
 * Zamyka pętlę wzrostu katalogu: bierze stack, mapuje go deterministycznie,
 * wyciąga luki i dla każdej uruchamia Catalog Curatora. Wynik to PROPOZYCJE -
 * `src/catalogData.json` edytuje człowiek, nigdy ten skrypt (SPEC.md §8).
 *
 * Uruchomienie:
 *   FIRECRAWL_API_KEY=... npx ts-node examples/curate-gaps.ts
 */
import { OpenAiCompatibleLlmClient } from '../src/llmClient'
import { createToolExecutor } from '../src/toolExecutor'
import { mapCapabilities } from '../src/mapCapabilities'
import { findCatalogGaps } from '../src/catalogGaps'
import { proposeCatalogEntry } from '../src/catalogCurator'

const PLATFORM_CAPABILITIES = ['CRM', 'Sales Quotes', 'Workflows', 'Custom Entities', 'Documents']

async function main() {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    console.error('Set FIRECRAWL_API_KEY (see .env.example) to run this example.')
    process.exit(1)
  }

  const mappings = mapCapabilities(
    [
      { id: 'p1', name: 'Notion', category: 'docs', monthlyCost: 120 },
      { id: 'p2', name: 'HubSpot', category: 'crm', monthlyCost: 800 },
    ],
    [
      { id: 'c1', saasProductId: 'p1', capability: 'knowledge_base', importance: 'core' },
      { id: 'c2', saasProductId: 'p2', capability: 'contacts', importance: 'core' },
    ],
  )

  const gaps = findCatalogGaps(mappings)
  console.log(`Found ${gaps.length} off-catalog capability/capabilities.`)
  if (gaps.length === 0) return

  const llmClient = new OpenAiCompatibleLlmClient({
    baseURL: process.env.LLM_BASE_URL ?? 'http://127.0.0.1:1234/v1',
    model: process.env.LLM_MODEL ?? 'qwen/qwen3-vl-30b',
    apiKey: process.env.LLM_API_KEY ?? 'lm-studio',
    // Modele "thinking" na LM Studio potrafia mielic 2-3 minuty; domyslne
    // 60000 ms zabija wywolanie w polowie (Global Constraints, R3).
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 180000),
  })
  const toolExecutor = createToolExecutor({ firecrawlApiKey: apiKey })

  for (const gap of gaps) {
    const proposal = await proposeCatalogEntry(llmClient, toolExecutor, {
      toolName: gap.source,
      capability: gap.capability,
      platformCapabilities: PLATFORM_CAPABILITIES,
    })
    console.log(JSON.stringify(proposal, null, 2))
  }
  console.log('\nReview each proposal by hand before editing src/catalogData.json.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
