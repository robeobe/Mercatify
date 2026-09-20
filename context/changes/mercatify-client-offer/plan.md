# Plan — S-10 / issue #21: client reads the sent report and answers

Minimal hackathon slice. No new table, no new column, no migration: the case's
existing `status` (`sent` → `accepted` | `consult`) **is** the recorded answer,
and `RequestsTable`/`CasesTable` already render those two values.

## Routing (three-axis)

- Ownership: `module-data` (new command + API route in `src/modules/mercatify/`)
  and `backend-ui` (client-facing report screen + two actions).
- Work units: CRUD/command/OpenAPI/ACL; page/renderer/UI states; testing
  (`commands/__tests__`).
- SDLC: `direct` — `context/changes/mercatify-client-offer/change.md` already
  covers this slice; no new spec.

## Constraint that shapes the design

AC 2 ("report content shown here matches #20's output exactly — same
renderer/data, not a re-implementation"). #20 already split this correctly:

- `lib/report.ts#buildReportModel` — pure, derives the whole document.
- `components/ReportPreview.tsx` — renders a `ReportModel` and nothing else.

So S-10 adds **no renderer and no derivation**. It adds a read path the client
role is actually allowed to call, because `GET /api/mercatify/cases/report` is
gated on `mercatify.report.view` (→ `mercatify.mapping.view`), which the client
does not hold — by design, so an *unsent* report can never be read.

## Phases

### 1. Extract the report load so both routes share one derivation

`api/cases/report/shared.ts` — move the case/rows/tools/report fetch + the
`derivation` object out of `report/route.ts` into `loadReportBundle(em, caseId,
scope)`. `report/route.ts` keeps its response shape byte-for-byte.

### 2. `mercatify.cases.answer` command (`commands/client-answer.ts`)

Input `{ caseId, answer: 'accepted' | 'consult' }`.

- Derive trusted scope (`tenantId` + `selectedOrganizationId`), fail closed.
- 404 outside scope / soft-deleted.
- 403 unless `createdByUserId === auth.sub` — the answer belongs to the person
  who filed the request. Never keyed on a role name (see
  `.ai/lessons/client-request-owner-scope.md`).
- 400 unless the report is actually out: status ∈ `sent|accepted|consult` **and**
  the `CaseReport` row has a `sentAt`. Re-answering is allowed (they may change
  their mind); answering an unsent case is not.
- Writes `status`, emits `mercatify.case.answered`, writes an audit log entry.

### 3. `POST /api/mercatify/cases/answer`

`requireFeatures: ['mercatify.cases.view']` — the client's own feature. The
owner check lives in the command, so holding `cases.view` is not enough to
answer somebody else's request. Per-method `metadata` + `openApi`.

### 4. `GET /api/mercatify/cases/report/client`

`requireFeatures: ['mercatify.cases.view']`. Uses phase 1's loader, then:

- owner check (same rule as the command; `mercatify.mapping.view` holders may
  also read, so an admin can open the client's view),
- 404 while `sentAt` is null — nothing exists for the client until #20 sends it.

Returns `{ report, status, sentAt }` — the model only, never the admin's
`inputs`/`derivation`.

### 5. Client screen `/backend/requests/[id]/report`

`components/ClientReport.tsx`: fetch → `<ReportPreview report={...} />` →
an action bar with **Accept** and **Ask for a call with Sales**. Once answered,
an alert states the recorded answer and the chosen action is disabled (the
other stays available). Loading / error / forbidden / not-yet-sent states.

### 6. Wire the two entry points and the two read-backs

- `RequestDetail` (#17): a link to the report when it is ready, and the recorded
  answer on the request view (AC 6).
- `RequestsTable` (#17): already renders `accepted`/`consult` — add the row
  action to open the report.
- `CasesTable` (#15): already renders both statuses (AC 5). `ReportBuilder`
  gains one line stating the client's answer so the admin sees it where they
  sent from.

### 7. Strings + tests

- Keys in all five `i18n/*.json` (the files are real translations, not stubs).
- `commands/__tests__/client-answer.test.ts` on the existing in-memory world:
  accept, consult, re-answer, not-owner → 403, not-sent → 400, cross-tenant →
  404, missing scope → 400.

## Not doing

- No `client_answer`/`answered_at` column — `status` carries it, and a column
  would cost a migration for nothing this slice reads.
- No handoff-to-Lab trigger on Accept — that is #22; the
  `mercatify.case.answered` event is the seam it will subscribe to.
- No separate client portal — S-08's Non-Goal stands.
