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
import { generateMappingCommand, updateMappingRowCommand, confirmMappingCommand } from '../mapping'

// Deterministic: the guard's env contract defaults to ON, but the suite must not
// silently pass because an ambient value turned it off.
process.env.OM_OPTIMISTIC_LOCK = 'all'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const ORG_A = '22222222-2222-4222-8222-222222222222'
const TENANT_B = '33333333-3333-4333-8333-333333333333'
const ORG_B = '44444444-4444-4444-8444-444444444444'

/**
 * Only `dashboards` (plus `mercatify` itself) is registered as "enabled" —
 * mirrors this app's actual `src/modules.ts` closely enough to exercise both
 * branches of the flagged-module invariant: `dashboards` resolves cleanly,
 * `customers`/`sales` (named by the scripted fixture) do not.
 */
function registerFakeEnabledModules() {
  registerModules([
    { id: 'mercatify', info: { title: 'Mercatify' } } as any,
    { id: 'dashboards', info: { title: 'Admin Dashboards' } } as any,
  ])
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

async function seedCase(world: World, ctx: CommandRuntimeContext): Promise<InterviewCase> {
  const de = world.container.resolve('dataEngine') as any
  return de.createOrmEntity({
    entity: InterviewCase,
    data: {
      title: 'Sample interview case',
      status: 'draft',
      tenantId: (ctx.auth as any).tenantId,
      organizationId: ctx.selectedOrganizationId,
    },
  })
}

async function seedTool(
  world: World,
  ctx: CommandRuntimeContext,
  caseId: string,
  data: { name: string; monthlyCost: string },
): Promise<InterviewCaseTool> {
  const de = world.container.resolve('dataEngine') as any
  return de.createOrmEntity({
    entity: InterviewCaseTool,
    data: {
      interviewCase: caseId,
      name: data.name,
      monthlyCost: data.monthlyCost,
      selectedModuleIds: [],
      tenantId: (ctx.auth as any).tenantId,
      organizationId: ctx.selectedOrganizationId,
    },
  })
}

describe('mercatify mapping commands', () => {
  let world: World

  beforeEach(() => {
    world = makeWorld()
    registerMercatifyLabPort(scriptedMercatifyLabAdapter)
    registerFakeEnabledModules()
  })

  it('generates one row per scripted mapping entry and is idempotent on a second call', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)

    const first = await generateMappingCommand.execute({ caseId: created.id }, ctx)
    expect(first.generated).toBe(true)
    expect(first.rows.length).toBeGreaterThan(0)
    const firstIds = first.rows.map((r) => r.id).sort()

    const second = await generateMappingCommand.execute({ caseId: created.id }, ctx)
    expect(second.generated).toBe(false)
    expect(second.rows.map((r) => r.id).sort()).toEqual(firstIds)
  })

  it('sends the case\'s real InterviewCaseTool rows as saasTools, and persists a non-empty source on every generated row', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    await seedTool(world, ctx, created.id, { name: 'Salesforce', monthlyCost: '2000.00' })

    const { rows } = await generateMappingCommand.execute({ caseId: created.id }, ctx)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.source).toBeTruthy()
    }
  })

  it('flags every row naming a module outside the enabled registry, and every unmapped row — never silently drops either', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    const { rows } = await generateMappingCommand.execute({ caseId: created.id }, ctx)

    const enabled = new Set(getEnabledModuleIds())
    expect(enabled.has('dashboards')).toBe(true)
    expect(enabled.has('customers')).toBe(false)

    for (const row of rows) {
      if (row.targetKind === 'om_module' && !row.flagged) {
        // The automated form of issue #14's last acceptance criterion.
        expect(row.targetModuleId).not.toBeNull()
        expect(enabled.has(row.targetModuleId as string)).toBe(true)
      }
      if (row.targetKind === 'om_module' && row.targetModuleId && !enabled.has(row.targetModuleId)) {
        expect(row.flagged).toBe(true)
        expect(row.flagReason).toBe('module_not_enabled')
      }
      if (row.targetKind === 'unmapped') {
        expect(row.flagged).toBe(true)
        expect(row.flagReason).toBe('unmapped')
      }
    }

    // The scripted fixture is known to name both a resolvable module
    // (`dashboards`) and unavailable ones (`customers`, `sales`) plus one
    // truly unmapped capability — assert the mix actually showed up so this
    // test cannot pass vacuously against an empty or degenerate mapping.
    expect(rows.some((r) => r.targetKind === 'om_module' && !r.flagged)).toBe(true)
    expect(rows.some((r) => r.targetKind === 'om_module' && r.flagged)).toBe(true)
    expect(rows.some((r) => r.targetKind === 'unmapped')).toBe(true)
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
    const created = await seedCase(world, ctx)
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
    const created = await seedCase(world, ctx)
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
    const created = await seedCase(world, ctx)

    await expectCrudStatus(() => confirmMappingCommand.execute({ caseId: created.id }, ctx), 400)

    await generateMappingCommand.execute({ caseId: created.id }, ctx)
    const confirmed = await confirmMappingCommand.execute({ caseId: created.id }, ctx)
    expect(confirmed.mappingConfirmedAt).toBeInstanceOf(Date)

    const confirmedAgain = await confirmMappingCommand.execute({ caseId: created.id }, ctx)
    expect(confirmedAgain.mappingConfirmedAt).toEqual(confirmed.mappingConfirmedAt)
  })
})
