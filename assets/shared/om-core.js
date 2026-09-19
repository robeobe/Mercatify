/* Mercatify — mocked Open Mercato surfaces: shared data, helpers and shells.
   Classic script, loaded by both apps in assets/:

     client/   what a client sees — their own requests, and nothing else
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

/* ─────────────── the client's own requests ───────────────
   A client can send more than one over time, so the portal keeps a list of refs
   and never reads the queue. Everything the client app shows is filtered
   through this list — that is what keeps one tenant out of another's data. */
var CLIENT_REFS_KEY = 'mercatify.client.refs.v1';

function readClientRefs() {
  var refs = [];
  try {
    var raw = localStorage.getItem(CLIENT_REFS_KEY);
    if (raw) refs = JSON.parse(raw) || [];
  } catch (e) { refs = []; }
  /* Earlier builds stored a single ref under another key; fold it in so a
     browser that already sent something does not lose it. */
  try {
    var legacy = localStorage.getItem(CLIENT_REF_KEY);
    if (legacy && refs.indexOf(legacy) === -1) refs.push(legacy);
  } catch (e) {}
  return refs;
}
function addClientRef(ref) {
  var refs = readClientRefs();
  if (refs.indexOf(ref) === -1) refs.unshift(ref);
  try { localStorage.setItem(CLIENT_REFS_KEY, JSON.stringify(refs)); } catch (e) {}
  try { localStorage.removeItem(CLIENT_REF_KEY); } catch (e) {}
  return refs;
}
/* The client's requests, newest first, dropping any that no longer resolve. */
function clientRequests() {
  return readClientRefs()
    .map(function (ref) { return findRequest(ref); })
    .filter(Boolean)
    .sort(function (a, b) { return String(b.ref).localeCompare(String(a.ref)); });
}
/* Strict: a ref this client does not own returns null, whatever the URL says. */
function clientRequest(ref) {
  if (!ref) return null;
  return readClientRefs().indexOf(ref) === -1 ? null : findRequest(ref);
}

/* The steps the client sees, in order, with the current one marked. Derived from the
   request rather than stored, so it cannot fall out of step with the status. */
