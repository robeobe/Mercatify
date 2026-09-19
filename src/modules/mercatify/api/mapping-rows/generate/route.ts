import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { mappingGenerateSchema } from '../../../data/validators'
import type { MappingRow } from '../../../data/entities'
import { resolveMappingActionContext, MERCATIFY_CASE_RESOURCE_KIND } from '../shared'

const logger = createLogger('mercatify')

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['mercatify.mapping.manage'] },
}

export async function POST(req: Request) {
  try {
    const context = await resolveMappingActionContext(req)
    const body = await readJsonSafe<Record<string, unknown>>(req, {})
    const input = mappingGenerateSchema.parse(body)

    const guarded = await runRouteMutationGuards({
      container: context.ctx.container,
      req,
      auth: { userId: context.userId, tenantId: context.tenantId, organizationId: context.organizationId },
      input: { resourceKind: MERCATIFY_CASE_RESOURCE_KIND, resourceId: input.caseId, operation: 'custom', mutationPayload: { ...input } },
    })
    if (!guarded.ok) return guarded.response

    const commandBus = context.ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<typeof input, { generated: boolean; rows: MappingRow[] }>(
      'mercatify.mapping.generate',
      { input, ctx: context.ctx },
    )

    await guarded.runAfterSuccess()

    return NextResponse.json({ generated: result?.generated ?? false, rowCount: result?.rows.length ?? 0 })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    const { translate } = await resolveTranslations()
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: translate('mercatify.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
    logger.error('mercatify.mapping.generate.post failed', { err })
    return NextResponse.json({ error: translate('mercatify.errors.generate_failed', 'Failed to generate mapping') }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Generate capability mapping',
  methods: {
    POST: {
      summary: 'Materializes the analysis mapping for a case, once. No-op if rows already exist.',
      requestBody: { contentType: 'application/json', schema: mappingGenerateSchema },
      responses: [
        {
          status: 200,
          description: 'Mapping generated (or already present)',
          schema: z.object({ generated: z.boolean(), rowCount: z.number() }),
        },
      ],
    },
  },
}
