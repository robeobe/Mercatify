# Show the interview starting point: profile and SaaS tools with costs — Implementation Plan

## Overview

Build the real, server-persisted version of `assets/client/intake.html` as an OM-admin surface inside the already-scaffolded `src/modules/mercatify/` module, for the OM **`employee`** role (the client company's own staff): they open a new intake, pick tools from a static SaaS catalog with per-module ticks and duplicate-capability badges, add off-catalog tools, fill a company profile, save a draft or send it. Sending is terminal for this role — no wizard, no agent/Lab response, nothing further happens in-app for them; the case simply moves to `new` and locks. A separate **`admin`** role then owns everything downstream (reviewing an agent-computed mapping starting point, editing it, building and sending the report) — that flow is explicitly out of scope here (see What We're NOT Doing) and belongs to S-03 and later slices. All of this is one `InterviewCase` aggregate with a new `InterviewCaseTool` child entity, replacing the placeholder read-only list F-01 shipped.

This is roadmap item **S-01**, prerequisite **F-01** (implemented). The mockup was designated the source of truth for this slice (user decision, 2026-09-19), which revises PRD FR-001 and strikes the "no free-form entry" Non-Goal — Phase 1 amends those documents so they stop contradicting the code. The employee/admin role split and the terminal nature of Send are a further, later user decision (2026-09-19) that also revises the PRD's "flat roles" access-control stance; Phase 1 amends that too.

> **Amended 2026-09-19** (gap-analysis follow-up, same day): "terminal" below describes *this slice's own build* — it still ships nothing beyond create/edit/send/lock. It is superseded as a claim about the product as a whole by two new roadmap slices, **S-08** (`mercatify-client-requests`) and **S-10** (`mercatify-client-offer`): once admin sends a report, the employee role must be able to come back and see it, read it, and accept or ask for a consult call. Anywhere below that says the employee "sees nothing further" or that no status is ever shown past `new`, read it as "not in this slice" rather than "never."

## Current State Analysis

- **`InterviewCase` exists but is a placeholder.** `src/modules/mercatify/data/entities.ts:14-43` carries only `id/title/status/tenantId/organizationId/timestamps` — no company profile, no tools. One neutral case is seeded per org (`src/modules/mercatify/cli.ts`, `setup.ts`).
- **The list page is read-only.** `src/modules/mercatify/backend/cases/page.tsx` + `components/CasesTable.tsx` render a minimal `DataTable` with no create/detail flow.
- **The CRUD route is generic and thin.** `src/modules/mercatify/api/cases/route.ts` uses `makeCrudRoute` with `create`/`update`/`delete` actions bound to `mercatify.cases.create|update|delete` commands (`commands/cases.ts`), scoped by `tenantField`/`orgField`, no nested-collection support (confirmed against `node_modules/@open-mercato/shared/src/lib/crud/factory.ts` — the factory has no `nested`/`children`/`populate`-in-actions config).
- **F-02's contract is already live and deliberately loose here.** `lib/mercatify-lab-port.ts:31` — `companyProfile: z.record(z.string(), z.unknown())` is "kept loose until it ships": this slice is what fixes that shape. `saasTools` in that same schema is a flat `{ name, monthlyCost, notes }[]`; this plan's richer per-tool module/seat data is a superset the eventual `evaluate()` caller (S-02) will flatten from, not something this slice needs to match today.
- **A real precedent for parent+child, same-module aggregates exists and is not the JSON-blob shape.** `node_modules/@open-mercato/core/src/modules/sales/data/entities.ts:326,520-521,548-560` — `SalesOrder` ↔ `SalesOrderLine`: plain `@OneToMany`/`@ManyToOne` (no `cascade`), child carries its own `tenant_id`/`organization_id` + a composite scope index, and is mutated through a per-row upsert command (`node_modules/@open-mercato/core/src/modules/sales/commands/documents.ts:7006-7120`) rather than being deleted and recreated wholesale. Locking is parent-only: `node_modules/@open-mercato/core/src/modules/sales/commands/shared.ts:15-27` documents the parent as "the consistency boundary" — sub-resource lines are exempt from carrying their own optimistic-lock version.
- **A real precedent for list + create + detail/edit pages exists.** `node_modules/@open-mercato/core/src/modules/catalog/.../backend/products/{page.tsx, create/page.tsx, [id]/page.tsx}` and `src/modules/example/backend/todos/{page.tsx, create/page.tsx, [id]/edit/page.tsx}`: `CrudForm` (`@open-mercato/ui/backend/CrudForm`) never fetches its own data — the page fetches via `fetchCrudList(<path>, { ids, pageSize: 1 })` and passes `initialValues` (which must carry `updatedAt` for the lock). Multi-card layouts are still one `CrudForm` with several `CrudFormGroup` entries, some declarative (`fields`), some a custom `component` render prop for a whole card (`catalog/products/[id]/page.tsx:~867`).
- **The SaaS catalog taxonomy already exists, but only as demo-mockup data.** `assets/stack-tool/catalog.js` (`CATALOG`, `CAPS`) is exactly the tool → module → capability shape this form needs, minus the OM-module/verdict/confidence fields (those are Lab's job per F-02, not intake's).
- **The console side of the mockup evolved mid-plan, in a concurrent session, and changes the picture for what happens after Send.** `assets/console/{modules,report}.html` and `assets/shared/om-core.js`'s `REQUEST_STATUS` (uncommitted working-tree changes) now describe a real state machine — `new → mapping → mapped → sent → accepted|consult` — where an admin/consultant reviews an "agent's pass" mapping, edits it, and confirms before a report can be built and sent. This slice reaches only the first transition (`draft → new`); the rest is S-03's shape, not this slice's — but the status vocabulary should agree with it now rather than be renamed later.
- **Employee's current ACL grant is read-only.** `src/modules/mercatify/setup.ts`'s shipped `defaultRoleFeatures` gives `employee` only `mercatify.cases.view`; `admin`/`superadmin` get `mercatify.*`. An employee cannot create or send a case today — this slice must grant `.manage` to `employee` too.

