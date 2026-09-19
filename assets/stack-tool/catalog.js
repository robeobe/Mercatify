/* Mercatify stack tool — shared catalog, taxonomy and helpers.
   Loaded as a classic script by intake.html, mapping.html and report.html. */

/* ---------- canonical capability vocabulary ----------
   Two modules that carry the same slug are the same job, whichever tool they
   are billed under. That is what makes duplicates visible. */
const CAPS = {
  'crm.contacts':        'Contact & company database',
  'crm.pipeline':        'Deal pipeline',
  'crm.email':           'Email sync & templates',
  'sales.forecast':      'Forecasting',
  'marketing.email':     'Email campaigns',
  'marketing.automation':'Marketing automation',
  'marketing.forms':     'Signup forms & popups',
  'marketing.segments':  'Audience segmentation',
  'marketing.sms':       'SMS campaigns',
  'quotes.cpq':          'Quote / configure-price-quote',
  'docs.templates':      'Document templates',
  'docs.analytics':      'Document analytics',
  'esignature':          'E-signature',
  'workflow.approvals':  'Approval workflow',
  'workflow.automation': 'Rules & automation',
  'integration.ipaas':   'Integrations / data sync',
  'catalog.products':    'Product catalog',
  'pricing.pricelists':  'Price lists & discounts',
  'b2b.accounts':        'B2B company accounts',
  'ecommerce.storefront':'Storefront',
  'ecommerce.cart':      'Cart & checkout',
  'orders.mgmt':         'Order management',
  'fulfillment.shipping':'Fulfilment & shipping',
  'inventory.stock':     'Stock levels',
  'inventory.multiwarehouse':'Multi-warehouse stock',
  'inventory.barcode':   'Barcode scanning',
  'inventory.alerts':    'Low-stock alerts',
  'purchasing.po':       'Purchase orders',
  'support.tickets':     'Ticketing / shared inbox',
  'support.sla':         'SLA & routing',
  'support.kb':          'Knowledge base',
  'support.chat':        'Live chat / messenger',
  'support.voice':       'Voice / phone',
  'onboarding.tours':    'Product tours',
  'projects.tasks':      'Tasks & project boards',
  'field.scheduling':    'Scheduling & dispatch',
  'field.jobsheets':     'Job sheets & checklists',
  'time.tracking':       'Time tracking',
  'customer.portal':     'Customer self-service portal',
  'forms.intake':        'Intake forms',
  'data.custom':         'Custom registers & fields',
  'internal.apps':       'Internal apps / views',
  'files.docs':          'Documents & files',
  'reporting.dashboards':'Reports & dashboards',
  'payments':            'Payments',
  'billing.subscriptions':'Subscriptions & recurring billing',
  'invoicing':           'Sales invoicing',
  'tax.calc':            'Tax calculation',
  'accounting.ledger':   'General ledger & VAT',
  'accounting.expenses': 'Bills & expenses',
  'accounting.bank':     'Bank reconciliation',
  'accounting.reports':  'Statutory reporting',
  'hr.payroll':          'Payroll',
  'cms.website':         'Website / CMS',

  /* Slugs added when the TypeScript engine's catalog (mercatify-labs/src/
     catalogData.json) was folded into this one. Each exists because the old
     entry carried a verdict that folding it into an existing slug would have
     silently overwritten — e.g. Slack's team chat is a `keep`, while
     `support.chat` (customer-facing messenger) is an `integrate`. */
  'sales.sequences':     'Email sequences / cadences',
  'surveys.nps':         'Surveys & NPS',
  'forms.conversational':'Conversational / branching forms',
  'integration.longtail':'Long-tail app connectors',
  'scheduling.bookingpage':'Public self-service booking page',
  'notifications':       'Internal notifications & alerts',
  'collab.teamchat':     'Internal team chat',
  'collab.sharedviews':  'Externally shared views'
};

/* ---------- Open Mercato target vocabulary ----------
   Every entry below is a real module folder in the platform, checked against
   packages/core/src/modules, packages/enterprise/src/modules and the
   per-feature packages. "no module yet — build" is the honest answer when
   nothing covers it; it is never dressed up as an existing module. */
const OM_TARGETS = [
  'customers',
  'customers + sales',
  'sales',
  'sales — quotes',
  'sales — orders',
  'sales — invoices',
  'catalog',
  'catalog — prices',
  'wms',
  'checkout',
  'payment_gateways',
  'shipping_carriers',
  'messages',
  'messages + inbox_ops',
  'phone_calls',
  'warranty_claims',
  'planner — availabilities',
  'business_rules',
  'workflows',
  'portal + customer_accounts',
  'entities — custom entities & fields',
  'documents',
  'notifications',
  'content',
  'dashboards',
  'search',
  'integrations',
  'data_sync',
  'staff',
  'agent_orchestrator (enterprise)',
  'stays external, wired in',
  'not our business — keep it',
  'no module yet — build',

  /* Composite targets. `CATALOG` below already used all ten, but the list was
     never extended to match, so "is this a real target?" had no answer for a
     third of the modules. They follow the convention the list already set with
     'customers + sales' and 'messages + inbox_ops': one module needs two
     platform modules, and naming only one of them would be a half-truth. */
  'business_rules + data_sync',
  'business_rules + integrations',
  'business_rules + notifications',
  'catalog + sales — quotes',
  'content + portal',
  'sales — orders + shipping_carriers',
  'sales — invoices + payment_gateways',
  'checkout + payment_gateways',
  'payment_gateways + checkout',
  'customers + catalog — prices'
];

/* ---------- verdicts ---------- */
const VERDICTS = {
  native:    { label: 'native',    hint: 'already in the platform, no work' },
  configure: { label: 'configure', hint: 'in the platform, needs setting up' },
  build:     { label: 'build',     hint: 'genuinely new — estimate the hours' },
  integrate: { label: 'integrate', hint: 'stays external, wired in by API' },
  keep:      { label: 'keep',      hint: 'out of scope by recommendation' },
  drop:      { label: 'drop',      hint: 'nobody would miss it' }
};
const CONFIDENCE = ['high', 'medium', 'low'];

/* ---------- SaaS catalog ----------
   Every module carries: what it is, the capabilities it covers, a default
   Open Mercato target and a default verdict. Those defaults are the seed an
   agent would later produce — on the mapping page they are all editable.

   SOURCE OF TRUTH: the om/verdict/conf triples below are INPUT to the
   generator, not what the pages read. They live canonically in
   mercatify-labs/src/catalogData.json, keyed by tool name and CAPS slug;
   `npm run catalog:generate` in mercatify-labs joins them with the module
   structure here and writes ../shared/catalog.generated.js, which is where
   every page gets its verdicts from (see catalogTools() below).

   Change a verdict in the JSON and re-generate. Changing it here changes
   nothing a reader sees — and catalogIntegrity.test.ts turns red, because the
   two would then disagree. That test is also the reason the triples are still
   written out below: it reads them straight out of this file, in a bare VM
   context with no generated copy loaded, and it is not this branch's to
   rewrite. */
