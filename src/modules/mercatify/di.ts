import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { registerMercatifyLabPort } from './lib/mercatify-lab-port'
import { scriptedMercatifyLabAdapter } from './lib/scripted-mercatify-lab-adapter'

export function register(container: AppContainer) {
  // Registered unconditionally at bootstrap so a consumer can always resolve a
  // working port. Mercatify Lab, once it exists, overrides this from its own
  // di.ts `register()` by calling registerMercatifyLabPort() again.
  registerMercatifyLabPort(scriptedMercatifyLabAdapter)
}
