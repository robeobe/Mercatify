import type {
  MercatifyEvaluationRequest,
  MercatifyEvaluationResult,
  MercatifyLabPort,
} from './mercatify-lab-port'

const FOLLOW_UP_QUESTION = {
  id: 'billing-tool',
  prompt: 'Which billing/invoicing tool do you currently use, if any?',
  chips: ['QuickBooks', 'Xero', 'None — manual spreadsheets'],
}

const SCRIPTED_MAPPING = [
  {
    capability: 'CRM contacts',
    source: 'Salesforce',
    decision: 'native',
    target: { kind: 'om_module', moduleId: 'customers' },
    justification: 'Contact and company records are already covered by the customers module.',
    confidence: 'high',
  },
  {
    capability: 'Invoicing',
    source: 'FreshBooks',
    decision: 'configure',
    target: { kind: 'om_module', moduleId: 'sales' },
    justification: 'Sales module invoicing covers this once numbering and tax rules are configured.',
    confidence: 'medium',
  },
  {
    capability: 'Design collaboration',
    source: 'Figma',
    decision: 'keep',
    target: { kind: 'external_tool', name: 'Figma' },
    justification: 'No in-house equivalent; keep the existing external tool.',
    confidence: 'high',
  },
  {
    capability: 'Custom reporting dashboard',
    source: 'Google Sheets',
    decision: 'build',
    target: { kind: 'om_module', moduleId: 'dashboards' },
    justification: 'Requirements are specific enough that a custom widget is warranted.',
    confidence: 'low',
  },
  {
    capability: 'Marketing automation',
    source: 'Mailchimp',
    decision: 'integrate',
    target: { kind: 'external_tool', name: 'Mailchimp' },
    justification: 'Keep the external tool but wire it in via webhook/event integration.',
    confidence: 'medium',
  },
  {
    capability: 'Legacy inventory sync',
    source: 'Legacy ERP',
    decision: 'keep',
    target: { kind: 'unmapped' },
    justification: 'Not enough information yet to map this capability; flagged rather than dropped.',
    confidence: 'low',
  },
] as const

/**
 * Deterministic stand-in for Mercatify Lab: one `needs_more_info` round, then a
 * `complete` mapping exercising every decision, target kind and confidence band.
 */
export const scriptedMercatifyLabAdapter: MercatifyLabPort = {
  async evaluate(request: MercatifyEvaluationRequest): Promise<MercatifyEvaluationResult> {
    if (request.answers.length === 0) {
      return {
        contractVersion: 1,
        status: 'needs_more_info',
        question: FOLLOW_UP_QUESTION,
      }
    }

    return {
      contractVersion: 1,
      status: 'complete',
      mapping: SCRIPTED_MAPPING.map((row) => ({ ...row })),
    }
  },
}
