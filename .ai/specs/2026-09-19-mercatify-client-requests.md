# Client request list and per-request progress track

**Date**: 2026-09-19
**Status**: Ready for implementation

> Covers GitHub issue #17 / roadmap S-08 (`mercatify-client-requests`, FR-017). Invoked from `om-spec-writing` obligations in `.ai/guides/spec-delivery.md` plus the template below. Implementation uses `om-module-scaffold` (business slice: staff record list/detail inside the existing `mercatify` module) and `om-backend-ui-design`.

## TLDR

Give the trial **employee** (client) a staff-backend list of **their own submitted** interview cases, a per-row **whose turn** indicator, and a read-only reopen screen that shows the original intake plus a four-step progress track (sent → consultant review → report back → client decision). Reuse `InterviewCase` / `GET /api/mercatify/cases`; do not build a portal. Sending remains locked (S-01). Discovering the report for S-10 starts here, but accept/consult actions stay out of scope.

## Problem Statement

S-01 ships intake create/edit/send and a generic `/backend/cases` table. Employees hold `mercatify.cases.manage`, so that table is an org-wide CRUD list, not “my requests.” Status values exist, but the client never sees whose turn it is or a progress track. S-10 cannot land without a client return path that does not reopen editing.

## Overview and Success Measures

- **Primary outcome:** An employee can list only the requests they submitted, open one, see the sent stack read-only, and read a progress track that matches status `new` / `mapping` / `mapped` / `sent` / `accepted` / `consult`.
- **Leading indicators:** `mine=true` list never includes another actor’s row or a `draft`; update of profile/tools on a non-draft still returns 400.
- **Baseline:** Generic cases table + intake lock; no owner column; no client progress UI.
- **Market / product reference:** `assets/client/requests.html` and `assets/client/request.html` plus `clientProgress()` / `REQUEST_STATUS` in `assets/shared/om-core.js`. Adopted: tiles/list with turn, reopen, four-step track, send-a-corrected-list. Rejected: separate portal, localStorage ownership, report accept/consult (S-10).

## Goals

- **REQ-001** — Employee lists only their own submitted requests in the current tenant and organization.
- **REQ-002** — Each list row shows client-facing status and whose turn it is (Mercatify vs client).
- **REQ-003** — Reopening a request shows the original sent profile and tools read-only plus the progress track.
- **REQ-004** — The request screen cannot edit an already-sent case; the S-01 command lock remains.
- **REQ-005** — The progress track is correct for sent / in mapping / with the client / answered mappings of live statuses.

## Non-goals

- Customer portal, `client/login.html`, or a second app.
- Accept / consult / report reader (S-10 / S-09).
- Changing how admin mapping or intake create/send works, except additive owner/submitted fields and list scoping.
- Letting employees browse other employees’ cases.

## Proposed Solution

Stamp `createdByUserId` from `auth.sub` on create. Stamp `submittedAt` when status first leaves `draft`. `GET /api/mercatify/cases` fail-closes: callers without `mercatify.mapping.view` only see their own rows; `mine=true` further restricts to submitted statuses and always requires an actor id. Transform adds `whoseTurn`, `submittedAt`, `createdByUserId`, and `progress`. New pages `/backend/requests` and `/backend/requests/[id]` use `DataTable` and a view-mode `CaseForm` plus a progress rail. Admins keep `/backend/cases` as the org queue (via `mapping.view`).

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| Reuse `InterviewCase` + existing CRUD GET | One aggregate; tools already attached in `afterList` | New `ClientRequest` entity | Duplicates intake data |
| Owner = `auth.sub`, not role name | Feature-gated org queue vs own list | Role-name `employee` check | Forbidden by ACL rules |
| Org-wide list requires `mercatify.mapping.view` | Employees already have `cases.manage` for intake | New `cases.queue` feature | Mapping is already the admin-only grant |
| Progress derived from status | Cannot drift from lifecycle | Stored step column | Mockup derives `clientProgress(req)` |
| Request detail reuses `CaseForm` view mode | Same fields as sent intake | Parallel custom form | Would skip lock/tool rendering |

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Submitted request | `InterviewCase` with `status !== 'draft'` | `status` | Hidden from `mine=true` list |
| Owner | User id that created the case | `createdByUserId` | Missing actor on own-list → 400; other owner → empty/404 |
| Whose turn | Mercatify while `new`/`mapping`/`mapped`; client once `sent`/`accepted`/`consult` | derived | Unknown status treated as Mercatify |
| Progress | Four steps: sent, consultant reads, report back, you decide | derived from status | Never stored |
| Send lock | Non-draft profile/tool writes rejected | `mercatify.cases.update` | 400 |

