// Plain, ORM-free types mirroring .ai/specs/2026-09-18-mercatify.md §4 — the
// deterministic core (catalog, mapCapabilities, computeScenario) must stay a
// pure function library, importable and unit-testable with no DB/DI wiring.

export type Decision = 'native' | 'configure' | 'build' | 'integrate' | 'keep'
export type Confidence = 'high' | 'medium' | 'low'
export type CapabilityImportance = 'core' | 'nice'

export interface SaaSProductInput {
  id: string
  name: string
  category: string
  monthlyCost: number
  seatCount?: number
}

export interface SaaSCapabilityInput {
  id: string
  saasProductId: string
  capability: string
  importance: CapabilityImportance
  usageDescription?: string
}

export interface MercatoMappingResult {
  capability: string
  source: string
  targetFeature: string
  decision: Decision
  confidence: Confidence
  evidence: string
  customEffortHours?: number
}

export interface ConsolidationScenarioResult {
  removedSaaS: string[]
  retainedSaaS: string[]
  grossAnnualSaving: number
  omOperatingCost: number
  netAnnualSaving: number
  implementationCost: number
  /** Infinity when netAnnualSaving <= 0 — never divide by a non-positive net saving. */
  netPaybackMonths: number
}

export interface CatalogCapabilityEntry {
  target: string
  decision: Decision
  confidence: Confidence
}

export interface CatalogEntry {
  capabilities: Record<string, CatalogCapabilityEntry>
}

export type Catalog = Record<string, CatalogEntry>
