import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import type { Where, WhereValue } from '@open-mercato/shared/lib/query/types'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { InterviewCase } from '../../data/entities'
import { handoffDocumentListSchema, handoffDocumentUpdateSchema } from '../../data/validators'
import {
  createMercatifyCrudOpenApi,
  createMercatifyPagedListResponseSchema,
  mercatifyOkSchema,
  handoffDocumentListItemSchema,
} from '../openapi'

const ENTITY_ID = 'mercatify:interview_case' as const

type Query = typeof handoffDocumentListSchema._output

type BaseFields = {
  id: string
  handoff_document: string | null
  mapping_confirmed_at: Date | string | null
  updated_at: Date | string | null
}

// Deliberately narrow: this is a SEPARATE route from `api/cases/route.ts`,
// gated by its own admin-only features, so the handoff document is never
// returned to a session that only holds `mercatify.cases.view` (the client
// role — see the plan's Current State Analysis).
const baseListFields = ['id', 'handoff_document', 'mapping_confirmed_at', 'updated_at']

function toIsoTimestamp(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  return null
}

// No `actions.create`/`actions.delete`, and no `POST`/`DELETE` exported below:
// the document is only ever materialized by `mercatify.handoff.generate` and
// never independently created or deleted.
export const { metadata, GET, PUT } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['mercatify.handoff.view'] },
    PUT: { requireAuth: true, requireFeatures: ['mercatify.handoff.manage'] },
  },
  orm: {
    entity: InterviewCase,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: handoffDocumentListSchema,
    entityId: ENTITY_ID,
    fields: baseListFields,
    buildFilters: async (q: Query): Promise<Where<BaseFields>> => {
      const filters: Where<BaseFields> = {}
      const F = filters as Record<string, WhereValue>
      if (q.ids) {
        const ids = q.ids.split(',').map((value) => value.trim()).filter((value) => value.length > 0)
        if (ids.length > 0) F.id = { $in: ids }
      }
      if (q.id) F.id = q.id
      return filters
    },
    transformItem: (item: BaseFields) => ({
      id: String(item.id),
      handoffDocument: item.handoff_document ?? null,
      mappingConfirmedAt: toIsoTimestamp(item.mapping_confirmed_at),
      updatedAt: toIsoTimestamp(item.updated_at),
    }),
  },
  actions: {
    update: {
      commandId: 'mercatify.handoff.update',
      schema: handoffDocumentUpdateSchema,
      mapInput: ({ parsed }) => parsed,
      response: () => ({ ok: true }),
    },
  },
})

export const openApi: OpenApiRouteDoc = createMercatifyCrudOpenApi({
  resourceName: 'Handoff document',
  pluralName: 'Handoff documents',
  querySchema: handoffDocumentListSchema,
  listResponseSchema: createMercatifyPagedListResponseSchema(handoffDocumentListItemSchema),
  update: {
    schema: handoffDocumentUpdateSchema,
    description: 'Replaces the handoff document\'s content. Independent of the mapping table — never re-derived.',
    responseSchema: mercatifyOkSchema,
  },
})
