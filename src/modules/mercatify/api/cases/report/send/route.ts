import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { CaseReport } from '../../../../data/entities'
import { reportInputsSchema } from '../../../../data/validators'
import { resolveMappingActionContext, MERCATIFY_CASE_RESOURCE_KIND } from '../../../mapping-rows/shared'

const logger = createLogger('mercatify')

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['mercatify.report.manage'] },
}

/**
 * The single action that makes the report visible to the client, and the only
 * path in the app that produces `status: 'sent'` — `mercatify.cases.update`
 * rejects that value outright. Accepts the same body as the save route so
 * sending a never-saved report still sends what is on screen.
 */
export async function POST(req: Request) {
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
    const { result } = await commandBus.execute<typeof input, { report: CaseReport; status: string }>(
      'mercatify.report.send',
      { input, ctx: context.ctx },
    )

    await guarded.runAfterSuccess()

    return NextResponse.json({
      ok: true,
      sentAt: result?.report?.sentAt?.toISOString() ?? null,
      status: result?.status ?? null,
    })
  } catch (err) {
    if (isCrudHttpError(err)) return NextResponse.json(err.body, { status: err.status })
    const { translate } = await resolveTranslations()
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: translate('mercatify.errors.invalidInput', 'Invalid input') }, { status: 400 })
    }
    logger.error('mercatify.cases.report.send failed', { err })
    return NextResponse.json({ error: translate('mercatify.errors.report_send_failed', 'Failed to send the report') }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Mercatify',
  summary: 'Send the report to the client',
  methods: {
    POST: {
      summary:
        "Saves the composed report and sends it: stamps `sentAt` and moves the case to `sent`. The only writer of that status. Re-sending replaces the client's copy, but never walks back an `accepted`/`consult` answer. 400s until the mapping is confirmed.",
      requestBody: { contentType: 'application/json', schema: reportInputsSchema },
      responses: [
        {
          status: 200,
          description: 'Report sent',
          schema: z.object({ ok: z.boolean(), sentAt: z.string().nullable(), status: z.string().nullable() }),
        },
      ],
    },
  },
}
