# Install Mercatify as a standard OM module with one seeded case — Implementation Plan

## Overview

Create `src/modules/mercatify/` as this app's first app-owned Open Mercato module: registered in `src/modules.ts`, auto-discovered, gated by its own ACL features, owning one tenant- and organization-scoped `InterviewCase` aggregate, exposing a command-mediated CRUD API and a backend list page, and seeded with one neutral placeholder case through a single idempotent seeder shared by the module CLI and `setup.seedExamples`.

This is roadmap item **F-01** — the foundation that unlocks S-01, S-02, S-03, S-05 and S-06, and the verification path for FR-014 (existing modules, pages and APIs unchanged after install) and FR-015 (installs as a standard module with no change to core or enterprise packages).

The migration is generated and reviewed here but **not applied**.

## Current State Analysis

- **No app-owned module exists.** `src/modules/` holds only `example` (the canonical reference, source-present and deliberately **unregistered**), `example_customers_sync`, and `ratelimit_probe`. `src/modules.ts:8-20` enables eleven `@open-mercato/core` modules plus `events` and `search`; there is no `@app` entry at all.
- **`yarn generate` has never run in this checkout.** `.mercato/` does not exist (`.gitignore:64` ignores `.mercato/*`). There is therefore no generated `E` entity-ID map yet, and Phase 1's generate step is the first one this repo has seen.
- **Dependencies are installed.** `node_modules/@open-mercato/*` v0.7.0 is present with readable `src/` for `shared`, `core` and `ui`; `lib/crud/factory.ts`, `lib/crud/optimistic-lock-command.ts`, `lib/commands`, and `lib/auth/server.ts` all resolve.
- **`example` is a reference, not a template.** `src/modules/example/README.md:23-29`: "Never copy the whole tree, or copy a file 'because it is in `example`'. Copy **one** capability at a time, from the exact file listed in the surface map." Rows marked `qa-only` in `references/surface-inventory.json` must not be used as patterns.
- **Almost everything F-01 creates is a frozen compatibility surface.** `.ai/guides/contracts.md` §Frozen Surfaces treats API routes, DB schema, and event/entity/ACL/DI identifiers as compatibility surfaces that can only be renamed later through an explicit deprecation bridge.
- **No lessons exist yet.** `.ai/lessons.md` indexes zero records; `.ai/lessons/` holds only `_template.md`.

## Desired End State

`yarn generate && yarn typecheck && yarn lint && yarn ds:check && yarn test && yarn build` all pass with `mercatify` registered. The generated backend-route manifest lists `/backend/cases`; the generated entity-ID map contains `mercatify:interview_case`; `/api/mercatify/cases` appears in the OpenAPI document. A reviewed, unapplied migration and an updated module snapshot sit in `src/modules/mercatify/migrations/`. Nothing under `packages/`, `node_modules/@open-mercato/**`, `.mercato/generated/**` or any other module has been edited, and `src/modules.ts` differs from `HEAD` by exactly one appended `push` statement.

Verify by: reading the generated registries after `yarn generate`; running the broad gate; and diffing `src/modules.ts` and `git status` to confirm the blast radius is the new module directory plus that one line.

### Key Discoveries

