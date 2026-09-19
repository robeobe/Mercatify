---
change_id: mercatify-client-requests
title: Show the client's list of their own requests and a per-request progress track
status: in-review
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **S-08**. See `context/foundation/roadmap.md`.

**Added 2026-09-19** — gap found reviewing `assets/client/requests.html` and `assets/client/request.html`. This revises `mercatify-intake-start`'s (S-01) "Sending is terminal — the employee sees a read-only confirmation and nothing else, no further status appears to them" language, which cannot hold once S-10 requires the client to come back and read a sent report. S-01's own build scope is unaffected; only the claim that nothing further is ever built for that role is superseded.

Outcome: client (the `employee` role from S-01) sees a list of every request they have submitted, each showing whose turn it is — with Mercatify or with them — and can reopen any one to see what they sent and a plain progress track (sent → a consultant reads it → your report comes back → you decide). Once a report is sent, this is where the client discovers it and reaches it (S-10). This does not reopen editing of a sent case — S-01's lock stands; it only adds a way back in to *see* status and, once ready, the report.

- PRD refs: FR-017
- Prerequisites: S-01 (`mercatify-intake-start`)
- Unlocks: S-10 (`mercatify-client-offer`) — its client-side entry point
- Open (non-blocking): scoped to the trial tenant's own cases, not a separate client portal — consistent with S-01's explicit Non-Goal of not building `client/login.html` or a separate portal
