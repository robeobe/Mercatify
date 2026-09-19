/** @jest-environment node */
/**
 * Scenariusze §7 planu (`.claude/plans/mercatify-report-pipeline.plan.md`),
 * czyli TEST-001…025 ze specu — te, których nie broni jeszcze żaden inny plik.
 *
 * Reszta scenariuszy ma dom tam, gdzie mieszka broniony przez nie kod, i jest
 * tam OZNACZONA etykietą `SX` w nazwie testu albo w komentarzu nad `describe`.
 * Ten plik zbiera wyłącznie sieroty — i to one, a nie etykiety, są tu treścią:
 *
 *   S2  brief bez kosztów              → dokument bez KPI pieniężnych
 *   S7  nie ma czego budować           → fale są, godzin builda zero
 *   S8  każde narzędzie zostaje        → zero fal, zero oszczędności
 *   S10 narzędzie poza katalogiem      → Appendix B (kwoty: patrz nota niżej)
 *   S12 duplikat zdolności             → sekcja "Paid twice"
 *   S14 brief bez narzędzi             → odmowa z nazwą pola
 *   S16 QA `blocked`                   → sekcja 07 mówi, na którym kroku
 *   S17 konsultant poprawia mapowanie  → przebudowa bez przebiegu agentów
 *   S18 regeneracja po wysłaniu        → wersja rośnie, reszta bez zmian
 *   S22 brief ponad sufit              → odmowa, zanim cokolwiek pójdzie dalej
 *
 * CZEGO TU NIE MA I DLACZEGO — cztery scenariusze zablokowane na Fazie 3,
 * bo broniącego ich kodu jeszcze nie ma. Warstwy, które JUŻ istnieją, są dla
 * nich pokryte gdzie indziej, więc atrapa tutaj udawałaby tylko pokrycie.
 * Kształt każdego brakującego testu, żeby nie trzeba było go wymyślać drugi
 * raz, gdy CLI powstanie:
 *
 *   S1  pełny łańcuch      → `buildReport(voltix-brief.json)` daje model,
 *                            który renderuje się zgodnie z goldenem sekcja po
 *                            sekcji (dziś od `ReportModel` w górę:
 *                            `renderReport.test.ts`, "S1: kontra golden master")
 *   S3  `--no-llm`         → `parseArgs(['--no-llm'])` + przebieg CLI na
 *                            briefie Voltixa: kod 0, plik powstaje, ani jedno
 *                            wywołanie `LlmClient` (dziś: `orchestrator.test.ts`
 *                            tryb deterministyczny + `renderReport.test.ts`
 *                            "S3: bez prozy w ogóle")
 *   S20 LLM nieosiągalny   → preflight `GET /models` na martwy port: kod 2 i
 *                            komunikat nazywający `LLM_BASE_URL`, na wzór
 *                            `previewCli.test.ts` "kontrakt kodow wyjscia"
 *   S21 symlink w `--out`  → `assertOutDirUsable` na dowiązaniu: odmowa PRZED
 *                            wywołaniem modelu (sam `writeReport` już to ma:
 *                            `renderReport.test.ts`, "S21: ODMAWIA zapisu…")
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeScenario } from '../computeScenario'
import { findCatalogGaps } from '../catalogGaps'
import { normalizeBrief } from '../intake/fromBrief'
import { mapCapabilities } from '../mapCapabilities'
import { buildReport, type ConsultantInputs } from '../report/buildReport'
import { deriveStatementCounts } from '../report/counts'
import { renderReport } from '../report/renderReport'
import { groupIntoWaves, type WaveStackRow } from '../report/waves'
import type { ReportFacts, ReportModel } from '../report/model'
import type {
  MercatoMappingResult,
  SaaSCapabilityInput,
  SaaSProductInput,
} from '../types'

/**
 * Fixture wchodzi z `as`, jak w `renderReport.test.ts` i `slots.test.ts`:
 * JSON nie zna unii `verdict`/`termType`, a jedno rzutowanie na granicy pliku
 * testowego jest tańsze niż rozbieranie 200 wierszy ręcznie. Kod produkcyjny
 * nadal nie ma ani jednego.
 */
const baseModel = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'voltix.reportmodel.json'), 'utf8'),
) as ReportModel

/** Świeża kopia faktów na każdy test — żaden nie ma prawa zabrudzić kolejnego. */
function facts(): ReportFacts {
  return JSON.parse(JSON.stringify(baseModel.facts)) as ReportFacts
}

const mapping = (
  over: Partial<MercatoMappingResult> &
    Pick<MercatoMappingResult, 'source' | 'capability' | 'targetFeature' | 'decision'>,
): MercatoMappingResult => ({ confidence: 'medium', evidence: 'test', ...over })

const stackRow = (over: Partial<WaveStackRow> & Pick<WaveStackRow, 'tool'>): WaveStackRow => ({
  monthly: 100,
  termEnds: '',
  termType: 'monthly',
  ...over,
})

/** Dokument bez śladu po pominiętej treści — pusty `<p>` czyta się jak usterka. */
function closesCleanly(html: string): void {
  expect(html.startsWith('<!doctype html>')).toBe(true)
  expect(html.trimEnd().endsWith('</html>')).toBe(true)
  expect(html).not.toMatch(/<(p|h2|h3|h4)\b[^>]*>\s*<\/\1>/)
}

/** Brief Voltixa z dysku — ten sam plik, który czyta `report-cli`. */
const VOLTIX_BRIEF: unknown = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'voltix-brief.json'), 'utf8'),
)

