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
import { buildLabsInput } from '../labs/adapter'
import { buildReport } from '../labs/vendor/src/report/buildReport'
import { OpenAiCompatibleLlmClient } from '../labs/vendor/src/llmClient'
import { renderReport } from '../labs/vendor/src/report/renderReport'
import { createTracingLlmClient, deterministicStep, type LabsTraceStep } from '../labs/tracing'
import { startTrackedRun, recordTrackedStep, finishTrackedRun } from '../labs/runTracker'
import { requestModules } from '../lib/moduleMap'
import { buildWorkspacePreviewHtml } from '../lib/workspacePreview'

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
  switchingCost: z.number().min(0).optional(),
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

const labsConsultantFieldsSchema = z.object({
  readWhat: z.string().max(2000).optional(),
  period: z.string().max(2000).optional(),
  exclusions: z.string().max(2000).optional(),
})

export const labsAnalyzeSchema = labsConsultantFieldsSchema.extend({
  id: z.string().uuid(),
  /** Client-generated id it can start polling `labs-run?runId=` with before this POST resolves. */
  runId: z.string().uuid().optional(),
})

export const labsAnalyzeWithAiSchema = labsConsultantFieldsSchema.extend({
  id: z.string().uuid(),
  /**
   * Pasted by the consultant at click time — never persisted (see buildLog
   * below). Optional for now: a demo/dev key can be set once via the
   * OPENROUTER_API_KEY env var and reused server-side, so a consultant
   * doesn't have to paste a key on every run. Ask before removing that
   * fallback for a real deployment — see the command's own comment.
   */
  openRouterApiKey: z.string().min(10).max(300).optional(),
  model: z.string().min(1).max(200).default('openai/gpt-5.6-luna'),
  /**
   * Explicit cap forwarded to `OpenAiCompatibleLlmClient`. Optional — defaults
   * to the client's own 8000. Exposed so a consultant on a well-funded key can
   * raise it for a very large-context model; see llmClient.ts's own comment
   * for why omitting `max_tokens` entirely 402s modest-balance OpenRouter keys.
   */
  maxTokens: z.number().int().min(256).max(128000).optional(),
  /** Client-generated id it can start polling `labs-run?runId=` with before this POST resolves. */
  runId: z.string().uuid().optional(),
})

export const buildWorkspacePreviewSchema = z.object({ id: z.string().uuid() })
export const sendWorkspacePreviewSchema = z.object({ id: z.string().uuid() })

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

/** `renderReport` is documented pure/never-throwing for a valid `ReportModel`,
 * but `buildReport` is the only thing that ever produces one — never trust an
 * upstream "never throws" claim enough to let it take the whole analysis down. */
function renderReportHtmlSafe(model: Parameters<typeof renderReport>[0]): string {
  try {
    return renderReport(model)
  } catch (err) {
    return `<!doctype html><meta charset="utf-8"><p>Mercatify Labs produced facts but the HTML renderer failed: ${
      escapeForHtmlAttribute(err instanceof Error ? err.message : String(err))
    }</p>`
  }
}

function escapeForHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

/**
 * Runs the vendored mercatify-labs `buildReport()` against this request's
 * current stack — deterministic only, no `llmClient`. Experimental and
 * additive: writes to `labsResult` alone, never touches `report`/`overrides`/
 * `status`, and carries no gate on the request's lifecycle status (a
 * consultant can try it at any point, including on a brand-new request).
 */
const labsAnalyzeCommand: CommandHandler<z.infer<typeof labsAnalyzeSchema>, MercatifyRequest> = {
  id: 'mercatify.requests.labsAnalyze',
  async execute(input, ctx) {
    const parsed = labsAnalyzeSchema.parse(input)
    const tenantId = requireTenant(ctx)
    const orgFilter = resolveManageOrgFilter(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const current = await loadForManage(em, ctx, parsed.id)

    const { brief, consultant, excludedTools } = buildLabsInput(
      {
        company: current.company,
        industry: current.industry,
        peopleCount: current.peopleCount,
        currency: current.currency,
        tools: current.tools,
      },
      {
        analyst: current.report?.assumptions?.analyst,
        hostingMonthly: current.report?.assumptions?.hosting,
        implementationCost: current.report?.assumptions?.switchingCost,
        readWhat: parsed.readWhat,
        period: parsed.period,
        exclusions: parsed.exclusions,
      },
    )

    if (parsed.runId) startTrackedRun(parsed.runId, 'deterministic')
    const runStartedAt = Date.now()
    let built: Awaited<ReturnType<typeof buildReport>>
    try {
      built = await buildReport({ brief, consultant })
    } catch (err) {
      if (parsed.runId) finishTrackedRun(parsed.runId, 'error')
      throw new CrudHttpError(502, { error: err instanceof Error ? err.message : 'Mercatify Labs analysis failed' })
    }
    const html = renderReportHtmlSafe(built.model)
    const trace: LabsTraceStep[] = [deterministicStep(Date.now() - runStartedAt)]
    if (parsed.runId) {
      recordTrackedStep(parsed.runId, trace[0])
      finishTrackedRun(parsed.runId, 'done')
    }

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const updated = await de.updateOrmEntity({
      entity: MercatifyRequest,
      where: {
        id: parsed.id,
        tenantId,
        ...(orgFilter ? { organizationId: orgFilter } : {}),
        deletedAt: null,
      } as FilterQuery<MercatifyRequest>,
      apply: (rec) => {
        rec.labsResult = { mode: 'deterministic', ranAt: new Date().toISOString(), excludedTools, result: built, html, trace }
      },
    })
    if (!updated) throw new CrudHttpError(404, { error: 'Request not found' })
    return updated
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('mercatify.audit.requests.labsAnalyze', 'Run Mercatify Labs analysis'),
      resourceKind: RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId,
      organizationId: result.organizationId,
    }
  },
}