const CATALOG = [
  { id:'hubspot', name:'HubSpot', kind:'CRM & marketing', modules:[
    { id:'sales',     name:'Sales Hub',            desc:'Contacts, deals, pipeline stages, email log', caps:['crm.contacts','crm.pipeline','crm.email'], om:'customers + sales', verdict:'native',    conf:'high' },
    { id:'marketing', name:'Marketing Hub',        desc:'Campaigns, lists, landing pages, lead scoring', caps:['marketing.email','marketing.automation','marketing.forms'], om:'stays external, wired in', verdict:'integrate', conf:'medium' },
    { id:'service',   name:'Service Hub',          desc:'Tickets, SLAs, knowledge base', caps:['support.tickets','support.sla','support.kb'], om:'messages + inbox_ops', verdict:'configure', conf:'medium' },
    { id:'quotes',    name:'Quote builder',        desc:'Quote documents from a product configuration', caps:['quotes.cpq'], om:'sales — quotes', verdict:'build', conf:'medium' },
    { id:'paylinks',  name:'Payment links',        desc:'Payment links on a quote', caps:['payments'], om:'payment_gateways', verdict:'native', conf:'medium' },
    { id:'cms',       name:'Content Hub',          desc:'Website, blog, landing pages', caps:['cms.website'], om:'not our business — keep it', verdict:'keep', conf:'high' },
    { id:'ops',       name:'Operations Hub',       desc:'Data sync, programmable automation', caps:['workflow.automation','integration.ipaas'], om:'business_rules + data_sync', verdict:'configure', conf:'medium' },
    { id:'reporting', name:'Custom reports',       desc:'Dashboards and attribution reports', caps:['reporting.dashboards'], om:'dashboards', verdict:'configure', conf:'medium' }
  ]},

  { id:'salesforce', name:'Salesforce', kind:'CRM suite', modules:[
    { id:'sales',    name:'Sales Cloud',           desc:'Accounts, opportunities, forecasting', caps:['crm.contacts','crm.pipeline','sales.forecast'], om:'customers + sales', verdict:'configure', conf:'medium' },
    { id:'service',  name:'Service Cloud',         desc:'Cases, omni-channel routing, SLAs', caps:['support.tickets','support.sla'], om:'messages + inbox_ops', verdict:'configure', conf:'medium' },
    { id:'cpq',      name:'CPQ',                   desc:'Quote documents from product and price rules', caps:['quotes.cpq'], om:'sales — quotes', verdict:'build', conf:'medium' },
    { id:'pricerules',name:'Price rules',          desc:'Price lists and discount rules', caps:['pricing.pricelists'], om:'catalog — prices', verdict:'configure', conf:'medium' },
    { id:'pardot',   name:'Account Engagement',    desc:'Nurture programmes, lead scoring', caps:['marketing.email','marketing.automation'], om:'stays external, wired in', verdict:'integrate', conf:'medium' },
    { id:'exp',      name:'Experience Cloud',      desc:'Customer and partner portal', caps:['customer.portal'], om:'portal + customer_accounts', verdict:'configure', conf:'medium' },
    { id:'field',    name:'Field Service',         desc:'Work orders, dispatch, mobile app', caps:['field.scheduling','field.jobsheets'], om:'no module yet — build', verdict:'build', conf:'low' },
    { id:'reports',  name:'Reports & dashboards',  desc:'Standard and custom reporting', caps:['reporting.dashboards'], om:'dashboards', verdict:'configure', conf:'medium' }
  ]},

  { id:'pipedrive', name:'Pipedrive', kind:'Sales CRM', modules:[
    { id:'deals',    name:'Deals & pipelines',     desc:'Stages, rotting deals, activities', caps:['crm.pipeline'], om:'sales', verdict:'native', conf:'high' },
    { id:'contacts', name:'Contacts & organisations', desc:'People, companies, custom fields', caps:['crm.contacts'], om:'customers', verdict:'native', conf:'high' },
    { id:'email',    name:'Email sync & templates', desc:'Two-way sync, sequences', caps:['crm.email'], om:'messages', verdict:'configure', conf:'medium' },
    { id:'products', name:'Product list',          desc:'Product list attached to deals', caps:['catalog.products'], om:'catalog', verdict:'native', conf:'medium' },
    { id:'quotedocs',name:'Quote documents',     desc:'Quote PDFs from the deal product list', caps:['quotes.cpq'], om:'sales — quotes', verdict:'build', conf:'medium' },
    { id:'autom',    name:'Workflow automation',   desc:'Trigger-action rules', caps:['workflow.automation'], om:'business_rules', verdict:'configure', conf:'high' },
    { id:'insights', name:'Insights',              desc:'Reports and goal tracking', caps:['reporting.dashboards'], om:'dashboards', verdict:'configure', conf:'medium' },
    { id:'projects', name:'Projects',              desc:'Post-sale delivery boards', caps:['projects.tasks'], om:'entities — custom entities & fields', verdict:'build', conf:'low' }
  ]},

  { id:'zendesk', name:'Zendesk', kind:'Support', modules:[
    { id:'support', name:'Support',                desc:'Ticketing, macros, SLA policies', caps:['support.tickets','support.sla'], om:'messages + inbox_ops', verdict:'configure', conf:'medium' },
    { id:'guide',   name:'Guide',                  desc:'Help centre and article base', caps:['support.kb'], om:'content + portal', verdict:'configure', conf:'low' },
    { id:'chat',    name:'Messaging & live chat',  desc:'Web widget, bots', caps:['support.chat'], om:'stays external, wired in', verdict:'integrate', conf:'medium' },
    { id:'talk',    name:'Talk',                   desc:'Voice channel and call recording', caps:['support.voice'], om:'phone_calls', verdict:'integrate', conf:'medium' },
    { id:'explore', name:'Explore',                desc:'Support reporting', caps:['reporting.dashboards'], om:'dashboards', verdict:'configure', conf:'medium' },
    { id:'sell',    name:'Sell',                   desc:'Light CRM for the support team', caps:['crm.contacts','crm.pipeline'], om:'customers + sales', verdict:'native', conf:'high' }
  ]},

  { id:'intercom', name:'Intercom', kind:'Support & messaging', modules:[
    { id:'inbox',    name:'Inbox',                 desc:'Shared inbox, assignment rules', caps:['support.tickets'], om:'messages + inbox_ops', verdict:'configure', conf:'medium' },
    { id:'messenger',name:'Messenger',             desc:'In-app and website chat', caps:['support.chat'], om:'stays external, wired in', verdict:'integrate', conf:'medium' },
    { id:'help',     name:'Help Center',           desc:'Self-serve articles', caps:['support.kb'], om:'content + portal', verdict:'configure', conf:'low' },
    { id:'outbound', name:'Outbound',              desc:'Campaigns, emails, in-app banners', caps:['marketing.email','marketing.automation'], om:'stays external, wired in', verdict:'integrate', conf:'medium' },
    { id:'tours',    name:'Product Tours',         desc:'Onboarding walkthroughs', caps:['onboarding.tours'], om:'not our business — keep it', verdict:'drop', conf:'low' },
    { id:'workflows',name:'Workflows',             desc:'Bots and routing logic', caps:['workflow.automation'], om:'business_rules', verdict:'configure', conf:'medium' }
  ]},

  { id:'shopify', name:'Shopify', kind:'Commerce', modules:[
    { id:'store',     name:'Online Store',         desc:'Themes, pages, navigation', caps:['ecommerce.storefront'], om:'stays external, wired in', verdict:'integrate', conf:'medium' },
    { id:'products',  name:'Products & collections', desc:'SKUs, variants, media', caps:['catalog.products'], om:'catalog', verdict:'native', conf:'high' },
    { id:'inventory', name:'Inventory & locations', desc:'Stock per location, transfers', caps:['inventory.stock','inventory.multiwarehouse'], om:'wms', verdict:'native', conf:'high' },
    { id:'orders',    name:'Orders & fulfilment',  desc:'Order flow, picking, shipping labels', caps:['orders.mgmt','fulfillment.shipping'], om:'sales — orders + shipping_carriers', verdict:'native', conf:'high' },
    { id:'checkout',  name:'Checkout & payments',  desc:'Cart, payment providers, taxes', caps:['ecommerce.cart','payments'], om:'checkout + payment_gateways', verdict:'configure', conf:'medium' },
    { id:'b2b',       name:'B2B',                  desc:'Company accounts, catalogs, price lists', caps:['b2b.accounts','pricing.pricelists'], om:'customers + catalog — prices', verdict:'configure', conf:'medium' },
    { id:'flow',      name:'Shopify Flow',         desc:'Commerce automations', caps:['workflow.automation'], om:'business_rules', verdict:'configure', conf:'high' }
  ]},

  { id:'monday', name:'monday.com', kind:'Work management', modules:[
    { id:'work',    name:'Work management',        desc:'Boards, tasks, owners, statuses', caps:['projects.tasks'], om:'entities — custom entities & fields', verdict:'build', conf:'low' },
    { id:'crm',     name:'monday CRM',             desc:'Leads, contacts, deal boards', caps:['crm.contacts','crm.pipeline'], om:'customers + sales', verdict:'native', conf:'high' },
    { id:'forms',   name:'Forms',                  desc:'Intake forms feeding boards', caps:['forms.intake'], om:'entities — custom entities & fields', verdict:'configure', conf:'medium' },
    { id:'docs',    name:'Docs',                   desc:'Shared documents and notes', caps:['files.docs'], om:'documents', verdict:'native', conf:'high' },
    { id:'dash',    name:'Dashboards',             desc:'Cross-board widgets', caps:['reporting.dashboards'], om:'dashboards', verdict:'configure', conf:'medium' },
    { id:'autom',   name:'Automations & integrations', desc:'Recipes and connected apps', caps:['workflow.automation','integration.ipaas'], om:'business_rules + integrations', verdict:'configure', conf:'medium' }
  ]},

  { id:'airtable', name:'Airtable', kind:'Ad-hoc registers', modules:[
    { id:'bases',   name:'Bases',                  desc:'The registers the business actually runs on', caps:['data.custom'], om:'entities — custom entities & fields', verdict:'native', conf:'high' },
    { id:'iface',   name:'Interfaces',             desc:'Internal views and mini-apps', caps:['internal.apps'], om:'entities — custom entities & fields', verdict:'configure', conf:'medium' },
    { id:'forms',   name:'Forms',                  desc:'Data collection into bases', caps:['forms.intake'], om:'entities — custom entities & fields', verdict:'configure', conf:'medium' },
    { id:'autom',   name:'Automations & scripts',  desc:'Scheduled and triggered scripts', caps:['workflow.automation'], om:'business_rules', verdict:'configure', conf:'medium' },
    { id:'sync',    name:'Sync & integrations',    desc:'Two-way sync with other tools', caps:['integration.ipaas'], om:'data_sync', verdict:'configure', conf:'medium' },
    { id:'charts',  name:'Charts & reporting',     desc:'Dashboards over bases', caps:['reporting.dashboards'], om:'dashboards', verdict:'configure', conf:'medium' }
  ]},

  { id:'pandadoc', name:'PandaDoc', kind:'Quotes & e-signature', modules:[
    { id:'templates',name:'Document templates',    desc:'Reusable document templates', caps:['docs.templates'], om:'documents', verdict:'configure', conf:'medium' },
    { id:'quotebuild',name:'Quote builder',      desc:'Quote documents from a panel-and-inverter configuration', caps:['quotes.cpq'], om:'sales — quotes', verdict:'build', conf:'medium' },
    { id:'esign',   name:'E-signature',            desc:'Legally binding signature', caps:['esignature'], om:'stays external, wired in', verdict:'integrate', conf:'high' },
    { id:'approve', name:'Approval workflow',      desc:'Internal sign-off before sending', caps:['workflow.approvals'], om:'workflows', verdict:'configure', conf:'medium' },
    { id:'analytics',name:'Document analytics',    desc:'Who opened what, for how long', caps:['docs.analytics'], om:'not our business — keep it', verdict:'drop', conf:'low' },
    { id:'payments',name:'Payments on documents',  desc:'Pay from the quote', caps:['payments'], om:'payment_gateways + checkout', verdict:'configure', conf:'medium' },
    { id:'crmsync', name:'CRM integration',        desc:'Push signed documents back to the CRM', caps:['integration.ipaas'], om:'integrations', verdict:'configure', conf:'high' }
  ]},

  { id:'inventory-app', name:'Sortly / inFlow', kind:'Inventory', modules:[
    { id:'items',   name:'Item catalog',           desc:'Items, custom fields, photos', caps:['catalog.products','data.custom'], om:'catalog', verdict:'native', conf:'high' },
    { id:'stock',   name:'Stock by location',      desc:'Levels across warehouses and vans', caps:['inventory.stock','inventory.multiwarehouse'], om:'wms', verdict:'native', conf:'high' },
    { id:'barcode', name:'Barcode scanning',       desc:'Goods-in and stock-take on a phone', caps:['inventory.barcode'], om:'wms', verdict:'configure', conf:'medium' },
    { id:'alerts',  name:'Low-stock alerts',       desc:'Reorder points and notifications', caps:['inventory.alerts'], om:'business_rules + notifications', verdict:'configure', conf:'high' },
    { id:'po',      name:'Purchase orders',        desc:'Ordering from suppliers', caps:['purchasing.po'], om:'no module yet — build', verdict:'build', conf:'low' },
    { id:'reports', name:'Inventory reports',      desc:'Valuation and movement', caps:['reporting.dashboards'], om:'dashboards', verdict:'configure', conf:'medium' }
  ]},

  { id:'jobber', name:'Jobber / ServiceTitan', kind:'Field service', modules:[
    { id:'sched',   name:'Scheduling & dispatch',  desc:'Crew calendar, route, assignment', caps:['field.scheduling'], om:'planner — availabilities', verdict:'configure', conf:'low' },
    { id:'jobs',    name:'Job sheets & checklists',desc:'On-site forms, photos, sign-off', caps:['field.jobsheets'], om:'entities — custom entities & fields', verdict:'build', conf:'low' },
    { id:'quotes',  name:'Quotes',                 desc:'On-site estimates', caps:['quotes.cpq'], om:'sales — quotes', verdict:'build', conf:'medium' },
    { id:'invoice', name:'Invoicing & payments',   desc:'Invoice on completion, card payment', caps:['invoicing','payments'], om:'sales — invoices + payment_gateways', verdict:'configure', conf:'medium' },
    { id:'hub',     name:'Client hub',             desc:'Customer sees quotes, visits, invoices', caps:['customer.portal'], om:'portal + customer_accounts', verdict:'configure', conf:'medium' },
    { id:'time',    name:'Time tracking',          desc:'Hours per job and per crew', caps:['time.tracking'], om:'no module yet — build', verdict:'build', conf:'low' }
  ]},

  { id:'emailmkt', name:'Mailchimp / Klaviyo', kind:'Email marketing', modules:[
    { id:'camp',    name:'Campaigns',              desc:'Newsletters and broadcasts', caps:['marketing.email'], om:'stays external, wired in', verdict:'integrate', conf:'high' },
    { id:'flows',   name:'Automations / flows',    desc:'Abandoned cart, win-back, onboarding', caps:['marketing.automation'], om:'stays external, wired in', verdict:'integrate', conf:'medium' },
    { id:'seg',     name:'Segments',               desc:'Audience slices from behaviour', caps:['marketing.segments'], om:'customers', verdict:'configure', conf:'medium' },
    { id:'forms',   name:'Forms & popups',         desc:'Signup capture on the site', caps:['marketing.forms'], om:'stays external, wired in', verdict:'integrate', conf:'medium' },
    { id:'sms',     name:'SMS',                    desc:'Text campaigns and alerts', caps:['marketing.sms'], om:'stays external, wired in', verdict:'integrate', conf:'high' },
    { id:'reports', name:'Campaign reporting',     desc:'Opens, clicks, revenue attribution', caps:['reporting.dashboards'], om:'dashboards', verdict:'configure', conf:'low' }
  ]},

  { id:'stripe', name:'Stripe Billing', kind:'Payments & billing', modules:[
    { id:'pay',     name:'Payments & checkout',    desc:'Card acquiring, payment links', caps:['payments'], om:'payment_gateways', verdict:'integrate', conf:'high' },
    { id:'subs',    name:'Subscriptions',          desc:'Plans, trials, proration', caps:['billing.subscriptions'], om:'no module yet — build', verdict:'build', conf:'low' },
    { id:'inv',     name:'Invoices & dunning',     desc:'Invoice issue, retries, reminders', caps:['invoicing'], om:'sales — invoices', verdict:'configure', conf:'medium' },
    { id:'tax',     name:'Tax',                    desc:'Rate determination and filing data', caps:['tax.calc'], om:'stays external, wired in', verdict:'integrate', conf:'high' },
    { id:'portal',  name:'Customer billing portal',desc:'Self-service plan and card changes', caps:['customer.portal'], om:'portal + customer_accounts', verdict:'configure', conf:'medium' },
    { id:'rev',     name:'Revenue reporting',      desc:'MRR, churn, cohorts', caps:['reporting.dashboards'], om:'dashboards', verdict:'configure', conf:'low' }
  ]},

  { id:'accounting', name:'Xero / QuickBooks', kind:'Accounting', modules:[
    { id:'ledger',  name:'General ledger & VAT',   desc:'Statutory books and filings', caps:['accounting.ledger'], om:'not our business — keep it', verdict:'keep', conf:'high' },
    { id:'inv',     name:'Sales invoices',         desc:'Issuing and chasing invoices', caps:['invoicing'], om:'sales — invoices', verdict:'configure', conf:'medium' },
    { id:'bills',   name:'Bills & expenses',       desc:'Supplier bills, receipts', caps:['accounting.expenses'], om:'not our business — keep it', verdict:'keep', conf:'high' },
    { id:'bank',    name:'Bank reconciliation',    desc:'Feeds and matching', caps:['accounting.bank'], om:'not our business — keep it', verdict:'keep', conf:'high' },
    { id:'payroll', name:'Payroll',                desc:'Salaries and contributions', caps:['hr.payroll'], om:'not our business — keep it', verdict:'keep', conf:'high' },
    { id:'reports', name:'Financial reports',      desc:'P&L, balance sheet', caps:['accounting.reports'], om:'not our business — keep it', verdict:'keep', conf:'high' }
  ]}
];

