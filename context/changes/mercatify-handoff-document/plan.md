# Admin Handoff Document — Implementation Plan

## Overview

GitHub issue #19 / roadmap **S-05**: while preparing the report, the admin sees a `.md` configuration document — everything Mercatify Lab needs for implementation — in an editable text area. The admin can freely edit it, or paste in a whole replacement document. It is admin-only and never rendered on any client-facing screen.

This was HITL-blocked on PRD Open Question 8 (table ↔ `.md` relationship). **Resolved 2026-09-19** (user decision): the two are **independent artifacts**. The table (`MappingRow`, from S-03) and the `.md` never sync after the document is first seeded — no serializer, no cross-artifact conflict story. Concretely: a `generate` step seeds `InterviewCase.handoffDocument` once from the confirmed mapping, and is a no-op forever after (even if a future slice ever re-opens the table for edits, this document will not react to it).

S-03 (`mercatify-mapping-summary`) is done: `InterviewCase.mappingConfirmedAt` and `MappingRow` exist. This plan adds one nullable text column to `InterviewCase`, two commands, one CRUD route + one action route, one admin page, and updates the cases list with an entry point.

## Current State Analysis

- `InterviewCase` (`src/modules/mercatify/data/entities.ts`) has no field for the handoff document.
- `MappingRow` rows exist and are frozen (no further edits) once `mappingConfirmedAt` is set — this plan's document generation only ever reads them, never writes them.
- `hasProfileOrToolEdits`/`PROFILE_CONTENT_KEYS` (`lib/case-tools.ts`) gate `mercatify.cases.update` so a non-`draft` case's profile fields can't be edited. The handoff document must remain editable *after* mapping is confirmed (case is no longer `draft`), so it is deliberately **not** added to that gate or routed through `mercatify.cases.update` — it gets its own command, schema, and route.
- `employee` (the client role — the person who submitted the intake, not internal staff) holds only `mercatify.cases.view`, which the existing `api/cases/route.ts` list already returns to. The document must therefore live behind its **own** ACL features and its **own** route, never added to `api/cases/route.ts`'s list fields — otherwise a client session holding `cases.view` could read admin-only content over the API even though no UI renders it. This is the one dedicated addition beyond mirroring S-03's shape.
- Reference shape: `commands/mapping.ts` + `api/mapping-rows/{route,generate,shared}.ts` + `components/MappingTable.tsx` — an idempotent lazy-generate command, a CRUD route for read/update, a small POST action route for the generate step, and a page that triggers generation once on mount if empty.

### Key Discoveries

- **Generation is idempotent on `handoffDocument`, not on row existence.** Unlike mapping generation (idempotent on row count), the handoff document command checks `case.handoffDocument == null` — once it has ever been written (even to an admin-cleared empty string is not possible, since the update schema requires a non-empty... actually re-generation must never clobber a manual edit, including one that results in short/unusual content). So "already generated" is tracked by `null` vs. non-`null`, and `update` is the only way to ever change it after that — `generate` never runs again for that case.
- **Generation requires a confirmed mapping.** `case.mappingConfirmedAt` must be set (400 otherwise) — this is the FR-010/011 prerequisite (S-03) made concrete: there is nothing to hand off before the mapping is locked.
- **New ACL pair, not reuse of `cases.manage` or `mapping.manage`.** `mercatify.handoff.view` (depends on `mercatify.mapping.view`) / `mercatify.handoff.manage` (depends on `mercatify.handoff.view`) — mirrors the `mapping.view`/`mapping.manage` pair exactly, and keeps `employee`'s `defaultRoleFeatures` (`['mercatify.cases.view']`) from ever reaching it, same as mapping.
- **The document lives as a field on `InterviewCase`, not a new entity.** It's a 1:1 doc per case, admin-only, independent of `MappingRow` — same reasoning as `pains`/`mustKeep`.
- **A dedicated route, sharing the `InterviewCase` entity but not its list.** `api/handoff-document/route.ts` runs its own `makeCrudRoute` over `InterviewCase` with a narrow field projection (`id`, `handoff_document`, `mapping_confirmed_at`, `updated_at`) and its own feature gates — structurally like `api/mapping-rows/route.ts` targets `MappingRow`, except here the underlying entity is shared with `api/cases/route.ts`. The two routes never expose each other's fields.
- **Plain `textarea`, not `richtext`.** The issue's acceptance criteria say "editable text area" and "paste in a whole document" — a `CrudForm` `type: 'textarea'` field (large `rows`, `maxLength` matching the schema) satisfies this literally: raw text in, raw text out, no markdown-source-vs-render ambiguity a rich editor would introduce.
- **`CrudForm` derives the optimistic-lock header automatically from `initialValues.updatedAt`** (confirmed by reading `node_modules/@open-mercato/ui/src/backend/CrudForm.tsx`) and wraps `onSubmit` in `withScopedApiRequestHeaders`, so any `updateCrud` call inside `onSubmit` picks up the lock header with no manual header-building — the same mechanism `EditMappingRowDialog` already relies on.

