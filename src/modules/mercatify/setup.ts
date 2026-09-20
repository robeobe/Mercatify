import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedMercatifyDemoRequest } from './cli'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['mercatify.*'],
    // Admin runs the console (queue, mapping, reports) — not the client-side intake
    // form, so it deliberately omits mercatify.requests.submit. Granting the
    // wildcard here made "Your stack" show up in an admin's own nav, which makes
    // no sense for a role that never submits its own stack.
    admin: ['mercatify.backend', 'mercatify.requests.view', 'mercatify.requests.manage'],
    employee: ['mercatify.backend', 'mercatify.requests.view', 'mercatify.requests.submit'],
  },

  // Skipped by `--no-examples`; keeps the console queue from starting empty on the demo tenant.
  async seedExamples({ em, tenantId, organizationId }) {
    await seedMercatifyDemoRequest(em, { organizationId, tenantId })
  },
}

export default setup
