import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export interface ToolDefinition {
  name: string
  kind: 'pure' | 'host'
  backedBy: string | null
  description: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
}

export interface AgentDefinition {
  id: string
  label: string
  role: string
  description: string
  resultKind: 'research' | 'proposal'
  tools: string[]
  instructions: string
  resultSchema: Record<string, unknown>
  sampleInput: unknown
}

// agents/ and tools/ live at the package root, one level up from both src/
// (ts-jest, ts-node) and dist/ (compiled output) — so this resolves the same
// way regardless of how the package is run.
const PACKAGE_ROOT = join(__dirname, '..')

function loadJsonDir<T>(dirName: string): Map<string, T> {
  const dir = join(PACKAGE_ROOT, dirName)
  const map = new Map<string, T>()
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    const raw = readFileSync(join(dir, file), 'utf8')
    const parsed = JSON.parse(raw) as T & { name?: string; id?: string }
    const key = (parsed as { id?: string }).id ?? (parsed as { name?: string }).name ?? file.replace(/\.json$/, '')
    map.set(key, parsed)
  }
  return map
}

let agentCache: Map<string, AgentDefinition> | null = null
let toolCache: Map<string, ToolDefinition> | null = null

export function loadAgents(): Map<string, AgentDefinition> {
  if (!agentCache) agentCache = loadJsonDir<AgentDefinition>('agents')
  return agentCache
}

export function loadTools(): Map<string, ToolDefinition> {
  if (!toolCache) toolCache = loadJsonDir<ToolDefinition>('tools')
  return toolCache
}

export function getAgent(id: string): AgentDefinition {
  const agent = loadAgents().get(id)
  if (!agent) throw new Error(`[mercatify-labs] Unknown agent id: ${id}`)
  return agent
}

export function getTool(name: string): ToolDefinition {
  const tool = loadTools().get(name)
  if (!tool) throw new Error(`[mercatify-labs] Unknown tool name: ${name}`)
  return tool
}

/** Resolve an agent's declared tool names to their full definitions. */
export function getAgentTools(agent: AgentDefinition): ToolDefinition[] {
  return agent.tools.map(getTool)
}
