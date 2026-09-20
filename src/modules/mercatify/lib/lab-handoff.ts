import { createLogger } from '@open-mercato/shared/lib/logger'
import { getMercatifyLabHandoffPort } from './mercatify-lab-port'

const logger = createLogger('mercatify')

export type LabHandoffStatus = 'delivered' | 'not_installed' | 'no_document' | 'failed'

export type LabHandoffOutcome = {
  status: LabHandoffStatus
  /** Exactly what was (or would have been) handed over. */
  document: string
  at: Date
}

export type LabHandoffInput = {
  caseId: string
  title: string
  tenantId: string
  organizationId: string
  /** The case's current `.md`, read at handoff time. */
  document: string | null
}

/**
 * S-06 (FR-012/FR-013): hand the case's current handoff document to Mercatify
 * Lab.
 *
 * Every branch returns an outcome and the document — none throws. "Lab is not
 * installed" is the default state of the port registry and a first-class
 * result, not a failure: it is what the demo runs on until Lab ships a
 * receiving surface. A delivery that does blow up is recorded as `failed` and
 * still keeps the text, so the caller (the client's Accept) is never the thing
 * that breaks.
 */
export async function handOffToLab(input: LabHandoffInput): Promise<LabHandoffOutcome> {
  const document = input.document ?? ''
  const at = new Date()

  // Nothing was ever prepared for this case. Also not an error — the admin
  // simply never opened the handoff editor before the client accepted.
  if (document.trim().length === 0) return { status: 'no_document', document, at }

  const port = getMercatifyLabHandoffPort()
  if (!port) return { status: 'not_installed', document, at }

  try {
    await port.receiveHandoff({
      contractVersion: 1,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      caseId: input.caseId,
      title: input.title,
      document,
    })
    return { status: 'delivered', document, at }
  } catch (err) {
    logger.error('mercatify lab handoff failed', { err, caseId: input.caseId })
    return { status: 'failed', document, at }
  }
}
