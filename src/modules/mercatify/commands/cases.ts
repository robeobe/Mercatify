import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects, requireId, buildChanges } from '@open-mercato/shared/lib/commands/helpers'
import type { CrudEmitContext, CrudEventsConfig, CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { InterviewCase } from '../data/entities'
import { interviewCaseCreateSchema, interviewCaseUpdateSchema } from '../data/validators'

const ENTITY_ID = 'mercatify:interview_case' as const
const RESOURCE_KIND = 'mercatify.case' as const

type SerializedCase = {
  id: string
  title: string
  status: string
  tenantId: string | null
  organizationId: string | null
}

function serializeCase(entity: InterviewCase): SerializedCase {
  return {
    id: String(entity.id),
    title: String(entity.title),
    status: String(entity.status),
    tenantId: entity.tenantId ? String(entity.tenantId) : null,
    organizationId: entity.organizationId ? String(entity.organizationId) : null,
  }
}

/**
 * Derive the trusted scope and fail closed.
 *
 * Both halves come from the request context, never from the payload: a missing
 * tenant or organization is a 400, never an unscoped write. An interview case is
 * organization-owned business data, so there is no system-scoped branch here.
 */
function ensureScope(ctx: CommandRuntimeContext): { tenantId: string; organizationId: string } {
  const tenantId = ctx.auth?.tenantId ?? null
  if (!tenantId) throw new CrudHttpError(400, { error: 'Tenant context is required' })
  const organizationId = ctx.selectedOrganizationId ?? ctx.organizationScope?.selectedId ?? null
  if (!organizationId) throw new CrudHttpError(400, { error: 'Organization context is required' })
  return { tenantId, organizationId }
}

export const caseCrudEvents: CrudEventsConfig<InterviewCase> = {
  module: 'mercatify',
  entity: 'case',
  persistent: true,
  buildPayload: (ctx: CrudEmitContext<InterviewCase>) => ({
    id: ctx.identifiers.id,
    tenantId: ctx.identifiers.tenantId,
    organizationId: ctx.identifiers.organizationId,
    title: ctx.entity?.title ?? null,
    status: ctx.entity?.status ?? null,
    ...(ctx.syncOrigin ? { syncOrigin: ctx.syncOrigin } : {}),
  }),
}

export const caseCrudIndexer: CrudIndexerConfig<InterviewCase> = {
  entityType: ENTITY_ID,
  buildUpsertPayload: (ctx: CrudEmitContext<InterviewCase>) => ({
    entityType: ENTITY_ID,
    recordId: ctx.identifiers.id,
    tenantId: ctx.identifiers.tenantId,
    organizationId: ctx.identifiers.organizationId,
  }),
  buildDeletePayload: (ctx: CrudEmitContext<InterviewCase>) => ({
    entityType: ENTITY_ID,
    recordId: ctx.identifiers.id,
    tenantId: ctx.identifiers.tenantId,
    organizationId: ctx.identifiers.organizationId,
  }),
}

const createCaseCommand: CommandHandler<Record<string, unknown>, InterviewCase> = {
  id: 'mercatify.cases.create',
  async execute(rawInput, ctx) {
    const parsed = interviewCaseCreateSchema.parse(rawInput ?? {})
    const scope = ensureScope(ctx)
    const de = ctx.container.resolve('dataEngine') as DataEngine

    const entity = await de.createOrmEntity({
      entity: InterviewCase,
      data: {
        title: parsed.title,
        status: parsed.status,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
      },
    })

    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity,
      identifiers: {
        id: String(entity.id),
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
      },
      syncOrigin: ctx.syncOrigin,
      events: caseCrudEvents,
      indexer: caseCrudIndexer,
    })

    return entity
  },
  captureAfter: (_input, result) => serializeCase(result),
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('mercatify.audit.cases.create', 'Create interview case'),
      resourceKind: RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId ? String(result.tenantId) : null,
      organizationId: result.organizationId ? String(result.organizationId) : null,
      snapshotAfter: serializeCase(result),
    }
  },
}

