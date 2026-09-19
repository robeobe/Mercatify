import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer, type AppContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { InterviewCase } from './data/entities'

/**
 * HARDCODED: the demo's client persona. The sample case has to belong to
 * *somebody* for `?mine=true` and the client-answer guard to work, and the seed
 * has no other way to know who the client is. Unresolvable email → the case is
 * seeded ownerless, exactly as before.
 */
const DEMO_CLIENT_EMAIL = 'employee@acme.com'

async function findDemoClientUserId(em: EntityManager, tenantId: string): Promise<string | null> {
  try {
    const user = await em.findOne(User, { email: DEMO_CLIENT_EMAIL, tenantId } as any)
    return user ? String(user.id) : null
  } catch {
    return null
  }
}

type CaseSeedScope = {
  organizationId: string
  tenantId: string
}

function parseArgs(rest: string[]) {
  const args: Record<string, string | boolean> = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (!a || !a.startsWith('--')) continue
    const [k, v] = a.replace(/^--/, '').split('=')
    if (v !== undefined) args[k] = v
    else if (rest[i + 1] && !rest[i + 1]!.startsWith('--')) { args[k] = rest[i + 1]!; i++ }
    else args[k] = true
  }
  return args
}

/**
 * Seed one neutral placeholder case. Idempotent: a scope that already holds a
 * case is left untouched, so the CLI and `setup.seedExamples` can both run it.
 */
export async function seedMercatifyCases(
  em: EntityManager,
  _container: AppContainer,
  { organizationId, tenantId }: CaseSeedScope,
  options: { logger?: (message: string) => void } = {},
): Promise<boolean> {
  const logger = options.logger ?? (() => {})

  const existing = await em.count(InterviewCase, { organizationId, tenantId })
  if (existing > 0) {
    logger(`Mercatify cases already seeded for org=${organizationId}, tenant=${tenantId}; skipping`)
    return false
  }

  // Deliberately generic: the PRD forbids a hardcoded example company.
  const now = new Date()
  const createdByUserId = await findDemoClientUserId(em, tenantId)
  em.persist(em.create(InterviewCase, {
    title: 'Sample interview case',
    status: 'draft',
    organizationId,
    tenantId,
    createdByUserId,
    createdAt: now,
    updatedAt: now,
  }))
  await em.flush()

  logger(
    createdByUserId
      ? `Seeded 1 interview case for org=${organizationId}, tenant=${tenantId}, owner=${DEMO_CLIENT_EMAIL}`
      : `Seeded 1 ownerless interview case for org=${organizationId}, tenant=${tenantId} (${DEMO_CLIENT_EMAIL} not found)`,
  )
  return true
}

const seedCases: ModuleCli = {
  command: 'seed-cases',
  async run(rest) {
    const args = parseArgs(rest)
    const orgId = (args.org || args.organizationId) as string | undefined
    const tenantId = (args.tenant || args.tenantId) as string | undefined
    if (!orgId || !tenantId) {
      console.error('Usage: mercato mercatify seed-cases --org <organizationId> --tenant <tenantId>')
      return
    }
    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    await seedMercatifyCases(em, container, { organizationId: orgId, tenantId }, { logger: (m) => console.log(m) })
  },
}

export default [seedCases]
export type { CaseSeedScope as MercatifyCaseSeedScope }
