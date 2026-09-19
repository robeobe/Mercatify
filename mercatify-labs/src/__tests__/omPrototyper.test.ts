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
})
