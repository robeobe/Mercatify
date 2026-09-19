export type HandoffDocumentCaseInput = {
  title: string
  companyName: string | null
  industry: string | null
  peopleCount: number | null
  currency: string | null
  pains: string | null
  mustKeep: string | null
}

export type HandoffDocumentMappingRowInput = {
  capability: string
  decision: string
  targetLabel: string | null
  confidence: string
  justification: string
  flagged: boolean
  flagReason: 'unmapped' | 'module_not_enabled' | null
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function targetCell(row: HandoffDocumentMappingRowInput): string {
  if (!row.flagged) return row.targetLabel ?? '—'
  return row.flagReason === 'module_not_enabled' ? '⚠ module not enabled' : '⚠ unmapped'
}

/**
 * Builds the initial `.md` handoff document from a case profile and its
 * confirmed mapping rows. Called once, by `mercatify.handoff.generate` — the
 * result is then an independent artifact the admin edits freely (PRD Open
 * Question 8, resolved: this function is never called again to "re-sync" an
 * existing document).
 */
export function buildHandoffDocumentMarkdown(
  interviewCase: HandoffDocumentCaseInput,
  rows: HandoffDocumentMappingRowInput[],
): string {
  const heading = interviewCase.companyName?.trim() || interviewCase.title
  const lines: string[] = []

  lines.push(`# Mercatify Lab handoff — ${heading}`)
  lines.push('')
  lines.push('## Company profile')
  lines.push('')
  lines.push(`- Industry: ${interviewCase.industry ?? '—'}`)
  lines.push(`- People: ${interviewCase.peopleCount ?? '—'}`)
  lines.push(`- Currency: ${interviewCase.currency ?? '—'}`)
  lines.push(`- Pains: ${interviewCase.pains ?? '—'}`)
  lines.push(`- Must keep: ${interviewCase.mustKeep ?? '—'}`)
  lines.push('')
  lines.push('## Capability mapping')
  lines.push('')

  if (rows.length === 0) {
    lines.push('No mapped capabilities.')
  } else {
    lines.push('| Capability | Decision | Target | Confidence | Justification |')
    lines.push('| --- | --- | --- | --- | --- |')
    for (const row of rows) {
      lines.push(
        `| ${escapeCell(row.capability)} | ${escapeCell(row.decision)} | ${escapeCell(targetCell(row))} | ${escapeCell(row.confidence)} | ${escapeCell(row.justification)} |`,
      )
    }
  }

  lines.push('')
  return lines.join('\n')
}
