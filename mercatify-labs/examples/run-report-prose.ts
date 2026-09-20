/**
 * Runs the three report prose agents for real against a local LM Studio
 * server and prints what they wrote. Not part of the automated test suite —
 * `src/__tests__/reportProse.test.ts` covers the same wiring with a fake
 * `LlmClient` and no network.
 *
 * What to look for in the output: every amount, duration and count comes back
 * as a SLOT — `{wave.1.monthlyBanked}`, `{stack.Xero.monthly}` — never as a
 * figure. The renderer (`src/report/renderReport.ts`) substitutes the computed
 * value from `facts` at render time. If an agent states a figure of its own,
 * this script does not print a slightly wrong sentence: it throws, because
 * `assertNoFigures` runs on every result before it is returned.
 *
 * Usage:
 *   npx ts-node examples/run-report-prose.ts
 *
 * The third agent reads a Catalog Curator proposal. With FIRECRAWL_API_KEY set
 * this script researches the gap for real first (one extra network call);
 * without it, a stand-in proposal below is used so the example still runs.
 */
import { OpenAiCompatibleLlmClient, createToolExecutor, proposeCatalogEntry } from '../src'
import type { CatalogCuratorResult } from '../src/catalogCurator'
import type { ReportGap, Wave } from '../src/report/model'
import {
  writeExecutiveProse,
  writeGapProse,
  writeRiskProse,
  type ReportEvidenceNote,
} from '../src/reportProse'
import type { MercatoMappingResult } from '../src/types'

const COMPANY = {
  name: 'Voltix Energy Sp. z o.o.',
  industry: 'solar installation',
  employees: 34,
  currency: 'USD',
}

const MAPPINGS: MercatoMappingResult[] = [
  {
    capability: 'crm.contacts',
    source: 'HubSpot Sales',
    targetFeature: 'CRM',
    decision: 'native',
    confidence: 'high',
    evidence: 'HubSpot Sales.crm.contacts is a catalog-verified native fit for CRM.',
  },
  {
    capability: 'data.custom',
    source: 'Airtable',
    targetFeature: 'Custom Entities',
    decision: 'configure',
    confidence: 'high',
    evidence: 'Airtable.data.custom is a catalog-verified configure fit for Custom Entities.',
  },
  {
    capability: 'inventory.stock',
    source: 'Sortly',
    targetFeature: 'WMS',
    decision: 'native',
    confidence: 'high',
    evidence: 'Sortly.inventory.stock is a catalog-verified native fit for WMS.',
  },
  {
    capability: 'field.jobsheets',
    source: 'Jobber',
    targetFeature: 'Planner',
    decision: 'configure',
    confidence: 'medium',
    evidence: 'Jobber.field.jobsheets is a catalog-verified configure fit for Planner.',
  },
  {
    capability: 'quotes.configurator',
    source: 'PandaDoc',
    targetFeature: 'Sales Quotes',
    decision: 'build',
    confidence: 'medium',
    evidence: 'PandaDoc.quotes.configurator is a catalog-verified build fit for Sales Quotes.',
  },
  {
    capability: 'docs.esignature',
    source: 'PandaDoc',
    targetFeature: 'E-signature API',
    decision: 'integrate',
    confidence: 'high',
    evidence: 'PandaDoc.docs.esignature is a catalog-verified integrate fit for E-signature API.',
  },
  {
    capability: 'accounting.ledger',
    source: 'Xero',
    targetFeature: 'Out of scope',
    decision: 'keep',
    confidence: 'high',
    evidence: 'Xero.accounting.ledger is a catalog-verified keep fit for Out of scope.',
  },
]

const WAVES: Wave[] = [
  {
    n: 1,
    title: 'Registers and stock',
    weekFrom: 1,
    weekTo: 4,
    hours: 30,
    hoursAreFloor: false,
    scope: [
      { source: 'Airtable', capability: 'data.custom', decision: 'configure', estimatedHours: 18 },
      { source: 'Sortly', capability: 'inventory.stock', decision: 'native', estimatedHours: 12 },
    ],
    toolsOff: ['Airtable', 'Sortly'],
    toolsReduced: [],
    monthlyBanked: 389,
    bankedFromMonth: 2,
  },
  {
    n: 2,
    title: 'CRM cut-over',
    weekFrom: 5,
    weekTo: 10,
    hours: 55,
    hoursAreFloor: false,
    scope: [{ source: 'HubSpot Sales', capability: 'crm.contacts', decision: 'native', estimatedHours: 55 }],
    toolsOff: ['HubSpot'],
    toolsReduced: [],
    monthlyBanked: 890,
    bankedFromMonth: 4,
  },
  {
    n: 3,
    title: 'Field service',
    weekFrom: 11,
    weekTo: 16,
    hours: 30,
    hoursAreFloor: false,
    scope: [{ source: 'Jobber', capability: 'field.jobsheets', decision: 'configure', estimatedHours: 30 }],
    toolsOff: ['Jobber'],
    toolsReduced: [],
    monthlyBanked: 349,
    bankedFromMonth: 5,
  },
  {
    n: 4,
    title: 'Support and quoting',
    weekFrom: 17,
    weekTo: 22,
    hours: 45,
    hoursAreFloor: false,
    scope: [
      { source: 'PandaDoc', capability: 'quotes.configurator', decision: 'build', estimatedHours: 40 },
      { source: 'PandaDoc', capability: 'docs.esignature', decision: 'integrate', estimatedHours: 5 },
    ],
    toolsOff: ['Zendesk'],
    toolsReduced: ['PandaDoc'],
    monthlyBanked: 415,
    bankedFromMonth: 7,
  },
]

