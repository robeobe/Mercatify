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

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
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
