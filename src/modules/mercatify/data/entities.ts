import { Collection } from '@mikro-orm/core'
import { Entity, Index, ManyToOne, OneToMany, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'

export type InterviewCaseStatus =
  | 'draft'
  | 'new'
  | 'mapping'
  | 'mapped'
  | 'sent'
  | 'accepted'
  | 'consult'

/**
 * One Mercatify interview run, scoped to a tenant and an organization.
 *
 * The parent is the optimistic-lock and lifecycle boundary. Tool lines live on
 * `InterviewCaseTool` and are written only as part of a case save.
 */
@Index({ name: 'mercatify_interview_cases_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({
  name: 'mercatify_interview_cases_org_tenant_owner_idx',
  properties: ['organizationId', 'tenantId', 'createdByUserId'],
})
@Entity({ tableName: 'mercatify_interview_cases' })
export class InterviewCase {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ type: 'text' })
  title!: string

  /**
   * Lifecycle status. Valid values: 'draft' | 'new' | 'mapping' | 'mapped' |
   * 'sent' | 'accepted' | 'consult'. This slice's commands only write 'draft'
   * and 'new'; the rest are reserved for later slices.
   */
  @Property({ type: 'text', default: 'draft' })
  status: InterviewCaseStatus = 'draft'

  @Property({ name: 'company_name', type: 'text', nullable: true })
  companyName?: string | null

  @Property({ type: 'text', nullable: true })
  industry?: string | null

  @Property({ name: 'people_count', type: 'integer', nullable: true })
  peopleCount?: number | null

  @Property({ type: 'text', nullable: true, default: 'EUR' })
  currency: string | null = 'EUR'

  @Property({ type: 'text', nullable: true })
  pains?: string | null

  @Property({ name: 'must_keep', type: 'text', nullable: true })
  mustKeep?: string | null

  @OneToMany(() => InterviewCaseTool, (tool) => tool.interviewCase)
  tools = new Collection<InterviewCaseTool>(this)

  /**
   * Organization-owned business data: both scope columns are required. A case
   * is never system-scoped, so neither column is nullable.
   */
  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  /**
   * Staff user who created the intake. Scalar id only — no cross-module ORM
   * relation to auth. Null on historical rows seeded before S-08.
   */
  @Property({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId?: string | null

  /** Set once when the case first leaves `draft`. */
  @Property({ name: 'submitted_at', type: Date, nullable: true })
  submittedAt?: Date | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  /**
   * Set once by the "Confirm mapping" action (S-03). Non-null means the
   * mapping table is locked: row edits and re-generation are rejected, and
   * the report stage (a later slice) is unlocked.
   */
  @Property({ name: 'mapping_confirmed_at', type: Date, nullable: true })
  mappingConfirmedAt?: Date | null

  /**
   * Customer-provided inputs to S-04's net-saving formula (never computed by
   * the analysis — see `lib/savings.ts` and `mercatify-labs`' "iron rule #2").
   * Admin-entered independently of the intake profile, editable regardless of
   * `status`.
   */
  @Property({ name: 'om_operating_cost', type: 'numeric', precision: 12, scale: 2, nullable: true })
  omOperatingCost?: string | null

  @Property({ name: 'implementation_cost', type: 'numeric', precision: 12, scale: 2, nullable: true })
  implementationCost?: string | null

  /**
   * The `.md` handoff document Mercatify Lab needs for implementation. Seeded
   * once by `mercatify.handoff.generate` from the confirmed mapping; after
   * that, independent of `MappingRow` forever (PRD Open Question 8, resolved
   * 2026-09-19: table and document are independent artifacts — editing one
   * never touches the other).
   */
  @Property({ name: 'handoff_document', type: 'text', nullable: true })
  handoffDocument?: string | null

  /**
   * S-06: the outcome of handing the document to Mercatify Lab, written once
   * the client accepts the report (`mercatify.cases.answer`). Valid values:
   * 'delivered' | 'not_installed' | 'no_document' | 'failed'. Null means the
   * handoff has not run — the case was never accepted.
   */
  @Property({ name: 'lab_handoff_status', type: 'text', nullable: true })
  labHandoffStatus?: string | null

  /**
   * A snapshot of exactly what was handed over, not a pointer to
   * `handoffDocument`: a later admin edit must not rewrite what Lab already
   * received, and FR-013's "see what would have been handed over" has to keep
   * showing that same text.
   */
  @Property({ name: 'lab_handoff_document', type: 'text', nullable: true })
  labHandoffDocument?: string | null

  @Property({ name: 'lab_handoff_at', type: Date, nullable: true })
  labHandoffAt?: Date | null
}

/**
 * One capability/tool row from a Mercatify Lab analysis pass over an
 * `InterviewCase`, materialized once by `mercatify.mapping.generate` and
 * editable (decision + justification only — see S-03's plan) by an admin.
 *
 * `flagged`/`flagReason` are computed at generation time, not re-derived on
 * every read: a row is flagged when the analysis could not map it at all
 * (`flagReason: 'unmapped'`), or when it named an OM module id that isn't in
 * this app's actually-enabled module registry at generation time
 * (`flagReason: 'module_not_enabled'`) — the same "visibly flagged, never
 * dropped" treatment FR-006 requires for an unmapped capability.
 */
@Index({ name: 'mercatify_mapping_rows_org_tenant_case_idx', properties: ['organizationId', 'tenantId', 'caseId'] })
@Entity({ tableName: 'mercatify_mapping_rows' })
export class MappingRow {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  // Scalar FK to InterviewCase — no cross-module or cross-entity ORM relation.
  @Property({ name: 'case_id', type: 'uuid' })
  caseId!: string

  @Property({ type: 'int', default: 0 })
  position: number = 0

  @Property({ type: 'text' })
  capability!: string

  /** The SaaS product this capability was mapped from. Analysis-owned, drives S-04's saving formula. */
  @Property({ type: 'text', default: '' })
  source: string = ''

  /** Valid values: 'native' | 'configure' | 'build' | 'integrate' | 'keep'. Admin-editable. */
  @Property({ type: 'text' })
  decision!: string

  /** Valid values: 'om_module' | 'external_tool' | 'unmapped'. Analysis-owned, never admin-editable. */
  @Property({ name: 'target_kind', type: 'text' })
  targetKind!: string

  @Property({ name: 'target_module_id', type: 'text', nullable: true })
  targetModuleId?: string | null

  @Property({ name: 'target_tool_name', type: 'text', nullable: true })
  targetToolName?: string | null

  /** Generation-time display snapshot (module title or tool name); null for `unmapped`. */
  @Property({ name: 'target_label', type: 'text', nullable: true })
  targetLabel?: string | null

  /** Admin-editable. */
  @Property({ type: 'text' })
  justification!: string

  /** Valid values: 'high' | 'medium' | 'low'. Analysis-owned, never admin-editable. */
  @Property({ type: 'text' })
  confidence!: string

  @Property({ type: 'boolean', default: false })
  flagged: boolean = false

  /** Valid values: 'unmapped' | 'module_not_enabled'; null when not flagged. */
  @Property({ name: 'flag_reason', type: 'text', nullable: true })
  flagReason?: string | null

  /**
   * Organization-owned business data: both scope columns are required, mirroring
   * `InterviewCase` — a mapping row is never system-scoped.
   */
  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

/**
 * S-09: the client-facing report for one case. Holds ONLY what a human typed
 * while composing it — every figure the client reads (KPIs, saving lines,
 * backlog totals, cash curve) is derived on read by `lib/report.ts`, so an
 * edited cost input or a re-generated mapping can never leave a stale number
 * in the document.
 *
 * Scalar `caseId`, no ORM relation — same rule as `MappingRow`.
 */
@Index({
  name: 'mercatify_case_reports_org_tenant_case_idx',
  properties: ['organizationId', 'tenantId', 'caseId'],
})
@Entity({ tableName: 'mercatify_case_reports' })
export class CaseReport {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'case_id', type: 'uuid' })
  caseId!: string

  /** Optional override for the computed opening line. Null = use the computed one. */
  @Property({ type: 'text', nullable: true })
  headline?: string | null

  /** The consultant's closing note, printed under their name. */
  @Property({ type: 'text', nullable: true })
  notes?: string | null

  /** Who reviewed the report; printed on it. */
  @Property({ type: 'text', nullable: true })
  analyst?: string | null

  /** Free-text open questions, one per line, printed above the low-confidence rows. */
  @Property({ name: 'open_questions', type: 'text', nullable: true })
  openQuestions?: string | null

  /**
   * Turns backlog hours into money. Deliberately NOT one of S-04's three
   * saving lines: `hours × rate` is a build-effort estimate and is never
   * blended with the customer-provided implementation cost.
   */
  @Property({ name: 'hourly_rate', type: 'numeric', precision: 12, scale: 2, nullable: true })
  hourlyRate?: string | null

  /** How many months before the old licences start dropping off; shapes the cash curve. */
  @Property({ name: 'implementation_months', type: 'integer', nullable: true })
  implementationMonths?: number | null

  /**
   * Per-backlog-item hour estimates, keyed by `MappingRow.id`. A map rather
   * than a child entity: mapping rows are immutable once confirmed, and these
   * are report-time scratch values that are never queried or aggregated in
   * SQL. A missing key prints "to estimate", never a zero.
   */
  @Property({ name: 'build_estimates', type: 'json' })
  buildEstimates: Record<string, number> = {}

  /**
   * Set by `mercatify.report.send`, which is the only writer of the case's
   * `sent` status. Re-sending overwrites this: the client keeps the version
   * they were given until a new one is sent on purpose.
   */
  @Property({ name: 'sent_at', type: Date, nullable: true })
  sentAt?: Date | null

  /**
   * Organization-owned business data: both scope columns are required,
   * mirroring `InterviewCase` — a report is never system-scoped.
   */
  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  /** The optimistic-lock version, as on `InterviewCase`. */
  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Index({
  name: 'mercatify_interview_case_tools_scope_idx',
  properties: ['interviewCase', 'organizationId', 'tenantId'],
})
@Entity({ tableName: 'mercatify_interview_case_tools' })
export class InterviewCaseTool {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => InterviewCase, { fieldName: 'interview_case_id' })
  interviewCase!: InterviewCase

  @Property({ name: 'catalog_tool_id', type: 'text', nullable: true })
  catalogToolId?: string | null

  @Property({ type: 'text' })
  name!: string

  @Property({ name: 'selected_module_ids', type: 'json' })
  selectedModuleIds: string[] = []

  @Property({ name: 'custom_use', type: 'text', nullable: true })
  customUse?: string | null

  @Property({ type: 'integer', nullable: true })
  seats?: number | null

  @Property({ name: 'monthly_cost', type: 'numeric', precision: 12, scale: 2, nullable: true })
  monthlyCost?: string | null

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
