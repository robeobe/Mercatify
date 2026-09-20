import type { RequestStatus } from './status'

/**
 * No sequential ref exists yet (PRD Open Question 5-style gap) — a stable
 * slug derived from the id reads close enough to the mock's REQ-#### for the
 * demo. Shared by every screen (client and console) that shows one.
 */
export function refFor(id: string): string {
  return 'REQ-' + id.replace(/-/g, '').slice(0, 4).toUpperCase()
}

export type AdminRequestAction = { key: string; href: string; primary: boolean }

/**
 * The one action a queue row should offer, plus anything secondary — ported
 * from assets/shared/om-core.js requestActions(). Keeping this in one place
 * means the queue row and the coverage/report screens cannot disagree about
 * what is possible next for a given status.
 */
export function adminRequestActions(request: { id: string; status: RequestStatus }): AdminRequestAction[] {
  const mapHref = `/backend/mercatify-requests/${request.id}`
  const reportHref = `/backend/mercatify-requests/${request.id}/report`
  switch (request.status) {
    case 'new':
      return [{ key: 'map', href: mapHref, primary: true }]
    case 'mapping':
      return [{ key: 'continueMapping', href: mapHref, primary: true }]
    case 'mapped':
      return [
        { key: 'buildReport', href: reportHref, primary: true },
        { key: 'mapping', href: mapHref, primary: false },
      ]
    case 'accepted':
      return [
        { key: 'report', href: reportHref, primary: true },
        { key: 'preview', href: reportHref, primary: false },
      ]
    default:
      return [{ key: 'report', href: reportHref, primary: true }]
  }
}
