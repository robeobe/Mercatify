import { z } from 'zod'

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
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  sortField: z.enum(['id', 'title', 'status', 'created_at', 'updated_at']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

export type InterviewCaseStatus = z.infer<typeof interviewCaseStatusSchema>
export type InterviewCaseToolInput = z.infer<typeof interviewCaseToolSchema>
export type InterviewCaseCreateInput = z.infer<typeof interviewCaseCreateSchema>
export type InterviewCaseUpdateInput = z.infer<typeof interviewCaseUpdateSchema>
