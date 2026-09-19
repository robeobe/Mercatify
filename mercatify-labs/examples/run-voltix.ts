/**
 * Runs the full Voltix demo request through the Orchestrator against a real
 * OpenAI-compatible LLM endpoint (LM Studio by default). Not part of the
 * automated test suite — this makes a real network call.
 *
 * Usage:
 *   LLM_BASE_URL=http://127.0.0.1:1234/v1 LLM_MODEL=qwen/qwen3-vl-30b \
 *     npx ts-node examples/run-voltix.ts
 *
 * Env vars (all optional, defaults target a local LM Studio):
 *   LLM_BASE_URL   default "http://127.0.0.1:1234/v1"
 *   LLM_MODEL      default "qwen/qwen3-vl-30b"
 *   LLM_API_KEY    default "lm-studio" (LM Studio ignores it, real providers need it)
 *   DETERMINISTIC  set to "1" to skip the LLM entirely and run core-only
 */
import { Orchestrator, OpenAiCompatibleLlmClient, type ConsolidationRequest } from '../src'

const request: ConsolidationRequest = {
  company: { name: 'Voltix', industry: 'Solar & Energy Installation', employees: 42, currency: 'EUR' },
  processHint: 'lead to quote',
  stack: [
    { name: 'HubSpot', monthlyCost: 1600, usageNotes: 'We track homeowner and business contacts, run deals through our install pipeline, and keep company records for commercial clients.' },
    { name: 'Typeform', monthlyCost: 60, usageNotes: 'Our website "Get a quote" form that captures new leads.' },
    { name: 'Airtable', monthlyCost: 250, usageNotes: 'We log roof type, estimated capacity and survey photos for every site visit.' },
    { name: 'Zapier', monthlyCost: 140, usageNotes: 'HubSpot deal won triggers a new Airtable row; Typeform submits forward to HubSpot.' },
    { name: 'PandaDoc', monthlyCost: 350, usageNotes: 'Installation quotes with line items, approved by a manager above 10k.' },
    { name: 'Calendly', monthlyCost: 50, usageNotes: 'Booking the on-site survey visit.' },
    { name: 'Slack', monthlyCost: 70, usageNotes: 'Just team chat for coordinating the install crews.' },
  ],
  costs: { omOperatingCost: 8400, implementationCost: 12000 },
}

async function main() {
  const deterministicOnly = process.env.DETERMINISTIC === '1'
  const orchestrator = new Orchestrator(
    deterministicOnly
      ? {}
      : {
          llmClient: new OpenAiCompatibleLlmClient({
            baseURL: process.env.LLM_BASE_URL ?? 'http://127.0.0.1:1234/v1',
            model: process.env.LLM_MODEL ?? 'qwen/qwen3-vl-30b',
            apiKey: process.env.LLM_API_KEY ?? 'lm-studio',
          }),
        },
  )

  if (deterministicOnly) {
    // Deterministic mode requires capabilities up front — usageNotes alone isn't enough.
    console.error('DETERMINISTIC=1 needs `capabilities` per tool, not `usageNotes`. See SPEC.md §9.')
    process.exit(1)
  }

  const result = await orchestrator.run(request)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
