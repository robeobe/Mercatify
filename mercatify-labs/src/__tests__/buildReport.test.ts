/** @jest-environment node */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentDefinition, ToolDefinition } from '../agentLoader'
import type { LlmClient, ToolExecutor } from '../llmClient'
import type { MigrationPlanResult } from '../migrationPlanner'
import { buildReport, type BuildReportOptions, type ConsultantInputs } from '../report/buildReport'
import type { ReportFacts } from '../report/model'
// Oba blokery z przeglądu końcowego (B4, B5) mierzymy na GOTOWYM DOKUMENCIE,
// a nie na pojedynczej funkcji - obie naprawy raz już "działały" na poziomie
// jednostki i pękały wyżej. Stąd renderer w teście złożenia.
import { renderReport } from '../report/renderReport'

/**
 * Testy złożenia: brief -> `ReportModel`.
 *
 * Trzon tego pliku to jeden pomiar i on jest powodem istnienia całej warstwy:
 * PRZEBIEG Z MODELEM I PRZEBIEG BEZ MODELU MUSZĄ DAĆ IDENTYCZNE `facts`.
 * Różnią się wyłącznie zdaniami. Tak wygląda żelazna zasada 2 (SPEC.md §2)
 * zmierzona, a nie zadeklarowana - dopóki ta asercja jest zielona, żaden agent
 * nie ma jak ruszyć ani jednej liczby w dokumencie klienta.
 *
 * Żaden test tutaj nie dotyka sieci. Każdy `LlmClient` jest atrapą, a
 * `toolExecutor` nie wykonuje niczego.
 */

const BRIEF: unknown = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'voltix-brief.json'), 'utf8'),
)

// --- Atrapy ------------------------------------------------------------------

const noTools: ToolExecutor = async () => ({})

interface FakeOptions {
  /** Odpowiedź per `agent.id`. Brak wpisu -> agent rzuca, jak model offline. */
  answers: Record<string, unknown>
  seen?: string[]
}

function fakeClient(options: FakeOptions): LlmClient {
  return {
    async runAgent(agent: AgentDefinition, _input: unknown, _tools: ToolDefinition[]) {
      options.seen?.push(agent.id)
      if (!Object.hasOwn(options.answers, agent.id)) {
        throw new Error(`fake client has no answer for ${agent.id}`)
      }
      return options.answers[agent.id]
    },
  }
}

/**
 * Proza, która przechodzi obie bramy: ani jednej cyfry poza slotem, a każdy
 * slot adresuje coś, co ten przebieg naprawdę ma.
 */
const EDITOR_ANSWER = {
  recommendation: 'Move the registers, the CRM and field service onto the platform and keep accounting where it is.',
  findings: [
    { heading: 'Seven tools, one process', body: 'The stack bills per tool for one job, and the job spans all of them.' },
    { heading: 'Duplication is the cheap win', body: 'Wave 1 closes {wave.1.monthlyBanked} a month without a line of new code.' },
  ],
  basisIntro: 'We read the invoices, the pipelines and the dispatch board before writing a word.',
  disclaimer: 'This is a consolidation study, not an audit, and not a fixed-price quote.',
}

const RISK_ANSWER = {
  risks: [
    {
      risk: 'Crew growth in the summer',
      basis: 'Assumed from the current headcount',
      effect: 'Seat counts move, and with them the recurring saving',
      handling: 'Re-price before the season, not after',
    },
  ],
  nextSteps: [
    { action: 'Confirm the offline requirement on site', owner: 'Operations', when: 'Before wave 3' },
  ],
}

const CRITIC_ANSWER = {
  verdict: 'revise',
  objections: [
    {
      severity: 'minor',
      rule: 'REP-3',
      location: 'facts.waves',
      claim: 'A wave title reads like a domain, not like a deliverable',
      evidence: 'Registers and stock',
    },
  ],
  notes: 'Advisory only.',
}