/* ---------- helpers ---------- */
const CURRENCIES = { EUR:'€', USD:'$', PLN:'zł', GBP:'£' };

/* The catalog the pages actually read: the generated join of the module
   structure above with the canonical verdicts in catalogData.json. A page that
   has not loaded ../shared/catalog.generated.js falls back to the literal, so
   nothing here breaks when the copy is missing — but it is the generated one
   that decides a verdict wherever both are present, which is the whole point
   of generating it. */
function catalogTools(){
  return typeof CATALOG_TOOLS !== 'undefined' && CATALOG_TOOLS ? CATALOG_TOOLS : CATALOG;
}

function findTool(id){ return catalogTools().find(function(t){ return t.id === id; }); }
function findModule(toolId, modId){
  var t = findTool(toolId);
  return t ? t.modules.find(function(m){ return m.id === modId; }) : null;
}
function plural(n, one, many){ return n + ' ' + (Math.abs(n) === 1 ? one : (many || one + 's')); }
function capLabel(slug){ return CAPS[slug] || slug; }

function money(n, cur){
  var sym = CURRENCIES[cur] || '';
  var v = Math.round(Number(n) || 0).toLocaleString('en-US');
  return cur === 'PLN' ? v + ' ' + sym : sym + v;
}

/* every capability that shows up in more than one selected tool */
function overlaps(tools){
  var map = {};
  (tools || []).forEach(function(t){
    (t.modules || []).forEach(function(m){
      (m.caps || []).forEach(function(c){
        map[c] = map[c] || [];
        if (!map[c].some(function(x){ return x.toolId === t.id; })) {
          map[c].push({ toolId: t.id, toolName: t.name, moduleName: m.name });
        }
      });
    });
  });
  return Object.keys(map)
    .filter(function(c){ return map[c].length > 1; })
    .map(function(c){ return { cap: c, label: capLabel(c), tools: map[c] }; })
    .sort(function(a, b){ return b.tools.length - a.tools.length; });
}

