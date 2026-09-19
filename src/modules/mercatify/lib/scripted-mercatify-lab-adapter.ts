import {
  catalogModuleDecision,
  catalogModuleTarget,
  findCatalogTool,
  findCatalogToolByName,
  type SaasCatalogModule,
  type SaasCatalogTool,
} from '../data/saas-catalog'
import type {
  MercatifyEvaluationRequest,
  MercatifyEvaluationResult,
  MercatifyLabPort,
  MercatifyMappingRow,
} from './mercatify-lab-port'

const FOLLOW_UP_QUESTION = {
  id: 'billing-tool',
  prompt: 'Which billing/invoicing tool do you currently use, if any?',
  chips: ['QuickBooks', 'Xero', 'None — manual spreadsheets'],
}

type RequestTool = MercatifyEvaluationRequest['saasTools'][number]

/** Human-readable name for the OM side of a row, used in the justification. */
function targetPhrase(module: SaasCatalogModule): string {
  if (module.om === 'stays external, wired in') return 'an integration rather than a module'
  if (module.om === 'not our business — keep it') return 'no Open Mercato module — it stays where it is'
  if (module.om === 'no module yet — build') return 'no Open Mercato module yet'
  return `Open Mercato ${module.om}`
}

/**
 * One sentence that names the client's actual tool, the job it does there and
 * where that job lands in Open Mercato. Deliberately templated per decision —
 * a scripted adapter cannot write prose, but it can be specific.
 */
function justify(toolName: string, module: SaasCatalogModule): string {
  const where = targetPhrase(module)
  switch (catalogModuleDecision(module)) {
    case 'native':
      return `${toolName} — ${module.name.toLowerCase()} is already covered by ${where}, with no work beyond migrating the data.`
    case 'configure':
      return `${toolName} — ${module.name.toLowerCase()} maps onto ${where}, which needs setting up to match how you work today.`
    case 'integrate':
      return `${toolName} — ${module.name.toLowerCase()} is best kept as ${where}, wired in by API so the data still lands in one place.`
    case 'build':
      return `${toolName} — ${module.name.toLowerCase()} has ${where}; this is genuinely new work to estimate.`
    case 'keep':
    default:
      return `${toolName} — ${module.name.toLowerCase()} is ${where}; we recommend leaving it exactly as it is.`
  }
}

function catalogFor(tool: RequestTool): SaasCatalogTool | undefined {
  if (tool.catalogToolId) {
    const byId = findCatalogTool(tool.catalogToolId)
    if (byId) return byId
  }
  return findCatalogToolByName(tool.name)
}

/**
 * Catalog modules the analysis should speak to: exactly what the client ticked
 * in the intake, or — when they ticked nothing — everything the tool can do,
 * which is the honest reading of "we pay for this product".
 */
function modulesFor(tool: RequestTool, catalog: SaasCatalogTool): SaasCatalogModule[] {
  const selected = tool.selectedModuleIds ?? []
  if (selected.length === 0) return catalog.modules
  const chosen = catalog.modules.filter((module) => selected.includes(module.id))
  return chosen.length > 0 ? chosen : catalog.modules
}

/** The row for a tool that is not in the catalog at all. */
function unknownToolRow(tool: RequestTool): MercatifyMappingRow {
  const capability = tool.notes?.trim() ? tool.notes.trim() : tool.name
  return {
    capability,
    source: tool.name,
    decision: 'build',
    target: { kind: 'unmapped' },
    justification: 'Not in the catalogue — needs a look.',
    confidence: 'low',
  }
}

export function buildScriptedMapping(request: MercatifyEvaluationRequest): MercatifyMappingRow[] {
  const rows: MercatifyMappingRow[] = []
  for (const tool of request.saasTools) {
    const catalog = catalogFor(tool)
    if (!catalog) {
      rows.push(unknownToolRow(tool))
      continue
    }
    for (const module of modulesFor(tool, catalog)) {
      rows.push({
        capability: module.name,
        // S-04's savings formula groups rows by `source === the intake tool
        // name`, so this must stay the exact name the client submitted.
        source: tool.name,
        decision: catalogModuleDecision(module),
        target: catalogModuleTarget(module, tool.name),
        justification: justify(tool.name, module),
        confidence: module.conf,
      })
    }
  }
  return rows
}

/**
 * Deterministic stand-in for Mercatify Lab: one `needs_more_info` round, then a
 * mapping derived from the request's real intake tools — one row per catalog
 * module the client ticked, plus one flagged row per tool we do not know.
 */
export const scriptedMercatifyLabAdapter: MercatifyLabPort = {
  async evaluate(request: MercatifyEvaluationRequest): Promise<MercatifyEvaluationResult> {
    if (request.answers.length === 0) {
      return {
        contractVersion: 1,
        status: 'needs_more_info',
        question: FOLLOW_UP_QUESTION,
      }
    }

    return {
      contractVersion: 1,
      status: 'complete',
      mapping: buildScriptedMapping(request),
    }
  },
}
