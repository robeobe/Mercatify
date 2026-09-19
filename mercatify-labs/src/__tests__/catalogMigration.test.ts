/** @jest-environment node */
/**
 * Test PRZED/PO dla scalenia katalogów.
 *
 * Stary `src/catalogData.json` (`git show HEAD~:mercatify-labs/src/catalogData.json`
 * w chwili pisania tego pliku) niósł 22 pary narzędzie+zdolność. Scalenie z
 * `assets/stack-tool/catalog.js` przepisało cały ten plik: klucze zdolności
 * poszły na slugi z `CAPS`, cele na pozycje z `OM_TARGETS`, a werdykty -
 * teoretycznie bez zmian. "Teoretycznie", bo nic tego nie sprawdzało: trzy
 * pary zmieniły się przy okazji i nikt się o tym nie dowiedział.
 *
 * Tablica niżej jest tym sprawdzeniem. Każda z 22 starych par ma tu wpisany
 * werdykt sprzed scalenia i werdykt dzisiejszy. Tam, gdzie się różnią, stoi
 * `why` - zmiana ma być JAWNA, nie niespodzianką w danych.
 *
 * Stara zawartość jest PRZEPISANA do tego pliku, a nie czytana przez
 * `git show`: odczyt z gita porównywałby katalog z samym sobą, gdy tylko ta
 * gałąź zostanie scalona, i test zzieleniałby na zawsze, nie patrząc już na nic.
 *
 * O CELACH (`target`) ten plik milczy z rozmysłu: zmieniły się WSZYSTKIE
 * dwadzieścia dwa, bo `OM_TARGETS` jest jedynym słownikiem nazw modułów
 * platformy, a stare wpisy ("OM CRM", "OM Workflows") nazywały moduły, których
 * w platformie nie ma. To była cała treść scalenia i pilnuje tego
 * `catalogIntegrity.test.ts`. Werdykt to co innego: on jest DECYZJĄ, za którą
 * idą pieniądze w raporcie.
 */
import { getCatalogCapability } from '../catalog'
import { UNMAPPED_LEGACY_KEYS } from '../catalogAliases'
import type { Confidence, Decision } from '../types'

interface LegacyVerdict {
  decision: Decision
  confidence: Confidence
}

interface LegacyPair {
  tool: string
  capability: string
  /** Werdykt ze starego `catalogData.json`, przepisany dosłownie. */
  before: LegacyVerdict
  /** Werdykt dzisiejszy. `null` = para celowo wypadła z katalogu. */
  now: LegacyVerdict | null
  /** Wypełnione TYLKO tam, gdzie `before` i `now` się różnią. */
  why?: string
}

/*
 * SKĄD WZIĘŁY SIĘ TRZY RÓŻNICE
 *
 * Dwie z nich (PandaDoc) przyszły z modułów `pandadoc` w
 * `assets/stack-tool/catalog.js`. Scalenie brało werdykt stamtąd, bo to ten
 * plik był źródłem prawdy dla 116 par, a stary JSON tylko dla 22:
 *
 *   { id:'templates', caps:['quotes.cpq','docs.templates'],
 *     om:'sales — quotes', verdict:'native',    conf:'medium' }
 *   { id:'approve',   caps:['workflow.approvals'],
 *     om:'workflows',      verdict:'configure', conf:'medium' }
 *
 * Nowych wartości NIE przywracam do starych, bo wyglądają na trafniejsze:
 * zatwierdzanie oferty to w Open Mercato skonfigurowany workflow, a nie
 * gotowa funkcja, więc `configure` mówi prawdę, którą `native` zamazywało -
 * a różnica jest widoczna w raporcie, bo `configure` niesie godziny wdrożenia.
 * Rzecz w tym, żeby ta decyzja była świadoma i zapisana, a nie żeby wpadła
 * bokiem razem z przepisaniem celów.
 *
 * Trzecia różnica jest z innej półki: `site_survey_tracking` nie dostał
 * aliasu i dziś uczciwie wypada poza katalog. To decyzja opisana przy
 * `UNMAPPED_LEGACY_KEYS` w `src/catalogAliases.ts`; ten test tylko pilnuje,
 * że nadal obowiązuje.
 */