const updateCaseCommand: CommandHandler<Record<string, unknown>, InterviewCase> = {
  id: 'mercatify.cases.update',
  async prepare(rawInput, ctx) {
    const parsed = interviewCaseUpdateSchema.parse(rawInput ?? {})
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const existing = await em.findOne(InterviewCase, {
      id: parsed.id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
    } as FilterQuery<InterviewCase>)
    if (!existing) throw new CrudHttpError(404, { error: 'Interview case not found' })
    // Runs in `prepare`, which the command bus awaits before `execute`, so a stale
    // version aborts the write instead of racing it.
    enforceCommandOptimisticLock({
      resourceKind: ENTITY_ID,
      resourceId: parsed.id,
      current: existing.updatedAt,
      request: ctx.request,
    })
    return { before: serializeCase(existing) }
  },
  async execute(rawInput, ctx) {
    const parsed = interviewCaseUpdateSchema.parse(rawInput ?? {})
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
        if (parsed.title !== undefined) record.title = parsed.title
        if (parsed.status !== undefined) record.status = parsed.status
      },
    })
    if (!entity) throw new CrudHttpError(404, { error: 'Interview case not found' })

    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity,
      identifiers: {
        id: String(entity.id),
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
      },
      syncOrigin: ctx.syncOrigin,
      events: caseCrudEvents,
      indexer: caseCrudIndexer,
    })

    return entity
  },
  captureAfter: (_input, result) => serializeCase(result),
  buildLog: async ({ result, snapshots }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as SerializedCase | undefined
    const after = serializeCase(result)
    return {
      actionLabel: translate('mercatify.audit.cases.update', 'Update interview case'),
      resourceKind: RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId ? String(result.tenantId) : null,
      organizationId: result.organizationId ? String(result.organizationId) : null,
      changes: buildChanges(before ?? null, after as unknown as Record<string, unknown>, ['title', 'status']),
      snapshotBefore: before ?? null,
      snapshotAfter: after,
    }
  },
}

const deleteCaseCommand: CommandHandler<Record<string, unknown>, InterviewCase> = {
  id: 'mercatify.cases.delete',
  async prepare(rawInput, ctx) {
    const id = requireId(rawInput, 'Interview case id required')
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const existing = await em.findOne(InterviewCase, {
      id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
    } as FilterQuery<InterviewCase>)
    if (!existing) return {}
    enforceCommandOptimisticLock({
      resourceKind: ENTITY_ID,
      resourceId: id,
      current: existing.updatedAt,
      request: ctx.request,
    })
    return { before: serializeCase(existing) }
  },
  async execute(rawInput, ctx) {
    const id = requireId(rawInput, 'Interview case id required')
    const scope = ensureScope(ctx)
    const de = ctx.container.resolve('dataEngine') as DataEngine

    const entity = await de.deleteOrmEntity({
      entity: InterviewCase,
      where: {
        id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        deletedAt: null,
      } as FilterQuery<InterviewCase>,
      soft: true,
      softDeleteField: 'deletedAt',
    })
    if (!entity) throw new CrudHttpError(404, { error: 'Interview case not found' })

    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity,
      identifiers: {
        id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
      },
      syncOrigin: ctx.syncOrigin,
      events: caseCrudEvents,
      indexer: caseCrudIndexer,
    })

    return entity
  },
  buildLog: async ({ snapshots, input }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as SerializedCase | undefined
    return {
      actionLabel: translate('mercatify.audit.cases.delete', 'Delete interview case'),
      resourceKind: RESOURCE_KIND,
      resourceId: requireId(input, 'Interview case id required'),
      tenantId: before?.tenantId ?? null,
      organizationId: before?.organizationId ?? null,
      snapshotBefore: before ?? null,
    }
  },
}

registerCommand(createCaseCommand)
registerCommand(updateCaseCommand)
registerCommand(deleteCaseCommand)

export { createCaseCommand, updateCaseCommand, deleteCaseCommand }
