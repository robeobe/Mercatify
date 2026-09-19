import { describe, expect, it, beforeEach } from '@jest/globals'
import { randomUUID } from 'node:crypto'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { OPTIMISTIC_LOCK_HEADER_NAME } from '@open-mercato/shared/lib/crud/optimistic-lock-headers'
import { InterviewCase } from '../../data/entities'
import { createCaseCommand, updateCaseCommand, deleteCaseCommand } from '../cases'

// Deterministic: the guard's env contract defaults to ON, but the suite must not
// silently pass because an ambient value turned it off.
process.env.OM_OPTIMISTIC_LOCK = 'all'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const ORG_A = '22222222-2222-4222-8222-222222222222'
const TENANT_B = '33333333-3333-4333-8333-333333333333'
const ORG_B = '44444444-4444-4444-8444-444444444444'

type Row = InterviewCase

/** In-memory stand-in for the scoped ORM/data-engine pair the commands resolve. */
function makeWorld() {
  const rows: Row[] = []

  const matches = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value === null) return (row as unknown as Record<string, unknown>)[key] == null
      return (row as unknown as Record<string, unknown>)[key] === value
    })

  const em = {
    findOne: async (_entity: unknown, where: Record<string, unknown>) =>
      rows.find((row) => matches(row, where)) ?? null,
  }

  const marks: Array<{ action: string; id: string }> = []

  const dataEngine = {
    createOrmEntity: async ({ data }: { entity: unknown; data: Record<string, unknown> }) => {
      const row = Object.assign(new InterviewCase(), {
        id: randomUUID(),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
        ...data,
      }) as Row
      rows.push(row)
      return row
    },
    updateOrmEntity: async ({
      where,
      apply,
    }: {
      entity: unknown
      where: Record<string, unknown>
      apply: (row: Row) => void
    }) => {
      const row = rows.find((candidate) => matches(candidate, where))
      if (!row) return null
      apply(row)
      row.updatedAt = new Date()
      return row
    },
    deleteOrmEntity: async ({ where }: { entity: unknown; where: Record<string, unknown> }) => {
      const row = rows.find((candidate) => matches(candidate, where))
      if (!row) return null
      row.deletedAt = new Date()
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

  return { rows, marks, container }
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
    request: new Request('https://example.test/api/mercatify/cases', { headers }),
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

describe('mercatify case commands', () => {
  let world: World

  beforeEach(() => {
    world = makeWorld()
  })

  it('creates, updates and deletes within the trusted scope', async () => {
    const created = await createCaseCommand.execute({ title: 'Sample interview case' }, makeCtx(world))
    expect(created.tenantId).toBe(TENANT_A)
    expect(created.organizationId).toBe(ORG_A)
    expect(created.status).toBe('draft')

    const updated = await updateCaseCommand.execute(
      { id: created.id, title: 'Renamed', status: 'in_progress' },
      makeCtx(world),
    )
    expect(updated.title).toBe('Renamed')
    expect(updated.status).toBe('in_progress')

    const deleted = await deleteCaseCommand.execute({ id: created.id }, makeCtx(world))
    expect(deleted.deletedAt).toBeInstanceOf(Date)
    expect(world.marks.map((m) => m.action)).toEqual(['created', 'updated', 'deleted'])
  })

  it('fails closed when the tenant context is missing, writing nothing', async () => {
    await expectCrudStatus(
      () => createCaseCommand.execute({ title: 'Unscoped' }, makeCtx(world, { tenantId: null })),
      400,
    )
    expect(world.rows).toHaveLength(0)
  })

  it('fails closed when the organization context is missing, writing nothing', async () => {
    await expectCrudStatus(
      () => createCaseCommand.execute({ title: 'Unscoped' }, makeCtx(world, { organizationId: null })),
      400,
    )
    expect(world.rows).toHaveLength(0)
  })

  it("is blind to another tenant's case for both read and write", async () => {
    const mine = await createCaseCommand.execute({ title: 'Tenant A case' }, makeCtx(world))
    const otherTenantCtx = makeCtx(world, { tenantId: TENANT_B, organizationId: ORG_B })

    // prepare() is the read path: the record must not be visible at all.
    await expectCrudStatus(() => updateCaseCommand.prepare!({ id: mine.id, title: 'Hijacked' }, otherTenantCtx), 404)
    await expectCrudStatus(() => updateCaseCommand.execute({ id: mine.id, title: 'Hijacked' }, otherTenantCtx), 404)
    await expectCrudStatus(() => deleteCaseCommand.execute({ id: mine.id }, otherTenantCtx), 404)

    expect(world.rows).toHaveLength(1)
    expect(world.rows[0].title).toBe('Tenant A case')
    expect(world.rows[0].deletedAt).toBeNull()
  })

  it('raises a 409 conflict on a stale expected version instead of overwriting', async () => {
    const created = await createCaseCommand.execute({ title: 'Locked' }, makeCtx(world))
    const stale = new Date('2020-01-01T00:00:00.000Z').toISOString()

    await expectCrudStatus(
      () =>
        updateCaseCommand.prepare!(
          { id: created.id, title: 'Clobbered' },
          makeCtx(world, { expectedUpdatedAt: stale }),
        ),
      409,
    )
    expect(world.rows[0].title).toBe('Locked')
  })

  it('accepts a matching expected version', async () => {
    const created = await createCaseCommand.execute({ title: 'Locked' }, makeCtx(world))
    const current = created.updatedAt.toISOString()

    await expect(
      Promise.resolve().then(() =>
        updateCaseCommand.prepare!(
          { id: created.id, title: 'Fine' },
          makeCtx(world, { expectedUpdatedAt: current }),
        ),
      ),
    ).resolves.toBeTruthy()
  })

  /**
   * The plan's wording was "an update with a missing version is rejected", but the
   * installed guard is documented as strictly additive: with no expected token it
   * is a no-op so existing API consumers keep working
   * (`optimistic-lock-command.ts`, `assertOptimisticLock`). Rejecting here would
   * break the CRUD factory path and the seeder, so the framework contract wins and
   * this test pins the behavior that actually ships.
   */
  it('lets an unversioned update through as a documented additive no-op', async () => {
    const created = await createCaseCommand.execute({ title: 'Unversioned' }, makeCtx(world))
    await expect(
      Promise.resolve().then(() => updateCaseCommand.prepare!({ id: created.id, title: 'Fine' }, makeCtx(world))),
    ).resolves.toBeTruthy()
  })
})