/** Plan od delivery leada - tu po to, żeby Migration Planner nie był wołany. */
const PLAN: MigrationPlanResult = {
  summary: 'Four waves, lightest process risk first.',
  items: [
    { source: 'Airtable', capability: 'data.custom', estimatedHours: 18, sequence: 1, rationale: 'r' },
    { source: 'Sortly', capability: 'inventory.stock', estimatedHours: 6, sequence: 2, rationale: 'r' },
    { source: 'Sortly', capability: 'inventory.multiwarehouse', estimatedHours: 3, sequence: 3, rationale: 'r' },
    { source: 'Sortly', capability: 'inventory.barcode', estimatedHours: 3, sequence: 4, rationale: 'r' },
    { source: 'HubSpot Sales', capability: 'crm.contacts', estimatedHours: 25, sequence: 5, rationale: 'r' },
    { source: 'HubSpot Sales', capability: 'crm.pipeline', estimatedHours: 20, sequence: 6, rationale: 'r' },
    { source: 'HubSpot Sales', capability: 'crm.email', estimatedHours: 10, sequence: 7, rationale: 'r' },
    { source: 'Jobber', capability: 'field.scheduling', estimatedHours: 12, sequence: 8, rationale: 'r' },
    { source: 'Jobber', capability: 'field.jobsheets', estimatedHours: 18, sequence: 9, rationale: 'r' },
    { source: 'Zendesk Suite', capability: 'support.tickets', estimatedHours: 3, sequence: 10, rationale: 'r' },
    { source: 'Zendesk Suite', capability: 'support.sla', estimatedHours: 2, sequence: 11, rationale: 'r' },
    { source: 'PandaDoc', capability: 'quotes.cpq', estimatedHours: 40, sequence: 12, rationale: 'r' },
    { source: 'PandaDoc', capability: 'docs.templates', estimatedHours: 4, sequence: 13, rationale: 'r' },
    { source: 'PandaDoc', capability: 'esignature', estimatedHours: 1, sequence: 14, rationale: 'r' },
  ],
}

interface BriefTool {
  name: string
  plan?: string
  unitPrice?: number
  termEnds?: string
  termType?: 'monthly' | 'annual'
}

function termsFromBrief(): ConsultantInputs['terms'] {
  const tools = (BRIEF as { tools: BriefTool[] }).tools
  return tools.map((tool) => ({
    tool: tool.name,
    plan: tool.plan ?? '',
    ...(tool.unitPrice === undefined ? {} : { unitPrice: tool.unitPrice }),
    termEnds: tool.termEnds ?? '',
    termType: tool.termType ?? 'monthly',
  }))
}

function consultant(overrides: Partial<ConsultantInputs> = {}): ConsultantInputs {
  return {
    meta: {
      caseId: 'CASE-0041',
      version: '1.0',
      issued: '2026-09-19',
      validUntil: '2026-10-19',
      preparedFor: { organization: 'Voltix Energy', person: 'Marta Nowak', role: 'COO' },
      preparedBy: { organization: 'Mercatify', person: 'Joanna Pawlowska', role: 'consultant on record' },
      humanReviewed: true,
      basis: 'Open Mercato — self-hosted, source available',
      confidentialityNote: 'Confidential — prepared for Voltix Energy.',
    },
    basis: {
      readWhat: 'A kick-off call, seven invoices and three screen-shares.',
      period: 'Licence costs as billed in August 2026.',
      exclusions: 'Statutory accounting, payroll and compliance sign-off.',
    },
    hostingMonthly: 180,
    rate: 120,
    counts: { statements: 38, offCatalog: 4 },
    programmeStart: '2026-10-01',
    plan: PLAN,
    terms: termsFromBrief(),
    ...overrides,
  }
}

function run(overrides: Partial<BuildReportOptions> = {}) {
  return buildReport({ brief: BRIEF, consultant: consultant(), ...overrides })
}

// --- Przebieg bez LLM --------------------------------------------------------

