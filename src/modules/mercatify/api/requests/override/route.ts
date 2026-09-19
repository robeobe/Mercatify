import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { buildCommandContext } from '../../../lib/requestContext'
import { setCapOverrideSchema } from '../../../commands/requests'
import type { MercatifyRequest } from '../../../data/entities'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['mercatify.requests.manage'] },
}

export async function PUT(req: Request) {
  try {
    const body = await readJsonSafe<Record<string, unknown>>(req, {})
    const parsed = setCapOverrideSchema.parse(body)
    const ctx = await buildCommandContext(req)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<typeof parsed, MercatifyRequest>(
      'mercatify.requests.setCapOverride',
      { input: parsed, ctx },
    )
    return NextResponse.json({ ok: true, updatedAt: result.updatedAt })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const okResponseSchema = z.object({ ok: z.literal(true), updatedAt: z.string().nullable().optional() })
const errorSchema = z.object({ error: z.string() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Override a capability mapping row',
  methods: {
    PUT: {
      summary: 'Set or clear a consultant override for one capability',
      description: 'Patches (or, with patch: null, clears) the module/status/confidence/note a consultant recorded over the automatic lookup. Only allowed while the mapping is open (new/mapping).',
      requestBody: { contentType: 'application/json', schema: setCapOverrideSchema },
      responses: [{ status: 200, description: 'Override applied', schema: okResponseSchema }],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 404, description: 'Request not found', schema: errorSchema },
        { status: 409, description: 'Stale version', schema: errorSchema },
      ],
    },
  },
}