/**
 * Same as `labsAnalyzeCommand`, but with an `llmClient` built from a key and
 * model the consultant pastes in at click time — an OpenRouter-compatible
 * `/v1/chat/completions` endpoint. The key is validated by zod, used once to
 * construct the client, and deliberately never placed in `context`/`payload`
 * below, so it never reaches `command_payload` in the action log.
 *
 * Key fallback (temporary, demo/dev only): when the consultant leaves the
 * field blank, this falls back to `OPENROUTER_API_KEY` from the server's own
 * `.env` (gitignored, never committed — see vendor/README.md's existing
 * convention). Ask before shipping this fallback to a real deployment: it
 * means every consultant on this tenant shares one billed key by default.
 *
 * `maxTokens` defaults to 8000 (matches the vendored client's own default —
 * see llmClient.ts). Earlier this account's real OpenRouter balance was
 * nearly zero (observed: as low as ~460 affordable tokens), which needed a
 * much smaller default to avoid a 402 on every call; the account has since
 * been topped up ($10 total credits, ~$4.80 free after prior usage), and a
 * verified live run with 8000 completed with full agent-authored prose and
 * zero real failures. A consultant can still override it per run via
 * `parsed.maxTokens` if a future model/account needs something smaller.
 */
const labsAnalyzeWithAiCommand: CommandHandler<z.infer<typeof labsAnalyzeWithAiSchema>, MercatifyRequest> = {
  id: 'mercatify.requests.labsAnalyzeWithAi',
  async execute(input, ctx) {
    const parsed = labsAnalyzeWithAiSchema.parse(input)
    const tenantId = requireTenant(ctx)
    const orgFilter = resolveManageOrgFilter(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const current = await loadForManage(em, ctx, parsed.id)

    const apiKey = parsed.openRouterApiKey || process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      throw new CrudHttpError(400, { error: 'No OpenRouter API key was supplied and none is configured on the server (OPENROUTER_API_KEY).' })
    }

    const { brief, consultant, excludedTools } = buildLabsInput(
      {
        company: current.company,
        industry: current.industry,
        peopleCount: current.peopleCount,
        currency: current.currency,
        tools: current.tools,
      },
      {
        analyst: current.report?.assumptions?.analyst,
        hostingMonthly: current.report?.assumptions?.hosting,
        implementationCost: current.report?.assumptions?.switchingCost,
        readWhat: parsed.readWhat,
        period: parsed.period,
        exclusions: parsed.exclusions,
      },
    )

    const rawLlmClient = new OpenAiCompatibleLlmClient({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      model: parsed.model,
      maxTokens: parsed.maxTokens ?? 8000,
    })
    const trace: LabsTraceStep[] = []
    if (parsed.runId) startTrackedRun(parsed.runId, 'ai')
    const llmClient = createTracingLlmClient(rawLlmClient, (step) => {
      trace[step.seq] = step
      if (parsed.runId) recordTrackedStep(parsed.runId, step)
    })

    let built: Awaited<ReturnType<typeof buildReport>>
    try {
      built = await buildReport({ brief, consultant, llmClient })
    } catch (err) {
      if (parsed.runId) finishTrackedRun(parsed.runId, 'error')
      throw new CrudHttpError(502, { error: err instanceof Error ? err.message : 'Mercatify Labs AI analysis failed' })
    }
    if (parsed.runId) finishTrackedRun(parsed.runId, 'done')
    const html = renderReportHtmlSafe(built.model)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const updated = await de.updateOrmEntity({
      entity: MercatifyRequest,
      where: {
        id: parsed.id,
        tenantId,
        ...(orgFilter ? { organizationId: orgFilter } : {}),
        deletedAt: null,
      } as FilterQuery<MercatifyRequest>,
      apply: (rec) => {
        rec.labsResult = { mode: 'ai', ranAt: new Date().toISOString(), model: parsed.model, excludedTools, result: built, html, trace }
      },
    })
    if (!updated) throw new CrudHttpError(404, { error: 'Request not found' })
    return updated
  },
  buildLog: async ({ result, input }) => {
    const { translate } = await resolveTranslations()
    const parsed = input as z.infer<typeof labsAnalyzeWithAiSchema>
    return {
      actionLabel: translate('mercatify.audit.requests.labsAnalyzeWithAi', 'Run Mercatify Labs AI analysis'),
      resourceKind: RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      // Model name only — never the key.
      context: { model: parsed.model },
    }
  },
}

