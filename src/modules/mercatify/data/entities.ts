import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'

export type MercatifyRequestTool = {
  name: string
  seats?: number | null
  monthly?: number | null
  /** Capability slugs, e.g. 'crm.contacts' — see assets/stack-tool/catalog.js. */
  caps: string[]
}

/** A consultant's correction over the automatic CAP_MAP lookup for one capability. */
export type MercatifyCapOverride = {
  module?: string
  status?: 'native' | 'configure' | 'build' | 'integrate' | 'keep'
  note?: string
  conf?: 'high' | 'medium' | 'low'
}

export type MercatifyReport = {
  headline?: string
  notes?: string
  generatedAt?: string
  assumptions?: {
    analyst?: string
    /** Monthly hosting/ops cost, subtracted from the gross saving. */
    hosting?: number
    /** Implementation ramp, in months — shapes the cash curve. */
    months?: number
    /** Open questions, one per line. */
    notes?: string
  }
}

export type MercatifyClientResponse = {
  kind: 'accepted' | 'consult'
  at: string
  message?: string
}

/**
 * One row per company that submitted its SaaS stack. `organizationId` is the
 * submitting organization; `mercatify.requests.manage` widens reads to every
 * organization in the tenant, which is why status/owner live on this row
 * rather than in a per-organization side table.
 */
@Entity({ tableName: 'mercatify_requests' })
export class MercatifyRequest {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ type: 'text' })
  company!: string

  @Property({ type: 'text', nullable: true })
  industry?: string | null

  @Property({ name: 'people_count', type: 'integer', nullable: true })
  peopleCount?: number | null

  @Property({ type: 'text', default: 'EUR' })
  currency: string = 'EUR'

  /** 'new' | 'mapping' | 'mapped' | 'sent' | 'accepted' | 'consult' */
  @Property({ type: 'text', default: 'new' })
  status: string = 'new'

  @Property({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId?: string | null

  @Property({ name: 'owner_name', type: 'text', nullable: true })
  ownerName?: string | null

  @Property({ type: 'text', nullable: true })
  pains?: string | null

  @Property({ name: 'must_keep', type: 'text', nullable: true })
  mustKeep?: string | null

  /** [{ name, seats, monthly, caps: string[] }] — no separate tool entity for v1. */
  @Property({ type: 'json' })
  tools: MercatifyRequestTool[] = []

  /** Per-capability corrections over the automatic CAP_MAP lookup, keyed by capability slug. */
  @Property({ type: 'json', nullable: true })
  overrides?: Record<string, MercatifyCapOverride> | null

  @Property({ name: 'mapped_at', type: Date, nullable: true })
  mappedAt?: Date | null

  @Property({ type: 'json', nullable: true })
  report?: MercatifyReport | null

  @Property({ name: 'sent_at', type: Date, nullable: true })
  sentAt?: Date | null

  @Property({ name: 'client_response', type: 'json', nullable: true })
  clientResponse?: MercatifyClientResponse | null

  @Property({ name: 'submitted_by_user_id', type: 'uuid', nullable: true })
  submittedByUserId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