/** Wejścia konsultanta: stawka i hosting SĄ znane, ceny licencji nie będą. */
function voltixConsultant(): ConsultantInputs {
  return {
    meta: {
      caseId: 'CASE-0041',
      version: '1.0',
      issued: '2026-09-19',
      validUntil: '2026-10-19',
      preparedFor: { organization: 'Voltix Energy', person: 'Marta Nowak', role: 'COO' },
      preparedBy: { organization: 'Mercatify', person: 'Joanna Pawlowska', role: 'consultant' },
      humanReviewed: true,
      basis: 'Open Mercato — self-hosted, source available',
      confidentialityNote: 'Confidential — prepared for Voltix Energy.',
    },
    basis: {
      readWhat: 'A kick-off call and three screen-shares.',
      period: 'Licence costs as billed in August 2026.',
      exclusions: 'Statutory accounting and payroll.',
    },
    hostingMonthly: 180,
    rate: 120,
    programmeStart: '2026-10-01',
  }
}

// --- S2 · brief bez kosztów -------------------------------------------------

/**
 * Formularz obiecuje klientowi wprost: *"without them we can only tell you
 * what moves, not what it saves"*. Ta obietnica ma dwie połowy i obie muszą
 * być prawdziwe — raport MA powstać, i NIE MA w nim udawać, że policzył
 * pieniądze. `renderReport.test.ts` broni wariantu "brak faktur, ale znamy
 * stanowiska"; tu jest ten ostrzejszy: brief, w którym `seats` i `monthly` są
 * puste, czyli dokładnie to, co wychodzi z formularza wypełnionego w pięć
 * minut.
 */
describe('S2: brief bez kosztów i bez stanowisk', () => {
  const NO_COST_BRIEF = {
    v: 2,
    kind: 'mercatify-brief',
    company: { name: 'Voltix Energy', industry: 'Solar', people: 34 },
    currency: 'USD',
    tools: [
      {
        name: 'HubSpot Sales',
        category: 'CRM',
        monthly: 0,
        modules: [{ name: 'CRM', desc: 'Contacts', caps: ['crm.contacts'] }],
      },
    ],
  }

  it('brief bez ceny i bez stanowisk przechodzi bramę - to brak danych, nie błąd', () => {
    const normalized = normalizeBrief(NO_COST_BRIEF)
    // ASERCJA ZMIENIONA WRAZ Z POPRAWKĄ B2, i to jest jej sedno, a nie
    // szczegół. Wcześniej stało tu `toBe(0)` - brama przepuszczała zero z
    // pustego pola formularza jako KWOTĘ, a dokument drukował potem
    // "Licences today $0/mo" i "Net recurring saving −$2,160/yr", czyli
    // twierdził, że stos jest darmowy, a konsolidacja kosztuje. Zero z
    // `briefNumber('')` (`assets/stack-tool/catalog.js`) jest brakiem danych i
    // brama musi je tak nazwać - `readMonthlyCost` tłumaczy granicę między
    // tym zerem a narzędziem naprawdę darmowym.
    expect(normalized.tools[0].monthlyCost).toBeNull()
    // Kluczowe: pola NIE MA, a nie jest zerem. Zero stanowisk znaczyłoby
    // "nikt tego nie używa" i wpisałoby się do raportu jako twierdzenie.
    expect(Object.hasOwn(normalized.tools[0], 'seatCount')).toBe(false)
  })

  it('cena dodatnia przechodzi nietknięta - brama gasi zero, nie liczby', () => {
    const priced = normalizeBrief({
      ...NO_COST_BRIEF,
      tools: [{ ...NO_COST_BRIEF.tools[0], monthly: 890 }],
    })
    expect(priced.tools[0].monthlyCost).toBe(890)
  })

  it('brak POLA `monthly` to nadal błąd - to inny kształt briefu, nie brak wiedzy', () => {
    const { monthly: _dropped, ...withoutMonthly } = NO_COST_BRIEF.tools[0]
    expect(() => normalizeBrief({ ...NO_COST_BRIEF, tools: [withoutMonthly] })).toThrow(
      /tools\[0\]\.monthly/,
    )
  })

  it('dokument bez serii i bez stanowisk nie drukuje ANI JEDNEJ kwoty', () => {
    const base = facts()
    const html = renderReport({
      facts: {
        ...base,
        cash: undefined,
        kpis: {
          ...base.kpis,
          seatCount: null,
          licencesTodayMonthly: null,
          licencesTodayAnnual: null,
          licencesAfterMonthly: null,
          netRecurringAnnual: null,
          hostingMonthly: null,
          implementationCost: null,
          breakEvenMonth: null,
          netAtHorizon: null,
          licencesCancelledMonthly: null,
        },
        money: {
          ...base.money,
          recurring: [],
          implementation: [],
          rate: null,
          totalImplementationCost: null,
          paybacks: { buildOnlyMonths: null, buildOnlyCost: null, programmeMonths: null },
        },
        stack: {
          ...base.stack,
          rows: base.stack.rows.map((row) => ({
            ...row,
            seats: null,
            unitPrice: null,
            monthly: null,
            annual: null,
          })),
          totalSeats: null,
          totalMonthly: null,
          totalAnnual: null,
        },
        coverage: {
          ...base.coverage,
          rows: base.coverage.rows.map((row) => ({ ...row, monthly: null })),
        },
        waves: base.waves.map((wave) => ({ ...wave, monthlyBanked: null })),
      },
    })
    closesCleanly(html)

    // Notka kafelka mówi o kształcie stosu BEZ stanowisk - "7 tools", kropka.
    expect(html).toContain('7 tools · no costs were supplied')
    expect(html).not.toContain('seats ·')

    // Zamiast wykresu stoi zdanie. To jest cała różnica między "nie wiemy" a
    // płaską linią na zerach, która czyta się jak "nic nie zyskujesz".
    expect(html).not.toContain('id="fig-cash"')
    expect(html).toContain('No costs were supplied for this stack, so there is nothing to plot.')

    // Najostrzejsza asercja tego scenariusza: nigdzie w dokumencie nie ma
    // znaku dolara. Jedna kwota, która przecieknie z fixture'a, to jedna
    // liczba, której klient nie podał, a raport podaje.
    expect(html).not.toContain('$')
  })
})

