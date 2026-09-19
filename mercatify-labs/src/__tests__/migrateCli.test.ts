/** @jest-environment node */
import { parseArgs, formatTable } from '../../bin/migrate-cli'

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
