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
