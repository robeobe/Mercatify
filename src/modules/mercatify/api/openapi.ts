import { z, type ZodTypeAny } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  createCrudOpenApiFactory,
  createPagedListResponseSchema as createSharedPagedListResponseSchema,
  type CrudOpenApiOptions,
} from '@open-mercato/shared/lib/openapi/crud'

export const mercatifyTag = 'Mercatify'

export const mercatifyOkSchema = z.object({
  ok: z.literal(true),
})

export const mercatifyCreatedSchema = z.object({
  id: z.string().uuid(),
})

export const interviewCaseToolItemSchema = z.object({
  id: z.string().uuid(),
  catalogToolId: z.string().nullable(),
  name: z.string(),
  selectedModuleIds: z.array(z.string()),
  customUse: z.string().nullable(),
  seats: z.number().nullable(),
  monthlyCost: z.number().nullable(),
})

export const interviewCaseListItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    companyName: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    peopleCount: z.number().nullable().optional(),
    currency: z.string().nullable().optional(),
    pains: z.string().nullable().optional(),
    mustKeep: z.string().nullable().optional(),
    tenant_id: z.string().nullable().optional(),
    organization_id: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
    tools: z.array(interviewCaseToolItemSchema).optional(),
    mappingConfirmedAt: z.string().nullable().optional(),
    createdByUserId: z.string().nullable().optional(),
    submittedAt: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    whoseTurn: z.enum(['mercatify', 'client']).optional(),
    progress: z.array(z.object({
      key: z.enum(['sent', 'review', 'report', 'decision']),
      state: z.enum(['done', 'current', 'pending']),
      at: z.string().nullable(),
    })).optional(),
  })
  .passthrough()

export const mappingRowListItemSchema = z
  .object({
    id: z.string(),
    caseId: z.string(),
    position: z.number(),
    capability: z.string(),
    decision: z.string(),
    targetKind: z.string(),
    targetModuleId: z.string().nullable().optional(),
    targetToolName: z.string().nullable().optional(),
    targetLabel: z.string().nullable().optional(),
    justification: z.string(),
    confidence: z.string(),
    flagged: z.boolean(),
    flagReason: z.string().nullable().optional(),
    tenant_id: z.string().nullable().optional(),
    organization_id: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
  })
  .passthrough()

export function createMercatifyPagedListResponseSchema(itemSchema: ZodTypeAny) {
  return createSharedPagedListResponseSchema(itemSchema, { paginationMetaOptional: true })
}

const buildMercatifyCrudOpenApi = createCrudOpenApiFactory({
  defaultTag: mercatifyTag,
  defaultCreateResponseSchema: mercatifyCreatedSchema,
  defaultOkResponseSchema: mercatifyOkSchema,
  makeListDescription: ({ pluralLower }) =>
    `Returns a paginated collection of ${pluralLower} in the current tenant scope.`,
})

export function createMercatifyCrudOpenApi(options: CrudOpenApiOptions): OpenApiRouteDoc {
  return buildMercatifyCrudOpenApi(options)
}
