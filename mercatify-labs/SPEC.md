# Mercatify Labs — engine spec

**Status:** extracted from the Mercatify hackathon project (HackOn 2026, Track 02),
generalized to be host-agnostic. Originally built on top of Open Mercato; this
package has zero dependency on it. **Live-verified** end to end against a
local LM Studio server via `npm run example:voltix`, and the Catalog Curator
verified against real Firecrawl web search via `npm run example:curate`
(both 2026-09-19) — see §10. Looking to extend this? Start at §11.

## 1. What this is

Mercatify Labs is an AI company that consolidates a client's SaaS stack onto a target
platform: the client lists what tools they use, a small pipeline of
LLM agents classifies what each tool is actually used for, maps every
capability onto the target platform (replace / keep / build custom),
and computes the resulting savings — while a **deterministic core**
(no LLM) owns every decision and every number. The LLM narrates and
orchestrates; it never invents a fact the core could have looked up.

The core insight: **the client's live SaaS stack IS the specification.**
You don't ask "what CRM features do you need?" — you ask "what do you
use HubSpot for?" and map from there.

## 2. Architecture — the iron rules

1. **The catalog is the source of truth.** A known SaaS tool's
   capability → target-platform decision comes from a curated lookup
   table (`src/catalogData.json`), never from an agent's own reasoning on
   the critical path. See §6.1.
2. **The LLM never computes money.** An agent selects/passes through
   inputs (customer-provided costs); a pure function (`computeScenario`)
   computes the result. See §6.3. **Enforced in code, not just in the
   prompt**: `Orchestrator` calls `computeScenario`/`mapCapabilities`
   itself and only ever reads *narrative text* back out of an agent's
   response — it never trusts a number or a decision an agent's own
   response happened to contain, even when that agent's job was to call
   the matching tool. See §8's `finops` note for a real example of why
   this mattered on the very first live run.
3. **Confidence is a band** — `high` | `medium` | `low`. Never a
   fabricated percentage.
4. **An agent never writes state directly.** It returns a typed result
   (`research` or `proposal`); a host-side effector applies it only
   after approval (human or an auto-approval policy). The shipped
   `Orchestrator` has no persistence and no approval step of its own —
   it runs one request to one result in memory. Add those in your host
   application if you need a durable, human-gated case (see §9).
5. **No agent ever talks to another agent.** Every `runAgent` call
   builds a fresh two-element message array - the system prompt from
   `agents/<id>.json` plus one `JSON.stringify(input)`
   (`src/llmClient.ts:82-86`). There is no shared memory, no
   conversation history carried between steps, and no agent-to-agent
   channel of any kind; an agent's entire knowledge of the world is its
   own prompt and that one object. Whatever one step needs from
   another's work, the orchestrating code passes explicitly in `input`,
   and it passes only what that step needs - which is why
   `om_architect` receives `products` but never `mappings`
   (`src/orchestrator.ts:163`). Sequencing typed data between steps is
   a workflow's job, not an LLM call's (§8). "This new agent needs to
   see what the previous one said" is always a request for the caller
   to hand it that data, never a reason to wire two agents together.

## 3. Package layout

