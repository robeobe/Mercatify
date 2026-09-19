---
change_id: mercatify-mapping-summary
title: Show the analysis-filled mapping table with flagged unmapped items
status: new
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **S-03** — the north star. See `context/foundation/roadmap.md`.

Outcome: the client sees, in one table filled by the analysis, every capability or tool mapped to a real OM module (or to an external tool when the decision is keep or integrate), with one decision out of native / configure / build / integrate / keep, a justification and a confidence band — anything unmapped visibly flagged rather than dropped — and can edit the table before handing anything over.

- PRD refs: US-01, FR-005, FR-006, FR-008
- Prerequisites: F-01 (`mercatify-module-scaffold`), F-02 (`mercatify-lab-analysis-contract`)
- Parallel with: S-01, S-02 — this slice builds against the seeded case, it does not wait for the wizard
- Guardrail: confidence is only ever High / Medium / Low, never a percentage
- Open (non-blocking): which module registry the table may name — the 11 modules enabled in this app, or the full core + enterprise catalog quoted in the PRD (roadmap Open Question 15)
- Open (non-blocking): who maintains the SaaS-capability to OM-module map, given v1 has no editor for it (PRD Open Question 5)
