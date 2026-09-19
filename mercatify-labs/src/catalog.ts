import type { Catalog, CatalogCapabilityEntry } from './types'
import rawCatalog from './catalogData.json'

// Iron rule #1: known SaaS → OM decisions come from this curated matrix via
// lookup, never from live LLM reasoning on the critical path. See
// .ai/specs/2026-09-18-mercatify.md §5.1.
export const catalog: Catalog = rawCatalog as Catalog

export function getCatalogTool(name: string): Catalog[string] | undefined {
  return catalog[name]
}

export function getCatalogCapability(toolName: string, capability: string): CatalogCapabilityEntry | undefined {
  return catalog[toolName]?.capabilities?.[capability]
}

export function listCatalogToolNames(): string[] {
  return Object.keys(catalog)
}
