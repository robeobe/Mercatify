---
change_id: mercatify-intake-start
title: Show the interview starting point: profile and SaaS tools with costs
status: planned
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

Roadmap item **S-01** — see `context/foundation/roadmap.md`.

Outcome: the client (`employee` role) can open Mercatify inside the OM admin of their tenant, build and send the starting point (company profile and SaaS tools with monthly costs), then see a read-only confirmation. Send locks the case for this slice; later slices (S-08/S-10) add status/report follow-up without reopening edit.

- PRD refs: US-01, FR-001, FR-015, FR-014
- Prerequisites: F-01 (`mercatify-module-scaffold`)
- Parallel with: S-03
- This is the first slice where auto-discovery, feature flags and tenant scoping become visible to a person rather than to a test, so it doubles as the live check on FR-014 and FR-015.
- Failure mode to avoid: building a bespoke screen where installed admin primitives already do the job.
- Open (non-blocking): the demo dataset's actual content was not captured in shaping.

### Decision — mockup is source of truth (2026-09-19)

The static intake mockup (`assets/client/intake.html`) is the interaction source of truth for this change. Consequences recorded in the PRD:

- FR-001: the client **builds and sends** the stack (searchable catalog, duplicate-capability badges, custom tools, draft/send/lock), not a read-only seeded view.
- Non-goal "no free-form entry of the client's own SaaS stack" is superseded: off-catalog tools are in scope.
- Access Control: the "flat roles" stance is amended. `employee` fills and sends the interview (`mercatify.cases.view` + `mercatify.cases.manage`); `admin` owns mapping/report/savings (S-03+).
