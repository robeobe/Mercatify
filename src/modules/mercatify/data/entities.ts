import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import type { LabsTraceStep } from '../labs/tracing'

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
    /** A single ballpark figure for the whole move (migration, setup, training).
     * Entered directly by the consultant — not derived from per-capability hours. */
    switchingCost?: number
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
 * Result of an experimental "Mercatify Labs" analysis run — the vendored
 * `buildReport()` output (see `../labs/vendor`). Stored opaquely (`unknown`)
 * rather than typed against the vendor's `BuiltReport`: this column must
 * keep deserializing whatever an older run wrote even if the vendored
 * package is later resynced with a different `ReportModel` shape upstream.
 * Entirely separate from `report`/`overrides` — never read by the existing
 * deterministic mapping/report flow.
 */
export type MercatifyLabsResult = {
  mode: 'deterministic' | 'ai'
  ranAt: string
  model?: string
  excludedTools: string[]
  result: unknown
  /** Self-contained single-file HTML from the vendored `renderReport()` —
   * the same document Labs would hand a client, rendered here so the
   * console can show it (in a sandboxed iframe) without reimplementing it. */
  html: string
  /**
   * Per-agent trace captured by wrapping the `LlmClient`/tool-executor seam
   * (see `../labs/tracing.ts`) — never by touching vendored code. Empty for
   * a deterministic run except one synthetic bookkeeping step (no LLM was
   * involved). Persisted so an already-processed request can show "how this
   * ran" after the fact, not only while it is in flight.
   */
  trace: LabsTraceStep[]
}

/**
 * A static "empty shell" mockup of Open Mercato configured for this client —
 * a self-contained HTML page (sidebar brand + enabled-module nav, no live
 * data) built on demand once the client has accepted, so a consultant can
 * preview it before deciding to send it on. `moduleIds` mirrors what the
 * HTML renders, kept alongside for cheap inspection without parsing markup.
 */
export type MercatifyWorkspacePreview = {
  builtAt: string
  sentAt: string | null
  html: string
  moduleIds: string[]
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

  /** Experimental — set only by "Analizuj Labs" / "Analizuj Labs z AI". */
  @Property({ name: 'labs_result', type: 'json', nullable: true })
  labsResult?: MercatifyLabsResult | null

  /** A static "empty shell" mockup of the client's configured workspace —
   * available once they've accepted, built on demand, sent explicitly. */
  @Property({ name: 'workspace_preview', type: 'json', nullable: true })
  workspacePreview?: MercatifyWorkspacePreview | null

  @Property({ name: 'submitted_by_user_id', type: 'uuid', nullable: true })
  submittedByUserId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