## Desired End State

`yarn generate && yarn typecheck && yarn lint && yarn ds:check && yarn test && yarn build` all pass. A user holding the `employee` role (now granted `mercatify.cases.manage`, same as `admin`/`superadmin`) can open `/backend/cases`, click into a new intake, build a full stack submission against the static catalog (with live duplicate-capability badges and a cost/seat summary), add custom tools, save it as a draft, reopen and keep editing it, then send it. Sending is the end of this role's flow: the case moves to `new`, becomes read-only, and nothing further is shown to them beyond a "send a corrected list" action that starts a fresh intake — no wizard, no agent response. The PRD and roadmap read consistently with this behavior, including the employee/admin role split, instead of contradicting it.

Verify by: walking the create → draft → edit → send → corrected-resubmission path manually as described in Phase 4's Manual Verification, and by the full validation gate passing with a diff confined to `src/modules/mercatify/`, `context/foundation/{prd,roadmap}.md`, and `context/changes/mercatify-intake-start/`.

### Key Discoveries

- **Inferred mechanism** (`.ai/skills/om-module-scaffold/references/business-one-shot-blueprints.md`): this is a new app-owned business record (an interview case with tool line items) with no installed-module extension — route `M+B` (`om-module-scaffold`/`om-data-model-design` for persistence, `om-backend-ui-design` for the list/create/detail surfaces). No `U` (nothing extends an installed module), no `P`/`W`/`A`. No named row in the blueprint table matches "SaaS-stack intake form" exactly; the closest invariant set is the generic Canonical Staff Record Inference template plus the `SalesOrder`/`SalesOrderLine` precedent for the child relation.
- Money uses `numeric`, not float, per `schema-design.md`'s monetary-contract rule; `selectedModuleIds` as a JSON/JSONB column is an accepted, undocumented-but-unforbidden pattern (verified against no contrary rule in `contracts.md`/`schema-design.md`, and consistent with the platform's "hybrid JSONB indexing" baseline).
- `page-and-navigation.md`: create/detail pages must set `navHidden: true` and a two-level `breadcrumb` back to the list — `catalog/products/[id]/page.meta.ts` is the confirmed precedent.

## What We're NOT Doing

- **Not the discovery wizard, Lab evaluation, mapping table, savings breakdown, or `.md` handoff.** Those are S-02 through S-06; this slice never calls `getMercatifyLabPort().evaluate()`.
- **Not a separate client-facing login/portal outside OM admin.** The mockup's `login.html`/session-per-app split was a static-demo device; the real persona is the OM admin user of the trial tenant (role `employee`), authenticated by the existing `auth`/`directory` modules (PRD §Access Control Changes). `login.html`, the "console" staff app, and `offer.html` are not built.
- **Not the admin-side mapping/report flow, or any status beyond `draft`→`new`.** Reviewing the agent-computed mapping, editing it, and building/sending the report (`mapping`/`mapped`/`sent`/`accepted`/`consult`) is a distinct `admin`-role flow — S-03 and later, informed by `assets/console/{modules,report}.html`. This slice's `employee` role never sees any of that.
- **Not an admin UI for editing the SaaS catalog itself.** Static file only, per PRD Open Question 5 ("no editor in the UI" in v1).
- **Not per-tool independent optimistic locking or a standalone CRUD route for `InterviewCaseTool`.** The parent case is the lock boundary; children are written only as part of a case save.
- **Not autosave-per-click.** Tool/module ticks live in local form state; only "Save draft" and "Send" persist.
- **Not in-place editing of a sent (`new` or later) case.** A corrected submission is a new case, matching the mockup's `request.html` → `intake.html` "Send a corrected list" link.
- **Not the consolidation-scenario toggle (FR-009)**, custom-fields framework integration, or a lessons record for this change (explicitly declined).

