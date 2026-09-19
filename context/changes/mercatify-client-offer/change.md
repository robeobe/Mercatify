---
change_id: mercatify-client-offer
title: Client sees the sent report and accepts it or asks for a consult call
status: implemented
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **S-10** — BLOCKED (transitively, behind S-09). See `context/foundation/roadmap.md`.

**Added 2026-09-19** — gap found reviewing `assets/client/offer.html`. `mercatify-run-in-lab-handoff`'s (S-06) change.md already assumed this screen exists — "the client's existing Accept action on the report (`client/offer.html`)" — but no slice built it.

Outcome: client (employee role) reads the sent report and either **accepts** it or **asks for a call with Sales** — the same screen and the same two actions S-06 wires to the Lab handoff. Their answer (`accepted` or `consult`) is visible back to the admin in S-07's queue and on their own S-08 request tile/track.

- PRD refs: FR-019
- Prerequisites: S-08 (`mercatify-client-requests`), S-09 (`mercatify-report-build-send`)
- Unlocks: S-06 (`mercatify-run-in-lab-handoff`) — its Accept trigger has no screen to fire from without this

Risk note: build this as a read-only render of S-09's report output plus two buttons, not a second, disconnected renderer — that is what keeps an admin's later edit visible to the client without a separate "regenerate" step, per the mockup's design.

**Implemented 2026-09-19** (issue #21). See `plan.md`. The risk note held: no renderer and no derivation were added. `GET /api/mercatify/cases/report/client` and the admin builder route now share one `loadReportBundle`, both run `buildReportModel`, and `/backend/requests/[id]/report` renders the result with the same `ReportPreview` the admin previews with.

The answer is the case's `status` (`sent` → `accepted` | `consult`) — no new column, no migration. `mercatify.cases.answer` is its only writer, owner-scoped on `createdByUserId` rather than on a feature, and refuses to run before `CaseReport.sentAt` exists. It emits `mercatify.case.answered`, which is the seam S-06 (#22) should subscribe to for the Lab handoff.
