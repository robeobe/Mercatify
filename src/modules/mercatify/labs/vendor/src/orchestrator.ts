import { mapCapabilities } from './mapCapabilities'
import { computeScenario } from './computeScenario'
import { getAgent, getAgentTools } from './agentLoader'
import { localToolExecutor } from './toolExecutor'
import type { LlmClient } from './llmClient'
import type {
  AuditedProduct,
  Blueprint,
  ConsolidationRequest,
  ConsolidationResult,
  MappingResult,
} from './contract'

export interface OrchestratorOptions {
  /**
   * Omit to run in fully deterministic mode: no agent is invoked, every
   * `stack` entry MUST already carry `capabilities`, and `narrative`/
   * `businessProcess`/`blueprint` are omitted from the result. This is the
   * spec's "fallback demo" path (§2 iron rules) — it never depends on an
   * LLM being available or well-behaved.
   */
  llmClient?: LlmClient
}

/**
 * Runs Mercatify Labs' pipeline end to end: SaaS Auditor → Process Analyst
 * → OM Architect → Consolidation Strategist → FinOps, passing each step's
 * output into the next (§8 of SPEC.md) — this is the "agents communicate
 * with each other" data flow.
 *
 * Deterministic-first by design: `mappings` and `scenario` are ALWAYS
 * computed by this class calling `mapCapabilities`/`computeScenario`
 * directly (iron rules #1/#2, SPEC.md §2) — never by trusting a number an
 * agent's response happened to contain, even when that agent's own job was
 * to call the matching tool. An LLM step that fails, times out, or (as
 * observed with some local models — see SPEC.md §10) skips its required
 * tool call degrades the result to missing *narrative* text, never to a
 * wrong decision or a wrong euro amount.
 */
export class Orchestrator {
  constructor(private readonly options: OrchestratorOptions = {}) {}

  async run(request: ConsolidationRequest): Promise<ConsolidationResult> {
    const auditedStack = await this.audit(request)
    const businessProcess = await this.analyzeProcess(request, auditedStack)
    const mappings = this.mapToTargetPlatform(auditedStack)
    const architectRationale = await this.architect(auditedStack, mappings)
    const blueprint = await this.strategize(mappings, businessProcess)
    const scenario = this.computeSavings(mappings, request)
    const financeSummary = await this.finops(mappings, request, scenario)

    return {
      company: request.company,
      auditedStack,
      ...(businessProcess ? { businessProcess } : {}),
      mappings,
      ...(blueprint ? { blueprint } : {}),
      scenario,
      ...(architectRationale || blueprint?.summary || financeSummary
        ? {
            narrative: {
              ...(architectRationale ? { architectRationale } : {}),
              ...(blueprint?.summary ? { strategistSummary: blueprint.summary } : {}),
              ...(financeSummary ? { financeSummary } : {}),
            },
          }
        : {}),
      generatedAt: new Date().toISOString(),
    }
  }

  // --- Step 1: SaaS Auditor ------------------------------------------------

  private async audit(request: ConsolidationRequest): Promise<AuditedProduct[]> {
    const results: AuditedProduct[] = []
    const needsAudit = request.stack.filter((tool) => !tool.capabilities)

    if (needsAudit.length > 0 && !this.options.llmClient) {
      throw new Error(
        `[mercatify-labs] ${needsAudit.length} tool(s) have no \`capabilities\` and no llmClient was ` +
          `provided to run the SaaS Auditor. Either pass an llmClient, or give every stack entry its ` +
          `\`capabilities\` directly for a fully deterministic run.`,
      )
    }

    for (const tool of request.stack) {
      if (tool.capabilities) {
        results.push({
          name: tool.name,
          capabilities: tool.capabilities.map((c) => ({
            capability: c.capability,
            importance: c.importance ?? 'core',
            usageDescription: c.usageDescription ?? '',
          })),
        })
        continue
      }
      const agent = getAgent('saas_auditor')
      const output = (await this.options.llmClient!.runAgent(
        agent,
        { products: [{ name: tool.name, usageNotes: tool.usageNotes }] },
        getAgentTools(agent),
        localToolExecutor,
      )) as { products: AuditedProduct[] }
      const audited = output.products?.[0]
      if (!audited || !audited.capabilities?.length) {
        throw new Error(`[mercatify-labs] SaaS Auditor returned no capabilities for "${tool.name}".`)
      }
      results.push(audited)
    }
    return results
  }

