/**
 * Most między starym słownikiem zdolności a kanonicznym.
 *
 * Do scalenia katalogów istniały dwa niezależne słowniki tej samej rzeczy:
 * `catalogData.json` mówił `contacts`, `quote_documents`, `e_signature`,
 * a `assets/stack-tool/catalog.js` - `crm.contacts`, `quotes.cpq`,
 * `esignature`. Kanoniczny jest ten drugi (`CAPS`): niesie 62 slugi, 18
 * narzędzi i prawdziwe nazwy modułów Open Mercato, więc to on przejął dane.
 *
 * Stare klucze nie mogły jednak przestać działać - używają ich istniejące
 * testy, `examples/` i każdy zapisany przebieg agenta. Ta tablica jest ich
 * jedyną drogą do katalogu.
 *
 * DLACZEGO JAWNA, A NIE DOPASOWANIE PO PODCIĄGU: SPEC.md §6.2 obiecuje, że
 * zdolność, której katalog nie zna, wypadnie jako `build` / `low` /
 * `not in catalog`. Luźne dopasowanie ("`contacts` zawiera się w
 * `crm.contacts`, więc pewnie o to chodzi") złamałoby tę gwarancję w obie
 * strony: `email_contacts_export` trafiłby na `crm.contacts` i zniknąłby z
 * listy luk katalogowych (`src/catalogGaps.ts`), a raport pokazałby
 * pewność `high` tam, gdzie nikt nic nie sprawdził. Nieznany klucz ma
 * uczciwie wypaść z katalogu, a nie trafić na najbliższy.
 *
 * Tablica jest skończona i zamknięta. Nowa zdolność nie dopisuje się tutaj -
 * dostaje slug w `CAPS` i wpis w `catalogData.json`. Tu trafia wyłącznie
 * klucz, który był w obiegu przed scaleniem.
 */

/**
 * 21 z 22 kluczy, które niósł stary `catalogData.json`, w kolejności narzędzi
 * z tamtego pliku. Każdy zmapowany świadomie, jeden świadomie POMINIĘTY -
 * `site_survey_tracking` (patrz `UNMAPPED_LEGACY_KEYS` niżej).
 */
export const CAPABILITY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // HubSpot. `companies` i `contacts` to jedna baza (CAPS: "Contact & company
  // database"), `deals` i `pipeline` - jeden lejek.
  contacts: 'crm.contacts',
  companies: 'crm.contacts',
  deals: 'crm.pipeline',
  pipeline: 'crm.pipeline',
  // Sekwencje to NIE `crm.email` ("Email sync & templates"): tamto platforma
  // ma natywnie, a automatyczne kadencje 1:1 zostają w HubSpocie.
  email_sequences: 'sales.sequences',

  // Typeform.
  lead_capture_forms: 'forms.intake',
  nps_surveys: 'surveys.nps',
  conversational_branching: 'forms.conversational',

  // Airtable. `site_survey_tracking` NIE ma tu wpisu - patrz nota pod tablicą.
  custom_trackers: 'data.custom',
  spreadsheet_views: 'internal.apps',
  external_sharing_grid: 'collab.sharedviews',

  // Zapier. Przekazywanie webhooków to `integration.ipaas`, ale długi ogon
  // konektorów jest osobnym slugiem: to jedyny powód, dla którego Zapier
  // zostaje, i zwinięcie go w `integration.ipaas` (native) skasowałoby ten
  // werdykt.
  cross_app_automation: 'workflow.automation',
  webhook_relays: 'integration.ipaas',
  long_tail_app_connectors: 'integration.longtail',

  // PandaDoc.
  quote_documents: 'quotes.cpq',
  quote_approval_flow: 'workflow.approvals',
  e_signature: 'esignature',

  // Calendly.
  site_survey_scheduling: 'field.scheduling',
  external_booking_page: 'scheduling.bookingpage',

  // Slack. `team_chat` to nie `support.chat` - tamto jest czatem z klientem
  // na stronie, ten rozmową zespołu.
  internal_notifications: 'notifications',
  team_chat: 'collab.teamchat',
})

/**
 * Klucze ze starego katalogu, które CELOWO nie mają aliasu. Ta lista niczego
 * nie robi w czasie działania - jest notatką, żeby nikt nie "naprawił"
 * braku, biorąc go za przeoczenie.
 *
 * `site_survey_tracking`: to nie zdolność, tylko jeden konkretny rejestr
 * jednego klienta. Aliasowanie go do `data.custom` dałoby werdykt
 * `native` / `high` ("platforma ma rejestry własne") tam, gdzie stary wpis
 * mówił `build` / `medium` - bo encję Site Survey trzeba dopiero zamodelować.
 * Bez aliasu wychodzi uczciwie jako `build` / `low` / `not in catalog`, czyli
 * blisko pierwotnej intencji, i zostaje widoczny w `src/catalogGaps.ts` jako
 * luka do skatalogowania.
 */
export const UNMAPPED_LEGACY_KEYS: readonly string[] = Object.freeze(['site_survey_tracking'])

/**
 * Kanoniczny slug dla starego klucza albo `undefined`, gdy klucza nie ma w
 * tablicy. `Object.hasOwn`, a nie odczyt wprost: `capability` bywa stringiem
 * od modelu, a `CAPABILITY_ALIASES['constructor']` bez tej kontroli oddałby
 * funkcję z prototypu jako "znaleziony alias".
 */
export function resolveCapabilityAlias(capability: string): string | undefined {
  if (!Object.hasOwn(CAPABILITY_ALIASES, capability)) return undefined
  return CAPABILITY_ALIASES[capability]
}

/** Stare klucze, które celują w podany slug. Używane przez `list_catalog_capabilities`. */
export function aliasesFor(canonicalSlug: string): string[] {
  return Object.keys(CAPABILITY_ALIASES).filter((alias) => CAPABILITY_ALIASES[alias] === canonicalSlug)
}
