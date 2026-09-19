import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { interviewCaseCostsSchema } from '../../../data/validators'
import type { InterviewCase } from '../../../data/entities'
import { monthlyCostToNumber } from '../../../lib/case-tools'
import { resolveMappingActionContext, MERCATIFY_CASE_RESOURCE_KIND } from '../../mapping-rows/shared'

const logger = createLogger('mercatify')

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['mercatify.mapping.manage'] },
}

/**
 * S-04: sets OM operating cost and implementation cost — customer-provided
 * inputs to `lib/savings.ts`'s net-saving formula, entered by an admin
 * independently of the intake profile (see `commands/cases.ts`'s
 * `updateCaseCostsCommand`).
 */
export async function POST(req: Request) {
  try {
    const context = await resolveMappingActionContext(req)
    const body = await readJsonSafe<Record<string, unknown>>(req, {})
    const input = interviewCaseCostsSchema.parse(body)

    const guarded = await runRouteMutationGuards({
      container: context.ctx.container,
      req,
      auth: { userId: context.userId, tenantId: context.tenantId, organizationId: context.organizationId },
      input: { resourceKind: MERCATIFY_CASE_RESOURCE_KIND, resourceId: input.id, operation: 'custom', mutationPayload: { ...input } },
    })
    if (!guarded.ok) return guarded.response

    const commandBus = context.ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<typeof input, InterviewCase>(
      'mercatify.cases.costs.update',
      { input, ctx: context.ctx },
    )

    await guarded.runAfterSuccess()

    return NextResponse.json({
      ok: true,
      omOperatingCost: monthlyCostToNumber(result?.omOperatingCost),
      implementationCost: monthlyCostToNumber(result?.implementationCost),
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    const { translate } = await resolveTranslations()
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: translate('mercatify.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
    logger.error('mercatify.cases.costs.post failed', { err })
    return NextResponse.json({ error: translate('mercatify.errors.costs_update_failed', 'Failed to update costs') }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Set interview case cost inputs',
  methods: {
    POST: {
      summary: 'Sets OM operating cost and/or implementation cost — customer-provided inputs to the net-saving formula. Requires the case\'s current version via the optimistic-lock header.',
      requestBody: { contentType: 'application/json', schema: interviewCaseCostsSchema },
      responses: [
        {
          status: 200,
          description: 'Costs updated',
          schema: z.object({ ok: z.boolean(), omOperatingCost: z.number().nullable(), implementationCost: z.number().nullable() }),
        },
      ],
    },
  },
}