```
mercatify-labs/
├── SPEC.md                    this file
├── package.json / tsconfig.json / jest.config.cjs
├── src/
│   ├── types.ts               plain TS types shared by the whole core
│   ├── contract.ts            the INPUT/OUTPUT contract (§4) — start here
│   ├── catalogData.json       the curated SaaS -> platform knowledge base
│   ├── catalog.ts             loader/lookup helpers over catalogData.json
│   ├── mapCapabilities.ts     pure mapping engine (§6.2)
│   ├── computeScenario.ts     pure ROI engine (§6.3)
│   ├── agentLoader.ts         typed loader for agents/*.json + tools/*.json
│   ├── toolExecutor.ts        executes the pure tools + web_search (§8) against the core above
│   ├── webSearch.ts           Firecrawl `/v1/search` wrapper — the only network call in src/
│   ├── llmClient.ts           `LlmClient` interface + a dependency-free
│   │                          OpenAI-compatible reference implementation
│   ├── orchestrator.ts        `Orchestrator` — runs the 5-agent pipeline (§8)
│   ├── catalogCurator.ts      `proposeCatalogEntry` — runs the Catalog Curator (§8, §11)
│   ├── index.ts               public exports
│   └── __tests__/             unit tests (core engines + orchestrator + curator)
├── examples/
│   ├── run-voltix.ts          runs the full Voltix case against a real LLM
│   └── curate-catalog.ts      runs the Catalog Curator against a real LLM + Firecrawl
├── .env.example                FIRECRAWL_API_KEY / LLM_* — copy to .env, never commit .env
├── tools/                     portable tool descriptors (JSON Schema) —
│                              one file per tool, consumed by agents
└── agents/                    portable agent descriptors (JSON) —
                                id, role, instructions, tools, result
                                schema, sample input
```

`src/` is a real, runnable, tested TypeScript package (`npm test` runs
the Jest suite — 17 tests, all pure/unit, no network; `npm run
typecheck` type-checks it; `npm run example:voltix` / `npm run
example:curate` make real calls to a local LLM (and, for the latter,
Firecrawl), see §10). `tools/` and `agents/` are plain JSON data — no
code, no framework dependency — read by `agentLoader.ts` and by
`llmClient.ts`'s tool-call loop, or by whatever agent runtime you plug
into a *different* host app.

## 4. The contract (`src/contract.ts`) — start here

This is the one shape a caller needs to produce and the one shape they
get back. Everything else in the package exists to turn the first into
the second.

```ts
interface ConsolidationRequest {
  company: { name: string; industry: string; employees: number; currency: string }
  stack: Array<{
    name: string; category?: string; monthlyCost: number; seatCount?: number
    usageNotes?: string        // free text -> SaaS Auditor classifies it
    capabilities?: Array<{ capability: string; importance?: 'core'|'nice'; usageDescription?: string }>
    // ^ give this instead of usageNotes to skip the SaaS Auditor for this tool
  }>
  costs: { omOperatingCost: number; implementationCost: number }
  processHint?: string          // e.g. "lead to quote"
  scenarioLabel?: string
}

interface ConsolidationResult {
  company: ConsolidationRequest['company']
  auditedStack: Array<{ name: string; capabilities: [...] }>
  businessProcess?: { name: string; steps: string[]; frequency?: string }
  mappings: MappingResult[]                    // ALWAYS from mapCapabilities()
  blueprint?: { entities, workflows, modules, customScreens, integrations }
  scenario: ScenarioResult                     // ALWAYS from computeScenario()
  narrative?: { architectRationale?, strategistSummary?, financeSummary? }
  generatedAt: string
}
```

`mappings` and `scenario` are the JSON-with-savings result the request
asked for; everything under `narrative` is optional LLM-authored
color commentary layered on top — never load-bearing.

## 5. Data model (host-owned, if you build a durable version)

`Orchestrator` itself is stateless — one request in, one result out,
nothing persisted. A host application that wants a durable, multi-user
"case" (list of past analyses, human approval before anything is
final) persists records shaped like this; names match the JSON the
tools/agents already exchange, so persisting is a straight mapping.

```ts
type Decision   = 'native' | 'configure' | 'build' | 'integrate' | 'keep'
type Confidence = 'high' | 'medium' | 'low'

interface CompanyProfile {
  id: string; name: string; industry: string; employees: number; currency: string
}
interface SaaSProduct {
  id: string; companyId: string; name: string; category: string
  monthlyCost: number; seatCount?: number
}
interface SaaSCapability {
  id: string; saasProductId: string; capability: string
  importance: 'core' | 'nice'; usageDescription?: string
}
interface BusinessProcess {
  id: string; companyId: string; name: string; steps: string[]; frequency?: string
}
interface MercatoMapping {
  id: string; capability: string; source: string; targetFeature: string
  decision: Decision; confidence: Confidence; evidence: string; customEffortHours?: number
}
interface ConsolidationScenario {
  id: string; companyId: string; label: string
  removedSaaS: string[]; retainedSaaS: string[]
  grossAnnualSaving: number; omOperatingCost: number; netAnnualSaving: number
  implementationCost: number; netPaybackMonths: number
}
interface ConsolidationCase {
  id: string; companyId: string; status: 'intake' | 'analyzed' | 'approved' | 'previewed'
}
```

