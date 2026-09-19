/// <reference types="jest" />
import {
  getMercatifyLabPort,
  registerMercatifyLabPort,
  type MercatifyLabPort,
} from './mercatify-lab-port'
import { scriptedMercatifyLabAdapter } from './scripted-mercatify-lab-adapter'

describe('MercatifyLabPort registry', () => {
  afterEach(() => {
    // Restore the default so other test files resolving the port aren't affected.
    registerMercatifyLabPort(scriptedMercatifyLabAdapter)
  })

  it('swapping the registered implementation changes what getMercatifyLabPort() resolves to', async () => {
    registerMercatifyLabPort(scriptedMercatifyLabAdapter)
    const defaultResult = await getMercatifyLabPort().evaluate({
      contractVersion: 1,
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      caseId: 'case-1',
      companyProfile: {},
      saasTools: [],
      answers: [],
    })
    expect(defaultResult.status).toBe('needs_more_info')

    const alwaysComplete: MercatifyLabPort = {
      async evaluate() {
        return { contractVersion: 1, status: 'complete', mapping: [] }
      },
    }
    registerMercatifyLabPort(alwaysComplete)

    const swappedResult = await getMercatifyLabPort().evaluate({
      contractVersion: 1,
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      caseId: 'case-1',
      companyProfile: {},
      saasTools: [],
      answers: [],
    })
    expect(swappedResult.status).toBe('complete')
  })
})
