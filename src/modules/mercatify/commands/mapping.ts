import fs from 'node:fs'
import path from 'node:path'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects, buildChanges } from '@open-mercato/shared/lib/commands/helpers'
import type { CrudEmitContext, CrudEventsConfig } from '@open-mercato/shared/lib/crud/types'
import { CrudHttpError, badRequest, conflict, notFound } from '@open-mercato/shared/lib/crud/errors'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { getEnabledModuleIds } from '@open-mercato/shared/security/enabledModulesRegistry'
import { getModules } from '@open-mercato/shared/lib/modules/registry'
import { InterviewCase, InterviewCaseTool, MappingRow } from '../data/entities'
import { mappingRowUpdateSchema } from '../data/validators'
import { getMercatifyLabPort, type MercatifyMappingRow } from '../lib/mercatify-lab-port'
import { monthlyCostToNumber } from '../lib/case-tools'
import { emitMercatifyEvent } from '../events'

const CASE_ENTITY_ID = 'mercatify:interview_case' as const
const ROW_ENTITY_ID = 'mercatify:mapping_row' as const
const ROW_RESOURCE_KIND = 'mercatify.mapping_row' as const
const CASE_RESOURCE_KIND = 'mercatify.case' as const

type SerializedRow = {
  id: string
  caseId: string
  decision: string
  justification: string
  confidence: string
  targetKind: string
  targetModuleId: string | null
  flagged: boolean
  tenantId: string | null
  organizationId: string | null
}

function serializeRow(entity: MappingRow): SerializedRow {
  return {
    id: String(entity.id),
    caseId: String(entity.caseId),
    decision: String(entity.decision),
    justification: String(entity.justification),
    confidence: String(entity.confidence),
    targetKind: String(entity.targetKind),
    targetModuleId: entity.targetModuleId ?? null,
    flagged: Boolean(entity.flagged),
    tenantId: entity.tenantId ? String(entity.tenantId) : null,
    organizationId: entity.organizationId ? String(entity.organizationId) : null,
  }
}

/**
 * Derive the trusted scope and fail closed — mirrors `commands/cases.ts`'s
 * `ensureScope`. A mapping row/case is organization-owned business data, so
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

type FlaggedTarget = {
  flagged: boolean
  flagReason: 'unmapped' | 'module_not_enabled' | null
  targetModuleId: string | null
  targetToolName: string | null
  targetLabel: string | null
}

/**
 * Resolves the display snapshot and the flagged state for one analysis row's
 * target. A row is flagged when the analysis could not map it at all, or
 * when it names an OM module id outside the set this app actually enables —
 * the same "visibly flagged, never dropped" treatment FR-006 requires for an
 * unmapped capability (resolves roadmap Open Question 15).
 */
/**
 * Core module ids used when `node_modules/@open-mercato/core/src/modules`
 * cannot be read (a bundled runtime, a pruned install). HARDCODED mirror of
 * that directory as of 2026-09-20 — see this task's report.
 */
const CORE_MODULE_IDS_FALLBACK = [
  'api_docs', 'api_keys', 'attachments', 'audit_logs', 'auth', 'business_rules', 'catalog',
  'communication_channels', 'configs', 'currencies', 'customer_accounts', 'customers', 'dashboards',
  'data_sync', 'design_system', 'devices', 'dictionaries', 'directory', 'entities', 'eudr',
  'feature_toggles', 'inbox_ops', 'integrations', 'messages', 'notifications', 'payment_gateways',
  'perspectives', 'planner', 'portal', 'progress', 'push_notifications', 'query_index', 'resources',
  'sales', 'shipping_carriers', 'staff', 'sync_excel', 'translations', 'warranty_claims', 'widgets',
  'wms', 'workflows',
] as const

let installableModuleIdsCache: Set<string> | null = null

/**
 * Modules this deployment can legitimately point a mapping row at: the ones
 * actually enabled, plus every module that ships in `@open-mercato/core`.
 *
 * The analysis names real platform modules (`customers`, `sales`, `catalog`)
 * whether or not this particular app has switched them on — an installable
 * module is not a mapping error, so flagging it as one only painted the demo
 * red. `flagged` is now reserved for a target that genuinely does not exist.
 */
