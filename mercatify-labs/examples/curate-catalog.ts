/**
 * Runs the Catalog Curator agent for real: researches an off-catalog tool
 * via Firecrawl web search and an LLM, and prints a suggested catalog entry.
 * Makes two real network calls (LLM + Firecrawl). Not part of the automated
 * test suite.
 *
 * Usage:
 *   FIRECRAWL_API_KEY=... npx ts-node examples/curate-catalog.ts
 */
import { OpenAiCompatibleLlmClient, createToolExecutor, proposeCatalogEntry } from '../src'

async function main() {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    console.error('Set FIRECRAWL_API_KEY (see .env.example) to run this example.')
    process.exit(1)
  }

  const llmClient = new OpenAiCompatibleLlmClient({
    baseURL: process.env.LLM_BASE_URL ?? 'http://127.0.0.1:1234/v1',
    model: process.env.LLM_MODEL ?? 'qwen/qwen3-vl-30b',
    apiKey: process.env.LLM_API_KEY ?? 'lm-studio',
  })
  const toolExecutor = createToolExecutor({ firecrawlApiKey: apiKey })

  const result = await proposeCatalogEntry(llmClient, toolExecutor, {
    toolName: 'Notion',
    capability: 'knowledge_base',
    usageDescription: 'We keep install-crew training docs and SOPs in a shared Notion workspace.',
    platformCapabilities: ['CRM', 'Sales Quotes', 'Workflows', 'Custom Entities', 'Documents'],
  })

  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
