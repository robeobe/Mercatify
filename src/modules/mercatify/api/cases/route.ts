import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import type { Where, WhereValue } from '@open-mercato/shared/lib/query/types'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { EntityManager } from '@mikro-orm/postgresql'
import { InterviewCase, InterviewCaseTool } from '../../data/entities'
import {
  interviewCaseCreateSchema,
  interviewCaseListSchema,
  interviewCaseUpdateSchema,
} from '../../data/validators'
import { serializeTool } from '../../lib/case-tools'
import {
  createMercatifyCrudOpenApi,
  createMercatifyPagedListResponseSchema,
  mercatifyCreatedSchema,
  mercatifyOkSchema,
  interviewCaseListItemSchema,
} from '../openapi'

const ENTITY_ID = 'mercatify:interview_case' as const

type Query = typeof interviewCaseListSchema._output

type BaseFields = {
  id: string
  title: string
  status: string
  company_name: string | null
  industry: string | null
  people_count: number | null
  currency: string | null
  pains: string | null
  must_keep: string | null
  tenant_id: string | null
  organization_id: string | null
  created_at: Date
  updated_at: Date | string | null
}

const baseListFields = [
  'id',
  'title',
  'status',
  'company_name',
  'industry',
  'people_count',
  'currency',
  'pains',
  'must_keep',
  'tenant_id',
  'organization_id',
  'created_at',
  'updated_at',
]

const sortFieldMap: Record<string, string> = {
  id: 'id',
  title: 'title',
  status: 'status',
  created_at: 'created_at',
  updated_at: 'updated_at',
  updatedAt: 'updated_at',
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
    GET: { requireAuth: true, requireFeatures: ['mercatify.cases.view'] },
    POST: { requireAuth: true, requireFeatures: ['mercatify.cases.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['mercatify.cases.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['mercatify.cases.manage'] },
  },
  orm: {
    entity: InterviewCase,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  events: { module: 'mercatify', entity: 'case', persistent: true },
  indexer: { entityType: ENTITY_ID },
  list: {
    schema: interviewCaseListSchema,
    entityId: ENTITY_ID,
    fields: baseListFields,
    sortFieldMap,
    buildFilters: async (q: Query): Promise<Where<BaseFields>> => {
      const filters: Where<BaseFields> = {}
      const F = filters as Record<string, WhereValue>
      if (q.ids) {
        const ids = q.ids.split(',').map((value) => value.trim()).filter((value) => value.length > 0)
        if (ids.length > 0) F.id = { $in: ids }
      }
      if (q.id) F.id = q.id
      if (q.status) F.status = q.status
      return filters
    },
    transformItem: (item: BaseFields) => ({
      id: String(item.id),
      title: String(item.title),
      status: String(item.status),
      companyName: item.company_name ?? null,
      industry: item.industry ?? null,
      peopleCount: item.people_count ?? null,
      currency: item.currency ?? null,
      pains: item.pains ?? null,
      mustKeep: item.must_keep ?? null,
      tenant_id: item.tenant_id ?? null,
      organization_id: item.organization_id ?? null,
      updatedAt: toIsoTimestamp(item.updated_at),
      tools: [] as ReturnType<typeof serializeTool>[],
    }),
  },
  hooks: {
    afterList: async (res, ctx: CrudCtx & { query: Query }) => {
      const items = Array.isArray(res?.items) ? res.items as Array<{ id: string; tools?: unknown }> : []
      if (items.length === 0) return
      const tenantId = ctx.auth?.tenantId
      const organizationId = ctx.selectedOrganizationId ?? ctx.organizationScope?.selectedId ?? null
      if (!tenantId || !organizationId) return
      const em = ctx.container.resolve('em') as EntityManager
      const tools = await em.find(InterviewCaseTool, {
        interviewCase: { $in: items.map((item) => item.id) },
        tenantId,
        organizationId,
      })
      const grouped = new Map<string, InterviewCaseTool[]>()
      for (const tool of tools) {
        const caseId = String(typeof tool.interviewCase === 'object' && tool.interviewCase
          ? tool.interviewCase.id
          : tool.interviewCase)
        const list = grouped.get(caseId) ?? []
        list.push(tool)
        grouped.set(caseId, list)
      }
      for (const item of items) {
        item.tools = (grouped.get(item.id) ?? [])
          .slice()
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map(serializeTool)
      }
    },
  },
  actions: {
    create: {
      commandId: 'mercatify.cases.create',
      schema: interviewCaseCreateSchema,
      mapInput: ({ parsed }) => parsed,
      response: ({ result }) => ({ id: String(result.id) }),
      status: 201,
    },
    update: {
      commandId: 'mercatify.cases.update',
      schema: interviewCaseUpdateSchema,
      mapInput: ({ parsed }) => parsed,
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'mercatify.cases.delete',
      response: () => ({ ok: true }),
    },
  },
})

export const openApi: OpenApiRouteDoc = createMercatifyCrudOpenApi({
  resourceName: 'Interview case',
  pluralName: 'Interview cases',
  querySchema: interviewCaseListSchema,
  listResponseSchema: createMercatifyPagedListResponseSchema(interviewCaseListItemSchema),
  create: {
    schema: interviewCaseCreateSchema,
    description: 'Creates an interview case in the current tenant and organization scope.',
    responseSchema: mercatifyCreatedSchema,
  },
  update: {
    schema: interviewCaseUpdateSchema,
    description: 'Updates an existing interview case by id.',
    responseSchema: mercatifyOkSchema,
  },
  del: {
    description: 'Soft-deletes an interview case by id.',
    responseSchema: mercatifyOkSchema,
  },
})
