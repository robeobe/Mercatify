import { describe, expect, it, beforeEach, afterEach } from '@jest/globals'
import { randomUUID } from 'node:crypto'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { CaseReport, InterviewCase } from '../../data/entities'
import { registerMercatifyLabHandoffPort, type MercatifyHandoff } from '../../lib/mercatify-lab-port'
import { answerCaseCommand } from '../client-answer'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const ORG_A = '22222222-2222-4222-8222-222222222222'
const TENANT_B = '33333333-3333-4333-8333-333333333333'
const ORG_B = '44444444-4444-4444-8444-444444444444'
const OWNER = 'user-1'
const SOMEONE_ELSE = 'user-2'
const HANDOFF_DOCUMENT = '# Handoff\n\nExactly as the admin last left it.\n'

type Row = InterviewCase | CaseReport

/** Same in-memory stand-in as `report.test.ts` — scoped ORM + data engine. */
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
  overrides: { tenantId?: string | null; organizationId?: string | null; userId?: string | null } = {},
): CommandRuntimeContext {
  const tenantId = 'tenantId' in overrides ? overrides.tenantId : TENANT_A
  const organizationId = 'organizationId' in overrides ? overrides.organizationId : ORG_A
  const userId = 'userId' in overrides ? overrides.userId : OWNER
  return {
    container: world.container as unknown as CommandRuntimeContext['container'],
    auth: (tenantId ? { tenantId, sub: userId } : null) as CommandRuntimeContext['auth'],
    organizationScope: null,
    selectedOrganizationId: organizationId ?? null,
    organizationIds: organizationId ? [organizationId] : null,
    request: new Request('https://example.test/api/mercatify/cases/answer'),
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

/** A case whose report has been sent — the only state an answer is legal in. */
async function seedSentCase(
  world: World,
  overrides: {
    status?: string
    ownerId?: string | null
    sentAt?: Date | null
    handoffDocument?: string | null
  } = {},
): Promise<InterviewCase> {
  const de = world.container.resolve('dataEngine') as any
  const interviewCase: InterviewCase = await de.createOrmEntity({
    entity: InterviewCase,
    data: {
      title: 'Sample interview case',
      status: overrides.status ?? 'sent',
      tenantId: TENANT_A,
      organizationId: ORG_A,
      createdByUserId: overrides.ownerId !== undefined ? overrides.ownerId : OWNER,
      mappingConfirmedAt: new Date('2026-01-02T00:00:00.000Z'),
      handoffDocument: overrides.handoffDocument !== undefined ? overrides.handoffDocument : HANDOFF_DOCUMENT,
    },
  })
  await de.createOrmEntity({
    entity: CaseReport,
    data: {
      caseId: interviewCase.id,
      buildEstimates: {},
      sentAt: overrides.sentAt !== undefined ? overrides.sentAt : new Date('2026-01-03T00:00:00.000Z'),
      tenantId: TENANT_A,
      organizationId: ORG_A,
    },
  })
  return interviewCase
}

describe('mercatify.cases.answer', () => {
  let world: World

  beforeEach(() => {
    world = makeWorld()
  })

  it('records an acceptance against the request', async () => {
    const created = await seedSentCase(world)
    const result = await answerCaseCommand.execute({ caseId: created.id, answer: 'accepted' }, makeCtx(world))

    expect(result.status).toBe('accepted')
    expect(result.previousStatus).toBe('sent')
    expect(world.cases[0].status).toBe('accepted')
  })

  it('records a consult request against the request', async () => {
    const created = await seedSentCase(world)
    await answerCaseCommand.execute({ caseId: created.id, answer: 'consult' }, makeCtx(world))
    expect(world.cases[0].status).toBe('consult')
  })

  it('lets a client who asked for a call accept afterwards', async () => {
    const created = await seedSentCase(world, { status: 'consult' })
    const result = await answerCaseCommand.execute({ caseId: created.id, answer: 'accepted' }, makeCtx(world))
    expect(result.previousStatus).toBe('consult')
    expect(world.cases[0].status).toBe('accepted')
  })

  it('403s for anyone but the person who filed the request', async () => {
    const created = await seedSentCase(world)
    await expectCrudStatus(
      () => answerCaseCommand.execute({ caseId: created.id, answer: 'accepted' }, makeCtx(world, { userId: SOMEONE_ELSE })),
      403,
    )
    expect(world.cases[0].status).toBe('sent')
  })

  it('403s on a legacy case with no recorded owner rather than letting anyone answer it', async () => {
    const created = await seedSentCase(world, { ownerId: null })
    await expectCrudStatus(
      () => answerCaseCommand.execute({ caseId: created.id, answer: 'accepted' }, makeCtx(world)),
      403,
    )
  })

  it('400s before the report has been sent', async () => {
    const created = await seedSentCase(world, { status: 'mapped', sentAt: null })
    await expectCrudStatus(
      () => answerCaseCommand.execute({ caseId: created.id, answer: 'accepted' }, makeCtx(world)),
      400,
    )
    expect(world.cases[0].status).toBe('mapped')
  })

  it('400s when the status says sent but no report was ever stamped', async () => {
    const created = await seedSentCase(world, { sentAt: null })
    await expectCrudStatus(
      () => answerCaseCommand.execute({ caseId: created.id, answer: 'accepted' }, makeCtx(world)),
      400,
    )
    expect(world.cases[0].status).toBe('sent')
  })

  it("is blind to another tenant's case", async () => {
    const created = await seedSentCase(world)
    await expectCrudStatus(
      () => answerCaseCommand.execute(
        { caseId: created.id, answer: 'accepted' },
        makeCtx(world, { tenantId: TENANT_B, organizationId: ORG_B }),
      ),
      404,
    )
    expect(world.cases[0].status).toBe('sent')
  })

  it('fails closed when tenant, organization or user context is missing', async () => {
    const created = await seedSentCase(world)
    for (const overrides of [{ tenantId: null }, { organizationId: null }, { userId: null }]) {
      await expectCrudStatus(
        () => answerCaseCommand.execute({ caseId: created.id, answer: 'accepted' }, makeCtx(world, overrides)),
        400,
      )
    }
    expect(world.cases[0].status).toBe('sent')
  })

  it('rejects an answer that is not one of the two offered', async () => {
    const created = await seedSentCase(world)
    await expect(
      answerCaseCommand.execute({ caseId: created.id, answer: 'sent' }, makeCtx(world)),
    ).rejects.toThrow()
    expect(world.cases[0].status).toBe('sent')
  })
})

/** S-06 (#22): accepting the report is what hands the `.md` to Mercatify Lab. */
describe('mercatify.cases.answer — Mercatify Lab handoff', () => {
  let world: World

  beforeEach(() => {
    world = makeWorld()
  })

  afterEach(() => {
    registerMercatifyLabHandoffPort(null)
  })

  it('records the not-installed outcome with the exact document when Lab is absent', async () => {
    const created = await seedSentCase(world)
    const result = await answerCaseCommand.execute({ caseId: created.id, answer: 'accepted' }, makeCtx(world))

    expect(result.labHandoffStatus).toBe('not_installed')
    expect(world.cases[0].labHandoffStatus).toBe('not_installed')
    expect(world.cases[0].labHandoffDocument).toBe(HANDOFF_DOCUMENT)
    expect(world.cases[0].labHandoffAt).toBeInstanceOf(Date)
  })

  it('hands the admin-edited document, not a regenerated one, to an installed Lab', async () => {
    const edited = '# Pasted from elsewhere\n\nNothing like the mapping table.\n'
    const created = await seedSentCase(world, { handoffDocument: edited })
    const received: MercatifyHandoff[] = []
    registerMercatifyLabHandoffPort({
      receiveHandoff: async (handoff) => {
        received.push(handoff)
      },
    })

    const result = await answerCaseCommand.execute({ caseId: created.id, answer: 'accepted' }, makeCtx(world))

    expect(result.labHandoffStatus).toBe('delivered')
    expect(received).toHaveLength(1)
    expect(received[0].document).toBe(edited)
    expect(world.cases[0].labHandoffDocument).toBe(edited)
  })

  it('hands nothing over when the client asks for a call instead', async () => {
    const created = await seedSentCase(world)
    let called = false
    registerMercatifyLabHandoffPort({
      receiveHandoff: async () => {
        called = true
      },
    })

    const result = await answerCaseCommand.execute({ caseId: created.id, answer: 'consult' }, makeCtx(world))

    expect(result.labHandoffStatus).toBeNull()
    expect(called).toBe(false)
    expect(world.cases[0].labHandoffStatus ?? null).toBeNull()
  })

  it('records no_document when the admin never prepared one', async () => {
    const created = await seedSentCase(world, { handoffDocument: null })
    const result = await answerCaseCommand.execute({ caseId: created.id, answer: 'accepted' }, makeCtx(world))

    expect(result.labHandoffStatus).toBe('no_document')
    expect(world.cases[0].status).toBe('accepted')
  })

  it('still records the acceptance when Lab blows up', async () => {
    const created = await seedSentCase(world)
    registerMercatifyLabHandoffPort({
      receiveHandoff: async () => {
        throw new Error('lab exploded')
      },
    })

    const result = await answerCaseCommand.execute({ caseId: created.id, answer: 'accepted' }, makeCtx(world))

    expect(result.status).toBe('accepted')
    expect(result.labHandoffStatus).toBe('failed')
    expect(world.cases[0].status).toBe('accepted')
    expect(world.cases[0].labHandoffDocument).toBe(HANDOFF_DOCUMENT)
  })

  it('re-hands the current document when a consult client accepts later', async () => {
    const created = await seedSentCase(world, { status: 'consult' })
    const received: MercatifyHandoff[] = []
    registerMercatifyLabHandoffPort({
      receiveHandoff: async (handoff) => {
        received.push(handoff)
      },
    })

    await answerCaseCommand.execute({ caseId: created.id, answer: 'accepted' }, makeCtx(world))

    expect(received).toHaveLength(1)
    expect(received[0].document).toBe(HANDOFF_DOCUMENT)
  })
})