// --- S2 · od briefu do HTML-a, jednym przebiegiem ---------------------------

/**
 * TEN TEST JEST POWODEM, DLA KTÓREGO B2 PRZEŻYŁ POPRZEDNI PRZEGLĄD.
 *
 * Powyższy blok S2 sprawdza dwie rzeczy OSOBNO: że `normalizeBrief` przyjmuje
 * brief bez cen, i że renderer milczy o pieniądzach, gdy WRĘCZY MU SIĘ model z
 * ręcznie wpisanymi `null`. Odcinek MIĘDZY nimi — brief → `buildReport` →
 * `ReportModel` → HTML — nie był pokryty ani razu, a defekt siedział dokładnie
 * tam: brama oddawała `monthlyCost: 0`, `buildStack` przepisywał zero bez
 * zmiany, `buildKpis` wkładał je do `licencesTodayMonthly` i dokument
 * twierdził, że stos jest darmowy. Każdy z tych trzech kroków był z osobna
 * "poprawny".
 *
 * Wejście jest DOKŁADNIE tym, co produkuje formularz wypełniony bez faktur:
 * brief Voltixa z dysku, w którym każde `monthly` to zero z `briefNumber('')`
 * (`assets/stack-tool/catalog.js`). Stawka i hosting SĄ podane — i to jest
 * ostrzejszy wariant, bo przebieg ma wtedy z czego policzyć koszty i wychodzi
 * mu, że konsolidacja kosztuje, a stos jest darmowy.
 */
describe('S2: brief bez cen przechodzi CAŁY łańcuch do dokumentu', () => {
  /** Brief z dysku z wyzerowaną każdą ceną — repro jeden do jednego. */
  function zeroPricedBrief(): unknown {
    const brief = JSON.parse(JSON.stringify(VOLTIX_BRIEF)) as {
      tools: Array<Record<string, unknown>>
    }
    for (const tool of brief.tools) tool.monthly = 0
    return brief
  }

  async function renderFromBrief(): Promise<string> {
    const { model } = await buildReport({
      brief: zeroPricedBrief(),
      consultant: voltixConsultant(),
    })
    return renderReport(model)
  }

  it('nie drukuje ANI JEDNEJ kwoty licencyjnej, bo żadnej nie dostał', async () => {
    const html = await renderFromBrief()
    closesCleanly(html)

    // Cztery zdania, które dokument mówił przed naprawą, każde nieprawdziwe.
    expect(html).not.toContain('Licences today')
    expect(html).not.toContain('$0 a year')
    expect(html).not.toContain('Net recurring saving')
    expect(html).not.toContain('36-month net')

    // I forma, w której zero wychodziło najgorzej: minus przed zerem.
    expect(html).not.toContain('−$0')
    expect(html).not.toContain('-$0')
  })

  it('mówi wprost, czego nie dostał - zamiast pokazać darmowy stos', async () => {
    const html = await renderFromBrief()
    // Stanowiska brief PODAJE, więc zostają - brak faktur nie kasuje danych,
    // które przyszły. Kafelek mówi kształt stosu i mówi, czego w nim nie ma.
    expect(html).toContain('7 tools · 52 seats · no costs were supplied')
    expect(html).toContain('No licence costs were supplied for this stack.')
    // Obietnica formularza (`assets/client/intake.html`) dotrzymana co do treści.
    expect(html).toContain('what moves, not what it saves')
  })

  it('nie rysuje krzywej gotówki i nie ogłasza braku zwrotu', async () => {
    const { model, degradations } = await buildReport({
      brief: zeroPricedBrief(),
      consultant: voltixConsultant(),
    })
    expect(model.facts.cash).toBeUndefined()
    expect(degradations).toContain(
      'cash series: the brief carries no licence cost, so there is nothing to plot',
    )

    const html = renderReport(model)
    expect(html).not.toContain('id="fig-cash"')
    // "Break-even: None" przy nieznanych kosztach nie jest wynikiem, tylko
    // brakiem danych ubranym w werdykt.
    expect(html).not.toContain('Break-even')
    expect(html).toContain('No costs were supplied for this stack, so there is nothing to plot.')
  })

  it('reszta dokumentu stoi - werdykty, fale i stos są od cen niezależne', async () => {
    const { model } = await buildReport({
      brief: zeroPricedBrief(),
      consultant: voltixConsultant(),
    })
    expect(model.facts.stack.rows).toHaveLength(7)
    expect(model.facts.waves.length).toBeGreaterThan(0)
    expect(model.facts.stack.totalMonthly).toBeNull()
    expect(model.facts.kpis.licencesTodayMonthly).toBeNull()

    const html = renderReport(model)
    expect(html).toContain('Your stack today')
    expect(html).toContain('Capability coverage')
    expect(html).toContain('Recommended sequence')
  })

  it('ten sam brief Z cenami nadal podaje kwoty - brama gasi zero, nie licencje', async () => {
    const { model } = await buildReport({
      brief: VOLTIX_BRIEF,
      consultant: voltixConsultant(),
    })
    expect(model.facts.kpis.licencesTodayMonthly).toBe(2320)
    const html = renderReport(model)
    expect(html).toContain('Licences today')
    expect(html).not.toContain('No licence costs were supplied')
  })
})