/**
 * Builds (or rebuilds) a static "empty shell" mockup of Open Mercato
 * configured for this client — company name where the brand mark sits,
 * sidebar listing only the modules their accepted stack actually turns on.
 * Gated to `accepted`: previewing a workspace for a stack nobody has signed
 * off on yet would misrepresent where the deal stands. Never sent until a
 * consultant explicitly does so via `sendWorkspacePreview`.
 */
const buildWorkspacePreviewCommand: CommandHandler<z.infer<typeof buildWorkspacePreviewSchema>, MercatifyRequest> = {
  id: 'mercatify.requests.buildWorkspacePreview',
  async prepare(input, ctx) {
    const parsed = buildWorkspacePreviewSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const current = await loadForManage(em, ctx, parsed.id)
    if (current.status !== 'accepted') {
      throw new CrudHttpError(409, { error: 'A workspace preview is only available once the client has accepted.' })
    }
    return null
  },
  async execute(input, ctx) {
    const parsed = buildWorkspacePreviewSchema.parse(input)
    const tenantId = requireTenant(ctx)
    const orgFilter = resolveManageOrgFilter(ctx)
    const em = ctx.container.resolve('em') as EntityManager
    const current = await loadForManage(em, ctx, parsed.id)

    const modules = requestModules(current.tools, current.overrides)
      .filter((row) => row.status === 'native' || row.status === 'configure')
      .map((row) => row.module)
    const html = buildWorkspacePreviewHtml(current.company, modules)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const updated = await de.updateOrmEntity({
      entity: MercatifyRequest,
      where: {
        id: parsed.id,
        tenantId,
        ...(orgFilter ? { organizationId: orgFilter } : {}),
        deletedAt: null,
      } as FilterQuery<MercatifyRequest>,
      apply: (rec) => {
        rec.workspacePreview = { builtAt: new Date().toISOString(), sentAt: null, html, moduleIds: modules.map((m) => m.id) }
      },
    })
    if (!updated) throw new CrudHttpError(404, { error: 'Request not found' })
    return updated
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('mercatify.audit.requests.buildWorkspacePreview', 'Build workspace preview'),
      resourceKind: RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId,
      organizationId: result.organizationId,
    }
  },
}

/** Stamps the already-built preview as sent — the client's report page starts showing it. */
const sendWorkspacePreviewCommand: CommandHandler<z.infer<typeof sendWorkspacePreviewSchema>, MercatifyRequest> = {
  id: 'mercatify.requests.sendWorkspacePreview',
  async prepare(input, ctx) {
    const parsed = sendWorkspacePreviewSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const current = await loadForManage(em, ctx, parsed.id)
    if (!current.workspacePreview) {
      throw new CrudHttpError(409, { error: 'Build the workspace preview before sending it.' })
    }
    return null
  },
  async execute(input, ctx) {
    const parsed = sendWorkspacePreviewSchema.parse(input)
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
      apply: (rec) => {
        if (rec.workspacePreview) rec.workspacePreview = { ...rec.workspacePreview, sentAt: new Date().toISOString() }
      },
    })
    if (!updated) throw new CrudHttpError(404, { error: 'Request not found' })
    return updated
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('mercatify.audit.requests.sendWorkspacePreview', 'Send workspace preview to client'),
      resourceKind: RESOURCE_KIND,
      resourceId: String(result.id),
      tenantId: result.tenantId,
      organizationId: result.organizationId,
    }
  },
}

registerCommand(createRequestCommand)
registerCommand(updateRequestCommand)
registerCommand(setCapOverrideCommand)
registerCommand(saveReportCommand)
registerCommand(sendReportCommand)
registerCommand(respondCommand)
registerCommand(labsAnalyzeCommand)
registerCommand(labsAnalyzeWithAiCommand)
registerCommand(buildWorkspacePreviewCommand)
registerCommand(sendWorkspacePreviewCommand)