describe('buildReport bez LLM - pelnoprawny raport, same fakty', () => {
  it('oddaje ReportModel z kompletnymi faktami i bez prozy', async () => {
    const { model, critique, degradations } = await run()
    const facts = model.facts

    // SPEC.md §8: przebieg bez ani jednego agenta ma dac POPRAWNY raport.
    expect(model.prose).toBeUndefined()
    expect(critique).toBeUndefined()
    expect(facts.preview).toBeUndefined()
    expect(degradations).toContain('prose: no llmClient, the report carries tables and numbers only')

    // Kazda sekcja faktow jest na miejscu - brak prozy nie zabiera tabel.
    expect(Object.keys(facts).sort()).toEqual(
      ['basis', 'cash', 'company', 'coverage', 'gaps', 'glossary', 'kpis', 'meta', 'money', 'stack', 'waves'].sort(),
    )
    expect(facts.company).toEqual({
      name: 'Voltix Energy Sp. z o.o.',
      industry: '',
      employees: 34,
      currency: 'USD',
    })
    expect(facts.stack.rows).toHaveLength(7)
    expect(facts.coverage.rows).toHaveLength(8)
    expect(facts.waves).toHaveLength(4)
    expect(facts.glossary.rules.length).toBeGreaterThan(0)
  })

  it('liczy pieniadze z czystych funkcji, nie z niczyjej odpowiedzi', async () => {
    const { model } = await run()
    const { kpis, stack, money } = model.facts

    expect(stack.totalMonthly).toBe(2320)
    expect(stack.totalAnnual).toBe(27840)
    expect(stack.totalSeats).toBe(52)
    expect(kpis.licencesAfterMonthly).toBe(277)
    expect(kpis.licencesCancelledMonthly).toBe(2043)
    // (2043 - 180) * 12. Renderer tego nie liczy i nie ma prawa.
    expect(kpis.netRecurringAnnual).toBe(22356)
    expect(money.totalHours).toBe(165)
    expect(money.totalImplementationCost).toBe(165 * 120)
    expect(money.paybacks.programmeMonths).toBe(model.facts.cash?.breakEvenMonth)
  })

  it('liczniki sekcji 02 sa wejsciem czlowieka, ale nie moga ukryc luki silnika', async () => {
    const withCounts = await run()
    expect(withCounts.model.facts.basis.counts).toEqual({ statements: 38, matched: 34, offCatalog: 4 })

    // Bez liczników konsultanta - wyprowadzenie z mapowań. Voltix: 15 zdolności,
    // wszystkie w katalogu.
    const derived = await buildReport({
      brief: BRIEF,
      consultant: consultant({ counts: undefined }),
    })
    expect(derived.model.facts.basis.counts).toEqual({ statements: 15, matched: 15, offCatalog: 0 })
    expect(derived.model.facts.gaps).toEqual([])
  })
})

// --- Zelazna zasada 2 --------------------------------------------------------

describe('zelazna zasada 2 - agent nie rusza ani jednej liczby', () => {
  it('przebieg z modelem daje IDENTYCZNE facts jak przebieg bez modelu', async () => {
    const withoutLlm = await run()
    const seen: string[] = []
    const withLlm = await run({
      llmClient: fakeClient({
        answers: {
          process_analyst: { name: 'Lead to installed', steps: ['Lead', 'Quote'] },
          om_architect: { rationale: 'The catalog decided; this is only the reading.' },
          consolidation_strategist: { summary: 'One platform, four waves.', entities: [], workflows: [], modules: [], customScreens: [], integrations: [] },
          finops: { summary: 'The saving is recurring, the cost is one-off.' },
          report_editor: EDITOR_ANSWER,
          report_risk_analyst: RISK_ANSWER,
          critic: CRITIC_ANSWER,
        },
        seen,
      }),
      toolExecutor: noTools,
    })

    // TO JEST TEN POMIAR. Cztery agenty narracyjne i dwa agenty prozy
    // przebiegly, a `facts` nie drgnelo - ani kwota, ani godzina, ani miesiac.
    expect(withLlm.model.facts).toEqual(withoutLlm.model.facts)
    expect(withLlm.model.prose).toBeDefined()
    expect(withoutLlm.model.prose).toBeUndefined()

    // Plan od czlowieka bije agenta: Migration Planner nie zostal nawet
    // zapytany, wiec godziny w obu przebiegach pochodza z tego samego zrodla.
    expect(seen).not.toContain('migration_planner')
    expect(seen).toContain('report_editor')
  })

  it('proza dochodzi w calosci i nie wnosi zadnego pola do faktow', async () => {
    const { model, critique } = await run({
      llmClient: fakeClient({
        answers: {
          process_analyst: { name: 'p', steps: [] },
          om_architect: { rationale: 'r' },
          consolidation_strategist: { summary: 's' },
          finops: { summary: 'f' },
          report_editor: EDITOR_ANSWER,
          report_risk_analyst: RISK_ANSWER,
          critic: CRITIC_ANSWER,
        },
      }),
      toolExecutor: noTools,
    })

    expect(model.prose?.recommendation).toBe(EDITOR_ANSWER.recommendation)
    expect(model.prose?.findings).toHaveLength(2)
    expect(model.prose?.risks?.[0].id).toBe('8.1')
    expect(model.prose?.nextSteps).toHaveLength(1)
    // Werdykt krytyka stoi OBOK modelu, nie w nim - doradczy znaczy
    // "niczego nie stosuje", a typ nie ma pola, przez ktore moglby wplynac.
    expect(critique?.verdict).toBe('revise')
    expect(JSON.stringify(model)).not.toContain('Advisory only')
  })
})

