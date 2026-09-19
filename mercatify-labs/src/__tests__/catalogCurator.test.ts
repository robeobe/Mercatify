/** @jest-environment node */
import { proposeCatalogEntry } from '../catalogCurator'
import { createToolExecutor } from '../toolExecutor'
import type { LlmClient } from '../llmClient'
import type { AgentDefinition } from '../agentLoader'

describe('proposeCatalogEntry', () => {
  it('calls the catalog_curator agent with the given input and returns its result', async () => {
    const seenCalls: Array<{ agentId: string; input: unknown }> = []
    const fakeLlmClient: LlmClient = {
      async runAgent(agent: AgentDefinition, input: unknown) {
        seenCalls.push({ agentId: agent.id, input })
        return {
          toolName: 'Notion',
          capability: 'knowledge_base',
          findings: [{ signal: 'pricing', detail: 'Free plan available', sourceUrl: 'https://notion.so/pricing' }],
          suggestedTarget: 'Documents',
          suggestedDecision: 'configure',
          suggestedConfidence: 'medium',
          evidence: 'Notion is a documents/wiki tool; the platform has a comparable Documents module.',
        }
      },
    }
    const fakeToolExecutor = async () => ({ results: [] })

    const result = await proposeCatalogEntry(fakeLlmClient, fakeToolExecutor, {
      toolName: 'Notion',
      capability: 'knowledge_base',
      platformCapabilities: ['CRM', 'Documents'],
    })

    expect(seenCalls).toHaveLength(1)
    expect(seenCalls[0].agentId).toBe('catalog_curator')
    expect(seenCalls[0].input).toMatchObject({ toolName: 'Notion', capability: 'knowledge_base' })
    expect(result.suggestedDecision).toBe('configure')
    expect(result.findings[0].sourceUrl).toBe('https://notion.so/pricing')
  })
})

describe('createToolExecutor — web_search', () => {
  it('throws a clear error when no Firecrawl key is configured', async () => {
    const executor = createToolExecutor({})
    await expect(executor('web_search', { query: 'Notion pricing' })).rejects.toThrow(/FIRECRAWL_API_KEY/)
  })

  it('still executes the 3 pure tools normally', async () => {
    const executor = createToolExecutor({ firecrawlApiKey: 'unused-in-this-test' })
    const output = (await executor('list_catalog_capabilities', { toolName: 'HubSpot' })) as { capabilities: string[] }
    expect(output.capabilities).toContain('contacts')
  })
})
