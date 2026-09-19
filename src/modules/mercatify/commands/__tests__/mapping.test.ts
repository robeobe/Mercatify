import { describe, expect, it, beforeEach } from '@jest/globals'
import { randomUUID } from 'node:crypto'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { OPTIMISTIC_LOCK_HEADER_NAME } from '@open-mercato/shared/lib/crud/optimistic-lock-headers'
import { registerModules } from '@open-mercato/shared/lib/modules/registry'
import { getEnabledModuleIds } from '@open-mercato/shared/security/enabledModulesRegistry'
import { InterviewCase, InterviewCaseTool, MappingRow } from '../../data/entities'
import { registerMercatifyLabPort } from '../../lib/mercatify-lab-port'
import { scriptedMercatifyLabAdapter } from '../../lib/scripted-mercatify-lab-adapter'
import {
  generateMappingCommand,
  updateMappingRowCommand,
  confirmMappingCommand,
  resetInstallableModuleIdsCache,
} from '../mapping'

// Deterministic: the guard's env contract defaults to ON, but the suite must not
// silently pass because an ambient value turned it off.
process.env.OM_OPTIMISTIC_LOCK = 'all'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const ORG_A = '22222222-2222-4222-8222-222222222222'
const TENANT_B = '33333333-3333-4333-8333-333333333333'
const ORG_B = '44444444-4444-4444-8444-444444444444'

/**
 * Only `dashboards` (plus `mercatify` itself) is registered as "enabled" —
 * mirrors this app's actual `src/modules.ts`. `customers`/`sales`/`messages`
 * are NOT enabled here but do ship in `@open-mercato/core`, which is exactly
 * the case `resolveTarget` must no longer flag.
 */
function registerFakeEnabledModules() {
  registerModules([
    { id: 'mercatify', info: { title: 'Mercatify' } } as any,
    { id: 'dashboards', info: { title: 'Admin Dashboards' } } as any,
  ])
  resetInstallableModuleIdsCache()
}

type Row = InterviewCase | MappingRow | InterviewCaseTool

/** In-memory stand-in for the scoped ORM/data-engine pair the commands resolve. */
function makeWorld() {
  const cases: InterviewCase[] = []
  const rows: MappingRow[] = []
  const tools: InterviewCaseTool[] = []

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value === null) return row[key] == null
      return row[key] === value
    })

  function tableFor(entity: unknown): Row[] {
    if (entity === MappingRow) return rows as unknown as Row[]
    if (entity === InterviewCaseTool) return tools as unknown as Row[]
    return cases as unknown as Row[]
  }

  const em = {
    findOne: async (entity: unknown, where: Record<string, unknown>) =>
      tableFor(entity).find((row) => matches(row as unknown as Record<string, unknown>, where)) ?? null,
    find: async (entity: unknown, where: Record<string, unknown>) =>
      tableFor(entity).filter((row) => matches(row as unknown as Record<string, unknown>, where)),
    count: async (entity: unknown, where: Record<string, unknown>) =>
      tableFor(entity).filter((row) => matches(row as unknown as Record<string, unknown>, where)).length,
  }

  const marks: Array<{ action: string; id: string }> = []

  const dataEngine = {
    createOrmEntity: async ({ entity, data }: { entity: unknown; data: Record<string, unknown> }) => {
      const Ctor = entity as typeof InterviewCase | typeof MappingRow
      const row = Object.assign(new Ctor(), {
        id: randomUUID(),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...data,
      }) as unknown as Row
      tableFor(entity).push(row)
      return row
    },
    updateOrmEntity: async ({
      entity,
      where,
      apply,
    }: {
      entity: unknown
      where: Record<string, unknown>
      apply: (row: any) => void
    }) => {
      const row = tableFor(entity).find((candidate) => matches(candidate as unknown as Record<string, unknown>, where))
      if (!row) return null
      apply(row)
      ;(row as any).updatedAt = new Date()
      return row
    },
    markOrmEntityChange: ({ action, identifiers }: { action: string; identifiers: { id: string } }) => {
      marks.push({ action, id: identifiers.id })
    },
  }

  const container = {
    resolve: (key: string) => {
      if (key === 'dataEngine') return dataEngine
      if (key === 'em') return em
      throw new Error(`Unexpected DI key in test: ${key}`)
    },
  }

  return { cases, rows, tools, marks, container }
}