// --- Straznik liczb w prozie -------------------------------------------------

describe('agent, ktory podal doslowna liczbe, jest glosnym bledem', () => {
  it('rzuca zamiast po cichu zgubic sekcje', async () => {
    await expect(
      run({
        llmClient: fakeClient({
          answers: {
            process_analyst: { name: 'p', steps: [] },
            om_architect: { rationale: 'r' },
            consolidation_strategist: { summary: 's' },
            finops: { summary: 'f' },
            report_editor: {
              ...EDITOR_ANSWER,
              // Dokladnie blad ze SPEC.md §10, w jego najnaturalniejszym
              // sformulowaniu: liczba, ktorej nikt nie policzyl.
              recommendation: 'Net annual saving is $6,000, with a payback period of 24 months.',
            },
          },
        }),
        toolExecutor: noTools,
      }),
    ).rejects.toThrow(/assertNoFigures/)
  })

  it('nie jest mylona z awaria agenta - ta gubi tylko sekcje', async () => {
    const { model, degradations } = await run({
      llmClient: fakeClient({
        answers: {
          process_analyst: { name: 'p', steps: [] },
          om_architect: { rationale: 'r' },
          consolidation_strategist: { summary: 's' },
          finops: { summary: 'f' },
          report_risk_analyst: RISK_ANSWER,
          critic: CRITIC_ANSWER,
        },
      }),
      toolExecutor: noTools,
    })

    // Report Editor padl (atrapa nie ma dla niego odpowiedzi): brakuje jego
    // czterech pol, reszta prozy i WSZYSTKIE liczby stoja.
    expect(model.prose?.recommendation).toBeUndefined()
    expect(model.prose?.risks).toHaveLength(1)
    expect(model.facts.kpis.netRecurringAnnual).toBe(22356)
    expect(degradations.some((note) => note.startsWith('report_editor:'))).toBe(true)
  })
})

// --- Degradacja podgladu -----------------------------------------------------

describe('padniecie podgladu gubi sekcje 07, nie liczby', () => {
  const answersWithout = (missing: string) => {
    const all: Record<string, unknown> = {
      process_analyst: { name: 'p', steps: [] },
      om_architect: { rationale: 'r' },
      consolidation_strategist: { summary: 's', entities: [], workflows: [], modules: [], customScreens: [], integrations: [] },
      finops: { summary: 'f' },
      report_editor: EDITOR_ANSWER,
      report_risk_analyst: RISK_ANSWER,
      critic: CRITIC_ANSWER,
      sandbox_engineer: { screens: [] },
    }
    delete all[missing]
    return all
  }

  it('model nie ma facts.preview, a liczby sa nietkniete', async () => {
    const reference = await run()
    const { model, degradations } = await run({
      llmClient: fakeClient({ answers: answersWithout('qa') }),
      toolExecutor: noTools,
      preview: { outDir: join(__dirname, '..', '..', 'nigdy-nie-powstanie') },
    })

    // `sandbox_engineer` oddal puste `screens`, wiec `validateScreens` odrzuca
    // wynik ZANIM cokolwiek dotknie dysku - katalog podgladu nie powstaje.
    expect(model.facts.preview).toBeUndefined()
    expect(degradations.some((note) => note.startsWith('preview:'))).toBe(true)
    expect(model.facts.kpis).toEqual(reference.model.facts.kpis)
    expect(model.facts.cash).toEqual(reference.model.facts.cash)
  })

  it('bez blueprintu podglad nie rusza i mowi dlaczego', async () => {
    const { model, degradations } = await run({
      llmClient: fakeClient({
        answers: {
          process_analyst: { name: 'p', steps: [] },
          om_architect: { rationale: 'r' },
          finops: { summary: 'f' },
          report_editor: EDITOR_ANSWER,
          report_risk_analyst: RISK_ANSWER,
          critic: CRITIC_ANSWER,
        },
      }),
      toolExecutor: noTools,
      preview: { outDir: join(__dirname, '..', '..', 'nigdy-nie-powstanie') },
    })
    expect(model.facts.preview).toBeUndefined()
    expect(degradations).toContain(
      'preview: the strategist produced no blueprint, there is nothing to draw',
    )
  })
})

