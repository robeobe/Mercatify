import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { caseAnswerSchema } from '../../../data/validators'
import { resolveMappingActionContext, MERCATIFY_CASE_RESOURCE_KIND } from '../../mapping-rows/shared'

const logger = createLogger('mercatify')

/**
 * Gated on the client's own feature. The real authorization is the owner check
 * inside `mercatify.cases.answer`: `mercatify.cases.view` gets you to this
 * route, never to somebody else's request.
 */
export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['mercatify.cases.view'] },
}

export async function POST(req: Request) {
  try {
    const context = await resolveMappingActionContext(req)
    const body = await readJsonSafe<Record<string, unknown>>(req, {})
    const input = caseAnswerSchema.parse(body)

    const guarded = await runRouteMutationGuards({
      container: context.ctx.container,
      req,
      auth: { userId: context.userId, tenantId: context.tenantId, organizationId: context.organizationId },
      input: {
        resourceKind: MERCATIFY_CASE_RESOURCE_KIND,
        resourceId: input.caseId,
        operation: 'custom',
        mutationPayload: { ...input },
      },
    })
    if (!guarded.ok) return guarded.response

    const commandBus = context.ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<typeof input, { status: string }>(
      'mercatify.cases.answer',
      { input, ctx: context.ctx },
    )

    await guarded.runAfterSuccess()

    return NextResponse.json({ ok: true, status: result?.status ?? null })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    const { translate } = await resolveTranslations()
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: translate('mercatify.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
    logger.error('mercatify.cases.answer failed', { err })
    return NextResponse.json(
      { error: translate('mercatify.errors.answer_failed', 'Failed to record your answer') },
      { status: 400 },
    )
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Answer a report that was sent to you',
  methods: {
    POST: {
      summary:
        "Records the client's answer to a sent report — `accepted` or `consult` — as the case's status. Only the person who filed the request may call it (403 otherwise), and only once the report has actually been sent (400 otherwise). Re-answering is allowed.",
      requestBody: { contentType: 'application/json', schema: caseAnswerSchema },
      responses: [
        {
          status: 200,
          description: 'Answer recorded',
          schema: z.object({ ok: z.boolean(), status: z.string().nullable() }),
        },
      ],
    },
  },
}