- **Entity contract** (`.ai/guides/contracts.md` §Entity and Scope Contract; shape at `src/modules/example/data/entities.ts:19-57`): decorators from `@mikro-orm/decorators/legacy`; UUID PK with `defaultRaw: 'gen_random_uuid()'`; `tenant_id` + `organization_id` with a composite index; `created_at`/`updated_at` via `onCreate`/`onUpdate`; nullable `deleted_at`; module-prefixed plural table name; **no cross-module ORM relations**.
- **Timestamps must use property initializers, not definite assignment.** `.ai/skills/om-data-model-design/references/schema-design.md`: declare `createdAt: Date = new Date()`, not `createdAt!: Date` — the initializer is what keeps the column optional in the data type `createOrmEntity` derives.
- **Registration is append-only.** `.ai/skills/om-module-scaffold/references/module-surfaces.md`: "Treat the shipped `src/modules.ts` baseline as protected source: append exactly `enabledModules.push({ id: '<module>', from: '@app' })`; do not rewrite, compress, map, spread, sort, or reformat existing entries."
- **Route derivation is asymmetric.** Backend pages **drop** the module id (`backend/cases/page.tsx` → `/backend/cases`); API routes **keep** it (`api/cases/route.ts` → `/api/mercatify/cases`).
- **`acl.ts` needs both exports.** `export const features = [...]` **and** `export default features` — generated registry code reads both (`src/modules/example/acl.ts:1-43`).
- **Seeding has two entry points that must share one function.** `setup.seedExamples({ em, container, tenantId, organizationId })` is the only hook allowed to create demo domain rows and is skipped by `--no-examples`; it delegates to the same idempotent seeder `cli.ts` exposes (`src/modules/example/setup.ts:104-140`, `src/modules/example/cli.ts`).
- **Migrations are generated and module-scoped.** `yarn db:generate` diffs entities against `src/modules/<id>/migrations/.snapshot-open-mercato.json`. `AGENTS.md`: "Run `yarn db:generate`, review scoped SQL/snapshot, and ask before applying it."
- **Five locales ship.** `src/modules/example/i18n/` holds `en, de, es, ko, pl`; README rule 9 says "Ship every locale file the project already has."

## What We're NOT Doing

- **Not building any interview, wizard, mapping table, savings breakdown or `.md` handoff surface.** Those are S-01 through S-06.
- **Not pre-building the data layer.** The entity carries only what every later slice needs. Company profile, SaaS tool lines, costs, answers, mappings, decisions, confidence bands and the handoff document are each added by the slice that owns them, with their own reviewed migration.
- **Not applying the migration.** `yarn db:migrate` is out of scope and is yours to run.
- **Not touching `src/modules/example`.** It is immutable reference context.
- **Not writing a `.ai/specs/SPEC-xxx`.** This plan is the single planning artifact; see Open Risks.
- **Not baking in a specific example company.** PRD §Non-Goals: "No hardcoded example company or industry-specific steps." The seeded case is a neutral placeholder.
- **Not adding search, vector, events beyond CRUD, widgets, workers, notifications, AI tools, custom entities or entity extensions.** `module-surfaces.md`: "Every added surface needs a real caller or acceptance path. Do not add speculative empty files."
- **Not enabling `example` or `design_system`.** `.ai/specs/2026-08-06-reference-module-activation.md` Q-001 stays open.

## Implementation Approach

Build the module in dependency order, proving each layer before adding the one above it: discovery first (no database), then schema, then the write path, then the read surface. Each phase runs its own gate rather than deferring verification to a trailing phase.

Naming is fixed once, here, because these identifiers are frozen surfaces:

| Surface | Value | Rationale |
|---|---|---|
| Module id / directory | `mercatify` | Matches the product, the PRD, the roadmap and every `change_id`. `README.md` rule 1 prefers plural `snake_case`, but `example` itself is singular and a proper-noun product name is the clearer identifier here. |
| Entity class / ID | `InterviewCase` / `mercatify:interview_case` | `<module>:<snake_case_class>`, per the generated-facts convention. |
| Table | `mercatify_interview_cases` | Module-prefixed plural. |
| ACL features | `mercatify.cases.view`, `mercatify.cases.manage` | `<module>.<resource>.<view\|manage>`; `manage` declares `dependsOn: ['mercatify.cases.view']`. |
| Command IDs | `mercatify.cases.create\|update\|delete` | `<module>.<entity>.<action>`. |
| Event IDs | `mercatify.case.created\|updated\|deleted` | `<module>.<entity>.<past-tense>`. |
| Backend route | `/backend/cases` | Module id is dropped from backend page routes. |
| API route | `/api/mercatify/cases` | Module id is kept in API routes. |
| i18n namespace | `mercatify.*` | Five locales. |

## Critical Implementation Details

