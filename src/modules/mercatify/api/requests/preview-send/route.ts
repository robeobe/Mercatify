import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { CrudHttpError, isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { buildCommandContext } from '../../../lib/requestContext'
import { sendWorkspacePreviewSchema } from '../../../commands/requests'
import type { MercatifyRequest } from '../../../data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['mercatify.requests.manage'] },
}

export async function POST(req: Request) {
  try {
    const body = await readJsonSafe<Record<string, unknown>>(req, {})
    const parsed = sendWorkspacePreviewSchema.parse(body)
    const ctx = await buildCommandContext(req)
    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<typeof parsed, MercatifyRequest>(
      'mercatify.requests.sendWorkspacePreview',
      { input: parsed, ctx },
    )
    return NextResponse.json({ ok: true, workspacePreview: result.workspacePreview, updatedAt: result.updatedAt })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const previewSchema = z.object({ builtAt: z.string(), sentAt: z.string().nullable(), html: z.string(), moduleIds: z.array(z.string()) })
const okResponseSchema = z.object({ ok: z.literal(true), workspacePreview: previewSchema, updatedAt: z.string().nullable().optional() })
const errorSchema = z.object({ error: z.string() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Send an already-built workspace preview to the client',
  methods: {
    POST: {
      summary: 'Send workspace preview',
      description: 'Stamps the already-built workspace preview as sent — it then appears on the client\'s own report page. Requires a preview to already exist for this request.',
      requestBody: { contentType: 'application/json', schema: sendWorkspacePreviewSchema },
      responses: [{ status: 200, description: 'Preview sent', schema: okResponseSchema }],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 404, description: 'Request not found', schema: errorSchema },
        { status: 409, description: 'No preview has been built yet', schema: errorSchema },
      ],
    },
  },
}
