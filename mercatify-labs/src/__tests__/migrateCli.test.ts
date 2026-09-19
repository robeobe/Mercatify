/** @jest-environment node */
import {
  parseArgs,
  formatTable,
  formatCoverageLines,
  validateRequestShape,
  buildJsonOutput,
} from '../../bin/migrate-cli'
import type { MercatoMappingResult, ConsolidationScenarioResult } from '../types'
import type { MigrationPlanResult } from '../migrationPlanner'

describe('parseArgs', () => {
  it('reads the request path and defaults to json', () => {
    expect(parseArgs(['--request', 'voltix.json'])).toEqual({
      requestPath: 'voltix.json',
      format: 'json',
    })
  })

  it('accepts --format table', () => {
    expect(parseArgs(['--request', 'voltix.json', '--format', 'table'])).toEqual({
      requestPath: 'voltix.json',
      format: 'table',
    })
  })

  it('rejects a missing --request', () => {
    expect(() => parseArgs([])).toThrow(/--request/)
  })

  it('rejects an unsupported --format value', () => {
    expect(() => parseArgs(['--request', 'x.json', '--format', 'yaml'])).toThrow(/yaml/)
  })
})

describe('formatTable', () => {
  it('sorts by rollout sequence and shows hours', () => {
    const out = formatTable([
      { capability: 'b', source: 'Zapier', estimatedHours: 8, sequence: 2, rationale: 'later' },
      { capability: 'a', source: 'Airtable', estimatedHours: 24, sequence: 1, rationale: 'first' },
    ])
    const lines = out.split('\n')
    expect(lines[0]).toContain('Airtable.a')
    expect(lines[0]).toContain('24h')
    expect(lines[1]).toContain('Zapier.b')
  })
})

describe('validateRequestShape', () => {
  const valid = {
    stack: [{ id: 'p1', name: 'Airtable', category: 'database', monthlyCost: 400 }],
    capabilities: [{ id: 'c1', saasProductId: 'p1', capability: 'x', importance: 'core' }],
    costs: { omOperatingCost: 8400, implementationCost: 12000 },
  }

  it('passes a well-shaped request through unchanged', () => {
    expect(validateRequestShape(valid)).toEqual(valid)
  })

  it('rejects a request missing "stack"', () => {
    const { stack: _stack, ...rest } = valid
    expect(() => validateRequestShape(rest)).toThrow(/"stack"/)
  })

  it('rejects a request missing "capabilities"', () => {
    const { capabilities: _capabilities, ...rest } = valid
    expect(() => validateRequestShape(rest)).toThrow(/"capabilities"/)
  })

  it('rejects a request missing "costs"', () => {
    const { costs: _costs, ...rest } = valid
    expect(() => validateRequestShape(rest)).toThrow(/"costs"/)
  })

  it('rejects a non-object top level', () => {
    expect(() => validateRequestShape([])).toThrow(/JSON object/)
    expect(() => validateRequestShape('oops')).toThrow(/JSON object/)
    expect(() => validateRequestShape(null)).toThrow(/JSON object/)
  })

  // Iron rule 2 regression: "costs": {} used to pass validation, leaving
  // costs.implementationCost as `undefined`. Downstream arithmetic against
  // it produces NaN, and JSON.stringify silently turns NaN into `null` in
  // the CLI's own output - a silent-wrong-money-number with no error raised
  // anywhere. These prove that path is now rejected at the door, by name.
  it('rejects "costs": {} instead of letting it become NaN/null downstream', () => {
    expect(() => validateRequestShape({ ...valid, costs: {} })).toThrow(/"costs\.omOperatingCost"/)
  })

  it('rejects a non-numeric costs.omOperatingCost, naming the field', () => {
    expect(() =>
      validateRequestShape({ ...valid, costs: { omOperatingCost: 'lots', implementationCost: 12000 } }),
    ).toThrow(/"costs\.omOperatingCost"/)
  })

  it('rejects a missing costs.implementationCost, naming the field', () => {
    expect(() => validateRequestShape({ ...valid, costs: { omOperatingCost: 8400 } })).toThrow(
      /"costs\.implementationCost"/,
    )
  })

  it('rejects a non-finite costs.implementationCost such as NaN, naming the field', () => {
    expect(() =>
      validateRequestShape({ ...valid, costs: { omOperatingCost: 8400, implementationCost: NaN } }),
    ).toThrow(/"costs\.implementationCost"/)
  })

  it('rejects a non-numeric stack[].monthlyCost, naming the index and field', () => {
    const badStack = {
      ...valid,
      stack: [{ id: 'p1', name: 'Airtable', category: 'database', monthlyCost: 'four hundred' }],
    }
    expect(() => validateRequestShape(badStack)).toThrow(/"stack\[0\]\.monthlyCost"/)
  })

  it('rejects a stack entry that is not even an object', () => {
    expect(() => validateRequestShape({ ...valid, stack: [null] })).toThrow(/"stack\[0\]\.monthlyCost"/)
  })

  it('still passes a fully-numeric valid request through unchanged', () => {
    expect(validateRequestShape(valid)).toEqual(valid)
  })
})

