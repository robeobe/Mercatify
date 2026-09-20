/** @jest-environment node */
import { Orchestrator } from '../orchestrator'
import type { LlmClient } from '../llmClient'
import type { AgentDefinition, ToolDefinition } from '../agentLoader'
import type { ConsolidationRequest } from '../contract'

const VOLTIX_REQUEST: ConsolidationRequest = {
  company: { name: 'Voltix', industry: 'Solar & Energy Installation', employees: 42, currency: 'EUR' },
  stack: [
    { name: 'HubSpot', monthlyCost: 1600, capabilities: [{ capability: 'contacts', importance: 'core' }, { capability: 'deals', importance: 'core' }] },
    { name: 'PandaDoc', monthlyCost: 350, capabilities: [{ capability: 'quote_documents', importance: 'core' }] },
  ],
  costs: { omOperatingCost: 8400, implementationCost: 12000 },
}

// S3 (TEST-003), część silnikowa: przebieg BEZ ANI JEDNEGO agenta ma dawać
// komplet liczb i mapowań, a nie błąd. Pominięcie sekcji czysto prozatorskich
// broni `renderReport.test.ts` ("bez prozy w ogóle"); brakujące ogniwo -
// `bin/report-cli.ts --no-llm` - powstaje w Fazie 3.
describe('S3: Orchestrator — deterministic mode (no llmClient)', () => {
  it('computes mappings and scenario directly from provided capabilities, with no narrative', async () => {
    const orchestrator = new Orchestrator()
    const result = await orchestrator.run(VOLTIX_REQUEST)

    expect(result.mappings).toHaveLength(3)
    // HubSpot jest native, PandaDoc `quote_documents` -> alias `quotes.cpq` -> `build`.
    // Open Mercato nie ma konfiguratora ofert, wiec generowanie oferty z konfiguracji
    // produktu jest nowym kodem w KAZDYM narzedziu, ktore to robi - werdykt opisuje
    // platforme docelowa, nie narzedzie zrodlowe.
    expect(result.mappings.map((m) => m.decision)).toEqual(['native', 'native', 'build'])
    // Narzedzie i tak gasnie: `build` to praca do wykonania, nie powod, zeby placic dalej.
    expect(result.scenario.removedSaaS).toEqual(['HubSpot', 'PandaDoc'])
    expect(result.scenario.grossAnnualSaving).toBeCloseTo((1600 + 350) * 12, 5)
    expect(result.scenario.netAnnualSaving).toBeCloseTo((1600 + 350) * 12 - 8400, 5)
    expect(result.businessProcess).toBeUndefined()
    expect(result.blueprint).toBeUndefined()
    expect(result.narrative).toBeUndefined()
    expect(result.company).toEqual(VOLTIX_REQUEST.company)
  })

  it('throws a clear error when a tool has no capabilities and no llmClient was given', async () => {
    const orchestrator = new Orchestrator()
    const request: ConsolidationRequest = {
      ...VOLTIX_REQUEST,
      stack: [{ name: 'Airtable', monthlyCost: 250, usageNotes: 'site survey tracking' }],
    }
    await expect(orchestrator.run(request)).rejects.toThrow(/llmClient/)
  })
})

describe('Orchestrator — with agents (fake LlmClient) — agents communicate through real data', () => {
  function fakeLlmClient(): LlmClient {
    return {
      async runAgent(agent: AgentDefinition, input: unknown, _tools: ToolDefinition[]) {
        if (agent.id === 'saas_auditor') {
          const { products } = input as { products: Array<{ name: string }> }
          return {
            products: products.map((p) => ({
              name: p.name,
              capabilities: [{ capability: 'site_survey_tracking', importance: 'core', usageDescription: 'from fake auditor' }],
            })),
          }
        }
        if (agent.id === 'process_analyst') {
          return { name: 'Lead-to-Quote', steps: ['step one', 'step two'] }
        }
        if (agent.id === 'om_architect') {
          // Deliberately returns WRONG mappings to prove the Orchestrator ignores them.
          return { mappings: [], rationale: 'fake architect rationale' }
        }
        if (agent.id === 'consolidation_strategist') {
          return {
            entities: ['Customer'],
            workflows: ['Lead-to-Quote'],
            modules: ['CRM'],
            customScreens: ['Site Survey'],
            integrations: [],
            summary: 'fake strategist summary',
          }
        }
        if (agent.id === 'finops') {
          // Deliberately returns a WRONG scenario to prove the Orchestrator ignores it.
          return { scenario: { netAnnualSaving: 999999999 }, summary: 'fake finance summary' }
        }
        throw new Error(`unexpected agent in test: ${agent.id}`)
      },
    }
  }

  it('feeds the SaaS Auditor output into the mapping step (agent -> deterministic core)', async () => {
    const orchestrator = new Orchestrator({ llmClient: fakeLlmClient() })
    const request: ConsolidationRequest = {
      ...VOLTIX_REQUEST,
      stack: [{ name: 'Airtable', monthlyCost: 250, usageNotes: 'site survey tracking' }],
    }
    const result = await orchestrator.run(request)

    expect(result.auditedStack[0].capabilities[0].capability).toBe('site_survey_tracking')
    // The capability the fake auditor invented flows into a real catalog-backed mapping:
    expect(result.mappings[0]).toMatchObject({ capability: 'site_survey_tracking', source: 'Airtable', decision: 'build' })
  })

  it('carries narrative text from agents but never trusts their numbers', async () => {
    const orchestrator = new Orchestrator({ llmClient: fakeLlmClient() })
    const result = await orchestrator.run(VOLTIX_REQUEST)

    expect(result.narrative?.architectRationale).toBe('fake architect rationale')
    expect(result.narrative?.strategistSummary).toBe('fake strategist summary')
    expect(result.narrative?.financeSummary).toBe('fake finance summary')
    expect(result.businessProcess).toEqual({ name: 'Lead-to-Quote', steps: ['step one', 'step two'] })
    expect(result.blueprint?.modules).toEqual(['CRM'])

    // The numbers are still the REAL deterministic ones, not the fake agent's:
    expect(result.mappings).toHaveLength(3)
    expect(result.mappings.map((m) => m.decision)).toEqual(['native', 'native', 'build'])
    expect(result.scenario.netAnnualSaving).toBeCloseTo((1600 + 350) * 12 - 8400, 5)
    expect(result.scenario.netAnnualSaving).not.toBe(999999999)
  })

  it('degrades to deterministic-only output when an agent step throws', async () => {
    const flaky: LlmClient = {
      async runAgent(agent: AgentDefinition) {
        if (agent.id === 'process_analyst') throw new Error('LLM timed out')
        return fakeLlmClient().runAgent(agent, {}, [], async () => ({}))
      },
    }
    const orchestrator = new Orchestrator({ llmClient: flaky })
    const result = await orchestrator.run(VOLTIX_REQUEST)

    expect(result.businessProcess).toBeUndefined()
    expect(result.mappings).toHaveLength(3)
    expect(result.scenario.netAnnualSaving).toBeCloseTo((1600 + 350) * 12 - 8400, 5)
  })
})