**The surface inventory's CRUD row points at a forbidden shape.** `references/surface-inventory.json` marks `api.crud-factory` as `readable` with `sourcePaths: src/modules/example/api/customer-priorities/route.ts` — but that file uses the flat `create`/`update`/`del` + `hooks` factory shape, which `.ai/guides/contracts.md` explicitly forbids ("Do not use the stale flat `create`/`update`/`del` factory shape"). Both shapes still typecheck against the installed factory (`node_modules/@open-mercato/shared/src/lib/crud/factory.ts:492-513` declares `create`, `update`, `del` **and** `actions`), so this passes the gate and fails review. Model the route on `src/modules/example/api/todos/route.ts:240-256` instead. The README settles the precedence: "The rule owner named on each row is authoritative for *what you must do*; `example` only shows *one compiling way to do it*."

**Ordering: generate before the schema probe, and never the reverse.** `.ai/guides/contracts.md` §Migration Workflow fixes the sequence — change entities, `yarn generate` if discovery or entity registration changed, then `yarn db:generate` as a schema-diff probe. Running the probe first diffs against a registry that does not yet know the module.

**A dev server started before `yarn generate` keeps the stale registry.** `.ai/guides/testing-debugging.md` lists this explicitly: "New entity/route 500s while the database accepts the same write → Dev server bootstrapped before `yarn generate` and kept the old registry; restart it first."

**`TodosTable.tsx` is not the model for this phase's table.** It carries custom-field visibility, perspectives, export, extension points and conflict surfacing — far past what F-01 needs. Adapt the minimal `DataTable` + `fetchCrudList` path only; the real table lands in S-03.

**DI registrations must be `.scoped()`.** `src/modules/example/di.ts:24-39` — a singleton pins one request's `em`, and therefore one tenant. F-01 adds no service, but the rule applies the moment one appears.

---

## Phase 1: Module skeleton, ACL and registration

### Overview

Create the module's convention files and register it, so auto-discovery picks it up and `yarn generate` emits its entries. No database, no entity, no route — this phase proves FR-015 in isolation.

### Changes Required:

#### 1. Module manifest

**File**: `src/modules/mercatify/index.ts`

**Intent**: Declare the module to the registry so discovery can name it.

**Contract**: `export const metadata: ModuleInfo` with `name: 'mercatify'`, plus `export default metadata`. `ModuleInfo` comes from `@open-mercato/shared/modules/registry`. Model: `src/modules/example/index.ts` (10 lines); `src/modules/example_customers_sync/index.ts:1-12` shows the default export.

#### 2. ACL features

**File**: `src/modules/mercatify/acl.ts`

**Intent**: Declare the two features every Mercatify surface gates on, so no page or route is ever gated by a role name.

**Contract**: `export const features = [...]` **and** `export default features` — both are required by generated registry code. Two entries: `{ id: 'mercatify.cases.view', title, module: 'mercatify' }` and `{ id: 'mercatify.cases.manage', title, module: 'mercatify', dependsOn: ['mercatify.cases.view'] }`. Model: `src/modules/example/acl.ts:1-43`.

#### 3. Role grants and setup hooks

**File**: `src/modules/mercatify/setup.ts`

**Intent**: Grant the new features to the default roles so the module is reachable after install, and establish the setup hook surface the seeder attaches to in Phase 4.

**Contract**: `export const setup: ModuleSetupConfig` with `defaultRoleFeatures: { superadmin: ['mercatify.*'], admin: ['mercatify.*'], employee: ['mercatify.cases.view'] }`, plus `export default setup`. No seeding hook yet — `seedExamples` is added in Phase 4 once a seeder exists. Do not rename the `features` export or hoist `defaultRoleFeatures` to a disconnected top-level map. Model: `src/modules/example/setup.ts:104-110`.

#### 4. Translation catalogs

**Files**: `src/modules/mercatify/i18n/{en,de,es,ko,pl}.json`

**Intent**: Give every user-facing string in the module a translated key from the start, since `AGENTS.md` forbids hard-coded user strings and `yarn i18n:check-hardcoded` enforces it.

**Contract**: Flat JSON, `"mercatify.<path>.<key>": "text"`, keys alphabetized, identical key sets across all five files. Seed with the page title, nav group, the table's empty/loading/error states, and the case status labels. Model: `src/modules/example/i18n/en.json`.

