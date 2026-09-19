import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { MercatifyRequest, type MercatifyRequestTool } from './data/entities'

type DemoSeedArgs = {
  organizationId: string
  tenantId: string
}

/**
 * One seeded case (Voltix Energy, from assets/shared/om-core.js SEED_REQUESTS[0])
 * so the console queue and the module's broad validation gates never start empty.
 */
const DEMO_TOOLS: MercatifyRequestTool[] = [
  { name: 'HubSpot', seats: 12, monthly: 1450, caps: ['crm.contacts', 'crm.pipeline', 'crm.email', 'quotes.cpq', 'marketing.email'] },
  { name: 'Zendesk', seats: 8, monthly: 420, caps: ['support.tickets', 'support.sla', 'support.kb'] },
  { name: 'Unleashed', seats: 6, monthly: 690, caps: ['inventory.stock', 'inventory.multiwarehouse', 'purchasing.po'] },
  { name: 'PandaDoc', seats: 10, monthly: 350, caps: ['docs.templates', 'esignature', 'docs.analytics'] },
  { name: 'Jobber', seats: 14, monthly: 560, caps: ['field.scheduling', 'field.jobsheets', 'invoicing'] },
  { name: 'Xero', seats: 4, monthly: 180, caps: ['accounting.ledger', 'accounting.bank', 'invoicing'] },
  { name: 'Airtable', seats: 20, monthly: 400, caps: ['data.custom', 'internal.apps', 'forms.intake'] },
  { name: 'Stripe Billing', seats: 3, monthly: 330, caps: ['payments', 'billing.subscriptions'] },
]

export async function seedMercatifyDemoRequest(
  em: EntityManager,
  { organizationId, tenantId }: DemoSeedArgs,
  options: { logger?: (message: string) => void } = {},
): Promise<boolean> {
  const logger = options.logger ?? (() => {})

  const existing = await em.count(MercatifyRequest, { organizationId, tenantId })
  if (existing > 0) {
    logger(`Mercatify demo request already seeded for org=${organizationId}, tenant=${tenantId}; skipping`)
    return false
  }

  const now = new Date()
  const request = em.create(MercatifyRequest, {
    organizationId,
    tenantId,
    createdAt: now,
    updatedAt: now,
    company: 'Voltix Energy',
    industry: 'Solar installer, B2C + small B2B',
    peopleCount: 34,
    currency: 'EUR',
    status: 'new',
    pains: 'Stock numbers live in three places. Quotes take a day. Nobody knows which installer holds which certificate.',
    mustKeep: 'Accounting stays with the bookkeeper. The e-signature provider is in our contracts.',
    tools: DEMO_TOOLS,
  })
  em.persist(request)
  await em.flush()

  logger(`Seeded 1 demo Mercatify request for org=${organizationId}, tenant=${tenantId}`)
  return true
}

function parseArgs(rest: string[]) {
  const args: Record<string, string | boolean> = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (!a) continue
    if (a.startsWith('--')) {
      const [k, v] = a.replace(/^--/, '').split('=')
      if (v !== undefined) args[k] = v
      else if (rest[i + 1] && !rest[i + 1]!.startsWith('--')) { args[k] = rest[i + 1]!; i++ }
      else args[k] = true
    }
  }
  return args
}

const seedDemo: ModuleCli = {
  command: 'seed-demo',
  async run(rest) {
    const args = parseArgs(rest)
    const organizationId = String(args.org || args.organizationId || '')
    const tenantId = String(args.tenant || args.tenantId || '')
    if (!organizationId || !tenantId) {
      console.error('Usage: mercato mercatify seed-demo --org <organizationId> --tenant <tenantId>')
      return
    }
    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    await seedMercatifyDemoRequest(em, { organizationId, tenantId }, { logger: (m) => console.log(m) })
  },
}

const cli = [seedDemo]
export default cli
