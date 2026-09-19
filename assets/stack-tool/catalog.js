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
  'cms.website':         'Website / CMS'
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
  'no module yet — build'
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
   agent would later produce — on the mapping page they are all editable. */
const CATALOG = [
  { id:'hubspot', name:'HubSpot', kind:'CRM & marketing', modules:[
    { id:'sales',     name:'Sales Hub',            desc:'Contacts, deals, pipeline stages, email log', caps:['crm.contacts','crm.pipeline','crm.email'], om:'customers + sales', verdict:'native',    conf:'high' },
    { id:'marketing', name:'Marketing Hub',        desc:'Campaigns, lists, landing pages, lead scoring', caps:['marketing.email','marketing.automation','marketing.forms'], om:'stays external, wired in', verdict:'integrate', conf:'medium' },
    { id:'service',   name:'Service Hub',          desc:'Tickets, SLAs, knowledge base', caps:['support.tickets','support.sla','support.kb'], om:'messages + inbox_ops', verdict:'configure', conf:'medium' },
    { id:'quotes',    name:'Quotes & payments',    desc:'Quote documents and payment links', caps:['quotes.cpq','payments'], om:'sales — quotes', verdict:'native', conf:'medium' },
    { id:'cms',       name:'Content Hub',          desc:'Website, blog, landing pages', caps:['cms.website'], om:'not our business — keep it', verdict:'keep', conf:'high' },
    { id:'ops',       name:'Operations Hub',       desc:'Data sync, programmable automation', caps:['workflow.automation','integration.ipaas'], om:'business_rules + data_sync', verdict:'configure', conf:'medium' },
    { id:'reporting', name:'Custom reports',       desc:'Dashboards and attribution reports', caps:['reporting.dashboards'], om:'dashboards', verdict:'configure', conf:'medium' }
  ]},

  { id:'salesforce', name:'Salesforce', kind:'CRM suite', modules:[
    { id:'sales',    name:'Sales Cloud',           desc:'Accounts, opportunities, forecasting', caps:['crm.contacts','crm.pipeline','sales.forecast'], om:'customers + sales', verdict:'configure', conf:'medium' },
    { id:'service',  name:'Service Cloud',         desc:'Cases, omni-channel routing, SLAs', caps:['support.tickets','support.sla'], om:'messages + inbox_ops', verdict:'configure', conf:'medium' },
    { id:'cpq',      name:'CPQ',                   desc:'Product rules, price rules, quote documents', caps:['quotes.cpq','pricing.pricelists'], om:'sales — quotes', verdict:'configure', conf:'medium' },
    { id:'pardot',   name:'Account Engagement',    desc:'Nurture programmes, lead scoring', caps:['marketing.email','marketing.automation'], om:'stays external, wired in', verdict:'integrate', conf:'medium' },
    { id:'exp',      name:'Experience Cloud',      desc:'Customer and partner portal', caps:['customer.portal'], om:'portal + customer_accounts', verdict:'configure', conf:'medium' },
    { id:'field',    name:'Field Service',         desc:'Work orders, dispatch, mobile app', caps:['field.scheduling','field.jobsheets'], om:'no module yet — build', verdict:'build', conf:'low' },
    { id:'reports',  name:'Reports & dashboards',  desc:'Standard and custom reporting', caps:['reporting.dashboards'], om:'dashboards', verdict:'configure', conf:'medium' }
  ]},

  { id:'pipedrive', name:'Pipedrive', kind:'Sales CRM', modules:[
    { id:'deals',    name:'Deals & pipelines',     desc:'Stages, rotting deals, activities', caps:['crm.pipeline'], om:'sales', verdict:'native', conf:'high' },
    { id:'contacts', name:'Contacts & organisations', desc:'People, companies, custom fields', caps:['crm.contacts'], om:'customers', verdict:'native', conf:'high' },
    { id:'email',    name:'Email sync & templates', desc:'Two-way sync, sequences', caps:['crm.email'], om:'messages', verdict:'configure', conf:'medium' },
    { id:'products', name:'Products & quotes',     desc:'Product list attached to deals, quote PDFs', caps:['catalog.products','quotes.cpq'], om:'catalog + sales — quotes', verdict:'native', conf:'medium' },
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
    { id:'templates',name:'Templates & quotes',    desc:'Quote documents from a configuration', caps:['quotes.cpq','docs.templates'], om:'sales — quotes', verdict:'native', conf:'medium' },
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
    { id:'quotes',  name:'Quotes',                 desc:'On-site estimates', caps:['quotes.cpq'], om:'sales — quotes', verdict:'native', conf:'medium' },
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

function findTool(id){ return CATALOG.find(function(t){ return t.id === id; }); }
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
