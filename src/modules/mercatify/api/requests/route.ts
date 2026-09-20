import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { MercatifyRequest, type MercatifyCapOverride, type MercatifyClientResponse, type MercatifyLabsResult, type MercatifyReport, type MercatifyWorkspacePreview } from '../../data/entities'
import { requestCreateSchema, requestUpdateSchema } from '../../commands/requests'
import {
  createMercatifyCrudOpenApi,
  createMercatifyPagedListResponseSchema,
  mercatifyOkSchema,
  mercatifyCreatedSchema,
} from '../openapi'

// Segment after the colon must PascalCase to the exact entity class name
// (MercatifyRequest) — the query engine's table-name resolver derives the
// table from that convention rather than from `orm.entity` here.
const ENTITY_ID = 'mercatify:mercatify_request' as const

const id = 'id'
const company = 'company'
const industry = 'industry'
const people_count = 'people_count'
const currency = 'currency'
const status = 'status'
const owner_user_id = 'owner_user_id'
const owner_name = 'owner_name'
const pains = 'pains'
const must_keep = 'must_keep'
const tools = 'tools'
const overrides = 'overrides'
const mapped_at = 'mapped_at'
const report = 'report'
const sent_at = 'sent_at'
const client_response = 'client_response'
const labs_result = 'labs_result'
const workspace_preview = 'workspace_preview'
const tenant_id = 'tenant_id'
const organization_id = 'organization_id'
const submitted_by_user_id = 'submitted_by_user_id'
const created_at = 'created_at'
const updated_at = 'updated_at'

const listFields = [
  id, company, industry, people_count, currency, status,
  owner_user_id, owner_name, pains, must_keep, tools,
  overrides, mapped_at, report, sent_at, client_response, labs_result, workspace_preview,
  tenant_id, organization_id, submitted_by_user_id, created_at, updated_at,
]

const statusSchema = z.enum(['new', 'mapping', 'mapped', 'sent', 'accepted', 'consult'])