// --- Scenariusz S2: nikt nie podal kosztow -----------------------------------

describe('brak kosztow daje raport, nie dziure', () => {
  it('bez stawki i bez hostingu znikaja kwoty, a nie tabele', async () => {
    const { model, degradations } = await buildReport({
      brief: BRIEF,
      consultant: consultant({ rate: undefined, hostingMonthly: undefined }),
    })
    const facts: ReportFacts = model.facts

    expect(facts.cash).toBeUndefined()
    expect(facts.money.rate).toBeNull()
    expect(facts.money.totalImplementationCost).toBeNull()
    expect(facts.kpis.hostingMonthly).toBeNull()
    // `null`, nie `0`: zero mowi "za darmo", `null` mowi "nikt nie podal".
    expect(facts.kpis.netRecurringAnnual).toBeNull()
    expect(facts.kpis.breakEvenMonth).toBeNull()
    expect(facts.money.paybacks).toEqual({
      buildOnlyMonths: null,
      buildOnlyCost: null,
      programmeMonths: null,
    })
    // To, co klient PLACI DZIS, wiemy z briefu i to zostaje.
    expect(facts.kpis.licencesTodayMonthly).toBe(2320)
    expect(facts.stack.rows).toHaveLength(7)
    expect(facts.waves).toHaveLength(4)
    expect(degradations).toContain('cash series: no rate or no hosting cost was supplied')
  })

  it('bez planu godziny sa DOLNA GRANICA, a nie zerem bez ostrzezenia', async () => {
    const { model, degradations } = await buildReport({
      brief: BRIEF,
      consultant: consultant({ plan: undefined }),
    })
    expect(model.facts.kpis.implementationHoursAreFloor).toBe(true)
    expect(model.facts.money.totalHoursAreFloor).toBe(true)
    expect(degradations).toContain(
      'effort hours: no migration plan, wave totals are lower bounds',
    )
  })
})

// --- Bramy na wejscia konsultanta --------------------------------------------

describe('wejscia konsultanta sa bramkowane po nazwie pola', () => {
  it('odrzuca hosting, ktory nie zgadza sie sam ze soba', async () => {
    await expect(
      buildReport({
        brief: BRIEF,
        consultant: consultant({ hostingMonthly: 180, omOperatingCost: 9999 }),
      }),
    ).rejects.toThrow(/disagree/)
  })

  it('przyjmuje roczny koszt i sam podaje jego forme miesieczna', async () => {
    const { model } = await buildReport({
      brief: BRIEF,
      consultant: consultant({ hostingMonthly: undefined, omOperatingCost: 2160 }),
    })
    expect(model.facts.kpis.hostingMonthly).toBe(180)
    expect(model.facts.kpis.netRecurringAnnual).toBe(22356)
  })

  it('odrzuca warunki umowy wskazujace narzedzie spoza briefu', async () => {
    await expect(
      buildReport({
        brief: BRIEF,
        consultant: consultant({ terms: [{ tool: 'HubSpot', plan: 'Pro' }] }),
      }),
    ).rejects.toThrow(/not a tool in this brief/)
  })

  it.each([
    ['meta.caseId nie jest stringiem', { caseId: 7 }],
    ['meta.issued nie jest data ISO', { issued: '19.09.2026' }],
    ['meta.humanReviewed nie jest boolem', { humanReviewed: 'yes' }],
  ])('odrzuca %s', async (_label, patch) => {
    const base = consultant()
    await expect(
      buildReport({
        brief: BRIEF,
        consultant: { ...base, meta: { ...base.meta, ...(patch as object) } },
      }),
    ).rejects.toThrow(/consultant\.meta/)
  })

  it('nie przepuszcza pola doklejonego obok kontraktu metadanych', async () => {
    const base = consultant()
    const { model } = await buildReport({
      brief: BRIEF,
      consultant: {
        ...base,
        meta: { ...base.meta, ...({ secretMargin: 0.42 } as object) },
      },
    })
    expect(JSON.stringify(model.facts.meta)).not.toContain('secretMargin')
  })
})