// --- S6 · program, który się nie zwraca -------------------------------------

/**
 * Arytmetykę tego scenariusza broni `cash.test.ts` ("S6: never breaks even
 * when hosting outruns the saving"), a znaczniki na wykresie -
 * `renderReport.test.ts` ("S6: Figure 2: bez break-evenu..."). Bez pokrycia
 * zostawał OPIS: to on, a nie rysunek, dociera do czytnika ekranu i do
 * klienta pocztowego, który wyciął SVG.
 *
 * UWAGA CO DO SŁÓW. `assets/README.md` zapowiada trzeci kształt podpisu
 * dosłownie jako "does not pay back inside two years"; dokument mówi dziś to
 * samo własnymi słowami ("is still minus ... at month N"). Ta różnica jest w
 * raporcie z audytu jako luka redakcyjna, nie jako czerwony test - inaczej
 * test dyktowałby brzmienie, którego nikt jeszcze nie zatwierdził.
 */
describe('S6: hosting zjada oszczędność - program nie zwraca się w horyzoncie', () => {
  it('opis Figure 2 mówi, że krzywa NIE przecina zera', () => {
    const base = facts()
    const cash = base.cash
    if (cash === undefined) throw new Error('fixture lost its cash series')
    const html = renderReport({
      facts: {
        ...base,
        cash: {
          ...cash,
          breakEvenMonth: null,
          points: cash.points.map((point) => ({
            ...point,
            cumulative: point.cumulative > 0 ? -point.cumulative : point.cumulative,
          })),
        },
        kpis: { ...base.kpis, breakEvenMonth: null },
      },
    })
    closesCleanly(html)
    expect(html).toContain('id="fig-cash"')
    // "is still minus ... at month N" - trzeci z trzech kształtów opisu z
    // `assets/README.md`. Zdanie o przecięciu zera nie ma prawa tu paść.
    expect(html).toMatch(/<desc id="fig2desc">[^<]*is still minus [^<]*<\/desc>/)
    expect(html).not.toContain('crosses zero in month')
  })
})

// --- S7 · nie ma czego budować ----------------------------------------------

/**
 * "Nic do zbudowania" to NIE to samo co "nic do zrobienia". Konfiguracja
 * nadal jest pracą, nadal gasi narzędzia i nadal ma swoją falę.
 *
 * GDZIE BIEGNIE GRANICA MIĘDZY ZEREM A BRAKIEM - poprawione wraz z B3.
 *
 * Pierwsza wersja tego opisu stawiała ją na WERDYKCIE: skoro nie ma wiersza
 * `build`, to zero godzin jest uczciwe. To było błędne, bo werdykt nie mówi
 * nic o tym, czy ktokolwiek liczył. Fale niżej powstają BEZ planu migracji,
 * więc ich `hours = 0` nie jest pomiarem - jest brakiem wszystkich pomiarów, a
 * ten sam przebieg dopisuje do `degradations` "no migration plan, wave totals
 * are lower bounds". Dokument drukował mimo to `Wave 1 · 0 h · $0`, a stąd
 * koszt wdrożenia 0, break-even w miesiącu 2 i kamień milowy "all 4 waves
 * delivered - −$180".
 *
 * Granica biegnie więc po DANYCH: fala z choć jedną estymatą jest sumą, fala
 * bez ani jednej jest dolną granicą. Zero POLICZONE - plan przypisał
 * `estimatedHours: 0` - nadal drukuje się jako 0 i broni tego
 * `renderReport.test.ts` ("zero BEZ flagi zostaje zerem").
 */
describe('S7: nie ma ani jednego wiersza build', () => {
  const waves = groupIntoWaves({
    mappings: [
      mapping({ source: 'Airtable', capability: 'data.custom', targetFeature: 'entities', decision: 'native' }),
      mapping({ source: 'Sortly', capability: 'inventory.stock', targetFeature: 'wms', decision: 'configure' }),
    ],
    stack: [stackRow({ tool: 'Airtable', monthly: 240 }), stackRow({ tool: 'Sortly', monthly: 149 })],
  })

  it('fale POWSTAJĄ - konfiguracja to praca, tylko nie budowa', () => {
    expect(waves.length).toBeGreaterThan(0)
    expect(waves.flatMap((wave) => wave.scope.map((item) => item.decision))).not.toContain('build')
  })

  it('godziny są DOLNĄ GRANICĄ, bo tego przebiegu nikt nie estymował', () => {
    const hours = waves.reduce((sum, wave) => sum + wave.hours, 0)
    expect(hours).toBe(0)
    // ASERCJA ODWRÓCONA WRAZ Z POPRAWKĄ B3 (było: `=== false`). Nie ma tu ani
    // jednej estymaty, więc zero jest ICH BRAKIEM, nie wynikiem. Flaga każe
    // dokumentowi napisać "to estimate" zamiast `0 h` i `$0`.
    expect(waves.every((wave) => wave.hoursAreFloor === true)).toBe(true)
  })

  it('plan, który WYCENIŁ tę pracę na zero, zostaje zerem - to już pomiar', () => {
    const estimated = groupIntoWaves({
      mappings: [
        mapping({
          source: 'Airtable',
          capability: 'data.custom',
          targetFeature: 'entities',
          decision: 'native',
          customEffortHours: 0,
        }),
      ],
      stack: [stackRow({ tool: 'Airtable', monthly: 240 })],
    })
    expect(estimated[0].hours).toBe(0)
    expect(estimated[0].hoursAreFloor).toBe(false)
  })

  it('narzędzia i tak gasną, więc oszczędność jest realna', () => {
    expect(waves.flatMap((wave) => wave.toolsOff).sort()).toEqual(['Airtable', 'Sortly'])
  })

  /**
   * Zdanie wymagane przez §7 planu ("sekcja «What genuinely has to be built»
   * mówi «wszystko to konfiguracja»"). W silniku takiej sekcji nie ma, więc
   * zdanie stoi przy tabeli jednorazowej sekcji 05 - czyli tam, gdzie
   * czytelnik szuka godzin z oferty.
   */
  it('dokument mówi WPROST, że nic nie wymaga nowego kodu', () => {
    const base = facts()
    const html = renderReport({
      facts: {
        ...base,
        waves: base.waves.map((wave) => ({
          ...wave,
          scope: wave.scope.map((item) =>
            item.decision === 'build' ? { ...item, decision: 'configure' as const } : item,
          ),
        })),
      },
    })
    closesCleanly(html)
    expect(html).toContain('Nothing in this stack needs new code.')
  })

  it('jeden wiersz build wystarczy, żeby tego zdania NIE było', () => {
    expect(renderReport({ facts: facts() })).not.toContain('Nothing in this stack needs new code')
  })
})

