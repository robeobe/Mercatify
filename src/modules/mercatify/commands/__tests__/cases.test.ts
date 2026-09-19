import { describe, expect, it, beforeEach, jest } from '@jest/globals'
import { randomUUID } from 'node:crypto'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { OPTIMISTIC_LOCK_HEADER_NAME } from '@open-mercato/shared/lib/crud/optimistic-lock-headers'
import { InterviewCase, InterviewCaseTool } from '../../data/entities'
import { createCaseCommand, updateCaseCommand, deleteCaseCommand } from '../cases'

process.env.OM_OPTIMISTIC_LOCK = 'all'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const ORG_A = '22222222-2222-4222-8222-222222222222'
const TENANT_B = '33333333-3333-4333-8333-333333333333'
const ORG_B = '44444444-4444-4444-8444-444444444444'

jest.mock('@open-mercato/shared/lib/commands/flush', () => ({
  withAtomicFlush: async (_em: unknown, phases: Array<() => unknown>) => {
    for (const phase of phases) await phase()
  },
}))

type CaseRow = InterviewCase
type ToolRow = InterviewCaseTool

function readRefId(value: unknown): unknown {
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return (value as { id: unknown }).id
  }
  return value
}

/** In-memory stand-in for the scoped ORM/data-engine pair the commands resolve. */
function makeWorld() {
  const cases: CaseRow[] = []
  const tools: ToolRow[] = []

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      const actual = key === 'interviewCase' ? readRefId(row.interviewCase ?? row.interview_case_id) : row[key]
      if (value && typeof value === 'object' && '$in' in (value as Record<string, unknown>)) {
        return (value as { $in: unknown[] }).$in.includes(actual)
      }
      if (value === null) return actual == null
      return actual === value
    })

  const createEntity = (Entity: typeof InterviewCase | typeof InterviewCaseTool, data: Record<string, unknown>) => {
    const row = Object.assign(new Entity(), {
      id: (data.id as string | undefined) ?? randomUUID(),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      selectedModuleIds: [],
      ...data,
    })
    return row
  }

  const em = {
    fork() {
      return em
    },
    create(Entity: typeof InterviewCase | typeof InterviewCaseTool, data: Record<string, unknown>) {
      return createEntity(Entity, data)
    },
    persist(row: CaseRow | ToolRow) {
      if (row instanceof InterviewCaseTool) {
        if (!tools.includes(row)) tools.push(row)
        return
      }
      if (!cases.includes(row as CaseRow)) cases.push(row as CaseRow)
    },
    remove(row: ToolRow) {
      const index = tools.indexOf(row)
      if (index >= 0) tools.splice(index, 1)
    },
    findOne: async (entity: unknown, where: Record<string, unknown>) => {
      const pool = entity === InterviewCaseTool ? tools : cases
      return pool.find((row) => matches(row as unknown as Record<string, unknown>, where)) ?? null
    },
    find: async (entity: unknown, where: Record<string, unknown>) => {
      const pool = entity === InterviewCaseTool ? tools : cases
      return pool.filter((row) => matches(row as unknown as Record<string, unknown>, where))
    },
    flush: async () => undefined,
  }

  const marks: Array<{ action: string; id: string }> = []

  const dataEngine = {
    deleteOrmEntity: async ({ where }: { entity: unknown; where: Record<string, unknown> }) => {
      const row = cases.find((candidate) => matches(candidate as unknown as Record<string, unknown>, where))
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

  return { cases, tools, rows: cases, marks, container }
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
    const created = await createCaseCommand.execute(
      { companyName: 'Sample interview case' },
      makeCtx(world),
    )
    expect(created.tenantId).toBe(TENANT_A)
    expect(created.organizationId).toBe(ORG_A)
    expect(created.status).toBe('draft')
    expect(created.title).toBe('Sample interview case')
    expect(created.createdByUserId).toBe('user-1')
    expect(created.submittedAt).toBeNull()

    const updated = await updateCaseCommand.execute(
      { id: created.id, companyName: 'Renamed', status: 'draft' },
      makeCtx(world),
    )
    expect(updated.title).toBe('Renamed')
    expect(updated.status).toBe('draft')

    const deleted = await deleteCaseCommand.execute({ id: created.id }, makeCtx(world))
    expect(deleted.deletedAt).toBeInstanceOf(Date)
    expect(world.marks.map((m) => m.action)).toEqual(['created', 'updated', 'deleted'])
  })

  it('persists tool rows on create', async () => {
    const created = await createCaseCommand.execute(
      {
        companyName: 'Acme',
        tools: [
          { name: 'HubSpot', catalogToolId: 'hubspot', selectedModuleIds: ['sales'], seats: 12, monthlyCost: 400 },
          { name: 'Custom CRM', catalogToolId: null, customUse: 'Legacy pipeline', monthlyCost: 90 },
        ],
      },
      makeCtx(world),
    )
    expect(world.tools).toHaveLength(2)
    expect(world.tools.every((row) => readRefId(row.interviewCase) === created.id)).toBe(true)
    expect(world.tools.map((row) => row.name).sort()).toEqual(['Custom CRM', 'HubSpot'])
    expect(world.tools.every((row) => row.tenantId === TENANT_A && row.organizationId === ORG_A)).toBe(true)
  })

  it('diff-upserts tools: keeps an edited id, creates a new row, and drops omitted rows', async () => {
    const created = await createCaseCommand.execute(
      {
        companyName: 'Acme',
        tools: [
          { name: 'Keep me', catalogToolId: 'hubspot', selectedModuleIds: ['sales'], monthlyCost: 10 },
          { name: 'Drop me', catalogToolId: 'zendesk', selectedModuleIds: ['support'], monthlyCost: 20 },
        ],
      },
      makeCtx(world),
    )
    const kept = world.tools.find((row) => row.name === 'Keep me')!
    await updateCaseCommand.execute(
      {
        id: created.id,
        tools: [
          { id: kept.id, name: 'Keep me edited', catalogToolId: 'hubspot', selectedModuleIds: ['sales', 'ops'], monthlyCost: 15 },
          { name: 'Brand new', catalogToolId: null, customUse: 'Billing' },
        ],
      },
      makeCtx(world),
    )
    expect(world.tools).toHaveLength(2)
    expect(world.tools.find((row) => row.id === kept.id)?.name).toBe('Keep me edited')
    expect(world.tools.find((row) => row.id === kept.id)?.selectedModuleIds).toEqual(['sales', 'ops'])
    expect(world.tools.some((row) => row.name === 'Drop me')).toBe(false)
    expect(world.tools.some((row) => row.name === 'Brand new' && row.id !== kept.id)).toBe(true)
  })

  it('fails closed when the tenant context is missing, writing nothing', async () => {
    await expectCrudStatus(
      () => createCaseCommand.execute({ companyName: 'Unscoped' }, makeCtx(world, { tenantId: null })),
      400,
    )
    expect(world.rows).toHaveLength(0)
  })

  it('fails closed when the organization context is missing, writing nothing', async () => {
    await expectCrudStatus(
      () => createCaseCommand.execute({ companyName: 'Unscoped' }, makeCtx(world, { organizationId: null })),
      400,
    )
    expect(world.rows).toHaveLength(0)
  })

  it("is blind to another tenant's case and its tool rows for both read and write", async () => {
    const mine = await createCaseCommand.execute(
      {
        companyName: 'Tenant A case',
        tools: [{ name: 'HubSpot', catalogToolId: 'hubspot', selectedModuleIds: ['sales'] }],
      },
      makeCtx(world),
    )
    const otherTenantCtx = makeCtx(world, { tenantId: TENANT_B, organizationId: ORG_B })

    await expectCrudStatus(() => updateCaseCommand.prepare!({ id: mine.id, companyName: 'Hijacked' }, otherTenantCtx), 404)
    await expectCrudStatus(() => updateCaseCommand.execute({ id: mine.id, companyName: 'Hijacked' }, otherTenantCtx), 404)
    await expectCrudStatus(() => deleteCaseCommand.execute({ id: mine.id }, otherTenantCtx), 404)

    expect(world.rows).toHaveLength(1)
    expect(world.rows[0].title).toBe('Tenant A case')
    expect(world.rows[0].deletedAt).toBeNull()
    expect(world.tools).toHaveLength(1)
    expect(world.tools[0].tenantId).toBe(TENANT_A)
  })

  it('raises a 409 conflict on a stale expected version instead of overwriting', async () => {
    const created = await createCaseCommand.execute({ companyName: 'Locked' }, makeCtx(world))
    const stale = new Date('2020-01-01T00:00:00.000Z').toISOString()

    await expectCrudStatus(
      () =>
        updateCaseCommand.prepare!(
          { id: created.id, companyName: 'Clobbered' },
          makeCtx(world, { expectedUpdatedAt: stale }),
        ),
      409,
    )
    expect(world.rows[0].title).toBe('Locked')
  })

  it('accepts a matching expected version and does not lock tool rows independently', async () => {
    const created = await createCaseCommand.execute(
      {
        companyName: 'Locked',
        tools: [{ name: 'HubSpot', catalogToolId: 'hubspot', selectedModuleIds: ['sales'] }],
      },
      makeCtx(world),
    )
    const current = created.updatedAt.toISOString()

    await expect(
      Promise.resolve().then(() =>
        updateCaseCommand.prepare!(
          { id: created.id, companyName: 'Fine' },
          makeCtx(world, { expectedUpdatedAt: current }),
        ),
      ),
    ).resolves.toBeTruthy()
    expect(world.tools[0].updatedAt).toBeInstanceOf(Date)
  })

  it('lets an unversioned update through as a documented additive no-op', async () => {
    const created = await createCaseCommand.execute({ companyName: 'Unversioned' }, makeCtx(world))
    await expect(
      Promise.resolve().then(() => updateCaseCommand.prepare!({ id: created.id, companyName: 'Fine' }, makeCtx(world))),
    ).resolves.toBeTruthy()
  })

  it('rejects sending with zero tools', async () => {
    const created = await createCaseCommand.execute({ companyName: 'Empty' }, makeCtx(world))
    await expectCrudStatus(
      () => updateCaseCommand.execute({ id: created.id, status: 'new' }, makeCtx(world)),
      400,
    )
    expect(world.rows[0].status).toBe('draft')
  })

  it('rejects editing profile or tools on a non-draft case', async () => {
    const created = await createCaseCommand.execute(
      {
        companyName: 'Sent',
        status: 'new',
        tools: [{ name: 'HubSpot', catalogToolId: 'hubspot', selectedModuleIds: ['sales'] }],
      },
      makeCtx(world),
    )
    expect(created.status).toBe('new')
    expect(created.createdByUserId).toBe('user-1')
    expect(created.submittedAt).toBeInstanceOf(Date)
    await expectCrudStatus(
      () => updateCaseCommand.execute({ id: created.id, companyName: 'Tampered' }, makeCtx(world)),
      400,
    )
    expect(world.rows[0].companyName).toBe('Sent')
  })

  // S-09 / issue #20: sending the report is the only thing that may produce
  // `sent`. The schema still accepts the value (the BC contract forbids
  // narrowing a published validator), so the refusal has to live here.
  it('refuses to move a case to sent — only mercatify.report.send may do that', async () => {
    const created = await createCaseCommand.execute(
      {
        companyName: 'Awaiting report',
        status: 'new',
        tools: [{ name: 'HubSpot', catalogToolId: 'hubspot', selectedModuleIds: ['sales'] }],
      },
      makeCtx(world),
    )
    await expectCrudStatus(
      () => updateCaseCommand.execute({ id: created.id, status: 'sent' }, makeCtx(world)),
      400,
    )
    expect(world.rows[0].status).toBe('new')
  })
})