## 6. Deterministic core (no LLM, fully unit-tested)

### 6.1 Catalog (`src/catalogData.json`)

Curated knowledge base: `{ [toolName]: { capabilities: { [capabilityKey]:
{ target, decision, confidence } } } }`. The shipped catalog covers 7
tools (HubSpot, Typeform, Airtable, Zapier, PandaDoc, Calendly, Slack)
as a worked example — extend it with your own tools/capabilities.
`src/catalog.ts` exposes `getCatalogTool(name)` and
`getCatalogCapability(toolName, capability)`.

### 6.2 Mapping engine (`src/mapCapabilities.ts`)

```ts
function mapCapabilities(
  stack: SaaSProductInput[],
  caps: SaaSCapabilityInput[],
): MercatoMappingResult[]
```

Pure lookup. Off-catalog capability → `decision: 'build'`,
`confidence: 'low'`, `evidence: 'not in catalog'`. Also exposed as the
`map_capabilities` tool (`tools/map_capabilities.json`). This
fallback is what keeps a run safe even when an agent invents a
capability name the catalog has never heard of (see §10) — it never
crashes, it just honestly reports "needs discovery".

### 6.3 ROI engine (`src/computeScenario.ts`)

```
grossAnnualSaving = Σ (monthlyCost of REMOVED tools) * 12
netAnnualSaving   = grossAnnualSaving − omOperatingCost
netPaybackMonths  = implementationCost / (netAnnualSaving / 12)   // Infinity if netAnnualSaving <= 0
```

A tool is "removed" only when **every** one of its mapped capabilities
resolved to `native`/`configure`/`build` — a single `integrate` or
`keep` capability keeps the whole subscription (you don't half-cancel
a SaaS contract). Reference numbers from the original Voltix demo
case: gross €29,400 − platform cost €8,400 = net €21,000/yr,
implementation €12,000 → ~6.9 months net payback. Exposed as the
`compute_scenario` tool.

## 7. The five decisions

| Decision | Meaning |
|---|---|
| `native` | The target platform covers it today, out of the box |
| `configure` | The platform has the building blocks, needs setup |
| `build` | Small custom development is required |
| `integrate` | Stays external, wired in via API/webhook |
| `keep` | No case to touch it — leave it alone |

Every capability gets exactly one.

## 8. Agents (the "departments") and how they talk to each other

Six agents, one per `agents/*.json`. Each declares: `id`, `label`,
`role` (who it behaves like), `description`, `resultKind`
(`research` | `proposal`), `tools` (names from `tools/*.json` it may
call), `instructions` (its system prompt), `resultSchema` (JSON
Schema for its output), and `sampleInput` (a runnable example).

| Agent | Behaves like | Calls | Result |
|---|---|---|---|
| `saas_auditor` | IT consultant | `list_catalog_capabilities` | research: capabilities per product |
| `process_analyst` | Business analyst | — (pure reasoning) | research: one named `BusinessProcess` |
| `om_architect` | Solution architect | `map_capabilities`, `get_case_data` | proposal: `MercatoMapping[]` + rationale |
| `consolidation_strategist` | Transformation lead | `get_case_data` | research: target-architecture blueprint |
| `finops` | CFO / FinOps | `compute_scenario`, `get_case_data` | research: `ConsolidationScenario` + summary |
| `catalog_curator` | Vendor researcher | `web_search` | research: a suggested `catalogData.json` entry, for a human to review — see below, it is NOT part of the pipeline these five form |

