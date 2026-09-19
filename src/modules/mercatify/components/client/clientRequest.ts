import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { formatCurrency, formatDate } from '@open-mercato/ui/utils/format'
import { capabilityLabel, findCatalogTool } from '../../data/saas-catalog'

/**
 * Shared vocabulary for the three client-facing screens, kept in one place so a
 * status never reads differently on the tile, the detail page and the report.
 */

export type ClientCaseStatus = 'draft' | 'new' | 'mapping' | 'mapped' | 'sent' | 'accepted' | 'consult'

export type ClientTool = {
  name: string
  seats?: number | null
  monthlyCost?: number | null
  selectedModuleIds?: string[] | null
  customUse?: string | null
  catalogToolId?: string | null
}

export type ClientCase = {
  id: string
  title?: string | null
  companyName?: string | null
  industry?: string | null
  peopleCount?: number | null
  currency?: string | null
  pains?: string | null
  mustKeep?: string | null
  status?: string | null
  submittedAt?: string | null
  updatedAt?: string | null
  tools?: ClientTool[] | null
}

export const CLIENT_STATUS_LABEL_KEYS: Record<ClientCaseStatus, string> = {
  draft: 'mercatify.client.status.draft',
  new: 'mercatify.client.status.received',
  mapping: 'mercatify.client.status.inReview',
  mapped: 'mercatify.client.status.inReview',
  sent: 'mercatify.client.status.reportReady',
  accepted: 'mercatify.client.status.accepted',
  consult: 'mercatify.client.status.consult',
}

export const CLIENT_STATUS_FALLBACKS: Record<ClientCaseStatus, string> = {
  draft: 'draft',
  new: 'received',
  mapping: 'in review',
  mapped: 'in review',
  sent: 'your report is ready',
  accepted: 'accepted',
  consult: 'consultation asked',
}

/** Badge colours copied from `REQUEST_STATUS` in `assets/shared/om-core.js`. */
export const CLIENT_STATUS_VARIANTS: Record<ClientCaseStatus, StatusBadgeVariant> = {
  draft: 'neutral',
  new: 'info',
  mapping: 'warning',
  mapped: 'success',
  sent: 'info',
  accepted: 'success',
  consult: 'warning',
}

export function isClientStatus(value: string): value is ClientCaseStatus {
  return value in CLIENT_STATUS_LABEL_KEYS
}

/** `REQ-` + the first four hex characters of the case id, as everywhere else. */
export function requestRef(id: string): string {
  return `REQ-${id.replace(/[^0-9a-f]/gi, '').slice(0, 4).toUpperCase()}`
}

export function monthlyTotal(tools: ClientTool[] | null | undefined): number {
  return (tools ?? []).reduce((sum, tool) => sum + (Number(tool.monthlyCost) || 0), 0)
}

export function money(value: number | null | undefined, currency: string | null | undefined): string {
  return formatCurrency(value ?? 0, currency ?? 'EUR') ?? '—'
}

export function shortDate(value: string | null | undefined): string {
  return formatDate(value ?? null) ?? '—'
}

function humanizeId(id: string): string {
  const tail = id.includes('.') ? id.slice(id.lastIndexOf('.') + 1) : id
  const words = tail.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * What the client picked for a tool, in words. The stored ids are catalog
 * *module* ids, so the catalog is the first place to look; a capability slug or
 * a bare id is turned into something readable rather than shown raw.
 */
export function toolUseLabels(tool: ClientTool): string {
  const custom = tool.customUse?.trim()
  const ids = tool.selectedModuleIds ?? []
  if (!ids.length) return custom || '—'
  const catalog = tool.catalogToolId ? findCatalogTool(tool.catalogToolId) : undefined
  const labels = ids.map((id) => {
    const mod = catalog?.modules.find((m) => m.id === id)
    if (mod) return mod.name
    const cap = capabilityLabel(id)
    return cap === id ? humanizeId(id) : cap
  })
  const joined = labels.join(', ')
  return custom ? `${joined}, ${custom}` : joined
}
