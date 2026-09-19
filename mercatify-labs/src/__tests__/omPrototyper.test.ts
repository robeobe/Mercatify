/** @jest-environment node */
import { getAgent, getTool } from '../agentLoader'

function assertStrictModeCompatible(node: any, path = 'root'): void {
  if (!node || typeof node !== 'object') return
  if (node.type === 'object') {
    const props = Object.keys(node.properties ?? {})
    expect({ path, additionalProperties: node.additionalProperties }).toEqual({
      path,
      additionalProperties: false,
    })
    expect({ path, required: [...(node.required ?? [])].sort() }).toEqual({
      path,
      required: [...props].sort(),
    })
    for (const key of props) assertStrictModeCompatible(node.properties[key], `${path}.${key}`)
  }
  if (node.type === 'array') assertStrictModeCompatible(node.items, `${path}[]`)
}

describe('agents/om_prototyper.json', () => {
  it('may call exactly one pure tool and nothing else', () => {
    const agent = getAgent('om_prototyper')
    expect(agent.tools).toEqual(['list_om_archetypes'])
    expect(agent.resultKind).toBe('research')
  })

  it('backs that tool with the curated data file, not the network', () => {
    const tool = getTool('list_om_archetypes')
    expect(tool.kind).toBe('pure')
    expect(tool.backedBy).toBe('src/om/platform.ts')
  })

  it('constrains screens to the four verified archetypes', () => {
    const schema = getAgent('om_prototyper').resultSchema as any
    expect(schema.properties.screens.items.properties.archetype.enum.sort()).toEqual([
      'crud-form',
      'data-table',
      'detail-drawer',
      'kanban',
    ])
  })

  it('is strict-mode compatible', () => {
    assertStrictModeCompatible(getAgent('om_prototyper').resultSchema)
  })

  it('requires every screen to cite at least one storyIds entry', () => {
    const schema = getAgent('om_prototyper').resultSchema as any
    expect(schema.properties.screens.items.properties.storyIds.minItems).toBe(1)
  })
})

import { prepareOmRequirements } from '../omPrototyper'
import { renderRequirementsMarkdown, handoffCommand } from '../om/renderRequirements'
import type { LlmClient } from '../llmClient'
import type { AgentDefinition } from '../agentLoader'

const noTools = async () => ({ results: [] })

const requirements = {
  epics: [{ id: 'EP-A', title: 'Take a lead to a signed quote', outcome: 'A priced offer exists.' }],
  stories: [
    {
      id: 'US-A1',
      epicId: 'EP-A',
      role: 'sales rep',
      goal: 'turn a site survey into a quote',
      outcome: 'the customer receives a priced offer',
      acceptanceCriteria: ['Empty state offers to start a survey'],
    },
  ],
  screens: [
    {
      id: 's1',
      name: 'Deals list',
      task: 'Find the deal waiting for a quote.',
      archetype: 'data-table' as const,
      states: ['first-run', 'empty', 'no-access', 'no-results'],
      storyIds: ['US-A1'],
      sectionRefs: ['blueprint.entities.Deal'],
    },
  ],
  openQuestions: ['Who may approve a quote above 50k?'],
  summary: 'One journey, one list screen.',
}

describe('renderRequirementsMarkdown', () => {
  it('emits the two sections the skill looks for', () => {
    const md = renderRequirementsMarkdown(requirements, { name: 'Voltix' })
    expect(md).toContain('## User stories')
    expect(md).toContain('## Screen inventory')
  })

  it('writes each story as role, goal and outcome with its criteria', () => {
    const md = renderRequirementsMarkdown(requirements, { name: 'Voltix' })
    expect(md).toContain('US-A1')
    expect(md).toContain('As a sales rep')
    expect(md).toContain('- Empty state offers to start a survey')
  })

  it('keeps open questions visible instead of resolving them', () => {
    const md = renderRequirementsMarkdown(requirements, { name: 'Voltix' })
    expect(md).toContain('Who may approve a quote above 50k?')
  })
})

describe('handoffCommand', () => {
  it('emits the exact init-mockup command from the skill', () => {
    expect(handoffCommand('voltix-lead-to-quote', '.ai/specs/voltix-requirements.md')).toBe(
      'node .ai/skills/om-mockup-prototype/scripts/init-mockup.mjs "voltix-lead-to-quote" --requirements ".ai/specs/voltix-requirements.md"',
    )
  })

  it('rejects a slug the skill script would refuse anyway', () => {
    expect(() => handoffCommand('Voltix Lead', 'x.md')).toThrow(/slug/i)
  })
})

describe('prepareOmRequirements', () => {
  it('calls om_prototyper and validates what comes back', async () => {
    const seen: string[] = []
    const client: LlmClient = {
      async runAgent(agent: AgentDefinition) {
        seen.push(agent.id)
        return requirements
      },
    }
    const out = await prepareOmRequirements(client, noTools, {
      company: { name: 'Voltix' },
      blueprint: {},
      mappings: [],
    })
    expect(seen).toEqual(['om_prototyper'])
    expect(out.screens[0].archetype).toBe('data-table')
  })

  it('throws when the agent skips acceptance criteria', async () => {
    const client: LlmClient = {
      async runAgent() {
        return { ...requirements, stories: [{ ...requirements.stories[0], acceptanceCriteria: [] }] }
      },
    }
    await expect(
      prepareOmRequirements(client, noTools, { company: {}, blueprint: {}, mappings: [] }),
    ).rejects.toThrow(/acceptanceCriteria/)
  })
})
