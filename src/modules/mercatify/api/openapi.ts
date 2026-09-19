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

export const interviewCaseListItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
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
