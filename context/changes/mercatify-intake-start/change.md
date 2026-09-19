---
change_id: mercatify-intake-start
title: Show the interview starting point: profile and SaaS tools with costs
status: new
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **S-01** — see `context/foundation/roadmap.md`.

Outcome: the client can open Mercatify inside the OM admin of their tenant and see the starting point: their company profile and the set of SaaS tools in use with their monthly costs.

- PRD refs: US-01, FR-001, FR-015, FR-014
- Prerequisites: F-01 (`mercatify-module-scaffold`)
- Parallel with: S-03
- This is the first slice where auto-discovery, feature flags and tenant scoping become visible to a person rather than to a test, so it doubles as the live check on FR-014 and FR-015.
- Failure mode to avoid: building a bespoke screen where installed admin primitives already do the job.
- Open (non-blocking): the demo dataset's actual content was not captured in shaping.
