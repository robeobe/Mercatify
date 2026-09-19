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
