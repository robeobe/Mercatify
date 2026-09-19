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

Outcome: the client clicks "Run in Mercatify Lab" and exactly the current content of the `.md` — as they last left it, edited or pasted — is handed to Lab; when Lab is not installed they see what would have been handed over instead of an error.

- PRD refs: US-01, FR-012, FR-013
- Prerequisites: S-05 (`mercatify-handoff-document`), F-02 (`mercatify-lab-analysis-contract`)
- Parallel with: S-04
- External blocker: Mercatify Lab does not exist yet, so the installed-Lab path can only be verified end-to-end once Lab ships a receiving surface. The not-installed path (FR-013) is fully verifiable now and is what the demo runs on.
- Failure mode to avoid: treating the absent-Lab case as an error path. FR-013 is explicit that it is a first-class outcome.
- Open (non-blocking): how "Lab is installed" is detected — F-02 fixes the contract, not the discovery mechanism.
