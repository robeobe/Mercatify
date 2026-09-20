import { afterEach, describe, expect, it } from '@jest/globals'
import { handOffToLab } from './lab-handoff'
import { registerMercatifyLabHandoffPort, type MercatifyHandoff } from './mercatify-lab-port'

const CASE = {
  caseId: '55555555-5555-4555-8555-555555555555',
  title: 'Acme stack consolidation',
  tenantId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
}

const DOCUMENT = '# Handoff\n\nEdited by the admin, pasted from elsewhere.\n'

afterEach(() => {
  // The registry is module-level state; leaving a port behind would leak into
  // the next test and turn "not installed" into "installed".
  registerMercatifyLabHandoffPort(null)
})

describe('handOffToLab', () => {
  it('reports not_installed and keeps the content when no Lab is registered', async () => {
    const outcome = await handOffToLab({ ...CASE, document: DOCUMENT })
    expect(outcome.status).toBe('not_installed')
    expect(outcome.document).toBe(DOCUMENT)
  })

  it('hands exactly the current document to a registered Lab', async () => {
    const received: MercatifyHandoff[] = []
    registerMercatifyLabHandoffPort({
      receiveHandoff: async (handoff) => {
        received.push(handoff)
      },
    })

    const outcome = await handOffToLab({ ...CASE, document: DOCUMENT })

    expect(outcome.status).toBe('delivered')
    expect(received).toHaveLength(1)
    expect(received[0].document).toBe(DOCUMENT)
    expect(received[0]).toMatchObject({
      contractVersion: 1,
      caseId: CASE.caseId,
      tenantId: CASE.tenantId,
      organizationId: CASE.organizationId,
      title: CASE.title,
    })
  })

  it('reports no_document when nothing was ever prepared, without calling Lab', async () => {
    let called = false
    registerMercatifyLabHandoffPort({
      receiveHandoff: async () => {
        called = true
      },
    })

    for (const document of [null, '', '   \n  ']) {
      const outcome = await handOffToLab({ ...CASE, document })
      expect(outcome.status).toBe('no_document')
    }
    expect(called).toBe(false)
  })

  it('reports failed instead of throwing when Lab rejects the handover', async () => {
    registerMercatifyLabHandoffPort({
      receiveHandoff: async () => {
        throw new Error('lab exploded')
      },
    })

    const outcome = await handOffToLab({ ...CASE, document: DOCUMENT })
    expect(outcome.status).toBe('failed')
    expect(outcome.document).toBe(DOCUMENT)
  })
})
