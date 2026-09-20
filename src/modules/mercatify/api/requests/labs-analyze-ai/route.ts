import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { buildCommandContext } from '../../../lib/requestContext'
import { labsAnalyzeWithAiSchema } from '../../../commands/requests'
import type { MercatifyRequest } from '../../../data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['mercatify.requests.manage'] },
}

export async function POST(req: Request) {
  try {
    const body = await readJsonSafe<Record<string, unknown>>(req, {})
    const parsed = labsAnalyzeWithAiSchema.parse(body)
    const ctx = await buildCommandContext(req)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<typeof parsed, MercatifyRequest>(
      'mercatify.requests.labsAnalyzeWithAi',
      { input: parsed, ctx },
    )
    return NextResponse.json({ ok: true, labsResult: result.labsResult, updatedAt: result.updatedAt })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const okResponseSchema = z.object({ ok: z.literal(true), labsResult: z.unknown(), updatedAt: z.string().nullable().optional() })
const errorSchema = z.object({ error: z.string() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Run an experimental Mercatify Labs analysis (with AI prose)',
  methods: {
    POST: {
      summary: 'Analyze with Mercatify Labs — with AI',
      description: 'Same deterministic core as labs-analyze, plus agent-authored prose via an OpenRouter-compatible chat-completions endpoint. The API key is optional (temporary demo/dev fallback to the server\'s OPENROUTER_API_KEY when omitted) and, whichever way it is supplied, is never persisted server-side or written to the audit log.',
      requestBody: { contentType: 'application/json', schema: labsAnalyzeWithAiSchema },
      responses: [{ status: 200, description: 'Analysis complete', schema: okResponseSchema }],
      errors: [
        { status: 400, description: 'Validation failed, or no key supplied and none configured on the server', schema: errorSchema },
        { status: 404, description: 'Request not found', schema: errorSchema },
        { status: 502, description: 'Mercatify Labs AI analysis failed (bad key, bad model, provider error)', schema: errorSchema },
      ],
    },
  },
}
