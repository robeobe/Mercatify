---
change_id: mercatify-run-in-lab-handoff
title: Hand the document to Lab, with a first-class not-installed path
status: implemented
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **S-06** — see `context/foundation/roadmap.md`.

**Amended 2026-09-19** (`mercatify-intake-start` follow-up, user decision): "when the client accepts, you send it to Lab" — the trigger is the client's existing **Accept** action on the report (`client/offer.html`), not a separate client-facing "Run in Mercatify Lab" button (no such button exists in the evolved mockups).

Outcome: when the client accepts the report, exactly the current content of the `.md` — as the admin last left it, edited or pasted — is handed to Lab; when Lab is not installed, what would have been handed over is shown instead of an error.

- PRD refs: US-01, FR-012, FR-013
- Prerequisites: S-05 (`mercatify-handoff-document`), F-02 (`mercatify-lab-analysis-contract`)
- Parallel with: S-04
- External blocker: Mercatify Lab does not exist yet, so the installed-Lab path can only be verified end-to-end once Lab ships a receiving surface. The not-installed path (FR-013) is fully verifiable now and is what the demo runs on.
- Failure mode to avoid: treating the absent-Lab case as an error path. FR-013 is explicit that it is a first-class outcome.
- Open (non-blocking): how "Lab is installed" is detected — F-02 fixes the contract, not the discovery mechanism.

**Implemented 2026-09-19** (issue #22). See `plan.md`.

- The open discovery question is answered by a second, **defaultless** registry next to F-02's port: `registerMercatifyLabHandoffPort` / `getMercatifyLabHandoffPort` in `lib/mercatify-lab-port.ts`. No port registered *is* "Lab is not installed", so FR-013 is the default state rather than a branch somebody has to remember to write.
- `mercatify.cases.answer` runs the handoff after the status write commits, and only for `accepted`. The document it hands over is `InterviewCase.handoffDocument` read at that moment — never regenerated from the mapping table.
- The outcome is snapshotted on the case (`labHandoffStatus`, `labHandoffDocument`, `labHandoffAt`), so a later admin edit cannot rewrite what was handed over. Four outcomes, none of them an error path: `delivered`, `not_installed`, `no_document`, `failed`.
- **Where FR-013's content is shown: the admin's handoff screen, not the client's.** S-05 reassigned the `.md` to the admin role and `api/handoff-document/route.ts` is gated on `mercatify.handoff.view` precisely so a client session never receives it. Rendering the would-be-handed-over text to the client would have undone that. The client's Accept keeps behaving exactly as S-10 built it — no error, no spinner, no dead end.
