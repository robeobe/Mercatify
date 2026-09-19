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

**Resolved 2026-09-19** (user decision, PRD Open Question 8): the table and the `.md` are independent artifacts. Editing the mapping table never regenerates or touches the `.md`; the `.md` is the only document that travels to Mercatify Lab. No serializer, no cross-artifact conflict story needed. Unblocked.

- Open (non-blocking): handling of pasted content that may carry sensitive data (PRD Open Question 9).