## Desired End State

- `InterviewCase` gains a nullable `handoffDocument` text column.
- Visiting `/backend/cases/[id]/handoff` as an admin whose case has a confirmed mapping and no document yet auto-generates one (once) from the case profile + confirmed `MappingRow`s, then shows it in a large editable text area. The admin can edit freely or paste a full replacement; saving never touches `MappingRow` and is never re-derived from it again.
- Visiting the page before the mapping is confirmed shows a clear "confirm the mapping first" state instead of erroring.
- The document is reachable only from the admin backend (`mercatify.handoff.view`/`.manage`); it is not returned by `api/cases/route.ts`'s list, so no client-facing surface can read it even indirectly.
- Verification: unit tests on the two new commands (generate/update) prove tenant isolation, the "generate never re-runs once written" invariant (the independence rule from Open Question 8), the confirmed-mapping precondition, and optimistic locking on update.

## What We're NOT Doing

- Not adding any regeneration/sync from `MappingRow` back into `handoffDocument` after the first generate — that is the resolved shape of Open Question 8.
- Not building S-09 (report build/send) or S-06 (Lab handoff send) — this only prepares and stores the document; nothing sends it anywhere yet.
- Not changing `api/cases/route.ts`'s list fields or `mercatify.cases.manage`/`mercatify.cases.update` — the document has its own route and command, entirely separate from case-profile editing.
- Not handling Open Question 9 (sensitive data in pasted content) — flagged non-blocking in the roadmap; out of scope here.
- Not building a diff/history view of prior document versions — "editable text area" with plain save/overwrite is the full scope.

## Implementation Approach

Mirror `commands/mapping.ts` + `api/mapping-rows/*` exactly, scoped to a single field instead of a row collection: one idempotent `generate` command, one `update` command, a `makeCrudRoute` GET+PUT over `InterviewCase` (new file, new ACL, narrow field set), a POST action route for generate, and a page built from `CrudForm` with one big textarea field.

## Phase 1: Data model, contracts, ACL, events

### Changes Required

#### 1. Entity

**File**: `src/modules/mercatify/data/entities.ts`

Add to `InterviewCase`, after `mappingConfirmedAt`:

```ts
/**
 * The `.md` handoff document Mercatify Lab needs for implementation. Seeded
 * once by `mercatify.handoff.generate` from the confirmed mapping; after
 * that, independent of `MappingRow` forever (PRD Open Question 8, resolved
 * 2026-09-19: table and document are independent artifacts — editing one
 * never touches the other).
 */
@Property({ name: 'handoff_document', type: 'text', nullable: true })
handoffDocument?: string | null
```

#### 2. Validators

**File**: `src/modules/mercatify/data/validators.ts`