// --- S8 · każde narzędzie zostaje -------------------------------------------

/**
 * Przebieg, w którym platforma nie przejmuje niczego, jest POPRAWNYM wynikiem
 * doradztwa, a nie pustym raportem. Broni tego jedna reguła - `toolGoesOff` -
 * i ten test pilnuje, żeby obie jej konsekwencje zgadzały się ze sobą: skoro
 * nie ma czego wyłączyć, to nie ma fal ANI oszczędności. Rozjazd między tymi
 * dwoma znaczyłby, że sekcja 06 i tabela ROI tego samego dokumentu mówią co
 * innego o tych samych narzędziach.
 */
describe('S8: każde narzędzie zostaje w stosie', () => {
  const mappings: MercatoMappingResult[] = [
    mapping({ source: 'Xero', capability: 'accounting.ledger', targetFeature: 'keep it', decision: 'keep' }),
    mapping({ source: 'DocuSign', capability: 'esignature', targetFeature: 'integrations', decision: 'integrate' }),
  ]
  const stack: SaaSProductInput[] = [
    { id: 'xero', name: 'Xero', category: 'Accounting', monthlyCost: 78 },
    { id: 'ds', name: 'DocuSign', category: 'E-signature', monthlyCost: 199 },
  ]
  const waves = groupIntoWaves({
    mappings,
    stack: stack.map((tool) => stackRow({ tool: tool.name, monthly: tool.monthlyCost })),
  })

  it('zero oszczędności - i tabela ROI mówi to samo co fale', () => {
    const scenario = computeScenario(mappings, stack, { omOperatingCost: 0, implementationCost: 0 })
    expect(scenario.removedSaaS).toEqual([])
    expect(scenario.retainedSaaS).toEqual(['Xero', 'DocuSign'])
    expect(scenario.grossAnnualSaving).toBe(0)

    // Ta sama prawda widziana od strony fal: skoro nic nie gaśnie, to żadna
    // fala nie bankuje ani dolara. Rozjazd tych dwóch odczytów znaczyłby, że
    // sekcja 06 i tabela ROI jednego dokumentu mówią co innego o tych samych
    // narzędziach - dokładnie ten błąd, przed którym broni `toolGoesOff`.
    expect(waves.flatMap((wave) => wave.toolsOff)).toEqual([])
    expect(waves.reduce((sum, wave) => sum + (wave.monthlyBanked ?? 0), 0)).toBe(0)
  })

  it('`keep` nie daje fali, `integrate` daje - bo integracja to nadal praca', () => {
    // `keep` to jedyny werdykt, przy którym naprawdę nie ma czego robić.
    expect(
      groupIntoWaves({ mappings: [mappings[0]], stack: [stackRow({ tool: 'Xero', monthly: 78 })] }),
    ).toEqual([])

    // `integrate` zostawia narzędzie na fakturze, ale wpina je w platformę -
    // stąd fala, w której narzędzie jest `reduced`, a nie `off`.
    expect(waves).toHaveLength(1)
    expect(waves[0].toolsReduced).toEqual(['DocuSign'])
    expect(waves[0].monthlyBanked).toBe(0)
  })

  it('dokument bez fal nadal niesie stos, pokrycie i werdykty', () => {
    const html = renderReport({ facts: { ...facts(), waves: [] } })
    closesCleanly(html)
    expect(html).not.toContain('Recommended sequence')
    expect(html).toContain('Your stack today')
    expect(html).toContain('Capability coverage')
    expect(html).toContain('How we reach a verdict')
  })

  /**
   * Nagłówek wymagany przez §7 planu. Stoi w "At a glance", bo to jest
   * ustalenie całego dokumentu, a nie jednej sekcji.
   */
  it('dokument mówi WPROST, że każde narzędzie zostaje', () => {
    const base = facts()
    const html = renderReport({
      facts: { ...base, waves: base.waves.map((wave) => ({ ...wave, toolsOff: [] })) },
    })
    closesCleanly(html)
    expect(html).toContain('Every tool in your stack earns its place')
  })

  it('jedno gasnące narzędzie wystarczy, żeby tego zdania NIE było', () => {
    expect(renderReport({ facts: facts() })).not.toContain('earns its place')
  })

  /**
   * PUSTA LISTA FAL TO NIE JEST TO SAMO CO "NIC NIE GAŚNIE".
   *
   * Przeglądarkowy adapter (`assets/shared/report-model.js`) ustawia
   * `waves: []` w KAŻDYM modelu, bo nie liczy sekwencji. Gdyby to zdanie
   * padało przy pustej liście, każdy raport z konsoli twierdziłby o stosie
   * klienta coś, czego nikt nie sprawdził - czyli popełniałby dokładnie ten
   * błąd, który ten przegląd usuwa, tylko słowami zamiast liczbą.
   */
  it('brak fal NIE wystarcza - to cudzy brak danych, nie ustalenie', () => {
    expect(renderReport({ facts: { ...facts(), waves: [] } })).not.toContain('earns its place')
  })
})

