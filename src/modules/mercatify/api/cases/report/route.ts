import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { CaseReport } from '../../../data/entities'
import { reportInputsSchema, reportQuerySchema } from '../../../data/validators'
import { buildReportModel } from '../../../lib/report'
import { resolveMappingActionContext, MERCATIFY_CASE_RESOURCE_KIND } from '../../mapping-rows/shared'
import { reportResponseSchema } from '../../openapi'
import { loadReportBundle } from './shared'

const logger = createLogger('mercatify')

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['mercatify.report.view'] },
  PUT: { requireAuth: true, requireFeatures: ['mercatify.report.manage'] },
}

/**
 * S-09: the client-facing report for one case. Like S-04's savings route, the
 * whole document is computed here on every read and never persisted — only the
 * admin's typed inputs live in `mercatify_case_reports`, so an edited cost or
 * a re-generated mapping can never leave a stale figure in the report.
 *
 * Gated by `mercatify.report.view`, which depends on `mercatify.mapping.view`:
 * the client role holds only `mercatify.cases.view`, so it can never read an
 * unsent report through this route.
 */
export async function GET(req: Request) {
  try {
    const context = await resolveMappingActionContext(req)
    const { caseId } = reportQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams))

    const em = context.ctx.container.resolve('em') as EntityManager
    const scope = { tenantId: context.tenantId, organizationId: context.organizationId }

    // `derivation` is returned alongside the model so the builder screen can
    // re-derive the preview locally on every keystroke through the very same
    // pure function — "what I am about to send" and "what they get" cannot
    // drift. S-10's client route reads the same bundle.
    const { interviewCase, report, derivation, inputs } = await loadReportBundle(em, caseId, scope)

    const model = buildReportModel({
      ...derivation,
      authored: {
        ...inputs,
        sentAt: report?.sentAt ? report.sentAt.toISOString() : null,
        preparedAt: report?.updatedAt ? report.updatedAt.toISOString() : null,
      },
    })

    return NextResponse.json({
      report: model,
      derivation,
      inputs,
      status: interviewCase.status,
      mappingConfirmedAt: interviewCase.mappingConfirmedAt?.toISOString() ?? null,
      costsEntered: interviewCase.omOperatingCost != null && interviewCase.implementationCost != null,
      caseUpdatedAt: interviewCase.updatedAt.toISOString(),
      reportUpdatedAt: report?.updatedAt ? report.updatedAt.toISOString() : null,
      sentAt: report?.sentAt ? report.sentAt.toISOString() : null,
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    const { translate } = await resolveTranslations()
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: translate('mercatify.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
    logger.error('mercatify.cases.report.get failed', { err })
    return NextResponse.json({ error: translate('mercatify.errors.report_failed', 'Failed to load the report') }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    const context = await resolveMappingActionContext(req)
    const body = await readJsonSafe<Record<string, unknown>>(req, {})
    const input = reportInputsSchema.parse(body)

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
    const { result } = await commandBus.execute<typeof input, CaseReport>(
      'mercatify.report.save',
      { input, ctx: context.ctx },
    )

    await guarded.runAfterSuccess()

    return NextResponse.json({ ok: true, reportUpdatedAt: result?.updatedAt?.toISOString() ?? null })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    const { translate } = await resolveTranslations()
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: translate('mercatify.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
    logger.error('mercatify.cases.report.put failed', { err })
    return NextResponse.json({ error: translate('mercatify.errors.report_save_failed', 'Failed to save the report') }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Build the client-facing report for a case',
  methods: {
    GET: {
      summary:
        'Returns the whole client-facing report — headline, summary, four KPIs, verdict counts, the tool-by-tool table, duplicates, the three saving lines, the build backlog and the cash curve — computed live from the confirmed mapping, never persisted.',
      query: reportQuerySchema,
      responses: [{ status: 200, description: 'Report model and its authored inputs', schema: reportResponseSchema }],
    },
    PUT: {
      summary:
        "Saves only what the admin typed (headline override, note, reviewer, hourly rate, implementation months, open questions, per-item hours). 400s until the mapping is confirmed; 409s on a stale version.",
      requestBody: { contentType: 'application/json', schema: reportInputsSchema },
      responses: [
        {
          status: 200,
          description: 'Report inputs saved',
          schema: z.object({ ok: z.boolean(), reportUpdatedAt: z.string().nullable() }),
        },
      ],
    },
  },
}
