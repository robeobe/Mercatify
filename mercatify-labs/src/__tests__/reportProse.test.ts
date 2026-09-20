/** @jest-environment node */
import type { AgentDefinition, ToolDefinition } from '../agentLoader'
import type { LlmClient, ToolExecutor } from '../llmClient'
import type { Wave } from '../report/model'
import {
  validateEditorResult,
  validateGapReaderResult,
  validateRiskAnalystResult,
  writeExecutiveProse,
  writeGapProse,
  writeRiskProse,
  type ReportEditorInput,
  type ReportGapReaderInput,
  type ReportRiskAnalystInput,
  type SlotScope,
} from '../reportProse'
import type { MercatoMappingResult } from '../types'

// --- Fake LlmClient: zero sieci ---------------------------------------------

interface SeenCall {
  agentId: string
  input: unknown
  toolNames: string[]
}

function fakeClient(answer: unknown, seen: SeenCall[] = []): LlmClient {
  return {
    async runAgent(agent: AgentDefinition, input: unknown, tools: ToolDefinition[]) {
      seen.push({ agentId: agent.id, input, toolNames: tools.map((tool) => tool.name) })
      return answer
    },
  }
}

const noTools: ToolExecutor = async () => ({})

// --- Wejścia (kształt złotego przebiegu Voltixa, skrócony) -------------------

/**
 * `toolsOff` niesie ETYKIETĘ ("HubSpot"), a `mappings[].source` nazwę wiersza
 * stacku ("HubSpot Sales"). Ta rozbieżność jest prawdziwa (`canonicalToolLabel`
 * w `src/report/waves.ts`) i jest powodem, dla którego jeden z testów niżej
 * wymaga odrzucenia `{stack.HubSpot.monthly}`.
 */
const WAVES: Wave[] = [
  {
    n: 1,
    title: 'Registers and stock',
    weekFrom: 1,
    weekTo: 4,
    hours: 30,
    hoursAreFloor: false,
    scope: [{ source: 'Airtable', capability: 'data.custom', decision: 'configure', estimatedHours: 12 }],
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
    scope: [{ source: 'HubSpot Sales', capability: 'crm.contacts', decision: 'native', estimatedHours: null }],
    toolsOff: ['HubSpot'],
    toolsReduced: [],
    monthlyBanked: 890,
    bankedFromMonth: 4,
  },
]

