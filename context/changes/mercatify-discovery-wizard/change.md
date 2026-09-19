---
change_id: mercatify-discovery-wizard
title: Run the discovery wizard with dynamically injected questions
status: new
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **S-02** — see `context/foundation/roadmap.md`.

Outcome: the client answers discovery questions step by step by clicking chips, can add anything unanticipated in a free-text field, and keeps receiving further questions injected by the analysis whenever it decides it lacks information — the loop ending when the analysis says nothing is missing or the question cap is reached.

- PRD refs: US-01, FR-002, FR-003, FR-004
- Prerequisites: S-01 (`mercatify-intake-start`), F-02 (`mercatify-lab-analysis-contract`)
- Parallel with: S-03
- Fix during planning: the exact question cap. The PRD records only "a few" (PRD Open Question 7). The cap is what keeps this demoable.
- No progress indicator — the number of steps is unknown by design (PRD Non-Goals).
- Open (non-blocking): how deep the questions go per tool (PRD Open Question 6); handling of free-text answers that may carry sensitive data (PRD Open Question 9).
