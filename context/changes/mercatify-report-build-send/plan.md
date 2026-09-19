# Admin Builds and Sends the Client-Facing Report — Implementation Plan

## Overview

Roadmap slice **S-09** (GitHub issue #20). Once a case's capability mapping is
confirmed (S-03) and the two customer-provided cost inputs exist (S-04), the
admin needs one screen that assembles the document the client will eventually
read — headline, summary, four KPIs, a verdict bar, the tool-by-tool table with
confidence bands, the duplicates, the three saving lines with a basis each, the
build backlog with hours and cost, the cash curve, and the client's own stated
pains/must-keep — and one action that sends it. **Sending is what first makes
anything visible to the client**, and it is the only thing that writes
`status: 'sent'`.

## Current State Analysis

- **S-03 is done.** `MappingRow` (`src/modules/mercatify/data/entities.ts:136`)
  carries `capability`, `source` (the SaaS product the capability was read
  from), `decision` (one of five), `targetLabel`, `confidence` (band only),
  `justification`, `flagged`/`flagReason`. Rows are locked once
  `InterviewCase.mappingConfirmedAt` is set (`commands/mapping.ts:325`).
- **S-04 is done.** `computeSavingsScenario()` (`src/modules/mercatify/lib/savings.ts`)
  mirrors `mercatify-labs`' formula: a SaaS product counts toward the gross
  annual saving only when *every* capability sourced from it resolved to
  native/configure/build. `InterviewCase.omOperatingCost` and
  `InterviewCase.implementationCost` are **customer-provided annual figures**,
  admin-entered via `api/cases/costs`, never computed.
  `GET /api/mercatify/cases/savings` returns the scenario live — never persisted.
- **S-05 is done.** `InterviewCase.handoffDocument` holds the `.md` that travels
  to Lab. PRD Open Question 8 is resolved: the handoff `.md` and the report are
  **independent artifacts**. This plan does not touch the `.md`.
- **Nothing writes `status: 'sent'` today.** `interviewCaseUpdateSchema`
  (`data/validators.ts`) accepts every status value, but the only status a
  command actually writes is `draft` → `new` (client intake, S-01/S-08).
  `lib/request-progress.ts` already treats `sent|accepted|consult` as
  "report ready" for the client's progress track (S-08) — the client side is
  already waiting for this flag to be set.
- **No report screen, entity, route, feature or event exists.** Grep for
  `report` in `src/modules/mercatify` returns only the client-side
  `isReportReadyStatus` helper and its i18n strings.
- **The design is already drawn.** `assets/console/report.html` is the admin
  builder; `assets/client/offer.html` is the client's view of the same
  document; both call `buildOffer()` / `renderOffer()` / `renderCashChart()` in
  `assets/shared/om-core.js:565-1065`. That prototype is the visual and
  structural specification for this slice.

### Key Discoveries

- `assets/shared/om-core.js:565` (`buildOffer`) — the prototype derives *everything*
  from the mapping plus a handful of admin-typed assumptions (analyst, hourly
  rate, hosting, implementation months, open questions). No derived figure is
  stored.
- `assets/shared/om-core.js:663` (`buildCashCurve`) — the cash model is four lines
  of arithmetic over a 24-month horizon: the one-off is paid pro rata across the
  ramp months, then the monthly saving accrues; break-even is the first month
  the cumulative value crosses zero. Three distinct outcomes must be
  distinguishable: `none` (nothing spent), a month number, and "never inside the
  horizon" — the last is a finding, not a drawing bug.
- **The prototype's money model and S-04's money model differ, and S-04 wins.**
  `om-core.js` invents a monthly "hosting & ops" figure and derives the one-off
  build cost from `hours × rate`. S-04's confirmed business rule
  (`change.md`, issue #18) says the OM operating cost and the implementation
  cost are *customer-provided* and never computed. This plan therefore uses
  `computeSavingsScenario()` for the three saving lines and the cash curve, and
  keeps `hours × rate` strictly as a **build backlog estimate**, labelled as
  such and never blended into the saving lines.
- `MercatifyMappingRowSchema` (`lib/mercatify-lab-port.ts`) carries **no hours**,
  and `mercatify-labs` never returns any. Backlog hours must therefore be an
  admin input.
- Mapping rows are immutable after confirm, so backlog hours cannot live on
  `MappingRow` — they belong to the report, which is composed *after* the
  lock.
- `.ai/guides/upstream/BACKWARD_COMPATIBILITY.md` §"Auto-Discovery File
  Conventions": `data/validators.ts` Zod exports "MUST NOT remove or narrow
  existing schemas". Narrowing `interviewCaseUpdateSchema.status` to exclude
  `sent` is therefore off the table; the invariant is enforced in the command
  instead (see Phase 2).
- Route patterns to follow: computed GET →
  `api/cases/savings/route.ts`; command-backed POST →
  `api/mapping-rows/confirm/route.ts` (`runRouteMutationGuards` +
  `commandBus.execute`); CRUD-ish GET/PUT → `api/handoff-document/route.ts`.
- Command patterns to follow: `commands/handoff.ts` — `ensureScope()` fails
  closed on tenant/org, `enforceCommandOptimisticLock()` in `prepare()`,
  `de.updateOrmEntity()` for the write, `emitMercatifyEvent()` after,
  `buildLog()` for the audit trail.

## Desired End State

- A new `CaseReport` entity holds **only what a human typed**: the optional
  headline override, the consultant's closing note, the reviewer's name, the
  hourly rate, the implementation ramp in months, free-text open questions, the
  per-backlog-item hour estimates, and `sentAt`. Every figure the client reads
  is derived on request, so an edited cost or a re-run mapping can never leave a
  stale number in the document.
- A new pure `lib/report.ts` assembles the whole report model from (case
  profile + mapping rows + tools + savings scenario + report inputs). It is
  covered by unit tests and has no I/O.
- `GET /api/mercatify/cases/report?caseId=…` returns that model plus the raw
  inputs; `PUT` saves the inputs; `POST …/report/send` sends.
- `/backend/cases/[id]/report` renders the compose form beside a live preview
  of exactly what the client will see, plus a send bar that states, before the
  first send, that the client can see none of it yet.
- Pressing **Send to the client** sets `CaseReport.sentAt` and flips
  `InterviewCase.status` to `sent`. No other code path writes `sent`;
  `mercatify.cases.update` rejects an attempt with a 400.
- Verify: `yarn generate && yarn typecheck && yarn lint && yarn ds:check && yarn test`
  all green, and a manual pass over a confirmed case shows every acceptance
  criterion from issue #20.

## What We're NOT Doing

- **Not building the client's view of the report** — that is S-10 / issue #21.
  This slice only flips the flag that S-10 reads.
- **Not touching the handoff `.md`** (S-05) — resolved as an independent
  artifact.
- **Not changing `MercatifyLabPort`** — no hours, no money in the contract;
  `mercatify-labs`' "iron rule #2" stands.
- **Not adding accept / consult** — the client's answer is S-10's.
- **Not reopening the mapping.** Editing decisions still happens on the mapping
  screen, before confirm.
- **Not narrowing `interviewCaseUpdateSchema`** — the BC contract forbids it;
  the invariant is a command guard.
- **No PDF export / print stylesheet.** The prototype's *Print / PDF* button is
  out of scope.
- **Not persisting any derived figure.** No cached KPIs, no snapshotted saving.

## Implementation Approach

Four phases, each independently verifiable, ordered so the pure arithmetic is
proven before anything renders it:

1. **Data + derivation** — the `CaseReport` entity, its migration, validators,
   and the pure `lib/report.ts` with unit tests. No UI, no routes.
2. **Commands + the `sent` invariant** — `mercatify.report.save`,
   `mercatify.report.send`, the `mercatify.cases.update` guard, ACL features,
   events, and command tests.
3. **API routes** — GET/PUT the report, POST send, with OpenAPI docs.
4. **UI** — the report page, the compose form, the preview, the cash-curve
   chart, i18n across all five locales, and the entry points from the mapping
   screen and the request queue.

## Critical Implementation Details

- **The two "cost" concepts must never merge.** S-04's `implementationCost` is
  a customer-provided annual figure and is one of the three saving lines. The
  backlog's `hours × hourlyRate` is a separate, admin-estimated figure shown
  only in the backlog table and its KPI. They must never be summed, and the
  backlog KPI must not be labelled "implementation cost".
- **The cash curve depends on S-04's figures, not the backlog's.** Outflow
  during the ramp is `implementationCost / rampMonths`; inflow afterwards is
  `netAnnualSaving / 12`. When either input is missing, `buildReportModel`
  returns `cashCurve: null` and the UI says the costs have not been entered —
  it does not substitute a guess. This is the same refusal-to-invent guardrail
  S-04 exists to enforce.
- **`omOperatingCost` and `implementationCost` are annual.** The existing
  i18n key `mercatify.savings.dialog.fields.omOperatingCost.label` reads "OM
  operating cost (annual)" and `computeSavingsScenario` subtracts it from an
  annual gross. Any monthly KPI must divide by 12.
- **Send is not first-write-only.** Re-sending replaces the version the client
  holds (prototype: `report.html:245`), so `sentAt` is overwritten. But send
  must not *downgrade* a case the client has already answered: when the status
  is already `accepted` or `consult`, update `sentAt` and leave the status
  alone.

---

## Phase 1: Report data model and pure derivation

### Overview

Introduce the `CaseReport` entity and the pure function that turns a confirmed
mapping into the client-facing document model. Nothing renders yet; the phase
is complete when the arithmetic is proven by unit tests.

### Changes Required:

#### 1. Report entity

**File**: `src/modules/mercatify/data/entities.ts`

**Intent**: Persist only the human-authored parts of a report, one row per
case, so every displayed figure stays derived.

**Contract**: New `@Entity({ tableName: 'mercatify_case_reports' })` class
`CaseReport` with a scalar `caseId` (uuid, no ORM relation — same rule as
`MappingRow`), `headline`/`notes`/`analyst`/`openQuestions` (text, nullable),
`hourlyRate` (numeric(12,2), nullable), `implementationMonths` (int, nullable),
`buildEstimates` (json, default `{}` — a `Record<mappingRowId, hours>`),
`sentAt` (Date, nullable), required `tenantId`/`organizationId`, and
`createdAt`/`updatedAt` (`updatedAt` is the optimistic-lock version, as on
`InterviewCase`). Indexed on `(organizationId, tenantId, caseId)`.
A JSON map rather than a child entity: hours are report-time scratch values
keyed by an immutable row id, never queried or aggregated in SQL.

#### 2. Migration

**File**: `src/modules/mercatify/migrations/Migration<timestamp>_mercatify.ts`

**Intent**: Create the new table.

**Contract**: Generated by `yarn db:generate`; the SQL and the
`.snapshot-open-mercato.json` delta must be scoped to
`mercatify_case_reports` only. Do **not** apply it — review and commit.

#### 3. Report validators

**File**: `src/modules/mercatify/data/validators.ts`

**Intent**: Public write contract for the report inputs. Additive only — no
existing schema is touched.

**Contract**: `reportInputsSchema` (`caseId` uuid, plus optional/nullable
`headline` ≤300, `notes` ≤5000, `analyst` ≤200, `openQuestions` ≤5000,
`hourlyRate` non-negative number, `implementationMonths` int 1–24,
`buildEstimates` a record of uuid → non-negative number or null),
`reportQuerySchema` (`caseId` uuid) and `reportSendSchema` (`caseId` uuid).
Scope is never accepted from a client, matching the file's existing header
comment.

#### 4. The report model

**File**: `src/modules/mercatify/lib/report.ts`

**Intent**: One pure function that assembles the whole document from a
confirmed mapping, the SaaS stack, S-04's scenario and the admin's typed
inputs — the app's own equivalent of the prototype's `buildOffer()`.

**Contract**: `buildReportModel(input: ReportModelInput): ReportModel`, no I/O,
no `Date.now()`. Produces:
- `headline` — the admin's override when present, otherwise computed from the
  removed/retained tool counts;
- `summary` — computed sentence naming the monthly spend, the tool count, how
  many capabilities Open Mercato covers, how many need building, and how many
  tools stay on purpose;
- `kpis` — exactly four: licences today (monthly), licences after
  (retained monthly + `omOperatingCost / 12`), net annual saving, build effort
  (hours, and cost when a rate is entered);
- `verdict` — a count and share per decision across all five decisions,
  preserving `native, configure, integrate, keep, build` order;
- `toolRows` — one row per mapping row, grouped under its `source` tool, each
  carrying `targetLabel`, `decision`, `confidence`, the tool's monthly cost and
  whether the tool is switched off; a row whose `source` matches no tool in the
  stack is still emitted, under an "unattributed" group, never dropped;
- `duplicates` — capabilities (case-insensitively normalized) sourced from more
  than one tool, with the tool names and the count;
- `savingLines` — three lines, each `{ key, amount, basis, source }` where
  `source` is `'customer'` (intake) or `'admin'` (entered while preparing the
  report) — plus `netAnnualSaving` and `netPaybackMonths` straight from
  `computeSavingsScenario`. Never a blended total;
- `backlog` — every `decision === 'build'` row with its `hours` (from
  `buildEstimates`, `null` when absent) and `cost` (`hours × hourlyRate`, `null`
  when either is missing), plus `totalHours`, `totalCost` and
  `unestimatedCount`;
- `cashCurve` — 25 points (month 0–24) or `null` when `implementationCost` or
  `netAnnualSaving` is missing, with `rampMonths`, `trough`, `troughMonth`,
  `breakEvenMonth` (`null` when it never crosses inside the horizon) and
  `paidNothing` (true when there is no implementation cost to pay back);
- `pains`, `mustKeep` — verbatim from the intake;
- `openQuestions` — the admin's lines, then every low-confidence row, then a
  note when backlog items are unestimated;
- `currency`, `sentAt`.

#### 5. Unit tests for the model

**File**: `src/modules/mercatify/lib/report.test.ts`

**Intent**: Prove the arithmetic and the refusals before anything renders it.

**Contract**: Covers — computed vs. overridden headline; the four KPI values;
verdict counts summing to the row count; a capability sourced from two tools
appearing exactly once in `duplicates`; a build row with no estimate yielding
`hours: null` and raising `unestimatedCount`; `cashCurve === null` when a cost
input is missing; a break-even month landing on the first crossing; a scenario
that never crosses returning `breakEvenMonth: null` rather than a stretched
curve; and a mapping row whose `source` is not in the stack still being listed.

### Success Criteria:

#### Automated Verification:

- Types compile: `yarn typecheck`
- Lint passes: `yarn lint`
- New model tests pass: `yarn test src/modules/mercatify/lib/report.test.ts`
- Migration is generated and scoped to the new table only: `yarn db:generate`, then inspect the diff

#### Manual Verification:

- The generated SQL touches `mercatify_case_reports` and nothing else; no
  shipped migration was edited

---

## Phase 2: Commands, the `sent` invariant, ACL and events

### Overview

Wire the two write paths and make "send is the only thing that sets `sent`"
true in code rather than by convention.

### Changes Required:

#### 1. Report commands

**File**: `src/modules/mercatify/commands/report.ts`

**Intent**: Save the admin's typed inputs, and send the report.

**Contract**: Two handlers registered with `registerCommand`, both deriving
scope via a local `ensureScope()` that fails closed (copy of
`commands/handoff.ts`):
- `mercatify.report.save` — 400s unless `InterviewCase.mappingConfirmedAt` is
  set; upserts the case's single `CaseReport` row; enforces the optimistic lock
  in `prepare()` against `CaseReport.updatedAt` when a row already exists (no
  lock on first create); emits `mercatify.report.updated`; `buildLog` records
  the changed input fields.
- `mercatify.report.send` — 400s unless the mapping is confirmed; upserts the
  report row first (so send from a never-saved report still works); sets
  `sentAt = new Date()`; sets `InterviewCase.status = 'sent'` **unless** the
  status is already `accepted` or `consult`, which are left untouched; emits
  `mercatify.report.sent`.

#### 2. The `sent` guard on case update

**File**: `src/modules/mercatify/commands/cases.ts`

**Intent**: Make the report's send action the only writer of `sent`, as issue
#20 requires, without narrowing a published schema.

**Contract**: In `updateCaseCommand.execute`, before any write, reject
`parsed.status === 'sent'` with `badRequest`. The schema keeps accepting the
value (BACKWARD_COMPATIBILITY: validator exports must not be narrowed) — the
command refuses it. A comment names `mercatify.report.send` as the only legal
writer.

#### 3. Features

**File**: `src/modules/mercatify/acl.ts`

**Intent**: Gate the report behind its own admin-only features, so the client
role (`mercatify.cases.view`) can never read an unsent report.

**Contract**: Additive — `mercatify.report.view` (`dependsOn:
['mercatify.mapping.view']`) and `mercatify.report.manage` (`dependsOn:
['mercatify.report.view']`). Existing feature ids and shapes unchanged.

#### 4. Events

**File**: `src/modules/mercatify/events.ts`

**Intent**: Declare the two lifecycle events before anything emits them, as the
file's own header requires.

**Contract**: Additive entries `mercatify.report.updated` and
`mercatify.report.sent`, both `entity: 'case'`, `category: 'lifecycle'`,
matching the existing handoff entries.

#### 5. Module wiring

**File**: `src/modules/mercatify/index.ts` (and whatever `yarn generate` emits)

**Intent**: Make the new command file load at bootstrap.

**Contract**: Follow exactly how `commands/handoff.ts` is pulled in today; run
`yarn generate` afterwards because commands, routes, pages and events changed.

#### 6. Command tests

**File**: `src/modules/mercatify/commands/__tests__/report.test.ts`

**Intent**: Prove the gate, the flip and the invariant.

**Contract**: Mirrors `__tests__/handoff.test.ts`'s harness. Covers — save
rejected when the mapping is not confirmed; save creating then updating the
single row; a stale `updatedAt` rejected with a 409; send flipping
`InterviewCase.status` to `sent` and stamping `sentAt`; a re-send on an
`accepted` case updating `sentAt` without touching the status;
`mercatify.cases.update` rejecting `status: 'sent'` with a 400; and a request
without tenant or organization scope failing closed on both commands.

### Success Criteria:

#### Automated Verification:

- Discovery regenerates cleanly: `yarn generate`
- Types compile: `yarn typecheck`
- Lint passes: `yarn lint`
- Module tests pass: `yarn test src/modules/mercatify`

#### Manual Verification:

- The new features appear in the role editor under the Mercatify module

---

## Phase 3: API routes

### Overview

Expose the model and the two writes over HTTP, documented in OpenAPI.

### Changes Required:

#### 1. Report read/write route

**File**: `src/modules/mercatify/api/cases/report/route.ts`

**Intent**: One GET that returns everything the screen needs, one PUT that
saves what the admin typed.

**Contract**: Hand-rolled (not `makeCrudRoute`) because the response is a
computed model — follow `api/cases/savings/route.ts`. Per-method `metadata`:
`GET` requires `mercatify.report.view`, `PUT` requires
`mercatify.report.manage`. GET loads the case in scope (404 when absent),
its mapping rows and tools, runs `computeSavingsScenario` then
`buildReportModel`, and returns `{ report: ReportModel, inputs, caseUpdatedAt,
reportUpdatedAt, mappingConfirmedAt, status }`. PUT runs
`runRouteMutationGuards` then `commandBus.execute('mercatify.report.save')`.
Both export `openApi` with a response schema, as every other route here does.

#### 2. Send route

**File**: `src/modules/mercatify/api/cases/report/send/route.ts`

**Intent**: The single action that makes the report visible to the client.

**Contract**: POST only, `requireFeatures: ['mercatify.report.manage']`,
structured exactly like `api/mapping-rows/confirm/route.ts`; body
`reportSendSchema`; returns `{ ok: true, sentAt, status }`.

#### 3. OpenAPI schemas

**File**: `src/modules/mercatify/api/openapi.ts`

**Intent**: Give the two routes their response shapes without duplicating zod.

**Contract**: Additive exports `reportModelSchema` and
`reportInputsItemSchema`; existing exports untouched.

#### 4. Error strings

**File**: `src/modules/mercatify/i18n/*.json` (all five locales)

**Intent**: The route's failure messages are localized like every other
mercatify route's.

**Contract**: `mercatify.errors.report_failed`, `mercatify.errors.report_send_failed`.

### Success Criteria:

#### Automated Verification:

- Discovery regenerates cleanly: `yarn generate`
- Types compile: `yarn typecheck`
- Lint passes: `yarn lint`
- Full unit suite passes: `yarn test`

#### Manual Verification:

- `GET /api/mercatify/cases/report?caseId=…` returns the model for a confirmed
  case and 403s for a session holding only `mercatify.cases.view`
- `POST /api/mercatify/cases/report/send` moves the case to `sent` exactly once

---

## Phase 4: The report screen

### Overview

The admin's builder: compose on the left, a live preview of the client's
document on the right, a send bar at the bottom.

### Changes Required:

#### 1. Page

**Files**: `src/modules/mercatify/backend/cases/[id]/report/page.tsx`,
`.../page.meta.ts`

**Intent**: Route the report screen into the backend shell.

**Contract**: Mirrors `backend/cases/[id]/handoff/` — `Page`/`PageBody`
wrapper, `requireFeatures: ['mercatify.report.view']`, `navHidden: true`,
breadcrumb back to interview cases, `pageTitleKey: 'mercatify.report.page.title'`.

#### 2. Builder

**File**: `src/modules/mercatify/components/ReportBuilder.tsx`

**Intent**: The compose form, the save/send actions and the state that feeds
the preview.

**Contract**: Client component using `useQuery` against the report route and
`useGuardedMutation` for save/send (the pattern in `MappingTable.tsx`). Fields:
headline override, closing note, reviewed-by, hourly rate, implementation
months, open questions, and an hours input per backlog item. Covers the
required states — loading, an unconfirmed-mapping empty state that links back
to the mapping screen, a costs-not-entered notice pointing at the savings
editor, a 403 message, and a 409 conflict surfaced when the version is stale.
The send button is destructive-adjacent: it goes through `useConfirmDialog`,
and the bar states plainly, before the first send, that the client can see none
of it yet; afterwards it shows when it was sent and that re-sending replaces the
client's copy.

#### 3. Preview

**File**: `src/modules/mercatify/components/ReportPreview.tsx`

**Intent**: Render the model — the client's document, framed so nobody mistakes
it for the console's own page.

**Contract**: Pure presentational, props `{ report: ReportModel }`, no
fetching, so S-10 can reuse it verbatim for the client. Sections in the
prototype's order: headline, summary, meta, the four KPIs, the verdict bar with
a legend, the tool-by-tool table (confidence rendered as a band, never a
percentage; a flagged row rendered with its flag reason), the duplicates table
when non-empty, the build backlog (an item with no estimate prints
"to estimate", never a blank or a zero) with its floor-not-a-quote note, the
three saving lines each with its basis and source, the cash curve, the client's
pains/must-keep quoted verbatim, the open questions, and the consultant's
closing note. Shared UI primitives and tokens only — no hard-coded colours or
strings.

#### 4. Cash curve

**File**: `src/modules/mercatify/components/CashCurveChart.tsx`

**Intent**: Draw the cumulative cash position over 24 months.

**Contract**: Inline SVG with `role="img"` and an `aria-label` that states the
trough, the break-even outcome and the end value in words — the chart must be
fully legible to a screen reader without the drawing. Axis ticks snap to
1/2/5 × 10ⁿ so zero is always a tick (`om-core.js:690`). Renders nothing when
`cashCurve` is `null`; when the curve never crosses zero inside the horizon it
says so rather than rescaling.

#### 5. Entry points

**Files**: `src/modules/mercatify/components/MappingTable.tsx`,
`src/modules/mercatify/components/CasesTable.tsx`

**Intent**: Make the report reachable at exactly the point it becomes possible.

**Contract**: On the mapping screen, a "Build report" action shown only once
`mappingConfirmedAt` is set, beside the existing handoff link. In the cases
table, a row action to the report for a confirmed case. No existing action
changes meaning.

#### 6. Strings

**Files**: `src/modules/mercatify/i18n/{en,pl,de,es,ko}.json`

**Intent**: Every user-visible string in this slice is localized.

**Contract**: One `mercatify.report.*` key per string, added to **all five**
locale files with the same key set. No hard-coded user strings in any
component.

### Success Criteria:

#### Automated Verification:

- Discovery regenerates cleanly: `yarn generate`
- Types compile: `yarn typecheck`
- Lint passes: `yarn lint`
- Design-system check passes: `yarn ds:check`
- No hard-coded strings: `yarn i18n:check-hardcoded`
- Full unit suite passes: `yarn test`
- Production build succeeds: `yarn build`

#### Manual Verification:

- On a confirmed case, the report screen renders headline, summary and the four
  KPIs, the verdict bar, the tool-by-tool table with confidence bands, the
  duplicates, the three saving lines each with a basis, the backlog with hours
  and cost (unestimated items printing "to estimate"), the cash curve, and the
  client's pains/must-keep
- Editing a compose field updates the preview without a reload; Save persists
  across a reload
- **Send to the client** moves the case to `sent` in the request queue, and
  nothing else in the app can produce that status
- Reaching the screen for an unconfirmed case shows the "finish the mapping
  first" state and a way back, not a broken document
- Keyboard-only: every input and both actions are reachable and the cash curve
  is announced by its label

---

## Testing Strategy

### Unit Tests

- `lib/report.test.ts` — the derivation: headline override, KPIs, verdict
  counts, duplicate detection, backlog with and without estimates, the three
  cash-curve outcomes, the missing-cost refusal, unattributed mapping rows.
- `commands/__tests__/report.test.ts` — the gate (mapping not confirmed), the
  upsert, the optimistic lock, the status flip, the re-send on an answered
  case, the `cases.update` `sent` rejection, and failing closed without scope.

### Integration Tests

Not added in this slice. The module has no integration coverage today and
issue #20 does not request any; the seams that would be exercised (command bus,
route guards) are covered by the command tests and by the existing
`mapping`/`handoff` suites.

### Manual Testing Steps

1. Open a case, generate and confirm its mapping, enter the two cost inputs.
2. Open **Build report**; confirm every section from issue #20's acceptance
   criteria renders.
3. Leave one build item without hours; confirm it prints "to estimate" and the
   backlog note calls the total a floor.
4. Clear the implementation cost; confirm the cash curve disappears with an
   explanation rather than a guessed line.
5. Press **Send to the client**; confirm the queue shows `sent` and the send bar
   changes to the re-send wording.
6. Try to set `status: 'sent'` through `PUT /api/mercatify/cases`; confirm a 400.

## Performance Considerations

The report is derived per request from at most a few dozen mapping rows and
tools — three indexed reads and O(rows) arithmetic. No caching, deliberately:
a cached figure is the stale-number failure S-04 exists to prevent.

## Migration Notes

One additive table, `mercatify_case_reports`. No existing row is touched and no
backfill is needed: a case with no report row simply has an empty one on first
save. Generated with `yarn db:generate` and committed for review — **not
applied** by this change.

## References

- Issue: https://github.com/robeobe/Mercatify/issues/20
- Roadmap slice S-09: `context/foundation/roadmap.md`
- Visual specification: `assets/console/report.html`, `assets/client/offer.html`,
  `assets/shared/om-core.js:565-1065`
- Money rule: `context/changes/mercatify-savings-breakdown/change.md`,
  `src/modules/mercatify/lib/savings.ts`
- Command pattern: `src/modules/mercatify/commands/handoff.ts`
- Computed-route pattern: `src/modules/mercatify/api/cases/savings/route.ts`
- Action-route pattern: `src/modules/mercatify/api/mapping-rows/confirm/route.ts`
- BC contract: `.ai/guides/upstream/BACKWARD_COMPATIBILITY.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Report data model and pure derivation

#### Automated

- [x] 1.1 Types compile: `yarn typecheck` — ef97f66
- [x] 1.2 Lint passes: `yarn lint` — ef97f66
- [x] 1.3 New model tests pass: `yarn test src/modules/mercatify/lib/report.test.ts` — ef97f66
- [x] 1.4 Migration generated and scoped to the new table only — ef97f66

#### Manual

- [x] 1.5 Generated SQL touches `mercatify_case_reports` only; no shipped migration edited — ef97f66

### Phase 2: Commands, the `sent` invariant, ACL and events

#### Automated

- [x] 2.1 Discovery regenerates cleanly: `yarn generate` — 2cf4bf9
- [x] 2.2 Types compile: `yarn typecheck` — 2cf4bf9
- [x] 2.3 Lint passes: `yarn lint` — 2cf4bf9
- [x] 2.4 Module tests pass: `yarn test src/modules/mercatify` — 2cf4bf9

#### Manual

- [x] 2.5 New features appear in the role editor under the Mercatify module — 2cf4bf9

### Phase 3: API routes

#### Automated

- [x] 3.1 Discovery regenerates cleanly: `yarn generate` — bfe815c
- [x] 3.2 Types compile: `yarn typecheck` — bfe815c
- [x] 3.3 Lint passes: `yarn lint` — bfe815c
- [x] 3.4 Full unit suite passes: `yarn test` — bfe815c

#### Manual

- [x] 3.5 GET returns the model for a confirmed case and 403s for a client-role session — 086f83e
- [x] 3.6 POST send moves the case to `sent` exactly once — 086f83e

### Phase 4: The report screen

#### Automated

- [x] 4.1 Discovery regenerates cleanly: `yarn generate` — b4b6a0b
- [x] 4.2 Types compile: `yarn typecheck` — b4b6a0b
- [x] 4.3 Lint passes: `yarn lint` — b4b6a0b
- [x] 4.4 Design-system check passes: `yarn ds:check` — b4b6a0b
- [x] 4.5 No hard-coded strings: `yarn i18n:check-hardcoded` — b4b6a0b
- [x] 4.6 Full unit suite passes: `yarn test` — b4b6a0b
- [x] 4.7 Production build succeeds: `yarn build` — b4b6a0b

#### Manual

- [x] 4.8 Every section from issue #20's acceptance criteria renders on a confirmed case — 086f83e
- [x] 4.9 Compose edits update the preview live and persist across a reload — 086f83e
- [x] 4.10 Send moves the case to `sent`, and nothing else can produce that status — 086f83e
- [x] 4.11 An unconfirmed case shows the "finish the mapping first" state — 086f83e
- [x] 4.12 Keyboard-only pass; the cash curve is announced by its label — 086f83e