// --- Tabela pokrycia ---------------------------------------------------------

describe('tabela pokrycia mowi to, co wie brief, i nic ponadto', () => {
  it('daje jeden wiersz na modul i liczy koszt narzedzia tylko raz', async () => {
    const { model } = await run()
    const rows = model.facts.coverage.rows
    const pandaDoc = rows.filter((row) => row.tool === 'PandaDoc')

    expect(pandaDoc).toHaveLength(2)
    expect(pandaDoc[0].monthly).toBe(199)
    // Drugi wiersz tego samego narzedzia to jedna faktura, nie dwie.
    expect(pandaDoc[1].monthly).toBe('included')
    expect(rows.every((row) => row.evidenceKind.length > 0)).toBe(true)
  })

  it('werdykt modulu jest najciezszy z jego zdolnosci, pewnosc najnizsza', async () => {
    const { model } = await run()
    const jobber = model.facts.coverage.rows.find((row) => row.tool === 'Jobber')
    // Jobber: `field.scheduling` configure/low + `field.jobsheets` build/low.
    // Czytelnik pyta "ile mnie to kosztuje" - odpowiada najciezsza zdolnosc.
    expect(jobber?.verdict).toBe('build')
    expect(jobber?.confidence).toBe('low')
  })

  it('licznik Figure 1 chodzi po MAPOWANIACH, nie po wierszach', async () => {
    const { model } = await run()
    const counts = model.facts.coverage.byVerdict
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
    expect(total).toBe(15)
    expect(counts.offCatalog).toBe(0)
  })
})

// --- B4 - dwie liczby, dwie jednostki ----------------------------------------

/**
 * Figure 1 i przypis sekcji 02 liczą DWA RÓŻNE ZBIORY i dokument ma to mówić.
 *
 * DLACZEGO NA PEŁNYM PRZEBIEGU, A NIE NA `renderCoverage`. Bug nie mieszkał w
 * żadnej z tych funkcji z osobna: `basis.ts` poprawnie drukował licznik
 * konsultanta (38), `coverage.ts` poprawnie sumował `byVerdict` (15) i każdy
 * z nich, testowany sam, był zielony. Sprzeczność powstawała dopiero w
 * ZŁOŻONYM DOKUMENCIE - i dokładnie tam ją mierzymy: `buildReport` liczy
 * fakty, `renderReport` składa HTML, a asercja czyta gotowe strony.
 *
 * Golden master (`renderReport.test.ts`) tego nie łapał i nie mógł: stoi na
 * ręcznie napisanym `voltix.reportmodel.json`, w którym `byVerdict` sumuje się
 * do 38, czyli na modelu, którego silnik nie ma jak wyprodukować.
 */
describe('B4: Figure 1 i sekcja 02 nie podaja dwoch liczb pod jednym slowem', () => {
  it('kazda z dwoch liczb ma WLASNA jednostke i wlasne zdanie', async () => {
    const { model } = await run()
    const html = renderReport(model)

    // Fakty: 38 od konsultanta, 15 z mapowań. Ten rozjazd JEST danymi.
    expect(model.facts.basis.counts.statements).toBe(38)
    const mapped = Object.values(model.facts.coverage.byVerdict).reduce((sum, value) => sum + value, 0)
    expect(mapped).toBe(15)

    // Sekcja 02 mówi o wypowiedziach z rozpoznania.
    expect(html).toContain('38 usage statements were extracted from the above')
    // Figure 1 mówi o mapowaniach - i ani razu nie nazywa ich wypowiedziami.
    expect(html).toContain('Figure 1 — Where your 15 mapped capabilities land')
    expect(html).toContain('Coverage of 15 mapped capabilities by verdict')
    expect(html).toContain('<text x="700" y="60" text-anchor="end">15 mapped capabilities</text>')
    expect(html).not.toContain('15 usage statements')

    // I stoi zdanie, które łączy obie liczby, więc czytelnik nie zgaduje.
    expect(html).toContain(
      'Figure 1 in section 04 counts a different set — the 15 tool-and-capability pairs our ' +
        'mapping engine scored — because several statements can describe the same pair.',
    )
  })

  it('przy zgodnych liczbach zdanie o roznicy NIE pada - nie ma czego tlumaczyc', async () => {
    // Bez liczników konsultanta obie liczby to te same 15 mapowań.
    const { model } = await buildReport({
      brief: BRIEF,
      consultant: consultant({ counts: undefined }),
    })
    const html = renderReport(model)

    expect(model.facts.basis.counts.statements).toBe(15)
    expect(html).toContain('15 usage statements were extracted from the above')
    expect(html).not.toContain('counts a different set')
  })
})

