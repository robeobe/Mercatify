/* Mercatify — mocked Open Mercato surfaces: shared data, helpers and shells.
   Classic script, loaded by both apps in assets/:

     client/   what Ola sees — her own request form, and nothing else
     console/  what Mercatify sees — every request that came in, and the mapping

   They are separate products sharing one design system and one capability
   vocabulary, exactly as the portal and the backend do in Open Mercato.
   Nothing is sent anywhere; the "server" is localStorage. */

/* ─────────────── fake sessions ───────────────
   One key per app. A client signing in must never look like staff to the
   console, so the two sessions cannot share storage. */
var SESSION_KEYS = {
  client: 'mercatify.session.client.v1',
  console: 'mercatify.session.console.v1'
};
var REQUESTS_KEY = 'mercatify.requests.v1';
/* The one request this browser's client sent. The client app reads only this
   ref — it can never list the queue, which is what keeps the two apps apart. */
var CLIENT_REF_KEY = 'mercatify.client.ref.v1';

var DEMO_TENANT = { id: 'voltix', name: 'Voltix Energy' };
var CONSOLE_ORG = 'Mercatify — consulting';

function readSession(app) {
  try { var raw = localStorage.getItem(SESSION_KEYS[app]); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}
function writeSession(app, s) {
  try { localStorage.setItem(SESSION_KEYS[app], JSON.stringify(s)); } catch (e) {}
}
function clearSession(app) {
  try { localStorage.removeItem(SESSION_KEYS[app]); } catch (e) {}
}
var FALLBACK_USER = {
  client: { email: 'ola@voltix.example', name: 'Ola', role: 'Client' },
  console: { email: 'ops@mercatify.io', name: 'Mercatify ops', role: 'Consultant' }
};
/* Pages behind a login read the session, but a missing one never blocks the
   demo — a reviewer opening a page straight from disk still sees a full screen
   rather than a redirect loop. */
function currentUser(app) {
  var s = readSession(app);
  return s && s.email ? s : FALLBACK_USER[app];
}

/* ─────────────── the client's own request ─────────────── */
function readClientRef() {
  try { return localStorage.getItem(CLIENT_REF_KEY); } catch (e) { return null; }
}
function writeClientRef(ref) {
  try { localStorage.setItem(CLIENT_REF_KEY, ref); } catch (e) {}
}
function clearClientRef() {
  try { localStorage.removeItem(CLIENT_REF_KEY); } catch (e) {}
}
function initials(name) {
  return (name || '?').split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
}

/* ─────────────── Open Mercato modules ───────────────
   Every id below is a real module folder in @open-mercato/core (or the named
   feature package). Where nothing covers a job we say so instead of inventing
   a module — that honesty is the point of the mapping. */
var OM_MODULES = [
  { id: 'customers',           label: 'Customers',            group: 'Sales',           blurb: 'Contacts, companies, deals, pipelines' },
  { id: 'sales',               label: 'Sales',                group: 'Sales',           blurb: 'Quotes, orders, invoices' },
  { id: 'checkout',            label: 'Checkout',             group: 'Sales',           blurb: 'Cart, checkout sessions' },
  { id: 'payment_gateways',    label: 'Payment gateways',     group: 'Sales',           blurb: 'Providers, captures, refunds' },
  { id: 'customer_accounts',   label: 'Customer accounts',    group: 'Sales',           blurb: 'B2B company accounts and roles' },
  { id: 'portal',              label: 'Portal',               group: 'Sales',           blurb: 'Customer self-service front end' },
  { id: 'catalog',             label: 'Catalog',              group: 'Catalog & stock', blurb: 'Products, variants, price lists' },
  { id: 'wms',                 label: 'WMS',                  group: 'Catalog & stock', blurb: 'Stock, warehouses, receipts' },
  { id: 'shipping_carriers',   label: 'Shipping carriers',    group: 'Catalog & stock', blurb: 'Rates, labels, tracking' },
  { id: 'devices',             label: 'Devices',              group: 'Catalog & stock', blurb: 'Scanners and terminals' },
  { id: 'inbox_ops',           label: 'Inbox ops',            group: 'Service',         blurb: 'Shared inbox, tickets, routing' },
  { id: 'messages',            label: 'Messages',             group: 'Service',         blurb: 'Threads, templates, email sync' },
  { id: 'communication_channels', label: 'Communication channels', group: 'Service',    blurb: 'Chat, email and channel wiring' },
  { id: 'warranty_claims',     label: 'Warranty claims',      group: 'Service',         blurb: 'Claims, RMA, resolutions' },
  { id: 'planner',             label: 'Planner',              group: 'Operations',      blurb: 'Availability, scheduling, tasks' },
  { id: 'staff',               label: 'Staff',                group: 'Operations',      blurb: 'People, shifts, time entries' },
  { id: 'workflows',           label: 'Workflows',            group: 'Operations',      blurb: 'Durable processes and user tasks' },
  { id: 'business_rules',      label: 'Business rules',       group: 'Operations',      blurb: 'Conditions and automated actions' },
  { id: 'entities',            label: 'Entities',             group: 'Platform',        blurb: 'Custom entities, fields, registers' },
  { id: 'attachments',         label: 'Attachments',          group: 'Platform',        blurb: 'Files and documents on records' },
  { id: 'dashboards',          label: 'Dashboards',           group: 'Platform',        blurb: 'Widgets, reports, KPIs' },
  { id: 'query_index',         label: 'Query index',          group: 'Platform',        blurb: 'Maintained read models, segments' },
  { id: 'notifications',       label: 'Notifications',        group: 'Platform',        blurb: 'Email, SMS and push delivery' },
  { id: 'widgets',             label: 'Widgets',              group: 'Platform',        blurb: 'Internal views and panels' },
  { id: 'data_sync',           label: 'Data sync',            group: 'Platform',        blurb: 'Imports, exports, reconciliation' },
  { id: 'integrations',        label: 'Integrations',         group: 'Platform',        blurb: 'Providers, credentials, health' },
  { id: 'content',             label: 'Content',              group: 'Platform',        blurb: 'Pages, articles, templates' },
  { id: 'currencies',          label: 'Currencies',           group: 'Platform',        blurb: 'Money, rates, rounding' }
];

/* Pseudo-targets for jobs no module owns. Rendered like modules so a reviewer
   sees where the work actually lands, not a blank cell. */
var OM_OUTSIDE = {
  build:     { id: '__build',     label: 'No module yet — build',  group: 'Not covered', blurb: 'Genuinely new: goes on the estimate' },
  integrate: { id: '__integrate', label: 'Stays external — wire in', group: 'Not covered', blurb: 'Kept where it is, connected by API' },
  keep:      { id: '__keep',      label: 'Not our business — keep', group: 'Not covered', blurb: 'Out of scope by recommendation' }
};

/* capability slug → where it lands. Slugs are the ones from
   ../stack-tool/catalog.js, so the intake and this map speak one vocabulary. */
var CAP_MAP = {
  'crm.contacts':            { module: 'customers',    status: 'native' },
  'crm.pipeline':            { module: 'customers',    status: 'native' },
  'crm.email':               { module: 'messages',     status: 'configure' },
  'sales.forecast':          { module: 'dashboards',   status: 'configure' },
  'marketing.email':         { module: '__integrate',  status: 'integrate' },
  'marketing.automation':    { module: 'business_rules', status: 'configure' },
  'marketing.forms':         { module: 'entities',     status: 'configure' },
  'marketing.segments':      { module: 'query_index',  status: 'configure' },
  'marketing.sms':           { module: 'notifications', status: 'configure' },
  'quotes.cpq':              { module: 'sales',        status: 'native' },
  'docs.templates':          { module: 'content',      status: 'configure' },
  'docs.analytics':          { module: '__build',      status: 'build' },
  'esignature':              { module: '__integrate',  status: 'integrate' },
  'workflow.approvals':      { module: 'workflows',    status: 'native' },
  'workflow.automation':     { module: 'business_rules', status: 'native' },
  'integration.ipaas':       { module: 'data_sync',    status: 'configure' },
  'catalog.products':        { module: 'catalog',      status: 'native' },
  'pricing.pricelists':      { module: 'catalog',      status: 'native' },
  'b2b.accounts':            { module: 'customer_accounts', status: 'native' },
  'ecommerce.storefront':    { module: '__integrate',  status: 'integrate' },
  'ecommerce.cart':          { module: 'checkout',     status: 'native' },
  'orders.mgmt':             { module: 'sales',        status: 'native' },
  'fulfillment.shipping':    { module: 'shipping_carriers', status: 'native' },
  'inventory.stock':         { module: 'wms',          status: 'native' },
  'inventory.multiwarehouse':{ module: 'wms',          status: 'native' },
  'inventory.barcode':       { module: 'devices',      status: 'configure' },
  'inventory.alerts':        { module: 'notifications', status: 'configure' },
  'purchasing.po':           { module: 'wms',          status: 'configure' },
  'support.tickets':         { module: 'inbox_ops',    status: 'native' },
  'support.sla':             { module: 'inbox_ops',    status: 'configure' },
  'support.kb':              { module: 'content',      status: 'configure' },
  'support.chat':            { module: 'communication_channels', status: 'configure' },
  'support.voice':           { module: '__integrate',  status: 'integrate' },
  'onboarding.tours':        { module: '__build',      status: 'build' },
  'projects.tasks':          { module: 'planner',      status: 'configure' },
  'field.scheduling':        { module: 'planner',      status: 'configure' },
  'field.jobsheets':         { module: '__build',      status: 'build' },
  'time.tracking':           { module: 'staff',        status: 'configure' },
  'customer.portal':         { module: 'portal',       status: 'native' },
  'forms.intake':            { module: 'entities',     status: 'configure' },
  'data.custom':             { module: 'entities',     status: 'native' },
  'internal.apps':           { module: 'widgets',      status: 'configure' },
  'files.docs':              { module: 'attachments',  status: 'native' },
  'reporting.dashboards':    { module: 'dashboards',   status: 'native' },
  'payments':                { module: 'payment_gateways', status: 'native' },
  'billing.subscriptions':   { module: '__build',      status: 'build' },
  'invoicing':               { module: 'sales',        status: 'native' },
  'tax.calc':                { module: 'sales',        status: 'configure' },
  'accounting.ledger':       { module: '__keep',       status: 'keep' },
  'accounting.expenses':     { module: '__keep',       status: 'keep' },
  'accounting.bank':         { module: '__keep',       status: 'keep' },
  'accounting.reports':      { module: '__keep',       status: 'keep' },
  'hr.payroll':              { module: '__keep',       status: 'keep' },
  'cms.website':             { module: 'content',      status: 'configure' }
};

var STATUS_META = {
  native:    { label: 'native',    badge: 'badge--success', hint: 'already in the platform' },
  configure: { label: 'configure', badge: 'badge--info',    hint: 'in the platform, needs setting up' },
  build:     { label: 'build',     badge: 'badge--warning', hint: 'new work — goes on the estimate' },
  integrate: { label: 'integrate', badge: 'badge--outline', hint: 'stays external, wired in' },
  keep:      { label: 'keep',      badge: 'badge--outline', hint: 'out of scope by recommendation' }
};

function moduleById(id) {
  for (var i = 0; i < OM_MODULES.length; i++) if (OM_MODULES[i].id === id) return OM_MODULES[i];
  var keys = Object.keys(OM_OUTSIDE);
  for (var j = 0; j < keys.length; j++) if (OM_OUTSIDE[keys[j]].id === id) return OM_OUTSIDE[keys[j]];
  return { id: id, label: id, group: 'Platform', blurb: '' };
}

/* ─────────────── seeded requests ───────────────
   Three cases that came in before the demo, so the queue is never empty. */
var SEED_REQUESTS = [
  {
    ref: 'REQ-1042', company: 'Voltix Energy', industry: 'Solar installer, B2C + small B2B',
    people: 34, currency: 'EUR', received: '2026-09-17', status: 'new', owner: null,
    pains: 'Stock numbers live in three places. Quotes take a day. Nobody knows which installer holds which certificate.',
    mustKeep: 'Accounting stays with the bookkeeper. The e-signature provider is in our contracts.',
    tools: [
      { name: 'HubSpot', seats: 12, monthly: 1450, caps: ['crm.contacts', 'crm.pipeline', 'crm.email', 'quotes.cpq', 'marketing.email'] },
      { name: 'Zendesk', seats: 8, monthly: 420, caps: ['support.tickets', 'support.sla', 'support.kb'] },
      { name: 'Unleashed', seats: 6, monthly: 690, caps: ['inventory.stock', 'inventory.multiwarehouse', 'purchasing.po'] },
      { name: 'PandaDoc', seats: 10, monthly: 350, caps: ['docs.templates', 'esignature', 'docs.analytics'] },
      { name: 'Jobber', seats: 14, monthly: 560, caps: ['field.scheduling', 'field.jobsheets', 'invoicing'] },
      { name: 'Xero', seats: 4, monthly: 180, caps: ['accounting.ledger', 'accounting.bank', 'invoicing'] },
      { name: 'Airtable', seats: 20, monthly: 400, caps: ['data.custom', 'internal.apps', 'forms.intake'] },
      { name: 'Stripe Billing', seats: 3, monthly: 330, caps: ['payments', 'billing.subscriptions'] }
    ]
  },
  {
    ref: 'REQ-1041', company: 'Northwind Parts', industry: 'B2B distributor, 4 warehouses',
    people: 61, currency: 'EUR', received: '2026-09-16', status: 'mapping', owner: 'Joanna',
    pains: 'Two order systems that disagree. Price lists maintained by hand per customer.',
    mustKeep: 'Payroll stays out of scope.',
    tools: [
      { name: 'Salesforce', seats: 22, monthly: 3300, caps: ['crm.contacts', 'crm.pipeline', 'sales.forecast', 'quotes.cpq'] },
      { name: 'NetSuite (partial)', seats: 12, monthly: 2900, caps: ['orders.mgmt', 'invoicing', 'inventory.stock', 'purchasing.po'] },
      { name: 'Shopify Plus', seats: 5, monthly: 2100, caps: ['ecommerce.storefront', 'ecommerce.cart', 'catalog.products', 'pricing.pricelists', 'inventory.stock', 'orders.mgmt'] },
      { name: 'ShipStation', seats: 6, monthly: 240, caps: ['fulfillment.shipping'] },
      { name: 'Intercom', seats: 9, monthly: 640, caps: ['support.chat', 'support.tickets', 'onboarding.tours'] },
      { name: 'Zapier', seats: 2, monthly: 290, caps: ['integration.ipaas', 'workflow.automation'] }
    ]
  },
  {
    ref: 'REQ-1039', company: 'Casa Verde', industry: 'Garden retail, 7 stores + online',
    people: 88, currency: 'PLN', received: '2026-09-12', status: 'mapped', owner: 'Rob',
    pains: 'Loyalty data is stranded in the POS. Stock per store is a guess after 4pm.',
    mustKeep: 'The POS terminals stay for now.',
    tools: [
      { name: 'Pipedrive', seats: 7, monthly: 1400, caps: ['crm.contacts', 'crm.pipeline'] },
      { name: 'Klaviyo', seats: 3, monthly: 2600, caps: ['marketing.email', 'marketing.segments', 'marketing.sms', 'crm.contacts'] },
      { name: 'Cin7', seats: 11, monthly: 4300, caps: ['inventory.stock', 'inventory.barcode', 'inventory.alerts', 'catalog.products'] },
      { name: 'Freshdesk', seats: 12, monthly: 1900, caps: ['support.tickets', 'support.kb'] },
      { name: 'Notion', seats: 40, monthly: 1600, caps: ['projects.tasks', 'files.docs'] }
    ]
  }
];

function loadRequests() {
  var stored = [];
  try {
    var raw = localStorage.getItem(REQUESTS_KEY);
    if (raw) stored = JSON.parse(raw) || [];
  } catch (e) { stored = []; }
  return stored.concat(SEED_REQUESTS);
}
function saveRequest(req) {
  var stored = [];
  try {
    var raw = localStorage.getItem(REQUESTS_KEY);
    if (raw) stored = JSON.parse(raw) || [];
  } catch (e) { stored = []; }
  stored.unshift(req);
  try { localStorage.setItem(REQUESTS_KEY, JSON.stringify(stored)); } catch (e) {}
  return req;
}
/* Strict lookup: null when the ref is unknown. The client app must use this
   one — a fallback there would show it somebody else's request. */
function findRequest(ref) {
  var all = loadRequests();
  for (var i = 0; i < all.length; i++) if (all[i].ref === ref) return all[i];
  return null;
}
/* Console convenience: an unknown ref in the URL falls back to the newest. */
function requestByRef(ref) {
  return findRequest(ref) || loadRequests()[0] || null;
}
function nextRef() {
  var all = loadRequests();
  var max = 1042;
  all.forEach(function (r) {
    var n = parseInt(String(r.ref).replace(/\D/g, ''), 10);
    if (n > max) max = n;
  });
  return 'REQ-' + (max + 1);
}

/* ─────────────── derived numbers ─────────────── */
function requestMonthly(req) {
  return (req.tools || []).reduce(function (s, t) { return s + (Number(t.monthly) || 0); }, 0);
}
function requestSeats(req) {
  return (req.tools || []).reduce(function (s, t) { return s + (Number(t.seats) || 0); }, 0);
}
/* One row per capability: which tools pay for it today, where it lands. */
function requestCaps(req) {
  var map = {};
  (req.tools || []).forEach(function (t) {
    (t.caps || []).forEach(function (c) {
      if (!map[c]) map[c] = { cap: c, tools: [], monthly: 0 };
      map[c].tools.push(t.name);
      map[c].monthly += Number(t.monthly) || 0;
    });
  });
  return Object.keys(map).map(function (c) {
    var target = CAP_MAP[c] || { module: '__build', status: 'build' };
    return {
      cap: c,
      label: (typeof capLabel === 'function' ? capLabel(c) : c),
      tools: map[c].tools,
      duplicate: map[c].tools.length > 1,
      module: target.module,
      status: target.status
    };
  }).sort(function (a, b) { return a.label.localeCompare(b.label); });
}
/* Module-first view: the screen that answers "which of our modules handles
   what just came in". Modules with nothing to do are left out. */
function requestModules(req) {
  var caps = requestCaps(req);
  var byModule = {};
  caps.forEach(function (c) {
    if (!byModule[c.module]) byModule[c.module] = { module: moduleById(c.module), caps: [], statuses: {} };
    byModule[c.module].caps.push(c);
    byModule[c.module].statuses[c.status] = true;
  });
  return Object.keys(byModule).map(function (id) {
    var entry = byModule[id];
    /* Worst status wins the module badge — a module that is native for three
       jobs and needs building for a fourth is not "done". */
    var order = ['build', 'integrate', 'keep', 'configure', 'native'];
    var status = 'native';
    for (var i = 0; i < order.length; i++) if (entry.statuses[order[i]]) { status = order[i]; break; }
    entry.status = status;
    entry.duplicates = entry.caps.filter(function (c) { return c.duplicate; }).length;
    return entry;
  }).sort(function (a, b) {
    if (b.caps.length !== a.caps.length) return b.caps.length - a.caps.length;
    return a.module.label.localeCompare(b.module.label);
  });
}
function statusCounts(caps) {
  var out = { native: 0, configure: 0, build: 0, integrate: 0, keep: 0 };
  caps.forEach(function (c) { out[c.status] = (out[c.status] || 0) + 1; });
  return out;
}
/* Same grouping and symbol placement as money() in ../stack-tool/catalog.js,
   so a figure does not change shape between the intake rail and the queue. */
function fmtMoney(n, currency) {
  var sym = { EUR: '€', USD: '$', GBP: '£', PLN: 'zł' }[currency || 'EUR'] || '';
  var v = Math.round(Number(n) || 0).toLocaleString('en-US');
  return currency === 'PLN' ? v + ' ' + sym : sym + v;
}

/* ─────────────── shells ───────────────
   Two shells, because they are two products. The console gets the full staff
   sidebar; the client gets a portal bar and no navigation into anyone else's
   data. Nothing in the client shell can reach the queue. */
var CONSOLE_NAV = [
  { group: 'Workspace', items: [
    { id: 'dashboard', label: 'Dashboard', href: '#', icon: 'grid' },
    { id: 'requests', label: 'Stack requests', href: 'requests.html', icon: 'inbox', badgeFrom: 'new' },
    { id: 'modules', label: 'Module coverage', href: 'modules.html', icon: 'layers' }
  ]},
  { group: 'Sales', items: [
    { id: 'customers', label: 'Customers', href: '#', icon: 'users' },
    { id: 'sales', label: 'Sales', href: '#', icon: 'receipt' },
    { id: 'catalog', label: 'Catalog', href: '#', icon: 'box' }
  ]},
  { group: 'System', items: [
    { id: 'entities', label: 'Entities', href: '#', icon: 'db' },
    { id: 'users', label: 'Users & roles', href: '#', icon: 'shield' },
    { id: 'settings', label: 'Settings', href: '#', icon: 'cog' }
  ]}
];

var ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M4.5 5h15l1.5 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/>',
  layers: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 14 9 5 9-5"/>',
  form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 8.5a3 3 0 0 1 0 5"/><path d="M18 20a6 6 0 0 0-2-4.5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  shield: '<path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>'
};