## Users, Permissions, and Scope

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Employee | List/reopen own submitted requests; create intake elsewhere | `createdByUserId = auth.sub`; tenant+org from session | `mercatify.cases.view` (list pages), `mercatify.cases.manage` (intake) |
| Admin / superadmin | Org-wide cases table; own My requests when `mine=true` | tenant+org; mapping.view lifts owner filter | `mercatify.mapping.view` plus cases features |
| Unauthenticated | none | n/a | n/a |

Trusted `tenantId` from `ctx.auth.tenantId`; `organizationId` from `ctx.selectedOrganizationId ?? ctx.organizationScope?.selectedId`. Fail closed if either is missing. No system-scope case.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Interview case aggregate | extend | `mercatify` | same entity + additive columns | S-01 already owns the sent payload |
| CRUD list/detail API | extend | `mercatify` | `makeCrudRoute` GET | Additive query `mine` and transform keys |
| Intake form | reuse view mode | `mercatify` | `CaseForm` | Read-only sent snapshot |
| Auth identity | reuse | `auth` | `auth.sub` scalar | No user ORM relation |

## Architecture and Data Flow

```text
employee /backend/requests
  -> GET /api/mercatify/cases?mine=true
  -> InterviewCase filtered tenant+org+owner+submitted
  -> DataTable (status, whoseTurn)

employee /backend/requests/:id
  -> GET /api/mercatify/cases?ids=:id&mine=true
  -> CaseForm mode=view + progress rail
  -> PUT still 400 on profile/tools if status !== draft
```

- **Module boundaries:** stays in `mercatify`; no new module.
- **Extension points:** none on installed modules.
- **Alternatives considered:** portal pages — rejected by S-01 non-goal.
- **Compatibility:** additive list fields and query `mine`; owner filter is a security tighten for callers without `mapping.view`. Status enum unchanged. Existing PUT lock unchanged.

## User Journeys

### Journey J-001 — List my requests

1. Employee opens `/backend/requests`.
2. API returns only their submitted cases.
3. Empty state explains nothing is sent yet and offers new intake.
4. 401/403 show forbidden, not an empty table.

### Journey J-002 — Reopen and read progress

1. Employee opens a row.
2. Screen shows company, tools, pains/must-keep, and four progress steps.
3. Footer has no save; corrected-list goes to create, not edit-in-place.
4. Another employee’s id is not found.

### Journey J-003 — Turn and track across statuses

1. `new`/`mapping`/`mapped`: turn = Mercatify; review step current.
2. `sent`: turn = client; report step current; report-ready banner (no S-10 actions).
3. `accepted`/`consult`: turn = client; decision step done.

## UI and Interaction Contracts

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| `/backend/requests` | List own submitted requests; open detail; new intake | `GET /api/mercatify/cases?mine=true` | `src/modules/example/backend/todos/page.tsx` + `components/TodosTable.tsx` | `Page`, `PageBody`, `DataTable`, `RowActions`, `StatusBadge`, `EmptyState`, `Alert` | loading, empty, error, forbidden, success | REQ-001, REQ-002 |
| `/backend/requests/[id]` | Read-only sent payload + progress | `GET ...?ids=&mine=true`; no writes | `src/modules/example/backend/todos/[id]/edit/page.tsx` + `CaseForm` | `Page`, `PageBody`, `CaseForm` view, `Alert`, `RecordNotFoundState` | loading, empty/not-found, error, forbidden, keyboard | REQ-003, REQ-004, REQ-005 |

### UI architecture

| Role | Navigation groups in order | Dashboard / injected widgets | Login-to-primary-task flow |
|---|---|---|---|
| employee | Mercatify → My requests; intake create remains reachable | none | My requests → open row → read progress (≤2 clicks) |
| admin | Mercatify → My requests and Interview cases | none | Interview cases remains org queue |

| Surface / widget | Empty state guidance and action | Responsive behavior | Keyboard / focus behavior |
|---|---|---|---|
| My requests table | Localized empty + link to `/backend/cases/create` | DataTable priority columns; turn visible on narrow | Row action link is the keyboard path |
| Request detail | Not-found back to list | Progress stacks under payload below `md` | Headings, no icon-only unlabeled controls; Escape not required (no dialog) |

