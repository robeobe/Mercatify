import type { Confidence, Decision } from './types'

/**
 * The INPUT CONTRACT — what a client submits for analysis. This is the only
 * shape the rest of the package (and any host application) needs to agree on
 * to run the whole pipeline.
 *
 * Two ways to describe a tool: give `usageNotes` (free text) and let the
 * SaaS Auditor agent classify it into capabilities, or give `capabilities`
 * directly and skip that step for that tool (useful when the host already
 * has structured data, or when running with no LLM at all).
 */
export interface SaaSToolSubmission {
  name: string
  category?: string
  monthlyCost: number
  seatCount?: number
  /** Free-text description of what the client uses this tool for. */
  usageNotes?: string
  /** Pre-classified capabilities. When given, skips the SaaS Auditor step for this tool. */
  capabilities?: Array<{
    capability: string
    importance?: 'core' | 'nice'
    usageDescription?: string
  }>
}

export interface ConsolidationRequest {
  company: {
    name: string
    industry: string
    employees: number
    currency: string
  }
  /** The client's current SaaS stack — the live specification (see SPEC.md §1). */
  stack: SaaSToolSubmission[]
  /** Customer-provided costs. Never invented by an agent (iron rule #2). */
  costs: {
    omOperatingCost: number
    implementationCost: number
  }
  /** Optional hint for the Process Analyst, e.g. "lead to quote". */
  processHint?: string
  /** Optional scenario label, defaults to "Baseline". */
  scenarioLabel?: string
}

export interface AuditedProduct {
  name: string
  capabilities: Array<{
    capability: string
    importance: 'core' | 'nice'
    usageDescription: string
  }>
}

export interface MappingResult {
  capability: string
  source: string
  targetFeature: string
  decision: Decision
  confidence: Confidence
  evidence: string
}

export interface ScenarioResult {
  removedSaaS: string[]
  retainedSaaS: string[]
  grossAnnualSaving: number
  omOperatingCost: number
  netAnnualSaving: number
  implementationCost: number
  netPaybackMonths: number
}

export interface Blueprint {
  entities: string[]
  workflows: string[]
  modules: string[]
  customScreens: string[]
  integrations: string[]
}

/**
 * The OUTPUT CONTRACT — the single JSON result Mercatify Labs produces for
 * one consolidation request. Every number in `scenario` and every decision in
 * `mappings` was computed by the deterministic core (src/mapCapabilities.ts,
 * src/computeScenario.ts) — never by an LLM. The `narrative` fields are the
 * only LLM-authored text, and are always optional: the whole result is valid
 * (and the numbers are identical) whether or not any agent ran at all.
 */
export interface ConsolidationResult {
  company: ConsolidationRequest['company']
  auditedStack: AuditedProduct[]
  businessProcess?: { name: string; steps: string[]; frequency?: string }
  mappings: MappingResult[]
  blueprint?: Blueprint
  scenario: ScenarioResult
  narrative?: {
    /** From the OM Architect proposal — omitted when it ran with no LLM. */
    architectRationale?: string
    /** From the Consolidation Strategist — omitted when it ran with no LLM. */
    strategistSummary?: string
    /** From FinOps — omitted when it ran with no LLM. */
    financeSummary?: string
  }
  generatedAt: string
}
