import { z } from 'zod'

export const MercatifyDecisionSchema = z.enum(['native', 'configure', 'build', 'integrate', 'keep'])
export const MercatifyConfidenceSchema = z.enum(['high', 'medium', 'low'])

export const MercatifyMappingTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('om_module'), moduleId: z.string() }),
  z.object({ kind: z.literal('external_tool'), name: z.string() }),
  z.object({ kind: z.literal('unmapped') }), // FR-006: flagged, never silently dropped
])

export const MercatifyMappingRowSchema = z.object({
  capability: z.string(),
  decision: MercatifyDecisionSchema,
  target: MercatifyMappingTargetSchema,
  justification: z.string(),
  confidence: MercatifyConfidenceSchema, // guardrail: band only, never a percentage
})

export const MercatifyDiscoveryQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  chips: z.array(z.string()),
})

export const MercatifyEvaluationRequestSchema = z.object({
  contractVersion: z.literal(1),
  tenantId: z.string(),
  organizationId: z.string(),
  caseId: z.string(),
  companyProfile: z.record(z.string(), z.unknown()), // shape owned by F-01's case entity; kept loose until it ships
  saasTools: z.array(z.object({ name: z.string(), monthlyCost: z.number(), notes: z.string().optional() })),
  answers: z.array(z.object({ questionId: z.string(), chip: z.string().optional(), freeText: z.string().optional() })),
  freeText: z.array(z.string()).optional(),
})

export const MercatifyEvaluationResultSchema = z.discriminatedUnion('status', [
  z.object({ contractVersion: z.literal(1), status: z.literal('needs_more_info'), question: MercatifyDiscoveryQuestionSchema }),
  z.object({ contractVersion: z.literal(1), status: z.literal('complete'), mapping: z.array(MercatifyMappingRowSchema) }),
])

export type MercatifyEvaluationRequest = z.infer<typeof MercatifyEvaluationRequestSchema>
export type MercatifyEvaluationResult = z.infer<typeof MercatifyEvaluationResultSchema>

export interface MercatifyLabPort {
  evaluate(request: MercatifyEvaluationRequest): Promise<MercatifyEvaluationResult>
}

// Module-level registry (not an Awilix container token): Mercatify Lab, when it
// exists as a sibling module, calls `registerMercatifyLabPort` from its own
// `di.ts` `register()` to override the scripted default — no consumer changes.
let currentPort: MercatifyLabPort | undefined

export function registerMercatifyLabPort(port: MercatifyLabPort): void {
  currentPort = port
}

export function getMercatifyLabPort(): MercatifyLabPort {
  if (!currentPort) {
    throw new Error('[internal] No MercatifyLabPort registered — expected the scripted default to register at module bootstrap')
  }
  return currentPort
}
