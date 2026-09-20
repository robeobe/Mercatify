import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getTrackedRun } from '../../../labs/runTracker'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['mercatify.requests.manage'] },
}

const querySchema = z.object({ runId: z.string().uuid() })

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({ runId: url.searchParams.get('runId') })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
  }
  const run = getTrackedRun(parsed.data.runId)
  if (!run) return NextResponse.json({ status: 'unknown', mode: null, steps: [] })
  return NextResponse.json(run)
}

const traceStepSchema = z.object({
  seq: z.number(),
  agentId: z.string(),
  agentLabel: z.string(),
  agentRole: z.string(),
  status: z.enum(['running', 'done', 'error']),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  durationMs: z.number().optional(),
  inputPreview: z.string(),
  outputPreview: z.string().optional(),
  error: z.string().optional(),
  toolCalls: z.array(z.object({
    tool: z.string(),
    argsPreview: z.string(),
    resultPreview: z.string().optional(),
    error: z.string().optional(),
  })),
})

const okResponseSchema = z.object({
  status: z.enum(['unknown', 'running', 'done', 'error']),
  mode: z.enum(['deterministic', 'ai']).nullable(),
  steps: z.array(traceStepSchema),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Poll the live step-by-step trace of an in-flight Mercatify Labs run',
  methods: {
    GET: {
      summary: 'Poll a Mercatify Labs run by client-generated runId',
      description: 'In-memory, single-process progress feed for the console\'s live agent-trace view. A runId this process has never seen (not started, or already cleaned up after its TTL) returns status "unknown" with an empty step list — the caller should keep polling only while a request is actually in flight.',
      query: querySchema,
      responses: [{ status: 200, description: 'Current snapshot of the run', schema: okResponseSchema }],
      errors: [{ status: 400, description: 'Validation failed', schema: z.object({ error: z.string() }) }],
    },
  },
}
