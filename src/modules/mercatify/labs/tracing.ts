import type { LlmClient, ToolExecutor } from './vendor/src/llmClient'
import type { AgentDefinition } from './vendor/src/agentLoader'

export type LabsTraceToolCall = {
  tool: string
  argsPreview: string
  resultPreview?: string
  error?: string
}

export type LabsTraceStep = {
  seq: number
  agentId: string
  agentLabel: string
  agentRole: string
  status: 'running' | 'done' | 'error'
  startedAt: string
  finishedAt?: string
  durationMs?: number
  inputPreview: string
  outputPreview?: string
  error?: string
  toolCalls: LabsTraceToolCall[]
}

export type LabsTraceSink = (step: LabsTraceStep) => void

function preview(value: unknown, max = 400): string {
  let text: string
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    text = String(value)
  }
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Wraps a real `LlmClient` so every `runAgent()` call — the only seam every
 * agent in this pipeline goes through, orchestrator-internal or
 * buildReport-top-level alike — emits a "running" step immediately and a
 * "done"/"error" step when it settles. Also wraps the `executeTool` callback
 * the caller passes in, so a tool call an agent makes mid-turn shows up
 * nested under that agent's step. Purely additive: does not touch vendored
 * code, has no effect on what the agent actually does or returns.
 */
export function createTracingLlmClient(inner: LlmClient, sink: LabsTraceSink): LlmClient {
  let seq = 0
  return {
    async runAgent(agent: AgentDefinition, input: unknown, tools, executeTool: ToolExecutor) {
      const mySeq = seq++
      const startedAtMs = Date.now()
      const startedAt = new Date(startedAtMs).toISOString()
      const toolCalls: LabsTraceToolCall[] = []
      const tracedExecutor: ToolExecutor = async (toolName, args) => {
        const entry: LabsTraceToolCall = { tool: toolName, argsPreview: preview(args) }
        toolCalls.push(entry)
        try {
          const result = await executeTool(toolName, args)
          entry.resultPreview = preview(result)
          return result
        } catch (err) {
          entry.error = messageOf(err)
          throw err
        }
      }
      sink({
        seq: mySeq,
        agentId: agent.id,
        agentLabel: agent.label,
        agentRole: agent.role,
        status: 'running',
        startedAt,
        inputPreview: preview(input),
        toolCalls,
      })
      try {
        const output = await inner.runAgent(agent, input, tools, tracedExecutor)
        sink({
          seq: mySeq,
          agentId: agent.id,
          agentLabel: agent.label,
          agentRole: agent.role,
          status: 'done',
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAtMs,
          inputPreview: preview(input),
          outputPreview: preview(output),
          toolCalls,
        })
        return output
      } catch (err) {
        sink({
          seq: mySeq,
          agentId: agent.id,
          agentLabel: agent.label,
          agentRole: agent.role,
          status: 'error',
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAtMs,
          inputPreview: preview(input),
          error: messageOf(err),
          toolCalls,
        })
        throw err
      }
    },
  }
}

/** A single measured step for the no-LLM path, where there are no agents to trace. */
export function deterministicStep(durationMs: number): LabsTraceStep {
  const finishedAt = new Date().toISOString()
  return {
    seq: 0,
    agentId: 'deterministic_core',
    agentLabel: 'Deterministic engine',
    agentRole: 'Capability matching + ROI (no LLM involved)',
    status: 'done',
    startedAt: new Date(Date.now() - durationMs).toISOString(),
    finishedAt,
    durationMs,
    inputPreview: 'Stack submitted through the intake form',
    outputPreview: 'Capability mapping, coverage table, and cash model',
    toolCalls: [],
  }
}