const MAPPINGS: MercatoMappingResult[] = [
  {
    capability: 'data.custom',
    source: 'Airtable',
    targetFeature: 'Custom Entities',
    decision: 'configure',
    confidence: 'high',
    evidence: 'Airtable.data.custom is a catalog-verified configure fit for Custom Entities.',
    customEffortHours: 12,
  },
  {
    capability: 'crm.contacts',
    source: 'HubSpot Sales',
    targetFeature: 'CRM',
    decision: 'native',
    confidence: 'high',
    evidence: 'HubSpot Sales.crm.contacts is a catalog-verified native fit for CRM.',
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

const EDITOR_INPUT: ReportEditorInput = {
  company: { name: 'Voltix Energy', industry: 'solar installation', employees: 34, currency: 'USD' },
  waves: WAVES,
  mappings: MAPPINGS,
  counts: { statements: 38, matched: 34, offCatalog: 4 },
}

const RISK_INPUT: ReportRiskAnalystInput = {
  mappings: MAPPINGS,
  waves: WAVES,
  evidenceKinds: [
    {
      tool: 'Jobber',
      capability: 'field.jobsheets',
      evidenceKind: 'inferred',
      evidenceNote: 'offline use on site not confirmed',
    },
  ],
  gaps: [
    { id: 'B.1', source: 'Aurora Solar, mentioned on the call', capability: '', described: 'Panel layout and shading design' },
  ],
}

const GAP_INPUT: ReportGapReaderInput = {
  gap: {
    id: 'B.1',
    source: 'Aurora Solar, mentioned on the call',
    capability: 'panel_layout_design',
    described: 'Panel layout and shading design',
  },
  proposal: {
    toolName: 'Aurora Solar',
    capability: 'panel_layout_design',
    findings: [
      { signal: 'product', detail: 'A solar design suite sold per designer.', sourceUrl: 'https://aurorasolar.com/' },
    ],
    suggestedTarget: 'No equivalent — specialist CAD',
    suggestedDecision: 'keep',
    suggestedConfidence: 'medium',
    evidence: 'Physics simulation over roof geometry; nothing in the module list is comparable.',
  },
}

const SCOPE: SlotScope = { waveNumbers: [1, 2], stackTools: ['Airtable', 'HubSpot Sales', 'Xero'] }

// --- Poprawne odpowiedzi modelu ---------------------------------------------

function goodEditorAnswer() {
  return {
    recommendation:
      'Start with Airtable and Sortly. They carry the least process risk, they are month-to-month, and ' +
      'cutting them in the first four weeks returns {wave.1.monthlyBanked} a month.',
    findings: [
      {
        heading: 'Most of your stack is covered by the platform you would run anyway',
        body:
          'Airtable and HubSpot Sales map onto modules Open Mercato already has. Of the statements we ' +
          'extracted, {counts.matched} matched a catalog capability.',
      },
      {
        heading: 'Two things we recommend you keep',
        body: 'Xero stays: replacing an accounting system to save {stack.Xero.monthly} a month is a bad trade.',
      },
    ],
    basisIntro: 'Everything below derives from material you supplied.',
    disclaimer: 'It is not a proposal to replace your stack. You can stop after any wave.',
  }
}

function goodRiskAnswer() {
  return {
    risks: [
      {
        risk: 'HubSpot data exports cleanly',
        basis: 'Assumed from a sample of the contacts you showed us',
        effect: 'Wave 2 grows if custom property mapping is messier than the sample suggests',
        handling: 'Full export reviewed in the first week, before wave 2 is quoted firm',
      },
      {
        risk: 'Crews may rely on Jobber offline',
        basis: 'Not confirmed on the call',
        effect: 'Offline job sheets are a build, not a configure',
        handling: 'Resolved by one question to the crew leads; re-quoted before wave 3 starts',
      },
    ],
    nextSteps: [
      {
        action: 'Answer the offline-crew question in risk 8.2',
        owner: 'Voltix — crew leads',
        when: 'before wave 3 is quoted',
      },
      { action: 'Approve wave 1 only', owner: 'Voltix', when: 'decision point' },
    ],
  }
}

function goodGapAnswer() {
  return {
    whyUnmapped: 'Specialist CAD; no entry in our catalog and no platform equivalent we could verify',
    ourRead: 'Almost certainly stays where it is. A possible integration target later',
  }
}

// --- Report Editor ----------------------------------------------------------

/**
 * S4 (TEST-004) i S5 (TEST-005) w jednym miejscu: model zwracający śmieci ma
 * być ODRZUCONY z nazwą pola, zanim cokolwiek trafi do dokumentu, a liczba
 * wpisana w zdanie zamiast slotu jest szczególnym przypadkiem tych śmieci.
 * Kod wyjścia 3 dokłada `bin/report-cli.ts` w Fazie 3; tu bronimy warstwy,
 * która o nim decyduje.
 */
describe('S4/S5: writeExecutiveProse', () => {
  it('calls report_editor with no tools and returns the four prose fields', async () => {
    const seen: SeenCall[] = []
    const result = await writeExecutiveProse(fakeClient(goodEditorAnswer(), seen), noTools, EDITOR_INPUT)

    expect(seen).toHaveLength(1)
    expect(seen[0].agentId).toBe('report_editor')
    expect(seen[0].toolNames).toEqual([])
    expect(Object.keys(result).sort()).toEqual(['basisIntro', 'disclaimer', 'findings', 'recommendation'])
    expect(result.findings).toHaveLength(2)
    expect(result.recommendation).toContain('{wave.1.monthlyBanked}')
  })

  it('sends the run’s shape but not one single amount of money', async () => {
    const seen: SeenCall[] = []
    await writeExecutiveProse(fakeClient(goodEditorAnswer(), seen), noTools, EDITOR_INPUT)
    const payload = JSON.stringify(seen[0].input)

    // Kształt jedzie.
    expect(payload).toContain('CRM cut-over')
    expect(payload).toContain('HubSpot Sales')
    // Pieniądz i estymaty godzinowe nie.
    expect(payload).not.toContain('monthlyBanked')
    expect(payload).not.toContain('389')
    expect(payload).not.toContain('890')
    expect(payload).not.toContain('estimatedHours')
    expect(payload).not.toContain('customEffortHours')
  })

  it('S5: rejects a bare figure the model wrote instead of a slot', async () => {
    const answer = goodEditorAnswer()
    answer.recommendation = 'Cutting them in the first four weeks returns $389 a month.'
    await expect(writeExecutiveProse(fakeClient(answer), noTools, EDITOR_INPUT)).rejects.toThrow(
      /assertNoFigures/,
    )
  })

  it('rejects a slot outside the allowlist', async () => {
    const answer = goodEditorAnswer()
    answer.basisIntro = 'Your licence spend today is {revenue.total}.'
    await expect(writeExecutiveProse(fakeClient(answer), noTools, EDITOR_INPUT)).rejects.toThrow(
      /is not an allowed slot shape/,
    )
  })

  it('rejects a wave slot naming a wave this run does not have', async () => {
    const answer = goodEditorAnswer()
    answer.recommendation = 'The last wave returns {wave.9.monthlyBanked} a month.'
    await expect(writeExecutiveProse(fakeClient(answer), noTools, EDITOR_INPUT)).rejects.toThrow(
      /names wave 9, but this run has waves 1, 2/,
    )
  })

  it('rejects a stack slot naming a tool the agent was never shown', async () => {
    // "HubSpot" jest etykietą z `toolsOff`, nie nazwą wiersza stacku - w tabeli
    // stoi "HubSpot Sales". Bez tej bramy slot padłby dopiero w rendererze.
    const answer = goodEditorAnswer()
    answer.findings[0].body = 'Your CRM costs {stack.HubSpot.monthly} a month.'
    await expect(writeExecutiveProse(fakeClient(answer), noTools, EDITOR_INPUT)).rejects.toThrow(
      /names tool "HubSpot", which is not one of the tools this agent was shown/,
    )
  })

  it('rejects a missing contract field, naming it', async () => {
    const answer: Record<string, unknown> = goodEditorAnswer()
    delete answer.disclaimer
    await expect(writeExecutiveProse(fakeClient(answer), noTools, EDITOR_INPUT)).rejects.toThrow(
      /report_editor\.disclaimer: expected a non-empty string/,
    )
  })

  it('rejects an empty findings list rather than rendering an empty section', () => {
    const answer = { ...goodEditorAnswer(), findings: [] }
    expect(() => validateEditorResult(answer, SCOPE)).toThrow(/findings: expected at least one entry/)
  })

  it('drops a field the model bolted on beside the contract', () => {
    const answer = {
      ...goodEditorAnswer(),
      // Dokładnie ten kształt zmierzył `assertNoFigures`: liczba w polu,
      // którego `ProseFinding` nie ma.
      findings: [{ heading: 'Coverage', body: 'Five tools are covered.', id: 'net saving is $6,000/yr' }],
      secretTotal: 'payback 24 months',
    }
    const result = validateEditorResult(answer, SCOPE)

    expect(Object.keys(result).sort()).toEqual(['basisIntro', 'disclaimer', 'findings', 'recommendation'])
    expect(Object.keys(result.findings[0]).sort()).toEqual(['body', 'heading'])
    expect(JSON.stringify(result)).not.toContain('6,000')
    expect(JSON.stringify(result)).not.toContain('24 months')
  })
})

// --- Report Risk Analyst ----------------------------------------------------

/** S4/S5: ten sam kontrakt dla agenta ryzyk - śmieci nie wchodzą do raportu. */
describe('S4/S5: writeRiskProse', () => {
  it('calls report_risk_analyst and stamps the risk ids from position', async () => {
    const seen: SeenCall[] = []
    const result = await writeRiskProse(fakeClient(goodRiskAnswer(), seen), noTools, RISK_INPUT)

    expect(seen[0].agentId).toBe('report_risk_analyst')
    expect(result.risks.map((risk) => risk.id)).toEqual(['8.1', '8.2'])
    expect(result.nextSteps).toHaveLength(2)
    expect(JSON.stringify(seen[0].input)).not.toContain('monthlyBanked')
  })

  it('ignores an id the model tried to author', () => {
    const answer = goodRiskAnswer()
    const risks = answer.risks.map((risk) => ({ ...risk, id: '9.9' }))
    const result = validateRiskAnalystResult({ ...answer, risks }, SCOPE)
    expect(result.risks.map((risk) => risk.id)).toEqual(['8.1', '8.2'])
  })

  it('rejects a next step pointing at a risk that does not exist', async () => {
    const answer = goodRiskAnswer()
    answer.nextSteps[0].action = 'Answer the offline-crew question in risk 8.7'
    await expect(writeRiskProse(fakeClient(answer), noTools, RISK_INPUT)).rejects.toThrow(
      /refers to risk 8\.7, but this run has risks 8\.1, 8\.2/,
    )
  })

  it('rejects a figure the model invented for a basis', async () => {
    const answer = goodRiskAnswer()
    answer.risks[0].basis = 'Assumed from a sample of 200 contacts'
    await expect(writeRiskProse(fakeClient(answer), noTools, RISK_INPUT)).rejects.toThrow(/assertNoFigures/)
  })

  it('rejects a figure the model invented for an effect', async () => {
    const answer = goodRiskAnswer()
    answer.risks[1].effect = 'Offline job sheets are a build — adds roughly 25 h to wave 3'
    await expect(writeRiskProse(fakeClient(answer), noTools, RISK_INPUT)).rejects.toThrow(/assertNoFigures/)
  })

  it('accepts a label-word number, because "risk 8.2" is a reference and not a quantity', async () => {
    const result = await writeRiskProse(fakeClient(goodRiskAnswer()), noTools, RISK_INPUT)
    expect(result.nextSteps[0].action).toContain('risk 8.2')
  })

  it('rejects a missing field inside one risk, naming the row', () => {
    const answer = goodRiskAnswer()
    const risks: Array<Record<string, unknown>> = answer.risks
    delete risks[1].handling
    expect(() => validateRiskAnalystResult(answer, SCOPE)).toThrow(
      /report_risk_analyst\.risks\[1\]\.handling: expected a non-empty string/,
    )
  })
})

// --- Report Curator Reader --------------------------------------------------

/** S10/S4: "nasz odczyt" do Appendix B - też bez ani jednej liczby. */
describe('S10: writeGapProse', () => {
  it('calls report_curator_reader and stamps the Appendix B id from the input', async () => {
    const seen: SeenCall[] = []
    const result = await writeGapProse(fakeClient(goodGapAnswer(), seen), noTools, GAP_INPUT)

    expect(seen[0].agentId).toBe('report_curator_reader')
    expect(result).toEqual({
      gapId: 'B.1',
      whyUnmapped: 'Specialist CAD; no entry in our catalog and no platform equivalent we could verify',
      ourRead: 'Almost certainly stays where it is. A possible integration target later',
    })
    // Etykieta wiersza nie jedzie do promptu - agent nie ma jej jak przekłamać.
    expect(JSON.stringify(seen[0].input)).not.toContain('"id"')
  })

  it('keeps the input id even when the model answers with another one', () => {
    const result = validateGapReaderResult({ ...goodGapAnswer(), gapId: 'B.9' }, 'B.1')
    expect(result.gapId).toBe('B.1')
  })

  it('rejects any slot, because this agent was given no figures to address', async () => {
    const answer = goodGapAnswer()
    answer.ourRead = 'Would cost about {money.rate} an hour to build'
    await expect(writeGapProse(fakeClient(answer), noTools, GAP_INPUT)).rejects.toThrow(
      /is given no computed figures/,
    )
  })

  it('rejects a bare figure', async () => {
    const answer = goodGapAnswer()
    answer.ourRead = 'Likely a natural fit for custom entities. Needs 30 minutes to confirm'
    await expect(writeGapProse(fakeClient(answer), noTools, GAP_INPUT)).rejects.toThrow(/assertNoFigures/)
  })

  it('rejects a missing field', async () => {
    const answer: Record<string, unknown> = goodGapAnswer()
    delete answer.whyUnmapped
    await expect(writeGapProse(fakeClient(answer), noTools, GAP_INPUT)).rejects.toThrow(
      /report_curator_reader\.whyUnmapped: expected a non-empty string/,
    )
  })

  it('drops a field the model bolted on beside the contract', () => {
    const result = validateGapReaderResult({ ...goodGapAnswer(), estimate: '30 h' }, 'B.1')
    expect(Object.keys(result).sort()).toEqual(['gapId', 'ourRead', 'whyUnmapped'])
  })
})
