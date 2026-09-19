import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import type { Where, WhereValue } from '@open-mercato/shared/lib/query/types'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { MappingRow } from '../../data/entities'
import { mappingRowListSchema, mappingRowUpdateSchema } from '../../data/validators'
import {
  createMercatifyCrudOpenApi,
  createMercatifyPagedListResponseSchema,
  mercatifyOkSchema,
  mappingRowListItemSchema,
} from '../openapi'

const ENTITY_ID = 'mercatify:mapping_row' as const

type Query = typeof mappingRowListSchema._output

type BaseFields = {
  id: string
  case_id: string
  position: number
  capability: string
  source: string
  decision: string
  target_kind: string
  target_module_id: string | null
  target_tool_name: string | null
  target_label: string | null
  justification: string
  confidence: string
  flagged: boolean
  flag_reason: string | null
  tenant_id: string | null
  organization_id: string | null
  updated_at: Date | string | null
}

const baseListFields = [
  'id', 'case_id', 'position', 'capability', 'source', 'decision', 'target_kind', 'target_module_id',
  'target_tool_name', 'target_label', 'justification', 'confidence', 'flagged', 'flag_reason',
  'tenant_id', 'organization_id', 'updated_at',
]

const sortFieldMap: Record<string, string> = {
  position: 'position',
  created_at: 'created_at',
  updated_at: 'updated_at',
}

function toIsoTimestamp(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  return null
}

// No `actions.create`/`actions.delete`, and no `POST`/`DELETE` exported below:
// rows are only ever materialized by `mercatify.mapping.generate` and never
// individually created or deleted by an admin.
export const { metadata, GET, PUT } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['mercatify.mapping.view'] },
    PUT: { requireAuth: true, requireFeatures: ['mercatify.mapping.manage'] },
  },
  orm: {
    entity: MappingRow,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: null,
  },
  list: {
    schema: mappingRowListSchema,
    entityId: ENTITY_ID,
    fields: baseListFields,
    sortFieldMap,
    buildFilters: async (q: Query): Promise<Where<BaseFields>> => {
      const filters: Where<BaseFields> = {}
      const F = filters as Record<string, WhereValue>
      // `caseId` is required by `mappingRowListSchema`, so a request missing it
      // 400s before this resolver runs.
      F.case_id = q.caseId
      return filters
    },
    transformItem: (item: BaseFields) => ({
      id: String(item.id),
      caseId: String(item.case_id),
      position: Number(item.position),
      capability: String(item.capability),
      // The intake tool the row was derived from. `lib/savings.ts` groups by
      // it, so the client needs it to line rows up against the stack.
      source: String(item.source),
      decision: String(item.decision),
      targetKind: String(item.target_kind),
      targetModuleId: item.target_module_id ?? null,
      targetToolName: item.target_tool_name ?? null,
      targetLabel: item.target_label ?? null,
      justification: String(item.justification),
      confidence: String(item.confidence),
      flagged: Boolean(item.flagged),
      flagReason: item.flag_reason ?? null,
      tenant_id: item.tenant_id ?? null,
      organization_id: item.organization_id ?? null,
      updatedAt: toIsoTimestamp(item.updated_at),
    }),
  },
  actions: {
    update: {
      commandId: 'mercatify.mapping.rows.update',
      schema: mappingRowUpdateSchema,
      mapInput: ({ parsed }) => parsed,
      response: () => ({ ok: true }),
    },
  },
})

export const openApi: OpenApiRouteDoc = createMercatifyCrudOpenApi({
  resourceName: 'Mapping row',
  pluralName: 'Mapping rows',
  querySchema: mappingRowListSchema,
  listResponseSchema: createMercatifyPagedListResponseSchema(mappingRowListItemSchema),
  update: {
    schema: mappingRowUpdateSchema,
    description: 'Updates a mapping row\'s decision and justification. Rejected with 409 once the mapping is confirmed.',
    responseSchema: mercatifyOkSchema,
  },
})
