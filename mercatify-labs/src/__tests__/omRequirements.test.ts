/** @jest-environment node */
import { validateOmRequirements } from '../om/validateRequirements'

const story = (over: Record<string, unknown> = {}) => ({
  id: 'US-A1',
  epicId: 'EP-A',
  role: 'sales rep',
  goal: 'turn a site survey into a quote',
  outcome: 'the customer receives a priced offer',
  acceptanceCriteria: ['Empty state offers to start a survey', 'No-access hides the price column'],
  ...over,
})

const screen = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'Deals list',
  task: 'Find the deal waiting for a quote.',
  archetype: 'data-table',
  states: ['empty', 'no-results', 'no-access', 'loading'],
  storyIds: ['US-A1'],
  sectionRefs: ['blueprint.entities.Deal'],
  ...over,
})

const ok = (over: Record<string, unknown> = {}) => ({
  epics: [{ id: 'EP-A', title: 'Take a lead to a signed quote', outcome: 'A priced offer exists.' }],
  stories: [story()],
  screens: [
    screen(),
    screen({ id: 's2', name: 'Deal form', archetype: 'crud-form', states: ['create', 'edit'] }),
    screen({ id: 's3', name: 'First run', states: ['first-run', 'empty'] }),
  ],
  openQuestions: [],
  summary: 'Three screens covering one journey.',
  ...over,
})

describe('validateOmRequirements', () => {
  it('passes a complete requirements set through', () => {
    expect(validateOmRequirements(ok())).toEqual(ok())
  })

  it('rejects a non-object', () => {
    expect(() => validateOmRequirements(null)).toThrow(/object/)
  })

  it('rejects a story with no acceptance criteria', () => {
    const bad = ok({ stories: [story({ acceptanceCriteria: [] })] })
    expect(() => validateOmRequirements(bad)).toThrow(/stories\[0\].acceptanceCriteria/)
  })

  it('rejects a story pointing at an epic that does not exist', () => {
    const bad = ok({ stories: [story({ epicId: 'EP-Z' })] })
    expect(() => validateOmRequirements(bad)).toThrow(/EP-Z/)
  })

  it('rejects a screen citing a story that does not exist', () => {
    const bad = ok({ screens: [screen({ storyIds: ['US-Z9'] })] })
    expect(() => validateOmRequirements(bad)).toThrow(/US-Z9/)
  })

  it('rejects a screen with no section reference', () => {
    const bad = ok({ screens: [screen({ sectionRefs: [] })] })
    expect(() => validateOmRequirements(bad)).toThrow(/screens\[0\].sectionRefs/)
  })

  it('rejects an inventory missing one of the four required states', () => {
    const bad = ok({
      screens: [screen({ states: ['empty', 'no-results', 'no-access', 'loading'] })],
    })
    expect(() => validateOmRequirements(bad)).toThrow(/first-run/)
  })

  it('rejects a state the screen archetype does not define', () => {
    const bad = ok({ screens: [screen({ states: ['drag-in-progress'] })] })
    expect(() => validateOmRequirements(bad)).toThrow(/drag-in-progress/)
  })

  it('rejects a duplicate screen id - comment anchors depend on it', () => {
    const bad = ok({ screens: [screen(), screen()] })
    expect(() => validateOmRequirements(bad)).toThrow(/duplicate/i)
  })
})
