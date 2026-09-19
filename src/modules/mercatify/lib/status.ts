/**
 * Request lifecycle vocabulary — one source for console and client wording,
 * ported from assets/shared/om-core.js REQUEST_STATUS so a status never reads
 * differently on the two sides of the same request.
 */
export type RequestStatus = 'new' | 'mapping' | 'mapped' | 'sent' | 'accepted' | 'consult'

export const REQUEST_STATUSES: RequestStatus[] = ['new', 'mapping', 'mapped', 'sent', 'accepted', 'consult']

type StatusMeta = { consoleLabel: string; clientLabel: string; badge: 'info' | 'warning' | 'success' }

export const REQUEST_STATUS_META: Record<RequestStatus, StatusMeta> = {
  new: { consoleLabel: 'new', clientLabel: 'received', badge: 'info' },
  mapping: { consoleLabel: 'in mapping', clientLabel: 'in review', badge: 'warning' },
  mapped: { consoleLabel: 'mapped', clientLabel: 'in review', badge: 'success' },
  sent: { consoleLabel: 'report sent', clientLabel: 'your report is ready', badge: 'info' },
  accepted: { consoleLabel: 'accepted', clientLabel: 'accepted', badge: 'success' },
  consult: { consoleLabel: 'consult asked', clientLabel: 'consultation asked', badge: 'warning' },
}

export function mappingOpen(status: RequestStatus): boolean {
  return status === 'new' || status === 'mapping'
}

/** A report is a claim about a mapping, so it needs one somebody stood behind. */
export function canReport(status: RequestStatus): boolean {
  return status === 'mapped' || status === 'sent' || status === 'accepted' || status === 'consult'
}

/** Mapping reopens on request even after a report shipped; sending it again is deliberate. */
export function canEditMapping(status: RequestStatus): boolean {
  return status !== 'accepted' && status !== 'consult'
}
