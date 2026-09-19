---
change_id: mercatify-savings-breakdown
title: Show the three-line net saving and payback
status: ready
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **S-04**. See `context/foundation/roadmap.md`. Was BLOCKED; unblocked 2026-09-19 by user decision on GitHub issue #18 (see below).

Outcome: the net annual saving is presented as three separate lines — SaaS saving, OM operating cost and implementation cost, never blended into one figure — with payback measured against the net figure, not the gross SaaS saving.

- PRD refs: US-01, FR-007
- Prerequisites: S-03 (`mercatify-mapping-summary`) — done
- Parallel with: S-05

## Business rule decision (2026-09-19, owner: user, via GitHub issue #18)

Resolves PRD Open Questions 1, 3 and 4. Took two rounds to pin down — recorded
both for the audit trail.

1. **Formula confirmed as the spec's candidate**: every capability keeps its one of five decisions (native/configure/build/integrate/keep) from S-03's mapping; the saving shown is always **net** of OM's operating cost; the three lines (SaaS saving, OM operating cost, implementation cost) are rendered distinctly and never blended into a single number; payback is computed against the **net** figure.
2. **First answer (superseded): "Lab returns dollar amounts."** The user's first answer implied Mercatify Lab itself would compute and return OM operating cost and implementation cost as net dollar amounts, which would have reversed F-02's (`mercatify-lab-analysis-contract`) deliberate "no money in the `MercatifyLabPort` contract" design.
3. **Correction, final answer: OM operating cost and implementation cost are customer-provided inputs — Lab never computes them.** Before implementing #2, the repo was found to already contain a real, tested "Mercatify Lab" prototype at `mercatify-labs/` (a separate, un-imported package — its own `package.json`, likely a HackOn 2026 side-project). Its `compute_scenario` tool (`mercatify-labs/tools/compute_scenario.json`) and `computeScenario.ts` take `omOperatingCost`/`implementationCost` as opaque inputs — the code comment states plainly: *"Inputs (omOperatingCost, implementationCost) are customer-provided and only ever selected/passed through by an agent, never invented"* (`mercatify-labs/SPEC.md` "iron rule #2"). `get_case_data` (Lab's read of a case) returns no cost fields at all. Presented with this conflict, the user chose: **follow `mercatify-labs` as-is.** F-02's original "no money in the contract" design therefore stands — no `MercatifyLabPort` change for money.
4. **Source of SaaS saving**: customer-provided, via intake's per-tool monthly costs (F-01/S-01). Following `mercatify-labs`' `computeScenario.ts` formula exactly: a SaaS product's cost only counts toward the saving when *every one* of its mapped capabilities resolved to native/configure/build — a single `integrate`/`keep` capability keeps the whole subscription (you don't half-cancel a SaaS contract).
5. **Non-money, mechanical consequence**: computing that formula requires knowing which SaaS product each mapping row's capability came from (`mercatify-labs`' `mapping.source`) — `MercatifyMappingRowSchema` gains a `source` field. This is descriptive analysis output, not a money field, so it does not reopen F-02's contract decision.
6. **Traceability**: SaaS saving is customer-provided (intake); OM operating cost and implementation cost are customer-provided (admin-entered, independent of the intake profile). See `plan.md` for the full design.
