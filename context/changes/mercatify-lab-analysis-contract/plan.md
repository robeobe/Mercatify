# Mercatify ↔ Mercatify Lab Analysis Contract — Implementation Plan

## Overview

Mercatify's wizard (built in later slices) needs to hand an interview state to "the analysis" and get back either another question or a finished capability mapping — but Mercatify Lab, the module that will eventually run that analysis, doesn't exist yet. This plan defines that seam as a versioned TypeScript contract (`MercatifyLabPort`) owned by the Mercatify module, plus one deterministic scripted adapter that answers it today. Every downstream slice (S-02 discovery wizard, S-03 mapping summary, S-05 handoff document, S-06 run-in-lab handoff) can be built, demoed and tested against this contract without Lab ever having shipped, and when Lab does ship it plugs in by registering its own adapter under the same DI key — no consumer code changes.

## Current State Analysis

- `src/modules/mercatify/` does not exist in this checkout. F-01 (`mercatify-module-scaffold`), which is meant to create the base module shell, has not landed yet — F-02 is explicitly planned to run in parallel with it ("Prerequisites: —", roadmap streams A/B). This plan therefore stands up the minimal legal module shell itself, defensively, rather than assuming F-01 got there first.
- Enabled modules today (`src/modules.ts`, mirrored in `.mercato/generated/enabled-module-ids.generated.ts`): `auth, directory, configs, entities, query_index, api_docs, audit_logs, notifications, dashboards, events, search` — 11 modules, neither `mercatify` nor `mercatify_lab` among them yet.
- OM has an established, repeatedly-used pattern for exactly this situation — an optional cross-module capability where the provider may not be installed: a host module defines a TS interface, a default/local implementation, and a `register<Thing>()` function; a provider module (if and when it exists) calls that registrar with its own implementation, overriding the default. Confirmed in multiple already-shipped ports: `RateProvider` (`node_modules/@open-mercato/core/src/modules/currencies/services/providers/base.ts:10`), `GatewayAdapter` (`node_modules/@open-mercato/shared/src/modules/payment_gateways/types.ts:19,305`), `ShippingAdapter` (`node_modules/@open-mercato/core/src/modules/shipping_carriers/lib/adapter.ts:87`), `WarrantyReturnLabelProvider` (`node_modules/@open-mercato/core/src/modules/warranty_claims/services/returnLabelProvider.ts:8`, registered at `di.ts:27`). The `example` module shows the *implementing* side of the same pattern: plain object literals typed against the imported interface, registered inside `di.ts`'s `register()` (`src/modules/example/di.ts:42,132,136`, e.g. `registerGatewayAdapter(mockGatewayAdapter)`).
- Governing guidance for this shape: "Optional service call → Guarded/soft DI resolve in the consumer and a defined degraded result" (`.ai/guides/contracts.md:78`); "Optional modules must degrade safely: the optional consumer owns glue... a guarded DI resolve. The host never imports the optional consumer" (`.ai/guides/architecture.md:98`, `.ai/guides/extensions.md:90`). Mercatify is the consumer of the analysis capability, so Mercatify owns the port, the default adapter, and the registration point — Lab, when built, is the one that imports Mercatify's registrar, never the other way around.
- House style for AI-adjacent contracts in this codebase (`.ai/guides/ai-workflows.md:21`): "Every data tool has a Zod input schema... bounded output, and a serializable result." No existing OM primitive expresses an explicit contract version number for a TS interface — evolution instead happens by adding optional fields/methods and never renaming or removing (`.ai/guides/upstream/BACKWARD_COMPATIBILITY.md` §9, Quick Reference table).
- No `isModuleEnabled()`-style helper detects "is a sibling module installed" from outside that module — the closest primitives are `getEnabledModuleIds()` (`@open-mercato/shared/src/security/enabledModulesRegistry.ts:132`) and the generated, dependency-free `enabled-module-ids.generated.ts`. This plan does **not** use either: whether "Mercatify Lab is installed" (for the "Run in Mercatify Lab" button, FR-013) is an explicit non-blocking open item routed to S-06 (`mercatify-run-in-lab-handoff`), not this contract. This plan only defines what the analysis port looks like and what answers it by default.

## Desired End State