### `/backend/requests` — My requests

```text
┌────────────────────────────────────────────────────────────┐
│ My requests                         [Send another stack]   │
│ Everything you sent, and whose turn it is.                 │
├────────────────────────────────────────────────────────────┤
│ DataTable: title | status | whose turn | submitted         │
│ Row action: Open                                           │
└────────────────────────────────────────────────────────────┘
```

- **Behavior:** server page, `mine=true`, no mapping row action, click opens detail.
- **Responsive and accessibility:** `StatusBadge` for status/turn; no hard-coded status colors.
- **Localization:** `mercatify.requests.*`.
- **Design-system and theming:** semantic tokens; light and dark via tokens.

### `/backend/requests/[id]` — Request detail

```text
┌────────────────────────────────────────────────────────────┐
│ Your request                         [Back to my requests] │
│ [Report ready banner if sent+]                             │
│ CaseForm view (profile + tools)     │ Progress ol (4 steps)│
│ [Send a corrected list → create]                           │
└────────────────────────────────────────────────────────────┘
```

- **Behavior:** `hideFooterActions`; no `updateCrud` from this page.
- **Conflict:** N/A — no writes. Documented as N/A — read-only surface.
- **Localization / DS:** same as list; progress states via `text-foreground` / `text-muted-foreground` / `border-primary` tokens, not palette hues.

## Data Models

### `InterviewCase` (additive)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `createdByUserId` | UUID, nullable | indexed with org+tenant | no | set on create from `auth.sub`; immutable |
| `submittedAt` | timestamptz, nullable | none | no | set once when leaving `draft` |

Existing profile/tool columns unchanged. No new entity. Migration additive; do not edit shipped migrations.

## API, Command, and Error Contracts

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| `GET` | `/api/mercatify/cases` | auth + `mercatify.cases.view` | existing list schema + `mine` boolean | items include owner, submittedAt, whoseTurn, progress, tools | 400 missing actor on own-list; 401/403 | REQ-001, REQ-002, REQ-005 |
| `POST` | `/api/mercatify/cases` | `cases.manage` | unchanged | stamps `createdByUserId`; `submittedAt` if status `new` | 400 empty send | REQ-001 |
| `PUT` | `/api/mercatify/cases` | `cases.manage` | unchanged | still rejects profile/tools when not draft | 400/409 | REQ-004 |

`makeCrudRoute` remains. Additive response keys via `.passthrough()` OpenAPI item schema. No event payload rename.

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| N/A — this slice adds no new events | existing case CRUD events unchanged | none new | none | N/A — no new subscribers |

## Security, Privacy, and Compliance

- **Authorization:** pages `cases.view`; org-wide list requires `mapping.view` in the query builder, not role names.
- **Tenant isolation:** existing ORM tenant/org fields; owner filter is extra, never instead of scope.
- **Sensitive data:** company/pains already stored; no new PII columns beyond user id scalar.
- **Abuse:** `ids` of another owner returns empty for employees; no enumeration across tenants.

## Integration Coverage

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-001 | unit (list filters) | two user ids | mine / no mapping.view / mapping.view | only owner+submitted vs org-wide | REQ-001 |
| TEST-002 | command | create as user-1 | createdByUserId + send submittedAt | persisted; other user not implied | REQ-001 |
| TEST-003 | command | non-draft + profile PUT | update | 400 lock | REQ-004 |
| TEST-004 | unit (progress) | each live status | `clientProgressSteps` / `whoseTurnForStatus` | AC-005 mapping | REQ-002, REQ-005 |
| TEST-005 | security (filters) | second tenant/user | own-list builder | no foreign id in `$in` | REQ-001 |

Self-contained Jest oracles land with the slice. Browser/ephemeral API fixtures reuse the same filter helper; no seeded demo rows.

## Implementation Phases

### Phase 1 — Owner-scoped list API, My requests UI, read-only progress detail

