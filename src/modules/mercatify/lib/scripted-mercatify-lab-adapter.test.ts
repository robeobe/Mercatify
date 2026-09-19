/// <reference types="jest" />
import { scriptedMercatifyLabAdapter } from './scripted-mercatify-lab-adapter'
import {
  MercatifyConfidenceSchema,
  MercatifyDecisionSchema,
  MercatifyEvaluationResultSchema,
  type MercatifyEvaluationRequest,
} from './mercatify-lab-port'

function baseRequest(answers: MercatifyEvaluationRequest['answers']): MercatifyEvaluationRequest {
  return {
    contractVersion: 1,
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    caseId: 'case-1',
    companyProfile: {},
    saasTools: [],
    answers,
  }
}

describe('scriptedMercatifyLabAdapter', () => {
  it('returns needs_more_info on the first call with no answers', async () => {
    const result = await scriptedMercatifyLabAdapter.evaluate(baseRequest([]))
    expect(result.status).toBe('needs_more_info')
    expect(MercatifyEvaluationResultSchema.safeParse(result).success).toBe(true)
  })

  it('returns a schema-valid complete mapping once an answer is provided', async () => {
    const result = await scriptedMercatifyLabAdapter.evaluate(
      baseRequest([{ questionId: 'billing-tool', chip: 'Xero' }]),
    )
    const parsed = MercatifyEvaluationResultSchema.parse(result)
    expect(parsed.status).toBe('complete')
    if (parsed.status !== 'complete') throw new Error('expected complete result')

    const decisions = new Set(parsed.mapping.map((row) => row.decision))
    const targetKinds = new Set(parsed.mapping.map((row) => row.target.kind))
    const confidences = new Set(parsed.mapping.map((row) => row.confidence))

    for (const decision of MercatifyDecisionSchema.options) {
      expect(decisions.has(decision)).toBe(true)
    }
    expect(targetKinds).toEqual(new Set(['om_module', 'external_tool', 'unmapped']))
    for (const confidence of MercatifyConfidenceSchema.options) {
      expect(confidences.has(confidence)).toBe(true)
    }
  })

  it('is deterministic: same accumulated state in, same result out', async () => {
    const request = baseRequest([{ questionId: 'billing-tool', chip: 'Xero' }])
    const first = await scriptedMercatifyLabAdapter.evaluate(request)
    const second = await scriptedMercatifyLabAdapter.evaluate(request)
    expect(second).toEqual(first)
  })
})
