import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

/**
 * One Mercatify interview run, scoped to a tenant and an organization.
 *
 * Deliberately narrow: identity, scope, a human label, a lifecycle status and
 * the timestamps the concurrency and soft-delete contracts require. The company
 * profile, SaaS tool lines, costs, answers, capability mappings, decisions,
 * confidence bands and the handoff document each belong to the later slice that
 * owns them, and each arrives with its own reviewed migration.
 */
@Index({ name: 'mercatify_interview_cases_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Entity({ tableName: 'mercatify_interview_cases' })
export class InterviewCase {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ type: 'text' })
  title!: string

  /** Lifecycle status. Valid values: 'draft' | 'in_progress' | 'completed'. */
  @Property({ type: 'text', default: 'draft' })
  status: 'draft' | 'in_progress' | 'completed' = 'draft'

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
