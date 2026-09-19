import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  createCrudOpenApiFactory,
  createPagedListResponseSchema,
  type CrudOpenApiOptions,
} from '@open-mercato/shared/lib/openapi/crud'

export const mercatifyTag = 'Mercatify'

export const mercatifyOkSchema = z.object({ ok: z.literal(true) })
export const mercatifyCreatedSchema = z.object({ id: z.string().uuid() })

export function createMercatifyPagedListResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return createPagedListResponseSchema(itemSchema, { paginationMetaOptional: true })
}

const buildMercatifyCrudOpenApi = createCrudOpenApiFactory({
  defaultTag: mercatifyTag,
  defaultCreateResponseSchema: mercatifyCreatedSchema,
  defaultOkResponseSchema: mercatifyOkSchema,
  makeListDescription: ({ pluralLower }) => `Returns a paginated collection of ${pluralLower} in the current tenant scope.`,
})

export function createMercatifyCrudOpenApi(options: CrudOpenApiOptions): OpenApiRouteDoc {
  return buildMercatifyCrudOpenApi(options)
}