// --- B5 - zdolnosc spoza katalogu nie wchodzi do zadnej kwoty ----------------

/**
 * Brief Voltixa z DOPISANYM narzędziem, którego katalog nie zna.
 *
 * Aurora Solar jest tym samym przykładem, którym posługują się `toolVerdict.ts`
 * i scenariusz S10: specjalistyczny CAD, jedna zdolność `panel_layout`, bez
 * wpisu w katalogu. `mapCapabilities` daje jej w ścieżce awaryjnej
 * `decision: 'build'`, `confidence: 'low'` i `evidence: 'not in catalog'`.
 */
function briefWithOffCatalogTool(): unknown {
  // Bez `as`: brief jest danymi z pliku, więc kształt sprawdzamy, zamiast go
  // deklarować. Fixture, który zgubi `tools`, ma zapalić się tutaj z własnym
  // zdaniem, a nie dwie warstwy dalej jako `undefined is not iterable`.
  const clone: unknown = JSON.parse(JSON.stringify(BRIEF))
  // `in` zawęża typ, `Object.hasOwn` pilnuje, żeby to była WŁASNA właściwość,
  // a nie coś z prototypu. Oba, bo `Object.hasOwn` w tej wersji `lib` nie jest
  // strażnikiem typu, a samo `in` przepuściłoby klucz z `Object.prototype`.
  if (
    typeof clone !== 'object' ||
    clone === null ||
    !('tools' in clone) ||
    !Object.hasOwn(clone, 'tools') ||
    !Array.isArray(clone.tools)
  ) {
    throw new Error('fixture voltix-brief.json lost its tools array')
  }
  clone.tools.push({
    id: 'aurora',
    name: 'Aurora Solar',
    plan: 'Pro',
    kind: 'Design',
    category: 'Design',
    seats: 4,
    unitPrice: 100,
    monthly: 400,
    termEnds: '',
    termType: 'monthly',
    modules: [
      {
        id: 'design',
        name: 'Panel layout',
        desc: 'Panel layout and shading design',
        caps: ['panel_layout'],
        evidenceKind: 'observed',
        evidenceNote: 'mentioned on the call',
      },
    ],
  })
  return clone
}

/** Ten sam plan co wyżej plus wiersz, który wycenia zdolność spoza katalogu. */
const PLAN_WITH_OFF_CATALOG: MigrationPlanResult = {
  ...PLAN,
  items: [
    ...PLAN.items,
    { source: 'Aurora Solar', capability: 'panel_layout', estimatedHours: 16, sequence: 15, rationale: 'r' },
  ],
}

/**
 * Złoty raport o tych pozycjach: *"They are excluded from every figure in this
 * report."* Ten blok mierzy DOSŁOWNIE to zdanie.
 *
 * DLACZEGO NA PEŁNYM PRZEBIEGU, A NIE NA `groupIntoWaves`. Naprawa strony
 * OSZCZĘDNOŚCI (`toolVerdict.ts`) była zielona na własnym teście jednostkowym
 * i mimo to raport nadal wliczał Aurorę do KOSZTU, bo `waves.ts` o pojęciu
 * "poza katalogiem" nie wiedziało. Jednostka nie ma jak tego zobaczyć: droga
 * z mapowania do `kpis.implementationCost` prowadzi przez `Wave.hours`,
 * `money.totalHours` i `computeCashSeries`. Dlatego porównujemy DWA PEŁNE
 * PRZEBIEGI - z Aurorą i bez - i wymagamy, żeby wszystko, co jest kwotą albo
 * kalendarzem, było IDENTYCZNE.
 *
 * Asercja jest celowo na całych obiektach (`facts.waves`, `facts.cash`), a nie
 * na wybranych polach: nowe pole niosące godziny albo miesiące ma się tu
 * zapalić samo, zamiast czekać, aż ktoś dopisze mu asercję.
 */
