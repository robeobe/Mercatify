---
change_id: mercatify-savings-breakdown
title: Show the three-line net saving and payback
status: new
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **S-04** — BLOCKED. See `context/foundation/roadmap.md`.

Outcome: the client sees the net annual saving presented as three separate lines — SaaS saving, OM operating cost and implementation cost, never blended — with payback measured against the net figure.

- PRD refs: US-01, FR-007
- Prerequisites: S-03 (`mercatify-mapping-summary`)
- Parallel with: S-05

**Blocked until three questions are answered — one decision answers all three:**
1. The module's one-sentence business rule and the saving formula are still a spec-derived candidate, not a decision (PRD Open Question 1, owner: user).
2. Who provides the OM operating cost figure (PRD Open Question 3).
3. Who provides the implementation cost figure (PRD Open Question 4).

Confirming the spec's candidate — all costs are customer-provided, the three-line formula, payback against net — answers 2 and 3 at once and promotes this change to ready. Do not plan around a guessed formula: a saving figure derived from an unconfirmed rule is exactly the false precision the PRD guardrail exists to prevent.
