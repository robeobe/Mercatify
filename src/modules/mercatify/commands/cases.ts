import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { emitCrudSideEffects, requireId, buildChanges } from '@open-mercato/shared/lib/commands/helpers'
import type { CrudEmitContext, CrudEventsConfig, CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { badRequest, notFound } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { InterviewCase, InterviewCaseTool } from '../data/entities'
import { interviewCaseCostsSchema, interviewCaseCreateSchema, interviewCaseUpdateSchema } from '../data/validators'
import {
  applyProfileFields,
  applyToolFields,
  deriveCaseTitle,
  hasProfileOrToolEdits,
  monthlyCostToColumn,
  monthlyCostToNumber,
  serializeTool,
  toolCreateData,
} from '../lib/case-tools'

const ENTITY_ID = 'mercatify:interview_case' as const
const RESOURCE_KIND = 'mercatify.case' as const

type SerializedCase = {
  id: string
  title: string
  status: string
  companyName: string | null
  tenantId: string | null
  organizationId: string | null
  tools: ReturnType<typeof serializeTool>[]
}

function serializeCase(entity: InterviewCase, tools: InterviewCaseTool[] = []): SerializedCase {
  return {
    id: String(entity.id),
    title: String(entity.title),
    status: String(entity.status),
    companyName: entity.companyName ? String(entity.companyName) : null,
    tenantId: entity.tenantId ? String(entity.tenantId) : null,
    organizationId: entity.organizationId ? String(entity.organizationId) : null,
    tools: tools.map(serializeTool),
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
  if (!tenantId) throw badRequest('Tenant context is required')
  const organizationId = ctx.selectedOrganizationId ?? ctx.organizationScope?.selectedId ?? null
  if (!organizationId) throw badRequest('Organization context is required')
  return { tenantId, organizationId }
}

async function loadScopedCase(
  em: EntityManager,
  id: string,
  scope: { tenantId: string; organizationId: string },
): Promise<InterviewCase> {
  const existing = await em.findOne(InterviewCase, {
    id,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    deletedAt: null,
  } as FilterQuery<InterviewCase>)
  if (!existing) throw notFound('Interview case not found')
  return existing
}

async function loadCaseTools(
  em: EntityManager,
  caseId: string,
  scope: { tenantId: string; organizationId: string },
): Promise<InterviewCaseTool[]> {
  return em.find(InterviewCaseTool, {
    interviewCase: caseId,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  } as FilterQuery<InterviewCaseTool>)
}

function createToolEntity(
  em: EntityManager,
  interviewCase: InterviewCase,
  input: Parameters<typeof toolCreateData>[0],
  scope: { tenantId: string; organizationId: string },
  now: Date,
): InterviewCaseTool {
  const data = toolCreateData(input, scope)
  return em.create(InterviewCaseTool, {
    ...(input.id ? { id: input.id } : {}),
    interviewCase,
    ...data,
    createdAt: now,
    updatedAt: now,
  })
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
    if (parsed.status === 'new' && parsed.tools.length === 0) {
      throw badRequest('Send requires at least one tool')
    }
    const de = ctx.container.resolve('dataEngine') as DataEngine
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const now = new Date()
    const entity = em.create(InterviewCase, {
      title: deriveCaseTitle(parsed.companyName),
      status: parsed.status,
      companyName: parsed.companyName ?? null,
      industry: parsed.industry ?? null,
      peopleCount: parsed.peopleCount ?? null,
      currency: parsed.currency ?? 'EUR',
      pains: parsed.pains ?? null,
      mustKeep: parsed.mustKeep ?? null,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      createdAt: now,
      updatedAt: now,
    })
    const tools = parsed.tools.map((tool) => createToolEntity(em, entity, tool, scope, now))

    await withAtomicFlush(
      em,
      [
        () => {
          em.persist(entity)
          for (const tool of tools) em.persist(tool)
        },
      ],
      { transaction: true },
    )

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
  captureAfter: async (_input, result, ctx) => {
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const tools = await loadCaseTools(em, String(result.id), scope)
    return serializeCase(result, tools)
  },
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
    const existing = await loadScopedCase(em, parsed.id, scope)
    const tools = await loadCaseTools(em, parsed.id, scope)
    // Runs in `prepare`, which the command bus awaits before `execute`, so a stale
    // version aborts the write instead of racing it.
    enforceCommandOptimisticLock({
      resourceKind: ENTITY_ID,
      resourceId: parsed.id,
      current: existing.updatedAt,
      request: ctx.request,
    })
    return { before: serializeCase(existing, tools) }
  },
  async execute(rawInput, ctx) {
    const parsed = interviewCaseUpdateSchema.parse(rawInput ?? {})
    const scope = ensureScope(ctx)
    const de = ctx.container.resolve('dataEngine') as DataEngine
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const entity = await loadScopedCase(em, parsed.id, scope)
    const existingTools = await loadCaseTools(em, parsed.id, scope)

    if (entity.status !== 'draft' && hasProfileOrToolEdits(parsed)) {
      throw badRequest('A sent interview case cannot be edited')
    }

    const nextStatus = parsed.status ?? entity.status
    const resultingToolCount = parsed.tools !== undefined ? parsed.tools.length : existingTools.length
    if (nextStatus === 'new' && resultingToolCount === 0) {
      throw badRequest('Send requires at least one tool')
    }

    applyProfileFields(entity, parsed)
    entity.title = deriveCaseTitle(parsed.companyName !== undefined ? parsed.companyName : entity.companyName)
    if (parsed.status !== undefined) entity.status = parsed.status

    await withAtomicFlush(
      em,
      [
        () => {
          em.persist(entity)
          if (parsed.tools === undefined) return
          const incomingIds = new Set(parsed.tools.map((tool) => tool.id).filter((id): id is string => Boolean(id)))
          for (const row of existingTools) {
            if (!incomingIds.has(String(row.id))) em.remove(row)
          }
          const now = new Date()
          for (const tool of parsed.tools) {
            const existing = tool.id ? existingTools.find((row) => String(row.id) === tool.id) : undefined
            if (existing) {
              applyToolFields(existing, tool)
              existing.updatedAt = now
              em.persist(existing)
            } else {
              em.persist(createToolEntity(em, entity, tool, scope, now))
            }
          }
        },
      ],
      { transaction: true },
    )

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
  captureAfter: async (_input, result, ctx) => {
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const tools = await loadCaseTools(em, String(result.id), scope)
    return serializeCase(result, tools)
  },
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
      changes: buildChanges(before ?? null, after as unknown as Record<string, unknown>, ['title', 'status', 'companyName']),
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
    if (!entity) throw notFound('Interview case not found')

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

/**
 * S-04: sets the two customer-provided cost inputs to the net-saving formula
 * (`lib/savings.ts`). Deliberately separate from `updateCaseCommand`: these
 * are admin-entered backstage figures prepared alongside the mapping/report,
 * not part of the client's intake profile, so they stay editable regardless
 * of `status` — `updateCaseCommand`'s `status !== 'draft'` guard does not
 * apply here.
 */
const updateCaseCostsCommand: CommandHandler<Record<string, unknown>, InterviewCase> = {
  id: 'mercatify.cases.costs.update',
  async prepare(rawInput, ctx) {
    const parsed = interviewCaseCostsSchema.parse(rawInput ?? {})
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const existing = await loadScopedCase(em, parsed.id, scope)
    enforceCommandOptimisticLock({
      resourceKind: ENTITY_ID,
      resourceId: parsed.id,
      current: existing.updatedAt,
      request: ctx.request,
    })
    return { before: serializeCase(existing) }
  },
  async execute(rawInput, ctx) {
    const parsed = interviewCaseCostsSchema.parse(rawInput ?? {})
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
        if (parsed.omOperatingCost !== undefined) record.omOperatingCost = monthlyCostToColumn(parsed.omOperatingCost)
        if (parsed.implementationCost !== undefined) record.implementationCost = monthlyCostToColumn(parsed.implementationCost)
      },
    })
    if (!entity) throw notFound('Interview case not found')

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
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('mercatify.audit.cases.costs.update', 'Update interview case costs'),
      resourceKind: RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId ? String(result.tenantId) : null,
      organizationId: result.organizationId ? String(result.organizationId) : null,
      snapshotAfter: {
        omOperatingCost: monthlyCostToNumber(result.omOperatingCost),
        implementationCost: monthlyCostToNumber(result.implementationCost),
      },
    }
  },
}

registerCommand(createCaseCommand)
registerCommand(updateCaseCommand)
registerCommand(deleteCaseCommand)
registerCommand(updateCaseCostsCommand)

export { createCaseCommand, updateCaseCommand, deleteCaseCommand, updateCaseCostsCommand }
