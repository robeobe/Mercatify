# Show the Three-Line Net Saving and Payback — Implementation Plan

## Overview

Roadmap slice S-04 (GitHub issue #18). Once a case's capability mapping exists
(S-03), the admin needs to see the net annual saving as three distinct lines —
SaaS saving, OM operating cost, implementation cost — never blended, with
payback computed against the net figure. This plan wires that computation and
its UI on top of the existing `mercatify` module.

## Current State Analysis

- S-03 (`mercatify-mapping-summary`) is done: `MappingRow` rows are generated
  once per case by `generateMappingCommand` (`commands/mapping.ts:114`) from
  `getMercatifyLabPort().evaluate(...)`, and rendered by `MappingTable.tsx` on
  `backend/cases/[id]/mapping/page.tsx`.
- `generateMappingCommand` currently calls the port with `saasTools: []`
  hardcoded (`commands/mapping.ts:154`) — a known, accepted gap from F-02's
  plan, never wired to the real `InterviewCaseTool` rows S-01 already
  persists.
- `MercatifyMappingRowSchema` (`lib/mercatify-lab-port.ts`) has no field
  identifying which SaaS product a capability came from — only its `target`
  (what it maps to). F-02's plan deliberately kept money out of this contract.
- `InterviewCaseTool` (`data/entities.ts:168`) already stores each SaaS tool's
  `monthlyCost` (numeric(12,2)), captured at intake (S-01).

### Key Discoveries — the business-rule decision (2026-09-19, issue #18)

Two rounds of clarification were needed; see
`context/changes/mercatify-savings-breakdown/change.md` for the full record.
The resolved rule:

1. Every capability keeps its one of five decisions from S-03's mapping.
2. **OM operating cost and implementation cost are customer-provided inputs**,
   never invented or computed by an analysis/LLM step. This was confirmed by
   pointing at `mercatify-labs/` — an existing, tested, standalone prototype
   of "Mercatify Lab" in this same repo (`mercatify-labs/SPEC.md` "iron rule
   #2", `mercatify-labs/src/computeScenario.ts:9-11`) whose `compute_scenario`
   tool takes these two figures as opaque inputs and its `get_case_data` tool
   returns no cost fields at all. The user confirmed: **follow
   `mercatify-labs` as-is.**
3. `mercatify-labs`' formula (`computeScenario.ts`) is the formula to mirror,
   not import: `grossAnnualSaving` = sum of `monthlyCost × 12` for every SaaS
   product whose mapped capabilities are *all* native/configure/build (a
   single `integrate`/`keep` capability retains the whole subscription);
   `netAnnualSaving = grossAnnualSaving − omOperatingCost`; `netPaybackMonths
   = implementationCost / (netAnnualSaving / 12)` when `netAnnualSaving > 0`,
   otherwise "not reached".
4. This formula needs to know **which SaaS product each capability came
   from** (`mercatify-labs`' `mapping.source`, required in its own
   `map_capabilities` output) — `MercatifyMappingRowSchema` has no equivalent
   field today. Adding one is a mechanical consequence of "follow
   `mercatify-labs` as-is", not a new business-rule fork: it is descriptive
   analysis output (which product a capability was read from), not a money
   field, so it does not reopen F-02's "no money in the contract" decision.
   `mercatify-labs` is a separate, un-imported package (its own
   `package.json`/tsconfig, likely a hackathon side-project) — this plan
   replicates its formula in `mercatify`-owned code, it does not depend on it.

## Desired End State

- `MercatifyMappingRowSchema` gains a required `source` field (the SaaS
  product name). The scripted adapter's fixture rows each carry one.
- `generateMappingCommand` sends the case's real `InterviewCaseTool` rows as
  `saasTools` to the Lab port (closing the pre-existing gap) and persists
  `source` on each created `MappingRow`.
- `InterviewCase` gains two nullable customer-provided inputs:
  `omOperatingCost`, `implementationCost` (numeric(12,2), like
  `InterviewCaseTool.monthlyCost`). A new admin-only action lets these be set
  or edited independently of the case's `draft`-only profile-edit guard,
  since they are entered while preparing the mapping/report, not part of the
  client's intake profile.
- A new pure function `computeSavingsScenario()` in `lib/savings.ts` mirrors
  `computeScenario.ts`'s formula exactly, computed on read (never persisted,
  so editing costs or re-generating mapping can never leave a stale derived
  number).
- A new `GET /api/mercatify/cases/[id]/savings` route returns the current
  inputs (raw `omOperatingCost`/`implementationCost`, the SaaS stack) and the
  computed scenario (gross/net/payback, removed/retained SaaS) for one case.
- A new `POST /api/mercatify/cases/[id]/costs` route lets an admin set the two
  cost inputs.
- The mapping page renders a `SavingsBreakdown` panel: three distinct lines
  (SaaS saving / OM operating cost / implementation cost, each labelled with
  its source), the net annual saving, and payback — never a single blended
  number — plus an "Enter costs" / "Edit costs" action.

### Verification

- Unit tests: `computeSavingsScenario()` against `mercatify-labs`'
  `computeScenario.test.ts` cases (removed-vs-retained logic, net ≤ 0 →
  payback "not reached"); command tests extending `mapping.test.ts` (real
  tools flow through as `saasTools`, `source` persisted); a new
  `commands/__tests__/case-costs.test.ts` (scope, optimistic lock, editable
  regardless of case status).
- Manual: mapping page shows three distinct lines, a net figure, and payback,
  with source labels, and an empty state before costs are entered.

## What We're NOT Doing

- Not importing or depending on the `mercatify-labs` package — only its
  formula is replicated, in `mercatify`-owned code.
- Not persisting the computed scenario (gross/net/payback) — always derived
  on read from the three raw inputs, so it can never go stale.
- Not making the scripted adapter responsive to real `saasTools` content for
  its mapping *decisions* — it stays a fixed fixture (pre-existing, accepted
  scope from F-02); this plan only wires the real tools into the request and
  adds a `source` label per fixture row. A fixture `source` will not usually
  name-match a real customer's tools, so `grossAnnualSaving` on the demo
  fixture will typically compute to 0 until a real Lab (or a richer fixture)
  is plugged in — an accepted, pre-existing limitation, not a regression.
- Not locking `omOperatingCost`/`implementationCost` once the mapping is
  confirmed — no acceptance criterion asks for it, and the admin may need to
  update internal costing figures while still preparing the report.
- Not touching S-09 (report screen) — out of scope for this issue.

## Implementation Approach

Keep the "money computed deterministically, never by an analysis step"
guardrail intact: the two cost inputs are plain admin-entered numbers, and
`computeSavingsScenario()` is a pure, independently-testable function that is
the only place the three lines, net figure and payback are ever calculated.

## Phase 1: Contract + fixture — `source` on a mapping row

### Changes Required

**`lib/mercatify-lab-port.ts`**: add `source: z.string()` to
`MercatifyMappingRowSchema` (the SaaS product name this capability was mapped
from).

**`lib/scripted-mercatify-lab-adapter.ts`**: give each `SCRIPTED_MAPPING` row
a plausible `source` (e.g. `'Salesforce'` for CRM contacts, `'FreshBooks'` for
Invoicing, `'Figma'` for Design collaboration, `'Google Sheets'` for the
reporting dashboard, `'Mailchimp'` for Marketing automation, `'Legacy ERP'`
for inventory sync).

**`data/entities.ts`**: `MappingRow` gains `source!: string` (`text`, column
`source`).

**Migration**: new migration adding `mercatify_mapping_rows.source text not
null default ''`.

### Success Criteria

- `yarn typecheck` passes.
- `scripted-mercatify-lab-adapter.test.ts` still passes unchanged (schema
  now requires `source`; the fixture supplies it).

## Phase 2: Wire real SaaS tools into the Lab request; persist `source`

### Changes Required

**`commands/mapping.ts`** (`generateMappingCommand`): before calling
`getMercatifyLabPort().evaluate(...)`, load the case's `InterviewCaseTool`
rows in scope and map them to `{ name, monthlyCost, notes }` for the
`saasTools` request field (replacing the hardcoded `[]`); persist
`source: row.source` on each created `MappingRow`.

**`components/MappingTable.tsx`** / DTO: add `source` to `MappingRowDto` if
displayed (optional — not required by the acceptance criteria, skip unless a
column is cheap to add; the "Mapped to" column stays as-is).

### Success Criteria

- `commands/__tests__/mapping.test.ts` (extended in Phase 4) passes: a seeded
  `InterviewCaseTool` flows through as `saasTools` in the request, and every
  created row has a non-empty `source`.

## Phase 3: Cost inputs, `computeSavingsScenario`, and API surface

### Changes Required

**`data/entities.ts`** (`InterviewCase`): add `omOperatingCost?: string |
null` and `implementationCost?: string | null` (numeric(12,2), nullable,
same convention as `InterviewCaseTool.monthlyCost`).

**Migration**: extend the Phase 1 migration (or a second one) adding
`mercatify_interview_cases.om_operating_cost numeric(12,2) null` and
`.implementation_cost numeric(12,2) null`.

**`data/validators.ts`**: add
`interviewCaseCostsSchema = z.object({ id: z.string().uuid(), omOperatingCost: z.number().nonnegative().nullable().optional(), implementationCost: z.number().nonnegative().nullable().optional() })`.

**`lib/savings.ts`** (new file): mirrors `mercatify-labs/src/computeScenario.ts`
exactly, against this app's own shapes:

```ts
export type SavingsMappingInput = { source: string; decision: string }
export type SavingsStackInput = { name: string; monthlyCost: number }
export type SavingsScenario = {
  removedSaaS: string[]
  retainedSaaS: string[]
  grossAnnualSaving: number
  omOperatingCost: number | null
  netAnnualSaving: number | null
  implementationCost: number | null
  netPaybackMonths: number | null // null = not reached, or an input is missing
}
export function computeSavingsScenario(
  mappings: SavingsMappingInput[],
  stack: SavingsStackInput[],
  costs: { omOperatingCost: number | null; implementationCost: number | null },
): SavingsScenario
```

A stack product is retained if it has zero mappings, or any mapping with
decision `integrate`/`keep`; otherwise removed. `netAnnualSaving` is `null`
until `omOperatingCost` is set; `netPaybackMonths` is `null` unless
`netAnnualSaving > 0` and `implementationCost` is set (JSON has no
`Infinity` — `null` stands in for `computeScenario.ts`'s `Infinity`
"payback not reached" case).

**`commands/cases.ts`**: add `updateCaseCostsCommand` (id
`mercatify.cases.costs.update`) — loads the case in scope, enforces the
optimistic lock on `updatedAt` in `prepare` (mirrors `updateCaseCommand`),
sets `omOperatingCost`/`implementationCost` in `execute`. Deliberately does
**not** route through `hasProfileOrToolEdits`'s `status !== 'draft'` guard —
these are admin-entered backstage figures, not part of the client's intake
profile, and must stay editable after the case has been sent. Emits
`caseCrudEvents` (`mercatify.case.updated`) like the existing update command.

**New API routes** (mirroring `api/mapping-rows/{generate,confirm}/route.ts`
and reusing `resolveMappingActionContext` from `api/mapping-rows/shared.ts`):
- `api/cases/[id]/costs/route.ts` — `POST`, `requireFeatures:
  ['mercatify.mapping.manage']`, dispatches `mercatify.cases.costs.update`.
- `api/cases/[id]/savings/route.ts` — `GET`, `requireFeatures:
  ['mercatify.mapping.view']`, loads the case + its `MappingRow`s + its
  `InterviewCaseTool`s in scope, calls `computeSavingsScenario`, returns raw
  inputs (`omOperatingCost`, `implementationCost`, `currency`) plus the
  computed scenario.

### Success Criteria

#### Automated

- `yarn typecheck && yarn lint` pass.
- New `commands/__tests__/case-costs.test.ts`: sets costs, 409s on stale
  version, fails closed on missing tenant/org, works regardless of case
  status.
- New `lib/savings.test.ts`: covers the removed-vs-retained grouping,
  `netAnnualSaving <= 0` → `netPaybackMonths: null`, missing
  `omOperatingCost`/`implementationCost` → `netAnnualSaving`/`netPaybackMonths:
  null`, and a case matching `mercatify-labs/src/__tests__/computeScenario.test.ts`'s
  own fixture (same inputs, same numeric outputs) as a cross-check against
  the formula it mirrors.

#### Manual

- `POST .../costs` then `GET .../savings` round-trips the entered values and
  a non-zero `grossAnnualSaving` when mapping rows' `source` matches a real
  tool name.

## Phase 4: UI — the three lines, net figure, and payback

### Changes Required

**`components/SavingsBreakdown.tsx`** (new): fetches
`GET /api/mercatify/cases/${caseId}/savings` (React Query, same pattern as
`MappingTable`'s `caseQuery`/`rowsQuery`). Renders:
- Three distinct lines — SaaS saving (labelled "from the submitted SaaS
  stack"), OM operating cost, implementation cost (both labelled "entered by
  admin") — using `formatCurrency` from `@open-mercato/ui/utils/format`,
  **never** combined into one figure.
- Net annual saving (labelled "SaaS saving net of OM operating cost").
- Payback (labelled against the net figure; "not reached" when null).
- Loading state (skeleton/spinner matching `MappingTable`'s `isLoading`
  pattern), error state (mirrors `MappingTable`'s 401/403-vs-generic split),
  empty state before costs are entered (prompts "Enter costs" instead of
  showing a net figure computed from nulls).
- An "Enter costs" / "Edit costs" button opening `EditCaseCostsDialog`.

**`components/EditCaseCostsDialog.tsx`** (new): `CrudForm`-based dialog
mirroring `EditMappingRowDialog.tsx`'s structure, two `type: 'number'` fields
(`omOperatingCost`, `implementationCost`), `onSubmit` posts to
`/api/mercatify/cases/${caseId}/costs` via `apiCallOrThrow` (not
`updateCrud`, since this isn't the generic case CRUD route).

**`backend/cases/[id]/mapping/page.tsx`**: render `<SavingsBreakdown
caseId={caseId} />` alongside `<MappingTable caseId={caseId} />`.

**`i18n/en.json`** (+ `de`/`pl`/`ko`/`es`): new keys under
`mercatify.savings.*` for all of the above (labels, empty state, errors,
dialog fields) — mirrors the `mercatify.mapping.*` key structure already in
place. Non-English locales get literal placeholder text if no immediate
translation is available, consistent with any existing gaps in this module's
i18n files (never leave a hardcoded English string in JSX).

### Success Criteria

#### Automated

- `yarn typecheck && yarn lint && yarn ds:check && yarn test` pass.

#### Manual

- On the mapping page: before costs are entered, an empty state prompts
  entry; after entering costs, three distinct lines render, plus a net figure
  and payback; the three lines are never shown blended into one number
  anywhere; editing costs updates the panel without a page reload.

## Testing Strategy

- Unit: `lib/savings.test.ts` (pure formula), extended
  `commands/__tests__/mapping.test.ts` (real `saasTools` wiring, `source`
  persisted), new `commands/__tests__/case-costs.test.ts` (scope, lock,
  status-independence).
- No integration/E2E suite exists yet for this module (consistent with S-01
  and S-03's plans) — manual verification only for the API round-trip and UI.

## References

- Issue: https://github.com/robeobe/Mercatify/issues/18
- `context/changes/mercatify-savings-breakdown/change.md` — the two-round
  business-rule decision record
- `context/foundation/roadmap.md` — S-04, Open Questions 1/3/4
- `mercatify-labs/SPEC.md`, `mercatify-labs/src/computeScenario.ts`,
  `mercatify-labs/src/__tests__/computeScenario.test.ts` — the formula this
  plan mirrors