- A `MercatifyLabPort` TypeScript interface exists in the `mercatify` module, with Zod-backed request/response types covering the discovery loop (`needs_more_info` → another question; `complete` → a capability mapping table) and a `registerMercatifyLabPort` / `getMercatifyLabPort` registration pair.
- A scripted, deterministic default adapter is registered against that port at module bootstrap, producing a small fixture that exercises at least one follow-up-question round and a final mapping covering all five decisions, all three target kinds (including `unmapped`), and all three confidence bands.
- Verification: unit tests call the port through its public shape only (never the adapter directly) and prove (a) the default adapter's output is deterministic and schema-valid, and (b) swapping in a second, differently-behaved adapter changes what `getMercatifyLabPort()` returns with no code changes anywhere else — the same mechanism Lab will use later.
- No money/ROI fields exist anywhere in this contract. That's deliberate (see Key Discoveries) and downstream slices should not add them here.

### Key Discoveries

- **Money stays out of this contract, by design.** FR-005 (what the analysis returns) lists mapping, decision, justification and confidence — no amounts. FR-007 (the net-saving breakdown) is a separate, still-blocked slice (S-04, blocked on the business-rule and cost-source open questions). Keeping `MercatifyEvaluationResult` free of any amount field means the "money is computed deterministically, not by the analysis" guardrail is enforced by the contract's shape itself, regardless of whether Lab stays scripted or becomes a real LLM agent later — S-04 will compute savings in Mercatify-side code from mapping decisions (this port) plus cost facts already known from intake (FR-001), independent of Lab entirely.
- **The `.md` handoff document's template/schema is explicitly out of scope here.** It belongs to S-05 (`mercatify-handoff-document`), whose only prerequisite is S-03, not F-02. This plan's contract only covers the interview ⇄ analysis JSON exchange.
- **No DB entity or migration is needed for this change.** The port and adapter are pure in-memory/stateless code; the interview "case" entity belongs to F-01. `yarn db:generate` is not part of this plan's validation.
- **"Is Lab installed" detection is not this plan's job** (see Current State Analysis) — it's a non-blocking open item explicitly routed to S-06.

## What We're NOT Doing

