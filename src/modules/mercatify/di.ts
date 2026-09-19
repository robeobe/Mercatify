import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import {
  registerMercatifyLabHandoffPort,
  registerMercatifyLabPort,
  type MercatifyHandoff,
} from './lib/mercatify-lab-port'
import { scriptedMercatifyLabAdapter } from './lib/scripted-mercatify-lab-adapter'

/**
 * DEMO SHIM — not a real integration.
 *
 * Mercatify Lab does not exist as an installed module yet, so the handoff port
 * registry is empty and every handover reports "Lab is not installed". That is
 * the honest outcome, but it makes the demo's last step look like a dead end.
 *
 * This stand-in writes the document where a receiving Lab would have put it —
 * `<repo root>/mercatify-labs/handoffs/<caseId>.md` — and returns normally, so
 * the console shows "Delivered to Mercatify Lab" against a file you can open.
 * Delete this registration the moment a real Lab module ships: its own `di.ts`
 * calls `registerMercatifyLabHandoffPort` and would override it anyway.
 */
const HANDOFF_DIR = ['mercatify-labs', 'handoffs']

export function handoffFilePath(caseId: string): string {
  // `process.cwd()` is the app root under both `next dev` and `next start`.
  return path.join(process.cwd(), ...HANDOFF_DIR, `${caseId}.md`)
}

const demoLabHandoffPort = {
  async receiveHandoff(handoff: MercatifyHandoff): Promise<void> {
    const target = handoffFilePath(handoff.caseId)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, handoff.document, 'utf8')
  },
}

export function register(container: AppContainer) {
  // Registered unconditionally at bootstrap so a consumer can always resolve a
  // working port. Mercatify Lab, once it exists, overrides this from its own
  // di.ts `register()` by calling registerMercatifyLabPort() again.
  registerMercatifyLabPort(scriptedMercatifyLabAdapter)
  registerMercatifyLabHandoffPort(demoLabHandoffPort)
}