function getInstallableModuleIds(): Set<string> {
  if (installableModuleIdsCache) return installableModuleIdsCache
  const ids = new Set<string>(getEnabledModuleIds())
  let coreIds: readonly string[] = CORE_MODULE_IDS_FALLBACK
  try {
    // Read the directory rather than resolving the package: `@open-mercato/core`
    // exports no `package.json` subpath, so `require.resolve` would only make
    // the bundler warn. Missing directory → the mirror below stands in.
    const modulesDir = path.join(process.cwd(), 'node_modules', '@open-mercato', 'core', 'src', 'modules')
    const entries = fs.readdirSync(modulesDir, { withFileTypes: true })
    const found = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    if (found.length > 0) coreIds = found
  } catch {
    // Directory missing — the hardcoded mirror above stands in.
  }
  for (const id of coreIds) ids.add(id)
  installableModuleIdsCache = ids
  return ids
}

/** Test seam: `registerModules` in a suite changes what "enabled" means. */
export function resetInstallableModuleIdsCache(): void {
  installableModuleIdsCache = null
}

/** "payment_gateways" -> "Payment Gateways" — a readable label for a module
 *  that exists in core but is not enabled here, so has no registered title. */
function titleCaseModuleId(moduleId: string): string {
  return moduleId
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function resolveTarget(target: MercatifyMappingRow['target']): FlaggedTarget {
  if (target.kind === 'unmapped') {
    return { flagged: true, flagReason: 'unmapped', targetModuleId: null, targetToolName: null, targetLabel: null }
  }
  if (target.kind === 'external_tool') {
    return { flagged: false, flagReason: null, targetModuleId: null, targetToolName: target.name, targetLabel: target.name }
  }
  if (!getInstallableModuleIds().has(target.moduleId)) {
    return {
      flagged: true,
      flagReason: 'module_not_enabled',
      targetModuleId: target.moduleId,
      targetToolName: null,
      targetLabel: target.moduleId,
    }
  }
  // Enabled modules carry a registered title; a core module that is merely
  // installable does not, so its id is title-cased instead.
  const title = getModules().find((mod) => mod.id === target.moduleId)?.info?.title ?? titleCaseModuleId(target.moduleId)
  return { flagged: false, flagReason: null, targetModuleId: target.moduleId, targetToolName: null, targetLabel: title }
}

/**
 * Move a case forward one step of the staff lifecycle, and only forward: the
 * write happens when the case is still in one of `from`. A case the client has
 * already been sent a report for (`sent`/`accepted`/`consult`) is never pulled
 * back by an admin re-opening the analysis.
 */
async function advanceStatus(
  de: DataEngine,
  interviewCase: InterviewCase,
  caseId: string,
  scope: { tenantId: string; organizationId: string },
  from: string[],
  to: 'mapping' | 'mapped',
): Promise<void> {
  if (!from.includes(String(interviewCase.status))) return
  await de.updateOrmEntity({
    entity: InterviewCase,
    where: {
      id: caseId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
    } as FilterQuery<InterviewCase>,
    apply: (record: InterviewCase) => {
      if (!from.includes(String(record.status))) return
      record.status = to as InterviewCase['status']
    },
  })
}

const generateMappingCommand: CommandHandler<Record<string, unknown>, { generated: boolean; rows: MappingRow[] }> = {
  id: 'mercatify.mapping.generate',
  async execute(rawInput, ctx) {
    const caseId = String((rawInput as Record<string, unknown> | null)?.caseId ?? '')
    if (!caseId) throw badRequest('caseId is required')
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const de = ctx.container.resolve('dataEngine') as DataEngine

    const interviewCase = await loadCaseInScope(em, caseId, scope)

    // Idempotent: a case that already has rows is left untouched — generation
    // never duplicates or overwrites an existing mapping.
    const existingCount = await em.count(MappingRow, {
      caseId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    } as FilterQuery<MappingRow>)
    if (existingCount > 0) {
      const existing = await em.find(MappingRow, {
        caseId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
      } as FilterQuery<MappingRow>, { orderBy: { position: 'asc' } as any })
      // Idempotent on the rows, but still advances a case the admin has
      // (re)sent to the Lab — a `new` case with rows is a state the demo can
      // reach by generating before the status write landed.
      await advanceStatus(de, interviewCase, caseId, scope, ['new'], 'mapping')
      return { generated: false, rows: existing }
    }

    // Real intake tools (S-01) are sent as `saasTools`, carrying the catalog
    // tool and the modules the client actually ticked, so the analysis grounds
    // every row's `source` in an actual product name.
    const tools = await em.find(InterviewCaseTool, {
      interviewCase: caseId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    } as FilterQuery<InterviewCaseTool>)

    // No interview wizard exists (S-02, superseded) — a minimal, self-contained
    // placeholder answer is enough to skip the adapter's `needs_more_info`
    // round and reach a `complete` mapping.
    const result = await getMercatifyLabPort().evaluate({
      contractVersion: 1,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      caseId,
      companyProfile: {},
      saasTools: tools.map((tool) => ({
        name: tool.name,
        monthlyCost: monthlyCostToNumber(tool.monthlyCost) ?? 0,
        notes: tool.customUse ?? undefined,
        catalogToolId: tool.catalogToolId ?? undefined,
        selectedModuleIds: Array.isArray(tool.selectedModuleIds) ? tool.selectedModuleIds.map(String) : undefined,
        seats: tool.seats ?? undefined,
      })),
      answers: [{ questionId: 'seed', freeText: 'seeded case' }],
    })

    if (result.status !== 'complete') {
      // Contractually possible, but never hit by the scripted adapter given a
      // non-empty `answers` array above. Persist nothing rather than crash —
      // the UI is left showing its existing empty state.
      return { generated: false, rows: [] }
    }

    const created: MappingRow[] = []
    for (let i = 0; i < result.mapping.length; i++) {
      const row = result.mapping[i]!
      const resolved = resolveTarget(row.target)
      const entity = await de.createOrmEntity({
        entity: MappingRow,
        data: {
          caseId,
          position: i,
          capability: row.capability,
          source: row.source,
          decision: row.decision,
          justification: row.justification,
          confidence: row.confidence,
          targetKind: row.target.kind,
          targetModuleId: resolved.targetModuleId,
          targetToolName: resolved.targetToolName,
          targetLabel: resolved.targetLabel,
          flagged: resolved.flagged,
          flagReason: resolved.flagReason,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
        },
      })
      created.push(entity)
      await emitCrudSideEffects({
        dataEngine: de,
        action: 'created',
        entity,
        identifiers: { id: String(entity.id), tenantId: scope.tenantId, organizationId: scope.organizationId },
        events: mappingRowCrudEvents,
      })
    }

    // The analysis has landed: a `new` case is now visibly "in mapping".
    await advanceStatus(de, interviewCase, caseId, scope, ['new'], 'mapping')

    return { generated: true, rows: created }
  },
  buildLog: async ({ input, result }) => {
    const { translate } = await resolveTranslations()
    const caseId = String((input as Record<string, unknown> | null)?.caseId ?? '')
    return {
      actionLabel: translate('mercatify.audit.mapping.generate', 'Generate capability mapping'),
      resourceKind: CASE_RESOURCE_KIND,
      resourceId: caseId,
      snapshotAfter: { caseId, rowCount: result.rows.length, generated: result.generated },
    }
  },
}

const updateMappingRowCommand: CommandHandler<Record<string, unknown>, MappingRow> = {
  id: 'mercatify.mapping.rows.update',
  async prepare(rawInput, ctx) {
    const parsed = mappingRowUpdateSchema.parse(rawInput ?? {})
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const existing = await em.findOne(MappingRow, {
      id: parsed.id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    } as FilterQuery<MappingRow>)
    if (!existing) throw notFound('Mapping row not found')

    const parentCase = await em.findOne(InterviewCase, {
      id: existing.caseId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    } as FilterQuery<InterviewCase>)
    if (parentCase?.mappingConfirmedAt) {
      throw conflict('Mapping is already confirmed and can no longer be edited')
    }

    // Runs in `prepare`, which the command bus awaits before `execute`, so a
    // stale version aborts the write instead of racing it.
    enforceCommandOptimisticLock({
      resourceKind: ROW_ENTITY_ID,
      resourceId: parsed.id,
      current: existing.updatedAt,
      request: ctx.request,
    })
    return { before: serializeRow(existing) }
  },
  async execute(rawInput, ctx) {
    const parsed = mappingRowUpdateSchema.parse(rawInput ?? {})
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const de = ctx.container.resolve('dataEngine') as DataEngine

    // Re-check the confirmed guard race-safely inside execute too (prepare's
    // check ran before this command was awaited on the bus).
    const rowBeforeExecute = await em.findOne(MappingRow, {
      id: parsed.id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    } as FilterQuery<MappingRow>)
    if (!rowBeforeExecute) throw notFound('Mapping row not found')
    const owningCase = await em.findOne(InterviewCase, {
      id: rowBeforeExecute.caseId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    } as FilterQuery<InterviewCase>)
    if (owningCase?.mappingConfirmedAt) {
      throw conflict('Mapping is already confirmed and can no longer be edited')
    }

    const entity = await de.updateOrmEntity({
      entity: MappingRow,
      where: {
        id: parsed.id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
      } as FilterQuery<MappingRow>,
      apply: (record: MappingRow) => {
        record.decision = parsed.decision
        record.justification = parsed.justification
      },
    })
    if (!entity) throw notFound('Mapping row not found')

    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity,
      identifiers: { id: String(entity.id), tenantId: scope.tenantId, organizationId: scope.organizationId },
      events: mappingRowCrudEvents,
    })

    return entity
  },
  captureAfter: (_input, result) => serializeRow(result),
  buildLog: async ({ result, snapshots }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as SerializedRow | undefined
    const after = serializeRow(result)
    return {
      actionLabel: translate('mercatify.audit.mapping.row.update', 'Update capability mapping row'),
      resourceKind: ROW_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId ? String(result.tenantId) : null,
      organizationId: result.organizationId ? String(result.organizationId) : null,
      changes: buildChanges(before ?? null, after as unknown as Record<string, unknown>, ['decision', 'justification']),
      snapshotBefore: before ?? null,
      snapshotAfter: after,
    }
  },
}