describe('B5: zdolnosc spoza katalogu nie wchodzi ani do fal, ani do kwot', () => {
  async function bothRuns() {
    const withoutAurora = await buildReport({
      brief: BRIEF,
      consultant: consultant({ counts: { statements: 38, offCatalog: 4 } }),
    })
    const withAurora = await buildReport({
      brief: briefWithOffCatalogTool(),
      consultant: consultant({
        plan: PLAN_WITH_OFF_CATALOG,
        counts: { statements: 38, offCatalog: 4 },
        terms: [
          ...(consultant().terms ?? []),
          { tool: 'Aurora Solar', plan: 'Pro', unitPrice: 100, termEnds: '', termType: 'monthly' },
        ],
      }),
    })
    return { base: withoutAurora.model.facts, off: withAurora.model.facts }
  }

  it('fale i seria gotowki sa CO DO POLA takie same jak bez niej', async () => {
    const { base, off } = await bothRuns()

    // Kalendarz, godziny, kwoty per fala - bez zmian. Przed naprawą wyrastała
    // tu piąta fala "TBD — needs discovery" i przesuwała trzy następne.
    expect(off.waves).toEqual(base.waves)
    expect(off.cash).toEqual(base.cash)
    expect(off.money.implementation).toEqual(base.money.implementation)
    expect(off.money.totalHours).toBe(base.money.totalHours)
    expect(off.money.totalImplementationCost).toBe(base.money.totalImplementationCost)

    // Kafelki: koszt, godziny, tygodnie, break-even, netto na horyzoncie.
    expect(off.kpis.implementationHours).toBe(base.kpis.implementationHours)
    expect(off.kpis.implementationCost).toBe(base.kpis.implementationCost)
    expect(off.kpis.implementationHoursAreFloor).toBe(base.kpis.implementationHoursAreFloor)
    expect(off.kpis.programmeWeeks).toBe(base.kpis.programmeWeeks)
    expect(off.kpis.breakEvenMonth).toBe(base.kpis.breakEvenMonth)
    expect(off.kpis.netAtHorizon).toBe(base.kpis.netAtHorizon)

    // Strona oszczędności - to trzyma już `toolVerdict.ts` i ma dalej trzymać:
    // subskrypcji narzędzia, którego nie rozumiemy, nikt nie bankuje.
    expect(off.kpis.licencesCancelledMonthly).toBe(base.kpis.licencesCancelledMonthly)
  })

  it('zadna fala jej nie niesie - ani w zakresie, ani w tytule, ani w wylaczeniach', async () => {
    const { off } = await bothRuns()

    expect(off.waves.map((wave) => wave.title)).not.toContain('TBD — needs discovery')
    expect(off.waves.flatMap((wave) => wave.scope.map((item) => item.source))).not.toContain(
      'Aurora Solar',
    )
    expect(off.waves.flatMap((wave) => wave.scope.map((item) => item.capability))).not.toContain(
      'panel_layout',
    )
    expect(off.waves.flatMap((wave) => [...wave.toolsOff, ...wave.toolsReduced])).not.toContain(
      'Aurora Solar',
    )
  })

  it('NIE ZNIKA jednak z dokumentu - Appendix B, licznik i Figure 1 nadal o niej mowia', async () => {
    const { base, off } = await bothRuns()

    // Appendix B: jawnie nazwane miejsce tych pozycji, dokładnie jak w goldenie.
    expect(off.gaps).toEqual([
      {
        id: 'B.1',
        source: 'Aurora Solar',
        capability: 'panel_layout',
        described: 'Panel layout and shading design',
      },
    ])
    expect(base.gaps).toEqual([])

    // Figure 1 dostaje segment kreskowany, a nie ciszę.
    expect(off.coverage.byVerdict.offCatalog).toBe(1)
    // I wiersz w tabeli pokrycia - narzędzie jest widoczne, tylko bez kwoty
    // w falach.
    expect(off.coverage.rows.map((row) => row.tool)).toContain('Aurora Solar')

    const html = renderReport({ facts: off })
    expect(html).toContain('Off-catalog items')
    expect(html).toContain('Panel layout and shading design')
  })
})
