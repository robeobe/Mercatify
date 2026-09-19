import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { buildChanges } from '@open-mercato/shared/lib/commands/helpers'
import { CrudHttpError, badRequest, notFound } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { InterviewCase, MappingRow } from '../data/entities'
import { handoffDocumentUpdateSchema } from '../data/validators'
import { buildHandoffDocumentMarkdown } from '../lib/handoff-document'
import { emitMercatifyEvent } from '../events'

const CASE_ENTITY_ID = 'mercatify:interview_case' as const
const CASE_RESOURCE_KIND = 'mercatify.case' as const

type SerializedCase = {
  id: string
  handoffDocument: string | null
  tenantId: string | null
  organizationId: string | null
}

function serializeCase(entity: InterviewCase): SerializedCase {
  return {
    id: String(entity.id),
    handoffDocument: entity.handoffDocument ?? null,
    tenantId: entity.tenantId ? String(entity.tenantId) : null,
    organizationId: entity.organizationId ? String(entity.organizationId) : null,
  }
}

/**
 * Derive the trusted scope and fail closed — mirrors `commands/mapping.ts`'s
 * `ensureScope`. The handoff document is organization-owned business data, so
 * there is no system-scoped branch here.
 */
function ensureScope(ctx: CommandRuntimeContext): { tenantId: string; organizationId: string } {
  const tenantId = ctx.auth?.tenantId ?? null
  if (!tenantId) throw new CrudHttpError(400, { error: 'Tenant context is required' })
  const organizationId = ctx.selectedOrganizationId ?? ctx.organizationScope?.selectedId ?? null
  if (!organizationId) throw new CrudHttpError(400, { error: 'Organization context is required' })
  return { tenantId, organizationId }
}

async function loadCaseInScope(
  em: EntityManager,
  id: string,
  scope: { tenantId: string; organizationId: string },
): Promise<InterviewCase> {
  const found = await em.findOne(InterviewCase, {
    id,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
  } as FilterQuery<InterviewCase>)
  if (!found) throw notFound('Interview case not found')
  return found
}

const generateHandoffDocumentCommand: CommandHandler<
  Record<string, unknown>,
  { generated: boolean; handoffDocument: string | null }
> = {
  id: 'mercatify.handoff.generate',
  async execute(rawInput, ctx) {
    const caseId = String((rawInput as Record<string, unknown> | null)?.caseId ?? '')
    if (!caseId) throw badRequest('caseId is required')
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const de = ctx.container.resolve('dataEngine') as DataEngine

    const interviewCase = await loadCaseInScope(em, caseId, scope)

    if (!interviewCase.mappingConfirmedAt) {
      throw badRequest('Confirm the mapping before preparing the handoff document')
    }

    // Idempotent on the document itself, not on row existence: once a
    // document has ever been written, generation never runs again — this is
    // the independence invariant from PRD Open Question 8 (resolved: the
    // table and the document are independent artifacts).
    if (interviewCase.handoffDocument != null) {
      return { generated: false, handoffDocument: interviewCase.handoffDocument }
    }

    const rows = await em.find(
      MappingRow,
      { caseId, tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<MappingRow>,
      { orderBy: { position: 'asc' } as any },
    )

    const markdown = buildHandoffDocumentMarkdown(
      {
        title: interviewCase.title,
        companyName: interviewCase.companyName ?? null,
        industry: interviewCase.industry ?? null,
        peopleCount: interviewCase.peopleCount ?? null,
        currency: interviewCase.currency ?? null,
        pains: interviewCase.pains ?? null,
        mustKeep: interviewCase.mustKeep ?? null,
      },
      rows.map((row) => ({
        capability: row.capability,
        decision: row.decision,
        targetLabel: row.targetLabel ?? null,
        confidence: row.confidence,
        justification: row.justification,
        flagged: row.flagged,
        flagReason: (row.flagReason ?? null) as 'unmapped' | 'module_not_enabled' | null,
      })),
    )

    const entity = await de.updateOrmEntity({
      entity: InterviewCase,
      where: {
        id: caseId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        deletedAt: null,
      } as FilterQuery<InterviewCase>,
      apply: (record: InterviewCase) => {
        record.handoffDocument = markdown
      },
    })
    if (!entity) throw notFound('Interview case not found')

    await emitMercatifyEvent('mercatify.handoff_document.generated', {
      id: String(entity.id),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })

    return { generated: true, handoffDocument: entity.handoffDocument ?? null }
  },
  buildLog: async ({ input, result }) => {
    const { translate } = await resolveTranslations()
    const caseId = String((input as Record<string, unknown> | null)?.caseId ?? '')
    return {
      actionLabel: translate('mercatify.audit.handoff.generate', 'Generate handoff document'),
      resourceKind: CASE_RESOURCE_KIND,
      resourceId: caseId,
      snapshotAfter: { caseId, generated: result.generated },
    }
  },
}

const updateHandoffDocumentCommand: CommandHandler<Record<string, unknown>, InterviewCase> = {
  id: 'mercatify.handoff.update',
  async prepare(rawInput, ctx) {
    const parsed = handoffDocumentUpdateSchema.parse(rawInput ?? {})
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const existing = await loadCaseInScope(em, parsed.id, scope)

    // Runs in `prepare`, which the command bus awaits before `execute`, so a
    // stale version aborts the write instead of racing it. Shares the case's
    // own resource kind/id with `commands/cases.ts`'s update lock — same row,
    // so a concurrent profile edit and a concurrent handoff edit correctly
    // race each other.
    enforceCommandOptimisticLock({
      resourceKind: CASE_ENTITY_ID,
      resourceId: parsed.id,
      current: existing.updatedAt,
      request: ctx.request,
    })
    return { before: serializeCase(existing) }
  },
  async execute(rawInput, ctx) {
    const parsed = handoffDocumentUpdateSchema.parse(rawInput ?? {})
    const scope = ensureScope(ctx)
    const de = ctx.container.resolve('dataEngine') as DataEngine

    const entity = await de.updateOrmEntity({
      entity: InterviewCase,
      where: {
        id: parsed.id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        deletedAt: null,
      } as FilterQuery<InterviewCase>,
      apply: (record: InterviewCase) => {
        record.handoffDocument = parsed.content
      },
    })
    if (!entity) throw notFound('Interview case not found')

    await emitMercatifyEvent('mercatify.handoff_document.updated', {
      id: String(entity.id),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })

    return entity
  },
  captureAfter: (_input, result) => serializeCase(result),
  buildLog: async ({ result, snapshots }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as SerializedCase | undefined
    const after = serializeCase(result)
    return {
      actionLabel: translate('mercatify.audit.handoff.update', 'Update handoff document'),
      resourceKind: CASE_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId ? String(result.tenantId) : null,
      organizationId: result.organizationId ? String(result.organizationId) : null,
      changes: buildChanges(before ?? null, after as unknown as Record<string, unknown>, ['handoffDocument']),
      snapshotBefore: before ?? null,
      snapshotAfter: after,
    }
  },
}

registerCommand(generateHandoffDocumentCommand)
registerCommand(updateHandoffDocumentCommand)

export { generateHandoffDocumentCommand, updateHandoffDocumentCommand, CASE_ENTITY_ID }