```ts
export const handoffDocumentListSchema = z.object({
  id: z.string().uuid().optional(),
  ids: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
})

export const handoffDocumentGenerateSchema = z.object({ caseId: z.string().uuid() })

export const handoffDocumentUpdateSchema = z.object({
  id: z.string().uuid(),
  content: z.string().max(200_000),
})

export type HandoffDocumentListInput = z.infer<typeof handoffDocumentListSchema>
export type HandoffDocumentGenerateInput = z.infer<typeof handoffDocumentGenerateSchema>
export type HandoffDocumentUpdateInput = z.infer<typeof handoffDocumentUpdateSchema>
```

#### 3. ACL

**File**: `src/modules/mercatify/acl.ts`

```ts
{ id: 'mercatify.handoff.view', title: 'View handoff document', module: 'mercatify', dependsOn: ['mercatify.mapping.view'] },
{ id: 'mercatify.handoff.manage', title: 'Manage handoff document', module: 'mercatify', dependsOn: ['mercatify.handoff.view'] },
```

No `setup.ts` change: `admin`/`superadmin` already hold `mercatify.*`; `employee`'s `defaultRoleFeatures` stays `['mercatify.cases.view']`.

#### 4. Events

**File**: `src/modules/mercatify/events.ts`

```ts
{ id: 'mercatify.handoff_document.generated', label: 'Handoff Document Generated', entity: 'case', category: 'lifecycle' },
{ id: 'mercatify.handoff_document.updated', label: 'Handoff Document Updated', entity: 'case', category: 'lifecycle' },
```

### Success Criteria

#### Automated
- [ ] `yarn generate` completes without error
- [ ] `yarn typecheck` passes
- [ ] `yarn lint` passes
- [ ] `yarn db:generate` output reviewed; only `mercatify_interview_cases.handoff_document` (nullable text add) appears; `.snapshot-open-mercato.json` updated

#### Manual
- [ ] Ask the user before running `yarn db:migrate`

---

## Phase 2: Markdown builder + commands

### Changes Required

#### 1. Markdown builder (pure function, unit-testable)

**File**: `src/modules/mercatify/lib/handoff-document.ts`

```ts
export function buildHandoffDocumentMarkdown(
  interviewCase: { title: string; companyName: string | null; industry: string | null; peopleCount: number | null; currency: string | null; pains: string | null; mustKeep: string | null },
  rows: Array<{ capability: string; decision: string; targetLabel: string | null; confidence: string; justification: string; flagged: boolean; flagReason: 'unmapped' | 'module_not_enabled' | null }>,
): string
```

Renders: an H1 with the company/case name, a "Company profile" section (industry/people/currency/pains/must-keep, `—` for null), and a "Capability mapping" markdown table (capability/decision/target/confidence/justification), with flagged rows rendering a `⚠` + reason instead of a target label. Escapes `|` in free-text cells. Pure, deterministic, no I/O.

#### 2. Commands

**File**: `src/modules/mercatify/commands/handoff.ts`

- `generateHandoffDocumentCommand` (id `mercatify.handoff.generate`):
  - `ensureScope` (same helper shape as `commands/mapping.ts`), load the case in scope (404 if missing).
  - 400 (`badRequest`) if `case.mappingConfirmedAt` is null — "Confirm the mapping before preparing the handoff document."
  - Idempotent on `handoffDocument`: if it is already non-null, return `{ generated: false, handoffDocument: case.handoffDocument }` unchanged — **this is the independence invariant**: generation never re-runs, so nothing ever silently overwrites a manual edit.
  - Otherwise load `MappingRow`s for the case (`orderBy position asc`), build the markdown via `buildHandoffDocumentMarkdown`, persist via `de.updateOrmEntity`, emit `mercatify.handoff_document.generated` + `buildLog`.