// --- S10 · narzędzie spoza katalogu -----------------------------------------

/**
 * Narzędzie, którego katalog nie zna, ma być WIDOCZNE (Appendix B) i
 * POLICZONE jako luka (licznik sekcji 02) — i nie ma prawa zniknąć po cichu.
 *
 * NOTA O KWOTACH — JUŻ NIEAKTUALNA W SWOJEJ PIERWSZEJ POŁOWIE. Stało tu, że
 * druga połowa scenariusza ("wyłączone z każdej kwoty", słowami samego
 * goldena: *"They are excluded from every figure in this report"*) nie ma
 * jeszcze komponentu, który by ją spełniał. Ma: stronę OSZCZĘDNOŚCI trzyma
 * `toolGoesOff` (`src/toolVerdict.ts`), stronę KOSZTU — `isOffCatalog` w
 * `src/report/waves.ts`, a mierzy obie naraz `buildReport.test.ts`, blok
 * "B5", porównaniem dwóch pełnych przebiegów.
 *
 * TEN plik zostaje przy pierwszej połowie (widoczność: werdykt, luka,
 * Appendix B) i to jest celowe — kwoty nie da się zobaczyć bez `buildReport`,
 * a `groupIntoWaves` czy `computeScenario` osobno przepuszczą tu wszystko.
 */
describe('S10: narzędzie, którego katalog nie zna', () => {
  const stack: SaaSProductInput[] = [
    { id: 'hs', name: 'HubSpot Sales', category: 'CRM', monthlyCost: 890 },
    { id: 'aurora', name: 'Aurora Solar', category: 'Design', monthlyCost: 400 },
  ]
  const caps: SaaSCapabilityInput[] = [
    { id: 'c1', saasProductId: 'hs', capability: 'crm.contacts', importance: 'core' },
    { id: 'c2', saasProductId: 'aurora', capability: 'panel_layout', importance: 'core' },
  ]
  const mappings = mapCapabilities(stack, caps)

  it('wypada z katalogu jako build/low/"not in catalog", a nie jako cisza', () => {
    const aurora = mappings.find((row) => row.source === 'Aurora Solar')
    expect(aurora).toMatchObject({ decision: 'build', confidence: 'low', evidence: 'not in catalog' })
  })

  it('trafia do luk dla kuratora i do licznika sekcji 02 - te same dane, dwa odczyty', () => {
    expect(findCatalogGaps(mappings)).toEqual([{ source: 'Aurora Solar', capability: 'panel_layout' }])
    expect(deriveStatementCounts(mappings)).toEqual({ statements: 2, matched: 1, offCatalog: 1 })
  })

  it('renderuje się w Appendix B razem z "naszym odczytem" kuratora', () => {
    const base = facts()
    const html = renderReport({
      facts: {
        ...base,
        gaps: [
          {
            id: 'B.9',
            source: 'Aurora Solar',
            capability: 'panel_layout',
            described: 'Panel layout and shading design',
          },
        ],
      },
      prose: {
        gaps: [
          {
            gapId: 'B.9',
            whyUnmapped: 'Specialist CAD; no entry in our catalog and no platform equivalent we could verify',
            ourRead: 'Almost certainly stays where it is. A possible integration target later',
          },
        ],
      },
    })
    closesCleanly(html)
    expect(html).toContain('Off-catalog items')
    expect(html).toContain('Aurora Solar')
    expect(html).toContain('Almost certainly stays where it is')
  })
})

// --- S12 · duplikat zdolności -----------------------------------------------

/**
 * Sekcja "Paid twice". Nazwa jest treścią, nie stylistyką: `assets/README.md`
 * §Writing każe pisać **paid twice**, a nie "done twice", bo klienta boli
 * FAKTURA, nie duplikacja pracy. Blok renderuje się wyłącznie z danych - u
 * Voltixa lista jest pusta i dlatego goldena z tym blokiem nie ma.
 */
describe('S12: jedna zdolność w dwóch narzędziach', () => {
  const base = facts()
  const html = renderReport({
    facts: {
      ...base,
      coverage: {
        ...base.coverage,
        paidTwice: [
          { capability: 'E-signature', tools: ['PandaDoc', 'DocuSign'], monthlyAcrossTools: 348 },
          { capability: 'Scheduling', tools: ['Jobber', 'Calendly'], monthlyAcrossTools: null },
        ],
      },
    },
  })

  it('sekcja powstaje i liczy duplikaty słownie, jak reszta dokumentu', () => {
    closesCleanly(html)
    expect(html).toContain('Paid twice — two capabilities you buy in more than one place')
  })

  it('wymienia OBA narzędzia i łączny wydatek na nie', () => {
    expect(html).toContain('PandaDoc, DocuSign · $348/mo across them')
  })

  it('bez ceny mówi kto, a nie zmyśla ile', () => {
    expect(html).toContain('Jobber, Calendly</p>')
    expect(html).not.toContain('Jobber, Calendly · ')
  })

  it('nie nazywa tego "done twice" - to wydatek, nie podwójna robota', () => {
    expect(html).not.toContain('Done twice')
    expect(html).not.toContain('done twice')
  })

  it('pusta lista nie zostawia nagłówka nad niczym', () => {
    expect(renderReport({ facts: facts() })).not.toContain('Paid twice')
  })
})