describe('formatCoverageLines', () => {
  it('prints nothing when missing/orphaned/duplicates are all empty (the common case)', () => {
    expect(formatCoverageLines({ missing: [], orphaned: [], duplicateSequences: [] })).toEqual([])
  })

  it('mentions missing, orphaned and duplicate counts when any are non-empty', () => {
    const lines = formatCoverageLines({
      missing: [{ source: 'Airtable', capability: 'site_survey_tracking' }],
      orphaned: [{ source: 'Nowhere', capability: 'ghost' }],
      duplicateSequences: [1],
    })
    expect(lines.some((line) => /missing/i.test(line) && line.includes('1'))).toBe(true)
    expect(lines.some((line) => /orphaned/i.test(line) && line.includes('1'))).toBe(true)
    expect(lines.some((line) => /duplicate/i.test(line) && line.includes('1'))).toBe(true)
  })

  it('only reports the categories that are actually non-empty', () => {
    const lines = formatCoverageLines({
      missing: [{ source: 'Airtable', capability: 'site_survey_tracking' }],
      orphaned: [],
      duplicateSequences: [],
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/missing/i)
  })
})

describe('buildJsonOutput', () => {
  const mapping = (over: Partial<MercatoMappingResult> = {}): MercatoMappingResult => ({
    capability: 'site_survey_tracking',
    source: 'Airtable',
    targetFeature: 'Custom Entities',
    decision: 'build',
    confidence: 'medium',
    evidence: 'not in catalog',
    ...over,
  })

  const scenario: ConsolidationScenarioResult = {
    removedSaaS: ['Airtable'],
    retainedSaaS: [],
    grossAnnualSaving: 4800,
    omOperatingCost: 0,
    netAnnualSaving: 4800,
    implementationCost: 12000,
    netPaybackMonths: 30,
  }

  it('includes a populated coverage object when the plan has an orphaned item', () => {
    const mappings = [mapping()]
    const plan: MigrationPlanResult = {
      items: [
        { capability: 'ghost', source: 'Nowhere', estimatedHours: 4, sequence: 1, rationale: 'invented capability' },
      ],
      summary: 'One invented item.',
    }

    const out = buildJsonOutput(mappings, mappings, scenario, plan)

    expect(out.coverage).toEqual({
      missing: [{ source: 'Airtable', capability: 'site_survey_tracking' }],
      orphaned: [{ source: 'Nowhere', capability: 'ghost' }],
      duplicateSequences: [],
    })
  })

  it('reports empty coverage arrays (not an absent key) when the plan covers everything', () => {
    const mappings = [mapping()]
    const plan: MigrationPlanResult = {
      items: [
        {
          capability: 'site_survey_tracking',
          source: 'Airtable',
          estimatedHours: 24,
          sequence: 1,
          rationale: 'Core entity.',
        },
      ],
      summary: 'Fully covered.',
    }

    const out = buildJsonOutput(mappings, mappings, scenario, plan)

    expect(out.coverage).toEqual({ missing: [], orphaned: [], duplicateSequences: [] })
  })

  it('keeps catalogGaps alongside the new coverage key', () => {
    const mappings = [mapping({ evidence: 'not in catalog' })]
    const plan: MigrationPlanResult = { items: [], summary: 'Nothing planned yet.' }

    const out = buildJsonOutput(mappings, mappings, scenario, plan)

    expect(out.catalogGaps).toEqual([{ source: 'Airtable', capability: 'site_survey_tracking' }])
    expect(out.coverage.missing).toEqual([{ source: 'Airtable', capability: 'site_survey_tracking' }])
  })
})
