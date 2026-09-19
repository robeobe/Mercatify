import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { assertOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { z } from 'zod'
import { MercatifyRequest, type MercatifyCapOverride } from '../data/entities'
import { canReport, mappingOpen, type RequestStatus } from '../lib/status'

const RESOURCE_KIND = 'mercatify:mercatify_request' as const

const toolSchema = z.object({
  name: z.string().min(1).max(200),
  seats: z.number().int().min(0).nullable().optional(),
  monthly: z.number().min(0).nullable().optional(),
  caps: z.array(z.string().min(1)).default([]),
})

export const requestCreateSchema = z.object({
  company: z.string().min(1).max(200),
  industry: z.string().max(200).optional(),
  peopleCount: z.number().int().min(0).optional(),
  currency: z.enum(['EUR', 'USD', 'GBP', 'PLN']).default('EUR'),
  pains: z.string().max(4000).optional(),
  mustKeep: z.string().max(4000).optional(),
  tools: z.array(toolSchema).min(1),
})

const statusSchema = z.enum(['new', 'mapping', 'mapped', 'sent', 'accepted', 'consult'])

export const requestUpdateSchema = z.object({
  id: z.string().uuid(),
  status: statusSchema.optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  ownerName: z.string().max(200).nullable().optional(),
  expected_updated_at: z.string().min(1).optional(),
})

const capOverridePatchSchema = z.object({
  module: z.string().min(1).optional(),
  status: z.enum(['native', 'configure', 'build', 'integrate', 'keep']).optional(),
  note: z.string().max(2000).optional(),
  conf: z.enum(['high', 'medium', 'low']).optional(),
})

export const setCapOverrideSchema = z.object({
  id: z.string().uuid(),
  cap: z.string().min(1),
  /** `null` clears the override, falling back to the automatic CAP_MAP lookup. */
  patch: capOverridePatchSchema.nullable(),
  expected_updated_at: z.string().min(1).optional(),
})

const reportAssumptionsSchema = z.object({
  analyst: z.string().max(200).optional(),
  hosting: z.number().min(0).optional(),
  months: z.number().min(1).max(24).optional(),
  notes: z.string().max(4000).optional(),
})

export const saveReportSchema = z.object({
  id: z.string().uuid(),
  headline: z.string().max(400).optional(),
  notes: z.string().max(4000).optional(),
  assumptions: reportAssumptionsSchema.optional(),
  expected_updated_at: z.string().min(1).optional(),
})

export const respondSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['accepted', 'consult']),
  message: z.string().max(2000).optional(),
  expected_updated_at: z.string().min(1).optional(),
})

function requireTenant(ctx: CommandRuntimeContext): string {
  const tenantId = ctx.auth?.tenantId ?? null
  if (!tenantId) throw new CrudHttpError(400, { error: 'Tenant context is required' })
  return tenantId
}

/** Submitting a request always needs a home organization — an employee always has one selected. */
function ensureScope(ctx: CommandRuntimeContext): { tenantId: string; organizationId: string } {
  const tenantId = requireTenant(ctx)
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? null
  if (!organizationId) throw new CrudHttpError(400, { error: 'Organization context is required' })
  return { tenantId, organizationId }
}

/**
 * Same widening the CRUD factory applies to list scope: an account with access
 * to more than one organization (or "all organizations" selected) reaches every
 * request in that set. `organizationIds: null` means unrestricted (e.g. a
 * superadmin with no fixed org) — omit the filter rather than guessing an org.
 * No feature-specific bypass — `mercatify.requests.manage` only gates whether
 * the write is allowed.
 */
function resolveManageOrgFilter(ctx: CommandRuntimeContext): { $in: string[] } | undefined {
  if (ctx.organizationIds === null) return undefined
  if (Array.isArray(ctx.organizationIds)) return { $in: Array.from(new Set(ctx.organizationIds)) }
  const fallback = ctx.selectedOrganizationId ?? ctx.auth?.orgId ?? null
  return fallback ? { $in: [fallback] } : undefined
}

async function loadForManage(em: EntityManager, ctx: CommandRuntimeContext, id: string): Promise<MercatifyRequest> {
  const tenantId = requireTenant(ctx)
  const orgFilter = resolveManageOrgFilter(ctx)
  const current = await em.findOne(MercatifyRequest, {
    id,
    tenantId,
    ...(orgFilter ? { organizationId: orgFilter } : {}),
    deletedAt: null,
  } as FilterQuery<MercatifyRequest>)
  if (!current) throw new CrudHttpError(404, { error: 'Request not found' })
  return current
}

function lockCheck(id: string, expected: string | undefined, current: Date) {
  assertOptimisticLock({ resourceKind: RESOURCE_KIND, resourceId: id, expected, current })
}

