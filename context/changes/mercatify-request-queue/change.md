---
change_id: mercatify-request-queue
title: Show the admin request queue with status filters and per-row next action
status: new
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **S-07**. See `context/foundation/roadmap.md`.

**Added 2026-09-19** — gap found while reviewing `assets/console/requests.html` against the roadmap during `mercatify-intake-start`'s follow-up planning: no slice built the list an admin actually lands on before opening S-03's mapping table.

Outcome: admin sees every submitted request in one queue, filterable by status, with header stats (new / in mapping / with the client / answered) and, per row, the one next action that status allows — Map, Continue mapping, Build report, or Report — matching `assets/shared/om-core.js`'s `requestActions()` state machine, so the queue, the mapping screen (S-03) and the report screen (S-09) never disagree about what is possible next.

- PRD refs: FR-016
- Prerequisites: F-01 (`mercatify-module-scaffold`)
- Parallel with: S-01, S-03 — S-03 does not require this to exist first (it can be reached and tested via a direct link); this is what makes the admin persona able to find it without one
- Open (non-blocking): whether "admin" is a role inside the same trial tenant or cross-tenant Mercatify staff (roadmap Open Question 16) — this slice assumes the single-tenant reading, consistent with S-01/S-03
