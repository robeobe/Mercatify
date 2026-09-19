import { describe, expect, it, beforeEach } from '@jest/globals'
import { randomUUID } from 'node:crypto'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { OPTIMISTIC_LOCK_HEADER_NAME } from '@open-mercato/shared/lib/crud/optimistic-lock-headers'
import { InterviewCase } from '../../data/entities'
import { updateCaseCostsCommand } from '../cases'

process.env.OM_OPTIMISTIC_LOCK = 'all'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const ORG_A = '22222222-2222-4222-8222-222222222222'
const TENANT_B = '33333333-3333-4333-8333-333333333333'
const ORG_B = '44444444-4444-4444-8444-444444444444'

/** In-memory stand-in for the scoped ORM/data-engine pair the command resolves. */
function makeWorld() {
  const cases: InterviewCase[] = []

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value === null) return row[key] == null
      return row[key] === value
    })

  const em = {
    findOne: async (_entity: unknown, where: Record<string, unknown>) =>
      cases.find((row) => matches(row as unknown as Record<string, unknown>, where)) ?? null,
  }

  const dataEngine = {
    createOrmEntity: async ({ data }: { data: Record<string, unknown> }) => {
      const row = Object.assign(new InterviewCase(), {
        id: randomUUID(),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...data,
      })
      cases.push(row)
      return row
    },
    updateOrmEntity: async ({
      where,
      apply,
    }: {
      where: Record<string, unknown>
      apply: (row: InterviewCase) => void
    }) => {
      const row = cases.find((candidate) => matches(candidate as unknown as Record<string, unknown>, where))
      if (!row) return null
      apply(row)
      row.updatedAt = new Date()
      return row
    },
    markOrmEntityChange: () => {},
  }

  const container = {
    resolve: (key: string) => {
      if (key === 'dataEngine') return dataEngine
      if (key === 'em') return em
      throw new Error(`Unexpected DI key in test: ${key}`)
    },
  }

  return { cases, container }
}

type World = ReturnType<typeof makeWorld>

function makeCtx(
  world: World,
  overrides: { tenantId?: string | null; organizationId?: string | null; expectedUpdatedAt?: string | null } = {},
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
    request: new Request('https://example.test/api/mercatify/cases/costs', { headers }),
  } as CommandRuntimeContext
}

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

async function seedCase(world: World, ctx: CommandRuntimeContext, status: string = 'new'): Promise<InterviewCase> {
  const dataEngine = world.container.resolve('dataEngine') as any
  return dataEngine.createOrmEntity({
    entity: InterviewCase,
    data: {
      title: 'Sample interview case',
      status,
      tenantId: (ctx.auth as any).tenantId,
      organizationId: ctx.selectedOrganizationId,
    },
  })
}

describe('mercatify.cases.costs.update', () => {
  let world: World

  beforeEach(() => {
    world = makeWorld()
  })

  it('sets both cost inputs regardless of the case status (not gated by the draft-only profile guard)', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx, 'new')

    const updated = await updateCaseCostsCommand.execute(
      { id: created.id, omOperatingCost: 8400, implementationCost: 12000 },
      ctx,
    )
    expect(Number(updated.omOperatingCost)).toBeCloseTo(8400)
    expect(Number(updated.implementationCost)).toBeCloseTo(12000)
  })

  it('leaves a cost field untouched when omitted from the input', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    await updateCaseCostsCommand.execute({ id: created.id, omOperatingCost: 1000, implementationCost: 2000 }, ctx)

    const updated = await updateCaseCostsCommand.execute({ id: created.id, omOperatingCost: 1500 }, ctx)
    expect(Number(updated.omOperatingCost)).toBeCloseTo(1500)
    expect(Number(updated.implementationCost)).toBeCloseTo(2000)
  })

  it('fails closed when tenant/organization context is missing', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    await expectCrudStatus(
      () => updateCaseCostsCommand.execute({ id: created.id, omOperatingCost: 1 }, makeCtx(world, { tenantId: null })),
      400,
    )
  })

  it("is blind to another tenant's case", async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    await expectCrudStatus(
      () => updateCaseCostsCommand.execute(
        { id: created.id, omOperatingCost: 1 },
        makeCtx(world, { tenantId: TENANT_B, organizationId: ORG_B }),
      ),
      404,
    )
  })

  it('409s on a stale expected version', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    const stale = new Date('2020-01-01T00:00:00.000Z').toISOString()
    await expectCrudStatus(
      () => updateCaseCostsCommand.prepare!(
        { id: created.id, omOperatingCost: 1 },
        makeCtx(world, { expectedUpdatedAt: stale }),
      ),
      409,
    )
  })
})