const LEGACY_PAIRS: readonly LegacyPair[] = Object.freeze([
  // --- HubSpot -------------------------------------------------------------
  { tool: 'HubSpot', capability: 'contacts', before: { decision: 'native', confidence: 'high' }, now: { decision: 'native', confidence: 'high' } },
  { tool: 'HubSpot', capability: 'companies', before: { decision: 'native', confidence: 'high' }, now: { decision: 'native', confidence: 'high' } },
  { tool: 'HubSpot', capability: 'deals', before: { decision: 'native', confidence: 'high' }, now: { decision: 'native', confidence: 'high' } },
  { tool: 'HubSpot', capability: 'pipeline', before: { decision: 'native', confidence: 'high' }, now: { decision: 'native', confidence: 'high' } },
  { tool: 'HubSpot', capability: 'email_sequences', before: { decision: 'keep', confidence: 'high' }, now: { decision: 'keep', confidence: 'high' } },

  // --- Typeform ------------------------------------------------------------
  { tool: 'Typeform', capability: 'lead_capture_forms', before: { decision: 'native', confidence: 'high' }, now: { decision: 'native', confidence: 'high' } },
  { tool: 'Typeform', capability: 'nps_surveys', before: { decision: 'configure', confidence: 'medium' }, now: { decision: 'configure', confidence: 'medium' } },
  { tool: 'Typeform', capability: 'conversational_branching', before: { decision: 'keep', confidence: 'medium' }, now: { decision: 'keep', confidence: 'medium' } },

  // --- Airtable ------------------------------------------------------------
  { tool: 'Airtable', capability: 'custom_trackers', before: { decision: 'native', confidence: 'high' }, now: { decision: 'native', confidence: 'high' } },
  {
    tool: 'Airtable',
    capability: 'site_survey_tracking',
    before: { decision: 'build', confidence: 'medium' },
    now: null,
    why:
      'Jedyny stary klucz bez aliasu - patrz UNMAPPED_LEGACY_KEYS w src/catalogAliases.ts. ' +
      'To nie zdolność, tylko rejestr jednego klienta; aliasowanie go do data.custom dałoby native/high ' +
      'tam, gdzie encję Site Survey trzeba dopiero zamodelować. Dziś wychodzi build/low/"not in catalog" ' +
      'i jest widoczny jako luka katalogowa.',
  },
  { tool: 'Airtable', capability: 'spreadsheet_views', before: { decision: 'configure', confidence: 'medium' }, now: { decision: 'configure', confidence: 'medium' } },
  { tool: 'Airtable', capability: 'external_sharing_grid', before: { decision: 'keep', confidence: 'low' }, now: { decision: 'keep', confidence: 'low' } },

  // --- Zapier --------------------------------------------------------------
  { tool: 'Zapier', capability: 'cross_app_automation', before: { decision: 'native', confidence: 'high' }, now: { decision: 'native', confidence: 'high' } },
  { tool: 'Zapier', capability: 'webhook_relays', before: { decision: 'native', confidence: 'high' }, now: { decision: 'native', confidence: 'high' } },
  { tool: 'Zapier', capability: 'long_tail_app_connectors', before: { decision: 'integrate', confidence: 'medium' }, now: { decision: 'integrate', confidence: 'medium' } },

  // --- PandaDoc ------------------------------------------------------------
  {
    tool: 'PandaDoc',
    capability: 'quote_documents',
    before: { decision: 'native', confidence: 'high' },
    now: { decision: 'build', confidence: 'medium' },
    why:
      'Decyzja właściciela produktu, 2026-09-19: Open Mercato NIE ma konfiguratora ofert. Złoty raport ' +
      'nazywa kreator ofert "the only net-new module" i wycenia go na 40 h, a katalog twierdził, że to ' +
      '`native` - jedno z dwóch musiało ustąpić i ustąpił katalog. Zmiana objęła `quotes.cpq` we ' +
      'WSZYSTKICH pięciu narzędziach, które ją niosą, bo werdykt opisuje platformę docelową, nie ' +
      'narzędzie źródłowe. Przy okazji rozbito cztery wiązki modułów w assets/stack-tool/catalog.js: ' +
      'moduł niosący dwie zdolności o różnych werdyktach nie potrafił wyrazić obu.',
  },
  {
    tool: 'PandaDoc',
    capability: 'quote_approval_flow',
    before: { decision: 'native', confidence: 'high' },
    now: { decision: 'configure', confidence: 'medium' },
    why:
      'ZMIANA DECYZJI, nie tylko pewności: native/high -> configure/medium. Źródło: moduł pandadoc/approve ' +
      'w assets/stack-tool/catalog.js (om "workflows", verdict configure, conf medium). Ma to sens - ' +
      'zatwierdzanie oferty jest w platformie skonfigurowanym workflow, nie gotową funkcją - ale niesie ' +
      'godziny wdrożenia, których wariant native nie niósł.',
  },
  { tool: 'PandaDoc', capability: 'e_signature', before: { decision: 'integrate', confidence: 'high' }, now: { decision: 'integrate', confidence: 'high' } },

  // --- Calendly ------------------------------------------------------------
  { tool: 'Calendly', capability: 'site_survey_scheduling', before: { decision: 'configure', confidence: 'medium' }, now: { decision: 'configure', confidence: 'medium' } },
  { tool: 'Calendly', capability: 'external_booking_page', before: { decision: 'keep', confidence: 'medium' }, now: { decision: 'keep', confidence: 'medium' } },

  // --- Slack ---------------------------------------------------------------
  { tool: 'Slack', capability: 'internal_notifications', before: { decision: 'native', confidence: 'high' }, now: { decision: 'native', confidence: 'high' } },
  { tool: 'Slack', capability: 'team_chat', before: { decision: 'keep', confidence: 'high' }, now: { decision: 'keep', confidence: 'high' } },
])

