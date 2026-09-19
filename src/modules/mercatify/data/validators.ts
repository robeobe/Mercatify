import { z } from 'zod'

export const interviewCaseStatusSchema = z.enum(['draft', 'in_progress', 'completed'])

/**
 * Scope is never accepted from a client: `tenantId` and `organizationId` are
 * derived from the trusted request context inside the commands, so no public
 * schema below declares them.
 */
export const interviewCaseCreateSchema = z.object({
  title: z.string().min(1).max(200),
  status: interviewCaseStatusSchema.default('draft'),
})

export const interviewCaseUpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  status: interviewCaseStatusSchema.optional(),
})

export const interviewCaseListSchema = z.object({
  id: z.string().uuid().optional(),
  status: interviewCaseStatusSchema.optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  sortField: z.enum(['id', 'title', 'status', 'created_at', 'updated_at']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

export type InterviewCaseStatus = z.infer<typeof interviewCaseStatusSchema>
export type InterviewCaseCreateInput = z.infer<typeof interviewCaseCreateSchema>
export type InterviewCaseUpdateInput = z.infer<typeof interviewCaseUpdateSchema>