function icon(name) {
  return '<svg class="navitem__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONS[name] || '') + '</svg>';
}

/* ── Mercatify console: staff sidebar + breadcrumbs ──
   Renders into <div id="shell"> and returns the content node. Pages keep their
   own markup inside <main class="content">. */
function mountConsoleShell(opts) {
  var active = opts.active;
  var crumbs = opts.crumbs || [];
  var user = currentUser('console');
  var newCount = loadRequests().filter(function (r) { return r.status === 'new'; }).length;

  var nav = CONSOLE_NAV.map(function (g) {
    var items = g.items.map(function (it) {
      var badge = it.badgeFrom === 'new' && newCount
        ? '<span class="navitem__badge">' + newCount + '</span>' : '';
      var cur = it.id === active ? ' aria-current="page"' : '';
      return '<a class="navitem" href="' + it.href + '"' + cur + '>' + icon(it.icon) +
        '<span>' + it.label + '</span>' + badge + '</a>';
    }).join('');
    return '<div class="navgroup"><div class="navgroup__label">' + g.group + '</div>' + items + '</div>';
  }).join('');

  var trail = crumbs.map(function (c, i) {
    var last = i === crumbs.length - 1;
    var node = last
      ? '<span class="cur">' + c.label + '</span>'
      : '<a href="' + (c.href || '#') + '">' + c.label + '</a>';
    return (i ? '<span class="sep">/</span>' : '') + node;
  }).join('');

  var shell = document.getElementById('shell');
  shell.className = 'shell';
  shell.innerHTML =
    '<aside class="sidebar">' +
      '<div class="sidebar__head">' +
        '<span class="om-mark" aria-hidden="true">M</span>' +
        '<span><span class="sidebar__name">Mercatify</span>' +
        '<span class="sidebar__tenant">Consulting console</span></span>' +
      '</div>' +
      '<nav class="sidebar__nav" aria-label="Main">' + nav + '</nav>' +
      '<div class="sidebar__foot"><div class="userchip">' +
        '<span class="avatar" aria-hidden="true">' + initials(user.name) + '</span>' +
        '<span style="min-width:0"><span class="userchip__name">' + user.name + '</span>' +
        '<span class="userchip__mail">' + user.email + '</span></span>' +
        '<a class="btn btn--ghost btn--sm" style="margin-left:auto" href="login.html" ' +
        'id="om-signout" title="Sign out">Out</a>' +
      '</div></div>' +
    '</aside>' +
    '<div class="main">' +
      '<header class="topbar"><nav class="crumbs" aria-label="Breadcrumb">' + trail + '</nav>' +
        '<div class="topbar__right">' +
          '<span class="badge badge--outline">' + CONSOLE_ORG + '</span>' +
          '<button class="btn btn--ghost btn--sm" type="button" id="om-theme">Theme</button>' +
        '</div>' +
      '</header>' +
      '<main class="content" id="content"></main>' +
    '</div>';

  document.getElementById('om-signout').addEventListener('click', function () { clearSession('console'); });
  initOmTheme('om-theme');
  return document.getElementById('content');
}

