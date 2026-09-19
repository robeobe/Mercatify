import type { InterviewCase, InterviewCaseTool } from '../data/entities'
import type { InterviewCaseToolInput } from '../data/validators'

export const UNTITLED_INTAKE_TITLE = 'Untitled intake'

export const PROFILE_CONTENT_KEYS = [
  'companyName',
  'industry',
  'peopleCount',
  'currency',
  'pains',
  'mustKeep',
  'tools',
] as const

export type SerializedTool = {
  id: string
  catalogToolId: string | null
  name: string
  selectedModuleIds: string[]
  customUse: string | null
  seats: number | null
  monthlyCost: number | null
}

export function deriveCaseTitle(companyName: string | null | undefined): string {
  const trimmed = companyName?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : UNTITLED_INTAKE_TITLE
}

export function monthlyCostToNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function monthlyCostToColumn(value: number | null | undefined): string | null {
  if (value == null) return null
  return value.toFixed(2)
}

export function serializeTool(entity: InterviewCaseTool): SerializedTool {
  return {
    id: String(entity.id),
    catalogToolId: entity.catalogToolId ? String(entity.catalogToolId) : null,
    name: String(entity.name),
    selectedModuleIds: Array.isArray(entity.selectedModuleIds) ? entity.selectedModuleIds.map(String) : [],
    customUse: entity.customUse == null ? null : String(entity.customUse),
    seats: entity.seats == null ? null : Number(entity.seats),
    monthlyCost: monthlyCostToNumber(entity.monthlyCost),
  }
}

export function hasProfileOrToolEdits(input: {
  companyName?: unknown
  industry?: unknown
  peopleCount?: unknown
  currency?: unknown
  pains?: unknown
  mustKeep?: unknown
  tools?: unknown
}): boolean {
  return PROFILE_CONTENT_KEYS.some((key) => input[key] !== undefined)
}

export function applyProfileFields(
  record: InterviewCase,
  parsed: {
    companyName?: string | null
    industry?: string | null
    peopleCount?: number | null
    currency?: string | null
    pains?: string | null
    mustKeep?: string | null
  },
): void {
  if (parsed.companyName !== undefined) record.companyName = parsed.companyName
  if (parsed.industry !== undefined) record.industry = parsed.industry
  if (parsed.peopleCount !== undefined) record.peopleCount = parsed.peopleCount
  if (parsed.currency !== undefined) record.currency = parsed.currency
  if (parsed.pains !== undefined) record.pains = parsed.pains
  if (parsed.mustKeep !== undefined) record.mustKeep = parsed.mustKeep
}

export function toolCreateData(
  input: InterviewCaseToolInput,
  scope: { tenantId: string; organizationId: string },
): {
  catalogToolId: string | null
  name: string
  selectedModuleIds: string[]
  customUse: string | null
  seats: number | null
  monthlyCost: string | null
  tenantId: string
  organizationId: string
} {
  return {
    catalogToolId: input.catalogToolId ?? null,
    name: input.name,
    selectedModuleIds: input.selectedModuleIds ?? [],
    customUse: input.customUse ?? null,
    seats: input.seats ?? null,
    monthlyCost: monthlyCostToColumn(input.monthlyCost ?? null),
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  }
}

export function applyToolFields(record: InterviewCaseTool, input: InterviewCaseToolInput): void {
  if (input.catalogToolId !== undefined) record.catalogToolId = input.catalogToolId
  record.name = input.name
  record.selectedModuleIds = input.selectedModuleIds ?? []
  if (input.customUse !== undefined) record.customUse = input.customUse
  if (input.seats !== undefined) record.seats = input.seats
  if (input.monthlyCost !== undefined) record.monthlyCost = monthlyCostToColumn(input.monthlyCost)
}
