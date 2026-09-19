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

export const handoffDocumentListItemSchema = z
  .object({
    id: z.string(),
    handoffDocument: z.string().nullable().optional(),
    mappingConfirmedAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
  })
  .passthrough()

/**
 * S-09's report model. Documented loosely on purpose: the exact shape is owned
 * by `lib/report.ts`'s `ReportModel` type and is a rendering contract between
 * this route and its own components, not a stable public payload.
 */
export const reportModelSchema = z.object({
  currency: z.string().nullable(),
  companyName: z.string().nullable(),
  headline: z.object({ kind: z.enum(['override', 'computed']) }).passthrough(),
  summary: z.array(z.object({ key: z.string() }).passthrough()),
  kpis: z.object({}).passthrough(),
  verdict: z.array(z.object({ decision: z.string(), count: z.number(), share: z.number() })),
  toolGroups: z.array(z.object({ toolName: z.string().nullable() }).passthrough()),
  duplicates: z.array(z.object({ capability: z.string(), tools: z.array(z.string()) })),
  savings: z.object({}).passthrough(),
  backlog: z.object({}).passthrough(),
  cashCurve: z.object({}).passthrough().nullable(),
  pains: z.string().nullable(),
  mustKeep: z.string().nullable(),
  openQuestions: z.array(z.object({ key: z.string() }).passthrough()),
}).passthrough()

export const reportInputsItemSchema = z.object({
  headline: z.string().nullable(),
  notes: z.string().nullable(),
  analyst: z.string().nullable(),
  openQuestions: z.string().nullable(),
  hourlyRate: z.number().nullable(),
  implementationMonths: z.number().nullable(),
  buildEstimates: z.record(z.string(), z.number()),
})

export const reportResponseSchema = z.object({
  report: reportModelSchema,
  /** The raw inputs the model was derived from, so the builder can re-derive the preview locally. */
  derivation: z.object({
    profile: z.object({}).passthrough(),
    rows: z.array(z.object({ id: z.string(), capability: z.string() }).passthrough()),
    stack: z.array(z.object({ name: z.string(), monthlyCost: z.number().nullable(), seats: z.number().nullable() })),
    costs: z.object({ omOperatingCost: z.number().nullable(), implementationCost: z.number().nullable() }),
  }),
  inputs: reportInputsItemSchema,
  status: z.string(),
  mappingConfirmedAt: z.string().nullable(),
  costsEntered: z.boolean(),
  caseUpdatedAt: z.string(),
  reportUpdatedAt: z.string().nullable(),
  sentAt: z.string().nullable(),
})

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