/* ── Client portal: one bar, no navigation, no queue ──
   Deliberately not a sidebar. Ola has exactly one thing to do here, and the
   shell should not imply there is a workspace behind it. */
function mountPortalShell(opts) {
  var user = currentUser('client');
  var shell = document.getElementById('shell');
  shell.className = 'portal';
  shell.innerHTML =
    '<header class="portal__bar">' +
      '<div class="portal__inner">' +
        '<span class="om-mark" aria-hidden="true">M</span>' +
        '<span><span class="sidebar__name">Mercatify</span>' +
        '<span class="sidebar__tenant">' + DEMO_TENANT.name + '</span></span>' +
        '<div class="portal__right">' +
          '<span class="small muted">Signed in as ' + user.name + '</span>' +
          '<button class="btn btn--ghost btn--sm" type="button" id="om-theme">Theme</button>' +
          '<a class="btn btn--outline btn--sm" href="login.html" id="om-signout">Sign out</a>' +
        '</div>' +
      '</div>' +
    '</header>' +
    '<main class="portal__content" id="content"></main>';

  document.getElementById('om-signout').addEventListener('click', function () { clearSession('client'); });
  initOmTheme('om-theme');
  return document.getElementById('content');
}

function initOmTheme(btnId) {
  var saved = null;
  try { saved = localStorage.getItem('mercatify.theme'); } catch (e) {}
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  var btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme');
    if (!cur) cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('mercatify.theme', next); } catch (e) {}
  });
}

/* Tiny DOM helper — same shape as the one in ../stack-tool/catalog.js, kept
   here so pages that do not load the catalog still have it. */
function node(tag, attrs, children) {
  var n = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  });
  (children || []).forEach(function (c) {
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return n;
}

function qs(name) {
  var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
}