#### 5. Module registration

**File**: `src/modules.ts`

**Intent**: Turn the module on.

**Contract**: Append exactly one statement after the existing enterprise `push` blocks:
```ts
enabledModules.push({ id: 'mercatify', from: '@app' })
```
This file is protected source. Do not touch the `enabledModules` array literal (`src/modules.ts:8-20`), the `ModuleEntry` type, the env-gated enterprise blocks, or the import. The diff against `HEAD` must be exactly this one addition.

### Success Criteria:

#### Automated Verification:
- `yarn generate` completes and creates `.mercato/generated/` for the first time
- The generated enabled-module registry lists `mercatify`
- `yarn typecheck` passes
- `yarn lint` passes
- `yarn i18n:check-hardcoded` reports no hard-coded strings in `src/modules/mercatify/`
- `git diff --stat src/modules.ts` shows exactly one added line

#### Manual Verification:
- No file outside `src/modules/mercatify/` and `src/modules.ts` appears in `git status`
- The five i18n catalogs have identical key sets

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Interview case entity and reviewed migration

### Overview

Add the one aggregate F-01 owns, and produce a reviewed but unapplied migration plus module snapshot.

### Changes Required:

#### 1. The InterviewCase entity

**File**: `src/modules/mercatify/data/entities.ts`

**Intent**: Persist one interview run per tenant/organization, carrying only the fields every later slice needs — identity, scope, a human label, a lifecycle status, and the timestamps the concurrency and soft-delete contracts require. Profile, tools, costs, answers, mappings and the handoff document are deliberately absent; each later slice adds its own columns.

**Contract**: One exported class `InterviewCase`, `@Entity({ tableName: 'mercatify_interview_cases' })`, decorators imported from `@mikro-orm/decorators/legacy`. Fields: `id` (uuid PK, `defaultRaw: 'gen_random_uuid()'`); `title` (text, required); `status` (text, default `'draft'`, documented valid values `draft | in_progress | completed`); `tenantId` / `organizationId` (`name: 'tenant_id'` / `'organization_id'`, uuid, **required** — this is organization-owned business data, never system-scoped); `createdAt` / `updatedAt` (`onCreate` / `onUpdate`, declared as property initializers `= new Date()`, never `!:`); `deletedAt` (nullable, soft delete). Add a class-level `@Index({ name: 'mercatify_interview_cases_org_tenant_idx', properties: ['organizationId', 'tenantId'] })` composite scope index. Model: `src/modules/example/data/entities.ts:144-170` (the required-scope variant).

#### 2. Input validators

**File**: `src/modules/mercatify/data/validators.ts`

**Intent**: Define the Zod schemas the commands and the route parse against, keeping nullable/optional/clearable modelling consistent between validator, command, entity and response.

**Contract**: `interviewCaseStatusSchema` (`z.enum(['draft','in_progress','completed'])`), `interviewCaseCreateSchema`, `interviewCaseUpdateSchema` (requires `id`), `interviewCaseListSchema` (query). **Public schemas never accept `tenantId` or `organizationId`** — scope comes only from the trusted request context. Validators stay in `data/validators.ts`; do not move them to the module root or invent an `entities/` directory. Model: `src/modules/example/data/validators.ts`.

#### 3. Generated migration and snapshot

**Files**: `src/modules/mercatify/migrations/Migration<timestamp>_mercatify.ts`, `src/modules/mercatify/migrations/.snapshot-open-mercato.json`

**Intent**: Capture the schema change as a reviewable artifact without mutating any database.

**Contract**: Produced by `yarn db:generate`, run **after** `yarn generate`. Review every emitted statement; retain only the `mercatify_interview_cases` create-table plus its indexes and drop anything the probe emits for other modules. Class name matches the filename. Commit the migration and the updated snapshot together. Never hand-edit a generated migration to make it look right — correct the entity and regenerate. Model: `src/modules/example/migrations/Migration20260226161000_example.ts`.

### Success Criteria:

#### Automated Verification:
- `yarn generate` completes and the generated entity-ID map contains `mercatify:interview_case`
- `yarn db:generate` emits exactly one migration touching only `mercatify_interview_cases`
- `yarn typecheck` passes
- `yarn lint` passes