/* ================= intake brief — StackBrief v2 =================
   Both intake forms build the same brief, so the shape lives here rather than
   twice in two pages that have drifted apart once already
   (stack-tool/intake.html and client/intake.html).

   The reader that decides whether a brief is usable is
   mercatify-labs/src/intake/fromBrief.ts: it validates every field named
   below, names the field when it refuses, and rebuilds the engine request from
   scratch — so a field invented here and not listed there never reaches the
   engine, and a field it requires cannot be left as an empty <input> string.

   v2 adds exactly what the report cannot be written without: how we know what
   each module is used for, the contract line of the stack table, and the three
   scope notes in section 02. A v1 brief left in a browser still opens — the
   upgrade is in readBriefIntoState and comes down to one decision, the same
   one fromBrief.ts makes: a module with no declared evidence is `inferred`. */
var BRIEF_VERSION = 2;
var BRIEF_KIND = 'mercatify-brief';

/* A tool the catalog does not carry. One string used as both `kind` and the
   fallback `category`, so the mapping and the report say the same word. */
var OFF_CATALOG_KIND = 'off-catalog';

/* How we know what a module is used for — the core of what makes the report
   believable. The keys are the contract (`BriefEvidenceKind` in fromBrief.ts);
   the labels are the words the report itself prints in front of the note
   ("Observed: 3 pipelines, 11 custom deal properties"), so what the client
   ticks and what the document says are the same word. */