const createRequestCommand: CommandHandler<z.infer<typeof requestCreateSchema>, MercatifyRequest> = {
  id: 'mercatify.requests.create',
  async execute(input, ctx) {
    const parsed = requestCreateSchema.parse(input)
    const scope = ensureScope(ctx)
    const de = ctx.container.resolve('dataEngine') as DataEngine
    return de.createOrmEntity({
      entity: MercatifyRequest,
      data: {
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        company: parsed.company,
        industry: parsed.industry ?? null,
        peopleCount: parsed.peopleCount ?? null,
        currency: parsed.currency,
        status: 'new',
        pains: parsed.pains ?? null,
        mustKeep: parsed.mustKeep ?? null,
        tools: parsed.tools,
        submittedByUserId: ctx.auth?.sub ?? null,
      },
    })
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('mercatify.audit.requests.create', 'Submit stack request'),
      resourceKind: RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId,
      organizationId: result.organizationId,
    }
  },
}

const updateRequestCommand: CommandHandler<z.infer<typeof requestUpdateSchema>, MercatifyRequest> = {
  id: 'mercatify.requests.update',
  async prepare(input, ctx) {
    const parsed = requestUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const current = await loadForManage(em, ctx, parsed.id)
    lockCheck(parsed.id, parsed.expected_updated_at, current.updatedAt)
    return null
  },
  async execute(input, ctx) {
    const parsed = requestUpdateSchema.parse(input)
    const tenantId = requireTenant(ctx)
    const orgFilter = resolveManageOrgFilter(ctx)
    const de = ctx.container.resolve('dataEngine') as DataEngine
    const updated = await de.updateOrmEntity({
      entity: MercatifyRequest,
      where: {
        id: parsed.id,
        tenantId,
        ...(orgFilter ? { organizationId: orgFilter } : {}),
        deletedAt: null,
      } as FilterQuery<MercatifyRequest>,
      apply: (current) => {
        if (parsed.status !== undefined) {
          // `mapped` is the gate a report can be built from — stamp when it is
          // first reached, same as the mock's confirmMapping().
          if (parsed.status === 'mapped' && current.status !== 'mapped') current.mappedAt = new Date()
          current.status = parsed.status
        }
        if (parsed.ownerUserId !== undefined) current.ownerUserId = parsed.ownerUserId
        if (parsed.ownerName !== undefined) current.ownerName = parsed.ownerName
      },
    })
    if (!updated) throw new CrudHttpError(404, { error: 'Request not found' })
    return updated
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('mercatify.audit.requests.update', 'Update stack request'),
      resourceKind: RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId,
      organizationId: result.organizationId,
    }
  },
}

const setCapOverrideCommand: CommandHandler<z.infer<typeof setCapOverrideSchema>, MercatifyRequest> = {
  id: 'mercatify.requests.setCapOverride',
  async prepare(input, ctx) {
    const parsed = setCapOverrideSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const current = await loadForManage(em, ctx, parsed.id)
    // Mirrors the mock's setLock(): a mapping only takes edits while it is
    // still open. Confirmed/sent/answered rows are read-only until reopened.
    if (!mappingOpen(current.status as RequestStatus)) {
      throw new CrudHttpError(409, { error: 'This mapping is closed. Reopen it before editing.' })
    }
    lockCheck(parsed.id, parsed.expected_updated_at, current.updatedAt)
    return null
  },
  async execute(input, ctx) {
    const parsed = setCapOverrideSchema.parse(input)
    const tenantId = requireTenant(ctx)
    const orgFilter = resolveManageOrgFilter(ctx)
    const de = ctx.container.resolve('dataEngine') as DataEngine
    const updated = await de.updateOrmEntity({
      entity: MercatifyRequest,
      where: {
        id: parsed.id,
        tenantId,
        ...(orgFilter ? { organizationId: orgFilter } : {}),
        deletedAt: null,
      } as FilterQuery<MercatifyRequest>,
      apply: (current) => {
        const overrides: Record<string, MercatifyCapOverride> = { ...(current.overrides || {}) }
        if (parsed.patch === null) {
          delete overrides[parsed.cap]
        } else {
          overrides[parsed.cap] = { ...overrides[parsed.cap], ...parsed.patch }
        }
        current.overrides = overrides
      },
    })
    if (!updated) throw new CrudHttpError(404, { error: 'Request not found' })
    return updated
  },
  buildLog: async ({ result, input }) => {
    const { translate } = await resolveTranslations()
    const parsed = input as z.infer<typeof setCapOverrideSchema>
    return {
      actionLabel: translate('mercatify.audit.requests.setCapOverride', 'Edit mapping row'),
      resourceKind: RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: { cap: parsed.cap },
    }
  },
}

function applyReportPatch(current: MercatifyRequest, parsed: z.infer<typeof saveReportSchema>) {
  const existing = current.report || {}
  current.report = {
    headline: parsed.headline ?? existing.headline,
    notes: parsed.notes ?? existing.notes,
    generatedAt: existing.generatedAt || new Date().toISOString().slice(0, 10),
    assumptions: { ...existing.assumptions, ...parsed.assumptions },
  }
}