#### Manual Verification:
- The emitted SQL creates `tenant_id` and `organization_id` as `not null`, and the composite scope index exists
- The migration contains no statement for any table owned by another module
- `yarn db:migrate` has **not** been run; the database is unchanged

**Implementation Note**: Pause here for manual confirmation of the reviewed SQL before proceeding.

---

## Phase 3: Commands and the CRUD API contract

### Overview

Add the command-mediated write path and the CRUD route, so every mutation runs through one audited, lockable, event-emitting path rather than through the route.

### Changes Required:

#### 1. Domain commands

**File**: `src/modules/mercatify/commands/cases.ts`

**Intent**: Own create, update and delete for the aggregate so audit, undo, events and cache invalidation share one path; routes validate and dispatch, they do not reproduce writes.

**Contract**: Three `CommandHandler`s with IDs `mercatify.cases.create`, `mercatify.cases.update`, `mercatify.cases.delete`, each passed to `registerCommand` at module scope. Import `registerCommand` and `CommandHandler` from `@open-mercato/shared/lib/commands`. Trusted scope is derived inside the handler from `ctx.auth?.tenantId` plus `ctx.selectedOrganizationId ?? ctx.organizationScope?.selectedId` and fails closed with a 400 when either is missing — note `ctx.organizationScope` is an object, never an organization ID, and `ctx.auth.organizationId` / `ctx.em` / `ctx.dataEngine` are not command runtime fields. Update and delete enforce optimistic locking via `enforceCommandOptimisticLock({ resourceKind, resourceId, current, expected, request: ctx.request })` from `@open-mercato/shared/lib/crud/optimistic-lock-command` — the single options object, not positional timestamps. Also export `caseCrudEvents` and `caseCrudIndexer` configs for the route. Model: `src/modules/example/commands/todos.ts` (`ensureScope` at :654-660, `registerCommand` calls at :606-608).

#### 2. Typed events

**File**: `src/modules/mercatify/events.ts`

**Intent**: Declare the CRUD events before emitting them, so IDs are stable and typed from the first commit.

**Contract**: `createModuleEvents({ moduleId: 'mercatify', events })` over an `as const` table of `{ id, label, entity: 'case', category: 'crud' }` for `mercatify.case.created|updated|deleted`. Export `eventsConfig`, the typed `emit`, the event-ID union type, and `export default eventsConfig`. Model: `src/modules/example/events.ts:8-47`.

#### 3. CRUD route

**File**: `src/modules/mercatify/api/cases/route.ts`

**Intent**: Expose the aggregate over HTTP with per-method feature gates and trusted scoping applied by the factory.

**Contract**: `export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({...})`, imported from `@open-mercato/shared/lib/crud/factory`. Per-method `metadata`: `GET` requires `mercatify.cases.view`; `POST`/`PUT`/`DELETE` require `mercatify.cases.manage`; all require auth. `orm: { entity: InterviewCase, idField: 'id', tenantField: 'tenantId', orgField: 'organizationId', softDeleteField: 'deletedAt' }` — the key is `orgField`, not `organizationField`. `list`: `schema` (not `querySchema`), `entityId` in stable colon form, `fields` including `updated_at`, `sortFieldMap`, `buildFilters`, `transformItem` returning `updatedAt`. `actions: { create, update, delete }`, each with `commandId` — never a `command` key, and never the flat `create`/`update`/`del` shape (see Critical Implementation Details). `indexer: { entityType }`. Model: `src/modules/example/api/todos/route.ts:240-256`.

#### 4. OpenAPI document

**Files**: `src/modules/mercatify/api/openapi.ts`, and the `openApi` export in `api/cases/route.ts`

**Intent**: Publish the route's contract, which `AGENTS.md` requires of every API route.

**Contract**: A module-level builder from `createCrudOpenApiFactory` + `createPagedListResponseSchema` (`@open-mercato/shared/lib/openapi/crud`), consumed by a separate `export const openApi: OpenApiRouteDoc` in the route file. `openApi` is **not** a `makeCrudRoute` option. Resource options go to the builder the factory returns, not to the factory itself, and each operation's key is `schema`, not `body`. Model: `src/modules/example/api/openapi.ts:57-60` and `src/modules/example/api/todos/route.ts:382`.

