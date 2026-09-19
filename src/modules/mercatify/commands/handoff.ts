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
import { handOffToLab, type LabHandoffStatus } from '../lib/lab-handoff'
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

/**
 * The `.md` for one case, from its profile and its mapping rows. Shared by
 * `mercatify.handoff.generate` and by `mercatify.handoff.integrate`, which
 * regenerates on the spot when the admin never opened the editor.
 */
async function renderHandoffMarkdown(
  em: EntityManager,
  interviewCase: InterviewCase,
  scope: { tenantId: string; organizationId: string },
): Promise<string> {
  const rows = await em.find(
    MappingRow,
    { caseId: String(interviewCase.id), tenantId: scope.tenantId, organizationId: scope.organizationId } as FilterQuery<MappingRow>,
    { orderBy: { position: 'asc' } as any },
  )

  return buildHandoffDocumentMarkdown(
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

    const markdown = await renderHandoffMarkdown(em, interviewCase, scope)

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

type IntegrateResult = {
  id: string
  status: LabHandoffStatus
  document: string
  at: string
}

/**
 * The admin's explicit "Integrate with Mercatify Lab" on an accepted report.
 *
 * `mercatify.cases.answer` already hands the document over when the client
 * accepts; this is the same handover, run on demand from the console — so a
 * demo can show it happening, and so a case whose first attempt found no Lab
 * (or no document) can be retried without asking the client to accept twice.
 *
 * Persists the outcome exactly as `commands/client-answer.ts` does, and never
 * throws on a delivery problem: `handOffToLab` reports `failed` and keeps the
 * text, which is what the screen shows.
 */
const integrateHandoffCommand: CommandHandler<Record<string, unknown>, IntegrateResult> = {
  id: 'mercatify.handoff.integrate',
  async execute(rawInput, ctx) {
    const caseId = String((rawInput as Record<string, unknown> | null)?.caseId ?? '')
    if (!caseId) throw badRequest('caseId is required')
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const de = ctx.container.resolve('dataEngine') as DataEngine

    const interviewCase = await loadCaseInScope(em, caseId, scope)

    // The handover describes work somebody has agreed to. Before the client
    // accepts there is nothing to hand over — the UI disables the button, and
    // this is the gate behind it.
    if (interviewCase.status !== 'accepted') {
      throw badRequest('The client has to accept the report first')
    }

    // Regenerate rather than hand over nothing: the admin may never have
    // opened the editor, and an empty document would only report `no_document`.
    let document = interviewCase.handoffDocument ?? null
    if (document == null || document.trim().length === 0) {
      document = await renderHandoffMarkdown(em, interviewCase, scope)
      await de.updateOrmEntity({
        entity: InterviewCase,
        where: {
          id: caseId,
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          deletedAt: null,
        } as FilterQuery<InterviewCase>,
        apply: (record: InterviewCase) => {
          record.handoffDocument = document
        },
      })
    }

    const outcome = await handOffToLab({
      caseId,
      title: interviewCase.title,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      document,
    })

    const entity = await de.updateOrmEntity({
      entity: InterviewCase,
      where: {
        id: caseId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        deletedAt: null,
      } as FilterQuery<InterviewCase>,
      apply: (record: InterviewCase) => {
        record.labHandoffStatus = outcome.status
        record.labHandoffDocument = outcome.document
        record.labHandoffAt = outcome.at
      },
    })
    if (!entity) throw notFound('Interview case not found')

    await emitMercatifyEvent('mercatify.handoff_document.updated', {
      id: caseId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })

    return { id: caseId, status: outcome.status, document: outcome.document, at: outcome.at.toISOString() }
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('mercatify.audit.handoff.integrate', 'Hand the case over to Mercatify Lab'),
      resourceKind: CASE_RESOURCE_KIND,
      resourceId: result.id,
      snapshotAfter: { caseId: result.id, labHandoffStatus: result.status, labHandoffAt: result.at },
    }
  },
}

registerCommand(generateHandoffDocumentCommand)
registerCommand(updateHandoffDocumentCommand)
registerCommand(integrateHandoffCommand)

export { generateHandoffDocumentCommand, updateHandoffDocumentCommand, integrateHandoffCommand, CASE_ENTITY_ID }
