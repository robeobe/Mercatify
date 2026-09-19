/** @jest-environment node */
import { parseArgs, formatTable, validateRequestShape } from '../../bin/migrate-cli'

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
})