function clientProgress(req) {
  var steps = [
    { key: 'sent', title: 'You sent your stack', done: true, when: req.received,
      body: 'We have your list of tools and what you use them for.' },
    { key: 'review', title: 'A consultant reads it',
      done: !!req.sentAt, current: !req.sentAt,
      when: null,
      body: 'Someone goes through every tool by hand. Usually two working days.' },
    { key: 'map', title: 'Your report comes back',
      done: !!req.sentAt, current: !!req.sentAt && !req.clientResponse,
      when: req.sentAt,
      body: req.sentAt ? 'Ready to read.' : 'What moves, what stays, and what it saves.' },
    { key: 'answer', title: 'You decide',
      done: !!req.clientResponse, current: false,
      when: req.clientResponse ? req.clientResponse.at : null,
      body: req.clientResponse
        ? (req.clientResponse.kind === 'accepted'
            ? 'You accepted. A consultant is putting the first step together.'
            : 'You asked for a call. Sales will be in touch.')
        : 'Accept it, or ask to talk it through with someone first.' }
  ];
  return steps;
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

/* ─────────────── patches ───────────────
   Seeded requests live in this file as constants, so a consultant's edits and
   the client's answer cannot be written back into them. Patches are a separate
   map keyed by ref, applied over both seeded and submitted requests, which
   keeps every request editable by the same code path. */
var PATCH_KEY = 'mercatify.patches.v1';
function loadPatches() {
  try { var raw = localStorage.getItem(PATCH_KEY); return raw ? (JSON.parse(raw) || {}) : {}; }
  catch (e) { return {}; }
}
function patchRequest(ref, patch) {
  var all = loadPatches();
  var cur = all[ref] || {};
  Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
  all[ref] = cur;
  try { localStorage.setItem(PATCH_KEY, JSON.stringify(all)); } catch (e) {}
  return cur;
}

function loadRequests() {
  var stored = [];
  try {
    var raw = localStorage.getItem(REQUESTS_KEY);
    if (raw) stored = JSON.parse(raw) || [];
  } catch (e) { stored = []; }
  var patches = loadPatches();
  return stored.concat(SEED_REQUESTS).map(function (r) {
    var p = patches[r.ref];
    if (!p) return r;
    var merged = {};
    Object.keys(r).forEach(function (k) { merged[k] = r[k]; });
    Object.keys(p).forEach(function (k) { merged[k] = p[k]; });
    return merged;
  });
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
/* Where one capability lands. The automatic map is a first pass; a consultant
   overriding a row wins, and the row is flagged so the screen can show which
   verdicts a human stands behind and which are still the machine's. */
/* Confidence the agent claims for its own verdict. A native match is a lookup;
   something it wants built is a guess, and the report says so rather than
   presenting every row with the same certainty. */
var DEFAULT_CONFIDENCE = {
  native: 'high', configure: 'medium', build: 'low', integrate: 'medium', keep: 'high'
};
var CONFIDENCE_BANDS = ['high', 'medium', 'low'];

function capTarget(req, cap) {
  var ov = (req.overrides || {})[cap];
  var auto = CAP_MAP[cap] || { module: '__build', status: 'build' };
  var status = (ov && ov.status) || auto.status;
  return {
    module: (ov && ov.module) || auto.module,
    status: status,
    edited: !!ov,
    note: (ov && ov.note) || '',
    conf: (ov && ov.conf) || DEFAULT_CONFIDENCE[status] || 'medium',
    /* Hours are never guessed. Blank means nobody has estimated it yet, and
       the report prints that instead of a zero that reads like "free". */
    hours: ov && ov.hours !== undefined && ov.hours !== '' ? Number(ov.hours) : null
  };
}
function setCapOverride(req, cap, patch) {
  var overrides = {};
  Object.keys(req.overrides || {}).forEach(function (k) { overrides[k] = req.overrides[k]; });
  if (patch === null) delete overrides[cap];
  else {
    var cur = overrides[cap] || {};
    var next = { module: cur.module, status: cur.status, note: cur.note,
                 conf: cur.conf, hours: cur.hours };
    Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
    overrides[cap] = next;
  }
  req.overrides = overrides;
  patchRequest(req.ref, { overrides: overrides });
  return req;
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
    var target = capTarget(req, c);
    return {
      cap: c,
      label: (typeof capLabel === 'function' ? capLabel(c) : c),
      tools: map[c].tools,
      duplicate: map[c].tools.length > 1,
      module: target.module,
      status: target.status,
      edited: target.edited,
      note: target.note,
      conf: target.conf,
      hours: target.hours
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
  var raw = Math.round(Number(n) || 0);
  /* The sign belongs in front of the whole amount, not between the symbol and
     the digits — the cash curve is full of negative numbers. */
  var sign = raw < 0 ? '−' : '';
  var v = Math.abs(raw).toLocaleString('en-US');
  return currency === 'PLN' ? sign + v + ' ' + sym : sign + sym + v;
}

/* ─────────────── request lifecycle ───────────────
   One vocabulary for both apps, so a status never reads differently on the two
   sides of the same request. */
var REQUEST_STATUS = {
  new:      { label: 'new',            client: 'received',        badge: 'badge--info' },
  mapping:  { label: 'in mapping',     client: 'in review',       badge: 'badge--warning' },
  mapped:   { label: 'mapped',         client: 'in review',       badge: 'badge--success' },
  sent:     { label: 'report sent',    client: 'your report is ready', badge: 'badge--info' },
  accepted: { label: 'accepted',       client: 'accepted',        badge: 'badge--success' },
  consult:  { label: 'consult asked',  client: 'consultation asked', badge: 'badge--warning' }
};
function statusLabel(req, side) {
  var m = REQUEST_STATUS[req.status];
  if (!m) return req.status;
  return side === 'client' ? m.client : m.label;
}
function statusBadge(req) {
  var m = REQUEST_STATUS[req.status];
  return 'badge ' + (m ? m.badge : '');
}
function today() { return new Date().toISOString().slice(0, 10); }

/* ─────────────── what you can do to a request ───────────────
   The two verbs, mapping and reporting, are not available at the same time and
   never were — showing both on every row invited sending a report on a mapping
   nobody had confirmed. One rule, read by the queue, the mapping screen and the
   report screen alike:

     new       mapping has not started      -> map, no report
     mapping   open, being corrected        -> keep mapping; report is locked
     mapped    closed by a consultant       -> report; mapping reopens on request
     sent      the client has it            -> report; remapping is deliberate
     accepted  the client answered          -> report is read-only history
     consult   the client wants a call      -> same

   `mapped` is the gate: a report can only be built from a mapping somebody
   confirmed, which is also what gives the consultant something to confirm. */
function mappingOpen(req) {
  return req.status === 'new' || req.status === 'mapping';
}
function mappingStarted(req) {
  return req.status !== 'new';
}
function canReport(req) {
  return req.status === 'mapped' || req.status === 'sent' ||
         req.status === 'accepted' || req.status === 'consult';
}
function isSent(req) { return !!req.sentAt; }

function startMapping(req) {
  if (req.status !== 'new') return req;
  req.status = 'mapping';
  patchRequest(req.ref, { status: 'mapping' });
  return req;
}
function confirmMapping(req) {
  if (!mappingOpen(req)) return req;
  req.status = 'mapped';
  req.mappedAt = today();
  patchRequest(req.ref, { status: 'mapped', mappedAt: req.mappedAt });
  return req;
}
/* Reopening a sent report does not un-send it: the client keeps the version
   they were given until a new one is sent on purpose. */
function reopenMapping(req) {
  req.status = 'mapping';
  patchRequest(req.ref, { status: 'mapping' });
  return req;
}

/* The one action a queue row should offer, plus anything secondary. Keeping
   this here means the row, the mapping screen and the report screen cannot
   disagree about what is possible next. */
function requestActions(req) {
  var mapHref = 'modules.html?ref=' + encodeURIComponent(req.ref);
  var reportHref = 'report.html?ref=' + encodeURIComponent(req.ref);
  switch (req.status) {
    case 'new':
      return [{ label: 'Map', href: mapHref, primary: true }];
    case 'mapping':
      return [{ label: 'Continue mapping', href: mapHref, primary: true }];
    case 'mapped':
      return [
        { label: 'Build report', href: reportHref, primary: true },
        { label: 'Mapping', href: mapHref }
      ];
    default:
      return [{ label: 'Report', href: reportHref, primary: true }];
  }
}

/* ─────────────── the offer ───────────────
   Derived from the mapping as it stands, overrides included, so a consultant's
   edit shows up in the report without a separate "regenerate" step.

   The money model is deliberately narrow: a tool is a candidate to retire only
   when EVERY job it carries lands natively or by configuration. Anything with
   a build/integrate/keep row still has a reason to exist, so counting its
   licence as saved would be a lie — and a tool that stays keeps costing what
   it costs, which is what "licences after" is made of. */
function buildOffer(req) {
  var caps = requestCaps(req);
  var counts = statusCounts(caps);
  var byCap = {};
  caps.forEach(function (c) { byCap[c.cap] = c; });
  var a = (req.report && req.report.assumptions) || {};

  var retire = [], stays = [];
  (req.tools || []).forEach(function (t) {
    var rows = (t.caps || []).map(function (c) { return byCap[c]; }).filter(Boolean);
    var covered = rows.length > 0 && rows.every(function (r) {
      return r.status === 'native' || r.status === 'configure';
    });
    var entry = {
      name: t.name, monthly: Number(t.monthly) || 0, seats: Number(t.seats) || 0,
      rows: rows,
      reasons: rows.filter(function (r) { return r.status !== 'native' && r.status !== 'configure'; })
    };
    (covered ? retire : stays).push(entry);
  });

  var monthlyNow = requestMonthly(req);
  var monthlyRetire = retire.reduce(function (s, t) { return s + t.monthly; }, 0);
  var retained = stays.reduce(function (s, t) { return s + t.monthly; }, 0);
  var hosting = Number(a.hosting) || 0;
  var monthlyAfter = retained + hosting;
  var monthlySaving = monthlyNow - monthlyAfter;

  var buildRows = caps.filter(function (c) { return c.status === 'build'; });
  var estimated = buildRows.filter(function (c) { return c.hours !== null; });
  var hours = estimated.reduce(function (s, c) { return s + c.hours; }, 0);
  var rate = Number(a.rate) || 0;
  var oneOff = hours * rate;
  var breakEven = monthlySaving > 0 && oneOff > 0 ? Math.ceil(oneOff / monthlySaving) : null;

  var modules = requestModules(req).filter(function (m) { return m.module.id.indexOf('__') !== 0; });
  var covers = counts.native + counts.configure;

  return {
    ref: req.ref, company: req.company, industry: req.industry, people: req.people,
    currency: req.currency,
    generatedAt: (req.report && req.report.generatedAt) || today(),
    headline: (req.report && req.report.headline) || '',
    notes: (req.report && req.report.notes) || '',
    analyst: a.analyst || '',
    openQuestions: a.notes || '',
    months: Number(a.months) || 3,
    pains: req.pains, mustKeep: req.mustKeep,
    caps: caps, counts: counts, modules: modules,
    retire: retire, stays: stays,
    seats: requestSeats(req),
    monthlyNow: monthlyNow, retained: retained, hosting: hosting,
    monthlyAfter: monthlyAfter, monthlySaving: monthlySaving,
    annualSaving: monthlySaving * 12,
    monthlyRetire: monthlyRetire,
    hours: hours, rate: rate, oneOff: oneOff, breakEven: breakEven,
    buildRows: buildRows, unestimated: buildRows.length - estimated.length,
    duplicates: caps.filter(function (c) { return c.duplicate; }),
    covered: covers,
    lowConfidence: caps.filter(function (c) { return c.conf === 'low'; })
  };
}

/* ─────────────── the cash curve ───────────────
   Cumulative position against doing nothing, month by month. The shape is the
   argument: money goes out while the work happens, the curve turns when the
   licences start dropping off, and it crosses zero on the month the whole thing
   has paid for itself.

   The model is four lines of arithmetic and every input is on the page above it:
     · during the implementation months the one-off is paid pro rata and nothing
       is saved yet — the old licences are all still running;
     · from the month after, the monthly saving accrues.
   Implementation length is the consultant's assumption, not ours to invent. */
var CASH_HORIZON = 24;

function buildCashCurve(offer) {
  var ramp = Math.max(1, Number(offer.months) || 3);
  var perMonth = offer.oneOff / ramp;
  var points = [{ m: 0, v: 0 }];
  var v = 0;
  for (var m = 1; m <= CASH_HORIZON; m++) {
    if (m <= ramp) v -= perMonth;
    else v += offer.monthlySaving;
    points.push({ m: m, v: v });
  }
  var lows = points.map(function (p) { return p.v; });
  var trough = Math.min.apply(null, lows);
  var breakEven = null;
  for (var i = 1; i < points.length; i++) {
    if (points[i].v >= 0 && points[i - 1].v < 0) { breakEven = points[i].m; break; }
  }
  /* Three different shapes, and they are not the same story:
       'none'  nothing was spent, so there is nothing to pay back;
       month   the curve dipped and climbed back through zero;
       null    it never gets back inside two years — a finding, not a drawing
               problem, so the axis is not stretched until the line crosses. */
  var payback = offer.oneOff > 0 ? (breakEven || null) : 'none';
  return {
    points: points, ramp: ramp, trough: trough,
    troughMonth: points[lows.indexOf(trough)].m,
    breakEven: breakEven,
    payback: payback,
    end: points[points.length - 1].v
  };
}

function renderCashChart(offer) {
  if (!offer.oneOff && offer.monthlySaving <= 0) return null;
  var curve = buildCashCurve(offer);
  var cur = offer.currency;

  var W = 720, H = 290, L = 56, R = 700, T = 24, B = 250;
  var vals = curve.points.map(function (p) { return p.v; });
  var hi = Math.max(0, Math.max.apply(null, vals));
  var lo = Math.min(0, Math.min.apply(null, vals));

  /* Snap the axis to round money. Ticks land on multiples of 1/2/5 × 10^n, so
     zero is always one of them and the labels are numbers a reader can hold. */
  var raw = (hi - lo) / 5 || 1;
  var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
  var step = [1, 2, 5, 10].filter(function (m) { return m * mag >= raw; })[0] * mag;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  function x(m) { return L + (R - L) * (m / CASH_HORIZON); }
  function y(v) { return B - (B - T) * ((v - lo) / (hi - lo)); }

  var svgNS = 'http://www.w3.org/2000/svg';
  function sn(tag, attrs, children) {
    var n = document.createElementNS(svgNS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  var svg = sn('svg', {
    viewBox: '0 0 ' + W + ' ' + H, role: 'img',
    'aria-label': 'Cumulative net cash position over ' + CASH_HORIZON + ' months. ' +
      'Falls to ' + fmtMoney(curve.trough, cur) + ' at month ' + curve.troughMonth + '. ' +
      (curve.payback === 'none' ? 'Never goes negative — nothing was spent up front. '
        : curve.payback ? 'Crosses zero in month ' + curve.payback + '. '
        : 'Does not cross zero within ' + CASH_HORIZON + ' months. ') +
      'Ends at ' + fmtMoney(curve.end, cur) + '.'
  });

  /* the months the money is going out */
  svg.appendChild(sn('rect', {
    class: 'g-shade', x: L, y: T, width: x(curve.ramp) - L, height: B - T
  }));
  svg.appendChild(sn('text', {
    class: 'g-shade-label', x: L + 8, y: T + 14, text: 'building'
  }));

  /* grid + axis */
  var grid = sn('g', { class: 'g-grid' });
  var axis = sn('g', { class: 'g-axis' });
  for (var gv = lo; gv <= hi + step / 2; gv += step) {
    grid.appendChild(sn('line', { x1: L, y1: y(gv), x2: R, y2: y(gv) }));
    axis.appendChild(sn('text', {
      x: L - 8, y: y(gv) + 4, 'text-anchor': 'end', text: fmtMoney(gv, cur)
    }));
  }
  svg.appendChild(grid);
  svg.appendChild(sn('line', { class: 'g-zero', x1: L, y1: y(0), x2: R, y2: y(0) }));

  [0, 6, 12, 18, 24].forEach(function (m) {
    axis.appendChild(sn('text', { x: x(m), y: B + 18, 'text-anchor': 'middle', text: 'M' + m }));
  });
  svg.appendChild(axis);

  /* the curve, with a soft fill back to the zero line */
  var d = curve.points.map(function (p, i) {
    return (i ? 'L' : 'M') + x(p.m).toFixed(2) + ',' + y(p.v).toFixed(2);
  }).join(' ');
  svg.appendChild(sn('path', {
    class: 'g-area',
    d: d + ' L' + x(CASH_HORIZON).toFixed(2) + ',' + y(0).toFixed(2) +
       ' L' + x(0).toFixed(2) + ',' + y(0).toFixed(2) + ' Z'
  }));
  svg.appendChild(sn('path', { class: 'g-line', d: d }));

  /* the three moments worth naming */
  function mark(m, v, label, anchor, dy) {
    svg.appendChild(sn('circle', { class: 'g-dot', cx: x(m), cy: y(v), r: 4.5 }));
    svg.appendChild(sn('text', {
      class: 'g-note', x: x(m) + (anchor === 'end' ? -8 : 8), y: y(v) + dy,
      'text-anchor': anchor, text: label
    }));
  }
  if (curve.trough < 0) {
    /* Above the vertex, not below it: the V is open upwards and the space
       under the trough belongs to the month axis. */
    mark(curve.troughMonth, curve.trough,
         fmtMoney(curve.trough, cur) + ' — most you are ever out',
         curve.troughMonth > CASH_HORIZON * 0.6 ? 'end' : 'start', -12);
  }
  if (curve.payback && curve.payback !== 'none') {
    mark(curve.payback, 0, 'paid for itself · M' + curve.payback, 'end', -10);
  }
  mark(CASH_HORIZON, curve.end, fmtMoney(curve.end, cur), 'end', -10);

  /* hover readout, no script needed */
  var hits = sn('g', {});
  curve.points.forEach(function (p) {
    var cell = sn('rect', {
      x: x(p.m) - (R - L) / CASH_HORIZON / 2, y: T,
      width: (R - L) / CASH_HORIZON, height: B - T,
      fill: 'transparent'
    });
    cell.appendChild(sn('title', {
      text: 'Month ' + p.m + ': ' + fmtMoney(p.v, cur) +
            (p.m <= curve.ramp ? ' — still building' : '')
    }));
    hits.appendChild(cell);
  });
  svg.appendChild(hits);

  var caption;
  if (curve.payback === 'none') {
    caption = offer.monthlySaving > 0
      ? 'There is nothing to pay back — no build was costed. The saving starts in month ' +
        (curve.ramp + 1) + ' and runs at ' + fmtMoney(offer.monthlySaving, cur) + ' a month.'
      : 'Nothing to pay back, and nothing saved yet either on these numbers.';
  } else if (curve.payback) {
    caption = 'The whole move pays for itself in month ' + curve.payback + '. After that it is ' +
      fmtMoney(offer.monthlySaving, cur) + ' a month you keep.';
  } else {
    caption = 'On these numbers it does not pay for itself inside ' + CASH_HORIZON +
      ' months. Worth saying out loud before anything moves.';
  }

  return node('figure', { class: 'figure' }, [
    node('figcaption', {}, [
      node('div', { class: 'figure__title', text: 'What it looks like in cash, month by month' }),
      node('div', { class: 'figure__sub', text: caption })
    ]),
    svg
  ]);
}

/* Renders the report body. The console preview and the client's page both call
   this, so "what I am about to send" and "what they get" cannot drift. */
function renderOffer(offer) {
  var cur = offer.currency;
  var wrap = node('div', { class: 'offer' });

  function section(title, lead) {
    var s = node('div', { class: 'section' }, [node('h2', { text: title })]);
    if (lead) s.appendChild(node('p', { text: lead }));
    wrap.appendChild(s);
  }
  function table(headers, rows, cls) {
    var thead = node('thead', {}, [node('tr', {}, headers.map(function (h) {
      return node('th', { scope: 'col', class: h.num ? 'num' : '', text: h.label || h });
    }))]);
    var t = node('table', { class: cls || '' }, [thead, node('tbody', {}, rows)]);
    return node('div', { class: 'tablewrap' }, [node('div', { class: 'tablescroll' }, [t])]);
  }

  /* ── the finding, in a sentence ── */
  var headline = offer.headline || (offer.retire.length
    ? offer.retire.length + ' of your ' + (offer.retire.length + offer.stays.length) +
      ' tools can be switched off.'
    : 'Every tool in your stack earns its place — for now.');
  wrap.appendChild(node('h2', { class: 'offer__headline', text: headline }));

  var summary = 'You pay ' + fmtMoney(offer.monthlyNow, cur) + ' a month across ' +
    (offer.retire.length + offer.stays.length) + ' tools. Of the ' + offer.caps.length +
    ' things you actually do in them, ' + offer.covered +
    (offer.covered === 1 ? ' is' : ' are') + ' covered by Open Mercato' +
    (offer.retire.length ? ' — ' + offer.retire.length +
      (offer.retire.length === 1 ? ' tool is' : ' tools are') + ' covered end to end' : '') + '. ' +
    (offer.buildRows.length ? offer.buildRows.length +
      (offer.buildRows.length === 1 ? ' thing genuinely needs' : ' things genuinely need') + ' building. ' : '') +
    (offer.stays.length ? offer.stays.length +
      (offer.stays.length === 1 ? ' tool stays' : ' tools stay') + ' where it is, on purpose.' : '');
  wrap.appendChild(node('p', { class: 'offer__lede', text: summary }));

  var meta = node('div', { class: 'offer__meta' });
  [offer.generatedAt, offer.industry, offer.people ? offer.people + ' people' : '',
   offer.seats ? offer.seats + ' seats' : '',
   offer.analyst ? 'reviewed by ' + offer.analyst : 'not yet reviewed']
    .filter(Boolean).forEach(function (x) { meta.appendChild(node('span', { text: x })); });
  wrap.appendChild(meta);

  /* ── the four numbers ── */
  function kpi(k, v, s, cls) {
    return node('div', { class: 'stat ' + (cls || '') }, [
      node('div', { class: 'stat__k', text: k }),
      node('div', { class: 'stat__v', text: v }),
      node('div', { class: 'stat__s', text: s })
    ]);
  }
  wrap.appendChild(node('div', { class: 'grid grid--4', style: 'margin:20px 0 8px' }, [
    kpi('Licences today', fmtMoney(offer.monthlyNow, cur),
        'per month · ' + (offer.retire.length + offer.stays.length) + ' tools'),
    kpi('Licences after', fmtMoney(offer.monthlyAfter, cur),
        offer.hosting ? 'per month · incl. ' + fmtMoney(offer.hosting, cur) + ' hosting'
                      : 'per month · hosting not costed'),
    kpi('Net saving', fmtMoney(offer.annualSaving, cur),
        'per year · ' + offer.retire.length + (offer.retire.length === 1 ? ' tool' : ' tools') + ' switched off',
        'stat--accent'),
    kpi(offer.oneOff ? 'One-off build' : 'Build effort',
        offer.oneOff ? fmtMoney(offer.oneOff, cur) : (offer.hours ? offer.hours + ' h' : 'not estimated'),
        offer.breakEven ? offer.hours + ' h · break-even month ' + offer.breakEven
          : (offer.hours ? offer.hours + ' h · rate not entered'
             : (offer.buildRows.length ? offer.buildRows.length + ' items still to estimate' : 'nothing to build')))
  ]));

  /* ── the picture: every job, by verdict ── */
  var decided = offer.caps.length;
  if (decided) {
    var bar = node('div', { class: 'vbar' });
    var legend = node('div', { class: 'vlegend' });
    ['native', 'configure', 'integrate', 'keep', 'build'].forEach(function (k) {
      var n = offer.counts[k] || 0;
      if (!n) return;
      bar.appendChild(node('span', {
        class: 'vbar__seg vbar__seg--' + k,
        style: 'width:' + (n / decided * 100) + '%',
        title: n + ' ' + STATUS_META[k].label
      }));
      legend.appendChild(node('span', { class: 'vlegend__item' }, [
        node('i', { class: 'vbar__seg--' + k }),
        node('span', { text: n + ' ' + STATUS_META[k].label + ' — ' + STATUS_META[k].hint })
      ]));
    });
    wrap.appendChild(node('div', { style: 'margin:18px 0 4px' }, [bar, legend]));
  }

  /* ── tool by tool ── */
  section('Tool by tool',
    'One verdict per job, with the confidence behind it. A tool appears more than once when it does more than one job.');
  var rows = [];
  offer.retire.concat(offer.stays).forEach(function (t) {
    var going = offer.retire.indexOf(t) !== -1;
    t.rows.forEach(function (r, i) {
      var mod = moduleById(r.module);
      var meta2 = STATUS_META[r.status];
      rows.push(node('tr', {}, [
        node('td', {}, [
          node('div', { text: i === 0 ? t.name : '' }),
          node('div', { class: 'sub', text: r.label })
        ]),
        node('td', {}, [
          node('div', { text: r.tools.join(', ') }),
          r.note ? node('div', { class: 'sub', text: r.note }) : document.createTextNode('')
        ]),
        node('td', { text: mod.label }),
        node('td', {}, [node('span', { class: 'badge ' + meta2.badge, text: meta2.label })]),
        node('td', {}, [node('span', { class: 'sub', style: 'margin:0', text: r.conf })]),
        node('td', { class: 'num' }, [
          node('div', { text: i === 0 ? (t.monthly ? fmtMoney(t.monthly, cur) + '/mo' : '—') : '' }),
          i === 0 && going ? node('div', { class: 'sub', text: 'switched off' }) : document.createTextNode('')
        ])
      ]));
    });
  });
  wrap.appendChild(table(
    ['Tool · job', 'Paid for in', 'Open Mercato', 'Verdict', { label: 'Confidence' }, { label: 'Monthly', num: true }],
    rows));

  /* ── the duplicates ── */
  if (offer.duplicates.length) {
    section('You pay twice for these',
      'Same job, more than one invoice. This is where consolidation pays before a line of code is written.');
    wrap.appendChild(table(
      ['Job', 'Covered by', { label: 'Tools', num: true }],
      offer.duplicates.map(function (c) {
        return node('tr', {}, [
          node('td', {}, [node('strong', { text: c.label })]),
          node('td', { text: c.tools.join(', ') }),
          node('td', { class: 'num', text: String(c.tools.length) })
        ]);
      })));
  }

  /* ── the honest cost ── */
  section('What genuinely has to be built', offer.buildRows.length
    ? 'Everything else is configuration. These are the hours in the quote.'
    : 'Nothing here needs new code. Everything you use is configuration.');
  if (offer.buildRows.length) {
    var brows = offer.buildRows.map(function (c) {
      return node('tr', {}, [
        node('td', {}, [
          node('div', { text: c.label }),
          c.note ? node('div', { class: 'sub', text: c.note }) : document.createTextNode('')
        ]),
        node('td', { text: c.tools.join(', ') }),
        node('td', { text: c.conf }),
        node('td', { class: 'num', text: c.hours === null ? 'to estimate' : c.hours + ' h' }),
        node('td', { class: 'num', text: c.hours !== null && offer.rate ? fmtMoney(c.hours * offer.rate, cur) : '—' })
      ]);
    });
    brows.push(node('tr', { class: 'tot' }, [
      node('td', { text: 'Total' }), node('td', {}), node('td', {}),
      node('td', { class: 'num', text: offer.hours + ' h' }),
      node('td', { class: 'num', text: offer.rate ? fmtMoney(offer.oneOff, cur) : '—' })
    ]));
    wrap.appendChild(table(
      ['What', 'Replaces', 'Confidence', { label: 'Hours', num: true }, { label: 'Cost', num: true }],
      brows, 'lines'));
    if (offer.unestimated) {
      wrap.appendChild(node('p', { class: 'small muted', style: 'margin-top:8px',
        text: offer.unestimated + (offer.unestimated === 1 ? ' item has' : ' items have') +
              ' no estimate yet, so the total above is a floor, not a quote.' }));
    }
  }

  /* ── the arithmetic, line by line ── */
  section('What it costs, what it returns',
    'Computed from the numbers you gave us. Every line can be recomputed by hand in the room.');
  var lines = [];
  function line(k, basis, val, cls) {
    lines.push(node('tr', { class: cls || '' }, [
      node('td', { text: k }),
      node('td', {}, [node('span', { class: 'sub', style: 'margin:0', text: basis })]),
      node('td', { class: 'num', text: val })
    ]));
  }
  line('Licences today', (offer.retire.length + offer.stays.length) + ' tools as invoiced',
       fmtMoney(offer.monthlyNow, cur) + '/mo');
  line('Switched off', offer.retire.map(function (t) { return t.name; }).join(', ') || 'none',
       fmtMoney(-offer.monthlyRetire, cur) + '/mo');
  line('Licences retained', offer.stays.map(function (t) { return t.name; }).join(', ') || 'none',
       fmtMoney(offer.retained, cur) + '/mo');
  line('Hosting & ops', offer.hosting ? 'estimate from us' : 'not entered',
       fmtMoney(offer.hosting, cur) + '/mo');
  line('Monthly after', 'retained + hosting', fmtMoney(offer.monthlyAfter, cur) + '/mo');
  line('Monthly saving', 'today − after', fmtMoney(offer.monthlySaving, cur) + '/mo');
  line('Annual saving', 'monthly saving × 12', fmtMoney(offer.annualSaving, cur) + '/yr', 'tot');
  if (offer.rate) {
    line('One-off build', offer.hours + ' h × ' + fmtMoney(offer.rate, cur) + '/h', fmtMoney(offer.oneOff, cur));
    line('Break-even', offer.breakEven ? 'one-off ÷ monthly saving' : 'no saving to pay it back',
         offer.breakEven ? 'month ' + offer.breakEven : '—', 'tot');
  }
  wrap.appendChild(table(['Line', 'Basis', { label: 'Amount', num: true }], lines, 'lines'));

  var chart = renderCashChart(offer);
  if (chart) wrap.appendChild(chart);

  /* ── what they told us ── */
  if (offer.pains || offer.mustKeep) {
    section('In your own words');
    var c = node('div', { class: 'card' });
    if (offer.pains) {
      c.appendChild(node('h3', { text: 'What hurts today' }));
      c.appendChild(node('p', { class: 'offer__quote', text: offer.pains }));
    }
    if (offer.mustKeep) {
      c.appendChild(node('h3', { text: 'What must not be touched', style: 'margin-top:12px' }));
      c.appendChild(node('p', { class: 'offer__quote', text: offer.mustKeep }));
    }
    wrap.appendChild(c);
  }

  /* ── where we are unsure ── */
  section('What we are not sure about',
    'Confidence is a band, not a decimal. Anything marked low is a conversation, not a commitment.');
  var ul = node('ul', { class: 'offer__unsure' });
  (offer.openQuestions || '').split('\n').filter(Boolean).forEach(function (n) {
    ul.appendChild(node('li', { text: n }));
  });
  offer.lowConfidence.forEach(function (c) {
    ul.appendChild(node('li', { text: c.label + ' — low confidence' + (c.note ? ': ' + c.note : '') }));
  });
  if (offer.unestimated) {
    ul.appendChild(node('li', { text: offer.unestimated + ' of the items to build have no hour estimate yet.' }));
  }
  if (!ul.childNodes.length) ul.appendChild(node('li', { text: 'No open questions recorded.' }));
  wrap.appendChild(node('div', { class: 'card' }, [ul]));

  /* ── the one thing to do next ── */
  var first = offer.retire.slice().sort(function (a, b) { return b.monthly - a.monthly; })[0];
  section('The first piece worth cutting');
  wrap.appendChild(node('div', { class: 'card' }, [
    node('p', { class: 'offer__quote', text: first
      ? first.name + ' — ' + (first.monthly
          ? fmtMoney(first.monthly, cur) + ' a month, ' + fmtMoney(first.monthly * 12, cur) + ' a year'
          : 'no cost on file') +
        '. Everything it does is already covered. We never propose replacing a stack; we name one piece, then the next.'
      : 'Nothing is cancellable on the current verdicts — worth talking through before anything moves.' })
  ]));

  if (offer.notes) {
    section('From the consultant who read this');
    wrap.appendChild(node('div', { class: 'card' }, [node('p', { class: 'offer__notes', text: offer.notes })]));
  }

  return wrap;
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
  opts = opts || {};
  var user = currentUser('client');
  /* One link, and only once there is something to come back to. An empty
     "My requests" would be a dead end on a first visit. */
  var nav = readClientRefs().length
    ? '<a class="portal__link' + (opts.active === 'requests' ? ' is-on' : '') +
      '" href="requests.html">My requests</a>'
    : '';
  var shell = document.getElementById('shell');
  shell.className = 'portal';
  shell.innerHTML =
    '<header class="portal__bar">' +
      '<div class="portal__inner">' +
        '<a class="portal__brand" href="' + (readClientRefs().length ? 'requests.html' : 'intake.html') + '">' +
          '<span class="om-mark" aria-hidden="true">M</span>' +
          '<span><span class="sidebar__name">Mercatify</span>' +
          '<span class="sidebar__tenant">' + DEMO_TENANT.name + '</span></span>' +
        '</a>' +
        nav +
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