const saveReportCommand: CommandHandler<z.infer<typeof saveReportSchema>, MercatifyRequest> = {
  id: 'mercatify.requests.saveReport',
  async prepare(input, ctx) {
    const parsed = saveReportSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const current = await loadForManage(em, ctx, parsed.id)
    lockCheck(parsed.id, parsed.expected_updated_at, current.updatedAt)
    return null
  },
  async execute(input, ctx) {
    const parsed = saveReportSchema.parse(input)
    const tenantId = requireTenant(ctx)
    const orgFilter = resolveManageOrgFilter(ctx)
    const de = ctx.container.resolve('dataEngine') as DataEngine
    const updated = await de.updateOrmEntity({
      entity: MercatifyRequest,
      where: {
        id: parsed.id,
        tenantId,
        ...(orgFilter ? { organizationId: orgFilter } : {}),
        deletedAt: null,
      } as FilterQuery<MercatifyRequest>,
      apply: (current) => {
        applyReportPatch(current, parsed)
        // A draft save is also how a request first leaves "new" — same as the
        // mock's console report page.
        if (current.status === 'new') current.status = 'mapping'
      },
    })
    if (!updated) throw new CrudHttpError(404, { error: 'Request not found' })
    return updated
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('mercatify.audit.requests.saveReport', 'Save report draft'),
      resourceKind: RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId,
      organizationId: result.organizationId,
    }
  },
}

const sendReportCommand: CommandHandler<z.infer<typeof saveReportSchema>, MercatifyRequest> = {
  id: 'mercatify.requests.sendReport',
  async prepare(input, ctx) {
    const parsed = saveReportSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const current = await loadForManage(em, ctx, parsed.id)
    if (!canReport(current.status as RequestStatus)) {
      throw new CrudHttpError(409, { error: 'Confirm the mapping before sending a report' })
    }
    lockCheck(parsed.id, parsed.expected_updated_at, current.updatedAt)
    return null
  },
  async execute(input, ctx) {
    const parsed = saveReportSchema.parse(input)
    const tenantId = requireTenant(ctx)
    const orgFilter = resolveManageOrgFilter(ctx)
    const de = ctx.container.resolve('dataEngine') as DataEngine
    const updated = await de.updateOrmEntity({
      entity: MercatifyRequest,
      where: {
        id: parsed.id,
        tenantId,
        ...(orgFilter ? { organizationId: orgFilter } : {}),
        deletedAt: null,
      } as FilterQuery<MercatifyRequest>,
      apply: (current) => {
        applyReportPatch(current, parsed)
        current.sentAt = new Date()
        current.status = 'sent'
      },
    })
    if (!updated) throw new CrudHttpError(404, { error: 'Request not found' })
    return updated
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('mercatify.audit.requests.sendReport', 'Send report to client'),
      resourceKind: RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId,
      organizationId: result.organizationId,
    }
  },
}

/** Client-side: accept the plan or ask for a call. Scoped to the caller's own
 * organization, not tenant-wide — a client answers only for their own case. */
const respondCommand: CommandHandler<z.infer<typeof respondSchema>, MercatifyRequest> = {
  id: 'mercatify.requests.respond',
  async prepare(input, ctx) {
    const parsed = respondSchema.parse(input)
    const scope = ensureScope(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const current = await em.findOne(MercatifyRequest, {
      id: parsed.id,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      deletedAt: null,
    } as FilterQuery<MercatifyRequest>)
    if (!current) throw new CrudHttpError(404, { error: 'Request not found' })
    if (!current.sentAt) throw new CrudHttpError(409, { error: 'No report to respond to yet' })
    lockCheck(parsed.id, parsed.expected_updated_at, current.updatedAt)
    return null
  },
  async execute(input, ctx) {
    const parsed = respondSchema.parse(input)
    const scope = ensureScope(ctx)
    const de = ctx.container.resolve('dataEngine') as DataEngine
    const updated = await de.updateOrmEntity({
      entity: MercatifyRequest,
      where: {
        id: parsed.id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        deletedAt: null,
      } as FilterQuery<MercatifyRequest>,
      apply: (current) => {
        current.clientResponse = {
          kind: parsed.kind,
          at: new Date().toISOString().slice(0, 10),
          message: parsed.message,
        }
        current.status = parsed.kind
      },
    })
    if (!updated) throw new CrudHttpError(404, { error: 'Request not found' })
    return updated
  },
  buildLog: async ({ result, input }) => {
    const { translate } = await resolveTranslations()
    const parsed = input as z.infer<typeof respondSchema>
    return {
      actionLabel: translate('mercatify.audit.requests.respond', 'Respond to report'),
      resourceKind: RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: { kind: parsed.kind },
    }
  },
}

registerCommand(createRequestCommand)
registerCommand(updateRequestCommand)
registerCommand(setCapOverrideCommand)
registerCommand(saveReportCommand)
registerCommand(sendReportCommand)
registerCommand(respondCommand)
