/**
 * Converts our own `MercatifyRequest` shape into the two inputs
 * `buildReport()` (vendored mercatify-labs) needs: a `mercatify-brief` JSON
 * and a `ConsultantInputs` object. Kept separate from the vendored code so
 * `vendor/` stays an unmodified copy of the upstream package.
 *
 * Capability slugs are passed through as-is — no translation table. Where
 * our capability isn't in the Labs catalog, `mapCapabilities` (vendored)
 * marks it `evidence: 'not in catalog'` on its own; that is the "1:1 where
 * we can, mark the rest" behaviour the mapping was scoped to.
 */
import type { MercatifyRequestTool } from '../data/entities'
import type { ConsultantInputs } from './vendor/src/report/buildReport'

export type LabsBriefModule = {
  name: string
  desc: string
  caps: string[]
  evidenceKind: 'observed' | 'inferred' | 'estimated'
  evidenceNote: string
}

export type LabsBriefTool = {
  name: string
  category: string
  seats?: number
  monthly: number
  modules: LabsBriefModule[]
}

export type LabsBrief = {
  v: 2
  kind: 'mercatify-brief'
  created: string
  company: { name: string; industry: string; people: number }
  currency: string
  tools: LabsBriefTool[]
}

export type LabsAdapterRequest = {
  company: string
  industry?: string | null
  peopleCount?: number | null
  currency: string
  tools: MercatifyRequestTool[]
}

/**
 * Everything the brief itself cannot carry (the engine's contract, not this
 * app's): what was reviewed, the licence/implementation cost assumptions,
 * who's running the analysis. All optional — `buildReport` prints "not
 * entered" rather than guessing when these are left blank.
 */
export type LabsAdapterConsultant = {
  analyst?: string
  hostingMonthly?: number
  implementationCost?: number
  rate?: number
  readWhat?: string
  period?: string
  exclusions?: string
  caseId?: string
}

export type LabsAdapterResult = {
  brief: LabsBrief
  consultant: ConsultantInputs
  /** Tools with no assigned capability at all — the brief format has no way
   * to carry a tool that maps to nothing, so these are dropped rather than
   * sent as an invalid module. Surfaced so the caller can say so. */
  excludedTools: string[]
}

export function buildLabsInput(
  request: LabsAdapterRequest,
  consultant: LabsAdapterConsultant = {},
): LabsAdapterResult {
  const excludedTools: string[] = []
  const tools: LabsBriefTool[] = []

  for (const tool of request.tools) {
    const caps = (tool.caps || []).filter((c) => typeof c === 'string' && c.trim().length > 0)
    if (!caps.length) {
      // A module needs at least one capability slug and a tool needs at
      // least one module (vendor/src/intake/fromBrief.ts) — a tool with no
      // capabilities at all (our own "custom tool, nothing ticked" case)
      // cannot be represented, only omitted.
      excludedTools.push(tool.name)
      continue
    }
    tools.push({
      name: tool.name,
      category: '',
      ...(tool.seats != null ? { seats: Number(tool.seats) } : {}),
      monthly: Number(tool.monthly) || 0,
      // One synthetic module per tool: `briefToRequest` flattens
      // `modules[].caps` straight back into one capability list per tool,
      // so the module boundary itself carries no matching-relevant
      // information — only `module.desc`, used as each capability's
      // `usageDescription` in the rendered report.
      modules: [{ name: 'Usage', desc: '', caps, evidenceKind: 'inferred', evidenceNote: '' }],
    })
  }

  const today = new Date().toISOString().slice(0, 10)

  const brief: LabsBrief = {
    v: 2,
    kind: 'mercatify-brief',
    created: today,
    company: {
      name: request.company,
      industry: request.industry || '',
      people: request.peopleCount ?? 0,
    },
    currency: request.currency,
    tools,
  }

  const consultantInputs: ConsultantInputs = {
    meta: {
      caseId: consultant.caseId || `MERCATIFY-${today}`,
      version: '1.0',
      issued: today,
      validUntil: today,
      preparedFor: { organization: request.company, person: '', role: '' },
      preparedBy: { organization: 'Mercatify', person: consultant.analyst || '', role: 'Consultant' },
      humanReviewed: false,
      basis: 'Open Mercato — self-hosted, source available.',
      confidentialityNote: 'Prepared for internal evaluation only.',
    },
    basis: {
      readWhat: consultant.readWhat || 'The stack submitted through the Mercatify intake form.',
      period: consultant.period || `As declared on ${today}.`,
      exclusions: consultant.exclusions || 'None stated.',
    },
    ...(consultant.hostingMonthly !== undefined ? { hostingMonthly: consultant.hostingMonthly } : {}),
    ...(consultant.implementationCost !== undefined ? { implementationCost: consultant.implementationCost } : {}),
    ...(consultant.rate !== undefined ? { rate: consultant.rate } : {}),
  }

  return { brief, consultant: consultantInputs, excludedTools }
}
