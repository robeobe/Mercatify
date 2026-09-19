# Interview intake (S-01) — Plan Brief

> Full plan: `context/changes/mercatify-intake-start/plan.md`
>
> **Amended 2026-09-19** (gap-analysis follow-up): "terminal for them" below is this slice's own scope, not a product-wide claim — new roadmap slices **S-08** (`mercatify-client-requests`) and **S-10** (`mercatify-client-offer`) bring the employee role back once a report is sent, so they can read it and accept or ask for a consult call.

## What & Why

Build the real, server-persisted version of `assets/client/intake.html` inside the already-scaffolded `src/modules/mercatify/` OM module, for the OM **`employee`** role: they open a new intake, pick tools from a static SaaS catalog (with per-module ticks and duplicate-capability badges), add off-catalog tools, fill a company profile, save a draft or send it. Sending is terminal for them — no wizard, no agent response, just a read-only confirmation and a "send a corrected list" action. A separate **`admin`** role then reviews an agent-computed mapping and edits it before a report goes out — that flow is a later slice (S-03+), not this one.

## Starting Point

`src/modules/mercatify/` already exists (F-01, implemented): a thin `InterviewCase` entity (id/title/status/scope/timestamps), a generic CRUD route, and a read-only list page with one seeded case per org. There is no company profile, no tool data, and no create/detail flow yet. The `employee` role currently holds only `mercatify.cases.view` — it can't create or send anything today. Separately, in a concurrent session, the console-side mockups evolved into a real admin state machine (`new → mapping → mapped → sent → accepted|consult`, `assets/console/{modules,report}.html`), which this plan's status vocabulary now aligns with.

## Desired End State

An `employee` can start a new intake, build a full stack submission against the catalog with live duplicate detection, save it as a draft, keep editing it, send it, and — once sent — see it read-only with a path to submit a corrected version, and nothing else. The PRD and roadmap read consistently with this and with the employee/admin role split, instead of contradicting it.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope authority | Mockup is source of truth, not the narrower original PRD reading | User chose to build the real free-form intake experience and update the PRD/roadmap to match | User |
| Case lifecycle | Multiple cases per org, list + create + detail, matching the mockup's "requests" | User explicitly asked for the mockup's multi-submission model | User |
| Tool data model | New same-module child entity `InterviewCaseTool` (not a JSON blob) | Matches the real `SalesOrder`/`SalesOrderLine` precedent; supports future per-row queries (e.g. S-03) | User (recommended) |
| Catalog source | Static TS file in the module, not a DB entity | PRD already says no catalog editor in v1; matches `main_goal: speed` | User (recommended) |
| Duplicate detection | Pure client-side function, no persistence | Matches the mockup exactly; zero extra API surface | User (recommended) |
| Send semantics | Draft persists server-side; Send transitions to `in_progress` and locks the case; corrections are a new case | Server becomes the source of truth instead of the mockup's localStorage-only draft | User (recommended) |
| Field persistence | Save only on "Save draft"/"Send", not per-keystroke autosave | Simpler optimistic-lock story, matches standard `CrudForm` save pattern in this repo | User (recommended) |
| Locking | Parent (case) level only; tool rows carry no independent version | Matches the documented "sub-resource lines guarded by a parent aggregate" exemption and the real Sales precedent | Plan (research) |
| Role split | `employee` fills and sends the interview; `admin` owns the mapping/report flow (later slice) | User decision (2026-09-19), revises the PRD's "flat roles" access-control stance | User |
| Status vocabulary | `draft`/`new` now; `mapping`/`mapped`/`sent`/`accepted`/`consult` reserved | Matches the console mockup's already-evolving `REQUEST_STATUS`, avoids a future rename | Plan (research) |

## Scope

**In scope:** company profile fields, catalog tool/module picker, duplicate-capability badges, custom off-catalog tools, cost/seat summary, draft/send lifecycle with server-enforced lock-after-send, list→create→detail routing, PRD/roadmap amendment.

**Out of scope:** the discovery wizard (S-02), calling Mercatify Lab's `evaluate()`, the admin-side mapping/report flow and every status beyond `new` (S-03+), savings breakdown (S-04), the `.md` handoff document (S-05/S-06), a separate client-facing login/portal, a catalog admin editor, per-tool independent locking, autosave, in-place editing of a sent case, the consolidation-scenario toggle, a lessons record for this change.

## Architecture / Approach

One `InterviewCase` aggregate with a new `InterviewCaseTool` child (own tenant/org scope + composite index, JSON column for selected module ids). Case create/update commands accept the whole profile+tools payload and diff-upsert child rows atomically inside one transaction, guarded by a parent-level optimistic lock only. UI is one `CrudForm` with multiple `CrudFormGroup` cards (profile, catalog picker, custom tools, computed summary) across new create/detail pages, following the codebase's real `catalog/products` and `example/todos` multi-page precedents — no bespoke form framework.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Align docs | PRD/roadmap/change.md stop contradicting the code | Wording disagreement — gated for manual sign-off before code starts |
| 2. Data model | Catalog data, profile columns, `InterviewCaseTool` entity, reviewed migration | Getting the child-entity shape wrong before commands are built on top of it |
| 3. Commands & API | Atomic diff-upsert save, parent-only lock, send/lock lifecycle, OpenAPI | The diff-upsert logic and the two server-side lifecycle guards are the trickiest code in the slice |
| 4. Backend UI + gate | Create/detail pages, full form, list wiring, i18n, full validation gate | Multi-card `CrudForm` composition and end-to-end manual walkthrough |

**Prerequisites:** F-01 (`mercatify-module-scaffold`, implemented). Phase 2's migration must be applied manually before Phase 3/4 manual testing.
**Estimated effort:** ~4 phases, one sitting each with a pause for manual confirmation.

## Open Risks & Assumptions

- `yarn i18n:check-hardcoded` may need to special-case the new static catalog file if it flags plain data-array strings — flagged in the plan's Critical Implementation Details, not left as a guess.
- The eventual S-02 wizard will need to flatten this slice's richer `tools[]` shape down to F-02's simpler `saasTools: {name, monthlyCost, notes}[]` contract — noted as a forward-compatibility point, not solved here.

## Success Criteria (Summary)

- A client can build, save as draft, reopen, and send a full stack submission through the real OM admin UI — no mockup, no localStorage.
- A sent case is provably immutable (UI and API both reject edits), and starting a correction always creates a new case.
- PRD/roadmap read consistently with the shipped behavior.