## Implementation Approach

Layered, same order as F-01: align the written contract first so nothing downstream cites a stale requirement, then schema, then the command/API layer, then UI — each phase gated by its own automated checks before the next begins.

## Critical Implementation Details

**Child diff-upsert, not delete-and-recreate.** On update, the command loads the case's existing `InterviewCaseTool` rows, matches incoming `tools[]` entries by `id` (present = update that row, absent = create), and deletes any existing row whose `id` is missing from the incoming array — the same net effect as "replace," but it preserves row identity for unchanged rows, mirroring the real `orderLineUpsertCommand` precedent instead of a blind delete-all. All of it runs inside one `withAtomicFlush` boundary alongside the parent's own field updates.

**Locking stays parent-only.** `InterviewCaseTool` gets `createdAt`/`updatedAt` for debugging/ordering but is never passed through `enforceCommandOptimisticLock` — only the case's `updatedAt` guards the write, per the documented "sub-resource lines guarded by a parent aggregate are exempt" rule and the Sales precedent. `CrudForm` sends the case's `updatedAt`; a stale save surfaces the standard 409.

**Sending is a one-way gate, enforced server-side, and terminal for the employee.** Once `status !== 'draft'`, the update command rejects any change to profile or tool fields (400), not just hides the controls in the UI — a client bypassing the form must not be able to mutate a sent case. The command also rejects a transition to `new` when `tools.length === 0`, mirroring the mockup's "tick at least one tool" guard but as a real server rule, not just a client alert. After a successful send the employee sees a read-only confirmation and nothing else — no wizard, no Lab/agent call, no further status appears to them; everything from `mapping` onward is the admin role's flow, built in a later slice.

**Status vocabulary now anticipates the admin flow, so it never needs a rename.** `InterviewCase.status` is retyped from F-01's placeholder `'draft' | 'in_progress' | 'completed'` to `'draft' | 'new' | 'mapping' | 'mapped' | 'sent' | 'accepted' | 'consult'` — the same vocabulary already live in `assets/shared/om-core.js`'s `REQUEST_STATUS`. This slice's commands only ever write `'draft'` and `'new'`; the remaining five values are documented but unreachable until S-03 and later implement them.

