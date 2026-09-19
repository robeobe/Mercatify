/** @jest-environment node */
import { validateMigrationPlan, auditPlanCoverage } from '../migration/validatePlan'
import type { MercatoMappingResult } from '../types'

const item = (over: Partial<Record<string, unknown>> = {}) => ({
  capability: 'site_survey_tracking',
  source: 'Airtable',
  estimatedHours: 24,
  sequence: 1,
  rationale: 'Core entity everything else hangs off.',
  ...over,
})
const plan = (...items: unknown[]) => ({ items, summary: 'Entities first, then workflows.' })

const mapping = (over: Partial<MercatoMappingResult>): MercatoMappingResult => ({
  capability: 'site_survey_tracking',
  source: 'Airtable',
  targetFeature: 'Custom Entities',
  decision: 'build',
  confidence: 'medium',
  evidence: 'not in catalog',
  ...over,
})

describe('validateMigrationPlan', () => {
  it('passes a well-formed plan through', () => {
    const raw = plan(item())
    expect(validateMigrationPlan(raw)).toEqual(raw)
  })

  it('rejects a missing items array', () => {
    expect(() => validateMigrationPlan({ summary: 'x' })).toThrow(/items/)
  })

  it('rejects a missing summary', () => {
    expect(() => validateMigrationPlan({ items: [] })).toThrow(/summary/)
  })

  it('rejects hours that arrived as a string', () => {
    expect(() => validateMigrationPlan(plan(item({ estimatedHours: '24h' })))).toThrow(
      /items\[0\].estimatedHours/,
    )
  })

  it('rejects negative or fractional hours', () => {
    expect(() => validateMigrationPlan(plan(item({ estimatedHours: -1 })))).toThrow(
      /items\[0\].estimatedHours/,
    )
    expect(() => validateMigrationPlan(plan(item({ estimatedHours: 2.5 })))).toThrow(
      /items\[0\].estimatedHours/,
    )
  })

  it('rejects a sequence below 1', () => {
    expect(() => validateMigrationPlan(plan(item({ sequence: 0 })))).toThrow(/items\[0\].sequence/)
  })
})

describe('auditPlanCoverage', () => {
  const mappings = [
    mapping({}),
    mapping({ capability: 'contacts', source: 'HubSpot', decision: 'native' }),
    mapping({ capability: 'quote_documents', source: 'PandaDoc', decision: 'configure' }),
  ]

  it('reports nothing when the plan covers exactly the build and configure mappings', () => {
    const covered = plan(item(), item({ capability: 'quote_documents', source: 'PandaDoc', sequence: 2 }))
    expect(auditPlanCoverage(mappings, validateMigrationPlan(covered))).toEqual({
      missing: [],
      orphaned: [],
      duplicateSequences: [],
    })
  })

  it('reports an unpriced build mapping as missing and a phantom item as orphaned', () => {
    const skewed = plan(item({ capability: 'ghost', source: 'Nowhere' }))
    const report = auditPlanCoverage(mappings, validateMigrationPlan(skewed))
    expect(report.missing).toEqual([
      { source: 'Airtable', capability: 'site_survey_tracking' },
      { source: 'PandaDoc', capability: 'quote_documents' },
    ])
    expect(report.orphaned).toEqual([{ source: 'Nowhere', capability: 'ghost' }])
  })

  it('reports a repeated rollout slot', () => {
    const clashing = plan(item(), item({ capability: 'quote_documents', source: 'PandaDoc', sequence: 1 }))
    expect(auditPlanCoverage(mappings, validateMigrationPlan(clashing)).duplicateSequences).toEqual([1])
  })
})
