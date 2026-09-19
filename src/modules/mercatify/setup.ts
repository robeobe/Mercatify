import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { seedMercatifyCases } from './cli'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['mercatify.*'],
    admin: ['mercatify.*'],
    employee: ['mercatify.cases.view'],
  },

  // `seedExamples`, not `seedDefaults`: this is demo domain data, so
  // `mercato init --no-examples` must skip it.
  async seedExamples({ em, container, tenantId, organizationId }) {
    await seedMercatifyCases(em, container as AppContainer, { organizationId, tenantId })
  },
}

export default setup