type World = ReturnType<typeof makeWorld>

function makeCtx(
  world: World,
  overrides: {
    tenantId?: string | null
    organizationId?: string | null
    expectedUpdatedAt?: string | null
  } = {},
): CommandRuntimeContext {
  const tenantId = 'tenantId' in overrides ? overrides.tenantId : TENANT_A
  const organizationId = 'organizationId' in overrides ? overrides.organizationId : ORG_A
  const headers = new Headers()
  if (overrides.expectedUpdatedAt) headers.set(OPTIMISTIC_LOCK_HEADER_NAME, overrides.expectedUpdatedAt)
  return {
    container: world.container as unknown as CommandRuntimeContext['container'],
    auth: (tenantId ? { tenantId, sub: 'user-1' } : null) as CommandRuntimeContext['auth'],
    organizationScope: null,
    selectedOrganizationId: organizationId ?? null,
    organizationIds: organizationId ? [organizationId] : null,
    request: new Request('https://example.test/api/mercatify/mapping-rows', { headers }),
  } as CommandRuntimeContext
}

/** Assert the thunk fails with a `CrudHttpError` carrying exactly `status`. */
async function expectCrudStatus(run: () => unknown, status: number): Promise<void> {
  let threw = false
  try {
    await run()
  } catch (error) {
    threw = true
    if (!isCrudHttpError(error)) throw error
    expect(error.status).toBe(status)
  }
  expect(threw).toBe(true)
}

async function seedCase(
  world: World,
  ctx: CommandRuntimeContext,
  status: string = 'draft',
): Promise<InterviewCase> {
  const de = world.container.resolve('dataEngine') as any
  return de.createOrmEntity({
    entity: InterviewCase,
    data: {
      title: 'Sample interview case',
      status,
      tenantId: (ctx.auth as any).tenantId,
      organizationId: ctx.selectedOrganizationId,
    },
  })
}

async function seedTool(
  world: World,
  ctx: CommandRuntimeContext,
  caseId: string,
  data: { name: string; monthlyCost: string; catalogToolId?: string; selectedModuleIds?: string[] },
): Promise<InterviewCaseTool> {
  const de = world.container.resolve('dataEngine') as any
  return de.createOrmEntity({
    entity: InterviewCaseTool,
    data: {
      interviewCase: caseId,
      name: data.name,
      monthlyCost: data.monthlyCost,
      catalogToolId: data.catalogToolId ?? null,
      selectedModuleIds: data.selectedModuleIds ?? [],
      tenantId: (ctx.auth as any).tenantId,
      organizationId: ctx.selectedOrganizationId,
    },
  })
}

/**
 * A case plus the stack the analysis is derived from. Every generate test needs
 * one: with no intake tools there is nothing to map and the command correctly
 * writes no rows.
 */
async function seedCaseWithStack(
  world: World,
  ctx: CommandRuntimeContext,
  status: string = 'draft',
): Promise<InterviewCase> {
  const created = await seedCase(world, ctx, status)
  // `messages` (core, not enabled) + `dashboards` (enabled) + one uncatalogued
  // tool, so a single stack exercises every branch of `resolveTarget`.
  await seedTool(world, ctx, created.id, {
    name: 'Zendesk', monthlyCost: '480.00', catalogToolId: 'zendesk', selectedModuleIds: ['support', 'explore'],
  })
  await seedTool(world, ctx, created.id, { name: 'Voltix job tracker', monthlyCost: '0.00' })
  return created
}

