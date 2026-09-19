import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedMercatifyDemoRequest } from './cli'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['mercatify.*'],
    admin: ['mercatify.*'],
    employee: ['mercatify.backend', 'mercatify.requests.view', 'mercatify.requests.submit'],
  },

  // Skipped by `--no-examples`; keeps the console queue from starting empty on the demo tenant.
  async seedExamples({ em, tenantId, organizationId }) {
    await seedMercatifyDemoRequest(em, { organizationId, tenantId })
  },
}

export default setup