`Orchestrator.run()` (`src/orchestrator.ts`) is the thing that makes
them talk to each other — it is the Orchestrator role from the
original spec, expressed as code rather than as a 6th agent, because
sequencing typed data between steps is exactly what a workflow does,
not what an LLM call should be trusted to do:

```
request.stack (usageNotes)
        │
        ▼
  SaaS Auditor  ──────────────────────────►  auditedStack (capabilities)
                                                     │
                                          ┌──────────┴──────────┐
                                          ▼                     ▼
                                  Process Analyst        mapCapabilities()  ◄── ALWAYS deterministic
                                  (businessProcess)              │
                                          │                      ▼
                                          │              OM Architect (rationale only —
                                          │               its own "mappings" are discarded)
                                          │                      │
                                          └──────────┬───────────┘
                                                      ▼
                                      Consolidation Strategist (blueprint)
                                                      │
                                                      ▼
                                            computeScenario()  ◄── ALWAYS deterministic
                                                      │
                                                      ▼
                                        FinOps (summary only — its own
                                         "scenario" is discarded)
                                                      │
                                                      ▼
                                          ConsolidationResult (§4)
```

Two more agents existed in the original spec but depend on a
not-yet-built HTML preview generator, so they aren't included here:
**Sandbox Engineer** (`artifact`-kind — renders the target-platform
preview from the blueprint + seed data) and **QA** (`research`-kind —
verifies the golden path in that preview and returns a Ready/blocked
verdict). §11 has the contract each needs to follow if you build them.

### The Catalog Curator is deliberately outside the pipeline

`catalog_curator` is not called by `Orchestrator.run()` — call
`proposeCatalogEntry()` (`src/catalogCurator.ts`) directly, whenever a
run reports `evidence: "not in catalog"` for a capability and you want
to grow the catalog instead of leaving it there. It is the only agent
allowed to call `web_search` (Firecrawl), and the only one whose
result is never persisted automatically — a human reads its
`suggestedTarget`/`suggestedDecision`/`suggestedConfidence` and the
cited `findings`, then edits `src/catalogData.json` by hand. Iron rule
#1 (§2) says the catalog is the source of truth precisely so that a
live web search never becomes part of any client's actual decision —
this agent only ever proposes *changes to the source of truth itself*,
under review, never a decision for the run that triggered it.

### Running with no LLM at all

`new Orchestrator()` (no options) skips every agent. It requires every
`stack` entry to already carry `capabilities` (no `usageNotes`-only
entries — there is nothing to classify them with), and the result has
no `businessProcess`, `blueprint`, or `narrative`. `mappings` and
`scenario` are identical either way — this is the spec's original
"fallback demo" path, and it's exercised directly in
`src/__tests__/orchestrator.test.ts`.

### Tools (`tools/*.json`)

| Tool | Kind | Backed by |
|---|---|---|
| `list_catalog_capabilities` | pure | `src/catalog.ts` |
| `map_capabilities` | pure | `src/mapCapabilities.ts` |
| `compute_scenario` | pure | `src/computeScenario.ts` |
| `get_case_data` | **host** | your database — `src/toolExecutor.ts` errors if called; the standalone `Orchestrator` always passes data inline, never a `caseId` |
| `web_search` | **external** | `src/webSearch.ts` (Firecrawl `/v1/search`) — only `catalog_curator` may call it; needs `FIRECRAWL_API_KEY` (`.env.example`) |

Use `createToolExecutor()` (`src/toolExecutor.ts`) rather than
`localToolExecutor` directly when you need `web_search` resolved too —
it wraps `localToolExecutor` and adds that one tool, reading
`FIRECRAWL_API_KEY`/`FIRECRAWL_BASE_URL` from the environment (or from
options you pass in).

## 9. Wiring this into a host application

