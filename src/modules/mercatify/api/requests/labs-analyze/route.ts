import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { buildCommandContext } from '../../../lib/requestContext'
import { labsAnalyzeSchema } from '../../../commands/requests'
import type { MercatifyRequest } from '../../../data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['mercatify.requests.manage'] },
}

export async function POST(req: Request) {
  try {
    const body = await readJsonSafe<Record<string, unknown>>(req, {})
    const parsed = labsAnalyzeSchema.parse(body)
    const ctx = await buildCommandContext(req)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<typeof parsed, MercatifyRequest>(
      'mercatify.requests.labsAnalyze',
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
  summary: 'Run an experimental Mercatify Labs analysis (deterministic)',
  methods: {
    POST: {
      summary: 'Analyze with Mercatify Labs — no AI',
      description: 'Runs the vendored mercatify-labs buildReport() with no llmClient: capability matching and the ROI/cash model only, no agent-authored prose. Additive — writes to labsResult, never touches report/overrides/status.',
      requestBody: { contentType: 'application/json', schema: labsAnalyzeSchema },
      responses: [{ status: 200, description: 'Analysis complete', schema: okResponseSchema }],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 404, description: 'Request not found', schema: errorSchema },
        { status: 502, description: 'Mercatify Labs analysis failed', schema: errorSchema },
      ],
    },
  },
}
