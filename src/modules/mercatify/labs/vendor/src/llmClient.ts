import type { AgentDefinition, ToolDefinition } from './agentLoader'

export type ToolExecutor = (toolName: string, args: unknown) => Promise<unknown>

/**
 * What the Orchestrator needs from an LLM integration: run one agent to
 * completion — including any tool-call loop — and return its final answer,
 * already parsed as a plain object matching the agent's `resultSchema`.
 *
 * Bring your own implementation to plug in whatever SDK/provider you like
 * (Vercel AI SDK, LangChain, a cloud provider's native client, ...) — the
 * Orchestrator only depends on this interface. `OpenAiCompatibleLlmClient`
 * below is a dependency-free reference implementation over the
 * `/v1/chat/completions` wire format that OpenAI, LM Studio, Ollama, Groq,
 * and most self-hosted servers all speak.
 */
export interface LlmClient {
  runAgent(
    agent: AgentDefinition,
    input: unknown,
    tools: ToolDefinition[],
    executeTool: ToolExecutor,
  ): Promise<unknown>
}

export interface OpenAiCompatibleLlmClientOptions {
  /** e.g. "http://127.0.0.1:1234/v1" (LM Studio) or "https://api.openai.com/v1". MUST include the `/v1` path segment. */
  baseURL: string
  apiKey?: string
  model: string
  /** Safety cap on tool-call round-trips before giving up. Default 6. */
  maxSteps?: number
  /** Per-request timeout in ms. Default 60000. */
  timeoutMs?: number
  /**
   * Explicit `max_tokens` sent on every call. Default 8000.
   *
   * Omitting `max_tokens` entirely makes some providers (OpenRouter observed)
   * default it to the model's own maximum completion length (65536+ tokens
   * for large modern models) and then run a pre-flight "could this account
   * afford the worst case" balance check against that — which 402s low- or
   * modest-balance keys even though the actual completion would cost a
   * fraction of a cent. Sending an explicit, moderate cap avoids that
   * pre-flight rejection while still leaving comfortable room for a full
   * prose section. See `../../README.md` local-patches note.
   */
  maxTokens?: number
}

function toOpenAiToolSpec(tool: ToolDefinition) {
  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}

/**
 * Reference `LlmClient` over the universal `/v1/chat/completions` wire
 * format. No SDK dependency — plain `fetch`. Talks to real OpenAI, LM
 * Studio, Ollama, Groq, and any other OpenAI-compatible endpoint.
 *
 * Two things this implementation deliberately gets right, both found the
 * hard way debugging a local LM Studio integration (see SPEC.md §10):
 *
 * 1. It calls `/chat/completions`, never `/responses` — the newer Responses
 *    API is OpenAI-specific; self-hosted/compatible servers only implement
 *    Chat Completions.
 * 2. Some "thinking" models (e.g. certain Qwen3 builds served by LM Studio)
 *    put their entire final answer in `reasoning_content` and leave `content`
 *    empty, even when explicitly asked for structured JSON output. This
 *    client falls back to `reasoning_content` whenever `content` is empty,
 *    rather than treating an empty string as a hard failure.
 */
export class OpenAiCompatibleLlmClient implements LlmClient {
  constructor(private readonly options: OpenAiCompatibleLlmClientOptions) {}

  async runAgent(
    agent: AgentDefinition,
    input: unknown,
    tools: ToolDefinition[],
    executeTool: ToolExecutor,
  ): Promise<unknown> {
    const maxSteps = this.options.maxSteps ?? 6
    const messages: ChatMessage[] = [
      { role: 'system', content: agent.instructions },
      { role: 'user', content: JSON.stringify(input) },
    ]

    for (let step = 0; step < maxSteps; step++) {
      const message = await this.callOnce(agent, messages, tools)

      if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push(message)
        for (const call of message.tool_calls) {
          let args: unknown = {}
          try {
            args = JSON.parse(call.function.arguments || '{}')
          } catch {
            // Malformed arguments from the model — hand the tool an empty
            // object rather than crashing the whole run; most tools will
            // reject it with a clear validation error the model can react to.
          }
          let result: unknown
          try {
            result = await executeTool(call.function.name, args)
          } catch (err) {
            result = { error: err instanceof Error ? err.message : String(err) }
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
        }
        continue
      }

      const raw = message.content && message.content.trim().length > 0
        ? message.content
        : (message as unknown as { reasoning_content?: string }).reasoning_content

      if (!raw) {
        throw new Error(
          `[mercatify-labs] Agent "${agent.id}" returned no content and no reasoning_content on step ${step}.`,
        )
      }
      return parseJsonLoosely(raw, agent.id)
    }

    throw new Error(`[mercatify-labs] Agent "${agent.id}" did not produce a final answer within ${maxSteps} steps.`)
  }

  private async callOnce(
    agent: AgentDefinition,
    messages: ChatMessage[],
    tools: ToolDefinition[],
  ): Promise<ChatMessage & { reasoning_content?: string }> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 60000)
    try {
      const response = await fetch(`${this.options.baseURL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.options.model,
          messages,
          max_tokens: this.options.maxTokens ?? 8000,
          ...(tools.length > 0 ? { tools: tools.map(toOpenAiToolSpec), tool_choice: 'auto' } : {}),
          // PATCH (not upstream): `strict: true` — see vendor/README.md. 7 of
          // the 14 agent result schemas (saas_auditor, process_analyst,
          // om_architect, finops, consolidation_strategist, catalog_curator)
          // are missing `additionalProperties: false` and/or a `required`
          // array covering every declared property, both mandatory under
          // OpenAI's strict structured-output mode. A model that enforces
          // strict validation (observed: openai/gpt-5.6-luna) then 400s on
          // every one of those agents before generating anything, while a
          // more lenient model (observed: openai/gpt-4o-mini) silently
          // tolerates it. `strict: false` still sends the schema as a
          // best-effort guide — this app's degradation handling (each
          // narrative step's own try/catch) already covers a response that
          // does not perfectly match it.
          response_format: {
            type: 'json_schema',
            json_schema: { name: agent.id.replace(/\W+/g, '_'), strict: false, schema: agent.resultSchema },
          },
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`[mercatify-labs] LLM call failed (${response.status}): ${body.slice(0, 500)}`)
      }
      const json = (await response.json()) as {
        choices: Array<{ message: ChatMessage & { reasoning_content?: string } }>
      }
      const message = json.choices?.[0]?.message
      if (!message) throw new Error('[mercatify-labs] LLM response had no choices[0].message')
      return message
    } finally {
      clearTimeout(timeout)
    }
  }
}

function parseJsonLoosely(raw: string, agentId: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    // Some models wrap JSON in a ```json fence despite instructions not to.
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced) {
      try {
        return JSON.parse(fenced[1])
      } catch {
        // fall through to the error below
      }
    }
    throw new Error(`[mercatify-labs] Agent "${agentId}" returned content that is not valid JSON: ${raw.slice(0, 300)}`)
  }
}