- **Depends on:** none (S-01 already on `main`)
- **Outcome:** Employee can list and reopen own submitted requests with turn + progress.
- **Why this order / value delivered:** Single vertical slice; UI is useless without the filter.
- **Deliverables:** columns + migration/snapshot; list filter + transform; commands stamp owner/submittedAt; `/backend/requests` + `[id]`; i18n; tests TEST-001–005.
- **Independent slices / estimated commits:** data/API/commands; UI+i18n; tests.
- **Requirements closed:** REQ-001–REQ-005
- **Tests:** TEST-001–TEST-005
- **Validation:** `yarn generate`, focused jest, then configured gate
- **Exit gate:** filters and progress unit tests green; request pages registered; sent case still 400 on profile edit; UI uses DataTable/CaseForm/tokens

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-001 | J-001, `/backend/requests` | `createdByUserId`, `GET mine` | Phase 1 | TEST-001, TEST-002, TEST-005 | AC-001 |
| REQ-002 | J-001 | `whoseTurn` transform | Phase 1 | TEST-004 | AC-002 |
| REQ-003 | J-002, `/backend/requests/[id]` | tools `afterList`, CaseForm view | Phase 1 | TEST-002 | AC-003 |
| REQ-004 | J-002 | existing update lock | Phase 1 | TEST-003 | AC-004 |
| REQ-005 | J-003 | progress helper | Phase 1 | TEST-004 | AC-005 |

| Surface | Requirement | Example file adapted | Phase | Test | Mechanism |
|---|---|---|---|---|---|
| `api/cases/route.ts` GET list | REQ-001 | `src/modules/example/api/todos/route.ts` | 1 | TEST-001 | emitted-example |
| `backend/requests/page.tsx` | REQ-001 | `src/modules/example/backend/todos/page.tsx` | 1 | TEST-001 | emitted-example |
| `components/RequestsTable.tsx` | REQ-002 | `src/modules/example/components/TodosTable.tsx` | 1 | TEST-004 | emitted-example |
| `backend/requests/[id]/page.tsx` | REQ-003 | `src/modules/example/backend/todos/[id]/edit/page.tsx` | 1 | TEST-003 | emitted-example |
| `data/entities.ts` owner columns | REQ-001 | `src/modules/example/data/entities.ts` | 1 | TEST-002 | emitted-example |

## Rollout, Migration, and Rollback

Additive migration: `created_by_user_id`, `submitted_at`. Existing rows stay owner-null (hidden from employee own-list; visible to mapping.view). Do not apply migrate in this PR unless asked. Rollback: drop the two columns and revert pages; list behavior returns to org-wide for all `cases.view` callers.

## Migration & Backward Compatibility

Additive API keys (`mine`, `createdByUserId`, `submittedAt`, `whoseTurn`, `progress`). No route rename. Tightening GET for callers without `mapping.view` is a security fail-closed change documented here (employees previously could list every org case). Status enum and command IDs unchanged.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| Historical rows lack owner | Employees do not see pre-slice cases | Admin queue still lists them; new creates stamp owner | Accepted for demo data |
| `mapping.view` used as queue capability | Future employee mapping grant would widen list | S-03 keeps mapping admin-only | Revisit if mapping is granted to employees |
| S-10 report CTA missing | Banner without offer link | Copy says report is ready; no dead offer route | S-10 adds the link |

## Acceptance Criteria

- [x] **AC-001** — Client sees a list of their own submitted requests only (scoped to their tenant, not a separate portal).
- [x] **AC-002** — Each list row shows current status and whose turn it is.
- [x] **AC-003** — Reopening a request shows what was originally sent (read-only) plus a progress track.
- [x] **AC-004** — No editing is possible on an already-sent request from this screen.
- [x] **AC-005** — Progress track renders correctly for every status a request can be in at this point (sent, in mapping, with the client, answered).
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | AGENTS.md; contracts; backend-ui; spec-delivery; BC; scaffold + backend-ui + data-model skills |
| Data models, APIs, events, UI, and tests are internally consistent | pass | traceability rows |
| Every workflow completes end to end without a catch-all integration phase | pass | single phase 1 |
| Platform-native reuse and extension points were chosen before custom code | pass | CaseForm + DataTable + makeCrudRoute |
| UI contracts identify references, canonical components, and theme/state coverage | pass | surfaces table |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | Phase 1 |

Verdict: Ready for implementation

## Implementation Status

Phase 1 is complete: owner columns, `mine` list filters, My requests pages, and Jest oracles for filters/progress/send-lock. Validation: generate, typecheck, lint, ds:check, test, build.

## Open Questions

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-001 | N/A — issue #17 and mockups resolve list/detail/progress | — | no | 2026-09-19 |

## Changelog

| Date | Change |
|---|---|
| 2026-09-19 | Initial spec for S-08 / issue #17 |
