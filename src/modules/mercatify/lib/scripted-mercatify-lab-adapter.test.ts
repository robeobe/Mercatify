/// <reference types="jest" />
import { scriptedMercatifyLabAdapter } from './scripted-mercatify-lab-adapter'
import { findCatalogTool } from '../data/saas-catalog'
import {
  MercatifyEvaluationResultSchema,
  type MercatifyEvaluationRequest,
} from './mercatify-lab-port'

const ANSWERED = [{ questionId: 'billing-tool', chip: 'Xero' }]

function baseRequest(
  answers: MercatifyEvaluationRequest['answers'],
  saasTools: MercatifyEvaluationRequest['saasTools'] = [],
): MercatifyEvaluationRequest {
  return {
    contractVersion: 1,
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    caseId: 'case-1',
    companyProfile: {},
    saasTools,
    answers,
  }
}

/** The stack the demo's "verify" walkthrough submits. */
const REAL_INTAKE: MercatifyEvaluationRequest['saasTools'] = [
  { name: 'HubSpot', monthlyCost: 1200, catalogToolId: 'hubspot', selectedModuleIds: ['sales', 'service'], seats: 20 },
  { name: 'Zendesk', monthlyCost: 480, catalogToolId: 'zendesk', selectedModuleIds: ['support'], seats: 8 },
  { name: 'Xero', monthlyCost: 90, selectedModuleIds: [], seats: 3 },
  { name: 'Voltix job tracker', monthlyCost: 0, notes: 'In-house spreadsheet that runs the install calendar' },
]

async function mappingFor(saasTools: MercatifyEvaluationRequest['saasTools']) {
  const result = await scriptedMercatifyLabAdapter.evaluate(baseRequest(ANSWERED, saasTools))
  const parsed = MercatifyEvaluationResultSchema.parse(result)
  if (parsed.status !== 'complete') throw new Error('expected complete result')
  return parsed.mapping
}

describe('scriptedMercatifyLabAdapter', () => {
  it('returns needs_more_info on the first call with no answers', async () => {
    const result = await scriptedMercatifyLabAdapter.evaluate(baseRequest([]))
    expect(result.status).toBe('needs_more_info')
    expect(MercatifyEvaluationResultSchema.safeParse(result).success).toBe(true)
  })

  it('grounds every row in a tool the request actually named', async () => {
    const mapping = await mappingFor(REAL_INTAKE)
    expect(mapping.length).toBeGreaterThan(0)
    const submitted = new Set(REAL_INTAKE.map((tool) => tool.name))
    for (const row of mapping) {
      expect(submitted.has(row.source)).toBe(true)
      // A catalog-backed row's justification has to name the tool — that is
      // what makes the demo table read as an analysis rather than a fixture.
      // The one uncatalogued tool gets the fixed "needs a look" line instead.
      if (row.target.kind !== 'unmapped') expect(row.justification).toContain(row.source)
    }
  })

  it('emits one row per ticked catalog module, using the catalog verdict and confidence', async () => {
    const mapping = await mappingFor([REAL_INTAKE[0]!])
    const hubspot = findCatalogTool('hubspot')!
    const salesHub = hubspot.modules.find((m) => m.id === 'sales')!
    const serviceHub = hubspot.modules.find((m) => m.id === 'service')!

    expect(mapping).toHaveLength(2)
    expect(mapping.map((row) => row.capability)).toEqual([salesHub.name, serviceHub.name])
    expect(mapping[0]!.decision).toBe(salesHub.verdict)
    expect(mapping[0]!.confidence).toBe(salesHub.conf)
    expect(mapping[0]!.target).toEqual({ kind: 'om_module', moduleId: 'customers' })
    expect(mapping[1]!.target).toEqual({ kind: 'om_module', moduleId: 'messages' })
  })

  it('falls back to every catalog module when the client ticked none, matching by tool name', async () => {
    // 'Xero' is half of the "Xero / QuickBooks" catalog entry and carries no
    // catalogToolId, so both the name match and the fallback are exercised.
    const mapping = await mappingFor([REAL_INTAKE[2]!])
    const accounting = findCatalogTool('accounting')!
    expect(mapping).toHaveLength(accounting.modules.length)
    for (const row of mapping) expect(row.source).toBe('Xero')
  })

  it('flags a tool outside the catalogue as build/unmapped/low, keyed on what it is used for', async () => {
    const mapping = await mappingFor([REAL_INTAKE[3]!])
    expect(mapping).toEqual([{
      capability: 'In-house spreadsheet that runs the install calendar',
      source: 'Voltix job tracker',
      decision: 'build',
      target: { kind: 'unmapped' },
      justification: 'Not in the catalogue — needs a look.',
      confidence: 'low',
    }])
  })

  it('maps no rows for a request with no tools', async () => {
    expect(await mappingFor([])).toEqual([])
  })

  it('is deterministic: same accumulated state in, same result out', async () => {
    const request = baseRequest(ANSWERED, REAL_INTAKE)
    const first = await scriptedMercatifyLabAdapter.evaluate(request)
    const second = await scriptedMercatifyLabAdapter.evaluate(request)
    expect(second).toEqual(first)
  })
})
