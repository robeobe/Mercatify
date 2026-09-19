/// <reference types="jest" />
import { buildHandoffDocumentMarkdown, type HandoffDocumentMappingRowInput } from './handoff-document'

const baseCase = {
  title: 'Untitled intake',
  companyName: 'Acme Co',
  industry: 'Retail',
  peopleCount: 42,
  currency: 'EUR',
  pains: 'Too many spreadsheets',
  mustKeep: 'Existing CRM data',
}

describe('buildHandoffDocumentMarkdown', () => {
  it('renders the company profile and a table row per mapped capability', () => {
    const rows: HandoffDocumentMappingRowInput[] = [
      {
        capability: 'Customer records',
        decision: 'native',
        targetLabel: 'Admin Dashboards',
        confidence: 'high',
        justification: 'Direct fit',
        flagged: false,
        flagReason: null,
      },
    ]
    const md = buildHandoffDocumentMarkdown(baseCase, rows)
    expect(md).toContain('# Mercatify Lab handoff — Acme Co')
    expect(md).toContain('- Industry: Retail')
    expect(md).toContain('- Pains: Too many spreadsheets')
    expect(md).toContain('| Customer records | native | Admin Dashboards | high | Direct fit |')
  })

  it('falls back to the case title when companyName is null', () => {
    const md = buildHandoffDocumentMarkdown({ ...baseCase, companyName: null }, [])
    expect(md).toContain('# Mercatify Lab handoff — Untitled intake')
    expect(md).toContain('No mapped capabilities.')
  })

  it('renders a distinct marker for flagged rows instead of a target label', () => {
    const rows: HandoffDocumentMappingRowInput[] = [
      {
        capability: 'Legacy inventory sync',
        decision: 'keep',
        targetLabel: null,
        confidence: 'low',
        justification: 'No analysis match',
        flagged: true,
        flagReason: 'unmapped',
      },
      {
        capability: 'Contact management',
        decision: 'configure',
        targetLabel: 'customers',
        confidence: 'medium',
        justification: 'Named module is not enabled',
        flagged: true,
        flagReason: 'module_not_enabled',
      },
    ]
    const md = buildHandoffDocumentMarkdown(baseCase, rows)
    expect(md).toContain('⚠ unmapped')
    expect(md).toContain('⚠ module not enabled')
    expect(md).not.toContain('| customers |')
  })

  it('escapes pipe characters and strips newlines from free-text cells', () => {
    const rows: HandoffDocumentMappingRowInput[] = [
      {
        capability: 'Reporting',
        decision: 'build',
        targetLabel: 'Analytics',
        confidence: 'medium',
        justification: 'Needs a | table and\na line break',
        flagged: false,
        flagReason: null,
      },
    ]
    const md = buildHandoffDocumentMarkdown(baseCase, rows)
    expect(md).toContain('Needs a \\| table and a line break')
    expect(md).not.toMatch(/Needs a \| table/)
  })
})
