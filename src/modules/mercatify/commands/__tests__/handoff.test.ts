import { describe, expect, it, beforeEach } from '@jest/globals'
import { randomUUID } from 'node:crypto'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { OPTIMISTIC_LOCK_HEADER_NAME } from '@open-mercato/shared/lib/crud/optimistic-lock-headers'
import { InterviewCase, MappingRow } from '../../data/entities'
import { generateHandoffDocumentCommand, updateHandoffDocumentCommand } from '../handoff'

// Deterministic: the guard's env contract defaults to ON, but the suite must not
// silently pass because an ambient value turned it off.
process.env.OM_OPTIMISTIC_LOCK = 'all'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const ORG_A = '22222222-2222-4222-8222-222222222222'
const TENANT_B = '33333333-3333-4333-8333-333333333333'
const ORG_B = '44444444-4444-4444-8444-444444444444'

type Row = InterviewCase | MappingRow

/** In-memory stand-in for the scoped ORM/data-engine pair the commands resolve. */
function makeWorld() {
  const cases: InterviewCase[] = []
  const rows: MappingRow[] = []

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value === null) return row[key] == null
      return row[key] === value
    })

  function tableFor(entity: unknown): Row[] {
    return entity === MappingRow ? (rows as unknown as Row[]) : (cases as unknown as Row[])
  }

  const em = {
    findOne: async (entity: unknown, where: Record<string, unknown>) =>
      tableFor(entity).find((row) => matches(row as unknown as Record<string, unknown>, where)) ?? null,
    find: async (entity: unknown, where: Record<string, unknown>) =>
      tableFor(entity).filter((row) => matches(row as unknown as Record<string, unknown>, where)),
  }

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
  }

  const container = {
    resolve: (key: string) => {
      if (key === 'dataEngine') return dataEngine
      if (key === 'em') return em
      throw new Error(`Unexpected DI key in test: ${key}`)
    },
  }

  return { cases, rows, container }
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
    request: new Request('https://example.test/api/mercatify/handoff-document', { headers }),
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
  overrides: { mappingConfirmedAt?: Date | null } = {},
): Promise<InterviewCase> {
  const de = world.container.resolve('dataEngine') as any
  return de.createOrmEntity({
    entity: InterviewCase,
    data: {
      title: 'Sample interview case',
      status: 'mapped',
      companyName: 'Acme Co',
      tenantId: (ctx.auth as any).tenantId,
      organizationId: ctx.selectedOrganizationId,
      mappingConfirmedAt: overrides.mappingConfirmedAt !== undefined ? overrides.mappingConfirmedAt : new Date('2026-01-02T00:00:00.000Z'),
    },
  })
}

async function seedRow(world: World, caseId: string, ctx: CommandRuntimeContext): Promise<MappingRow> {
  const de = world.container.resolve('dataEngine') as any
  return de.createOrmEntity({
    entity: MappingRow,
    data: {
      caseId,
      position: 0,
      capability: 'Customer records',
      decision: 'native',
      targetKind: 'om_module',
      targetLabel: 'Admin Dashboards',
      justification: 'Direct fit',
      confidence: 'high',
      flagged: false,
      flagReason: null,
      tenantId: (ctx.auth as any).tenantId,
      organizationId: ctx.selectedOrganizationId,
    },
  })
}

describe('mercatify handoff document commands', () => {
  let world: World

  beforeEach(() => {
    world = makeWorld()
  })

  it('400s generating before the mapping is confirmed', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx, { mappingConfirmedAt: null })
    await expectCrudStatus(() => generateHandoffDocumentCommand.execute({ caseId: created.id }, ctx), 400)
  })

  it('generates a document from the confirmed mapping, once, and never re-runs after a manual edit', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    await seedRow(world, created.id, ctx)

    const first = await generateHandoffDocumentCommand.execute({ caseId: created.id }, ctx)
    expect(first.generated).toBe(true)
    expect(first.handoffDocument).toContain('Acme Co')
    expect(first.handoffDocument).toContain('Customer records')

    // The independence invariant from PRD Open Question 8: an admin edit
    // (paste-replace or free edit) must survive any later `generate` call —
    // table and document never re-sync.
    const manuallyEdited = 'Completely different, admin-authored content.'
    await updateHandoffDocumentCommand.execute({ id: created.id, content: manuallyEdited }, ctx)

    const second = await generateHandoffDocumentCommand.execute({ caseId: created.id }, ctx)
    expect(second.generated).toBe(false)
    expect(second.handoffDocument).toBe(manuallyEdited)
  })

  it('lets the admin edit freely, and 409s on a stale version', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    await seedRow(world, created.id, ctx)
    await generateHandoffDocumentCommand.execute({ caseId: created.id }, ctx)

    const updated = await updateHandoffDocumentCommand.execute({ id: created.id, content: 'Replaced entirely' }, ctx)
    expect(updated.handoffDocument).toBe('Replaced entirely')

    const stale = new Date('2020-01-01T00:00:00.000Z').toISOString()
    await expectCrudStatus(
      () =>
        updateHandoffDocumentCommand.prepare!(
          { id: created.id, content: 'Clobbered' },
          makeCtx(world, { expectedUpdatedAt: stale }),
        ),
      409,
    )
  })

  it('fails closed when tenant/organization context is missing, writing nothing', async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    await expectCrudStatus(
      () => generateHandoffDocumentCommand.execute({ caseId: created.id }, makeCtx(world, { tenantId: null })),
      400,
    )
    expect(created.handoffDocument ?? null).toBeNull()
  })

  it("is blind to another tenant's case", async () => {
    const ctx = makeCtx(world)
    const created = await seedCase(world, ctx)
    await expectCrudStatus(
      () => generateHandoffDocumentCommand.execute({ caseId: created.id }, makeCtx(world, { tenantId: TENANT_B, organizationId: ORG_B })),
      404,
    )
  })
})
