import { getAgent, getAgentTools } from './agentLoader'
import type { LlmClient, ToolExecutor } from './llmClient'
import type { Confidence, Decision } from './types'

export interface CatalogCuratorInput {
  toolName: string
  capability: string
  usageDescription?: string
  /** The target platform's relevant modules/features, e.g. ["CRM", "Workflows"]. */
  platformCapabilities?: string[]
}

export interface CatalogCuratorResult {
  toolName: string
  capability: string
  findings: Array<{ signal: string; detail: string; sourceUrl: string }>
  suggestedTarget: string
  suggestedDecision: Decision
  suggestedConfidence: Confidence
  evidence: string
}

/**
 * Runs the Catalog Curator agent (agents/catalog_curator.json) to research
 * one off-catalog capability and suggest a catalogData.json entry.
 *
 * Deliberately NOT part of `Orchestrator.run()` — this is a separate
 * concern (growing the shared catalog) from analyzing one client's stack,
 * and it is the only place in this package that calls the network (via the
 * `web_search` tool — see tools/web_search.json). It is also the only agent
 * whose suggestion is NEVER applied automatically: a human reviews
 * `CatalogCuratorResult` and edits `src/catalogData.json` by hand. Iron rule
 * #4 (SPEC.md §2) applies to the catalog itself, not only to client cases.
 *
 * Requires a `toolExecutor` that resolves `web_search` — use
 * `createToolExecutor({ firecrawlApiKey })` from `src/toolExecutor.ts`, or
 * your own Firecrawl-compatible implementation.
 */
export async function proposeCatalogEntry(
  llmClient: LlmClient,
  toolExecutor: ToolExecutor,
  input: CatalogCuratorInput,
): Promise<CatalogCuratorResult> {
  const agent = getAgent('catalog_curator')
  return (await llmClient.runAgent(agent, input, getAgentTools(agent), toolExecutor)) as CatalogCuratorResult
}
