/**
 * Console module-coverage lookup. Ported from assets/shared/om-core.js
 * (OM_MODULES, OM_OUTSIDE, CAP_MAP, STATUS_META) — every id here is a real
 * module folder in @open-mercato/core. Where nothing covers a capability we
 * say so (`build` / `integrate` / `keep`) instead of naming a module that
 * does not exist. Not maintained through a UI in v1 (PRD Open Question 5).
 */
import { capLabel } from './catalog'
import type { MercatifyCapOverride, MercatifyRequestTool } from '../data/entities'

export type OmModule = { id: string; label: string; group: string; blurb: string }

export const OM_MODULES: OmModule[] = [
  { id: 'customers', label: 'Customers', group: 'Sales', blurb: 'Contacts, companies, deals, pipelines' },
  { id: 'sales', label: 'Sales', group: 'Sales', blurb: 'Quotes, orders, invoices' },
  { id: 'checkout', label: 'Checkout', group: 'Sales', blurb: 'Cart, checkout sessions' },
  { id: 'payment_gateways', label: 'Payment gateways', group: 'Sales', blurb: 'Providers, captures, refunds' },
  { id: 'customer_accounts', label: 'Customer accounts', group: 'Sales', blurb: 'B2B company accounts and roles' },
  { id: 'portal', label: 'Portal', group: 'Sales', blurb: 'Customer self-service front end' },
  { id: 'catalog', label: 'Catalog', group: 'Catalog & stock', blurb: 'Products, variants, price lists' },
  { id: 'wms', label: 'WMS', group: 'Catalog & stock', blurb: 'Stock, warehouses, receipts' },
  { id: 'shipping_carriers', label: 'Shipping carriers', group: 'Catalog & stock', blurb: 'Rates, labels, tracking' },
  { id: 'devices', label: 'Devices', group: 'Catalog & stock', blurb: 'Scanners and terminals' },
  { id: 'inbox_ops', label: 'Inbox ops', group: 'Service', blurb: 'Shared inbox, tickets, routing' },
  { id: 'messages', label: 'Messages', group: 'Service', blurb: 'Threads, templates, email sync' },
  { id: 'communication_channels', label: 'Communication channels', group: 'Service', blurb: 'Chat, email and channel wiring' },
  { id: 'warranty_claims', label: 'Warranty claims', group: 'Service', blurb: 'Claims, RMA, resolutions' },
  { id: 'planner', label: 'Planner', group: 'Operations', blurb: 'Availability, scheduling, tasks' },
  { id: 'staff', label: 'Staff', group: 'Operations', blurb: 'People, shifts, time entries' },
  { id: 'workflows', label: 'Workflows', group: 'Operations', blurb: 'Durable processes and user tasks' },
  { id: 'business_rules', label: 'Business rules', group: 'Operations', blurb: 'Conditions and automated actions' },
  { id: 'entities', label: 'Entities', group: 'Platform', blurb: 'Custom entities, fields, registers' },
  { id: 'attachments', label: 'Attachments', group: 'Platform', blurb: 'Files and documents on records' },
  { id: 'dashboards', label: 'Dashboards', group: 'Platform', blurb: 'Widgets, reports, KPIs' },
  { id: 'query_index', label: 'Query index', group: 'Platform', blurb: 'Maintained read models, segments' },
  { id: 'notifications', label: 'Notifications', group: 'Platform', blurb: 'Email, SMS and push delivery' },
  { id: 'widgets', label: 'Widgets', group: 'Platform', blurb: 'Internal views and panels' },
  { id: 'data_sync', label: 'Data sync', group: 'Platform', blurb: 'Imports, exports, reconciliation' },
  { id: 'integrations', label: 'Integrations', group: 'Platform', blurb: 'Providers, credentials, health' },
  { id: 'content', label: 'Content', group: 'Platform', blurb: 'Pages, articles, templates' },
  { id: 'currencies', label: 'Currencies', group: 'Platform', blurb: 'Money, rates, rounding' },
]

export const OM_OUTSIDE: Record<string, OmModule> = {
  build: { id: '__build', label: 'No module yet — build', group: 'Not covered', blurb: 'Genuinely new: goes on the estimate' },
  integrate: { id: '__integrate', label: 'Stays external — wire in', group: 'Not covered', blurb: 'Kept where it is, connected by API' },
  keep: { id: '__keep', label: 'Not our business — keep', group: 'Not covered', blurb: 'Out of scope by recommendation' },
}

