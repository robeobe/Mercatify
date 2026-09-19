# Admin Mapping Table — Implementation Plan

## Overview

GitHub issue #14 / roadmap **S-03**, the north star: the admin opens a case's mapping table and sees every capability the analysis mapped — one row each, with a decision (native/configure/build/integrate/keep), a justification, and a confidence band (High/Medium/Low, never a percentage). Anything the analysis could not map is visibly flagged, never dropped. The admin can edit a row's decision and justification, then "Confirm mapping" to lock the table and unlock the report stage. The employee who submitted the intake never sees this table.

F-01 (`mercatify-module-scaffold`) and F-02 (`mercatify-lab-analysis-contract`) are done: the `mercatify` module exists with a seeded `InterviewCase`, and `MercatifyLabPort`/`scriptedMercatifyLabAdapter` already produce a `complete` mapping result. This plan persists that result per case, renders it, and adds the two admin actions (edit row, confirm).

## Current State Analysis

- `InterviewCase` (`src/modules/mercatify/data/entities.ts`) has only `id/title/status/tenantId/organizationId/createdAt/updatedAt/deletedAt` — no mapping data and no "confirmed" flag yet.
- `MercatifyLabPort.evaluate()` (`src/modules/mercatify/lib/mercatify-lab-port.ts`) returns either `needs_more_info` or `complete: { mapping: MercatifyMappingRowSchema[] }`. The scripted adapter (`lib/scripted-mercatify-lab-adapter.ts`) returns `needs_more_info` when `answers.length === 0`, otherwise a fixed 6-row `complete` mapping.
- **The scripted fixture's `SCRIPTED_MAPPING` names `moduleId: 'customers'` and `moduleId: 'sales'`** — neither is in `src/modules.ts`'s `enabledModules` (only `auth, directory, configs, entities, query_index, api_docs, audit_logs, notifications, dashboards, events, search, mercatify`). This is exactly the gap issue #14's last acceptance criterion guards against: *"Every named module in a row exists in the module registry the app actually enables."* Resolving roadmap Open Question 15, this plan reads that literally — the registry is the modules this app actually enables, checked at generation time via the server-only `getEnabledModuleIds()` (`@open-mercato/shared/security/enabledModulesRegistry`) — and treats any row naming a module outside that set as **flagged**, the same visible-not-dropped treatment FR-006 already requires for a fully unmapped capability. No change to F-02's contract or its scripted adapter is needed: the existing `customers`/`sales` rows become the fixture's demonstration of this exact flagged state, alongside the `unmapped` row ("Legacy inventory sync") and the valid `dashboards`/`Figma`/`Mailchimp` rows.
- No intake/wizard data exists yet (S-01 is `ready`, not built; S-02 is superseded). `evaluate()`'s request shape (`companyProfile`, `saasTools`, `answers`) has nothing real to source from. This plan calls the port with a minimal, self-contained placeholder request (one synthetic answer, so the scripted adapter's `needs_more_info` branch is never hit) — exactly the kind of "fixture-only until intake ships" seam F-02's own plan flagged as an accepted, temporary coupling.
- Reference CRUD module: `src/modules/mercatify/api/cases/route.ts` + `commands/cases.ts` — `makeCrudRoute`, command-per-mutation, `enforceCommandOptimisticLock`, soft delete, audit `buildLog`. This plan's `MappingRow` follows the same shape minus soft-delete (rows are never individually deleted by an admin) and minus create/delete actions (rows are analysis-owned; only `decision`/`justification` are admin-editable, per the issue's own acceptance criterion — confidence and target are not admin-editable).
- `setup.ts` already grants `admin`/`superadmin` the wildcard `mercatify.*`; `employee` gets only `mercatify.cases.view`. Adding new `mercatify.mapping.view`/`mercatify.mapping.manage` features to `acl.ts` therefore reaches admin/superadmin automatically and **excludes employee by construction** — satisfies "the employee/client role cannot reach this table" with no `setup.ts` change (existing tenants still need `yarn mercato auth sync-role-acls`, noted in Migration Notes).
- Page/table conventions confirmed from `src/modules/example/components/TodosTable.tsx` + `TodoForm.tsx` and `.ai/guides/backend-ui.md`: `DataTable` for the list, `RowActions` for per-row actions, `useConfirmDialog` instead of `window.confirm`, `useGuardedMutation` for writes that don't fit `CrudForm`'s create/edit/delete model (this table's only write is a 2-field row edit and a case-level confirm — neither is a create/detail/delete flow, so both go through `useGuardedMutation` + a `Dialog`, per `packages/ui/AGENTS.md` → CrudForm Guidelines: *"If a backend page cannot use CrudForm, use `useGuardedMutation`... for every write."*).

### Key Discoveries

- **Confidence and target are read-only.** The issue's acceptance criteria say admin can edit "a row's decision/justification" — confidence and target/capability are the analysis's own output and are not exposed as editable fields. This keeps the flagged computation (a pure function of `target`) stable across edits: it never needs recomputing after a save.
- **The mapping is generated once per case, lazily, not by a visible "Run analysis" button.** The roadmap frames this as "admin sees... the table already filled" — there is no UI affordance for triggering analysis in any mockup or acceptance criterion. The mapping page calls an idempotent `POST .../mapping-rows/generate` on mount when the row list comes back empty; the command no-ops if rows already exist for the case. This keeps the analysis-trigger side effect out of the `GET` list handler (contracts.md's CRUD contract keeps `list` pure) while still requiring no manual step from the admin.
- **`targetLabel` is a generation-time snapshot, not a live lookup.** The browser never imports the server-only `enabledModulesRegistry`, so a friendly module name for a valid `om_module` row (e.g. `dashboards` → "Admin Dashboards") is resolved once at generation time from `getModules()` and stored on the row — following contracts.md's "Durable historical reference: scalar ID plus snapshot" cross-module mechanism. Flagged rows keep the raw `moduleId` (or nothing, for `unmapped`) so the UI can say plainly what's wrong.
- **No new page group / nav entry.** The mapping page is a case detail view (`navHidden: true`), reached from a "View mapping" row action added to the existing `CasesTable`, and from a direct link — matching the roadmap's "reached via a direct link... before the request queue... exists."

## Desired End State

- `InterviewCase` gains a nullable `mappingConfirmedAt`; a new `MappingRow` entity (`mercatify_mapping_rows`) holds one row per capability, scoped like every other Mercatify record.
- Visiting `/backend/cases/[id]/mapping` as an admin auto-generates the mapping (once) from `getMercatifyLabPort()`, renders every row with capability / mapped-to / decision / confidence / justification, visibly flags rows that are `unmapped` or name a module outside `getEnabledModuleIds()`, lets the admin edit decision+justification per row, and offers "Confirm mapping" once at least one row exists.
- After confirmation, row edits and re-generation are rejected (409) and the case exposes `mappingConfirmedAt` for the (future) report-stage slice to key off.
- An employee-only session gets 403 from every new API route and never sees the page (feature-gated, non-navigable).
- Verification: unit tests on the three new commands (generate/update-row/confirm) prove tenant isolation, optimistic locking, the flagged-module invariant, and idempotency: **every row whose `targetKind === 'om_module'` and `flagged === false` has a `targetModuleId` in `getEnabledModuleIds()`** — the automated form of the issue's last acceptance criterion.

## What We're NOT Doing

- Not building S-01/S-02 (intake form, discovery wizard) — the generate step uses a minimal self-contained placeholder request, documented above.
- Not building S-04 (savings breakdown), S-05 (`.md` handoff document), or S-09 (report build/send) — "Confirm mapping" only sets `mappingConfirmedAt`; it does not build or send anything.
- Not building S-07 (request queue) — the entry point here is the existing cases list's new row action plus a direct link, per the roadmap's explicit note that S-03 doesn't need S-07 to be demoable.
- Not making `capability`, `confidence`, or `target` admin-editable — only `decision` and `justification`, per the issue's stated acceptance criteria.
- Not changing F-02's contract, port, or scripted adapter — the flagged-module handling lives entirely in this slice's own generate command.
- Not re-validating flagged state on every read after generation — it's computed once, at generation time, and stored (see Key Discoveries).

## Implementation Approach

Standard CRUD-adjacent slice: extend `data/entities.ts` (+migration), extend `data/validators.ts`, add three commands (`generate`, `update row`, `confirm`) following the existing `commands/cases.ts` shape, wire them behind `makeCrudRoute` (list+update) plus two small action routes (generate/confirm) mirroring the flat-action-route pattern used by `warranty_claims/api/transition`, gate everything with two new ACL features, and build the page/table/dialog with the same primitives `CasesTable`/`TodosTable` already use.

## Phase 1: Data model, contracts, ACL

### Overview

Add the `MappingRow` entity and `InterviewCase.mappingConfirmedAt`, their validators, the two new ACL features, and the module events these commands will emit. No command/route/UI code yet.

### Changes Required

#### 1. Entities

**File**: `src/modules/mercatify/data/entities.ts`

- Add `mappingConfirmedAt: Date | null` (nullable timestamptz, no default) to `InterviewCase`.
- Add `MappingRow`:
  - `id` (uuid pk), `caseId` (uuid, scalar FK — no cross-module or cross-entity ORM relation), `position` (int, generation order)
  - `capability` (text), `decision` (text: `native|configure|build|integrate|keep`), `targetKind` (text: `om_module|external_tool|unmapped`), `targetModuleId` (text, nullable), `targetToolName` (text, nullable), `targetLabel` (text, nullable — the generation-time display snapshot)
  - `justification` (text), `confidence` (text: `high|medium|low`)
  - `flagged` (boolean, default `false`), `flagReason` (text, nullable: `unmapped|module_not_enabled`)
  - `tenantId`, `organizationId` (uuid, required — organization-owned, never system-scoped)
  - `createdAt`, `updatedAt` (timestamptz, `onCreate`/`onUpdate` — required for optimistic locking; no `deletedAt`, rows are never individually deleted)
  - Composite index on `(organizationId, tenantId, caseId)`.

#### 2. Validators

**File**: `src/modules/mercatify/data/validators.ts`

```ts
export const mappingRowUpdateSchema = z.object({
  id: z.string().uuid(),
  decision: MercatifyDecisionSchema,
  justification: z.string().min(1).max(2000),
})

export const mappingRowListSchema = z.object({
  caseId: z.string().uuid(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
})

export const mappingGenerateSchema = z.object({ caseId: z.string().uuid() })
export const mappingConfirmSchema = z.object({ caseId: z.string().uuid() })
```

Import `MercatifyDecisionSchema`/`MercatifyConfidenceSchema` from `../lib/mercatify-lab-port` rather than redeclaring them.

#### 3. ACL

**File**: `src/modules/mercatify/acl.ts`

```ts
{ id: 'mercatify.mapping.view', title: 'View capability mapping', module: 'mercatify', dependsOn: ['mercatify.cases.view'] },
{ id: 'mercatify.mapping.manage', title: 'Manage capability mapping', module: 'mercatify', dependsOn: ['mercatify.mapping.view'] },
```

No `setup.ts` change: `admin`/`superadmin` already hold `mercatify.*`; `employee`'s `defaultRoleFeatures` stays `['mercatify.cases.view']`, so the new features never reach it.

#### 4. Events

**File**: `src/modules/mercatify/events.ts`

Add, before anything emits them: `mercatify.mapping.generated`, `mercatify.mapping.row.updated`, `mercatify.mapping.confirmed` (same `category: 'crud'`/`'lifecycle'` shape as the existing three).

### Success Criteria

#### Automated

- [ ] `yarn generate` completes without error
- [ ] `yarn typecheck` passes
- [ ] `yarn lint` passes
- [ ] `yarn db:generate` output reviewed; only `mercatify_interview_cases.mapping_confirmed_at` and the new `mercatify_mapping_rows` table appear; `.snapshot-open-mercato.json` updated to match

#### Manual

- [ ] Ask the user before running `yarn db:migrate`

---

## Phase 2: Commands

### Overview

`mercatify.mapping.generate`, `mercatify.mapping.rows.update`, `mercatify.mapping.confirm` — the three domain mutations, each scoped, audited, and optimistically locked like `commands/cases.ts`.

### Changes Required

#### 1. Commands

**File**: `src/modules/mercatify/commands/mapping.ts`

- `generateMappingCommand` (id `mercatify.mapping.generate`):
  - `ensureScope` (same helper as `cases.ts`), look up the `InterviewCase` in scope (404 if missing).
  - Idempotent: `em.count(MappingRow, { caseId, organizationId, tenantId })` — if `> 0`, return the existing rows unchanged (no error, no duplicate insert).
  - Otherwise call `getMercatifyLabPort().evaluate({ contractVersion: 1, tenantId, organizationId, caseId, companyProfile: {}, saasTools: [], answers: [{ questionId: 'seed', freeText: 'seeded case' }] })`. If the result is `needs_more_info` (should not happen against the scripted adapter given a non-empty `answers`, but the contract allows it), persist zero rows and return `{ generated: false }` rather than throwing — the UI shows the existing empty state, never a crash.
  - On `complete`, for each `mapping[i]` compute `flagged`/`flagReason`/`targetLabel`:
    - `target.kind === 'unmapped'` → `flagged=true, flagReason='unmapped', targetLabel=null`
    - `target.kind === 'om_module'` → look up `getEnabledModuleIds()` (`@open-mercato/shared/security/enabledModulesRegistry`) and `getModules()` (`@open-mercato/shared/lib/modules/registry`); if `moduleId` is enabled, `flagged=false, flagReason=null, targetLabel = modules.find(m => m.id === moduleId)?.info?.title ?? moduleId`; else `flagged=true, flagReason='module_not_enabled', targetLabel=moduleId`
    - `target.kind === 'external_tool'` → `flagged=false, flagReason=null, targetLabel=target.name`
  - Persist via `dataEngine.createOrmEntity` in a loop (mirrors `cases.ts`'s single-entity form; `position` = array index), emit `mercatify.mapping.generated` (event, not `emitCrudSideEffects` — this is a batch generation, not a single-record CRUD mutation) and a `buildLog` audit entry summarizing row count.
- `updateMappingRowCommand` (id `mercatify.mapping.rows.update`):
  - `prepare`: look up the row in scope (404), look up its case (404 if somehow missing), reject with `conflict(...)` (409) if `case.mappingConfirmedAt` is set, then `enforceCommandOptimisticLock` on the row's own `updatedAt` (mirrors `updateCaseCommand.prepare`).
  - `execute`: re-check the confirmed guard (race-safe), apply `decision`/`justification` via `dataEngine.updateOrmEntity`, emit `mercatify.mapping.row.updated` + `buildLog` with a before/after diff (`buildChanges`).
- `confirmMappingCommand` (id `mercatify.mapping.confirm`):
  - Look up the case in scope (404). If `mappingConfirmedAt` is already set, return the existing case unchanged (idempotent no-op — matches the "additive no-op" precedent pinned by `cases.test.ts`).
  - Reject with `badRequest(...)` (400) if the case has zero mapping rows (nothing to confirm).
  - Otherwise set `mappingConfirmedAt = new Date()`, emit `mercatify.mapping.confirmed` + `buildLog`.

Register all three with `registerCommand`, export them for tests.

#### 2. Tests

**File**: `src/modules/mercatify/commands/__tests__/mapping.test.ts`

Extend the in-memory `makeWorld()` pattern from `cases.test.ts` (add `MappingRow` support to `findOne`/`createOrmEntity`/`updateOrmEntity`, and a fake `em.count`). Cover:

- `generate` persists one row per scripted-mapping entry, is a no-op on a second call (same row count, same ids), and — **the automated form of the issue's last acceptance criterion** — every persisted row with `targetKind === 'om_module' && !flagged` has `targetModuleId` present in a stubbed `getEnabledModuleIds()`; every row naming a module outside that set, or `unmapped`, has `flagged === true` with the right `flagReason`.
- `generate` is tenant/org scoped and fails closed with no tenant/org context (400, mirroring `cases.test.ts`).
- `update row` succeeds pre-confirmation, 409s on a stale `updatedAt`, and 409s (a different, confirmed-state conflict) once the case is confirmed.
- `confirm` 400s on zero rows, succeeds once rows exist, and is idempotent on a second call (same timestamp, no error).

### Success Criteria

#### Automated

- [ ] `yarn test` passes, including every case above
- [ ] `yarn typecheck` passes

#### Manual

- [ ] None beyond the automated tests — commands have no observable UI yet.

---

## Phase 3: API routes

### Overview

Expose the three commands: a `makeCrudRoute` list+update for rows, plus two small action routes for generate/confirm — following `warranty_claims/api/transition/route.ts`'s flat action-route shape (parent id in the body, not a nested `[id]` URL segment).

### Changes Required

#### 1. Mapping rows CRUD

**File**: `src/modules/mercatify/api/mapping-rows/route.ts`

- `makeCrudRoute` with `metadata: { GET: { requireFeatures: ['mercatify.mapping.view'] }, PUT: { requireFeatures: ['mercatify.mapping.manage'] } }` (only export `{ metadata, GET, PUT }` — no `POST`/`DELETE`, rows are never created or deleted directly).
- `orm: { entity: MappingRow, softDeleteField: null }`.
- `list`: `mappingRowListSchema`, `entityId: 'mercatify:mapping_row'`, `buildFilters` requires `caseId` (already validated as a required uuid by the schema — a request without it 400s before reaching `buildFilters`), fields include `target_label`, `target_kind`, `target_module_id`, `target_tool_name`, `flagged`, `flag_reason`, `decision`, `confidence`, `justification`, `capability`, `position`, `updated_at`; sort by `position` ascending by default.
- `actions.update`: `commandId: 'mercatify.mapping.rows.update'`, `schema: mappingRowUpdateSchema`.
- `indexer: { entityType: 'mercatify:mapping_row' }`.

#### 2. Generate action

**File**: `src/modules/mercatify/api/mapping-rows/generate/route.ts`

- `POST`, `requireFeatures: ['mercatify.mapping.manage']`.
- Mirrors `transition/route.ts`'s `resolveActionContext` shape (auth + org scope resolution), parses `mappingGenerateSchema` from the body, dispatches `generateMappingCommand` via the command bus, returns `{ generated: boolean, rowCount: number }`.

#### 3. Confirm action

**File**: `src/modules/mercatify/api/mapping-rows/confirm/route.ts`

- Same shape as generate, `commandId: 'mercatify.mapping.confirm'`, returns `{ ok: true, confirmedAt: string }`.

#### 4. OpenAPI

**File**: `src/modules/mercatify/api/openapi.ts`

Add `mappingRowListItemSchema` and reuse `createMercatifyPagedListResponseSchema`/`mercatifyOkSchema` for the two action routes' docs, following the existing `interviewCaseListItemSchema` pattern.

### Success Criteria

#### Automated

- [ ] `yarn generate` completes without error (new API routes discovered)
- [ ] `yarn typecheck` passes
- [ ] `yarn lint` passes
- [ ] `yarn ds:check` passes

#### Manual

- [ ] `curl` (or the OpenAPI explorer) confirms: an employee session gets 403 on all three routes; an admin session can list, generate (idempotent on repeat), update a row, and confirm; confirming with zero rows 400s; updating after confirm 409s

---

## Phase 4: Backend UI

### Overview

The mapping page: auto-generate on first visit, render the table with flags, per-row edit dialog, confirm action, and a "View mapping" entry point from the existing cases list.

### Changes Required

#### 1. Mapping page

**Files**: `src/modules/mercatify/backend/cases/[id]/mapping/page.tsx`, sibling `page.meta.ts`

- `page.meta.ts`: `requireAuth: true, requireFeatures: ['mercatify.mapping.view'], navHidden: true`, breadcrumb back to `/backend/cases` ("Interview cases").
- `page.tsx`: thin wrapper rendering `<MappingTable caseId={params.id} />` inside `Page`/`PageBody`, following `backend/cases/page.tsx`'s shape.

#### 2. Mapping table component

**File**: `src/modules/mercatify/components/MappingTable.tsx`

- Loads the case (`fetchCrudList('mercatify/cases', { ids: caseId, pageSize: 1 })`) for the title and `mappingConfirmedAt`.
- Loads rows (`fetchCrudList('mercatify/mapping-rows', { caseId, pageSize: 100 })`, sorted by `position`).
- On first successful load, if `rows.length === 0`, fires the generate mutation once (guarded by a ref so it never loops) via `useGuardedMutation`, then invalidates the rows query.
- `DataTable` columns: Capability; Mapped to (renders `targetLabel` for a resolved row, or a distinct flagged badge with a reason-specific message — "Not enough information to map this capability yet" for `unmapped`, "This module isn't installed in this workspace" for `module_not_enabled" — for a flagged row); Decision (`Tag`/`StatusBadge` with a 5-way variant map); Confidence (badge, High/Medium/Low only — never a number); Justification (`meta.truncate`).
- `rowActions`: "Edit" opens `EditMappingRowDialog` (disabled/hidden once `mappingConfirmedAt` is set).
- Page-level "Confirm mapping" `Button` (via `useConfirmDialog`, not `window.confirm`) — disabled once already confirmed, disabled while rows are empty/loading. On confirm, calls the confirm action through `useGuardedMutation`, then invalidates the case query so the locked state reflects immediately.
- Loading/empty/error states via `LoadingMessage`/`EmptyState`/`Alert`, matching `CasesTable`'s existing error-message branching (403 vs generic).

#### 3. Edit dialog

**File**: `src/modules/mercatify/components/EditMappingRowDialog.tsx`

- `Dialog` (`@open-mercato/ui/primitives/dialog`) with a `Select` for `decision` (5 options) and a `Textarea` for `justification`, pre-filled from the row.
- Submits through `useGuardedMutation` → `updateCrud('mercatify/mapping-rows', { id, decision, justification })` with the optimistic-lock header derived from the row's `updatedAt` (`withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), ...)`); surfaces a 409 via `surfaceRecordConflict`.
- Supports Cmd/Ctrl+Enter submit and Escape cancel, per the UI dialog contract.

#### 4. Entry point from the cases list

**File**: `src/modules/mercatify/components/CasesTable.tsx`

Add a `rowActions` item ("View mapping", `href: `/backend/cases/${row.id}/mapping`) alongside whatever already renders there (currently none — this is the first row action on that table).

#### 5. i18n

**Files**: `src/modules/mercatify/i18n/{en,de,es,ko,pl}.json`

Add keys under `mercatify.mapping.*` for: page title/breadcrumb, table title/columns/empty/error states, decision labels (native/configure/build/integrate/keep), confidence labels (high/medium/low — reuse `mercatify.cases.status.*` naming convention), flag messages (both reasons), edit dialog labels/actions, confirm button/dialog copy, flash messages (saved/confirmed/error).

### Success Criteria

#### Automated

- [ ] `yarn generate && yarn typecheck && yarn lint && yarn ds:check && yarn test && yarn build` all pass
- [ ] `yarn i18n:check-hardcoded` passes (no hard-coded UI strings in the new components)

#### Manual

- [ ] As admin: open a seeded case's `/mapping` URL directly — table fills itself with the scripted mapping, including the two flagged rows (unmapped, and the two module-not-enabled rows) rendered distinctly from the four resolved rows.
- [ ] Edit a row's decision and justification, save, reload — change persisted; confidence/capability/target unchanged.
- [ ] Attempt to edit a row with a stale tab open in a second window after saving in the first — second save surfaces the conflict banner, does not overwrite.
- [ ] Confirm mapping — button becomes disabled/hidden for further edits; row edit attempts now show the locked state; reloading the page still shows it confirmed.
- [ ] As an employee-role session: `/backend/cases/[id]/mapping` is unreachable (403/redirect) and no row action links to it.
- [ ] From `/backend/cases`, the new "View mapping" row action reaches the same page.

---

## Testing Strategy

### Unit Tests

- `commands/__tests__/mapping.test.ts` (Phase 2) — the primary coverage: scoping, idempotency, optimistic locking, the confirmed-state guard, and the flagged/enabled-module invariant.

### Integration Tests

- Not added in this plan (no existing Mercatify integration suite to extend, and the unit command tests already exercise the scope/lock/flag logic the route just forwards to). Flagged as a candidate for a follow-up `testing` slice if the team wants `yarn test:integration:ephemeral` coverage of the full HTTP path.

### Manual Testing Steps

See each phase's Manual Success Criteria; Phase 4's list is the end-to-end walkthrough.

## Performance Considerations

None — one case's mapping is at most a handful of rows; no pagination edge cases expected beyond the existing `DataTable` defaults.

## Migration Notes

- New migration adds `mercatify_interview_cases.mapping_confirmed_at` (nullable) and the `mercatify_mapping_rows` table. Ask before `yarn db:migrate`.
- Existing tenants only receive the new `mercatify.mapping.view`/`.manage` ACL features (already implied by their `mercatify.*` wildcard grant, so no `sync-role-acls` run is strictly required for admin/superadmin) — noted per contracts.md's ACL guidance regardless, in case the wildcard is ever narrowed later.

## References

- Issue: https://github.com/robeobe/Mercatify/issues/14
- Roadmap item: `context/foundation/roadmap.md` (S-03)
- Change ticket: `context/changes/mercatify-mapping-summary/change.md`
- Contract this plan builds on: `context/changes/mercatify-lab-analysis-contract/plan.md` (F-02)
- CRUD/command reference: `src/modules/mercatify/api/cases/route.ts`, `src/modules/mercatify/commands/cases.ts`, `src/modules/mercatify/commands/__tests__/cases.test.ts`
- Flat action-route reference: `node_modules/@open-mercato/core/src/modules/warranty_claims/api/transition/route.ts`
- Backend UI reference: `src/modules/example/components/TodosTable.tsx`, `TodoForm.tsx`, `.ai/guides/backend-ui.md`
- Enabled-module registry: `node_modules/@open-mercato/shared/src/security/enabledModulesRegistry.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data model, contracts, ACL

#### Automated

- [x] 1.1 `yarn generate` completes without error
- [x] 1.2 `yarn typecheck` passes
- [x] 1.3 `yarn lint` passes
- [x] 1.4 `yarn db:generate` reviewed and scoped (only `mercatify_mapping_rows` create + `mercatify_interview_cases.mapping_confirmed_at` add); snapshot updated

#### Manual

- [x] 1.5 User asked before `yarn db:migrate` — approved, applied

### Phase 2: Commands

#### Automated

- [x] 2.1 `yarn test` passes, including the flagged/enabled-module invariant test
- [x] 2.2 `yarn typecheck` passes

### Phase 3: API routes

#### Automated

- [x] 3.1 `yarn generate` completes without error
- [x] 3.2 `yarn typecheck` passes
- [x] 3.3 `yarn lint` passes
- [x] 3.4 `yarn ds:check` passes

#### Manual

- [x] 3.5 Role/permission and lifecycle walkthrough (403 for employee, 400/409 guards) confirmed live against a running server + migrated DB

### Phase 4: Backend UI

#### Automated

- [x] 4.1 Broad gate passes: `yarn generate && yarn typecheck && yarn lint && yarn ds:check && yarn test && yarn build`
- [x] 4.2 `yarn i18n:check-hardcoded` passes

#### Manual

- [x] 4.3 Full admin walkthrough (generate, edit, conflict, confirm) verified live via API against the migrated DB: generate produced 6 rows (2 correctly flagged `module_not_enabled` for `customers`/`sales`, 1 `unmapped`, 3 resolved incl. `dashboards` → "Admin Dashboards"); generate is idempotent; row edit persisted decision/justification only; stale-lock edit 409'd with `optimistic_lock_conflict`; confirm succeeded, was idempotent, and locked further row edits (409) and left generate a no-op
- [x] 4.4 Employee-role unreachability confirmed: 403 with `requiredFeatures` on list/generate/confirm; the page route itself renders an "Access Denied" state for the employee session

**Fixed during manual verification**: `api/cases/route.ts`'s list projection never returned `mapping_confirmed_at` (added as `mappingConfirmedAt`), which would have made the UI's "already confirmed" state permanently invisible — a real bug caught only by exercising the live API, not by the unit tests or typecheck.
