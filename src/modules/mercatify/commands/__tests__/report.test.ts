import { describe, expect, it, beforeEach } from '@jest/globals'
import { randomUUID } from 'node:crypto'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { OPTIMISTIC_LOCK_HEADER_NAME } from '@open-mercato/shared/lib/crud/optimistic-lock-headers'
import { CaseReport, InterviewCase } from '../../data/entities'
import { saveReportCommand, sendReportCommand } from '../report'

// Deterministic: the guard's env contract defaults to ON, but the suite must not
// silently pass because an ambient value turned it off.
process.env.OM_OPTIMISTIC_LOCK = 'all'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const ORG_A = '22222222-2222-4222-8222-222222222222'
const TENANT_B = '33333333-3333-4333-8333-333333333333'
const ORG_B = '44444444-4444-4444-8444-444444444444'
const ROW_ID = '55555555-5555-4555-8555-555555555555'

type Row = InterviewCase | CaseReport

/** In-memory stand-in for the scoped ORM/data-engine pair the commands resolve. */
function makeWorld() {
  const cases: InterviewCase[] = []
  const reports: CaseReport[] = []

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value === null) return row[key] == null
      return row[key] === value
    })

  function tableFor(entity: unknown): Row[] {
    return entity === CaseReport ? (reports as unknown as Row[]) : (cases as unknown as Row[])
  }

  const em = {
    findOne: async (entity: unknown, where: Record<string, unknown>) =>
      tableFor(entity).find((row) => matches(row as unknown as Record<string, unknown>, where)) ?? null,
    find: async (entity: unknown, where: Record<string, unknown>) =>
      tableFor(entity).filter((row) => matches(row as unknown as Record<string, unknown>, where)),
  }

  const dataEngine = {
    createOrmEntity: async ({ entity, data }: { entity: unknown; data: Record<string, unknown> }) => {
      const Ctor = entity as typeof InterviewCase | typeof CaseReport
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
  }

  const container = {
    resolve: (key: string) => {
      if (key === 'dataEngine') return dataEngine
      if (key === 'em') return em
      throw new Error(`Unexpected DI key in test: ${key}`)
    },
  }

  return { cases, reports, container }
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
    request: new Request('https://example.test/api/mercatify/cases/report', { headers }),
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
  overrides: { mappingConfirmedAt?: Date | null; status?: string } = {},
): Promise<InterviewCase> {
  const de = world.container.resolve('dataEngine') as any
  return de.createOrmEntity({
    entity: InterviewCase,
    data: {
      title: 'Sample interview case',
      status: overrides.status ?? 'mapped',
      companyName: 'Acme Co',
      tenantId: (ctx.auth as any).tenantId,
      organizationId: ctx.selectedOrganizationId,
      mappingConfirmedAt:
        overrides.mappingConfirmedAt !== undefined ? overrides.mappingConfirmedAt : new Date('2026-01-02T00:00:00.000Z'),
    },
  })
}

describe('mercatify report commands', () => {
  let world: World

  beforeEach(() => {
    world = makeWorld()
  })

  it('400s saving before the mapping is confirmed', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx, { mappingConfirmedAt: null })
    await expectCrudStatus(() => saveReportCommand.execute({ caseId: created.id }, ctx), 400)
    expect(world.reports).toHaveLength(0)
  })

  it('creates the single report row on the first save, then updates it', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)

    const first = await saveReportCommand.execute(
      { caseId: created.id, headline: 'Six tools duplicate the platform.', hourlyRate: 90 },
      ctx,
    )
    expect(world.reports).toHaveLength(1)
    expect(first.headline).toBe('Six tools duplicate the platform.')

    const second = await saveReportCommand.execute({ caseId: created.id, analyst: 'Joanna' }, ctx)
    expect(world.reports).toHaveLength(1)
    expect(second.id).toBe(first.id)
    // A partial save leaves untouched fields alone.
    expect(second.headline).toBe('Six tools duplicate the platform.')
    expect(second.analyst).toBe('Joanna')
  })

  it('drops a null hour estimate rather than persisting a misleading zero', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)

    const saved = await saveReportCommand.execute(
      { caseId: created.id, buildEstimates: { [ROW_ID]: null } },
      ctx,
    )
    expect(saved.buildEstimates).toEqual({})

    const estimated = await saveReportCommand.execute(
      { caseId: created.id, buildEstimates: { [ROW_ID]: 12 } },
      ctx,
    )
    expect(estimated.buildEstimates).toEqual({ [ROW_ID]: 12 })
  })

  it('409s on a stale version instead of clobbering a concurrent compose edit', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    await saveReportCommand.execute({ caseId: created.id, notes: 'First' }, ctx)

    const stale = new Date('2020-01-01T00:00:00.000Z').toISOString()
    await expectCrudStatus(
      () => saveReportCommand.prepare!({ caseId: created.id, notes: 'Clobbered' }, makeCtx(world, { expectedUpdatedAt: stale })),
      409,
    )
  })

  it('sends: stamps the report and flips the case to sent', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)

    const result = await sendReportCommand.execute({ caseId: created.id, notes: 'Start with stock.' }, ctx)

    expect(result.status).toBe('sent')
    expect(result.report.sentAt).toBeInstanceOf(Date)
    expect(result.report.notes).toBe('Start with stock.')
    expect(world.cases[0].status).toBe('sent')
  })

  it('400s sending before the mapping is confirmed, leaving the status alone', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx, { mappingConfirmedAt: null, status: 'mapping' })
    await expectCrudStatus(() => sendReportCommand.execute({ caseId: created.id }, ctx), 400)
    expect(world.cases[0].status).toBe('mapping')
  })

  it('re-sending replaces the copy but never walks back an answer the client gave', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    const first = await sendReportCommand.execute({ caseId: created.id }, ctx)

    // The client accepts (S-10's job; simulated here).
    world.cases[0].status = 'accepted'

    const second = await sendReportCommand.execute({ caseId: created.id, notes: 'Revised' }, ctx)
    expect(second.status).toBe('accepted')
    expect(world.cases[0].status).toBe('accepted')
    expect(second.report.sentAt!.getTime()).toBeGreaterThanOrEqual(first.report.sentAt!.getTime())
  })

  it('fails closed when tenant or organization context is missing, writing nothing', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)

    await expectCrudStatus(
      () => saveReportCommand.execute({ caseId: created.id }, makeCtx(world, { tenantId: null })),
      400,
    )
    await expectCrudStatus(
      () => sendReportCommand.execute({ caseId: created.id }, makeCtx(world, { organizationId: null })),
      400,
    )
    expect(world.reports).toHaveLength(0)
    expect(world.cases[0].status).toBe('mapped')
  })

  it("is blind to another tenant's case", async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    await expectCrudStatus(
      () => sendReportCommand.execute({ caseId: created.id }, makeCtx(world, { tenantId: TENANT_B, organizationId: ORG_B })),
      404,
    )
    expect(world.cases[0].status).toBe('mapped')
  })
})