export type MappingStatus = 'native' | 'configure' | 'build' | 'integrate' | 'keep'

export const CAP_MAP: Record<string, { module: string; status: MappingStatus }> = {
  'crm.contacts': { module: 'customers', status: 'native' },
  'crm.pipeline': { module: 'customers', status: 'native' },
  'crm.email': { module: 'messages', status: 'configure' },
  'sales.forecast': { module: 'dashboards', status: 'configure' },
  'marketing.email': { module: '__integrate', status: 'integrate' },
  'marketing.automation': { module: 'business_rules', status: 'configure' },
  'marketing.forms': { module: 'entities', status: 'configure' },
  'marketing.segments': { module: 'query_index', status: 'configure' },
  'marketing.sms': { module: 'notifications', status: 'configure' },
  'quotes.cpq': { module: 'sales', status: 'native' },
  'docs.templates': { module: 'content', status: 'configure' },
  'docs.analytics': { module: '__build', status: 'build' },
  esignature: { module: '__integrate', status: 'integrate' },
  'workflow.approvals': { module: 'workflows', status: 'native' },
  'workflow.automation': { module: 'business_rules', status: 'native' },
  'integration.ipaas': { module: 'data_sync', status: 'configure' },
  'catalog.products': { module: 'catalog', status: 'native' },
  'pricing.pricelists': { module: 'catalog', status: 'native' },
  'b2b.accounts': { module: 'customer_accounts', status: 'native' },
  'ecommerce.storefront': { module: '__integrate', status: 'integrate' },
  'ecommerce.cart': { module: 'checkout', status: 'native' },
  'orders.mgmt': { module: 'sales', status: 'native' },
  'fulfillment.shipping': { module: 'shipping_carriers', status: 'native' },
  'inventory.stock': { module: 'wms', status: 'native' },
  'inventory.multiwarehouse': { module: 'wms', status: 'native' },
  'inventory.barcode': { module: 'devices', status: 'configure' },
  'inventory.alerts': { module: 'notifications', status: 'configure' },
  'purchasing.po': { module: 'wms', status: 'configure' },
  'support.tickets': { module: 'inbox_ops', status: 'native' },
  'support.sla': { module: 'inbox_ops', status: 'configure' },
  'support.kb': { module: 'content', status: 'configure' },
  'support.chat': { module: 'communication_channels', status: 'configure' },
  'support.voice': { module: '__integrate', status: 'integrate' },
  'onboarding.tours': { module: '__build', status: 'build' },
  'projects.tasks': { module: 'planner', status: 'configure' },
  'field.scheduling': { module: 'planner', status: 'configure' },
  'field.jobsheets': { module: '__build', status: 'build' },
  'time.tracking': { module: 'staff', status: 'configure' },
  'customer.portal': { module: 'portal', status: 'native' },
  'forms.intake': { module: 'entities', status: 'configure' },
  'data.custom': { module: 'entities', status: 'native' },
  'internal.apps': { module: 'widgets', status: 'configure' },
  'files.docs': { module: 'attachments', status: 'native' },
  'reporting.dashboards': { module: 'dashboards', status: 'native' },
  payments: { module: 'payment_gateways', status: 'native' },
  'billing.subscriptions': { module: '__build', status: 'build' },
  invoicing: { module: 'sales', status: 'native' },
  'tax.calc': { module: 'sales', status: 'configure' },
  'accounting.ledger': { module: '__keep', status: 'keep' },
  'accounting.expenses': { module: '__keep', status: 'keep' },
  'accounting.bank': { module: '__keep', status: 'keep' },
  'accounting.reports': { module: '__keep', status: 'keep' },
  'hr.payroll': { module: '__keep', status: 'keep' },
  'cms.website': { module: 'content', status: 'configure' },
}

export const STATUS_META: Record<MappingStatus, { label: string; hint: string }> = {
  native: { label: 'native', hint: 'already in the platform' },
  configure: { label: 'configure', hint: 'in the platform, needs setting up' },
  build: { label: 'build', hint: 'new work — goes on the estimate' },
  integrate: { label: 'integrate', hint: 'stays external, wired in' },
  keep: { label: 'keep', hint: 'out of scope by recommendation' },
}

/** Options for a module-override picker: every real module, plus the three pseudo-targets. */
export const ALL_MODULE_OPTIONS: OmModule[] = [...OM_MODULES, ...Object.values(OM_OUTSIDE)]

