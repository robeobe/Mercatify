# Install Mercatify as a standard OM module with one seeded case — Plan Brief

> Full plan: `context/changes/mercatify-module-scaffold/plan.md`

## What & Why

Mercatify has no code yet. This change creates `src/modules/mercatify/` as the app's first app-owned Open Mercato module — registered, auto-discovered, feature-gated, owning one tenant- and organization-scoped `InterviewCase` record with a seeded placeholder. It is roadmap item **F-01**: nothing else in the product can render or persist until the module passes auto-discovery, and it is the verification path for FR-014 (existing OM unchanged) and FR-015 (installs as a standard module with no change to core or enterprise packages).

## Starting Point

`src/modules/` contains only reference and probe modules; `src/modules.ts` enables eleven `@open-mercato/core` modules and no `@app` module at all. The `example` module is the mandated pattern source but is deliberately unregistered and explicitly must not be copied wholesale. `node_modules/@open-mercato/*` v0.7.0 is installed, but `.mercato/` does not exist — **`yarn generate` has never run in this checkout**, so Phase 1 produces the app's first generated registries.

## Desired End State

`mercatify` appears in the generated module, entity and route registries. A user holding `mercatify.cases.view` opens `/backend/cases` inside their tenant's admin and sees one seeded placeholder interview case in a standard admin table; a user without the feature is denied and sees no nav entry. A reviewed, unapplied migration and updated module snapshot sit in the module's `migrations/` directory. The whole broad validation gate is green, and `src/modules.ts` differs from `HEAD` by exactly one appended line.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Scope depth | Thin end-to-end vertical slice (entity → command → API → page) | Auto-discovery, feature gating and tenant scoping are only really proven through a runtime path, which is how FR-014/FR-015 get verified. |
| Entity shape | Skeleton aggregate; typed columns added by later slices | Honours the roadmap's "do not pre-build the data layer here" cap and freezes only identifiers every slice needs. |
| Spec gate | This plan only; the `.ai/specs` deviation recorded as a risk | One source of truth beats a second document kept in sync with the PRD and roadmap. |
| DB boundary | `yarn db:generate` + review, stop; never `yarn db:migrate` | Exactly what `AGENTS.md` and `.ai/guides/contracts.md` prescribe — delivery includes migration plus snapshot without mutating the user's database. |
| CRUD route shape | `actions` + `commandId`s, modelled on `api/todos/route.ts` | The surface inventory's `readable` row names a file using the flat shape `contracts.md` forbids; the rule owner wins over the sample. |
| Demo content | Neutral placeholder, not a named company | PRD §Non-Goals forbids a hardcoded example company baked into the module. |
| Integration tests | Deferred to S-01 | The repo has no integration test yet, and the review-only DB boundary leaves nothing to exercise against a real database here. |

## Scope

**In scope:** module manifest, ACL features and role grants, five i18n catalogs, append-only `src/modules.ts` registration, one `InterviewCase` entity with validators, a reviewed migration and snapshot, three domain commands with optimistic locking, typed CRUD events, a `makeCrudRoute` API with OpenAPI, command unit tests, a backend list page and table island, one idempotent seeder shared by `cli.ts` and `setup.seedExamples`, and the repo's first lessons record.

**Out of scope:** every interview, wizard, mapping-table, savings and handoff surface (S-01…S-06); any profile / SaaS-tool / cost / answer / mapping column; applying the migration; enabling `example` or `design_system`; search, widgets, workers, notifications, AI tools or custom entities; any edit to `src/modules/example`, core or enterprise packages.

## Architecture / Approach

Four phases in dependency order, each proving its layer before the next is added, each running its own validation gate rather than deferring to a trailing polish phase:

```text
src/modules.ts  ──►  yarn generate  ──►  generated registries ──► routes, nav, ACL
                                    └─►  yarn db:generate     ──► migration + snapshot (reviewed, not applied)

backend/cases/page.tsx ──► components/CasesTable.tsx ──► /api/mercatify/cases ──► commands/cases.ts ──► InterviewCase
```

Backend pages drop the module id from their route (`/backend/cases`); API routes keep it (`/api/mercatify/cases`). All mutations go through commands so audit, undo, events and cache invalidation share one path.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Module skeleton, ACL and registration | Module is discovered and feature-gated; first `yarn generate` | The repo's first generation run may surface unrelated pre-existing issues |
| 2. Entity and reviewed migration | `InterviewCase` plus migration and snapshot, unapplied | Over-modelling the aggregate and freezing columns against an unspecified demo dataset |
| 3. Commands and CRUD API | Command-mediated writes, locking, typed events, OpenAPI | The stale factory shape typechecks and would pass the gate while failing review |
| 4. Backend page and seeder | Visible, seeded, verifiable admin surface | Rebuilding a bespoke screen where installed admin primitives already do the job |

**Prerequisites:** none — F-01 is the first item. Phases 1–3 need no database. Manual verification in Phase 4 needs Postgres, `mercato init`, and you applying the reviewed migration.
**Estimated effort:** ~2–3 sessions across the four phases; Phase 3 is the largest.

## Open Risks & Assumptions

- **Spec-gate deviation.** `.ai/guides/spec-delivery.md` requires a `.ai/specs/SPEC-xxx` before coding a new capability. By decision this plan is the only planning artifact, so an agent routing strictly by `AGENTS.md` will look for a covering spec and not find one. Revisit if later slices are handed to autonomous spec-driven delivery.
- **Module id `mercatify` is singular.** `src/modules/example/README.md` rule 1 prefers plural `snake_case`. It matches the product and every `change_id`, and `example` itself is singular, but it is a frozen surface — renaming later needs a deprecation bridge.
- **First-ever `yarn generate`.** No baseline exists for what a clean run looks like in this checkout, so Phase 1 may surface pre-existing issues unrelated to Mercatify.
- **Demo dataset content is still unspecified** (roadmap F-01 unknown, owner: user). Placeholder content is sufficient here; S-01 is where it becomes visible.
- **F-02 is being implemented in parallel** (`mercatify-lab-analysis-contract` is now `status: implementing`). The two share no file, but S-02 and S-03 depend on both.
- **Integration coverage starts at zero.** The first integration test is deferred to S-01, so F-01's runtime proof is manual.

## Success Criteria (Summary)

- A trial-tenant admin holding `mercatify.cases.view` opens `/backend/cases` and sees the seeded interview case; a user without the feature is denied and sees no nav entry.
- Every pre-existing OM module, page and API behaves exactly as before, and the diff touches only the new module directory plus one line of `src/modules.ts`.
- `yarn generate && yarn typecheck && yarn lint && yarn ds:check && yarn test && yarn build` is green, with a reviewed migration committed and the database untouched.
