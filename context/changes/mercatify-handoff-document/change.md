---
change_id: mercatify-handoff-document
title: Show and edit the markdown handoff document
status: new
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **S-05** — BLOCKED. See `context/foundation/roadmap.md`.

**Amended 2026-09-19** (`mercatify-intake-start` follow-up, user decision): reassigned from the client to the **admin** role. The `.md` is prepared while the admin builds the report (alongside S-03/S-04) and is never shown to the client directly — the client sees the report (`client/offer.html`) and either accepts or asks for a consult call.

Outcome: the admin sees, while preparing the report, a `.md` configuration document carrying everything Mercatify Lab needs for implementation, in an edit window — and can edit it or paste in a whole document prepared elsewhere.

- PRD refs: US-01, FR-010, FR-011
- Prerequisites: S-03 (`mercatify-mapping-summary`)
- Parallel with: S-04

**Blocked on one cheap decision that changes the whole shape of the change** (PRD Open Question 8, owner: team): does editing the table regenerate the `.md`, or are the two independent artifacts with the `.md` as the only document that travels? A regenerated document needs a serializer and a conflict story for edits made on both sides; an independent document needs neither. Planning before that call is planning two different changes at once.

- Open (non-blocking): handling of pasted content that may carry sensitive data (PRD Open Question 9).