export function moduleById(id: string): OmModule {
  const found = OM_MODULES.find((m) => m.id === id)
  if (found) return found
  const outside = Object.values(OM_OUTSIDE).find((m) => m.id === id)
  if (outside) return outside
  return { id, label: id, group: 'Platform', blurb: '' }
}

export type ConfidenceBand = 'high' | 'medium' | 'low'
export const CONFIDENCE_BANDS: ConfidenceBand[] = ['high', 'medium', 'low']

/** Confidence the automatic lookup claims for its own verdict — a native match
 * is a lookup, something it wants built is a guess. */
export const DEFAULT_CONFIDENCE: Record<MappingStatus, ConfidenceBand> = {
  native: 'high', configure: 'medium', build: 'low', integrate: 'medium', keep: 'high',
}

export type CapTarget = {
  module: string
  status: MappingStatus
  edited: boolean
  note: string
  conf: ConfidenceBand
}

/** A consultant's override wins over the automatic CAP_MAP lookup; the row is
 * flagged `edited` so the screen shows which verdicts a human stands behind. */
export function capTarget(cap: string, overrides?: Record<string, MercatifyCapOverride> | null): CapTarget {
  const ov = overrides?.[cap]
  const auto = CAP_MAP[cap] || { module: '__build', status: 'build' as MappingStatus }
  const status = ov?.status || auto.status
  return {
    module: ov?.module || auto.module,
    status,
    edited: !!ov,
    note: ov?.note || '',
    conf: ov?.conf || DEFAULT_CONFIDENCE[status] || 'medium',
  }
}

export type RequestCapRow = {
  cap: string
  label: string
  tools: string[]
  duplicate: boolean
  module: string
  status: MappingStatus
  edited: boolean
  note: string
  conf: ConfidenceBand
}

/** One row per capability paid for in this request: who pays for it today, where it lands. */
export function requestCaps(
  tools: MercatifyRequestTool[],
  overrides?: Record<string, MercatifyCapOverride> | null,
): RequestCapRow[] {
  const byCap: Record<string, { tools: string[] }> = {}
  for (const tool of tools) {
    for (const cap of tool.caps || []) {
      byCap[cap] = byCap[cap] || { tools: [] }
      byCap[cap].tools.push(tool.name)
    }
  }
  return Object.keys(byCap)
    .map((cap) => {
      const target = capTarget(cap, overrides)
      return {
        cap,
        label: capLabel(cap),
        tools: byCap[cap].tools,
        duplicate: byCap[cap].tools.length > 1,
        ...target,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

export type RequestModuleRow = {
  module: OmModule
  caps: RequestCapRow[]
  status: MappingStatus
  duplicates: number
}

const WORST_STATUS_ORDER: MappingStatus[] = ['build', 'integrate', 'keep', 'configure', 'native']

/** Module-first view: which of our modules handles what came in. Worst status wins the badge. */
export function requestModules(
  tools: MercatifyRequestTool[],
  overrides?: Record<string, MercatifyCapOverride> | null,
): RequestModuleRow[] {
  const caps = requestCaps(tools, overrides)
  const byModule: Record<string, RequestModuleRow> = {}
  for (const cap of caps) {
    if (!byModule[cap.module]) {
      byModule[cap.module] = { module: moduleById(cap.module), caps: [], status: 'native', duplicates: 0 }
    }
    byModule[cap.module].caps.push(cap)
  }
  return Object.values(byModule)
    .map((entry) => {
      const statuses = new Set(entry.caps.map((c) => c.status))
      const status = WORST_STATUS_ORDER.find((s) => statuses.has(s)) || 'native'
      return {
        ...entry,
        status,
        duplicates: entry.caps.filter((c) => c.duplicate).length,
      }
    })
    .sort((a, b) => {
      if (b.caps.length !== a.caps.length) return b.caps.length - a.caps.length
      return a.module.label.localeCompare(b.module.label)
    })
}

export function statusCounts(caps: RequestCapRow[]): Record<MappingStatus, number> {
  const out: Record<MappingStatus, number> = { native: 0, configure: 0, build: 0, integrate: 0, keep: 0 }
  for (const c of caps) out[c.status] = (out[c.status] || 0) + 1
  return out
}

export function requestMonthly(tools: MercatifyRequestTool[]): number {
  return tools.reduce((sum, t) => sum + (Number(t.monthly) || 0), 0)
}

export function requestSeats(tools: MercatifyRequestTool[]): number {
  return tools.reduce((sum, t) => sum + (Number(t.seats) || 0), 0)
}
