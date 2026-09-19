# Mercatify Labs

An AI consolidation company engine: deterministic catalog/ROI core + 6
portable LLM agents. See **[SPEC.md](./SPEC.md)** for the architecture,
the iron rules, and the roadmap for extending it (§11). This file is
just "how do I run it."

## Requirements

- Node.js 18+ (uses global `fetch`)
- npm

## Install

```bash
npm install
```

## Typecheck

```bash
npm run typecheck
```

## Test (fast, offline — no network, no LLM, no API key needed)

```bash
npm test
```

17 tests across 4 suites: the two deterministic engines
(`mapCapabilities`, `computeScenario`), the `Orchestrator` (both
deterministic-only and with a fake `LlmClient`, proving agents pass
data to each other correctly and the numbers are never trusted from an
agent), and the Catalog Curator (fake `LlmClient`, no real search).
None of this touches the network — safe to run anywhere, including CI.

## Use it without any LLM (deterministic-only)

Works as long as every stack entry already has `capabilities` — no
free-text classification step needed:

```ts
import { Orchestrator } from './src'

const orchestrator = new Orchestrator() // no llmClient — narrative fields are omitted
const result = await orchestrator.run({
  company: { name: 'Voltix', industry: 'Solar', employees: 42, currency: 'EUR' },
  stack: [
    { name: 'HubSpot', monthlyCost: 1600, capabilities: [{ capability: 'contacts' }, { capability: 'deals' }] },
    { name: 'PandaDoc', monthlyCost: 350, capabilities: [{ capability: 'quote_documents' }] },
  ],
  costs: { omOperatingCost: 8400, implementationCost: 12000 },
})

console.log(result.mappings) // decisions + confidence, from the catalog
console.log(result.scenario) // gross/net saving, payback — always computed, never guessed
```

## Run it for real, against an LLM

Copy the env template and fill in an OpenAI-compatible endpoint (a
local LM Studio server by default, or point it at real OpenAI/any
other compatible provider):

```bash
cp .env.example .env
# edit .env — for LM Studio, LLM_BASE_URL usually needs the `/v1` suffix
```

```bash
npm run example:voltix
```

Runs the full 7-tool Voltix demo case through all 5 core agents and
prints the complete `ConsolidationResult` JSON. Env vars (all
optional, see `.env.example`): `LLM_BASE_URL`, `LLM_MODEL`,
`LLM_API_KEY`.

To use `OpenAiCompatibleLlmClient` yourself instead of the example:

```ts
import { Orchestrator, OpenAiCompatibleLlmClient } from './src'

const orchestrator = new Orchestrator({
  llmClient: new OpenAiCompatibleLlmClient({
    baseURL: 'http://127.0.0.1:1234/v1', // LM Studio, or any /v1/chat/completions-compatible endpoint
    model: 'qwen/qwen3-vl-30b',
    apiKey: 'lm-studio', // real providers need a real key here
  }),
})
```

## Run the Catalog Curator (needs a Firecrawl key too)

```bash
FIRECRAWL_API_KEY=your-key npm run example:curate
```

Researches an off-catalog tool/capability via real web search and
prints a suggested `catalogData.json` entry with cited sources — never
applied automatically (see SPEC.md §8/§11). Get a free key at
<https://www.firecrawl.dev>, or use the one provided for HackOn 2026's
AI Company track if you're in it.

## Common issues

- **"web_search requires a Firecrawl API key"** — set `FIRECRAWL_API_KEY`
  in `.env` or pass `{ firecrawlApiKey }` to `createToolExecutor()`.
  Only `catalog_curator` needs this; the 5 core agents never do.
- **A local model's response fails to parse / times out** — see
  SPEC.md §10 for two real issues this was built to survive (wrong
  endpoint, `reasoning_content` instead of `content`) and how
  `OpenAiCompatibleLlmClient` handles them. If an agent still returns
  something unusable, the pipeline degrades gracefully: `mappings` and
  `scenario` stay correct (deterministic), only that agent's
  `narrative`/`businessProcess`/`blueprint` field goes missing.
- **LM Studio: "insufficient system resources"** when switching models —
  unload the currently-loaded model first (`lms unload <id>` from
  LM Studio's CLI, or via its UI) before loading another.

## Project layout

See SPEC.md §3 for the annotated file tree.
