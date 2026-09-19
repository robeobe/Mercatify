import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { isCrudHttpError, notFound } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { InterviewCase, InterviewCaseTool, MappingRow } from '../../../data/entities'
import { monthlyCostToNumber } from '../../../lib/case-tools'
import { computeSavingsScenario } from '../../../lib/savings'
import { resolveMappingActionContext } from '../../mapping-rows/shared'

const logger = createLogger('mercatify')

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['mercatify.mapping.view'] },
}

const savingsQuerySchema = z.object({ caseId: z.string().uuid() })

const responseSchema = z.object({
  omOperatingCost: z.number().nullable(),
  implementationCost: z.number().nullable(),
  currency: z.string().nullable(),
  caseUpdatedAt: z.string(),
  removedSaaS: z.array(z.string()),
  retainedSaaS: z.array(z.string()),
  grossAnnualSaving: z.number(),
  netAnnualSaving: z.number().nullable(),
  netPaybackMonths: z.number().nullable(),
})

/**
 * S-04: the three-line net saving and payback. Always computed here from the
 * case's mapping rows, its SaaS tool costs, and its two customer-provided
 * cost inputs — never persisted, so an edited cost or a re-generated mapping
 * can never leave a stale derived number (see `lib/savings.ts`).
 */
export async function GET(req: Request) {
  try {
    const context = await resolveMappingActionContext(req)
    const { caseId } = savingsQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams))

    const em = context.ctx.container.resolve('em') as EntityManager
    const interviewCase = await em.findOne(InterviewCase, {
      id: caseId,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      deletedAt: null,
    } as FilterQuery<InterviewCase>)
    if (!interviewCase) throw notFound('Interview case not found')

    const [rows, tools] = await Promise.all([
      em.find(MappingRow, {
        caseId,
        tenantId: context.tenantId,
        organizationId: context.organizationId,
      } as FilterQuery<MappingRow>),
      em.find(InterviewCaseTool, {
        interviewCase: caseId,
        tenantId: context.tenantId,
        organizationId: context.organizationId,
      } as FilterQuery<InterviewCaseTool>),
    ])

    const scenario = computeSavingsScenario(
      rows.map((row) => ({ source: row.source, decision: row.decision })),
      tools.map((tool) => ({ name: tool.name, monthlyCost: monthlyCostToNumber(tool.monthlyCost) ?? 0 })),
      {
        omOperatingCost: monthlyCostToNumber(interviewCase.omOperatingCost),
        implementationCost: monthlyCostToNumber(interviewCase.implementationCost),
      },
    )

    return NextResponse.json({
      ...scenario,
      currency: interviewCase.currency ?? null,
      caseUpdatedAt: interviewCase.updatedAt.toISOString(),
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    const { translate } = await resolveTranslations()
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: translate('mercatify.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
    logger.error('mercatify.cases.savings.get failed', { err })
    return NextResponse.json({ error: translate('mercatify.errors.savings_failed', 'Failed to load the savings breakdown') }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Get the net-saving breakdown for a case',
  methods: {
    GET: {
      summary: 'Returns the three-line saving breakdown (SaaS saving, OM operating cost, implementation cost), the net annual saving, and payback — computed live, never persisted.',
      query: z.object({ caseId: z.string().uuid() }),
      responses: [
        { status: 200, description: 'Savings breakdown', schema: responseSchema },
      ],
    },
  },
}
