---
change_id: mercatify-run-in-lab-handoff
title: Hand the document to Lab, with a first-class not-installed path
status: new
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