#### 5. Command tests

**File**: `src/modules/mercatify/commands/__tests__/cases.test.ts`

**Intent**: Prove the security and concurrency invariants that are most expensive to get wrong, before any UI depends on them.

**Contract**: Jest with explicit `@jest/globals` imports (never Vitest), in `commands/__tests__/` — not a module-level tests directory. Cases: create/update/delete succeed within scope; a missing tenant or organization fails closed rather than writing unscoped; a second tenant's record is invisible and unwritable; an update with a stale `updatedAt` raises the conflict rather than overwriting; an update with a missing version is rejected.

### Success Criteria:

#### Automated Verification:
- `yarn generate` completes and the generated route metadata lists `/api/mercatify/cases`
- `yarn typecheck` passes
- `yarn lint` passes
- `yarn test` passes and reports the new command tests actually ran — "No tests found" is not a pass
- The route file contains no `create:`/`update:`/`del:` top-level factory keys and no top-level `requireAuth`

#### Manual Verification:
- The OpenAPI document at `/api/docs/openapi` includes the four `/api/mercatify/cases` methods with their feature gates
- No request schema accepts `tenantId` or `organizationId`

**Implementation Note**: Pause here for manual confirmation before proceeding.

---

## Phase 4: Backend page and the seeded demo case

### Overview

Make the module visible to a person and seed one neutral placeholder case, closing FR-015 end-to-end and giving FR-014 its verification path.

### Changes Required:

#### 1. Backend page and its metadata

**Files**: `src/modules/mercatify/backend/cases/page.tsx`, `src/modules/mercatify/backend/cases/page.meta.ts`

**Intent**: Give the module one reachable, feature-gated, navigable admin surface.

**Contract**: `page.tsx` is a plain server component rendering `<Page><PageBody><CasesTable /></PageBody></Page>` from `@open-mercato/ui/backend/Page` — it carries no `"use client"`. `page.meta.ts` exports `metadata` with `requireAuth: true`, `requireFeatures: ['mercatify.cases.view']`, `pageTitle` + `pageTitleKey`, `pageGroup` + `pageGroupKey`, `pageOrder`, `icon`, and a `breadcrumb` array. The route resolves to `/backend/cases` — the module id is dropped. Model: `src/modules/example/backend/todos/page.tsx` and `page.meta.ts`.

#### 2. Cases table island

**File**: `src/modules/mercatify/components/CasesTable.tsx`

**Intent**: List the tenant's cases using the installed admin primitives rather than a bespoke screen — the failure mode the roadmap names for S-01 starts here.

**Contract**: `"use client"`, `DataTable` from `@open-mercato/ui/backend/DataTable`, data via `fetchCrudList` from `@open-mercato/ui/backend/utils/crud`, strings through `useT` from `@open-mercato/shared/lib/i18n/context`. Adapt the **minimal** path only — no custom-field visibility, perspectives, export or extension points (see Critical Implementation Details). Cover loading, empty, error and permission-denied states with localized copy and semantic design tokens; no raw `fetch`, no hard-coded Tailwind status colors. Model: `src/modules/example/components/TodosTable.tsx`, minimal path only.

#### 3. Seeder and module CLI

**File**: `src/modules/mercatify/cli.ts`

**Intent**: Create one neutral placeholder case so the page has something to render, through a function both the CLI and the setup hook call, so the two entry points seed identically.

**Contract**: Export an idempotent `seedMercatifyCases(em, container, { tenantId, organizationId }, options?)` that returns early when the scope already has rows. Default-export an array of `ModuleCli` `{ command, run(rest) }` — `seed-cases`, invoked as `yarn mercato mercatify seed-cases --org <id> --tenant <id>`, with scope passed explicitly and never inferred. The seeded case is generic ("Sample interview case"), not a named company — PRD §Non-Goals forbids a hardcoded example company. Console output is permitted in CLI scripts. Model: `src/modules/example/cli.ts`.