**Employee gains `.manage`, not a new feature.** Rather than invent a third ACL feature, `employee` is granted the same `mercatify.cases.manage` that `admin`/`superadmin` already hold (F-01's `setup.ts`). The role split is enforced by what each role's UI reaches and by the status-transition guards above, not by a finer-grained feature — `admin`'s mapping/report actions (S-03+) can introduce their own feature at that point if they need one.

**`title` is derived, not entered.** The form has no title field (the mockup doesn't have one either); the command sets `title = companyName?.trim() || 'Untitled intake'` on every save so the existing list page's title column stays meaningful.

**The SaaS catalog's content strings are excluded from the i18n catalog, deliberately.** Tool names, module names/descriptions and capability labels in the new static catalog file are reference/dataset content (like seeded demo data), not UI chrome — translating ~50 capability labels across 5 locales for MVP demo data contradicts `main_goal: speed` and the PRD's "no editor, no maintenance role" stance on this catalog (Open Question 5). All actual UI chrome (headings, buttons, empty/error states, validation messages) still goes through `i18n/*.json` as usual. Confirm `yarn i18n:check-hardcoded` treats the catalog data file as pass-through data, not offending literals, in Phase 4's gate — if it doesn't, the catalog file is the one place to special-case, not the strings it holds.

---

## Phase 1: Align PRD, roadmap and change identity with the mockup-as-source-of-truth decision

### Overview

Amend the written contract so it stops contradicting what this slice builds, before any code changes make the mismatch worse, and grant the `employee` role the access this slice depends on. Additive amendments, not silent rewrites — the Socratic-round precedent already in the PRD is the model for recording a reversed decision without erasing the original reasoning.

### Changes Required:

#### 1. PRD scope amendment

**File**: `context/foundation/prd.md`

**Intent**: Make FR-001 and the "no free-form entry" Non-Goal describe what this slice actually builds, while keeping the original text and reasoning visible for anyone reading the history.

**Contract**: Under FR-001 (`## Scope of Change` → `### Intake`), append a dated amendment line: decision owner, date (2026-09-19), change id `mercatify-intake-start`, and the revised behavior (client builds the starting point via a searchable tool/module picker with duplicate detection and custom tools, not just a read-only seeded view). Under `## Non-Goals`, mark the "No free-form entry of the client's own SaaS stack in the MVP" bullet as superseded with the same dated reference, rather than deleting it. Under `## Access Control Changes`, append a further dated amendment striking the "flat roles ... explicitly not chosen: a split between fills-the-interview and sees-the-savings" stance: the `employee` role now fills and sends the interview, while a separate `admin` role owns the mapping/report/savings flow (S-03+).

#### 2. Roadmap S-01 amendment

**File**: `context/foundation/roadmap.md`

**Intent**: Keep the roadmap's S-01 outcome description consistent with the amended FR-001.

**Contract**: Update the S-01 `Outcome` line (`### S-01: Client sees the interview starting point`) to describe building/sending the stack, not just seeing a seeded one; update the matching row in `## At a glance`. Leave the Prerequisites/Parallel/Status fields as-is.

#### 3. Change identity update

**File**: `context/changes/mercatify-intake-start/change.md`

**Intent**: Record the scope decision where this specific change's history lives, and mark the change as planned.

**Contract**: Frontmatter `status: planned`, `updated: 2026-09-19`. Append a Notes entry documenting the "mockup is source of truth" decision, the employee/admin role split, and their consequences for FR-001/Non-Goals/Access Control Changes.

#### 4. Employee ACL grant

**File**: `src/modules/mercatify/setup.ts`

**Intent**: Let the `employee` role actually use the flow this slice builds — today it only holds `.view`.

**Contract**: In `defaultRoleFeatures`, change `employee: ['mercatify.cases.view']` to `employee: ['mercatify.cases.view', 'mercatify.cases.manage']`. `admin`/`superadmin` (`mercatify.*`) are unchanged.

### Success Criteria:

#### Automated Verification:
- `git diff --stat -- context/foundation/prd.md context/foundation/roadmap.md context/changes/mercatify-intake-start/change.md src/modules/mercatify/setup.ts` shows exactly these four files changed, nothing else

#### Manual Verification:
- FR-001's original text is still present, with a clearly dated amendment note beside it — not overwritten
- The Non-Goals bullet is marked superseded with a reference to this change, not deleted
- The Access Control Changes "flat roles" stance carries a dated amendment noting the employee/admin split
- The roadmap's S-01 outcome and `## At a glance` row agree with the amended FR-001
- `change.md` frontmatter shows `status: planned` and today's date
- `employee` in `setup.ts` now holds both `mercatify.cases.view` and `mercatify.cases.manage`

**Implementation Note**: After this phase, pause for manual confirmation that the amendment wording is acceptable before proceeding — it's the one phase that changes what the team agreed to, not just what the code does.

---

## Phase 2: SaaS catalog data, case profile columns, and the InterviewCaseTool entity

### Overview

Add the static input taxonomy and the persisted shape for a full intake: company profile columns on `InterviewCase`, and the new `InterviewCaseTool` child entity — schema only, no command/route/UI changes yet.

### Changes Required:

#### 1. Static SaaS catalog

**File**: `src/modules/mercatify/data/saas-catalog.ts`

**Intent**: Port `assets/stack-tool/catalog.js`'s `CATALOG`/`CAPS` into real, typed module data the form and the duplicate-detection function both read.

**Contract**: `export const SAAS_CATALOG: SaasCatalogTool[]`, each `{ id, name, kind, modules: { id, name, desc, caps: string[] }[] }` — same tool/module/id values as the mockup's `CATALOG`, with the `om`/`verdict`/`conf` fields dropped (Lab's job, not this module's). `export const CAPABILITY_LABELS: Record<string, string>` mirrors `CAPS`. `export function capabilityLabel(slug: string): string` mirrors `capLabel`. No i18n keys for this file's content (see Critical Implementation Details).

#### 2. InterviewCase profile columns

**File**: `src/modules/mercatify/data/entities.ts`

**Intent**: Persist the company profile fields the form collects, all optional so a draft can exist before the profile is complete.

**Contract**: On the existing `InterviewCase` class, add nullable columns: `companyName` (text), `industry` (text), `peopleCount` (integer), `currency` (text, default `'EUR'`), `pains` (text), `mustKeep` (text). Add `@OneToMany(() => InterviewCaseTool, (t) => t.interviewCase) tools = new Collection<InterviewCaseTool>(this)`. `title` stays as-is (existing required text column); it is now derived by the command layer (Phase 3), not entered directly. Retype `status` from `'draft' | 'in_progress' | 'completed'` to `'draft' | 'new' | 'mapping' | 'mapped' | 'sent' | 'accepted' | 'consult'` (update the doc comment too) — this slice's commands only ever write `'draft'`/`'new'`; the rest are reserved for later slices, not implemented here.

#### 3. InterviewCaseTool entity

**File**: `src/modules/mercatify/data/entities.ts`

**Intent**: One row per selected catalog tool or custom (off-catalog) tool on a case, modeled on the `SalesOrder`/`SalesOrderLine` precedent.

**Contract**: `@Entity({ tableName: 'mercatify_interview_case_tools' })`, `@Index` composite scope index over `['interviewCase', 'organizationId', 'tenantId']` (mirrors `sales_order_lines_scope_idx`). Fields: `id` (uuid PK); `interviewCase` (`@ManyToOne(() => InterviewCase, { fieldName: 'interview_case_id' })`, no cascade); `catalogToolId` (text, nullable — null means custom tool); `name` (text, required — denormalized so historical display never depends on the catalog file's current contents); `selectedModuleIds` (json, default `[]` — module ids ticked within that catalog tool; always empty for custom tools); `customUse` (text, nullable — "what it's used for," custom tools only); `seats` (integer, nullable); `monthlyCost` (numeric, nullable); `tenantId`/`organizationId` (uuid, required, own scope columns — not inherited from the parent); `createdAt`/`updatedAt` (property initializers, kept for ordering/debugging, never used for locking).

#### 4. Validators

**File**: `src/modules/mercatify/data/validators.ts`

**Intent**: Define the request/response shape the commands and route parse against.

**Contract**: `interviewCaseToolSchema`: `{ id: z.string().uuid().optional(), catalogToolId: z.string().nullable().optional(), name: z.string().min(1), selectedModuleIds: z.array(z.string()).default([]), customUse: z.string().nullable().optional(), seats: z.number().int().nonnegative().nullable().optional(), monthlyCost: z.number().nonnegative().nullable().optional() }`. Extend `interviewCaseCreateSchema`/`interviewCaseUpdateSchema` with the flat profile fields (`companyName`, `industry`, `peopleCount`, `currency`, `pains`, `mustKeep`, all optional) and `tools: z.array(interviewCaseToolSchema).default([])`. `title` is dropped from the public schemas (server-derived, Phase 3). Scope fields remain absent from every public schema, unchanged from today.

#### 5. Reviewed migration

**Files**: `src/modules/mercatify/migrations/Migration<timestamp>_mercatify.ts`, `src/modules/mercatify/migrations/.snapshot-open-mercato.json`

**Intent**: Capture the schema change as a reviewable artifact without touching the database.

**Contract**: Run `yarn generate` then `yarn db:generate` (never the reverse — the probe must see the new entity registered first). One new migration: `ALTER TABLE mercatify_interview_cases ADD COLUMN ...` (the six new nullable columns) plus `CREATE TABLE mercatify_interview_case_tools (...)` with its FK and composite index. Never edit the already-shipped `Migration20260919125502_mercatify.ts`. Commit the migration and updated snapshot together; do not run `yarn db:migrate`.

### Success Criteria:

#### Automated Verification:
- `yarn generate` completes; the generated entity-ID map contains `mercatify:interview_case_tool`
- `yarn db:generate` emits exactly one new migration touching only `mercatify_interview_cases` and `mercatify_interview_case_tools`
- `yarn typecheck` passes
- `yarn lint` passes

#### Manual Verification:
- The emitted SQL: new `InterviewCase` columns are nullable with no surprising defaults beyond `currency`; the new table has `tenant_id`/`organization_id` `NOT NULL`, the FK to `mercatify_interview_cases`, and the composite scope index
- The migration contains no statement for any table owned by another module
- `yarn db:migrate` has not been run; the database is unchanged

**Implementation Note**: Pause here for manual confirmation of the reviewed SQL before proceeding.

---

## Phase 3: Commands and the CRUD API contract

### Overview

Extend the existing create/update commands to accept the full intake payload and persist it atomically — case fields plus a diffed set of tool rows — enforce the draft/send lifecycle server-side, and extend the route's read path to return tools.

### Changes Required:

#### 1. Create/update commands

**File**: `src/modules/mercatify/commands/cases.ts`

**Intent**: Own the atomic profile+tools write, the derived `title`, and the two lifecycle guards (send requires ≥1 tool; a non-draft case rejects content edits) inside the same command IDs the route already dispatches to.

**Contract**: `mercatify.cases.create` accepts the extended `interviewCaseCreateSchema`, derives `title`, creates the case plus one `InterviewCaseTool` per incoming `tools[]` entry, all inside `withAtomicFlush`. `mercatify.cases.update` accepts the extended `interviewCaseUpdateSchema`, still calls `enforceCommandOptimisticLock` against the case's `updatedAt` only (never per-tool), then: (a) if the loaded case's `status !== 'draft'`, reject with 400 when any profile or `tools` field is present in the input; (b) if `status` is being set to `'new'`, reject with 400 when the resulting `tools` array is empty; (c) otherwise diff-upsert `InterviewCaseTool` rows as described in Critical Implementation Details, inside `withAtomicFlush`. `mercatify.cases.delete` is unchanged.

#### 2. CRUD route read path

**File**: `src/modules/mercatify/api/cases/route.ts`

**Intent**: Let the list and single-item fetch (the edit page's `fetchCrudList({ ids, pageSize: 1 })` call) return the new columns and the full `tools` array.

**Contract**: Extend `list.fields`/`transformItem` to include the six profile columns and a populated `tools` array (each entry shaped like `interviewCaseToolSchema`'s response counterpart, including `id`). `sortFieldMap` and the per-method `metadata` feature gates (`mercatify.cases.view` / `.manage`) are unchanged.

#### 3. OpenAPI document

**File**: `src/modules/mercatify/api/openapi.ts`

**Intent**: Keep the published contract honest.

**Contract**: Extend the existing `createCrudOpenApiFactory` resource options with the new request/response fields; no new operations.

#### 4. Command tests

**File**: `src/modules/mercatify/commands/__tests__/cases.test.ts`

**Intent**: Prove the lifecycle and locking rules before the UI depends on them.

**Contract**: Extend the existing Jest suite (`@jest/globals`, unchanged conventions) with cases: create persists the given tool rows; update with a mixed incoming `tools[]` (one kept-and-edited by `id`, one new without `id`, one omitted) results in exactly that diff — no stray rows; a stale `updatedAt` on update is rejected while tool rows carry no independent lock; sending with zero tools is rejected; editing any field on a non-draft case is rejected; a second tenant's case and its tool rows are neither readable nor writable.

### Success Criteria:

#### Automated Verification:
- `yarn generate` completes
- `yarn typecheck` passes
- `yarn lint` passes
- `yarn test` passes and reports the extended/new command tests actually ran
- The route file still has no flat `create:`/`update:`/`del:` factory keys

#### Manual Verification:
- The OpenAPI document at `/api/docs/openapi` includes the new request/response fields under `/api/mercatify/cases`
- No request schema accepts `tenantId` or `organizationId`
- A manual `PUT` attempting to change `companyName` on a `new` case is rejected

**Implementation Note**: Pause here for manual confirmation before proceeding.

---

## Phase 4: Backend UI, list wiring, i18n, and the full gate

### Overview

Build the create and detail/edit pages, the shared multi-card intake form, wire the list page into them, translate the UI chrome, and close with the broad validation gate plus a manual walkthrough of the whole draft → send → corrected-resubmission path.

### Changes Required:

#### 1. Create page

**Files**: `src/modules/mercatify/backend/cases/create/page.tsx`, `.../create/page.meta.ts`

**Intent**: A reachable, feature-gated entry point for a brand-new intake.

**Contract**: Server component rendering `<CaseForm mode="create" />`. `page.meta.ts`: `requireAuth: true`, `requireFeatures: ['mercatify.cases.manage']`, `navHidden: true`, two-level `breadcrumb` back to `/backend/cases`. Model: `src/modules/example/backend/todos/create/page.meta.ts`.

#### 2. Detail/edit page

**Files**: `src/modules/mercatify/backend/cases/[id]/page.tsx`, `.../[id]/page.meta.ts`

**Intent**: Load one case by id and render it editable (draft) or read-only (sent), matching the `TodoEditForm` fetch pattern.

**Contract**: Client component fetching via `fetchCrudList('mercatify/cases', { ids: String(id), pageSize: 1 })` from `@open-mercato/ui/backend/utils/crud`, rendering `RecordNotFoundState`/loading/error per `quality-states.md` before data resolves, then `<CaseForm mode={status === 'draft' ? 'edit' : 'view'} caseId={id} initial={...} />`. `page.meta.ts`: same feature gate, `navHidden: true`, breadcrumb back to the list.

#### 3. Shared intake form

**File**: `src/modules/mercatify/components/CaseForm.tsx`

**Intent**: One `CrudForm` covering company profile, the catalog picker with duplicate detection, custom tools, and the computed summary — editable in `create`/`edit` mode, read-only in `view` mode with a "Send a corrected list" action.

**Contract**: `"use client"`. `CrudFormGroup[]`: a `company` group (declarative fields: `companyName`, `industry`, `peopleCount`, `currency` select, `pains`/`mustKeep` textareas); a `tools` group (`component` render prop: search input, one card per `SAAS_CATALOG` entry with module checkboxes, a pure client-side duplicate-capability function mirroring the mockup's `dupCaps()`/`overlaps()` rendering an "also elsewhere" badge, per-tool seats/monthly inputs — all mutating one `tools` form value via `setValue`); a `custom` group (dynamic list of off-catalog rows: name / what it's used for / seats / monthly / remove, `+ Add a tool`); a `summary` group (`column: 2`, bare, computed stat rail: tool count, modules-in-use count, currency-aware monthly total, duplicate count — pure function over current form values, no extra request). `onSubmit` calls `createCrud`/`updateCrud` from `@open-mercato/ui/backend/utils/crud` with `status: 'draft'` (Save draft) or `status: 'new'` (Send, client-side blocked when `tools.length === 0` before the request is even made, matching the server guard). `initialValues.updatedAt` carries the lock version in edit/view mode. `view` mode renders all groups non-editable and adds a "Send a corrected list" button linking to `/backend/cases/create` — nothing else; there is no next-step call to action, agent response, or status beyond `new` visible to this role.

#### 4. List page wiring

**File**: `src/modules/mercatify/components/CasesTable.tsx` (and `backend/cases/page.tsx`/`page.meta.ts` if the add-action needs a host)

**Intent**: Make the create/detail flow reachable from the existing list.

**Contract**: Add a "New intake" action linking to `/backend/cases/create`; each row links to `/backend/cases/[id]`. Keep the existing `DataTable`/`fetchCrudList` wiring and loading/empty/error states.

#### 5. Translations

**Files**: `src/modules/mercatify/i18n/{en,de,es,ko,pl}.json`

**Intent**: Every piece of UI chrome this phase adds gets a translated key, per `AGENTS.md`; the catalog's own content does not (see Critical Implementation Details).

**Contract**: Flat `"mercatify.<path>.<key>"` keys, alphabetized, identical key sets across all five files — section headings, field labels, the duplicate badge text, empty/loading/error/permission-denied/conflict copy, the send-validation message, and "Send a corrected list."

### Success Criteria:

#### Automated Verification:
- `yarn generate` completes; the generated backend-route manifest lists `/backend/cases/create` and `/backend/cases/[id]`
- `yarn typecheck` passes
- `yarn lint` passes
- `yarn ds:check` passes
- `yarn test` passes
- `yarn build` completes
- `yarn i18n:check-hardcoded` reports no hard-coded strings in the module's UI chrome
- `git status` shows changes only under `src/modules/mercatify/`, `context/foundation/{prd,roadmap}.md`, and `context/changes/mercatify-intake-start/`

#### Manual Verification:
- `/backend/cases` shows a "New intake" action and the seeded case linking through to its detail page
- `/backend/cases/create` renders company profile, the searchable catalog with module ticks, live "also elsewhere" duplicate badges, custom tool rows, and the summary rail
- "Save draft" persists a `draft` case; reopening `/backend/cases/[id]` shows the same data and stays editable
- "Send my stack" with zero tools ticked is blocked with a clear message; with ≥1 tool it transitions the case to `new`, the page becomes read-only with a plain confirmation (nothing further — no wizard, no agent response), and "Send a corrected list" opens a fresh, empty `/backend/cases/create`
- A sent case cannot be edited from the UI, and a direct API attempt to edit it is rejected (carried over from Phase 3)
- Loading, empty, error, permission-denied, and 409-conflict states all render localized copy through shared components, not ad hoc markup
- The page renders correctly in light and dark mode and at narrow width, with keyboard-reachable controls throughout the form
- Every pre-existing backend page and API still behaves as before (FR-014)

---

## Testing Strategy

### Unit Tests
- Command-level: create/update persist the correct case + tool rows; the diff-upsert produces no stray rows on a mixed add/edit/remove input; stale `updatedAt` is rejected while tool rows carry no independent lock; sending with zero tools is rejected; editing a non-draft case is rejected; cross-tenant isolation holds for both the case and its tool rows.

### Integration Tests
None added — this repo's integration harness (`.ai/qa/`) is a Playwright config with no standing suite yet, and this slice's risk surface (scope, lock, lifecycle) is fully covered at the command-test level. Standing up the first integration test remains its own chunk of work, as F-01's plan already noted.

### Manual Testing Steps
1. Run `yarn generate`, restart any running dev server (a server booted before generation keeps the stale registry).
2. Apply the reviewed Phase 2 migration yourself.
3. As a user holding `mercatify.cases.manage`, open `/backend/cases`, start a new intake, tick several tools across two catalog entries that share a capability, confirm the duplicate badge appears on both.
4. Add a custom tool, enter seats/monthly on a couple of rows, confirm the summary rail's totals match.
5. Save as draft, navigate away, reopen `/backend/cases/[id]`, confirm the data survived and is still editable.
6. Send it; confirm the page becomes read-only and "Send a corrected list" opens a blank new intake.
7. As a user without `mercatify.cases.view`, confirm denial and no nav entry (unchanged from F-01).
8. Visit two or three pre-existing admin pages outside `mercatify` and confirm unchanged behavior (FR-014).

## Performance Considerations

None material at this scale. The child table's composite `(interview_case_id, organization_id, tenant_id)` index is the one that matters and is created with the table; duplicate-capability detection runs client-side over at most a few dozen selected modules.

## Migration Notes

No existing data is moved or transformed. The Phase 2 migration only adds nullable columns to `mercatify_interview_cases` and a new child table — rollback is dropping the new migration and regenerating; existing seeded cases keep working with the new columns defaulting to null/`'EUR'`.

## References

- Roadmap S-01 / F-01: `context/foundation/roadmap.md`
- PRD FR-001, Non-Goals, Open Question 5: `context/foundation/prd.md`
- Prior plan (prerequisite, implemented): `context/changes/mercatify-module-scaffold/plan.md`
- Mockup (interaction reference): `assets/client/intake.html`, `assets/shared/om-core.js`, `assets/stack-tool/catalog.js`
- Parent/child + locking precedent: `node_modules/@open-mercato/core/src/modules/sales/data/entities.ts:326,520-560`, `commands/documents.ts:7006-7120`, `commands/shared.ts:15-27`
- List/create/detail routing precedent: `src/modules/example/backend/todos/**`, `node_modules/@open-mercato/core/src/modules/catalog/.../backend/products/**`
- CRUD fetch helpers: `node_modules/@open-mercato/ui/src/backend/utils/crud.ts`
- F-02 contract (compatibility note only, not invoked here): `src/modules/mercatify/lib/mercatify-lab-port.ts`
- Contracts / data model guides: `.ai/guides/contracts.md`, `.ai/skills/om-data-model-design/references/{schema-design,integrity-and-concurrency,migration-workflow}.md`, `.ai/skills/om-backend-ui-design/references/{crud-surfaces,quality-states,page-and-navigation}.md`, `.ai/skills/om-module-scaffold/references/business-one-shot-blueprints.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Align PRD, roadmap and change identity with the mockup-as-source-of-truth decision

#### Automated
- [ ] 1.1 `git diff --stat` shows exactly `prd.md`, `roadmap.md`, `change.md`, `setup.ts` changed

#### Manual
- [ ] 1.2 FR-001's original text is preserved with a dated amendment note
- [ ] 1.3 The Non-Goals bullet is marked superseded with a reference to this change
- [ ] 1.4 Roadmap's S-01 outcome and `## At a glance` row agree with the amended FR-001
- [ ] 1.5 `change.md` frontmatter shows `status: planned` and today's date
- [ ] 1.6 Access Control Changes carries a dated amendment noting the employee/admin split, and `employee` in `setup.ts` holds `.view` + `.manage`

### Phase 2: SaaS catalog data, case profile columns, and the InterviewCaseTool entity

#### Automated
- [ ] 2.1 `yarn generate` completes; generated entity-ID map contains `mercatify:interview_case_tool`
- [ ] 2.2 `yarn db:generate` emits exactly one new migration touching only the two named tables
- [ ] 2.3 `yarn typecheck` passes
- [ ] 2.4 `yarn lint` passes

#### Manual
- [ ] 2.5 New `InterviewCase` columns are nullable with no surprising defaults beyond `currency`; new table has required scope columns, FK, and composite index
- [ ] 2.6 The migration touches no other module's table
- [ ] 2.7 `yarn db:migrate` has not been run; the database is unchanged

### Phase 3: Commands and the CRUD API contract

#### Automated
- [ ] 3.1 `yarn generate` completes
- [ ] 3.2 `yarn typecheck` passes
- [ ] 3.3 `yarn lint` passes
- [ ] 3.4 `yarn test` passes and the extended/new command tests actually ran
- [ ] 3.5 The route file has no flat `create:`/`update:`/`del:` factory keys

#### Manual
- [ ] 3.6 OpenAPI document includes the new request/response fields
- [ ] 3.7 No request schema accepts `tenantId` or `organizationId`
- [ ] 3.8 A manual `PUT` changing `companyName` on a `new` case is rejected

### Phase 4: Backend UI, list wiring, i18n, and the full gate

#### Automated
- [ ] 4.1 `yarn generate` completes; backend-route manifest lists `/backend/cases/create` and `/backend/cases/[id]`
- [ ] 4.2 `yarn typecheck` passes
- [ ] 4.3 `yarn lint` passes
- [ ] 4.4 `yarn ds:check` passes
- [ ] 4.5 `yarn test` passes
- [ ] 4.6 `yarn build` completes
- [ ] 4.7 `yarn i18n:check-hardcoded` reports no hard-coded strings in the module's UI chrome
- [ ] 4.8 `git status` shows changes confined to the expected paths

#### Manual
- [ ] 4.9 `/backend/cases` shows "New intake" and links through to case detail
- [ ] 4.10 Create page renders profile, catalog picker, duplicate badges, custom tools, summary rail
- [ ] 4.11 Save draft persists and survives reopening `/backend/cases/[id]`
- [ ] 4.12 Send blocks on zero tools, transitions status to `new` and locks the case on success with a plain confirmation (no wizard/agent response), offers a corrected resubmission
- [ ] 4.13 A sent case cannot be edited from the UI or via a direct API call
- [ ] 4.14 Loading/empty/error/permission-denied/conflict states render localized copy via shared components
- [ ] 4.15 Light/dark/narrow rendering and keyboard reachability confirmed
- [ ] 4.16 Every pre-existing backend page and API still behaves as before (FR-014)
