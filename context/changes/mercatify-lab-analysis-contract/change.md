---
change_id: mercatify-lab-analysis-contract
title: Fix the Mercatify to Mercatify Lab contract and ship a scripted adapter
status: new
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **F-02** (foundation) — see `context/foundation/roadmap.md`.

Outcome: the interface between Mercatify and Mercatify Lab is written down as a versioned contract — what the interview sends, what the analysis returns (further questions, mappings, decisions, confidence bands, amounts), and what the handoff carries — with one deterministic scripted adapter behind it, so every downstream slice can be built, demoed and tested without Lab existing.

- PRD refs: FR-003, FR-012, FR-013, Constraints (Dependency on Mercatify Lab), Success Criteria (scripted demo path), PRD Open Question 2
- Prerequisites: none — plan in parallel with `mercatify-module-scaffold`
- Unlocks: S-02, S-03, S-05, S-06; resolves PRD Open Question 2 before work is split between the two modules
- Scope cap: one port plus one scripted adapter. Not an analysis implementation.
- Decide and record here: whether the spec's iron rules (catalog used as a lookup; money computed deterministically rather than by the analysis) live inside Lab or are imposed on Lab by this contract.
