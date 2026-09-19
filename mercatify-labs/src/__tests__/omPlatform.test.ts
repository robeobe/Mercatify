/** @jest-environment node */
import { listArchetypes, getArchetype, REQUIRED_INVENTORY_STATES } from '../om/platform'

describe('Open Mercato backend patterns', () => {
  it('ships the four verified archetypes', () => {
    expect(listArchetypes().map((a) => a.archetype).sort()).toEqual([
      'crud-form',
      'data-table',
      'detail-drawer',
      'kanban',
    ])
  })

  it('gives every archetype its required states and anatomy notes', () => {
    for (const spec of listArchetypes()) {
      expect(spec.requiredStates.length).toBeGreaterThan(0)
      expect(spec.anatomyNotes.length).toBeGreaterThan(0)
    }
  })

  it('throws on an unknown archetype and names it', () => {
    expect(() => getArchetype('carousel')).toThrow(/carousel/)
  })

  it('demands the four inventory states the skill step 2 requires', () => {
    expect(REQUIRED_INVENTORY_STATES).toEqual(['first-run', 'empty', 'no-access', 'no-results'])
  })

  it('records the fixed CrudForm footer order - it is a real production constraint', () => {
    const notes = getArchetype('crud-form').anatomyNotes.join(' ')
    expect(notes).toMatch(/additional actions.*Delete.*Cancel.*Save/i)
  })
})
