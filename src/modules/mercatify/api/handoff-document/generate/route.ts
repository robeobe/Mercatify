import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { handoffDocumentGenerateSchema } from '../../../data/validators'
import { resolveMappingActionContext, MERCATIFY_CASE_RESOURCE_KIND } from '../../mapping-rows/shared'

const logger = createLogger('mercatify')

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['mercatify.handoff.manage'] },
}

export async function POST(req: Request) {
  try {
    const context = await resolveMappingActionContext(req)
    const body = await readJsonSafe<Record<string, unknown>>(req, {})
    const input = handoffDocumentGenerateSchema.parse(body)

    const guarded = await runRouteMutationGuards({
      container: context.ctx.container,
      req,
      auth: { userId: context.userId, tenantId: context.tenantId, organizationId: context.organizationId },
      input: { resourceKind: MERCATIFY_CASE_RESOURCE_KIND, resourceId: input.caseId, operation: 'custom', mutationPayload: { ...input } },
    })
    if (!guarded.ok) return guarded.response

    const commandBus = context.ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<typeof input, { generated: boolean; handoffDocument: string | null }>(
      'mercatify.handoff.generate',
      { input, ctx: context.ctx },
    )

    await guarded.runAfterSuccess()

    return NextResponse.json({ generated: result?.generated ?? false, handoffDocument: result?.handoffDocument ?? null })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    const { translate } = await resolveTranslations()
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: translate('mercatify.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
    logger.error('mercatify.handoff.generate.post failed', { err })
    return NextResponse.json({ error: translate('mercatify.errors.handoff_generate_failed', 'Failed to generate the handoff document') }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Generate handoff document',
  methods: {
    POST: {
      summary: 'Seeds the handoff document from the confirmed mapping, once. 400s if the mapping is not confirmed. No-op if already generated.',
      requestBody: { contentType: 'application/json', schema: handoffDocumentGenerateSchema },
      responses: [
        {
          status: 200,
          description: 'Handoff document generated (or already present)',
          schema: z.object({ generated: z.boolean(), handoffDocument: z.string().nullable() }),
        },
      ],
    },
  },
}