- Not implementing Mercatify Lab or any real (LLM-backed) analysis — only a deterministic stand-in.
- Not building the wizard UI, the mapping table UI, or the `.md` editor (S-02, S-03, S-05).
- Not computing, storing, or returning any savings/ROI figures (S-04) — the contract structurally excludes them.
- Not deciding or implementing "is Mercatify Lab installed" detection for the "Run in Mercatify Lab" button (S-06's open item).
- Not fixing the exact discovery-question cap (PRD Open Question 7, owned by S-02) — the port supports an in-principle-unbounded loop; whoever calls it decides when to stop.
- Not building F-01's real seeded demo dataset — this plan's fixture data is self-contained and synthetic, decoupled from F-01's timeline.
- Not writing a formal `.ai/specs/` entry or applying the full backward-compatibility deprecation process — out of scope per explicit instruction; this is a net-new surface, not a change to an existing one.

## Implementation Approach

Mercatify (the consumer of "analysis") owns the interface, the registry, and the default implementation — mirroring every existing optional-provider seam in this codebase (`RateProvider`, `GatewayAdapter`, `ShippingAdapter`). The module shell is created defensively so this plan doesn't depend on F-01's landing order. The scripted adapter is a plain deterministic function with no I/O, registered eagerly at module bootstrap so any future consumer can always resolve a working implementation. Money is excluded from the contract's data shape entirely, which is what makes "the analysis never computes money" a structural guarantee rather than a policy Lab has to remember to follow.

## Phase 1: Module shell + the port contract

### Overview

Stand up (or extend, if F-01 has already landed) the minimal legal `mercatify` module, and define the `MercatifyLabPort` interface, its Zod-backed request/response types, and the registration pair.

### Changes Required:

#### 1. Module shell

**Files**: `src/modules/mercatify/index.ts`, `src/modules/mercatify/di.ts`, `src/modules.ts`

**Intent**: Make `mercatify` a legal, auto-discovered OM module so `di.ts` has somewhere to run. Idempotent: if F-01 has already created these files, extend them rather than overwrite — this plan only adds a DI registration call and does not touch any case/entity/page work that belongs to F-01.

**Contract**: `index.ts` exports the module's `ModuleInfo` (mirroring `src/modules/example/index.ts:3`); `di.ts` exports a `register(container)` function; `src/modules.ts`'s `enabledModules` array gains `{ id: 'mercatify', from: '@app' }` if not already present.

#### 2. The port interface and types

**File**: `src/modules/mercatify/lib/mercatify-lab-port.ts`

**Intent**: Define the one seam every downstream slice programs against — the shape of what the wizard sends and what the analysis returns, plus the registry that lets a real Lab implementation replace the default later without touching any caller.

**Contract**: Exports `MercatifyLabPort` (one method, `evaluate`), its Zod schemas, and `registerMercatifyLabPort` / `getMercatifyLabPort`. This is the load-bearing signature every later slice depends on, so it's spelled out here rather than left to convention:

```ts
export const MercatifyDecisionSchema = z.enum(['native', 'configure', 'build', 'integrate', 'keep'])
export const MercatifyConfidenceSchema = z.enum(['high', 'medium', 'low'])

export const MercatifyMappingTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('om_module'), moduleId: z.string() }),
  z.object({ kind: z.literal('external_tool'), name: z.string() }),
  z.object({ kind: z.literal('unmapped') }), // FR-006: flagged, never silently dropped
])

export const MercatifyMappingRowSchema = z.object({
  capability: z.string(),
  decision: MercatifyDecisionSchema,
  target: MercatifyMappingTargetSchema,
  justification: z.string(),
  confidence: MercatifyConfidenceSchema, // guardrail: band only, never a percentage
})

export const MercatifyDiscoveryQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  chips: z.array(z.string()),
})

export const MercatifyEvaluationRequestSchema = z.object({
  contractVersion: z.literal(1),
  tenantId: z.string(),
  organizationId: z.string(),
  caseId: z.string(),
  companyProfile: z.record(z.unknown()), // shape owned by F-01's case entity; kept loose until it ships
  saasTools: z.array(z.object({ name: z.string(), monthlyCost: z.number(), notes: z.string().optional() })),
  answers: z.array(z.object({ questionId: z.string(), chip: z.string().optional(), freeText: z.string().optional() })),
  freeText: z.array(z.string()).optional(),
})

export const MercatifyEvaluationResultSchema = z.discriminatedUnion('status', [
  z.object({ contractVersion: z.literal(1), status: z.literal('needs_more_info'), question: MercatifyDiscoveryQuestionSchema }),
  z.object({ contractVersion: z.literal(1), status: z.literal('complete'), mapping: z.array(MercatifyMappingRowSchema) }),
])

export interface MercatifyLabPort {
  evaluate(request: z.infer<typeof MercatifyEvaluationRequestSchema>): Promise<z.infer<typeof MercatifyEvaluationResultSchema>>
}
```

`registerMercatifyLabPort(port)` / `getMercatifyLabPort()` follow the same shape as `registerGatewayAdapter` (`src/modules/example/di.ts:42`) — a module-level registry, not an Awilix container token, since the whole point is that Lab (a sibling module, potentially added long after Mercatify boots) can call the registrar at its own `di.ts`'s `register()` time.

### Success Criteria:

#### Automated Verification:

- `yarn generate` completes without error and the module is discoverable
- `yarn typecheck` passes
- `yarn lint` passes

#### Manual Verification:

- `src/modules/mercatify/index.ts` and `di.ts` exist, don't collide with any F-01 work already merged, and the OM admin still lists every pre-existing module unchanged (spot-check FR-014)

---

## Phase 2: Scripted deterministic adapter

### Overview

Implement and register the default `MercatifyLabPort` implementation: a pure, deterministic function with no I/O that stands in for Lab until Lab exists.

### Changes Required:

#### 1. The adapter

**File**: `src/modules/mercatify/lib/scripted-mercatify-lab-adapter.ts`

**Intent**: Give every downstream slice something real to build and demo against. The fixture must exercise the full shape of the contract, not just a trivial single-shot answer: at least one `needs_more_info` round (proving the loop FR-002/FR-003 depend on actually works end-to-end) before a `complete` result whose mapping rows cover all five decisions and all three target kinds — including at least one `unmapped` row, since FR-006 requires that case to be visible rather than silently absent from any demo.

**Contract**: A plain object satisfying `MercatifyLabPort`, keyed off `request.answers.length` (or an equivalent simple counter) to decide whether to return another canned question or the final mapping — deterministic means "same accumulated state in, same result out," not "ignores the request." The exact number of scripted rounds is a fixture detail, not the FR-003 question cap (that number is S-02's to fix); pick the smallest number that still demonstrates the loop (one round is enough).

#### 2. Wire it as the default

**File**: `src/modules/mercatify/di.ts`

**Intent**: Ensure any consumer can always resolve a working port, from the moment the app boots — not lazily on first use.

**Contract**: `register(container)` calls `registerMercatifyLabPort(scriptedMercatifyLabAdapter)` unconditionally, before returning.

### Success Criteria:

#### Automated Verification:

- `yarn test` passes for new unit tests asserting: the first call with no answers returns `needs_more_info`; a follow-up call with an answer returns `complete`; the `complete` mapping validates against `MercatifyEvaluationResultSchema` and contains all five decisions, all three target kinds, and all three confidence bands across its rows
- `yarn typecheck` passes

#### Manual Verification:

- Run the adapter twice from a scratch script (accumulated-state → question → answer → complete) and eyeball the fixture output for a plausible, readable discovery question and mapping table

---

## Phase 3: Prove the contract is swappable

### Overview

Demonstrate — with a test, not just an assertion in this plan — that the whole point of this change holds: a consumer coded against `MercatifyLabPort` never needs to change when Lab replaces the scripted default.

### Changes Required:

#### 1. Swap test

**File**: `src/modules/mercatify/lib/mercatify-lab-port.test.ts` (or colocated per existing test convention)

**Intent**: Register a second, differently-behaved dummy adapter (e.g. one that always returns `complete` immediately) and assert `getMercatifyLabPort()` now returns its output instead of the scripted default's — then restore the default so other tests aren't affected. This is the automated proof that "every downstream slice can be built, demoed and tested without Lab existing" actually holds mechanically, not just by design intent.

**Contract**: No production code changes; test-only.

### Success Criteria:

#### Automated Verification:

- `yarn test` passes, including the swap test
- Broad gate passes: `yarn generate && yarn typecheck && yarn lint && yarn ds:check && yarn test && yarn build`

#### Manual Verification:

- Walk through the full scripted loop once more end-to-end (question → answer → complete) and confirm it matches the PRD's Primary success criterion narrative for the demo path: the analysis "keeps coming" with questions until it decides nothing is missing, with no manual fixing

---

## Testing Strategy

### Unit Tests:

- Default scripted adapter: deterministic output, schema-valid, covers all decision/target/confidence variants including `unmapped`
- Port registry: swapping the registered implementation changes what `getMercatifyLabPort()` resolves to, with no other code touched

### Integration Tests:

- None required — there is no route, page, or persisted entity in this change for `yarn test:integration:ephemeral` to exercise. Downstream slices (S-02, S-03) will add their own integration coverage once they have a UI/route to test.

### Manual Testing Steps:

1. Boot the app locally and confirm no existing OM module, page, or API changes behavior (FR-014).
2. From a scratch script or REPL, call `getMercatifyLabPort().evaluate(...)` with an empty `answers` array, then again with the returned question answered, and confirm the loop terminates in a `complete` result.
3. Register a second adapter, re-run step 2, confirm the different adapter's output comes back, then restore the default.

## Performance Considerations

None — the port and its default adapter are synchronous-shaped, in-memory, and have no I/O.

## Migration Notes

None — no database entities or schema changes in this plan.

## References

- Roadmap item: `context/foundation/roadmap.md` (F-02)
- Change ticket: `context/changes/mercatify-lab-analysis-contract/change.md`
- Pattern precedent: `node_modules/@open-mercato/core/src/modules/currencies/services/providers/base.ts:10` (`RateProvider`), `node_modules/@open-mercato/shared/src/modules/payment_gateways/types.ts:19,305` (`GatewayAdapter`), `src/modules/example/di.ts:42,132,136` (registrar-call pattern)
- Downstream consumers: `context/changes/mercatify-discovery-wizard/change.md` (S-02), `context/changes/mercatify-mapping-summary/change.md` (S-03), `context/changes/mercatify-handoff-document/change.md` (S-05), `context/changes/mercatify-run-in-lab-handoff/change.md` (S-06)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Module shell + the port contract

#### Automated

- [x] 1.1 `yarn generate` completes without error and the module is discoverable — b4ce7ca
- [x] 1.2 `yarn typecheck` passes — b4ce7ca
- [x] 1.3 `yarn lint` passes — b4ce7ca

#### Manual

- [x] 1.4 Module shell exists, no collision with F-01, FR-014 spot check passes — b4ce7ca

### Phase 2: Scripted deterministic adapter

#### Automated

- [x] 2.1 Unit tests pass: needs_more_info → complete loop, schema-valid, all variants covered — b4ce7ca
- [x] 2.2 `yarn typecheck` passes — b4ce7ca

#### Manual

- [x] 2.3 Scratch-script run of the adapter produces a plausible question and mapping table — b4ce7ca

### Phase 3: Prove the contract is swappable

#### Automated

- [x] 3.1 Swap test passes — b4ce7ca
- [x] 3.2 Broad gate passes: `yarn generate && yarn typecheck && yarn lint && yarn ds:check && yarn test && yarn build` — b4ce7ca

#### Manual

- [x] 3.3 Full scripted loop walkthrough matches the PRD's demo-path narrative — b4ce7ca
