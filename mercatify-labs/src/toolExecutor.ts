import { mapCapabilities } from './mapCapabilities'
import { computeScenario } from './computeScenario'
import { getCatalogTool } from './catalog'
import { firecrawlSearch } from './webSearch'
import { listArchetypes, REQUIRED_INVENTORY_STATES, TOKEN_RULES } from './om/platform'
import type { ToolExecutor } from './llmClient'
import type { CapabilityImportance } from './types'

type ProductWithCapabilities = {
  name: string
  category?: string
  monthlyCost?: number
  capabilities: Array<{ capability: string; importance?: 'core' | 'nice'; usageDescription?: string }>
}

function flattenProducts(products: ProductWithCapabilities[]) {
  const stack = products.map((product, index) => ({
    id: `product-${index}`,
    name: product.name,
    category: product.category ?? 'Unspecified',
    monthlyCost: product.monthlyCost ?? 0,
  }))
  const capabilities = products.flatMap((product, index) =>
    product.capabilities.map((cap, capIndex) => ({
      id: `capability-${index}-${capIndex}`,
      saasProductId: `product-${index}`,
      capability: cap.capability,
      importance: (cap.importance ?? 'core') as CapabilityImportance,
      usageDescription: cap.usageDescription,
    })),
  )
  return { stack, capabilities }
}

/**
 * Executes the 3 pure tools by calling straight into this package's
 * deterministic core (src/mapCapabilities.ts, src/computeScenario.ts,
 * src/catalog.ts) — the same functions the Orchestrator itself uses for the
 * authoritative result. `get_case_data` is host-only (see tools/get_case_data.json)
 * and always errors here: the standalone Orchestrator has no case store and
 * always supplies data inline, so an agent should never need to call it.
 */
export const localToolExecutor: ToolExecutor = async (toolName, args) => {
  switch (toolName) {
    case 'list_catalog_capabilities': {
      const { toolName: name } = args as { toolName: string }
      const entry = getCatalogTool(name)
      return { toolName: name, capabilities: entry ? Object.keys(entry.capabilities) : [], inCatalog: !!entry }
    }
    case 'map_capabilities': {
      const { products } = args as { products: ProductWithCapabilities[] }
      const { stack, capabilities } = flattenProducts(products)
      return { mappings: mapCapabilities(stack, capabilities) }
    }
    case 'compute_scenario': {
      const { mappings, stack, omOperatingCost, implementationCost } = args as {
        mappings: Parameters<typeof computeScenario>[0]
        stack: Array<{ name: string; monthlyCost: number }>
        omOperatingCost: number
        implementationCost: number
      }
      const fullStack = stack.map((product, index) => ({
        id: `product-${index}`,
        name: product.name,
        category: 'Unspecified',
        monthlyCost: product.monthlyCost,
      }))
      return computeScenario(mappings, fullStack, { omOperatingCost, implementationCost })
    }
    case 'get_case_data':
      return {
        found: false,
        error:
          'get_case_data is host-only and not implemented by the standalone Orchestrator — pass data inline instead of a caseId.',
      }
    case 'list_om_archetypes':
      return {
        archetypes: listArchetypes(),
        requiredInventoryStates: REQUIRED_INVENTORY_STATES,
        tokenRules: TOKEN_RULES,
      }
    default:
      throw new Error(`[mercatify-labs] No local executor for tool "${toolName}"`)
  }
}

export interface ToolExecutorOptions {
  /** Enables the `web_search` tool (Firecrawl-backed — see tools/web_search.json). */
  firecrawlApiKey?: string
  firecrawlBaseURL?: string
}

/**
 * `localToolExecutor` + the one tool that leaves the process:
 * `web_search`, used ONLY by the Catalog Curator (src/catalogCurator.ts) —
 * never by the 5 core agents, so the main analysis pipeline never depends on
 * network access or a Firecrawl key. Falls back to `FIRECRAWL_API_KEY`/
 * `FIRECRAWL_BASE_URL` from the environment when not passed explicitly.
 */
export function createToolExecutor(options: ToolExecutorOptions = {}): ToolExecutor {
  return async (toolName, args) => {
    if (toolName !== 'web_search') return localToolExecutor(toolName, args)

    const apiKey = options.firecrawlApiKey ?? process.env.FIRECRAWL_API_KEY
    if (!apiKey) {
      throw new Error(
        '[mercatify-labs] web_search requires a Firecrawl API key — set FIRECRAWL_API_KEY ' +
          '(see .env.example) or pass { firecrawlApiKey } to createToolExecutor().',
      )
    }
    const { query, limit } = args as { query: string; limit?: number }
    const results = await firecrawlSearch(query, {
      apiKey,
      baseURL: options.firecrawlBaseURL ?? process.env.FIRECRAWL_BASE_URL,
      limit,
    })
    return { results }
  }
}