const querySchema = z
  .object({
    id: z.string().uuid().optional(),
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(50),
    status: statusSchema.optional(),
    // Scoped to the caller, not the whole organization — several colleagues in
    // the same org may each have their own request, and "have I already sent
    // mine" must not be answered by someone else's row.
    mine: z.coerce.boolean().optional(),
    sortField: z.string().optional().default('created_at'),
    sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .passthrough()

type Query = z.infer<typeof querySchema>

const toolItemSchema = z.object({
  name: z.string(),
  seats: z.number().nullable().optional(),
  monthly: z.number().nullable().optional(),
  caps: z.array(z.string()),
})

const capOverrideSchema = z.object({
  module: z.string().optional(),
  status: z.enum(['native', 'configure', 'build', 'integrate', 'keep']).optional(),
  note: z.string().optional(),
  conf: z.enum(['high', 'medium', 'low']).optional(),
})

const reportSchema = z.object({
  headline: z.string().optional(),
  notes: z.string().optional(),
  generatedAt: z.string().optional(),
  assumptions: z.object({
    analyst: z.string().optional(),
    switchingCost: z.number().optional(),
    hosting: z.number().optional(),
    months: z.number().optional(),
    notes: z.string().optional(),
  }).optional(),
})

const clientResponseSchema = z.object({
  kind: z.enum(['accepted', 'consult']),
  at: z.string(),
  message: z.string().optional(),
})

const labsTraceStepSchema = z.object({
  seq: z.number(),
  agentId: z.string(),
  agentLabel: z.string(),
  agentRole: z.string(),
  status: z.enum(['running', 'done', 'error']),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  durationMs: z.number().optional(),
  inputPreview: z.string(),
  outputPreview: z.string().optional(),
  error: z.string().optional(),
  toolCalls: z.array(z.object({
    tool: z.string(),
    argsPreview: z.string(),
    resultPreview: z.string().optional(),
    error: z.string().optional(),
  })),
})

// `result` is opaque on purpose — see MercatifyLabsResult's own comment in
// data/entities.ts. `trace` is typed since the console renders it directly.
const labsResultSchema = z.object({
  mode: z.enum(['deterministic', 'ai']),
  ranAt: z.string(),
  model: z.string().optional(),
  excludedTools: z.array(z.string()),
  result: z.unknown(),
  html: z.string(),
  trace: z.array(labsTraceStepSchema),
})

const workspacePreviewSchema = z.object({
  builtAt: z.string(),
  sentAt: z.string().nullable(),
  html: z.string(),
  moduleIds: z.array(z.string()),
})

const requestListItemSchema = z.object({
  id: z.string(),
  company: z.string(),
  industry: z.string().nullable().optional(),
  people_count: z.number().nullable().optional(),
  currency: z.string(),
  status: statusSchema,
  owner_user_id: z.string().nullable().optional(),
  owner_name: z.string().nullable().optional(),
  pains: z.string().nullable().optional(),
  must_keep: z.string().nullable().optional(),
  tools: z.array(toolItemSchema),
  overrides: z.record(z.string(), capOverrideSchema).nullable().optional(),
  mapped_at: z.string().nullable().optional(),
  report: reportSchema.nullable().optional(),
  sent_at: z.string().nullable().optional(),
  client_response: clientResponseSchema.nullable().optional(),
  labs_result: labsResultSchema.nullable().optional(),
  workspace_preview: workspacePreviewSchema.nullable().optional(),
  tenant_id: z.string().nullable().optional(),
  organization_id: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
})

type RequestFields = {
  id: string
  company: string
  industry: string | null
  people_count: number | null
  currency: string
  status: string
  owner_user_id: string | null
  owner_name: string | null
  pains: string | null
  must_keep: string | null
  tools: { name: string; seats?: number | null; monthly?: number | null; caps: string[] }[]
  overrides: Record<string, MercatifyCapOverride> | null
  mapped_at: Date | string | null
  report: MercatifyReport | null
  sent_at: Date | string | null
  client_response: MercatifyClientResponse | null
  labs_result: MercatifyLabsResult | null
  workspace_preview: MercatifyWorkspacePreview | null
  tenant_id: string | null
  organization_id: string | null
  created_at: Date
  updated_at: Date | string | null
}

function toIsoTimestamp(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  return null
}

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['mercatify.requests.view'] },
    POST: { requireAuth: true, requireFeatures: ['mercatify.requests.submit'] },
    PUT: { requireAuth: true, requireFeatures: ['mercatify.requests.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['mercatify.requests.manage'] },
  },
  orm: {
    entity: MercatifyRequest,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: querySchema,
    entityId: ENTITY_ID,
    fields: listFields,
    sortFieldMap: { id, company, status, created_at, updated_at, updatedAt: updated_at },
    buildFilters: async (query: Query, ctx: CrudCtx) => {
      const filters: Record<string, unknown> = {}
      if (query.id) filters.id = query.id
      if (query.status) filters.status = query.status
      if (query.mine) {
        const userId = ctx.auth?.sub
        filters.submitted_by_user_id = userId ?? '__none__'
      }
      return filters
    },
    transformItem: (item: RequestFields) => ({
      id: String(item.id),
      company: item.company,
      industry: item.industry ?? null,
      people_count: item.people_count ?? null,
      currency: item.currency,
      status: item.status,
      owner_user_id: item.owner_user_id ?? null,
      owner_name: item.owner_name ?? null,
      pains: item.pains ?? null,
      must_keep: item.must_keep ?? null,
      tools: Array.isArray(item.tools) ? item.tools : [],
      overrides: item.overrides ?? null,
      mapped_at: toIsoTimestamp(item.mapped_at),
      report: item.report ?? null,
      sent_at: toIsoTimestamp(item.sent_at),
      client_response: item.client_response ?? null,
      labs_result: item.labs_result ?? null,
      workspace_preview: item.workspace_preview ?? null,
      tenant_id: item.tenant_id ?? null,
      organization_id: item.organization_id ?? null,
      created_at: toIsoTimestamp(item.created_at),
      updatedAt: toIsoTimestamp(item.updated_at),
    }),
  },
  actions: {
    create: {
      commandId: 'mercatify.requests.create',
      schema: requestCreateSchema,
      mapInput: ({ parsed }) => parsed,
      response: ({ result }) => ({ id: String(result.id) }),
      status: 201,
    },
    update: {
      commandId: 'mercatify.requests.update',
      schema: requestUpdateSchema,
      mapInput: ({ parsed }) => parsed,
      response: ({ result }) => ({ ok: true, status: result.status, updatedAt: toIsoTimestamp(result.updatedAt) }),
    },
  },
})

export const openApi = createMercatifyCrudOpenApi({
  resourceName: 'Stack request',
  pluralName: 'Stack requests',
  querySchema,
  listResponseSchema: createMercatifyPagedListResponseSchema(requestListItemSchema),
  create: {
    schema: requestCreateSchema,
    responseSchema: mercatifyCreatedSchema,
    description: 'Submits a SaaS stack request for the caller\'s organization.',
  },
  update: {
    schema: requestUpdateSchema,
    responseSchema: mercatifyOkSchema,
    description: 'Updates the status/owner of a stack request (mercatify.requests.manage).',
  },
})
