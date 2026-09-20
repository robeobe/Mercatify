import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { CrudHttpError, badRequest, forbidden, notFound } from '@open-mercato/shared/lib/crud/errors'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CaseReport, InterviewCase } from '../data/entities'
import { caseAnswerSchema } from '../data/validators'
import { isReportReadyStatus } from '../lib/request-progress'
import { handOffToLab, type LabHandoffStatus } from '../lib/lab-handoff'
import { emitMercatifyEvent } from '../events'

const CASE_RESOURCE_KIND = 'mercatify.case' as const

/** Derive the trusted scope and fail closed — mirrors `commands/report.ts`. */
function ensureScope(ctx: CommandRuntimeContext): { tenantId: string; organizationId: string; userId: string } {
  const tenantId = ctx.auth?.tenantId ?? null
  if (!tenantId) throw new CrudHttpError(400, { error: 'Tenant context is required' })
  const organizationId = ctx.selectedOrganizationId ?? ctx.organizationScope?.selectedId ?? null
  if (!organizationId) throw new CrudHttpError(400, { error: 'Organization context is required' })
  const userId = ctx.auth?.sub ? String(ctx.auth.sub) : null
  if (!userId) throw new CrudHttpError(400, { error: 'User context is required' })
  return { tenantId, organizationId, userId }
}

/**
 * S-10: the client's answer to a report that was sent to them — the only
 * writer of `accepted` and `consult` (`mercatify.cases.update` rejects both,
 * and `mercatify.report.send` only ever writes `sent`).
 *
 * The answer belongs to the person who filed the request, so this is
 * owner-scoped rather than feature-scoped: holding `mercatify.cases.view` lets
 * an employee reach the route, never somebody else's request. Keyed on
 * `createdByUserId`, never on a role name — see
 * `.ai/lessons/client-request-owner-scope.md`.
 *
 * Re-answering is allowed: a client who asked for a call may still accept
 * afterwards. Answering before the report is out is not — there is nothing to
 * answer until `mercatify.report.send` has stamped `sentAt`.
 */
type AnswerResult = {
  id: string
  status: 'accepted' | 'consult'
  previousStatus: string
  tenantId: string
  organizationId: string
  /** S-06: null unless this answer was an acceptance. */
  labHandoffStatus: LabHandoffStatus | null
}

const answerCaseCommand: CommandHandler<Record<string, unknown>, AnswerResult> = {
  id: 'mercatify.cases.answer',
  async execute(rawInput, ctx) {
    const parsed = caseAnswerSchema.parse(rawInput ?? {})
    const { tenantId, organizationId, userId } = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const de = ctx.container.resolve('dataEngine') as DataEngine

    const interviewCase = await em.findOne(InterviewCase, {
      id: parsed.caseId,
      tenantId,
      organizationId,
      deletedAt: null,
    } as FilterQuery<InterviewCase>)
    if (!interviewCase) throw notFound('Interview case not found')

    if (!interviewCase.createdByUserId || String(interviewCase.createdByUserId) !== userId) {
      throw forbidden('Only the person who filed this request can answer its report')
    }

    // Two independent gates: the case has to be in a post-send status AND the
    // report row has to carry a `sentAt`. Either one alone could be true after
    // a partial write, and answering a report nobody has seen is meaningless.
    const report = await em.findOne(CaseReport, {
      caseId: parsed.caseId,
      tenantId,
      organizationId,
    } as FilterQuery<CaseReport>)
    if (!isReportReadyStatus(interviewCase.status) || !report?.sentAt) {
      throw badRequest('The report has not been sent to you yet')
    }

    const previousStatus = interviewCase.status
    const updated = await de.updateOrmEntity({
      entity: InterviewCase,
      where: {
        id: parsed.caseId,
        tenantId,
        organizationId,
        deletedAt: null,
      } as FilterQuery<InterviewCase>,
      apply: (record: InterviewCase) => {
        record.status = parsed.answer
      },
    })
    if (!updated) throw notFound('Interview case not found')

    // S-06 (FR-012): accepting the report IS the handoff trigger — there is no
    // separate "Run in Mercatify Lab" button. Runs after the status write has
    // committed, carries exactly the `.md` as the admin last left it, and
    // never throws: if Lab is absent (the normal case today) or misbehaves,
    // the client's answer still stands.
    let labHandoffStatus: LabHandoffStatus | null = null
    if (parsed.answer === 'accepted') {
      const outcome = await handOffToLab({
        caseId: String(interviewCase.id),
        title: interviewCase.title,
        tenantId,
        organizationId,
        document: updated.handoffDocument ?? null,
      })
      labHandoffStatus = outcome.status
      await de.updateOrmEntity({
        entity: InterviewCase,
        where: {
          id: parsed.caseId,
          tenantId,
          organizationId,
          deletedAt: null,
        } as FilterQuery<InterviewCase>,
        apply: (record: InterviewCase) => {
          record.labHandoffStatus = outcome.status
          record.labHandoffDocument = outcome.document
          record.labHandoffAt = outcome.at
        },
      })
    }

    await emitMercatifyEvent('mercatify.case.answered', {
      id: String(interviewCase.id),
      tenantId,
      organizationId,
    })

    return {
      id: String(interviewCase.id),
      status: parsed.answer,
      previousStatus,
      tenantId,
      organizationId,
      labHandoffStatus,
    }
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: result.status === 'accepted'
        ? translate('mercatify.audit.case.accepted', 'Client accepted the report')
        : translate('mercatify.audit.case.consult', 'Client asked for a consult call'),
      resourceKind: CASE_RESOURCE_KIND,
      resourceId: result.id,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      changes: { status: { from: result.previousStatus, to: result.status } },
      snapshotBefore: { id: result.id, status: result.previousStatus },
      snapshotAfter: { id: result.id, status: result.status, labHandoffStatus: result.labHandoffStatus },
    }
  },
}

registerCommand(answerCaseCommand)

export { answerCaseCommand }