- `updateHandoffDocumentCommand` (id `mercatify.handoff.update`):
  - `prepare`: parse `handoffDocumentUpdateSchema`, `ensureScope`, load the case in scope (404), `enforceCommandOptimisticLock({ resourceKind: 'mercatify:interview_case', resourceId: parsed.id, current: existing.updatedAt, request: ctx.request })` (same resource kind/id as `commands/cases.ts`'s case lock — same row, so a concurrent profile edit and a concurrent handoff edit correctly race each other).
  - `execute`: reload in scope, set `entity.handoffDocument = parsed.content` (any string, including empty — an admin may clear it or paste a full replacement), persist, emit `mercatify.handoff_document.updated` + `buildLog`. No dependency on `mappingConfirmedAt` here — once a document exists, editing is unrestricted, matching "independent artifact" for good.

Register both with `registerCommand`.

#### 3. Tests

**File**: `src/modules/mercatify/lib/__tests__/handoff-document.test.ts` — `buildHandoffDocumentMarkdown` with a full row set, an empty row set, and a flagged row; asserts the escaped-pipe case and that every capability name appears.

**File**: `src/modules/mercatify/commands/__tests__/handoff.test.ts` — extend the in-memory `makeWorld()` pattern from `mapping.test.ts`. Cover:
- `generate` 400s when `mappingConfirmedAt` is null.
- `generate` persists a non-null `handoffDocument` once confirmed, and — the automated form of the Open Question 8 resolution — a second `generate` call after a manual `update` returns `generated: false` and leaves the manually-edited content untouched.
- `update` succeeds pre- and post-mapping-confirmation alike, and 409s on a stale `updatedAt`.
- Tenant/org scoping fails closed (400) with no tenant/organization context, mirroring `mapping.test.ts`.

### Success Criteria

#### Automated
- [ ] `yarn test` passes, including every case above
- [ ] `yarn typecheck` passes

---

## Phase 3: API routes

### Changes Required

#### 1. Handoff document CRUD (read + update)

**File**: `src/modules/mercatify/api/handoff-document/route.ts`

- `makeCrudRoute` over `InterviewCase`: `metadata: { GET: { requireFeatures: ['mercatify.handoff.view'] }, PUT: { requireFeatures: ['mercatify.handoff.manage'] } }` — export only `{ metadata, GET, PUT }` (no `POST`/`DELETE`: the document is generated via its own action route and never independently created/deleted).
- `orm: { entity: InterviewCase, idField: 'id', orgField: 'organizationId', tenantField: 'tenantId', softDeleteField: 'deletedAt' }`.
- `list`: `handoffDocumentListSchema`, `entityId: 'mercatify:interview_case'`, fields `['id', 'handoff_document', 'mapping_confirmed_at', 'updated_at']`, `buildFilters` mirrors `api/cases/route.ts`'s `ids`/`id` handling, `transformItem` maps to `{ id, handoffDocument, mappingConfirmedAt, updatedAt }` — **no other case field is exposed here**.
- `actions.update`: `commandId: 'mercatify.handoff.update'`, `schema: handoffDocumentUpdateSchema`, `mapInput: ({ parsed }) => parsed`.

#### 2. Generate action

**File**: `src/modules/mercatify/api/handoff-document/generate/route.ts`

Mirrors `api/mapping-rows/generate/route.ts` exactly (reuse `resolveMappingActionContext`/`MERCATIFY_CASE_RESOURCE_KIND` from `api/mapping-rows/shared.ts` — same case-scoped action shape), `requireFeatures: ['mercatify.handoff.manage']`, dispatches `mercatify.handoff.generate`, returns `{ generated: boolean, handoffDocument: string | null }`.

#### 3. OpenAPI

**File**: `src/modules/mercatify/api/openapi.ts`

Add `handoffDocumentListItemSchema` (`id`, `handoffDocument` nullable, `mappingConfirmedAt` nullable, `updatedAt` nullable), reuse `createMercatifyPagedListResponseSchema`/`mercatifyOkSchema` in the new route files' `openApi` exports, following the `mappingRowListItemSchema` pattern.

### Success Criteria

#### Automated
- [ ] `yarn generate` completes without error (new routes discovered)
- [ ] `yarn typecheck` passes
- [ ] `yarn lint` passes
- [ ] `yarn ds:check` passes

#### Manual
- [ ] As admin: `GET`/`PUT` on `/api/mercatify/handoff-document` work; `POST` on `/api/mercatify/handoff-document/generate` 400s pre-confirmation, succeeds post-confirmation, is idempotent, and a subsequent manual `PUT` survives a second `generate` call unchanged
- [ ] As employee (client) session: all three routes 403; confirm `GET /api/mercatify/cases` never includes a `handoffDocument` field

---

## Phase 4: Backend UI

### Changes Required

#### 1. Handoff document page

**Files**: `src/modules/mercatify/backend/cases/[id]/handoff/page.tsx`, sibling `page.meta.ts`

- `page.meta.ts`: `requireAuth: true, requireFeatures: ['mercatify.handoff.view'], navHidden: true`, breadcrumb `Interview cases -> Interview case -> Handoff document`.
- `page.tsx`: thin wrapper rendering `<HandoffDocumentEditor caseId={params.id} />` inside `Page`/`PageBody`.

#### 2. Editor component

**File**: `src/modules/mercatify/components/HandoffDocumentEditor.tsx`

- Loads the case's handoff record via `fetchCrudList('mercatify/handoff-document', { ids: caseId, pageSize: 1 })`.
- If `mappingConfirmedAt` is null: render an `EmptyState`/`Alert` — "Confirm the mapping before preparing the handoff document" with a link back to the mapping page. No generate attempt, no editor.
- Else, if `handoffDocument` is null, auto-fire the generate mutation once on mount (guarded by a ref, same pattern as `MappingTable`'s auto-generate effect), then invalidate/refetch.
- Once a document exists, render a `CrudForm` with a single `{ id: 'content', type: 'textarea', rows: 30, maxLength: 200000, showCount: true }` field, `initialValues: { id: caseId, content: handoffDocument, updatedAt }`, submitting through `updateCrud('mercatify/handoff-document', values)` (or the form's built-in submit path) — the standard-issue conflict banner appears automatically via `initialValues.updatedAt` on a stale save.
- Loading/error states mirror `MappingTable`'s 401/403-vs-generic branching.

#### 3. Entry point from the cases list and mapping page

**File**: `src/modules/mercatify/components/CasesTable.tsx`

Add a third `rowActions` item: `{ id: 'mercatify.cases.viewHandoff', label: t('mercatify.cases.table.actions.viewHandoff'), href: '/backend/cases/${row.id}/handoff' }`.

**File**: `src/modules/mercatify/components/MappingTable.tsx`

Once `isConfirmed`, add a link/button next to "Mapping confirmed" to the handoff page — the natural next step once mapping is locked.

#### 4. i18n

**Files**: `src/modules/mercatify/i18n/{en,de,es,ko,pl}.json`

Add keys under `mercatify.handoff.*` (page title/breadcrumb, editor title/labels, empty/not-confirmed state, save/flash/error messages) and `mercatify.cases.table.actions.viewHandoff`, alphabetically inserted per the existing flat-key convention.

### Success Criteria

#### Automated
- [ ] `yarn generate && yarn typecheck && yarn lint && yarn ds:check && yarn test && yarn build` all pass
- [ ] `yarn i18n:check-hardcoded` passes

#### Manual
- [ ] As admin, before confirming mapping: `/backend/cases/[id]/handoff` shows the "confirm mapping first" state, no editor, no crash
- [ ] After confirming mapping: visiting the page generates the document once, shows it filled with the case profile + mapping table content
- [ ] Edit the text freely, save, reload — change persisted
- [ ] Select-all + paste a whole replacement document, save, reload — replacement persisted verbatim
- [ ] Open the page again after a save from another tab with a stale copy — conflict banner appears, does not silently overwrite
- [ ] As employee (client) session: the page and both API routes are unreachable; the cases list shows no "View handoff document" action
- [ ] Confirm no client-facing screen (`assets/client/*`, `client/offer.html` equivalent) ever renders this content — none currently reference it, and this plan adds no such reference

---

## Testing Strategy

### Unit Tests
- `lib/__tests__/handoff-document.test.ts` (Phase 2) — the markdown builder.
- `commands/__tests__/handoff.test.ts` (Phase 2) — the primary coverage: the confirmed-mapping precondition, the "generate never re-runs" independence invariant, optimistic locking, tenant scoping.

### Manual Testing Steps
See each phase's Manual Success Criteria; Phase 4's list is the end-to-end walkthrough.

## Migration Notes

- New migration adds `mercatify_interview_cases.handoff_document` (nullable text). Ask before `yarn db:migrate`.
- No `setup.ts`/`sync-role-acls` action required for admin/superadmin (existing `mercatify.*` wildcard covers the two new features); noted per contracts.md's ACL guidance regardless.

## References

- Issue: https://github.com/robeobe/Mercatify/issues/19
- Roadmap item: `context/foundation/roadmap.md` (S-05)
- Change ticket: `context/changes/mercatify-handoff-document/change.md`
- PRD Open Question 8 resolution: `context/foundation/prd.md`
- Prerequisite: `context/changes/mercatify-mapping-summary/plan.md` (S-03)
- CRUD/command reference: `src/modules/mercatify/commands/mapping.ts`, `src/modules/mercatify/api/mapping-rows/{route,generate,shared}.ts`
- Backend UI reference: `src/modules/mercatify/components/MappingTable.tsx`, `EditMappingRowDialog.tsx`, `.ai/guides/backend-ui.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data model, contracts, ACL, events

#### Automated
- [x] 1.1 `yarn generate` completes without error
- [x] 1.2 `yarn typecheck` passes
- [x] 1.3 `yarn lint` passes
- [x] 1.4 `yarn db:generate` reviewed and scoped — only `mercatify_interview_cases.handoff_document` (nullable text add); snapshot updated

#### Manual
- [x] 1.5 User asked before `yarn db:migrate` — approved, applied (`Migration20260919184316_mercatify`)

### Phase 2: Markdown builder + commands

#### Automated
- [x] 2.1 `yarn test` passes (31/31, including the confirmed-mapping precondition, the "generate never re-runs" independence invariant, optimistic locking, and tenant scoping)
- [x] 2.2 `yarn typecheck` passes

### Phase 3: API routes

#### Automated
- [x] 3.1 `yarn generate` completes without error (66 API paths, up from 64)
- [x] 3.2 `yarn typecheck` passes
- [x] 3.3 `yarn lint` passes
- [x] 3.4 `yarn ds:check` passes

#### Manual
- [x] 3.5 Role/permission and lifecycle walkthrough confirmed live against the running dev server + migrated DB: `generate` 400s pre-confirmation, succeeds post-confirmation (6 rows → full markdown table), is idempotent, and a manual `PUT` survives a later `generate` call unchanged (the independence invariant, live); employee session gets 403 with `requiredFeatures` on all three routes; `GET /api/mercatify/cases` for the employee role never includes a `handoffDocument` field

### Phase 4: Backend UI

#### Automated
- [x] 4.1 Broad gate passes: `yarn generate && yarn typecheck && yarn lint && yarn ds:check && yarn test && yarn build`
- [x] 4.2 `yarn i18n:check-hardcoded` passes (no hard-coded strings introduced)

#### Manual
- [x] 4.3 Full admin walkthrough verified live: not-confirmed state (400 from generate, page renders without crashing), generate (idempotent), edit/paste-replace (survives a later generate call), stale-version conflict (409 `optimistic_lock_conflict`); `/backend/cases/[id]/handoff` and `/backend/cases/[id]/mapping` both render 200 for admin
- [x] 4.4 Employee-role unreachability confirmed live: 403 with `requiredFeatures` on `GET`/`PUT /api/mercatify/handoff-document` and `POST /api/mercatify/handoff-document/generate`

**Verified during manual walkthrough**: test cases created for the live walkthrough (`QA Handoff Co`, `Not Yet Confirmed Co`) were soft-deleted afterward via `DELETE /api/mercatify/cases`, leaving no residue in the shared dev database.