const confirmMappingCommand: CommandHandler<Record<string, unknown>, InterviewCase> = {
  id: 'mercatify.mapping.confirm',
  async execute(rawInput, ctx) {
    const caseId = String((rawInput as Record<string, unknown> | null)?.caseId ?? '')
    if (!caseId) throw badRequest('caseId is required')
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const de = ctx.container.resolve('dataEngine') as DataEngine

    const interviewCase = await loadCaseInScope(em, caseId, scope)

    // Idempotent no-op: confirming an already-confirmed case returns the
    // existing timestamp rather than erroring, matching the "additive no-op"
    // precedent pinned by `cases.test.ts`.
    if (interviewCase.mappingConfirmedAt) return interviewCase

    const rowCount = await em.count(MappingRow, {
      caseId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    } as FilterQuery<MappingRow>)
    if (rowCount === 0) throw badRequest('Cannot confirm a mapping with no rows')

    const entity = await de.updateOrmEntity({
      entity: InterviewCase,
      where: {
        id: caseId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        deletedAt: null,
      } as FilterQuery<InterviewCase>,
      apply: (record: InterviewCase) => {
        record.mappingConfirmedAt = new Date()
        // A confirmed mapping is what `mapped` means. Statuses past it
        // (`sent`, `accepted`, `consult`) are left alone — the client has
        // already seen a report and their view must not regress.
        if (record.status === 'new' || record.status === 'mapping') {
          record.status = 'mapped'
        }
      },
    })
    if (!entity) throw notFound('Interview case not found')

    await emitMercatifyEvent('mercatify.mapping.confirmed', {
      id: String(entity.id),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })

    return entity
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('mercatify.audit.mapping.confirm', 'Confirm capability mapping'),
      resourceKind: CASE_RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId ? String(result.tenantId) : null,
      organizationId: result.organizationId ? String(result.organizationId) : null,
      snapshotAfter: { mappingConfirmedAt: result.mappingConfirmedAt ?? null, status: result.status },
    }
  },
}

export const mappingRowCrudEvents: CrudEventsConfig<MappingRow> = {
  module: 'mercatify',
  entity: 'mapping_row',
  persistent: true,
  buildPayload: (ctx: CrudEmitContext<MappingRow>) => ({
    id: ctx.identifiers.id,
    tenantId: ctx.identifiers.tenantId,
    organizationId: ctx.identifiers.organizationId,
    caseId: ctx.entity?.caseId ?? null,
  }),
}

registerCommand(generateMappingCommand)
registerCommand(updateMappingRowCommand)
registerCommand(confirmMappingCommand)

export { generateMappingCommand, updateMappingRowCommand, confirmMappingCommand, CASE_ENTITY_ID, ROW_ENTITY_ID }
