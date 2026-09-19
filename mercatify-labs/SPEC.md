# Mercatify Labs — engine spec

**Status:** extracted from the Mercatify hackathon project (HackOn 2026, Track 02),
generalized to be host-agnostic. Originally built on top of Open Mercato; this
package has zero dependency on it. **Live-verified** end to end against a
local LM Studio server via `npm run example:voltix`, and the Catalog Curator
verified against real Firecrawl web search via `npm run example:curate`
(both 2026-09-19) — see §10. Looking to extend this? Start at §11.
The reporting layer added on top of the pipeline is §12; it is numbered last
rather than slotted in next to the core because dozens of source comments cite
these section numbers and renumbering would silently falsify all of them.

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
│   ├── catalogAliases.ts      pre-merge capability keys -> canonical CAPS slugs (§6.1)
│   ├── catalogToolAliases.ts  the tool name a client writes -> the name the catalog stores
│   ├── catalogGaps.ts         `findCatalogGaps` — which capabilities fell off the catalog
│   ├── catalogCurator.ts      `proposeCatalogEntry` — runs the Catalog Curator (§8, §11.3)
│   ├── mapCapabilities.ts     pure mapping engine (§6.2)
│   ├── computeScenario.ts     pure ROI engine (§6.3)
│   ├── toolVerdict.ts         the ONE "does this subscription go dark" rule (§6.3)
│   ├── agentLoader.ts         typed loader for agents/*.json + tools/*.json
│   ├── toolExecutor.ts        executes the pure tools + web_search (§8) against the core above
│   ├── webSearch.ts           Firecrawl `/v1/search` wrapper — the only network call in src/
│   ├── llmClient.ts           `LlmClient` interface + a dependency-free
│   │                          OpenAI-compatible reference implementation
│   ├── orchestrator.ts        `Orchestrator` — runs the 5-agent pipeline (§8)
│   ├── sandboxEngineer.ts     §11.1, BUILT — agent picks and fills templates
│   ├── qaVerifier.ts          §11.1, BUILT — golden-path verdict over the preview
│   ├── preview/               templates, pure renderer, safe write, screen-name rule
│   ├── migrationPlanner.ts    §11.2, BUILT — hours and rollout order
│   ├── effortHours.ts         §11.2, BUILT — injects hours WITHOUT touching cost
│   ├── migration/             validator for the plan an agent returns
│   ├── critic.ts + critic/    adversarial review of one stage; contracts as data
│   ├── omPrototyper.ts + om/  requirements hand-off for the Open Mercato mock-up skill
│   ├── intake/fromBrief.ts    §12 — the only gate between a client file and a prompt
│   ├── report/                §12 — ReportModel, the money-in-time engine, the renderer
│   ├── reportProse.ts         §12 — the three prose agents; outside report/ on purpose
│   ├── index.ts               public exports
│   └── __tests__/             unit tests + fixtures (incl. the golden report)
├── bin/
│   ├── preview-cli.ts         Sandbox Engineer + QA end to end
│   ├── migrate-cli.ts         deterministic mapping + Migration Planner
│   └── critic-cli.ts          one stage artifact -> an advisory verdict
├── examples/
│   ├── run-voltix.ts          runs the full Voltix case against a real LLM
│   ├── curate-catalog.ts      runs the Catalog Curator against a real LLM + Firecrawl
│   ├── curate-gaps.ts         the same, driven by `findCatalogGaps` over a real run
│   ├── run-migration.ts       the Migration Planner against a real LLM
│   └── run-preview.ts         the Sandbox Engineer + QA against a real LLM
├── scripts/
│   └── generate-browser-catalog.mjs   emits the browser's COPY of the catalog
├── .env.example                FIRECRAWL_API_KEY / LLM_* — copy to .env, never commit .env
├── tools/                     portable tool descriptors (JSON Schema) —
│                              one file per tool, consumed by agents
└── agents/                    portable agent descriptors (JSON) —
                                id, role, instructions, tools, result
                                schema, sample input
```

`src/` is a real, runnable, tested TypeScript package (`npm test` runs
the Jest suite — 664 tests across 33 files at the last count on
2026-09-19; the reporting layer is still growing, so read the number as
"a few hundred and rising", not as a constant — all pure/unit, no
network; `npm run typecheck` type-checks it; `npm run
example:voltix` / `npm run example:curate` make real calls to a local
LLM (and, for the latter, Firecrawl), see §10). The three CLIs and the
three newer examples are run with `npx ts-node` — only `test`,
`typecheck`, `catalog:generate`, `example:voltix` and `example:curate`
have `package.json` scripts. `tools/` and `agents/` are plain JSON data
— no code, no framework dependency — read by `agentLoader.ts` and by
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
{ target, decision, confidence, reportVerdict? } } } }`. The shipped
catalog covers 18 tools and 128 capability entries — extend it with your own.

`capabilityKey` is a slug from the canonical `CAPS` vocabulary in
`assets/stack-tool/catalog.js`; `target` is an entry of `OM_TARGETS` from
the same file. `src/catalogAliases.ts` keeps the pre-merge capability
keys (`contacts`, `quote_documents`, `e_signature`, …) resolving, as an
explicit finite table — never a fuzzy match, so §6.2's honest
"not in catalog" fallback still means what it says.
`src/catalog.ts` exposes `getCatalogTool(name)`,
`getCatalogCapability(toolName, capability)` (literal key first, then the
alias table) and `listCatalogCapabilityKeys(name)`.
`src/__tests__/catalogIntegrity.test.ts` holds the two files to each
other; `npm run catalog:generate` refreshes the browser's copy at
`assets/shared/catalog.generated.js`.

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
a SaaS contract). Inside this package that rule lives in exactly one
place, `src/toolVerdict.ts`, which `computeScenario` imports — it was
extracted rather than restated because a rule that decides a client's
money should not be readable in two files that can disagree. One copy
outside the package is still outstanding: `assets/stack-tool/mapping.html`
carries its own, and it is on the list to switch over, not to keep.
Reference numbers from the original Voltix demo
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

Fourteen agents, one per `agents/*.json`. Each declares: `id`, `label`,
`role` (who it behaves like), `description`, `resultKind`
(`research` | `proposal`), `tools` (names from `tools/*.json` it may
call), `instructions` (its system prompt), `resultSchema` (JSON
Schema for its output), and `sampleInput` (a runnable example).

**Five of them are the pipeline** — the ones `Orchestrator.run()`
sequences, in this order:

| Agent | Behaves like | Calls | Result |
|---|---|---|---|
| `saas_auditor` | IT consultant | `list_catalog_capabilities` | research: capabilities per product |
| `process_analyst` | Business analyst | — (pure reasoning) | research: one named `BusinessProcess` |
| `om_architect` | Solution architect | `map_capabilities`, `get_case_data` | proposal: `MercatoMapping[]` + rationale |
| `consolidation_strategist` | Transformation lead | `get_case_data` | research: target-architecture blueprint |
| `finops` | CFO / FinOps | `compute_scenario`, `get_case_data` | research: `ConsolidationScenario` + summary |

**Nine stand outside it**, each called directly by its own typed
wrapper (and, for three of them, by a CLI). None of them is reachable
from `Orchestrator.run()`, and that is deliberate in every case — a
step that grades, proposes, prices, narrates or hands off is a step a
caller should be able to skip, repeat, or show to a human first:

| Agent | Behaves like | Calls | Result | Entry point |
|---|---|---|---|---|
| `catalog_curator` | Vendor researcher | `web_search` | research: a suggested `catalogData.json` entry, for a human to review | `proposeCatalogEntry()`, `examples/curate-catalog.ts` |
| `sandbox_engineer` | Solution engineer building a clickable proof | — | research: `ScreenSpec[]` — template choices and cell values, never HTML (§11.1) | `generatePreview()`, `bin/preview-cli.ts` |
| `qa` | Quality reviewer of the generated preview | — | research: `ready` \| `blocked` plus the golden-path step that blocks (§11.1) | `verifyGoldenPath()`, `bin/preview-cli.ts` |
| `migration_planner` | Delivery lead sequencing the rollout | — | research: hours and rollout order per `build`/`configure` mapping (§11.2) | `planMigration()`, `bin/migrate-cli.ts` |
| `critic` | Adversarial reviewer of one pipeline stage | — | research: objections against that stage's written contract | `critique()`, `bin/critic-cli.ts` |
| `om_prototyper` | Open Mercato backend analyst | `list_om_archetypes` | research: epics, stories and a screen inventory for the mock-up skill | `prepareOmRequirements()` |
| `report_editor` | Consultant writing the executive half of a report | — | research: the one-sentence recommendation, the numbered findings, the section 02 lede (§12) | `writeExecutiveProse()` |
| `report_risk_analyst` | Consultant stating what would change the numbers | — | research: section 08 risks and section 09 next steps (§12) | `writeRiskProse()` |
| `report_curator_reader` | Consultant explaining one off-catalog item | — | research: "why unmapped" and "our read" for one Appendix B gap (§12) | `writeGapProse()` |

The Critic never talks to the agent it reviews — the caller hands it
the artifact in `input`, like every other input (iron rule #5) — and
its verdict is advisory: `validateCritique` rebuilds the result field
by field and `resultSchema` has no numeric field at all, so an amount
from the model has nowhere to flow. A `reject` is a successful run of
the tool, not a failure of it, and no exit code depends on it.

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

The two agents this section once listed as missing — **Sandbox
Engineer** and **QA** — are built (§11.1). They are not steps of
`Orchestrator.run()`: `generatePreview()` and `verifyGoldenPath()` run
them, `bin/preview-cli.ts` chains the two, and the HTML itself comes
out of a pure function, not out of either agent. The reason they stayed
out of the pipeline is the reason the pipeline exists — a preview is a
side effect a host writes to disk and a human looks at, and §2 rule #4
says an agent never writes state directly.

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
| `list_om_archetypes` | pure | `src/om/platform.ts` — the Open Mercato backend archetypes the OM Prototyper may name, so it cannot invent one |
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
   `localToolExecutor` (`src/toolExecutor.ts`) for the 4 pure tools, and
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

This package is meant to be picked up and extended. The three items
below were written as the next steps; **11.1 and 11.2 are now built.**
Their contracts stay here verbatim, because they are what the shipped
code follows and what a dozen source comments cite by number — each one
now opens with what actually landed and where it differs from the
original sketch. 11.3 is not a task at all; it is the pattern every one
of these followed, and the one to copy next. §11.4 is what is genuinely
still open.

### 11.1 Sandbox Engineer + QA (highest value — do these together)

> **Built.** `agents/sandbox_engineer.json` + `src/sandboxEngineer.ts`,
> `agents/qa.json` + `src/qaVerifier.ts`, the pure renderer in
> `src/preview/`, and `bin/preview-cli.ts` chaining the two. One thing
> changed from the contract below, and it changed for the better:
> `resultKind: "artifact"` was never introduced. The agent returns
> ordinary `research` — a `ScreenSpec[]` of template choices and cell
> values — and `writePreview` turns that into files. A new result kind
> would have been a new way for a model to hand back a document; this
> way the model hands back data and a pure function writes the document,
> which is the same shape §12's report renderer later copied. The screen
> manifest and the QA verdict reach a caller through the functions'
> return values rather than through a new field on
> `ConsolidationResult`, so `src/contract.ts` was left alone.

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

> **Built.** `agents/migration_planner.json` + `src/migrationPlanner.ts`,
> the result validator in `src/migration/validatePlan.ts`,
> `src/effortHours.ts`, and `bin/migrate-cli.ts`. The discipline below
> held: `attachEffortHours` returns new mappings rather than mutating
> them, a plan item that matches no real mapping is dropped instead of
> creating a row, and no hour ever reaches `implementationCost` — which
> stays the customer's number. Nothing was added to
> `ConsolidationResult`; the plan is a separate return value, so a
> caller who does not want an estimate never sees one.

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
above. Two agents that were never on this roadmap arrived by exactly
that route and are worth reading as further examples: `critic`
(contracts as frozen data, a result schema with no numeric field at
all) and `om_prototyper` (a tool whose only job is to stop the model
inventing an archetype name).

### 11.4 What is actually still open

The reporting layer (§12) is the current work and it is unfinished.
In rough dependency order:

- **`buildReport.ts` and `bin/report-cli.ts`.** Everything either side
  of them exists; nothing wires brief to document in one call yet. The
  orchestration is deliberately code, not an agent, and the CLI follows
  `bin/preview-cli.ts` exactly: a pure exported `parseArgs`, every input
  gate exported and tested, a preflight against the LLM endpoint, and
  exit codes 0/1/2/3. It needs a `--no-llm` flag, because a run with no
  agents at all must still produce a correct report (§8).
- **The `report` stage for the Critic.** An eighth entry in
  `src/critic/stageContracts.ts`, advisory like the other seven: every
  number in the model came from `facts`; no prose carries an amount;
  every wave points at a real mapping; `breakEvenMonth` agrees with the
  series; nothing off-catalog entered any total.
- **The browser copies.** `assets/stack-tool/` pages still read their
  own catalog rather than the generated one, and
  `assets/stack-tool/report.html` still has its own `build()` instead of
  calling `renderReport`. The duplication is documented and tested
  against drift (§6.1), which is not the same as removed.
- **`src/index.ts`.** The report and intake layers are deliberately not
  exported yet. Exporting them is a public-contract change and is worth
  doing once, when the path from brief to document is complete, rather
  than a symbol at a time.

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

## 12. The reporting layer (`src/report/`, `src/intake/`)

Everything above turns a stack into JSON with savings in it. This
section turns that JSON into the document a client actually reads: one
self-contained HTML file, of the quality frozen as
`src/__tests__/fixtures/voltix.golden.html`. It is the newest layer in
the package and the one still under construction (§11.4), but its
contracts are settled and they are the reason the rest of this spec's
iron rules survive contact with a document a human will quote from.

### 12.1 `ReportModel` — the seam

`src/report/model.ts` defines one type, and the type is §2 rule #2
written as a shape:

```ts
interface ReportModel {
  facts: ReportFacts   // everything a pure function computed
  prose?: ReportProse  // everything an agent wrote — optional in its entirety
}
```

Nothing crosses. The renderer formats `facts` and never recomputes
them — not even a multiplication by twelve, and not a column total:
`MoneyTable.recurringTotal` is an explicit optional field precisely
because a sum is a *new* number and the renderer has no licence to make
one. Conversely nothing under `prose` is load-bearing: `prose` and
every field inside it is optional, because §8's "running with no LLM at
all" has to yield a *correct* report — every table, every number, both
figures — with the sentence-only sections omitted rather than rendered
empty.

Three smaller conventions inside `facts` are worth copying, because
each one started as a bug:

- Money fields are `null`, never `0`, when the client did not give
  costs. A zero says the stack is free; a `null` says nobody asked.
- `breakEvenMonth` is `number | null`, never `Infinity` —
  `JSON.stringify(Infinity)` is a silent `null`, so the type says out
  loud what serialization would have said behind your back.
- The horizon the series *computes* (36 months) and the horizon the
  chart *draws* (24) are two fields, not one constant in the renderer.
  That is a presentation decision, and presentation decisions belong to
  the model where a reviewer can see them.

### 12.2 Slots — how a sentence carries a number it did not author

The first version of this layer forbade numbers in prose outright. The
golden report proved that wrong on product grounds: 9 of its 11 prose
fields carry a number, and those are the sentences that make it
readable ("cutting them in the first four weeks returns $389 a month").
A sentence with the number removed reads as evasion.

But relaxing the rule would hand back the guarantee §10 exists to
protect — the run where FinOps wrote "€6,000 / 24 months" against a
real €21,000 / 6.9. **Slots** (`src/report/slots.ts`) satisfy both at
once: the agent writes `{wave.1.monthlyBanked}` and the renderer
substitutes the value from `facts`. The agent cannot state a wrong
number because it states no number, and the reader still sees one.

The allowed paths are an allowlist of shapes, exhaustively:
`kpis.<f>`, `cash.<f>`, `counts.<f>`, `meta.<f>`, `company.<f>`,
`stack.<tool>.<f>`, `wave.<n>.<f>`. An unknown slot **throws**. It does
not render as an empty string, and it does not render as `undefined`: a
silent hole in a sentence about money is worse than a loud failure.

The guard on the other side, `src/report/assertNoFigures.ts`, is an
**allowlist too**, and that was a correction rather than a first
instinct. Its first version enumerated forbidden shapes — "a number
with a unit glued to it" — and passed a full green suite while letting
through `pays back in month 15` and `cost 2043 a month`, including the
most natural phrasing of the very §10 bug it was written for. The rule
now reads: *every digit in prose is either inside a slot or directly
after a label word* (`wave`, `phase`, `step`, `section`, `appendix`,
`rule`, `risk`, `figure`, `table`). You cannot rephrase your way around
an allowlist. The cost is real and deliberate — "a sample of 200
contacts" is rejected too, and the author must either add a fact and a
slot or write the quantity in words.

### 12.3 The third money model — and why two were not enough

`src/report/cash.ts` adds a **time-phased** cash model, and it does not
replace anything. The package already had a flat one
(`computeScenario`: `implementationCost / (netAnnual / 12)`) and the
browser prototype had another (`computeTotals`:
`ceil(oneOff / monthlySaving)`). For the Voltix numbers both answer
~10.3 months. The report says 15 — and the report is right, because it
asks a different question. The flat models ask "how many times does the
saving fit inside the cost". This one asks "when does the account come
back above the line", and money leaves while the work is happening and
only arrives once a licence actually lapses.

The rule, confirmed against the golden report to the dollar:

> the programme runs `ceil(totalWeeks / 4)` months · a wave ends in
> month `round(itsLastWeek / totalWeeks × programmeLength)` · a wave
> starts spending the month after the previous one ends · **a wave's
> saving arrives the month after that wave closes** · hosting is charged
> from month 1

`computeCashSeries` returns the 36-month series plus `maxExposure`,
`maxExposureMonth`, `breakEvenMonth` and `netAtHorizon`. It reproduces
all 25 published points of the golden chart, the exposure floor at
−$14,967 in month 6, break-even in month 15 and +$40,923 at month 36 —
which is the only question worth asking of this file: *is our model the
same model that wrote the report?*

Because two of the three models now run side by side, the document
prints **both** payback numbers and names the difference, exactly as
the golden report does under "Two payback numbers, and why they
differ". `Paybacks.buildOnlyMonths` is the flat one and agrees with
`computeScenario`; `Paybacks.programmeMonths` is the timed one and is
larger. That is not a contradiction to hide; it is two questions, and a
report that prints only one of them is the defect.

`planWaveSpendWindows` and `computeCashSeries` are both exported, so
both gate their inputs rather than trusting the type: a duplicated wave
number (which silently collapsed two budgets into one month), `NaN`
hours (which froze `maxExposure` at 0 and read as "no risk", because
`NaN < x` is always false), negative hours (which turned the work into
a profit) and a backwards wave are each rejected by name.

### 12.4 Counters, waves, and the one number nobody computes

`src/report/counts.ts` carries the section 02 line — "38 usage
statements were extracted … 34 matched … 4 did not". It is the one
number in the document that **no function can produce**, and saying so
precisely mattered: it comes from a 62-minute call, seven invoices and
three screen-shares, while deriving it from the mappings gives a
different, smaller figure (15 for Voltix, because the brief records one
slug per job and discovery pulls many statements out of one capability).

So it is a consultant input, like `omOperatingCost` and
`implementationCost` — §2 rule #2 is about a model inventing numbers,
not about a human supplying them — and it is gated in three ways:
`matched + offCatalog === statements`; `statements` may exceed what the
engine mapped but never undercut it; and `offCatalog` may exceed what
the engine found but never undercut it. **A gap the engine saw cannot
be reported away.**

`src/report/waves.ts` groups mappings into the migration waves section
06 prints. This is derivation, not judgement — an agent never proposes
a wave. It reuses `toolVerdict.ts` for "does this subscription go
dark", takes hours from the Migration Planner, orders waves by
increasing process risk, and lets an `annual` contract term pull its
tool's wave forward so the work closes before the term does. A `build`
row with no estimate sets `hoursAreFloor`, and the total is then
printed as a lower bound rather than a quote.

### 12.5 The renderer, and the gate in front of it

`src/report/renderReport.ts` is a pure function `ReportModel -> string`
and `src/report/writeReport.ts` is its only I/O. Both copy shapes that
already existed in this package rather than inventing new ones: the
template family from `src/preview/templates.ts` (escape every value,
columns drive the table, exhaustive `switch` with `never`), and the
write discipline from `src/preview/renderPreview.ts` (materialize the
whole document in memory *before* the first byte, then refuse to follow
a symlink — CWE-59). Ordering matters in the same way: everything that
can throw, including slot resolution, runs before anything is
assembled, so a bad slot in one sentence never leaves half a document
behind.

The document is single-file and self-contained on purpose — no
`<link>`, no `<img>`, no `<iframe>`. It goes out by email, and a mail
client either will not fetch an external resource or, worse, will tell
the sender exactly who opened the pricing and when. The one place a
model value leaves HTML is the JSON embedded for the optional inline
script, where `<` is escaped inside the JSON itself: `escapeHtml` does
not help there, because HTML entities are not decoded inside JavaScript,
and a `"</script>"` in a milestone label would spill the rest of the
document onto the page as markup.

`src/intake/fromBrief.ts` is the gate at the other end — the only thing
standing between a file a client produced and a prompt. Same pattern as
`readBlueprintFile` in `bin/preview-cli.ts`: validate the shape before
anything moves, rebuild the result field by field so a key nobody
declared never reaches a model, cap the size (the whole request ends up
inside `JSON.stringify(input)`), and name the offending path in every
error — `tools[2].modules[0].caps[1]`, not "bad brief". It reads two
brief versions and upgrades `v1` to `v2` by defaulting the evidence kind
to `inferred`: not `observed`, which would be inventing the very
evidence that column exists to protect, and not `estimated`, because
nobody estimated anything. It does not read costs at all — those are a
separate argument, so a client file can never set them.

### 12.6 The three prose agents, and the test that holds the document

`src/reportProse.ts` carries the only agents in this package whose
sentences reach a client: `report_editor` (the one-sentence
recommendation, the numbered findings, the section 02 lede),
`report_risk_analyst` (section 08 risks, section 09 next steps) and
`report_curator_reader` ("why unmapped" and "our read" for one Appendix
B gap). They live *outside* `src/report/` on purpose — that directory
is the deterministic core of the document, and an agent call has no
business inside it.

Each follows §11.3's shape — descriptor, typed validating wrapper,
fake-client test — and each carries one obligation the earlier agents
did not: its instructions and its `resultSchema` teach and permit
**slots**, and the wrapper checks both directions. A slot the model
invents is rejected before rendering, and a bare figure is rejected by
`assertNoFigures`, so the only way for a number to reach the page is
for a pure function to have computed it first.

`src/__tests__/renderReport.test.ts` is what holds all of this to the
north star. It compares the rendered document against the golden master
**per section and by visible text**, not byte for byte, for two honest
reasons: the golden is hand-written and breaks its paragraphs in the
source, and both figures are *generated from the numbers*, so comparing
their coordinates would check whether we redrew someone else's picture
rather than whether we drew our own data — the normalizer strips
`<svg>` and the figures get their own tests for proportion, scale,
`<title>` and `<desc>`. Everything else must match. A difference that is
not in `KNOWN_DEVIATIONS` fails the test, and so does a deviation that
*stops* occurring — a list that no longer describes reality is a lie in
both directions.