const EVIDENCE_KINDS: ReportEvidenceNote[] = [
  {
    tool: 'HubSpot Sales',
    capability: 'crm.contacts',
    evidenceKind: 'observed',
    evidenceNote: '3 pipelines, 11 custom deal properties, no marketing automation in use',
  },
  {
    tool: 'Jobber',
    capability: 'field.jobsheets',
    evidenceKind: 'inferred',
    evidenceNote: 'offline use on site not confirmed',
  },
  {
    tool: 'PandaDoc',
    capability: 'quotes.configurator',
    evidenceKind: 'estimated',
    evidenceNote: 'panel-and-inverter configurator sized from one screen-share, not from a spec',
  },
]

const GAPS: ReportGap[] = [
  {
    id: 'B.1',
    source: 'Aurora Solar, mentioned on the call',
    capability: 'panel_layout_design',
    described: 'Panel layout and shading design',
  },
  {
    id: 'B.2',
    source: 'Two operator portals, done by hand',
    capability: 'utility_interconnection',
    described: 'Utility interconnection filings',
  },
]

/** Used when FIRECRAWL_API_KEY is absent, so the example runs without a search key. */
const STAND_IN_PROPOSAL: CatalogCuratorResult = {
  toolName: 'Aurora Solar',
  capability: 'panel_layout_design',
  findings: [
    {
      signal: 'product',
      detail: 'Aurora Solar is a solar design and shading simulation suite sold per designer.',
      sourceUrl: 'https://aurorasolar.com/',
    },
  ],
  suggestedTarget: 'No equivalent — specialist CAD',
  suggestedDecision: 'keep',
  suggestedConfidence: 'medium',
  evidence: 'Physics simulation over roof geometry; nothing in the platform module list is comparable.',
}

async function main() {
  const llmClient = new OpenAiCompatibleLlmClient({
    baseURL: process.env.LLM_BASE_URL ?? 'http://127.0.0.1:1234/v1',
    model: process.env.LLM_MODEL ?? 'qwen/qwen3-vl-30b',
    apiKey: process.env.LLM_API_KEY ?? 'lm-studio',
  })
  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY
  const toolExecutor = createToolExecutor(firecrawlApiKey ? { firecrawlApiKey } : {})

  console.log('— report_editor ————————————————————————————————')
  const executive = await writeExecutiveProse(llmClient, toolExecutor, {
    company: COMPANY,
    waves: WAVES,
    mappings: MAPPINGS,
    counts: { statements: 38, matched: 34, offCatalog: 4 },
  })
  console.log(JSON.stringify(executive, null, 2))

  console.log('\n— report_risk_analyst ——————————————————————————')
  const risk = await writeRiskProse(llmClient, toolExecutor, {
    mappings: MAPPINGS,
    waves: WAVES,
    evidenceKinds: EVIDENCE_KINDS,
    gaps: GAPS,
  })
  console.log(JSON.stringify(risk, null, 2))

  console.log('\n— report_curator_reader ————————————————————————')
  const gap = GAPS[0]
  // Iron rule #5 (SPEC.md §2): the Curator and the Reader never talk. This
  // code runs one, reads its typed result, and hands the Reader exactly the
  // fields it needs — there is no shared conversation between them.
  const proposal = firecrawlApiKey
    ? await proposeCatalogEntry(llmClient, toolExecutor, {
        toolName: 'Aurora Solar',
        capability: gap.capability,
        usageDescription: gap.described,
        platformCapabilities: ['CRM', 'Sales Quotes', 'Workflows', 'Custom Entities', 'Documents'],
      })
    : STAND_IN_PROPOSAL
  if (!firecrawlApiKey) {
    console.log('(FIRECRAWL_API_KEY not set — using the stand-in proposal from this file.)')
  }
  const gapProse = await writeGapProse(llmClient, toolExecutor, { gap, proposal })
  console.log(JSON.stringify(gapProse, null, 2))

  console.log(
    '\nEvery figure above is a {slot}. The renderer fills it from `facts`; no agent ever stated a number.',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
