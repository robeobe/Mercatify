import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['mercatify.*'],
    admin: ['mercatify.*'],
    employee: ['mercatify.cases.view'],
  },
}

export default setup