// --- S14 · brief bez narzędzi -----------------------------------------------

/**
 * Formularz nie pozwala wysłać pustego stosu, ale brief przychodzi z
 * `localStorage` albo z pliku i bramą jest TEN kod, nie strona. Pusta lista
 * przepuszczona dalej dałaby raport o siedmiu zerach zamiast odmowy.
 */
describe('S14: brief bez ani jednego narzędzia', () => {
  const shell = {
    v: 2,
    kind: 'mercatify-brief',
    company: { name: 'Voltix Energy', industry: '', people: 34 },
    currency: 'USD',
  }

  it('pusta tablica to odmowa z nazwą pola', () => {
    expect(() => normalizeBrief({ ...shell, tools: [] })).toThrow(/brief tools: expected at least one tool/)
  })

  it('brak pola `tools` to ta sama odmowa, a nie inna ścieżka', () => {
    expect(() => normalizeBrief(shell)).toThrow(/brief tools:/)
  })

  it('narzędzie bez ani jednego modułu też nie przechodzi', () => {
    expect(() =>
      normalizeBrief({ ...shell, tools: [{ name: 'Mystery', category: '', monthly: 0, modules: [] }] }),
    ).toThrow(/tools\[0\]\.modules: expected at least one module/)
  })
})

// --- S16 · QA zwraca `blocked` ----------------------------------------------

/**
 * `blocked` to WYNIK, nie awaria: podgląd urwał się na trzecim kroku golden
 * path i raport ma o tym powiedzieć wprost. Dokument, który o tym milczy, to
 * dokładnie ta "sales trick", którą sekcja 07 goldena nazywa po imieniu -
 * dlatego werdykt ma tu własny blok, a nie zniknięcie sekcji.
 *
 * Kod wyjścia 0 dla takiego przebiegu jest kontraktem CLI i powstaje razem z
 * `bin/report-cli.ts` w Fazie 3.
 */
describe('S16: podgląd zablokowany na kroku golden path', () => {
  function blockedHtml(blockedAtStep: string): string {
    return renderReport({
      facts: {
        ...facts(),
        preview: {
          screens: [{ name: 'lead', path: 'lead.html' }],
          generatedAt: '2026-09-19T09:00:00.000Z',
          verdict: 'blocked',
          blockedAtStep,
        },
      },
    })
  }

  it('sekcja 07 zostaje i NAZYWA krok, na którym podgląd się urywa', () => {
    const html = blockedHtml('Quote')
    closesCleanly(html)
    expect(html).toContain('Section 07')
    expect(html).toContain('Where the preview stops')
    expect(html).toContain('QA could not get past this step: Quote')
  })

  it('werdykt bez kroku mówi to wprost, zamiast zostawić puste zdanie', () => {
    expect(blockedHtml('')).toContain('QA could not walk the golden path end to end in this build.')
  })

  it('reszta dokumentu jest nietknięta - blokada podglądu nie psuje liczb', () => {
    const html = blockedHtml('Quote')
    expect(html).toContain('Section 05')
    expect(html).toContain('Section 06')
    expect(html).toContain('$27,840')
  })

  it('werdykt ready NIE drukuje bloku o blokadzie', () => {
    const base = facts()
    const html = renderReport({
      facts: {
        ...base,
        preview: {
          screens: [],
          generatedAt: '2026-09-19T09:00:00.000Z',
          verdict: 'ready',
          blockedAtStep: '',
        },
      },
    })
    expect(html).not.toContain('Where the preview stops')
  })
})

// --- S17 i S18 · przebudowa i regeneracja -----------------------------------

/**
 * OGRANICZENIE ZAKRESU. Oba scenariusze rozgrywają się w `assets/`, gdzie
 * kodu nie obsługuje żaden harness testowy (strony bez builda, handoff przez
 * `localStorage`). Nie da się tu sprawdzić, że konsultant kliknął "Confirm
 * mapping" ani że klient widzi starą wersję.
 *
 * Da się natomiast sprawdzić ZAŁOŻENIE, na którym oba stoją i bez którego oba
 * są nieprawdziwe: renderer jest czystą funkcją modelu. Przebudowa bez
 * ponownego przebiegu agentów jest DARMOWA i BEZPIECZNA tylko wtedy, gdy ten
 * sam model daje ten sam dokument, a zmiana jednego pola zmienia dokładnie
 * to jedno miejsce. Te dwie własności są tu asercjami.
 */