describe('scalenie katalogu wobec 22 starych par', () => {
  it('tablica opisuje dokładnie stary plik: 22 pary, bez duplikatów', () => {
    expect(LEGACY_PAIRS.length).toBe(22)
    const keys = LEGACY_PAIRS.map((pair) => `${pair.tool}.${pair.capability}`)
    expect(new Set(keys).size).toBe(22)
  })

  it.each(LEGACY_PAIRS.map((pair) => [`${pair.tool}.${pair.capability}`, pair] as const))(
    '%s ma dziś werdykt wpisany w tablicę',
    (_label, pair) => {
      const entry = getCatalogCapability(pair.tool, pair.capability)
      if (pair.now === null) {
        expect(entry).toBeUndefined()
        return
      }
      expect(entry).toBeDefined()
      expect({ decision: entry?.decision, confidence: entry?.confidence }).toEqual(pair.now)
    },
  )

  it('zmieniły się dokładnie trzy pary - żadna więcej i żadna po cichu', () => {
    const changed = LEGACY_PAIRS.filter(
      (pair) => pair.now === null || pair.now.decision !== pair.before.decision || pair.now.confidence !== pair.before.confidence,
    )
    expect(changed.map((pair) => `${pair.tool}.${pair.capability}`)).toEqual([
      'Airtable.site_survey_tracking',
      'PandaDoc.quote_documents',
      'PandaDoc.quote_approval_flow',
    ])
    // Różnica bez wyjaśnienia jest tym samym co różnica niezauważona.
    for (const pair of changed) {
      expect(typeof pair.why).toBe('string')
      expect(pair.why?.length ?? 0).toBeGreaterThan(40)
    }
  })

  it('para bez `why` naprawdę przeszła scalenie bez zmiany', () => {
    const silentlyChanged = LEGACY_PAIRS.filter(
      (pair) =>
        pair.why === undefined &&
        (pair.now === null || pair.now.decision !== pair.before.decision || pair.now.confidence !== pair.before.confidence),
    )
    expect(silentlyChanged).toEqual([])
  })

  it('jedyna para bez aliasu to ta wymieniona w UNMAPPED_LEGACY_KEYS', () => {
    const dropped = LEGACY_PAIRS.filter((pair) => pair.now === null).map((pair) => pair.capability)
    expect(dropped).toEqual([...UNMAPPED_LEGACY_KEYS])
  })

  it('zmiana decyzji w PandaDoc jest widoczna dokładnie tam, gdzie stoi w tablicy', () => {
    // Osobna, nazwana asercja: to jedyna para w całym scaleniu, w której
    // zmieniła się DECYZJA, a nie sama pewność.
    expect(getCatalogCapability('PandaDoc', 'quote_approval_flow')).toMatchObject({
      target: 'workflows',
      decision: 'configure',
      confidence: 'medium',
    })
    // Alias `quote_approval_flow` prowadzi do slugu `workflow.approvals`,
    // więc oba klucze muszą oddać ten sam wpis - inaczej zmiana dotknęłaby
    // tylko jednej drogi odczytu.
    expect(getCatalogCapability('PandaDoc', 'workflow.approvals')).toBe(
      getCatalogCapability('PandaDoc', 'quote_approval_flow'),
    )
  })
})