var EVIDENCE_KINDS = {
  observed:  { label: 'Observed',  hint: 'somebody looked — a screen-share, an invoice, the tool itself' },
  inferred:  { label: 'Inferred',  hint: 'nobody checked; it follows from what you told us' },
  estimated: { label: 'Estimated', hint: 'a figure somebody put on it, not a measurement' }
};
/* `inferred`, never `observed`. A form filled in with nobody watching cannot
   claim the thing was seen, and `estimated` would claim somebody did the sum.
   Same default, same reasoning as DEFAULT_EVIDENCE_KIND in fromBrief.ts. */
var DEFAULT_EVIDENCE_KIND = 'inferred';

/* The billing term decides which wave a tool can be retired in, so an annual
   term carries the date it ends and a rolling one deliberately carries none. */
var TERM_TYPES = {
  monthly: { label: 'Rolling monthly', hint: 'can be dropped any month' },
  annual:  { label: 'Annual',          hint: 'locked until it renews' }
};
var DEFAULT_TERM_TYPE = 'monthly';

/* What an off-catalog tool does until the client says otherwise. A tool with
   no capability at all is refused by fromBrief.ts — it would be a licence the
   engine never weighs — so the picker always has something selected. */
var DEFAULT_CUSTOM_CAP = 'data.custom';
var DEFAULT_CURRENCY = Object.keys(CURRENCIES)[0];

/* ---------- coercion: <input> strings -> the types the contract wants ----------
   Every figure in the form is a string, including the empty one. fromBrief.ts
   takes numbers and refuses NaN, so the conversion happens once, here. */
function isNum(n){ return typeof n === 'number' && isFinite(n); }
function briefString(v){ return typeof v === 'string' ? v : (v === null || v === undefined ? '' : String(v)); }
function briefNumber(v){ var n = Number(v); return isNum(n) && n > 0 ? n : 0; }
function briefInteger(v){ var n = Number(v); return isNum(n) && n > 0 ? Math.round(n) : 0; }
function briefEvidenceKind(v){ return (typeof v === 'string' && EVIDENCE_KINDS[v]) ? v : DEFAULT_EVIDENCE_KIND; }
function briefTermType(v){ return (typeof v === 'string' && TERM_TYPES[v]) ? v : DEFAULT_TERM_TYPE; }

/* What one seat costs. Suggested from the two numbers the client already
   typed, never imposed: an entered unit price wins, and a tool with no seat
   count gets no suggestion rather than the whole licence billed as one seat. */
function briefUnitPrice(entry){
  if (briefString(entry.unitPrice).trim() !== '') return briefNumber(entry.unitPrice);
  var seats = briefInteger(entry.seats), monthly = briefNumber(entry.monthly);
  return seats > 0 && monthly > 0 ? Math.round((monthly / seats) * 100) / 100 : 0;
}

/* ---------- the shape the form holds while it is being filled in ---------- */
function blankToolEntry(){
  return { mods: {}, ev: {}, seats:'', monthly:'', plan:'', unitPrice:'', category:'',
           termType: DEFAULT_TERM_TYPE, termEnds:'' };
}
function blankCustomEntry(){
  var e = blankToolEntry();
  e.name = ''; e.what = ''; e.cap = DEFAULT_CUSTOM_CAP;
  e.evidenceKind = DEFAULT_EVIDENCE_KIND; e.evidenceNote = '';
  return e;
}
/* Evidence is kept per module id, not per ticked module, so unticking one and
   changing your mind does not throw away what was written about it. */
function moduleEvidence(entry, modId){
  if (!entry.ev) entry.ev = {};
  if (!entry.ev[modId]) entry.ev[modId] = { kind: DEFAULT_EVIDENCE_KIND, note: '' };
  return entry.ev[modId];
}

/* Capability vocabulary as a picker, one label per slug, alphabetical. */
function capOptions(){
  return Object.keys(CAPS)
    .map(function(slug){ return { slug: slug, label: CAPS[slug] }; })
    .sort(function(a, b){ return a.label.localeCompare(b.label); });
}

/* ---------- state -> brief ---------- */
function briefTool(spec){
  var e = spec.entry || {};
  var termType = briefTermType(e.termType);
  var seats = briefInteger(e.seats);
  /* Key order follows src/__tests__/fixtures/voltix-brief.json so a brief from
     this form and the fixture read the same way side by side. */
  var tool = {
    id: spec.id,
    name: briefString(spec.name),
    plan: briefString(e.plan),
    kind: spec.kind,
    category: briefString(e.category).trim() || spec.kind,
    seats: seats,
    unitPrice: briefUnitPrice(e),
    monthly: briefNumber(e.monthly),
    /* A rolling term has no end date, so it carries none even if one was typed
       before the term was switched — the report reads this as "no lock-in". */
    termEnds: termType === 'annual' ? briefString(e.termEnds) : '',
    termType: termType,
    modules: spec.modules
  };
  /* No seat count is not zero seats. fromBrief.ts leaves seatCount unset when
     the field is absent, and guesses nothing when it is. */
  if (seats <= 0) delete tool.seats;
  if (spec.custom) tool.custom = true;
  return tool;
}

