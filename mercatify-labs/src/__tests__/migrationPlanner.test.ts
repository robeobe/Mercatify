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
})
