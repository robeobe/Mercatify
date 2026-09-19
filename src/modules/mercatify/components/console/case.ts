/**
 * Shared vocabulary for the three admin console screens (mapping, report,
 * handoff), mirroring `assets/console/*.html`: the request reference, the
 * staff-facing status wording and the case shape all three read from
 * `GET /api/mercatify/cases`.
 */
import type { TagMap } from '@open-mercato/ui/primitives/tag'

export type ConsoleCaseTool = {
  id: string
  name: string
  seats: number | null
  monthlyCost: number | null
}

export type ConsoleCaseDto = {
  id: string
  title: string
  status: string
  companyName: string | null
  industry: string | null
  peopleCount: number | null
  currency: string | null
  pains: string | null
  mustKeep: string | null
  submittedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  mappingConfirmedAt: string | null
  tools: ConsoleCaseTool[]
}

export type MercatifyCaseStatus = 'draft' | 'new' | 'mapping' | 'mapped' | 'sent' | 'accepted' | 'consult'

/** `REQ-` + the first four hex characters of the case id, as the mockups print it. */
export function caseRef(caseId: string): string {
  const hex = caseId.replace(/[^0-9a-fA-F]/g, '').slice(0, 4).toUpperCase()
  return `REQ-${hex || '????'}`
}

/** Staff wording, not the client's: the queue and the mapping screen share it. */
export const STAFF_STATUS_LABELS: Record<MercatifyCaseStatus, string> = {
  draft: 'draft',
  new: 'new',
  mapping: 'in mapping',
  mapped: 'mapped',
  sent: 'report sent',
  accepted: 'accepted',
  consult: 'consult asked',
}

export const STAFF_STATUS_TAGS: TagMap<MercatifyCaseStatus> = {
  draft: 'neutral',
  new: 'info',
  mapping: 'warning',
  mapped: 'success',
  sent: 'info',
  accepted: 'success',
  consult: 'warning',
}

export function toStaffStatus(status: string | null | undefined): MercatifyCaseStatus {
  return (status && status in STAFF_STATUS_LABELS ? status : 'draft') as MercatifyCaseStatus
}

/** The report is only reachable once somebody has stood behind a mapping. */
export function canBuildReport(mercatifyCase: Pick<ConsoleCaseDto, 'mappingConfirmedAt'> | null): boolean {
  return Boolean(mercatifyCase?.mappingConfirmedAt)
}

const SENT_STATUSES: readonly string[] = ['sent', 'accepted', 'consult']

/** True once the report went out — the mapping's lock message changes with it. */
export function isReportSent(status: string | null | undefined): boolean {
  return status != null && SENT_STATUSES.includes(status)
}

export function sumMonthlyCost(tools: ConsoleCaseTool[]): number {
  return tools.reduce((total, tool) => total + (tool.monthlyCost ?? 0), 0)
}