function buildBrief(state){
  var m = state.meta || {};
  var tools = [];

  catalogTools().forEach(function(t){
    var s = state.sel[t.id]; if (!s) return;
    var mods = t.modules.filter(function(mod){ return s.mods[mod.id]; }).map(function(mod){
      var ev = moduleEvidence(s, mod.id);
      return { id: mod.id, name: mod.name, desc: mod.desc, caps: mod.caps.slice(),
               evidenceKind: briefEvidenceKind(ev.kind), evidenceNote: briefString(ev.note) };
    });
    tools.push(briefTool({ id: t.id, name: t.name, kind: t.kind, entry: s, modules: mods }));
  });

  (state.custom || []).forEach(function(c, i){
    if (!briefString(c.name).trim()) return;
    var cap = (typeof c.cap === 'string' && CAPS[c.cap]) ? c.cap : DEFAULT_CUSTOM_CAP;
    tools.push(briefTool({
      id: 'custom-' + i, name: c.name, kind: OFF_CATALOG_KIND, entry: c, custom: true,
      modules: [{ id: 'use', name: capLabel(cap), desc: briefString(c.what), caps: [cap],
                  evidenceKind: briefEvidenceKind(c.evidenceKind),
                  evidenceNote: briefString(c.evidenceNote) }]
    }));
  });

  return {
    v: BRIEF_VERSION,
    kind: BRIEF_KIND,
    created: new Date().toISOString().slice(0, 10),
    company: { name: briefString(m.name), industry: briefString(m.industry), people: briefInteger(m.people) },
    contact: { name: briefString(m.contactName), role: briefString(m.contactRole) },
    currency: briefString(m.currency) || DEFAULT_CURRENCY,
    pains: briefString(m.pains),
    mustKeep: briefString(m.mustKeep),
    readWhat: briefString(m.readWhat),
    period: briefString(m.period),
    exclusions: briefString(m.exclusions),
    tools: tools
  };
}

/* ---------- brief -> state, for any version this browser ever stored ----------
   This is the v1 -> v2 upgrade. A v1 brief has no evidence, no contract line
   and no scope notes; each missing piece gets the default a fresh tick would
   get, so an old draft opens filled in rather than failing on a field that did
   not exist when it was saved. */
function fieldNumber(v){
  if (v === undefined || v === null || v === '') return '';
  var n = Number(v);
  return isNum(n) && n > 0 ? String(n) : '';
}
function readContractIntoEntry(tool, entry){
  entry.seats = fieldNumber(tool.seats);
  entry.monthly = fieldNumber(tool.monthly);
  entry.plan = briefString(tool.plan);
  entry.unitPrice = fieldNumber(tool.unitPrice);
  /* v1 carried only `kind`; leaving `category` empty lets the catalog's own
     word fill it back in, which is what v1 meant by it anyway. */
  entry.category = briefString(tool.category);
  entry.termType = briefTermType(tool.termType);
  entry.termEnds = entry.termType === 'annual' ? briefString(tool.termEnds) : '';
}

function readBriefIntoState(brief, state){
  var b = brief || {};
  var company = b.company || {};
  var contact = b.contact || {};
  var meta = state.meta;

  meta.name = briefString(company.name);
  meta.industry = briefString(company.industry);
  meta.people = fieldNumber(company.people);
  meta.currency = briefString(b.currency) || DEFAULT_CURRENCY;
  meta.contactName = briefString(contact.name);
  meta.contactRole = briefString(contact.role);
  meta.pains = briefString(b.pains);
  meta.mustKeep = briefString(b.mustKeep);
  meta.readWhat = briefString(b.readWhat);
  meta.period = briefString(b.period);
  meta.exclusions = briefString(b.exclusions);

  (b.tools || []).forEach(function(t){
    if (!t) return;
    if (t.custom) {
      var c = blankCustomEntry();
      var first = (t.modules || [])[0] || {};
      var slug = (first.caps || [])[0];
      c.name = briefString(t.name);
      c.what = briefString(first.desc);
      c.cap = (typeof slug === 'string' && CAPS[slug]) ? slug : DEFAULT_CUSTOM_CAP;
      c.evidenceKind = briefEvidenceKind(first.evidenceKind);
      c.evidenceNote = briefString(first.evidenceNote);
      readContractIntoEntry(t, c);
      state.custom.push(c);
    } else if (findTool(t.id)) {
      var entry = blankToolEntry();
      (t.modules || []).forEach(function(m){
        if (!m || !findModule(t.id, m.id)) return;
        entry.mods[m.id] = true;
        entry.ev[m.id] = { kind: briefEvidenceKind(m.evidenceKind), note: briefString(m.evidenceNote) };
      });
      readContractIntoEntry(t, entry);
      state.sel[t.id] = entry;
    }
  });
}

/* Every meta field is declared in the markup with data-meta, so adding one to
   the brief is a markup change on both pages and nothing else. */
function bindMetaFields(state, onChange){
  Array.prototype.forEach.call(document.querySelectorAll('[data-meta]'), function(inp){
    inp.addEventListener('input', function(){
      state.meta[inp.getAttribute('data-meta')] = inp.value;
      if (onChange) onChange(inp);
    });
  });
}
function fillMetaFields(state){
  Array.prototype.forEach.call(document.querySelectorAll('[data-meta]'), function(inp){
    var key = inp.getAttribute('data-meta');
    if (state.meta[key] !== undefined) inp.value = state.meta[key];
  });
}

/* ---------- the two controls v2 needs, shared by both forms ----------
   The pages own their tool cards, because the two design systems label a
   duplicate differently; what they must not own is anything that decides the
   shape of the brief. */