The shipped `Orchestrator` + `OpenAiCompatibleLlmClient` are already a
complete, runnable host — see `examples/run-voltix.ts`. To use a
*different* agent runtime instead (e.g. you already have LangChain or
a cloud provider's native SDK wired into your app):

1. **Deterministic core**: call `mapCapabilities` / `computeScenario`
   directly — no agent framework required for this part, regardless of
   what you do below.
2. **Agents**: read each `agents/*.json` and register it with your
   runtime's native agent format. `resultSchema` maps directly to
   structured-output / function-return schemas most runtimes already
   support.
3. **Tools**: implement the `LlmClient` interface (`src/llmClient.ts`)
   so its tool-call loop calls into *your* runtime instead of
   `fetch`-ing an OpenAI-compatible endpoint; keep using
   `localToolExecutor` (`src/toolExecutor.ts`) for the 3 pure tools, and
   implement `get_case_data` against your own store using §5's shapes.
4. **Orchestration**: reuse `Orchestrator` as-is — it only depends on
   `LlmClient`, not on any specific provider — or copy `orchestrator.ts`
   as a starting point if you want a durable, human-gated case instead
   of a single in-memory request/response. Either way, keep the rule
   that only `mapCapabilities`/`computeScenario` output ever reaches
   the final numbers — never an agent's own claim about them.

## 10. Provenance and live verification

Extracted 2026-09-19 from the Mercatify project
(`.ai/specs/2026-09-18-mercatify.md` in the Open Mercato checkout at
`/Users/DOMINICO/Documents/Projects/OpenMercato/open-mercato`), where
the same five agents also run wired into Open Mercato's Agent
Orchestrator (`packages/enterprise/src/modules/agent_orchestrator`)
under the app-local module `apps/mercato/src/modules/mercatify`. That
integration is the reference implementation if you want to see a full
host wiring (database entities, CRUD API, backend UI, native
`defineAgent()` registration, human approval via Caseload) rather than
this package's single-request `Orchestrator`.

`OpenAiCompatibleLlmClient` exists because getting agents to run
reliably against a local LM Studio server through Open Mercato's own
AI SDK integration surfaced two real upstream bugs along the way (both
fixed in the Open Mercato checkout, not reproduced here since this
package never had them):

1. The AI SDK's default OpenAI model call targets the `/v1/responses`
   endpoint, which only real OpenAI implements — self-hosted/compatible
   servers need `/v1/chat/completions` explicitly. This client only
   ever calls the latter.
2. Some "thinking" model builds (observed with a Qwen3 variant served
   by LM Studio) put their entire final JSON answer in the response's
   `reasoning_content` field and leave `content` empty. This client
   falls back to `reasoning_content` when `content` is empty rather
   than treating that as a hard failure.

`npm run example:voltix` runs the full 7-tool Voltix case against a
local LM Studio server end to end and was the first successful live
run of this pipeline outside Open Mercato. Two things worth knowing
from that run, both examples of the architecture working as designed
rather than of bugs:

- The SaaS Auditor correctly used the catalog's real vocabulary for
  HubSpot and Slack (`contacts`, `deals`, `team_chat`, ...) but
  invented shorter, off-catalog names for the other five tools (e.g.
  `automation` instead of `cross_app_automation`). The mapping engine's
  §6.2 fallback caught every one of those honestly as `decision:
  "build"`, `confidence: "low"` — no crash, no silently wrong answer.
- The FinOps agent's own `narrative.financeSummary` text stated "*net
  annual saving is €6,000, with a payback period of 24 months*" — both
  numbers wrong (the real, deterministic answer is €21,000 / ~6.9
  months, in `result.scenario`). This is exactly why §2 rule #2 is
  enforced in code: the wrong narrative sentence shipped in the
  result, but `result.scenario` — the actual JSON-with-savings the
  request asked for — was correct regardless, because it never came
  from the agent in the first place.

`npm run example:curate` researched an off-catalog capability
("Notion" / `knowledge_base`) via real Firecrawl search and returned a
correctly-cited proposal (`suggestedTarget: "Documents"`,
`suggestedDecision: "integrate"`, three findings each with a real
`sourceUrl`) on the first run — see §11 for how to wire more agents
like this one.

## 11. Roadmap for contributors

This package is meant to be picked up and extended. Three concrete
next agents, in priority order, each with the contract it needs to
follow to slot into the existing architecture without breaking §2's
iron rules.

### 11.1 Sandbox Engineer + QA (highest value — do these together)

The biggest gap today: the pipeline produces a correct JSON, but
nothing a non-technical stakeholder can *look at*. These two agents
turn `ConsolidationResult` into a clickable proof.

- **Sandbox Engineer** — `resultKind: "artifact"` (a new kind this
  package hasn't needed yet: it produces a file, not JSON). Input:
  `ConsolidationResult` (specifically `blueprint` + `mappings`).
  Output: template-based HTML screens (dashboard, a list view, a
  detail view, one screen per `blueprint.customScreens` entry) styled
  like the target platform's own admin, populated with the request's
  real data. **Template-based, not free-form LLM-generated HTML** — an
  LLM choosing arbitrary markup on every run is exactly the kind of
  non-determinism §2 exists to avoid; the agent's job is to *select
  and fill* templates, not to invent one. Keep generation off the
  agent's own JSON schema entirely: return a manifest (`{ screens:
  [{ name, path }] }`) and write the actual HTML files as a side effect
  your host records, the same way `get_case_data` is host-owned.
- **QA** — `resultKind: "research"`. Input: the Sandbox Engineer's
  manifest + the original golden path steps (§9 of the original
  Mercatify spec: Lead → Customer → Deal → vertical-specific step →
  Quote → approval). Output: a verdict (`"ready" | "blocked"`) plus,
  when blocked, which step in the golden path the generated screens
  don't support. This is intentionally the LAST agent in any run — it
  grades everything upstream of it.

Add both to `agents/`, wire them as new `Orchestrator` steps (or a
sibling `PreviewOrchestrator` if you'd rather keep concerns separate),
and extend `ConsolidationResult` (`src/contract.ts`) with an optional
`preview` field carrying the Sandbox Engineer's manifest + the QA
verdict.

### 11.2 Migration Planner

Today `MappingResult.customEffortHours` exists in the type (§4) but
nothing ever populates it. This agent closes that gap: for every
mapping with `decision: "build"` or `"configure"`, estimate effort in
hours and propose a rollout sequence (which capabilities to tackle
first, what blocks what). `resultKind: "research"`. No new tool
needed — it reasons over `mappings` the same way `consolidation_strategist`
does. The one discipline to keep: effort estimates are **always**
`narrative`-adjacent, never folded into `scenario.implementationCost`
— that number stays customer-provided (§2 rule #2). Surface the
estimate as `narrative.migrationPlan` or a new top-level
`migrationPlan?` field; never let it silently override the input cost.

### 11.3 Follow `catalog_curator` as the reference for "how do I add an agent"

`agents/catalog_curator.json` + `src/catalogCurator.ts` +
`src/__tests__/catalogCurator.test.ts` is the smallest complete
example of the full loop: JSON descriptor → typed wrapper function →
test with a fake `LlmClient` (no network) → a real example script
(`examples/curate-catalog.ts`) that hits a live LLM. Copying that
shape (descriptor, wrapper, fake-client test, live example) is the
fastest path to a working PR for any new agent, including the two
above.

### On web search generally

`web_search` (Firecrawl, §8/§10) is deliberately scoped to
`catalog_curator` only. If you're tempted to give another agent web
access — resist it unless that agent's job is, like the Curator's,
*proposing a change to a source of truth a human reviews* (the
catalog, a template, a policy) rather than *deciding something about
the client's own run*. A "research the client's company" agent is a
reasonable, safe addition on the same principle (it enriches
`CompanyProfile` context, never a mapping or a number); a "research
whether this SaaS tool is really worth replacing" agent called mid-run
is not — that's iron rule #1 in different clothes, and it would make
every run's mapping non-reproducible.
