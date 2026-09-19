import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { EntityManager } from '@mikro-orm/postgresql'
import { badRequest } from '@open-mercato/shared/lib/crud/errors'
import { InterviewCase, InterviewCaseTool } from '../../data/entities'
import {
  interviewCaseCreateSchema,
  interviewCaseListSchema,
  interviewCaseUpdateSchema,
} from '../../data/validators'
import { serializeTool } from '../../lib/case-tools'
import { buildInterviewCaseListFilters } from '../../lib/case-list-filters'
import { buildClientRequestView } from '../../lib/request-progress'
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
  created_by_user_id: string | null
  submitted_at: Date | string | null
  created_at: Date
  updated_at: Date | string | null
  mapping_confirmed_at: Date | string | null
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
  'created_by_user_id',
  'submitted_at',
  'created_at',
  'updated_at',
  'mapping_confirmed_at',
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

type RbacService = {
  userHasAllFeatures: (
    userId: string,
    features: string[],
    scope: { tenantId: string | null; organizationId: string | null },
  ) => Promise<boolean>
}

async function canSeeAllOrgCases(ctx: CrudCtx): Promise<boolean> {
  const userId = ctx.auth?.sub
  if (!userId) return false
  try {
    const rbac = ctx.container.resolve('rbacService') as RbacService
    const tenantId = ctx.auth?.tenantId ?? null
    const organizationId = ctx.selectedOrganizationId ?? ctx.organizationScope?.selectedId ?? null
    return await rbac.userHasAllFeatures(userId, ['mercatify.mapping.view'], { tenantId, organizationId })
  } catch {
    return false
  }
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
    buildFilters: async (q: Query, ctx: CrudCtx) => {
      const built = buildInterviewCaseListFilters({
        id: q.id,
        ids: q.ids,
        status: q.status,
        mine: q.mine,
        actorUserId: ctx.auth?.sub ? String(ctx.auth.sub) : null,
        canSeeAllOrgCases: await canSeeAllOrgCases(ctx),
      })
      if (!built.ok) throw badRequest('User context is required')
      return built.filters
    },
    transformItem: (item: BaseFields) => {
      const submittedAt = toIsoTimestamp(item.submitted_at)
      const view = buildClientRequestView(String(item.status), submittedAt)
      return {
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
        createdByUserId: item.created_by_user_id ?? null,
        submittedAt,
        createdAt: toIsoTimestamp(item.created_at),
        updatedAt: toIsoTimestamp(item.updated_at),
        mappingConfirmedAt: toIsoTimestamp(item.mapping_confirmed_at),
        whoseTurn: view.whoseTurn,
        progress: view.progress,
        tools: [] as ReturnType<typeof serializeTool>[],
      }
    },
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
