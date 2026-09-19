# Admin Builds and Sends the Client-Facing Report — Plan Brief

> Full plan: `context/changes/mercatify-report-build-send/plan.md`

## What & Why

Roadmap slice S-09 / issue #20. An admin can confirm a mapping and enter the two
cost inputs today, but there is no screen that assembles those into the document
a client would read, and nothing in the app can put a request into `sent`. This
builds that screen and that one action — send is what first makes anything
visible to the client.

## Starting Point

S-03 (mapping table, locked on confirm), S-04 (three-line net saving, computed
live from customer-provided costs) and S-05 (handoff `.md`) have all landed.
`assets/console/report.html` + `assets/shared/om-core.js` already prototype the
whole report visually. `lib/request-progress.ts` already treats `sent` as
"report ready" for the client — the flag simply has no writer.

## Desired End State

`/backend/cases/[id]/report` shows the admin a compose form beside a live
preview of exactly what the client will see: headline, summary, four KPIs, a
verdict bar, the tool-by-tool table with confidence bands, the duplicates, the
three saving lines with a basis each, the build backlog with hours and cost, the
cash curve, and the client's own pains/must-keep. **Send to the client** stamps
the report and flips the request to `sent`; no other code path can.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| What gets persisted | Only the human-typed parts (headline override, note, reviewer, rate, ramp, open questions, per-item hours, `sentAt`) | Every figure stays derived, so an edited cost or re-run mapping can never leave a stale number — the guardrail S-04 exists for |
| Money model | S-04's `computeSavingsScenario` for the saving lines and the cash curve; `hours × rate` kept separate as a backlog estimate | The prototype invents a "hosting" figure and derives the one-off from hours; S-04's confirmed rule says both costs are customer-provided |
| Backlog hours | Admin input on the report, stored as a JSON map keyed by mapping-row id | Neither the Lab contract nor `mercatify-labs` returns hours, and mapping rows are immutable after confirm |
| Headline / summary | Computed from the mapping, with an optional admin override | Issue #20 says "computed"; the prototype lets a human sharpen the opening line |
| Enforcing "send is the only writer of `sent`" | A guard in `mercatify.cases.update`, not a narrowed schema | `BACKWARD_COMPATIBILITY.md` forbids narrowing a published `data/validators.ts` export |
| Re-sending | Overwrites `sentAt`; leaves the status alone once the client has answered | Re-sending replaces the client's copy, but must not undo `accepted`/`consult` |
| Missing cost inputs | `cashCurve: null` and an explanatory UI state | Refusing to invent beats a guessed line |
| Preview component | Pure and presentational, fed only by the model | S-10 (the client's view, issue #21) reuses it verbatim, so the two views cannot drift |

## Scope

**In scope:** `CaseReport` entity + migration; pure `lib/report.ts` derivation;
`mercatify.report.save` / `mercatify.report.send` commands; the `sent` guard;
two ACL features; two events; GET/PUT report + POST send routes; the report
page, builder, preview and cash-curve chart; i18n in five locales; unit tests
for the model and the commands.

**Out of scope:** the client's view of the report (S-10 / #21); accept /
consult; the handoff `.md`; any change to `MercatifyLabPort`; PDF export;
persisting any derived figure; integration tests.

## Architecture / Approach

`GET /api/mercatify/cases/report` loads the case, its mapping rows and its
tools, runs `computeSavingsScenario` (S-04, untouched) and feeds everything into
the pure `buildReportModel()`. The route returns a model; `ReportPreview`
renders it and knows nothing about fetching. Writes go through the command bus
(`mercatify.report.save`, `mercatify.report.send`) with the module's existing
scope-fails-closed, optimistic-lock, event and audit-log patterns.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data + derivation | `CaseReport` entity, migration, validators, pure `lib/report.ts` + tests | Accidentally blending S-04's implementation cost with the backlog's `hours × rate` |
| 2. Commands + invariant | save/send commands, the `cases.update` guard, ACL, events, tests | Making `sent` unreachable or reachable twice |
| 3. API routes | GET/PUT report, POST send, OpenAPI | Leaking an unsent report to the client role |
| 4. UI | Report page, builder, preview, cash curve, i18n ×5, entry points | Chart accessibility and the locale key set drifting |

**Prerequisites:** #14 and #18 merged (both are, at `d98886f`).
**Estimated effort:** ~1–2 sessions across 4 phases.

## Open Risks & Assumptions

- `omOperatingCost` and `implementationCost` are read as **annual** figures, per
  S-04's existing label and formula. Any monthly KPI divides by 12.
- The migration is generated and committed but **not applied** — applying it is
  the repo owner's call.
- A mapping row whose `source` names no tool in the stack is shown under an
  "unattributed" group rather than dropped, matching FR-006's "flagged, never
  dropped" spirit; the prototype simply lost such rows.

## Success Criteria (Summary)

- Every acceptance criterion in issue #20 renders on a confirmed case.
- **Send to the client** is the only thing in the app that produces `sent`.
- `yarn generate && yarn typecheck && yarn lint && yarn ds:check && yarn test && yarn build` all green.
