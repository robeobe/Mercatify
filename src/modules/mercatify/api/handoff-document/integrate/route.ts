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

type IntegrateResult = { id: string; status: string; document: string; at: string }

/**
 * Hands an accepted case's `.md` to Mercatify Lab on demand — the console's
 * "Integrate with Mercatify Lab" button. Every Lab outcome (delivered, not
 * installed, failed) comes back as a 200 with a status, never as an error:
 * "Lab is not installed" is a first-class result, not a fault.
 */
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
    const { result } = await commandBus.execute<typeof input, IntegrateResult>(
      'mercatify.handoff.integrate',
      { input, ctx: context.ctx },
    )

    await guarded.runAfterSuccess()

    return NextResponse.json({
      status: result?.status ?? null,
      document: result?.document ?? null,
      at: result?.at ?? null,
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    const { translate } = await resolveTranslations()
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: translate('mercatify.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
    logger.error('mercatify.handoff.integrate.post failed', { err })
    return NextResponse.json(
      { error: translate('mercatify.errors.handoff_integrate_failed', 'Failed to hand the case over to Mercatify Lab') },
      { status: 400 },
    )
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Hand the case over to Mercatify Lab',
  methods: {
    POST: {
      summary:
        "Hands the case's handoff document to Mercatify Lab, regenerating it first when empty, and records the outcome. 400s unless the client has accepted the report. \"Lab is not installed\" is returned as a status, not an error.",
      requestBody: { contentType: 'application/json', schema: handoffDocumentGenerateSchema },
      responses: [
        {
          status: 200,
          description: 'Handover attempted; the outcome is in `status`',
          schema: z.object({
            status: z.enum(['delivered', 'not_installed', 'no_document', 'failed']).nullable(),
            document: z.string().nullable(),
            at: z.string().nullable(),
          }),
        },
      ],
    },
  },
}
