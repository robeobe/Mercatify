---
change_id: mercatify-report-build-send
title: Admin builds and sends the client-facing report from a confirmed mapping
status: implemented
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **S-09** — BLOCKED (inherits S-04's money-formula blockers). See `context/foundation/roadmap.md`.

**Added 2026-09-19** — gap found reviewing `assets/console/report.html`, distinct from S-04's three saving lines and S-05's `.md` editor: neither builds the report screen or its **Send to the client** action, and nothing in the roadmap currently flips a request's status to `sent`.

Outcome: admin builds, from a confirmed (`mapped`) request, the report the client will see: a computed headline and summary, the four KPIs, a verdict bar per job in the stack, the tool-by-tool table with confidence bands (from S-03's mapping), the duplicates, the net saving as three separate lines (S-04) with a basis for each figure, the build backlog with hours and cost (unestimated hours print as "to estimate"), the cash curve, and the client's own stated pains/must-keep — then sends it, which sets status to `sent` and is what first makes anything visible to the client (S-10).

- PRD refs: FR-018
- Prerequisites: S-03 (`mercatify-mapping-summary`), S-04 (`mercatify-savings-breakdown`)
- Parallel with: S-05 (`mercatify-handoff-document`)
- Unlocks: S-10 (`mercatify-client-offer`)

~~**Blocked** on the same PRD Open Questions as S-04 (1, 3, 4 — the saving formula and the two cost sources) for the money portions of the report only.~~
**Unblocked 2026-09-19**: S-03 (#14), S-04 (#18) and S-05 (#19/PR #28) have all landed on `main`. The saving formula and both cost sources are decided — see `context/changes/mercatify-savings-breakdown/change.md` "Business rule decision".

- Resolved (was open): this report and S-05's `.md` are **independent artifacts**, in line with PRD Open Question 8's resolution for the `.md`. The report is derived live from the confirmed mapping on every read; the `.md` is seeded once and then edited freely. Neither regenerates the other.

See `plan.md` / `plan-brief.md` for the implementation design.
