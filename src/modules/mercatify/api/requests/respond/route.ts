import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { buildCommandContext } from '../../../lib/requestContext'
import { respondSchema } from '../../../commands/requests'
import type { MercatifyRequest } from '../../../data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['mercatify.requests.submit'] },
}

export async function POST(req: Request) {
  try {
    const body = await readJsonSafe<Record<string, unknown>>(req, {})
    const parsed = respondSchema.parse(body)
    const ctx = await buildCommandContext(req)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<typeof parsed, MercatifyRequest>(
      'mercatify.requests.respond',
      { input: parsed, ctx },
    )
    return NextResponse.json({ ok: true, status: result.status, updatedAt: result.updatedAt })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const okResponseSchema = z.object({ ok: z.literal(true), status: z.string(), updatedAt: z.string().nullable().optional() })
const errorSchema = z.object({ error: z.string() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Respond to a sent report',
  methods: {
    POST: {
      summary: 'Accept the plan, or ask to talk to someone first',
      description: 'Requires a report to have been sent (sentAt set). Records the client\'s answer and moves the status to accepted or consult.',
      requestBody: { contentType: 'application/json', schema: respondSchema },
      responses: [{ status: 200, description: 'Response recorded', schema: okResponseSchema }],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 404, description: 'Request not found', schema: errorSchema },
        { status: 409, description: 'No report to respond to yet, or stale version', schema: errorSchema },
      ],
    },
  },
}
