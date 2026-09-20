import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { isCrudHttpError, forbidden, notFound } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { reportQuerySchema } from '../../../../data/validators'
import { buildReportModel } from '../../../../lib/report'
import { isReportReadyStatus } from '../../../../lib/request-progress'
import { resolveMappingActionContext } from '../../../mapping-rows/shared'
import { reportModelSchema } from '../../../openapi'
import { loadReportBundle } from '../shared'

const logger = createLogger('mercatify')

type RbacService = {
  userHasAllFeatures: (
    userId: string,
    features: string[],
    scope: { tenantId: string | null; organizationId: string | null },
  ) => Promise<boolean>
}

/**
 * S-10: the client's read of the report that was sent to them.
 *
 * A separate route from the admin's `GET /api/mercatify/cases/report` because
 * that one is gated on `mercatify.report.view` — deliberately, so an *unsent*
 * report can never be read by the company it is about. This one is gated on
 * `mercatify.cases.view` and fails closed twice instead: the caller must own
 * the request (or hold `mercatify.mapping.view`, so an admin can see exactly
 * what the client sees), and the report must actually have been sent.
 *
 * It runs the same `loadReportBundle` + `buildReportModel` the admin route
 * runs, and the screen renders it with the same `ReportPreview` component —
 * so a later admin edit shows up here with no regeneration step.
 */
export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['mercatify.cases.view'] },
}

export async function GET(req: Request) {
  try {
    const context = await resolveMappingActionContext(req)
    const { caseId } = reportQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams))

    const em = context.ctx.container.resolve('em') as EntityManager
    const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
    const { interviewCase, report, derivation, inputs } = await loadReportBundle(em, caseId, scope)

    const isOwner = String(interviewCase.createdByUserId ?? '') === context.userId
    if (!isOwner && !(await canSeeAllOrgCases(context))) {
      throw forbidden('This request is not yours')
    }

    // Nothing exists for the client until an admin pressed "Send to the
    // client" — a 404 rather than a 403, because as far as they are concerned
    // there is no report.
    if (!report?.sentAt || !isReportReadyStatus(interviewCase.status)) {
      throw notFound('No report has been sent for this request')
    }

    const model = buildReportModel({
      ...derivation,
      authored: {
        ...inputs,
        sentAt: report.sentAt.toISOString(),
        preparedAt: report.updatedAt ? report.updatedAt.toISOString() : null,
      },
    })

    // The model only: the admin's raw compose inputs and the derivation behind
    // the numbers are not the client's business.
    return NextResponse.json({
      report: model,
      status: interviewCase.status,
      sentAt: report.sentAt.toISOString(),
      title: interviewCase.title,
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    const { translate } = await resolveTranslations()
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: translate('mercatify.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
    logger.error('mercatify.cases.report.client failed', { err })
    return NextResponse.json({ error: translate('mercatify.errors.report_failed', 'Failed to load the report') }, { status: 400 })
  }
}

async function canSeeAllOrgCases(context: { ctx: { container: { resolve: (key: string) => unknown } }; userId: string; tenantId: string; organizationId: string }): Promise<boolean> {
  try {
    const rbac = context.ctx.container.resolve('rbacService') as RbacService
    return await rbac.userHasAllFeatures(context.userId, ['mercatify.mapping.view'], {
      tenantId: context.tenantId,
      organizationId: context.organizationId,
    })
  } catch {
    return false
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Read the report that was sent to you',
  methods: {
    GET: {
      summary:
        'Returns the sent client report for one request, computed live from the confirmed mapping by the same function the admin builder uses. 403 unless you filed the request (or hold `mercatify.mapping.view`); 404 until the report has been sent.',
      query: reportQuerySchema,
      responses: [
        {
          status: 200,
          description: 'The sent report',
          schema: z.object({
            report: reportModelSchema,
            status: z.string(),
            sentAt: z.string(),
            title: z.string(),
          }),
        },
      ],
    },
  },
}