describe('mercatify mapping commands', () => {
  let world: World

  beforeEach(() => {
    world = makeWorld()
    registerMercatifyLabPort(scriptedMercatifyLabAdapter)
    registerFakeEnabledModules()
  })

  it('generates one row per mapped capability and is idempotent on a second call', async () => {
    const ctx = makeCtx(world)
    const created = await seedCaseWithStack(world, ctx)

    const first = await generateMappingCommand.execute({ caseId: created.id }, ctx)
    expect(first.generated).toBe(true)
    expect(first.rows.length).toBeGreaterThan(0)
    const firstIds = first.rows.map((r) => r.id).sort()

    const second = await generateMappingCommand.execute({ caseId: created.id }, ctx)
    expect(second.generated).toBe(false)
    expect(second.rows.map((r) => r.id).sort()).toEqual(firstIds)
  })

  it("sources every generated row from the case's real InterviewCaseTool rows", async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    await seedTool(world, ctx, created.id, {
      name: 'Salesforce', monthlyCost: '2000.00', catalogToolId: 'salesforce', selectedModuleIds: ['sales'],
    })

    const { rows } = await generateMappingCommand.execute({ caseId: created.id }, ctx)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.source).toBe('Salesforce')
    expect(rows[0]!.capability).toBe('Sales Cloud')
    expect(rows[0]!.targetModuleId).toBe('customers')
    expect(rows[0]!.justification).toContain('Salesforce')
  })

  it('writes no rows for a case with no intake tools — there is nothing to map', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    const { rows } = await generateMappingCommand.execute({ caseId: created.id }, ctx)
    expect(rows).toEqual([])
  })

  it('treats an installable core module as resolved, and still flags a genuinely unmapped row', async () => {
    const ctx = makeCtx(world)
    const created = await seedCaseWithStack(world, ctx)
    const { rows } = await generateMappingCommand.execute({ caseId: created.id }, ctx)

    const enabled = new Set(getEnabledModuleIds())
    expect(enabled.has('dashboards')).toBe(true)
    // `messages` is a core module this app does not enable — the case that
    // used to paint the demo table with "isn't installed".
    expect(enabled.has('messages')).toBe(false)

    const messagesRow = rows.find((r) => r.targetModuleId === 'messages')
    expect(messagesRow).toBeDefined()
    expect(messagesRow!.flagged).toBe(false)
    expect(messagesRow!.flagReason).toBeNull()
    expect(messagesRow!.targetLabel).toBe('Messages')

    const dashboardsRow = rows.find((r) => r.targetModuleId === 'dashboards')
    expect(dashboardsRow).toBeDefined()
    expect(dashboardsRow!.flagged).toBe(false)
    // An enabled module keeps its registered title rather than the id.
    expect(dashboardsRow!.targetLabel).toBe('Admin Dashboards')

    for (const row of rows) {
      if (row.targetKind === 'unmapped') {
        expect(row.flagged).toBe(true)
        expect(row.flagReason).toBe('unmapped')
      } else {
        expect(row.flagged).toBe(false)
      }
    }
    // The uncatalogued tool is still surfaced, never dropped (FR-006).
    expect(rows.some((r) => r.targetKind === 'unmapped')).toBe(true)
  })

  it("moves a 'new' case to 'mapping' when the analysis lands, and leaves later statuses alone", async () => {
    const ctx = makeCtx(world)
    const fresh = await seedCaseWithStack(world, ctx, 'new')
    await generateMappingCommand.execute({ caseId: fresh.id }, ctx)
    expect(fresh.status).toBe('mapping')

    // Re-running it on an already-analysed case is a no-op on both counts.
    await generateMappingCommand.execute({ caseId: fresh.id }, ctx)
    expect(fresh.status).toBe('mapping')

    const reported = await seedCaseWithStack(world, ctx, 'sent')
    await generateMappingCommand.execute({ caseId: reported.id }, ctx)
    expect(reported.status).toBe('sent')
  })

  it("moves a 'new' or 'mapping' case to 'mapped' on confirm, and never pulls a reported case back", async () => {
    const ctx = makeCtx(world)
    const inMapping = await seedCaseWithStack(world, ctx, 'mapping')
    await generateMappingCommand.execute({ caseId: inMapping.id }, ctx)
    await confirmMappingCommand.execute({ caseId: inMapping.id }, ctx)
    expect(inMapping.status).toBe('mapped')

    const straightFromNew = await seedCaseWithStack(world, ctx, 'new')
    await generateMappingCommand.execute({ caseId: straightFromNew.id }, ctx)
    // generate already advanced it; force the `new` branch of confirm too.
    straightFromNew.status = 'new'
    await confirmMappingCommand.execute({ caseId: straightFromNew.id }, ctx)
    expect(straightFromNew.status).toBe('mapped')

    const accepted = await seedCaseWithStack(world, ctx, 'accepted')
    await generateMappingCommand.execute({ caseId: accepted.id }, ctx)
    await confirmMappingCommand.execute({ caseId: accepted.id }, ctx)
    expect(accepted.status).toBe('accepted')
  })

  it('fails closed when tenant/organization context is missing, writing nothing', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    await expectCrudStatus(
      () => generateMappingCommand.execute({ caseId: created.id }, makeCtx(world, { tenantId: null })),
      400,
    )
    expect(world.rows).toHaveLength(0)
  })

  it("is blind to another tenant's case", async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    await expectCrudStatus(
      () => generateMappingCommand.execute({ caseId: created.id }, makeCtx(world, { tenantId: TENANT_B, organizationId: ORG_B })),
      404,
    )
  })

  it('lets an admin edit decision and justification pre-confirmation, and 409s on a stale version', async () => {
    const ctx = makeCtx(world)
    const created = await seedCaseWithStack(world, ctx)
    const { rows } = await generateMappingCommand.execute({ caseId: created.id }, ctx)
    const row = rows[0]!

    const updated = await updateMappingRowCommand.execute(
      { id: row.id, decision: 'build', justification: 'Revised by admin' },
      ctx,
    )
    expect(updated.decision).toBe('build')
    expect(updated.justification).toBe('Revised by admin')
    // Read-only fields are untouched by the edit.
    expect(updated.confidence).toBe(row.confidence)
    expect(updated.targetKind).toBe(row.targetKind)

    const stale = new Date('2020-01-01T00:00:00.000Z').toISOString()
    await expectCrudStatus(
      () =>
        updateMappingRowCommand.prepare!(
          { id: row.id, decision: 'keep', justification: 'Clobbered' },
          makeCtx(world, { expectedUpdatedAt: stale }),
        ),
      409,
    )
  })

  it('rejects a row edit once the mapping is confirmed', async () => {
    const ctx = makeCtx(world)
    const created = await seedCaseWithStack(world, ctx)
    const { rows } = await generateMappingCommand.execute({ caseId: created.id }, ctx)
    const row = rows[0]!

    await confirmMappingCommand.execute({ caseId: created.id }, ctx)

    await expectCrudStatus(
      () => updateMappingRowCommand.prepare!({ id: row.id, decision: 'keep', justification: 'Too late' }, ctx),
      409,
    )
  })

  it('400s confirming a case with zero rows, then succeeds once rows exist, and is idempotent', async () => {
    const ctx = makeCtx(world)
    const created = await seedCaseWithStack(world, ctx)

    await expectCrudStatus(() => confirmMappingCommand.execute({ caseId: created.id }, ctx), 400)

    await generateMappingCommand.execute({ caseId: created.id }, ctx)
    const confirmed = await confirmMappingCommand.execute({ caseId: created.id }, ctx)
    expect(confirmed.mappingConfirmedAt).toBeInstanceOf(Date)

    const confirmedAgain = await confirmMappingCommand.execute({ caseId: created.id }, ctx)
    expect(confirmedAgain.mappingConfirmedAt).toEqual(confirmed.mappingConfirmedAt)
  })
})
