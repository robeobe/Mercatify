import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { buildCommandContext } from '../../../lib/requestContext'
import { saveReportSchema } from '../../../commands/requests'
import type { MercatifyRequest } from '../../../data/entities'

export const metadata = {
  // PUT saves a draft; POST sends it to the client — same body shape, different commands.
  PUT: { requireAuth: true, requireFeatures: ['mercatify.requests.manage'] },
  POST: { requireAuth: true, requireFeatures: ['mercatify.requests.manage'] },
}

async function run(req: Request, commandId: 'mercatify.requests.saveReport' | 'mercatify.requests.sendReport') {
  try {
    const body = await readJsonSafe<Record<string, unknown>>(req, {})
    const parsed = saveReportSchema.parse(body)
    const ctx = await buildCommandContext(req)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<typeof parsed, MercatifyRequest>(commandId, { input: parsed, ctx })
    return NextResponse.json({ ok: true, status: result.status, updatedAt: result.updatedAt })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  return run(req, 'mercatify.requests.saveReport')
}

export async function POST(req: Request) {
  return run(req, 'mercatify.requests.sendReport')
}

const okResponseSchema = z.object({ ok: z.literal(true), status: z.string(), updatedAt: z.string().nullable().optional() })
const errorSchema = z.object({ error: z.string() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Save or send the consultant report',
  methods: {
    PUT: {
      summary: 'Save the report draft',
      description: 'Persists the headline/notes/assumptions. Bumps a `new` request to `mapping`.',
      requestBody: { contentType: 'application/json', schema: saveReportSchema },
      responses: [{ status: 200, description: 'Draft saved', schema: okResponseSchema }],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 404, description: 'Request not found', schema: errorSchema },
        { status: 409, description: 'Stale version', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Send the report to the client',
      description: 'Requires the mapping to be confirmed (status mapped or later). Sets sentAt and status=sent.',
      requestBody: { contentType: 'application/json', schema: saveReportSchema },
      responses: [{ status: 200, description: 'Report sent', schema: okResponseSchema }],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 404, description: 'Request not found', schema: errorSchema },
        { status: 409, description: 'Mapping not confirmed yet, or stale version', schema: errorSchema },
      ],
    },
  },
}