  // --- Step 2: Process Analyst (optional narrative) ------------------------

  private async analyzeProcess(
    request: ConsolidationRequest,
    auditedStack: AuditedProduct[],
  ): Promise<ConsolidationResult['businessProcess']> {
    if (!this.options.llmClient) return undefined
    try {
      const agent = getAgent('process_analyst')
      const output = (await this.options.llmClient.runAgent(
        agent,
        { hint: request.processHint, products: auditedStack },
        getAgentTools(agent),
        localToolExecutor,
      )) as { name: string; steps: string[]; frequency?: string }
      return output
    } catch {
      // Narrative-only step: a failure here must never break the pipeline.
      return undefined
    }
  }

  // --- Step 3: OM Architect (mapping is ALWAYS deterministic) -------------

  private mapToTargetPlatform(auditedStack: AuditedProduct[]): MappingResult[] {
    const stack = auditedStack.map((product, index) => ({
      id: `product-${index}`,
      name: product.name,
      category: 'Unspecified',
      monthlyCost: 0,
    }))
    const capabilities = auditedStack.flatMap((product, index) =>
      product.capabilities.map((cap, capIndex) => ({
        id: `capability-${index}-${capIndex}`,
        saasProductId: `product-${index}`,
        capability: cap.capability,
        importance: cap.importance,
        usageDescription: cap.usageDescription,
      })),
    )
    return mapCapabilities(stack, capabilities)
  }

  private async architect(auditedStack: AuditedProduct[], mappings: MappingResult[]): Promise<string | undefined> {
    if (!this.options.llmClient) return undefined
    try {
      const agent = getAgent('om_architect')
      const output = (await this.options.llmClient.runAgent(
        agent,
        { products: auditedStack },
        getAgentTools(agent),
        localToolExecutor,
      )) as { rationale?: string }
      // We deliberately ignore `output.mappings` — see the class doc comment.
      void mappings
      return output.rationale
    } catch {
      return undefined
    }
  }

  // --- Step 4: Consolidation Strategist (optional blueprint) --------------

  private async strategize(
    mappings: MappingResult[],
    businessProcess: ConsolidationResult['businessProcess'],
  ): Promise<(Blueprint & { summary?: string }) | undefined> {
    if (!this.options.llmClient) return undefined
    try {
      const agent = getAgent('consolidation_strategist')
      const output = (await this.options.llmClient.runAgent(
        agent,
        { mappings, businessProcessName: businessProcess?.name },
        getAgentTools(agent),
        localToolExecutor,
      )) as Blueprint & { summary?: string }
      return output
    } catch {
      return undefined
    }
  }

  // --- Step 5: FinOps (savings are ALWAYS deterministic) -------------------

  private computeSavings(mappings: MappingResult[], request: ConsolidationRequest) {
    const stack = request.stack.map((tool, index) => ({
      id: `product-${index}`,
      name: tool.name,
      category: tool.category ?? 'Unspecified',
      monthlyCost: tool.monthlyCost,
    }))
    return computeScenario(mappings, stack, request.costs)
  }

  private async finops(
    mappings: MappingResult[],
    request: ConsolidationRequest,
    scenario: ConsolidationResult['scenario'],
  ): Promise<string | undefined> {
    if (!this.options.llmClient) return undefined
    try {
      const agent = getAgent('finops')
      const output = (await this.options.llmClient.runAgent(
        agent,
        {
          omOperatingCost: request.costs.omOperatingCost,
          implementationCost: request.costs.implementationCost,
          mappings,
          stack: request.stack.map((t) => ({ name: t.name, monthlyCost: t.monthlyCost })),
        },
        getAgentTools(agent),
        localToolExecutor,
      )) as { summary?: string }
      // We deliberately ignore `output.scenario` — see the class doc comment.
      void scenario
      return output.summary
    } catch {
      return undefined
    }
  }
}
