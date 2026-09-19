---
change_id: mercatify-discovery-wizard
title: Run the discovery wizard with dynamically injected questions
status: superseded
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **S-02** — see `context/foundation/roadmap.md`.

**Superseded 2026-09-19** (`mercatify-intake-start` follow-up, user decision): the employee's flow ends at Send — "the submission is sent, and that's it," no wizard, no agent feedback follows. If the analysis needs more information, the **admin** resolves it while editing the mapping (S-03, `mercatify-mapping-summary`), not the employee through a chip-based loop. Do not plan or implement this change as written; kept for history.

Outcome (historical, not to be built): the client answers discovery questions step by step by clicking chips, can add anything unanticipated in a free-text field, and keeps receiving further questions injected by the analysis whenever it decides it lacks information — the loop ending when the analysis says nothing is missing or the question cap is reached.

- PRD refs: US-01, FR-002, FR-003, FR-004 (superseded — see PRD amendment)
- Prerequisites: S-01 (`mercatify-intake-start`), F-02 (`mercatify-lab-analysis-contract`)