function ensureIntakeStyles(){
  if (document.getElementById('intake-v2-styles')) return;
  /* Written against whichever of the two stylesheets is loaded: tool.css names
     its tokens --ink/--bg/--rule, om.css names them --foreground/--background/
     --border, and a var() fallback chain picks whichever answers. */
  var css = [
    '.ev { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:0 8px 9px 28px; }',
    '.ev__set { display:inline-flex; flex:none; border-radius:999px; overflow:hidden;',
    '  border:1px solid var(--rule-strong, var(--border, #c8c8c8)); }',
    '.ev__opt { appearance:none; -webkit-appearance:none; border:0; background:transparent; cursor:pointer;',
    '  font:inherit; font-size:11px; line-height:1.5; padding:4px 10px; white-space:nowrap;',
    '  color: var(--ink-2, var(--muted-foreground, #6d6d6d)); }',
    '.ev__opt + .ev__opt { border-left:1px solid var(--rule-strong, var(--border, #c8c8c8)); }',
    '.ev__opt:hover { color: var(--ink, var(--foreground, #0c0c0c)); }',
    '.ev__opt[aria-checked="true"] { background: var(--ink, var(--foreground, #0c0c0c));',
    '  color: var(--bg, var(--background, #fff)); }',
    '.ev__note { flex:1 1 200px; min-width:0; height:auto; padding:5px 10px; font-size:12px; }',
    '.more { margin-top:14px; padding-top:10px; border-top:1px solid var(--rule, var(--border, #ececec)); }',
    '.more > summary { cursor:pointer; list-style:none; display:flex; align-items:center; gap:7px;',
    '  font-size:12px; color: var(--ink-2, var(--muted-foreground, #6d6d6d)); }',
    '.more > summary::-webkit-details-marker { display:none; }',
    '.more > summary::before { content:"\\203A"; display:inline-block; transition:transform .12s ease; }',
    '.more[open] > summary::before { transform:rotate(90deg); }',
    '.more__grid { display:grid; gap:10px; margin-top:12px;',
    '  grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); }',
    '.more__grid > [hidden] { display:none; }',
    'input[type="date"] { width:100%; padding:8px 11px; font-size:13.5px;',
    '  color: var(--ink, var(--foreground, #0c0c0c)); background: var(--bg, var(--background, #fff));',
    '  border:1px solid var(--rule-strong, var(--input, var(--border, #c8c8c8)));',
    '  border-radius: var(--radius-md, 9px); }',
    '.custom-tool { padding-bottom:14px; margin-bottom:14px; border-bottom:1px solid var(--rule, var(--border, #ececec)); }',
    '.custom-tool:last-child { border-bottom:0; margin-bottom:0; }'
  ].join('\n');
  var tag = el('style', { id: 'intake-v2-styles', text: css });
  document.head.appendChild(tag);
}

/* One labelled <input> bound to one key of one entry. */
function intakeField(entry, spec){
  var w = el('div', {}, [ el('label', { for: spec.id, text: spec.label }) ]);
  var inp = el('input', { type: spec.type || 'text', id: spec.id, placeholder: spec.placeholder || '' });
  if (spec.type === 'number') {
    inp.setAttribute('min', '0');
    inp.setAttribute('step', spec.step || '1');
  }
  inp.value = entry[spec.key] || '';
  inp.addEventListener('input', function(){
    entry[spec.key] = inp.value;
    if (spec.onInput) spec.onInput(inp.value);
  });
  w.appendChild(inp);
  w.input = inp;
  return w;
}

/* Observed / Inferred / Estimated plus the one line that goes after the colon.
   Three buttons rather than a select: the choice is the point of the column,
   and a select hides two thirds of it behind a click. */
function evidenceControl(opts){
  var wrap = el('div', { class: 'ev' });
  var group = el('div', { class: 'ev__set', role: 'radiogroup', 'aria-label': opts.label });
  var options = [];

  Object.keys(EVIDENCE_KINDS).forEach(function(key){
    var meta = EVIDENCE_KINDS[key];
    var btn = el('button', { type: 'button', class: 'ev__opt', role: 'radio', title: meta.hint, text: meta.label });
    btn.addEventListener('click', function(){ pick(key, false); });
    btn.addEventListener('keydown', function(e){
      var step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
               : e.key === 'ArrowLeft'  || e.key === 'ArrowUp'   ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      var at = options.map(function(o){ return o.key; }).indexOf(key);
      pick(options[(at + step + options.length) % options.length].key, true);
    });
    options.push({ key: key, node: btn });
    group.appendChild(btn);
  });

  function paint(current){
    options.forEach(function(o){
      var on = o.key === current;
      o.node.setAttribute('aria-checked', on ? 'true' : 'false');
      /* One stop in the tab order per group; the arrows move inside it. */
      o.node.setAttribute('tabindex', on ? '0' : '-1');
    });
  }
  function pick(key, focus){
    paint(key);
    if (focus) {
      options.filter(function(o){ return o.key === key; })[0].node.focus();
    }
    opts.onKind(key);
  }
  paint(briefEvidenceKind(opts.kind));
  wrap.appendChild(group);

  var note = el('input', { type: 'text', class: 'ev__note', 'aria-label': opts.noteLabel,
                           placeholder: opts.notePlaceholder || '' });
  note.value = briefString(opts.note);
  note.addEventListener('input', function(){ opts.onNote(note.value); });
  wrap.appendChild(note);
  return wrap;
}

/* Plan, unit price, category and the billing term. Four fields the report
   prints and almost nobody changes, so they start folded away. */
function contractMore(entry, opts){
  var box = el('details', { class: 'more' });
  box.appendChild(el('summary', { text: 'Contract details' }));
  var grid = el('div', { class: 'more__grid' });
  var cur = opts.currency;

  function field(key, label, type, placeholder, step){
    var w = intakeField(entry, { id: opts.idPrefix + '-' + key, key: key, label: label,
                                 type: type, placeholder: placeholder, step: step,
                                 onInput: opts.onChange });
    grid.appendChild(w);
    return w;
  }

  field('plan', 'Plan', 'text', opts.planPlaceholder || '');
  var unit = field('unitPrice', 'One seat (' + cur + ')', 'number', '', '0.01');
  field('category', 'Category', 'text', opts.categoryPlaceholder || '');

  var termId = opts.idPrefix + '-termType';
  var termWrap = el('div', {}, [ el('label', { for: termId, text: 'Billing term' }) ]);
  var termSel = el('select', { id: termId });
  Object.keys(TERM_TYPES).forEach(function(key){
    termSel.appendChild(el('option', { value: key, text: TERM_TYPES[key].label, title: TERM_TYPES[key].hint }));
  });
  termSel.value = briefTermType(entry.termType);
  termWrap.appendChild(termSel);
  grid.appendChild(termWrap);

  var endId = opts.idPrefix + '-termEnds';
  var endWrap = el('div', {}, [ el('label', { for: endId, text: 'Runs until' }) ]);
  var endInput = el('input', { type: 'date', id: endId });
  endInput.value = briefString(entry.termEnds);
  endInput.addEventListener('input', function(){ entry.termEnds = endInput.value; opts.onChange(); });
  endWrap.appendChild(endInput);
  grid.appendChild(endWrap);

  /* A rolling term has no end date to give, so the field is not there to be
     filled in wrongly — and anything already typed is dropped with it. */
  function syncTerm(){
    var annual = briefTermType(entry.termType) === 'annual';
    endWrap.hidden = !annual;
    if (!annual && entry.termEnds) { entry.termEnds = ''; endInput.value = ''; }
  }
  termSel.addEventListener('change', function(){
    entry.termType = termSel.value;
    syncTerm();
    opts.onChange();
  });
  syncTerm();

  box.appendChild(grid);
  /* Seats or monthly changed somewhere else on the card: the suggested unit
     price is derived from both, so whoever owns those fields says when. */
  box.syncUnitPrice = function(){
    var suggested = briefUnitPrice({ seats: entry.seats, monthly: entry.monthly });
    unit.input.placeholder = suggested ? String(suggested) : '';
  };
  box.syncUnitPrice();
  return box;
}

