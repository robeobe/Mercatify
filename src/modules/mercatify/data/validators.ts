import { z } from 'zod'
import { MercatifyDecisionSchema } from '../lib/mercatify-lab-port'

export const interviewCaseStatusSchema = z.enum([
  'draft',
  'new',
  'mapping',
  'mapped',
  'sent',
  'accepted',
  'consult',
])

/**
 * Scope is never accepted from a client: `tenantId` and `organizationId` are
 * derived from the trusted request context inside the commands, so no public
 * schema below declares them.
 *
 * `title` is server-derived from `companyName` and is not part of the public
 * write contract.
 */
export const interviewCaseToolSchema = z.object({
  id: z.string().uuid().optional(),
  catalogToolId: z.string().nullable().optional(),
  name: z.string().min(1),
  selectedModuleIds: z.array(z.string()).default([]),
  customUse: z.string().nullable().optional(),
  seats: z.number().int().nonnegative().nullable().optional(),
  monthlyCost: z.number().nonnegative().nullable().optional(),
})

const profileFields = {
  companyName: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  peopleCount: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().nullable().optional(),
  pains: z.string().nullable().optional(),
  mustKeep: z.string().nullable().optional(),
}

export const interviewCaseCreateSchema = z.object({
  status: interviewCaseStatusSchema.default('draft'),
  ...profileFields,
  tools: z.array(interviewCaseToolSchema).default([]),
})

export const interviewCaseUpdateSchema = z.object({
  id: z.string().uuid(),
  status: interviewCaseStatusSchema.optional(),
  ...profileFields,
  // Optional with no default: omitting `tools` leaves existing rows unchanged.
  tools: z.array(interviewCaseToolSchema).optional(),
})

export const interviewCaseListSchema = z.object({
  id: z.string().uuid().optional(),
  ids: z.string().optional(),
  status: interviewCaseStatusSchema.optional(),
  mine: z.coerce.boolean().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  sortField: z.enum(['id', 'title', 'status', 'created_at', 'updated_at']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

export type InterviewCaseStatus = z.infer<typeof interviewCaseStatusSchema>
export type InterviewCaseToolInput = z.infer<typeof interviewCaseToolSchema>
export type InterviewCaseCreateInput = z.infer<typeof interviewCaseCreateSchema>
export type InterviewCaseUpdateInput = z.infer<typeof interviewCaseUpdateSchema>

/**
 * Only `decision` and `justification` are admin-editable (S-03 acceptance
 * criteria). `confidence`, `capability` and `target` are the analysis's own
 * output and are never accepted from a client here.
 */
export const mappingRowUpdateSchema = z.object({
  id: z.string().uuid(),
  decision: MercatifyDecisionSchema,
  justification: z.string().min(1).max(2000),
})

export const mappingRowListSchema = z.object({
  caseId: z.string().uuid(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  sortField: z.enum(['position', 'created_at', 'updated_at']).optional().default('position'),
  sortDir: z.enum(['asc', 'desc']).optional().default('asc'),
})

export const mappingGenerateSchema = z.object({ caseId: z.string().uuid() })
export const mappingConfirmSchema = z.object({ caseId: z.string().uuid() })

export type MappingRowUpdateInput = z.infer<typeof mappingRowUpdateSchema>
export type MappingRowListInput = z.infer<typeof mappingRowListSchema>
export type MappingGenerateInput = z.infer<typeof mappingGenerateSchema>
export type MappingConfirmInput = z.infer<typeof mappingConfirmSchema>

/**
 * S-04: OM operating cost and implementation cost are customer-provided
 * inputs (never computed by the analysis — see `lib/savings.ts`), entered by
 * an admin independently of the intake profile, so this is deliberately not
 * part of `interviewCaseUpdateSchema`.
 */
export const interviewCaseCostsSchema = z.object({
  id: z.string().uuid(),
  omOperatingCost: z.number().nonnegative().nullable().optional(),
  implementationCost: z.number().nonnegative().nullable().optional(),
})

export type InterviewCaseCostsInput = z.infer<typeof interviewCaseCostsSchema>

/**
 * The handoff document is independent of the mapping table (PRD Open
 * Question 8, resolved): `content` is a free-form replacement, never a
 * derived/serialized view of `MappingRow`.
 */
export const handoffDocumentListSchema = z.object({
  id: z.string().uuid().optional(),
  ids: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
})

export const handoffDocumentGenerateSchema = z.object({ caseId: z.string().uuid() })

export const handoffDocumentUpdateSchema = z.object({
  id: z.string().uuid(),
  content: z.string().max(200_000),
})

export type HandoffDocumentListInput = z.infer<typeof handoffDocumentListSchema>
export type HandoffDocumentGenerateInput = z.infer<typeof handoffDocumentGenerateSchema>
export type HandoffDocumentUpdateInput = z.infer<typeof handoffDocumentUpdateSchema>

/**
 * S-09: the report's inputs are only what a human types while composing it.
 * Every figure the client reads is derived on read (`lib/report.ts`), so no
 * KPI, saving line or total is ever accepted from a client here.
 *
 * `hourlyRate` turns backlog hours into money and is deliberately separate
 * from S-04's customer-provided `implementationCost` — the two are never
 * blended.
 */
export const reportInputsSchema = z.object({
  caseId: z.string().uuid(),
  headline: z.string().max(300).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  analyst: z.string().max(200).nullable().optional(),
  openQuestions: z.string().max(5000).nullable().optional(),
  hourlyRate: z.number().nonnegative().nullable().optional(),
  implementationMonths: z.number().int().min(1).max(24).nullable().optional(),
  // Keyed by `MappingRow.id`; a null or missing value means "to estimate",
  // which is not the same as zero hours.
  buildEstimates: z.record(z.string().uuid(), z.number().nonnegative().nullable()).optional(),
})

export const reportQuerySchema = z.object({ caseId: z.string().uuid() })
export const reportSendSchema = z.object({ caseId: z.string().uuid() })

export type ReportInputsInput = z.infer<typeof reportInputsSchema>
export type ReportQueryInput = z.infer<typeof reportQuerySchema>
export type ReportSendInput = z.infer<typeof reportSendSchema>

/**
 * S-10: the client's answer to a sent report. Only the answer itself is
 * accepted from the client — no status string, so `mercatify.cases.answer`
 * stays the only path that can produce `accepted`/`consult`.
 */
export const caseAnswerSchema = z.object({
  caseId: z.string().uuid(),
  answer: z.enum(['accepted', 'consult']),
})

export type CaseAnswerInput = z.infer<typeof caseAnswerSchema>