#### 4. Setup hook wiring

**File**: `src/modules/mercatify/setup.ts` (extend Phase 1's file)

**Intent**: Seed the same placeholder on `mercato init`, through the same function.

**Contract**: Add `async seedExamples({ em, container, tenantId, organizationId })` delegating to `seedMercatifyCases`. Use `seedExamples`, not `seedDefaults` — `seedExamples` is the only hook allowed to create demo domain rows and is the one `--no-examples` skips. It must be idempotent. Model: `src/modules/example/setup.ts:104-140`.

#### 5. Lessons record

**Files**: `.ai/lessons/mercatify-first-app-module.md`, `.ai/lessons.md`

**Intent**: `AGENTS.md` makes scanning and updating lessons a standing obligation, and the stale-CRUD-shape trap found during planning is exactly the recurring evidence a lesson exists to carry.

**Contract**: Copy `.ai/lessons/_template.md`; front matter `title`, `modules: ['mercatify']`, `areas: ['module-data', 'architecture']` (primary first), `topics: ['data-scoping', 'optimistic-locking', 'generated-files']`. Record that a `readable` surface-inventory row can still name a file whose shape the contracts guide forbids, and that the rule owner wins. Add exactly one catalog row under the primary area in `.ai/lessons.md`, then run `node scripts/check-lessons.mjs`.

### Success Criteria:

#### Automated Verification:
- `yarn generate` completes and the generated backend-route manifest lists `/backend/cases`
- `yarn typecheck` passes
- `yarn lint` passes
- `yarn ds:check` passes
- `yarn test` passes
- `yarn build` completes
- `yarn i18n:check-hardcoded` reports no hard-coded strings in the module
- `node scripts/check-lessons.mjs` passes
- `git status` shows changes only under `src/modules/mercatify/`, `src/modules.ts`, and `.ai/lessons*`

#### Manual Verification:
- A user holding `mercatify.cases.view` opens `/backend/cases`, sees the nav entry, and sees the seeded placeholder case
- A user without the feature is denied and renders no nav entry
- The page renders correctly in light and dark mode and at narrow width, with keyboard-reachable table rows
- Empty, loading and error states render localized copy
- Every pre-existing backend page and API still behaves as before (FR-014)
- Running the seeder twice creates no duplicate row

---

## Testing Strategy

### Unit Tests
- Command scope derivation: create/update/delete succeed in scope; missing tenant or organization fails closed
- Cross-tenant isolation: a second tenant's case is neither readable nor writable
- Optimistic locking: stale and missing `updatedAt` are rejected rather than silently overwriting
- Seeder idempotency: a second invocation on a seeded scope writes nothing

### Integration Tests
Deferred. `.ai/qa/` holds only a Playwright config and the repo has no integration test yet; standing up the first one is its own chunk of work and the DB boundary chosen for this change is review-only. S-01 is the natural place for it, since that is the first slice with a user-facing flow to exercise.

### Manual Testing Steps
1. Run `yarn generate`, then restart any running dev server — a server booted before generation keeps the stale registry
2. Apply the reviewed migration yourself, then run `yarn mercato mercatify seed-cases --org <id> --tenant <id>`
3. Open `/backend/cases` as a user holding `mercatify.cases.view`; confirm the nav entry, the seeded case, and light/dark/narrow rendering
4. Repeat as a user without the feature; confirm denial and no nav entry
5. Run the seeder a second time; confirm no duplicate
6. Visit two or three pre-existing admin pages and confirm unchanged behavior (FR-014)

## Performance Considerations

None material at this scale. The composite `(organization_id, tenant_id)` index is the one that matters and is created with the table; every list query filters on it through the factory's trusted scoping.

## Migration Notes

No existing data is moved or transformed — the module introduces one new table and nothing else. Rollback is removing the `enabledModules.push` line and regenerating, which removes the route, nav entry and grants; the table persists by design (`.ai/specs/2026-08-06-reference-module-activation.md` §Rollout). Dropping it is a separate, deliberate data change.

## References

- Change identity: `context/changes/mercatify-module-scaffold/change.md`
- Roadmap F-01: `context/foundation/roadmap.md`
- PRD FR-014, FR-015, §Constraints & Compatibility: `context/foundation/prd.md`
- Reference module rules: `src/modules/example/README.md:23-82`
- Capability index: `src/modules/example/references/surface-inventory.json`
- Contracts: `.ai/guides/contracts.md`
- Module shape and discovery: `.ai/guides/architecture.md:35-80`
- Activation precedent: `.ai/specs/2026-08-06-reference-module-activation.md`
- Installed CRUD factory: `node_modules/@open-mercato/shared/src/lib/crud/factory.ts:492-513`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Module skeleton, ACL and registration

#### Automated
- [x] 1.1 `yarn generate` completes and creates `.mercato/generated/` for the first time — d506e51
- [x] 1.2 The generated enabled-module registry lists `mercatify` — d506e51
- [x] 1.3 `yarn typecheck` passes — d506e51
- [x] 1.4 `yarn lint` passes — d506e51
- [x] 1.5 `yarn i18n:check-hardcoded` reports no hard-coded strings in `src/modules/mercatify/` — d506e51
- [x] 1.6 `git diff --stat src/modules.ts` shows exactly one added line — d506e51

#### Manual
- [ ] 1.7 No file outside `src/modules/mercatify/` and `src/modules.ts` appears in `git status`
- [ ] 1.8 The five i18n catalogs have identical key sets

### Phase 2: Interview case entity and reviewed migration

#### Automated
- [x] 2.1 `yarn generate` completes and the generated entity-ID map contains `mercatify:interview_case` — 3a93462
- [x] 2.2 `yarn db:generate` emits exactly one migration touching only `mercatify_interview_cases` — 3a93462
- [x] 2.3 `yarn typecheck` passes — 3a93462
- [x] 2.4 `yarn lint` passes — 3a93462

#### Manual
- [ ] 2.5 The emitted SQL creates `tenant_id` and `organization_id` as `not null`, and the composite scope index exists
- [ ] 2.6 The migration contains no statement for any table owned by another module
- [ ] 2.7 `yarn db:migrate` has not been run; the database is unchanged

### Phase 3: Commands and the CRUD API contract

#### Automated
- [x] 3.1 `yarn generate` completes and the generated route metadata lists `/api/mercatify/cases`
- [x] 3.2 `yarn typecheck` passes
- [x] 3.3 `yarn lint` passes
- [x] 3.4 `yarn test` passes and reports the new command tests actually ran
- [x] 3.5 The route file contains no flat `create:`/`update:`/`del:` factory keys and no top-level `requireAuth`

#### Manual
- [ ] 3.6 The OpenAPI document includes the four `/api/mercatify/cases` methods with their feature gates
- [ ] 3.7 No request schema accepts `tenantId` or `organizationId`

### Phase 4: Backend page and the seeded demo case

#### Automated
- [ ] 4.1 `yarn generate` completes and the generated backend-route manifest lists `/backend/cases`
- [ ] 4.2 `yarn typecheck` passes
- [ ] 4.3 `yarn lint` passes
- [ ] 4.4 `yarn ds:check` passes
- [ ] 4.5 `yarn test` passes
- [ ] 4.6 `yarn build` completes
- [ ] 4.7 `yarn i18n:check-hardcoded` reports no hard-coded strings in the module
- [ ] 4.8 `node scripts/check-lessons.mjs` passes
- [ ] 4.9 `git status` shows changes only under `src/modules/mercatify/`, `src/modules.ts`, and `.ai/lessons*`

#### Manual
- [ ] 4.10 A user holding `mercatify.cases.view` opens `/backend/cases` and sees the nav entry and the seeded case
- [ ] 4.11 A user without the feature is denied and renders no nav entry
- [ ] 4.12 The page renders correctly in light and dark mode and at narrow width, with keyboard-reachable rows
- [ ] 4.13 Empty, loading and error states render localized copy
- [ ] 4.14 Every pre-existing backend page and API still behaves as before (FR-014)
- [ ] 4.15 Running the seeder twice creates no duplicate row