/* Seats and monthly cost in the open, the rest of the contract behind the
   disclosure. Both forms render this identically, so both build it here. */
function toolCostFields(entry, opts){
  var frag = document.createDocumentFragment();
  var more = contractMore(entry, opts);
  function touched(){ more.syncUnitPrice(); opts.onChange(); }

  var cost = el('div', { class: 'tool__cost' });
  cost.appendChild(intakeField(entry, { id: opts.idPrefix + '-seats', key: 'seats', label: 'Seats',
                                        type: 'number', placeholder: '0', onInput: touched }));
  cost.appendChild(intakeField(entry, { id: opts.idPrefix + '-monthly', key: 'monthly',
                                        label: 'Monthly, all seats (' + opts.currency + ')',
                                        type: 'number', placeholder: '0', onInput: touched }));
  frag.appendChild(cost);
  frag.appendChild(more);
  return frag;
}

/* One off-catalog tool. Same fields as a catalogued one plus the job it does:
   a tool carrying no capability is refused by fromBrief.ts, because a licence
   the engine never weighs would quietly drop out of the savings. */
function customToolRow(entry, opts){
  var wrap = el('div', { class: 'custom-tool' });
  var more = contractMore(entry, opts);
  function touched(){ more.syncUnitPrice(); opts.onChange(); }
  function id(key){ return opts.idPrefix + '-' + key; }

  var rowA = el('div', { class: 'grid grid--2' });
  rowA.appendChild(intakeField(entry, { id: id('name'), key: 'name', label: 'Tool',
                                        placeholder: 'Google Sheets — installer rota', onInput: opts.onChange }));
  rowA.appendChild(intakeField(entry, { id: id('what'), key: 'what', label: 'What it is used for',
                                        placeholder: 'Weekly crew planning', onInput: opts.onChange }));
  wrap.appendChild(rowA);

  var rowB = el('div', { class: 'grid grid--2', style: 'margin-top:10px' });
  var capWrap = el('div', {}, [ el('label', { for: id('cap'), text: 'The job it does' }) ]);
  var capSel = el('select', { id: id('cap') });
  capOptions().forEach(function(o){ capSel.appendChild(el('option', { value: o.slug, text: o.label })); });
  capSel.value = (typeof entry.cap === 'string' && CAPS[entry.cap]) ? entry.cap : DEFAULT_CUSTOM_CAP;
  capSel.addEventListener('change', function(){ entry.cap = capSel.value; opts.onChange(); });
  capWrap.appendChild(capSel);
  rowB.appendChild(capWrap);
  rowB.appendChild(intakeField(entry, { id: id('seats'), key: 'seats', label: 'Seats',
                                        type: 'number', placeholder: '0', onInput: touched }));

  var last = el('div', { class: 'row', style: 'align-items:flex-end' });
  var costWrap = intakeField(entry, { id: id('monthly'), key: 'monthly',
                                      label: 'Monthly (' + opts.currency + ')',
                                      type: 'number', placeholder: '0', onInput: touched });
  costWrap.style.flex = '1';
  last.appendChild(costWrap);
  last.appendChild(el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Remove',
                                  onclick: opts.onRemove }));
  rowB.appendChild(last);
  wrap.appendChild(rowB);

  wrap.appendChild(evidenceControl({
    label: 'How we know what ' + (briefString(entry.name).trim() || 'this tool') + ' is used for',
    noteLabel: 'What it is actually used for',
    notePlaceholder: 'Weekly rota, 12 installers, printed on Fridays',
    kind: entry.evidenceKind, note: entry.evidenceNote,
    onKind: function(k){ entry.evidenceKind = k; opts.onChange(); },
    onNote: function(n){ entry.evidenceNote = n; opts.onChange(); }
  }));
  wrap.appendChild(more);
  return wrap;
}

/* ---------- storage handoff between the three pages ---------- */
var STORE_KEY = 'mercatify.case.v1';
function saveCase(obj){
  try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); return true; }
  catch (e) { return false; }
}
function loadCase(){
  try { var raw = localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}

/* ---------- money model — one pure function, recomputable by hand ---------- */
function computeTotals(data){
  var tools = data.tools || [];
  var a = data.assumptions || {};
  var monthlyNow = tools.reduce(function(s, t){ return s + (Number(t.monthly) || 0); }, 0);
  var retained   = tools.reduce(function(s, t){ return s + (Number(t.after) || 0); }, 0);
  var hosting    = Number(a.hosting) || 0;
  var monthlyAfter = retained + hosting;
  var monthlySaving = monthlyNow - monthlyAfter;
  var hours = (data.rows || []).reduce(function(s, r){ return s + (Number(r.hours) || 0); }, 0);
  var rate = Number(a.rate) || 0;
  var oneOff = hours * rate;
  var annualSaving = monthlySaving * 12;
  var breakEven = monthlySaving > 0 && oneOff > 0 ? Math.ceil(oneOff / monthlySaving) : null;
  var seats = tools.reduce(function(s, t){ return s + (Number(t.seats) || 0); }, 0);
  return { monthlyNow: monthlyNow, retained: retained, hosting: hosting, monthlyAfter: monthlyAfter,
           monthlySaving: monthlySaving, annualSaving: annualSaving, hours: hours, rate: rate,
           oneOff: oneOff, breakEven: breakEven, seats: seats };
}

/* small DOM helper */
function el(tag, attrs, children){
  var n = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function(k){
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  });
  (children || []).forEach(function(c){
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return n;
}

/* theme toggle shared by the three pages */
function initTheme(btnId){
  var btn = document.getElementById(btnId);
  var saved = null;
  try { saved = localStorage.getItem('mercatify.theme'); } catch (e) {}
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  if (!btn) return;
  btn.addEventListener('click', function(){
    var cur = document.documentElement.getAttribute('data-theme');
    if (!cur) cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('mercatify.theme', next); } catch (e) {}
  });
}

/* copy helper with a visible result on the button */
function copyText(text, btn, doneLabel){
  var label = btn ? btn.textContent : '';
  function done(ok){
    if (!btn) return;
    btn.textContent = ok ? (doneLabel || 'Copied') : 'Press Ctrl+C';
    setTimeout(function(){ btn.textContent = label; }, 1800);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function(){ done(true); }, function(){ fallback(); });
  } else { fallback(); }
  function fallback(){
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta); done(ok);
  }
}