describe('S17/S18: przebudowa dokumentu bez ponownego przebiegu agentów', () => {
  it('S17: ten sam model daje bajt w bajt ten sam dokument', () => {
    // Dwa OSOBNE obiekty o tej samej treści, nie ta sama referencja dwa razy:
    // inaczej test sprawdzałby cache, a nie determinizm.
    expect(renderReport({ facts: facts() })).toBe(renderReport({ facts: facts() }))
  })

  it('S17: poprawka konsultanta w mapowaniu zmienia raport, a proza zostaje jego', () => {
    const base = facts()
    const edited: ReportFacts = {
      ...base,
      coverage: {
        ...base.coverage,
        rows: base.coverage.rows.map((row, index) =>
          index === 0 ? { ...row, verdict: 'build', confidence: 'low' } : row,
        ),
      },
    }
    const prose = { coverageNote: 'PandaDoc appears twice because it does two unrelated jobs.' }

    const before = renderReport({ facts: base, prose })
    const after = renderReport({ facts: edited, prose })
    expect(after).not.toBe(before)
    // Proza pochodzi z POPRZEDNIEGO przebiegu agentów i przechodzi bez zmiany -
    // na tym polega "przebudowa bez ponownego przebiegu".
    expect(after).toContain('PandaDoc appears twice because it does two unrelated jobs.')
  })

  it('S18: podbicie wersji zmienia tylko wersję, nie treść', () => {
    const base = facts()
    const v11 = renderReport({ facts: { ...base, meta: { ...base.meta, version: '1.1' } } })
    expect(v11).toContain('CASE-0041 · v1.1')
    expect(v11).toContain('Version 1.1')
    expect(v11).not.toContain('v1.0')

    // Wszystko poza numerem wersji jest identyczne. Gdyby regeneracja ruszała
    // cokolwiek jeszcze, klient dostałby przy "tej samej" ofercie inne liczby.
    //
    // Podmieniamy WYŁĄCZNIE trzy miejsca, w których stoi wersja; ślepe
    // `split('1.1')` trafiałoby też w `line-height` i we współrzędne SVG,
    // czyli test sprawdzałby arkusz stylów zamiast dokumentu.
    const backToV10 = v11
      .split('v1.1')
      .join('v1.0')
      .split('Version 1.1')
      .join('Version 1.0')
    expect(backToV10).toBe(renderReport({ facts: base }))
  })
})

// --- S22 · brief ponad sufit ------------------------------------------------

/**
 * Cały brief ląduje w prompcie (`llmClient.ts` robi `JSON.stringify(input)`),
 * więc sufit rozmiaru jest tu zabezpieczeniem, a nie higieną. Brama musi
 * odmówić ZANIM cokolwiek pójdzie do modelu i musi nazwać przekroczoną
 * granicę - "zły brief" nie mówi klientowi, co usunąć.
 */
describe('S22: brief ponad sufit rozmiaru', () => {
  const shell = {
    v: 2,
    kind: 'mercatify-brief',
    company: { name: 'Voltix Energy', industry: '', people: 34 },
    currency: 'USD',
  }
  const tool = (name: string) => ({
    name,
    category: 'CRM',
    monthly: 1,
    modules: [{ name: 'm', desc: '', caps: [`cap.${name}`] }],
  })

  it('odrzuca zbyt wiele narzędzi, podając limit i to, ile ich przyszło', () => {
    const tools = Array.from({ length: 101 }, (_, i) => tool(`t${i}`))
    expect(() => normalizeBrief({ ...shell, tools })).toThrow(
      /brief tools: expected at most 100 entries, got 101/,
    )
  })

  it('odrzuca zbyt wiele modułów w jednym narzędziu', () => {
    const modules = Array.from({ length: 51 }, (_, i) => ({ name: 'm', desc: '', caps: [`c${i}`] }))
    expect(() => normalizeBrief({ ...shell, tools: [{ ...tool('t'), modules }] })).toThrow(
      /tools\[0\]\.modules: expected at most 50 entries, got 51/,
    )
  })

  it('odrzuca zbyt wiele zdolności w jednym module', () => {
    const caps = Array.from({ length: 51 }, (_, i) => `c${i}`)
    const modules = [{ name: 'm', desc: '', caps }]
    expect(() => normalizeBrief({ ...shell, tools: [{ ...tool('t'), modules }] })).toThrow(
      /tools\[0\]\.modules\[0\]\.caps: expected at most 50 entries, got 51/,
    )
  })

  it('odrzuca pojedyncze pole tekstowe ponad 4000 znaków', () => {
    const modules = [{ name: 'm', desc: 'x'.repeat(4001), caps: ['c'] }]
    expect(() => normalizeBrief({ ...shell, tools: [{ ...tool('t'), modules }] })).toThrow(
      /tools\[0\]\.modules\[0\]\.desc: expected at most 4000 characters, got 4001/,
    )
  })

  /**
   * ZNANY DEFEKT, nie wymaganie do spełnienia przez ten plik.
   *
   * TEST-022 mówi wprost: brief 10 MB ma zostać odrzucony przez
   * `normalizeBrief`. Sufity wyżej są STRUKTURALNE i mnożą się:
   * 100 narzędzi x 50 modułów x (4000 znaków `desc` + 4000 znaków
   * `evidenceNote`) to ~40 MB, które przechodzą bramę bez jednego błędu -
   * zmierzone, nie oszacowane. Brakuje sufitu na CAŁOŚĆ, takiego jak
   * `MAX_BLUEPRINT_BYTES` w `bin/preview-cli.ts`.
   *
   * Test stoi jako `failing`, bo naprawa jest zmianą kodu produkcyjnego i
   * należy do właściciela `src/intake/fromBrief.ts`. Gdy sufit powstanie, ten
   * test zacznie przechodzić i Jest zażąda zdjęcia `.failing` - i to jest
   * właściwy moment, żeby go zdjąć.
   */
  it.failing('DEFEKT: brief ~10 MB przechodzi bramę, choć TEST-022 wymaga odmowy', () => {
    const filler = 'x'.repeat(4000)
    const tools = Array.from({ length: 40 }, (_, t) => ({
      name: `tool${t}`,
      category: 'CRM',
      monthly: 1,
      modules: Array.from({ length: 50 }, (_, m) => ({
        name: 'm',
        desc: filler,
        evidenceNote: filler,
        caps: [`cap_${t}_${m}`],
      })),
    }))
    const brief = { ...shell, tools }
    expect(Buffer.byteLength(JSON.stringify(brief))).toBeGreaterThan(10 * 1024 * 1024)
    expect(() => normalizeBrief(brief)).toThrow(/bytes|size|MB/i)
  })
})
