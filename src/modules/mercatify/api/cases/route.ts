import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import type { Where, WhereValue } from '@open-mercato/shared/lib/query/types'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { InterviewCase } from '../../data/entities'
import {
  interviewCaseCreateSchema,
  interviewCaseListSchema,
  interviewCaseUpdateSchema,
} from '../../data/validators'
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
  tenant_id: string | null
  organization_id: string | null
  created_at: Date
  updated_at: Date | string | null
}

const baseListFields = ['id', 'title', 'status', 'tenant_id', 'organization_id', 'created_at', 'updated_at']

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
      if (q.id) F.id = q.id
      if (q.status) F.status = q.status
      return filters
    },
    transformItem: (item: BaseFields) => ({
      id: String(item.id),
      title: String(item.title),
      status: String(item.status),
      tenant_id: item.tenant_id ?? null,
      organization_id: item.organization_id ?? null,
      updatedAt: toIsoTimestamp(item.updated_at),
    }),
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
  // `del`, not `delete` — the OpenAPI options key differs from the
  // `makeCrudRoute` action key of the same concept.
  del: {
    description: 'Soft-deletes an interview case by id.',
    responseSchema: mercatifyOkSchema,
  },
})
