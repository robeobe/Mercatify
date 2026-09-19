/** @jest-environment node */
import { getAgent } from '../agentLoader'

describe('agents/migration_planner.json', () => {
  it('declares no tools - it reasons over the mappings it was given', () => {
    const agent = getAgent('migration_planner')
    expect(agent.tools).toEqual([])
    expect(agent.resultKind).toBe('research')
  })

  it('has no field that could carry money - effort is hours only', () => {
    const agent = getAgent('migration_planner')
    const props = (agent.resultSchema as any).properties.items.items.properties
    expect(Object.keys(props).sort()).toEqual([
      'capability',
      'estimatedHours',
      'rationale',
      'sequence',
      'source',
    ])
  })

  it('enforces strict-mode schema compliance for result shape', () => {
    const agent = getAgent('migration_planner')
    const schema = agent.resultSchema as any

    // Root schema strict-mode checks
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required.sort()).toEqual(['items', 'summary'])

    // Item schema strict-mode checks
    const itemSchema = schema.properties.items.items
    expect(itemSchema.additionalProperties).toBe(false)
    expect(itemSchema.required.sort()).toEqual([
      'capability',
      'estimatedHours',
      'rationale',
      'sequence',
      'source',
    ])
  })
})

import { planMigration } from '../migrationPlanner'
import type { LlmClient } from '../llmClient'
import type { AgentDefinition } from '../agentLoader'

const noTools = async () => ({ results: [] })

describe('planMigration', () => {
  it('calls the migration_planner agent with the mappings it was given', async () => {
    const seen: Array<{ id: string; input: any }> = []
    const client: LlmClient = {
      async runAgent(agent: AgentDefinition, input: unknown) {
        seen.push({ id: agent.id, input })
        return {
          items: [
            {
              capability: 'site_survey_tracking',
              source: 'Airtable',
              estimatedHours: 24,
              sequence: 1,
              rationale: 'Core entity everything else hangs off.',
            },
          ],
          summary: 'One build-heavy entity first, then workflows.',
        }
      },
    }

    const result = await planMigration(client, noTools, {
      mappings: [
        {
          capability: 'site_survey_tracking',
          source: 'Airtable',
          targetFeature: 'Custom Entities',
          decision: 'build',
          confidence: 'medium',
          evidence: 'not in catalog',
        },
      ],
    })

    expect(seen[0].id).toBe('migration_planner')
    expect(seen[0].input.mappings).toHaveLength(1)
    expect(result.items[0].estimatedHours).toBe(24)
    expect(result.summary).toContain('workflows')
  })
})
