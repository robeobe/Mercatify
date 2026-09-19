# Mercatify Report Pipeline

**Date**: 2026-09-19
**Status**: Draft

> Covering specification for the one continuous path from the client intake form, through the `mercatify-labs` agents, to a single-file HTML consolidation report of the quality frozen in `mercatify-labs/src/__tests__/fixtures/voltix.golden.html`. Amend this file instead of opening a second specification for the report, the intake brief, the capability catalog, or the cash model.

> **Written after part of the implementation, deliberately recorded as such.** `AGENTS.md` Axis 3 classifies this work as `spec-first`: new capability, new data contract, cross-module, multi-phase. That gate was missed — Phase 0 and Phases 1–2 landed as code first (664 tests green across 33 suites, `npm test` in `mercatify-labs`, measured 2026-09-19). This document is therefore **retroactive for the behavior already built and spec-first for everything still open**. Every requirement below carries a status marker: `built`, `partial`, or `open`. Nothing is marked `built` that a test does not currently hold, and because the reporting layer was still being written while this was drafted, the markers are a snapshot of 2026-09-19 rather than a standing claim. The source material is `.claude/plans/mercatify-report-pipeline.plan.md`, but this is not a copy of it: the plan is a two-person schedule, this is the behavior and the contracts.

## TLDR

The intake form and the report are the two ends of a chain with no middle. In between the repository holds three independent, drifted implementations of the same idea, three capability vocabularies, and two flat money models — none of which can produce the numbers the golden report prints. This specification builds the middle inside `mercatify-labs`: one merged catalog, one input gate, a third and *time-phased* money model, and one seam type, `ReportModel`, below which no sentence comes from an LLM and above which no number does. Everything already installed is reused — the catalog lookup, `mapCapabilities`, `computeScenario`, the Migration Planner, the Sandbox Engineer and QA. The smallest coherent outcome is a `--no-llm` run over `fixtures/voltix-brief.json` that produces a correct, complete, prose-free report.

## Problem Statement

A consultant today has a form that collects seven tools and a document that consumes roughly forty fields. The chain between them is broken in four separate places, each independently verifiable in the repository:

1. **Three capability vocabularies.** `assets/stack-tool/catalog.js` carried 62 `CAPS` slugs, 43 `OM_TARGETS` and 14 tools × 88 module rows; `mercatify-labs/src/catalogData.json` carried 7 tools and ~25 free-text keys; `src/modules/mercatify` carries a third shape (`MercatifyMappingRow.target: {kind}`). `mercatify-labs/SPEC.md` §2 iron rule #1 says the catalog is the source of truth — with three catalogs that sentence was not true.
2. **Two flat money models, both wrong for this document.** `computeTotals` (`assets/stack-tool/catalog.js`) computes `ceil(oneOff / monthlySaving)`; `computeScenario` computes `implementationCost / (netAnnualSaving / 12)`. For the Voltix numbers both answer ~10.3 months. The report says month 15, because it asks a different question: not "how many times does the saving fit inside the cost" but "when does the account come back above the line". Neither existing model can draw Figure 2 or the milestone table.
3. **The data gap is on the input side.** The form collects six meta fields plus `{seats, monthly}` per tool. Twelve fields the report prints — tariff plan, unit price, contract end and lock type, evidence kind and evidence note per capability, the cover contact, what was read, the period, the exclusions — are collected nowhere.
4. **Prose and numbers were never separated by anything but a prompt.** `mercatify-labs/SPEC.md` §10 documents a live run in which the FinOps agent wrote "net annual saving is €6,000, with a payback period of 24 months" next to the real, deterministic €21,000 / ~6.9 months. The run survived only because `scenario` never came from the agent — but the wrong sentence still shipped.

## Overview and Success Measures

- **Primary outcome:** `report-cli --brief fixtures/voltix-brief.json --no-llm` produces a single-file HTML document that matches `voltix.golden.html` **section by section**, differing only in prose fields and in a short, explicit list of known deviations.
- **Leading indicators:** the time-phased model reproduces all 25 published points of the golden cash series to the dollar (`cash.test.ts`); the merged catalog carries all 116 tool+slug pairs the browser catalog declares, at the same verdict (`catalogIntegrity.test.ts`); no prose field can carry an unslotted digit (`assertNoFigures.test.ts`).
- **Baseline:** no path from brief to report exists; two flat models answer ~10.3 months where the document says 15; the browser catalog and the engine catalog drifted with nothing comparing them.
- **Market / product reference:** `voltix.golden.html` itself, written by hand as the north star. Adopted: its section order, its per-number "basis" column, and its willingness to print **two** payback numbers and name the difference. Rejected: byte-for-byte reproduction — the golden master contains three arithmetic errors of its own (see Risks R9), so the engine is held to being *right*, not to being *identical*.

## Goals

- **REQ-001** *(built)* — One capability vocabulary. A single catalog is the source of truth; the browser's copy is generated from it, never authored beside it, and a test fails when the two drift.
- **REQ-002** *(built)* — Every value in the report is typed as either a computed fact or an agent-written sentence, and the type makes mixing them impossible. `prose` is wholly optional.
- **REQ-003** *(built)* — A sentence may *display* a number without *authoring* it, through a named slot resolved from `facts`. An unknown slot fails loudly rather than rendering a hole.
- **REQ-004** *(built)* — No prose field reaches the document carrying a figure the engine did not compute.
- **REQ-005** *(built)* — A time-phased cash model produces the exposure floor, the break-even month, the 36-month net and the milestone labels, and the report prints both payback numbers and names the difference between them.
- **REQ-006** *(built)* — The section 02 statement counters are a consultant input, validated against what the engine actually mapped; a gap the engine saw cannot be reported away.
- **REQ-007** *(partial)* — A run with no LLM at all produces a correct, complete report: every table, number and figure, with prose sections omitted rather than rendered empty. *Held at the renderer; not yet reachable as one command.*
- **REQ-008** *(built)* — A run with no costs produces a correct report that says so, instead of drawing a chart of zeroes.
- **REQ-009** *(built)* — The brief is validated, size-capped and rebuilt field by field before any part of it reaches an agent prompt; a `v1` brief upgrades to `v2` without breaking, defaulting evidence to `inferred`.
- **REQ-010** *(built)* — Waves are derived deterministically from mappings, plan hours and contract terms — never proposed by an agent.
- **REQ-011** *(built)* — The rendered document is single-file and self-contained, escapes every value, and is materialized in memory before the first byte is written.
- **REQ-012** *(partial)* — Anything off-catalog is counted, explained in Appendix B, and excluded from every amount. *Counted and explained; the end-to-end exclusion is proved only once assembly exists.*
- **REQ-013** *(open)* — One renderer serves the engine, the console preview and the client-facing copy. No surface re-implements the document.
- **REQ-014** *(open)* — The report joins the Critic's stage contracts as an advisory eighth stage; its verdict changes no number and no exit code.

## Non-goals

- A real backend replacing `localStorage` for the mockup handoff; deployment; authentication. The mockups stay mockups.
- Changing `computeScenario.netPaybackMonths`. The flat model is not wrong, it answers a different question, and it stays untouched.
- Changing `MercatifyLabPort` in `src/modules/mercatify`. Phase 4 maps `ReportModel` onto the existing port; it does not redefine it.
- Making `drop` a sixth `Decision`. It lives in the report layer only (see Design Decisions).
- A byte-for-byte snapshot test against the golden master.
- Giving any new agent web access. `web_search` stays scoped to the Catalog Curator (`mercatify-labs/SPEC.md` §11, "On web search generally").

## Proposed Solution

One type, `ReportModel` (`mercatify-labs/src/report/model.ts`), is the seam for the whole pipeline. Below it sit pure functions that produce `facts`; above it sit agents that produce `prose`; the renderer is a pure function of both. The same seam is the division of labour between the two people building it — one owns every number, the other owns every sentence — and in no phase do they edit the same file.

The engine reuses what exists rather than growing a parallel stack: the catalog lookup and `mapCapabilities` classify, `computeScenario` keeps answering the build-only payback question, the Migration Planner supplies hours, `attachEffortHours` injects them without touching `implementationCost`, and the Sandbox Engineer plus QA supply section 07. The genuinely new deterministic pieces are three: `groupIntoWaves`, `computeCashSeries`, and the statement counters.

The renderer is a pure function, not an agent, and the precedent is already binding in this repository: the Sandbox Engineer *selects and fills* templates and never writes HTML, and `src/sandboxEngineer.ts` explains why the agent is not even shown `scenario`. The report renderer copies that shape one-to-one.

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| The browser catalog becomes canonical and the engine adopts it | It is the richer of the two: 14 tools × 88 module rows with verified Open Mercato target names, against 7 tools of free text | Merge the other way | Loses 7 tools and 33 targets and keeps free-text targets |
| `drop` lives in the report layer as `ReportVerdict = Decision \| 'drop'`, with the catalog storing `decision: "native"` plus `reportVerdict: "drop"` | `drop` appears in 2 of 88 module rows; a sixth `Decision` would move every exhaustive `switch`, the Critic's MAP-1 rule, and the `decision` enum in every `agents/*.json` | Add a sixth `Decision`; or fold `drop` into `native` | The first is a wide change for two rows; the second writes a falsehood into the report — `native` claims "the platform covers this", `drop` means "nobody would notice it was gone" |
| The renderer is a pure function in `mercatify-labs/src/report/` | Labs has zero dependency on Open Mercato and `SPEC.md` §1 says it stays that way; the app module only calls it | Put it in `src/modules/mercatify/` | Breaks that promise and makes the document unreachable from the CLIs |
| Prose carries numbers **through slots**, not literally | The original "prose contains no numbers" rule was wrong on product grounds: 9 of the golden report's 11 prose fields carry a number, and those are the sentences that make it readable. A sentence without a number reads as evasion | Relax the guard and trust the prompt | Gives back the guarantee that `SPEC.md` §10 exists to protect |
| The no-figures guard is an **allowlist** of where a digit may appear | See Risks R10 — the denylist version passed the exact bug it was written for | Keep extending the forbidden-shape patterns | A denylist can always be rephrased around; an allowlist cannot |
| A third, time-phased money model is added; the two flat ones stay | The three answer three different questions and the report prints two of them side by side under "Two payback numbers, and why they differ" | Replace the flat models | Two products already depend on them, and neither is wrong |
| Section 02 statement counts are a consultant input with validation gates | "38 usage statements" comes from a 62-minute call and seven invoices, not from the tool list; deriving it from mappings gives a different, smaller number (15 for Voltix) | Derive it | Would print a number that contradicts the discovery it claims to summarize |
| `prose` is optional in its entirety | `SPEC.md` §8 requires a run with no LLM to still be a *correct* report | Require prose | Would make the no-LLM path produce a broken document |
| The golden master is compared **section by section**, with a written list of accepted deviations | The golden contains three arithmetic errors; a correct engine must diverge from it in exactly those places and nowhere else | Byte-for-byte snapshot | Would force the engine to reproduce known-wrong numbers |

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| `facts` | Every value computed by a pure function. No field originates in a model response. The renderer formats these, never recomputes them — not even a multiplication by twelve | `ReportModel.facts` (`src/report/model.ts`) | A sum the renderer would have to compute is a missing field, not a licence to compute it |
| `prose` | Every sentence written by an agent. The whole object and every field inside it are optional | `ReportModel.prose` | Absent prose omits its section; it never renders an empty block |
| Slot | `{path}` inside a prose string, replaced by the renderer with a formatted value from `facts`. Allowed shapes, exhaustively: `kpis.<f>`, `cash.<f>`, `counts.<f>`, `meta.<f>`, `company.<f>`, `stack.<tool>.<f>`, `wave.<n>.<f>` | `src/report/slots.ts` | An unknown slot **throws**. A silent hole in a sentence about money is worse than a loud error |
| Bare figure | Any digit in a prose field that is neither inside a slot nor directly after a label word (`wave`, `phase`, `step`, `section`, `appendix`, `rule`, `risk`, `figure`, `table`) | `src/report/assertNoFigures.ts` | Throws, naming the field path. The author adds a fact and a slot, or writes the quantity in words |
| Wave | A contiguous block of migration work: week range, hours, scope items, the tools it switches off or reduces, the monthly amount it banks, and the month that amount starts arriving | `Wave` (`src/report/model.ts`), produced by `groupIntoWaves` | Derived, never proposed by an agent |
| Tool goes dark | A tool is removed only when **every** one of its mapped capabilities resolved to `native`, `configure` or `build`. A single `integrate` or `keep` keeps the whole subscription | `computeScenario` — the one rule, extracted, not copied a third time | A half-cancelled SaaS contract does not exist |
| `bankedFromMonth` | The month a wave's saving starts arriving: the month **after** the wave's spend window ends | `planWaveSpendWindows` (`src/report/cash.ts`) | Must equal `endMonth + 1` for every wave; asserted against the golden |
| Programme timing | Programme length is `ceil(totalWeeks / 4)` months; a wave ends in month `round(itsLastWeek / totalWeeks × programmeLength)`; a wave starts spending the month after the previous one ends; hosting is charged from month 1 | `src/report/cash.ts` | This rule, and only this rule, reproduces `−14,967 @ M6` and break-even at M15 |
| `maxExposure` | The lowest cumulative position over the horizon, and the month it falls in | `CashSeries` | — |
| `breakEvenMonth` | First month whose cumulative position is above zero, or `null`. Never `Infinity`: `JSON.stringify(Infinity)` is a silent `null` | `CashSeries` | `null` is a real answer — "does not pay back inside two years" |
| Two payback numbers | `buildOnlyMonths` is flat and agrees with `computeScenario.netPaybackMonths`; `programmeMonths` comes from the time-phased model and is larger. Both are printed and the difference is named | `Paybacks` (`src/report/model.ts`) | Printing one alone is the defect, not the discrepancy |
| `hoursAreFloor` | `true` when any `build` row in that wave has no hour estimate. The total is then a lower bound, printed as such, and the row prints "to estimate" | `Wave`, `ImplementationLine`, `MoneyTable.totalHoursAreFloor` | A floor is never presented as a quote |
| Statement counts | `statements = matched + offCatalog`. `statements` may exceed what the form lists — discovery finds more statements than capabilities — but never fewer, and `offCatalog` may exceed what the engine found but never undercut it | `resolveStatementCounts` (`src/report/counts.ts`) | Throws, naming which gate failed and by how much |
| `EvidenceKind` | `observed` \| `inferred` \| `estimated`, per capability row. The credibility core of the coverage table | brief input, carried to `CoverageRow` | A `v1` brief defaults to `inferred` — never `observed`, which would be inventing evidence |
| Off-catalog | `evidence === 'not in catalog'` — the exact string `mapCapabilities` writes on its fallback path | `OFF_CATALOG_EVIDENCE` (`src/report/counts.ts`), shared with `findCatalogGaps` | Counted in section 02, listed in Appendix B, excluded from every amount |
| Paid twice | A capability covered by more than one tool, with the combined monthly spend across them. The report says "paid twice", not "done twice" | `PaidTwiceRow` | — |
| `recurringTotal` | The recurring table's footer row, an **explicit optional field** — the renderer may not sum a money column, because a sum is a new number | `MoneyTable` | Absent → the table renders without a `<tfoot>` |

## Users, Permissions, and Scope

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Client | Fills the intake form, sees the report that was explicitly sent to them | Their own case only | N/A — static mockup (`assets/client/`), no auth in scope |
| Consultant | Runs the pipeline, edits the agent's mapping, rebuilds, sends | Their own cases | N/A — static mockup (`assets/console/`) |
| Engine operator | Runs the CLIs against a local brief file | Filesystem, local LLM endpoint | N/A — a Node package, no actor model |

**Tenant and organization scope: N/A for `mercatify-labs`.** The package is a dependency-free Node library plus CLIs; it has no request context, no database and no notion of a tenant, and `SPEC.md` §5 is explicit that persistence is host-owned. Trusted `tenantId` / `organizationId` derivation belongs to `src/modules/mercatify` and is out of scope for Phases 0–3. **Phase 4 does not change this** as long as it only calls `renderReport` from existing surfaces; the moment it persists a `ReportModel` against `InterviewCase`, scope derivation and fail-closed reads become a requirement of that phase and this section must be amended first (see Q-004).

No legitimate system-scope (`organizationId: null`) operation is proposed.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Capability → platform decision | Reuse | `mercatify-labs` catalog | `getCatalogCapability` + `src/catalogAliases.ts` | Iron rule #1; the alias table is a finite map, never a fuzzy match |
| Capability mapping | Reuse unchanged | `mapCapabilities` | pure call | Its off-catalog fallback is what keeps a run honest |
| Build-only payback | Reuse unchanged | `computeScenario` | pure call | Answers a different question; stays as the first of the two payback numbers |
| Effort hours | Reuse | Migration Planner + `attachEffortHours` | `MigrationPlanResult` → `Wave.scope[].estimatedHours` | Hours never reach `implementationCost` (`SPEC.md` §11.2) |
| Section 07 preview claims | Reuse | Sandbox Engineer + QA + `verifyGoldenPath` | `PreviewFacts` | Already built; the report only reads their verdict |
| Appendix B gaps | Reuse | `findCatalogGaps` + `proposeCatalogEntry` | `ReportGap` / `ProseGap` pairing by `gapId` | The Curator stays outside the pipeline and its output stays human-reviewed |
| Browser catalog copy | Generated | `scripts/generate-browser-catalog.mjs` → `assets/shared/catalog.generated.js` | build artifact | A copy, never a second source |
| Waves, cash series, counts, slots, guard, renderer | App-owned (new) | `mercatify-labs/src/report/` | `ReportModel` | The three functions no existing engine provides |
| Brief ingestion | App-owned (new) | `mercatify-labs/src/intake/` | `StackBrief` → `ConsolidationRequest` | The only gate between a client file and a prompt |
| Console / client surfaces | Reuse | `assets/console/`, `assets/client/` | call `renderReport`; `mapped` remains the gate | One renderer, not two |
| Open Mercato persistence | Reuse, unchanged | `src/modules/mercatify` | `MercatifyLabPort` | Not redefined by this spec |

**Extension-surface traceability: N/A — this specification adds no Open Mercato runtime or discovery extension surface.** Phases 0–3 live entirely inside the standalone `mercatify-labs` package and the static `assets/` mockups; no module contributes a route, page, menu entry, subscriber, enricher, entity or ACL feature. If Phase 4 changes `src/modules/mercatify`, each added surface gets its own row here, with its reference capability ID, the exact `src/modules/example/**` file it adapts, its phase, its own integration test and one mechanism classification — and that amendment precedes the code.

## Architecture and Data Flow

```text
assets/*/intake.html ──StackBrief v2──► localStorage (mercatify.case.v1)
                                              │  new → mapping → mapped → sent
                                              ▼
                       ┌── mercatify-labs (Node / TS, no host dependency) ──┐
                       │  fromBrief()          StackBrief  → ConsolidationRequest
                       │  Orchestrator.run()               → ConsolidationResult
                       │  planMigration + attachEffortHours
                       │  groupIntoWaves()     ── pure
                       │  computeCashSeries()  ── pure   ★ the third money model
                       │  resolveStatementCounts(), findCatalogGaps()
                       │  generatePreview + verifyGoldenPath
                       │  report_editor / report_risk_analyst / curator  ── prose only
                       │  assertNoFigures(prose)
                       │  critique('report', model)      ── advisory
                       └───────────────────► ReportModel { facts, prose? } ──┘
                                                       │
                                        renderReport() ── pure ──► writeReport()
                                                       ▼
                                          one self-contained .html
                                    ┌──────────────────┴──────────────────┐
                                    ▼                                     ▼
                          assets/console/report.html            assets/client/offer.html
                          (preview + Send)                      (what the client sees)
```

- **Module boundaries:** `mercatify-labs` owns computation and rendering and has no host dependency; `assets/` owns presentation and the case state machine; `src/modules/mercatify` owns durable records. The report crosses these boundaries only as `ReportModel` and as rendered HTML.
- **Extension points:** none in the Open Mercato sense (see above). Inside the package the extension point is the agent descriptor plus typed-wrapper pattern (`SPEC.md` §11.3): descriptor → validating wrapper → fake-client test → live example.
- **Alternatives considered:** letting an agent render the document, and letting an agent propose waves. Both were rejected on the precedent already written into `src/sandboxEngineer.ts`.
- **Compatibility:** `computeScenario`, `mapCapabilities`, the five `Decision` values, `MercatifyLabPort` and the `mercatify.case.v1` localStorage key all keep their current behavior. `StackBrief v1` keeps loading.

## User Journeys

### Journey J-001 — Consultant produces a report from a submitted brief

1. Consultant opens a case that reached `mapped` in the console.
2. Runs the pipeline against the stored brief. `fromBrief` validates it, rebuilds it field by field, and refuses anything over the size ceilings before a single byte reaches a prompt.
3. Deterministic core maps capabilities, computes the scenario, groups waves, computes the cash series and the counters. Agents write prose with slots but no numbers.
4. `assertNoFigures` runs over the prose; `critique('report', …)` reports advisory objections that change nothing automatically.
5. `renderReport` produces one self-contained HTML file; `writeReport` materializes it fully in memory, then writes it refusing to follow a symlink.
6. Failure paths: an unreachable LLM endpoint exits 2 before any work; a model that breaks its schema exits 3 and **no partial report is written**; a bad brief exits 1 naming the field path.

### Journey J-002 — The same report with no LLM at all

1. Consultant runs with `--no-llm`.
2. Every table, every number and both figures are produced. Sections that exist only to carry sentences — the recommendation, section 01, sections 08 and 09, and "our read" in Appendix B — are **omitted, not blank**.
3. The document is still a correct report. This is the behavior `SPEC.md` §8 requires and it is the acceptance path for the whole engine.

### Journey J-003 — Consultant corrects the agent's mapping and rebuilds

1. Consultant edits rows in the console; the agent's original pass stays visible as the starting point and the edits are marked.
2. `Confirm mapping` rebuilds the report from the **confirmed** mapping, **without** re-running any agent: every number is deterministic, so recomputation is free.
3. Regenerating after a send bumps `v1.0 → v1.1`; the client keeps seeing the previously sent version until it is deliberately sent again.

### Journey J-004 — Client receives the document

1. Client opens the sent report in a browser or a mail client.
2. The document renders completely with no external request of any kind — no `<link>`, no `<img>`, no `<iframe>`. The optional inline script only adds tooltips, a theme toggle and a print button; stripped, the document still carries every number.

## UI and Interaction Contracts

**No Open Mercato backend route is added or changed by this specification.** The three surfaces below are static mockup pages under `assets/`, outside the admin shell, with no `DataTable`, no `CrudForm`, no shared API helpers and no server data source — they read `localStorage`. Recording them here as if they were `/backend/*` pages would misrepresent what is being built. `.ai/guides/backend-ui.md` and `om-backend-ui-design` therefore do not gate Phases 0–3, and the moment any of this moves into `src/modules/mercatify` as an admin page, that work is a separate phase which invokes both first (Q-004).

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| `assets/console/report.html` | Build report, preview, Send | `localStorage` case; calls `renderReport` | `assets/console/modules.html` (same mockup family) | N/A — static mockup outside the admin shell | loading, no-costs, no-LLM, blocked-QA, error, sent | REQ-013 |
| `assets/client/offer.html` | Read the sent document | the same rendered HTML | `assets/client/request.html` | N/A — static mockup | not-yet-sent, superseded-version, error | REQ-013 |
| `assets/stack-tool/report.html` | Replace its own `build()` with `renderReport` | `localStorage` case | itself | N/A — static mockup | same as console | REQ-013 |
| The rendered document | Read, print, share by email | none — self-contained | `mercatify-labs/src/preview/templates.ts` | own `reportStyle.ts` constant | script-stripped, print, light, dark | REQ-011 |

### UI architecture

| Role | Navigation groups in order | Dashboard / injected widgets | Login-to-primary-task flow |
|---|---|---|---|
| Consultant | Requests → case → Modules → Report | none | requests → case → Build report (3 clicks) |
| Client | Request → Offer | none | request → offer (2 clicks) |

| Surface / widget | Empty state guidance and action | Responsive behavior | Keyboard / focus behavior |
|---|---|---|---|
| Console report | Before `mapped`: explains the gate and links to Modules | single column below the table breakpoint | Build and Send reachable by tab; Send confirms destructively |
| Client offer | Before send: "your consultant is still preparing this" | single column | link-only |
| Rendered document | N/A — a document is never empty; missing inputs produce a named statement, not a gap | tables scroll horizontally; figures scale with the viewport | native document order; print stylesheet |

### The rendered document — structure

```text
┌────────────────────────────────────────────────────────────┐
│ Cover: case id, version, issued, valid until, both parties │
│ The recommendation in one sentence            [prose+slot] │
├────────────────────────────────────────────────────────────┤
│ 01 Executive summary — numbered findings      [prose]      │
│ 02 What this analysis is based on + counters  [facts+prose]│
│ 03 Your stack today (table)                   [facts]      │
│ 04 Coverage + Figure 1 (verdict counts)       [facts]      │
│ 05 The money + Figure 2 (cash series)         [facts]      │
│ 06 Sequence — waves                           [facts+prose]│
│ 07 Your preview (QA verdict)                  [facts+prose]│
│ 08 Risks and assumptions                      [prose]      │
│ 09 What happens next                          [prose]      │
│ Appendix A verdict glossary · Appendix B off-catalog       │
└────────────────────────────────────────────────────────────┘
```

- **Behavior:** section markers are emitted into the HTML so a human reading the file can answer "where did this number come from", and so the golden comparison can run per section. Both figures are inline SVG generated from the number series, never transcribed. Section 05 is assembled from two templates in one `<section>`: the tables stand on `facts.money`, the chart on `facts.cash`, and only the chart disappears when costs are absent.
- **Responsive and accessibility:** the document reads in source order; figures carry their data in an adjacent milestone table so the chart is never the only carrier of a number.
- **Localization:** the document is authored in the client's language by the prose agents; formats (currency symbol and its position — PLN is a suffix — and long dates) are decided by `src/report/format.ts` from `company.currency`.
- **Design-system and theming:** the document has its own stylesheet constant with a `prefers-color-scheme` dark variant, deliberately independent of the app design system, because it is a file that leaves the product.

## Data Models

`mercatify-labs` persists nothing. The shapes below are in-memory contracts; durable storage stays host-owned (`SPEC.md` §5).

### `ReportModel`

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `facts` | `ReportFacts`, required | — | contains client cost data | every field computed by a pure function |
| `prose` | `ReportProse`, optional | — | no | every field optional; `assertNoFigures` before the model is built |

### `ReportFacts`

| Field | Type / nullability | Notes |
|---|---|---|
| `meta` | required | case id, version, issued, validUntil, both parties, `humanReviewed`, `runMinutes?` |
| `company` | required | name, industry, employees, ISO 4217 currency |
| `basis` | required | `readWhat`, `period`, `exclusions`, `counts: {statements, matched, offCatalog}` |
| `kpis` | required | six tiles; **money fields are `null`, never `0`, when costs are absent** |
| `stack` | required | `StackRow[]` with plan, category, seats, unit price, monthly, annual, `termEnds`, `termType` |
| `coverage` | required | `CoverageRow[]` + `byVerdict: VerdictCounts` + `paidTwice: PaidTwiceRow[]` |
| `money` | required | recurring lines each with a mandatory `basis`, implementation lines per wave, `paybacks`, optional `recurringTotal` |
| `cash` | optional | absent when costs or the rate were not provided |
| `waves` | required | possibly empty — "every tool earns its place" is a valid report |
| `preview` | optional | absent for a run with no preview |
| `glossary` | required | verdict definitions and the three rules — constants, not run data |
| `gaps` | required | identity of each catalog gap; its prose lives in `prose.gaps`, paired by `gapId` |

Invariants worth stating explicitly, because each one was a real defect or a near miss: `CoverageRow.monthly` may be `null` (not given) or the literal `'included'` (a second row of the same invoice); `Wave.monthlyBanked` is `null` rather than `0` when costs are absent; `CashSeries.breakEvenMonth` is `null` rather than `Infinity`; `CashSeries.figureMonths` separates the horizon the series *computes* (36) from the horizon the chart *draws* (24), because that is a presentation choice and belongs to the model, not to the renderer.

### `StackBrief` (v1 and v2)

| Field | Type / nullability | Lifecycle and validation |
|---|---|---|
| `v` | `1 \| 2`, required | `SUPPORTED_BRIEF_VERSIONS`; anything else is refused by name |
| `kind` | `'mercatify-brief'`, required | the only accepted discriminator |
| `company`, `currency`, `contact?` | required / optional | cover fields |
| `readWhat?`, `period?`, `exclusions?` | optional | section 02 |
| `tools[]` | required, size-capped | `plan?`, `seats`, `unitPrice?`, `monthly`, `termEnds?`, `termType?` |
| `tools[].modules[]` | required, size-capped | `caps[]`, `evidenceKind`, `evidenceNote` |

`v1 → v2` upgrade: a brief with no declared evidence gets `inferred`. Not `observed` — that would invent the evidence the column exists to protect — and not `estimated`, because nobody estimated anything. `costs.omOperatingCost` and `costs.implementationCost` are **not** read from the brief; they are consultant inputs and are a separate argument to the function, so a client file can never set them.

## API, Command, and Error Contracts

`mercatify-labs` exposes functions and CLIs, not HTTP routes. Exit codes follow the contract already established by `bin/preview-cli.ts` and `bin/critic-cli.ts`.

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| function | `normalizeBrief(unknown)` | none | a brief from a browser or a file | `NormalizedBrief` | throws naming the field path (`tools[2].modules[0].caps[1]`) and the size ceiling | REQ-009 |
| function | `fromBrief(brief, costs)` | none | normalized brief + consultant costs | `ConsolidationRequest` | throws before anything reaches a prompt | REQ-009 |
| function | `groupIntoWaves(input)` | none | mappings, plan, stack, terms | `Wave[]` | throws on a contradiction between terms and ordering | REQ-010 |
| function | `computeCashSeries(waves, opts)` | none | waves, rate, hosting, horizon | `CashSeries` | rejects duplicate wave numbers, `NaN`/negative hours, backwards waves, nonsense horizons | REQ-005 |
| function | `resolveStatementCounts(mappings, provided?)` | none | mappings + optional consultant counts | `StatementCounts` | throws naming which of the three gates failed | REQ-006 |
| function | `resolveProseSlots(prose, facts)` | none | prose + facts | prose with values substituted | throws on an unknown slot path | REQ-003 |
| function | `assertNoFigures(prose)` | none | prose | `void` | throws with the field path and the offending fragment | REQ-004 |
| function | `renderReport(model)` | none | `ReportModel` | HTML string | throws before assembling anything | REQ-011 |
| function | `writeReport(html, dir)` | none | rendered HTML | written path | refuses to follow a symlink (`O_NOFOLLOW` + `lstat`) | REQ-011 |
| CLI | `bin/report-cli.ts --brief <f> --out <d> [--no-llm]` | none | brief file | 0 + written report | 1 bad input, 2 endpoint unreachable, 3 model broke its contract; **never a partial file** | REQ-007, REQ-011 |
| CLI | `bin/critic-cli.ts --stage report --artifact <f>` | none | a `ReportModel` | 0 + advisory verdict as JSON | exit code never depends on the verdict | REQ-014 |

`src/index.ts` stays the public surface; new report exports are added there only when the report path is complete, and adding them is a contract-surface change that reads `.ai/guides/upstream/BACKWARD_COMPATIBILITY.md` first.

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| Catalog edited | `src/catalogData.json` | `npm run catalog:generate` | regenerates `assets/shared/catalog.generated.js` | idempotent; `catalogIntegrity.test.ts` fails when the copy is stale |
| Mapping confirmed | console | report build | report rebuilt from the confirmed mapping | **no agent re-run**; deterministic, so recomputation is free |
| Report regenerated after send | console | client surface | document version `v1.0 → v1.1` | reopening a sent mapping does not un-send it; the client keeps the sent version until a deliberate resend |
| Off-catalog capability seen | `mapCapabilities` | `findCatalogGaps` → `proposeCatalogEntry` | a human-reviewed catalog proposal | never applied automatically (iron rule #4) |

No Open Mercato events, subscribers, workers, schedulers or notifications are added.

## Security, Privacy, and Compliance

- **Authorization:** N/A inside the package — no actors, no features, no records. The mockups have no auth and that is a stated non-goal.
- **Tenant isolation:** N/A for Phases 0–3; the package has no request context. Becomes a requirement of any phase that persists a report against `InterviewCase` (Q-004).
- **Sensitive data:** the brief carries a client's real invoices and contract dates. It is size-capped, rebuilt field by field so unknown keys never reach a prompt, and the rendered document is **self-contained with no external resource** — a `<link>` or `<img>` in a document that leaves the company tells the sender who opened the pricing and when.
- **Abuse and failure modes:** HTML escaping on every rendered value; `<` escaped inside the JSON embedded in `<script>`, because `"</script>"` in a milestone label would close the block and spill the rest of the document onto the page as markup, and HTML entities are not decoded inside JavaScript; symlink refusal on write (CWE-59); size ceilings before the prompt; every model result validated field by field and rebuilt, never `as`-cast, with each field read exactly once into a local constant; `web_search` reachable by one agent only.

## Integration Coverage

The 22 scenarios below are the plan's §7 list restated as testable requirements, plus three that the build surfaced. Each is a self-contained test with no network.

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-001 | integration | `voltix-brief.json` | full run | report matches the golden section by section apart from prose and the listed deviations | REQ-002, REQ-013 |
| TEST-002 | unit | brief with empty `seats`/`monthly` | build | tables, verdicts and waves present; money KPIs and Figure 2 absent; section 05 states that costs were not supplied | REQ-008 |
| TEST-003 | integration | `voltix-brief.json`, `--no-llm` | build | every number, table and figure present; sections 01, 08, 09 and "our read" **omitted, not empty** | REQ-007 |
| TEST-004 | unit (fake client) | model returns malformed prose | build | validator throws naming the field; numbers untouched; exit 3; **no partial file written** | REQ-004, REQ-011 |
| TEST-005 | unit | prose containing a literal figure | `assertNoFigures` | throws — the regression oracle for the `SPEC.md` §10 defect | REQ-004 |
| TEST-006 | unit | hosting outruns the saving | `computeCashSeries` | `breakEvenMonth === null`; the series never crosses zero; the caption says it does not pay back inside two years | REQ-005 |
| TEST-007 | unit | nothing to build | build | no fourth wave; `hours === 0`; the section says it is all configuration | REQ-010 |
| TEST-008 | unit | every tool retained | build | "every tool earns its place"; no waves; the report is still useful | REQ-010 |
| TEST-009 | unit | a `build` row with no estimate | build | the row prints "to estimate"; the total is marked a floor, not a quote | REQ-010 |
| TEST-010 | integration | a tool absent from the catalog | build | appears in Appendix B; excluded from every amount; the Curator supplies "our read" | REQ-012 |
| TEST-011 | unit | a known tool, an unknown capability | map + build | `build` / `low` / `not in catalog`; counted in the off-catalog total | REQ-012 |
| TEST-012 | unit | two tools covering one capability | build | a "paid twice" row with the combined monthly spend | REQ-002 |
| TEST-013 | unit | `currency: PLN` | format | `1 234 zł` as a suffix, not `zł1234` | REQ-011 |
| TEST-014 | unit | a brief with no tools | `fromBrief` | refused, exit 1 | REQ-009 |
| TEST-015 | unit | an annual term ending mid-programme | `groupIntoWaves` | that tool's wave closes before the term end, or the conflict is raised for section 08 | REQ-010 |
| TEST-016 | integration | QA returns `blocked` | build | section 07 names the golden-path step where the preview stops; **exit 0** — a verdict is a result, not a failure | REQ-007 |
| TEST-017 | E2E | consultant edits the mapping | confirm + rebuild | the report is rebuilt from the confirmed mapping, edits marked, **no agent re-run** | REQ-013 |
| TEST-018 | E2E | a sent report regenerated | rebuild + send | `v1.0 → v1.1`; the client sees the old version until a deliberate resend | REQ-013 |
| TEST-019 | unit | a `v1` brief | `normalizeBrief` | upgrades to `v2`; evidence defaults to `inferred`; nothing breaks | REQ-009 |
| TEST-020 | unit | unreachable LLM endpoint | CLI preflight | exit 2 with a message naming the server and `LLM_BASE_URL` | REQ-007 |
| TEST-021 | security | `--out` is a symlink | `writeReport` | refused (CWE-59) | REQ-011 |
| TEST-022 | security | a 10 MB brief | `normalizeBrief` | refused **before** the prompt, naming the ceiling | REQ-009 |
| TEST-023 | unit | the golden cash series | `computeCashSeries` | all 25 published points to the dollar, every `bankedFromMonth`, the exposure floor, the break-even month and the 36-month net | REQ-005 |
| TEST-024 | unit | browser catalog vs. canonical JSON | integrity | all 116 shared tool+slug pairs agree on target, verdict and confidence; the generated copy is byte-identical to a fresh generation | REQ-001 |
| TEST-025 | unit | consultant counts below the engine's floor | `resolveStatementCounts` | throws; a gap the engine saw cannot be reported away | REQ-006 |

## Implementation Phases

Phases are dependency ordered and carry their real state as of 2026-09-19. Phases marked `landed` were built before this specification existed; they are recorded here so the remaining phases have a truthful starting point, not to imply they were spec-first.

### Phase 0 — The `ReportModel` contract · **landed**

- **Depends on:** none
- **Outcome:** one type and two fixtures, so both halves of the work can point at where every row of the report lives
- **Why this order / value delivered:** without the seam the two halves drift by a week
- **Deliverables:** `src/report/model.ts`; `fixtures/voltix.golden.html`; `fixtures/voltix-brief.json`; `fixtures/voltix.reportmodel.json`
- **Independent slices / estimated commits:** one
- **Requirements closed:** REQ-002
- **Tests:** TEST-001 (fixture only at this stage)
- **Validation:** `npm run typecheck`
- **Exit gate:** every row of the golden report has a named home in the model — **met**

### Phase 1 — One catalog, one input shape, one renderer · **landed**

- **Depends on:** Phase 0
- **Outcome:** a single capability vocabulary, a validated brief, and a renderer that turns a hand-written model into the document
- **Why this order / value delivered:** the catalog merge is the largest single risk in the plan and everything downstream reads its verdicts
- **Deliverables:** merged `catalogData.json` (18 tools, 128 capability entries); `src/catalogAliases.ts`; `scripts/generate-browser-catalog.mjs`; `src/intake/fromBrief.ts`; `src/report/renderReport.ts` + `templates/` + `reportStyle.ts` + `writeReport.ts`
- **Independent slices / estimated commits:** catalog merge; brief gate; renderer — no shared files
- **Requirements closed:** REQ-001, REQ-009; REQ-011 partially
- **Tests:** TEST-014, TEST-019, TEST-021, TEST-022, TEST-024
- **Validation:** `npm test`, `npm run typecheck`, `npm run catalog:generate`
- **Exit gate:** the browser copy regenerates byte-identically and no shared pair drifts — **met**; the renderer is held to the golden master section by section, by visible text, with a `KNOWN_DEVIATIONS` list that fails in both directions (`src/__tests__/renderReport.test.ts`) — **met**

### Phase 2 — Money in time, counters, guard, prose agents · **landed**

- **Depends on:** Phase 1 exit gate
- **Outcome:** the report's numbers exist and no sentence can carry one the engine did not compute
- **Why this order / value delivered:** the time-phased model is the single thing neither existing engine can do, and it is what makes Figure 2 and the milestone table possible at all
- **Deliverables:** `src/report/cash.ts`, `waves.ts`, `counts.ts`, `slots.ts`, `assertNoFigures.ts`, `format.ts`, `glossary.ts`; the three prose agents in `agents/` with their typed wrappers in `src/reportProse.ts` — deliberately outside `src/report/`, which stays the deterministic core — and fake-client tests
- **Independent slices / estimated commits:** cash + waves; counts + slots + guard; the three agents
- **Requirements closed:** REQ-003, REQ-004, REQ-005, REQ-006, REQ-008, REQ-010
- **Tests:** TEST-005, TEST-006, TEST-007, TEST-008, TEST-009, TEST-012, TEST-013, TEST-015, TEST-023, TEST-025
- **Validation:** `npm test`, `npm run typecheck`
- **Exit gate:** the cash series reproduces the golden to the dollar — **met**; the three prose agents exist, accept slots in their schemas and are covered by fake-client tests — **met**

### Phase 3 — Assembly · **open**

- **Depends on:** Phase 2 exit gate
- **Outcome:** one command turns a brief into a document
- **Why this order / value delivered:** this is the first point at which the pipeline has business value outside a test
- **Deliverables:** `src/report/buildReport.ts`; `bin/report-cli.ts`; the `report` stage in `src/critic/stageContracts.ts` with rules REP-1…REP-5
- **Independent slices / estimated commits:** orchestration; CLI; critic stage
- **Requirements closed:** REQ-007, REQ-012, REQ-014; REQ-011 completed
- **Tests:** TEST-001, TEST-002, TEST-003, TEST-004, TEST-010, TEST-011, TEST-016, TEST-020
- **Validation:** `npm test`, `npm run typecheck`, then `npx ts-node bin/report-cli.ts --brief src/__tests__/fixtures/voltix-brief.json --out ./report-out --no-llm`
- **Exit gate:** that command produces a file differing from the golden only in prose fields and the listed deviations

### Phase 4 — Back to the browser · **open**

- **Depends on:** Phase 3 exit gate
- **Outcome:** the consultant and the client see the same document the engine produced
- **Why this order / value delivered:** the pipeline reaches its actual users
- **Deliverables:** `assets/console/report.html` build/preview/Send with `mapped` still the gate; `assets/client/offer.html`; `assets/console/modules.html` edit marking and rebuild-without-rerun; `assets/stack-tool/report.html` switched from its own `build()` to `renderReport`; the pages switched from their private catalog copy to the generated one
- **Independent slices / estimated commits:** console; client; stack-tool
- **Requirements closed:** REQ-013
- **Tests:** TEST-017, TEST-018
- **Validation:** `npm test`; if `src/modules/mercatify` is touched, also `yarn generate && yarn typecheck && yarn lint && yarn ds:check && yarn test && yarn build` and `yarn test:integration:ephemeral`
- **Exit gate:** all three surfaces render from one renderer, and no page reads a hand-maintained catalog copy

### Phase 5 — Closing · **open**

- **Depends on:** Phase 4 exit gate
- **Outcome:** the repository's own documentation matches the repository
- **Deliverables:** `assets/README.md` and `mercatify-labs/SPEC.md` brought back in line; this specification's status resolved; the lesson record
- **Requirements closed:** none new
- **Tests:** the full scenario list green
- **Validation:** `node scripts/check-lessons.mjs`; the full gate above
- **Exit gate:** no document in the repository claims something the code does not do

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-001 | J-001 | `catalogData.json`, `catalog.generated.js` | Phase 1 | TEST-024 | AC-001 |
| REQ-002 | J-001, rendered document | `ReportModel` | Phase 0 | TEST-001, TEST-012 | AC-002 |
| REQ-003 | J-001 | `resolveProseSlots` | Phase 2 | TEST-005 (paired) | AC-003 |
| REQ-004 | J-001 | `assertNoFigures` | Phase 2 | TEST-004, TEST-005 | AC-003 |
| REQ-005 | J-001, section 05 | `computeCashSeries`, `Paybacks` | Phase 2 | TEST-006, TEST-023 | AC-004 |
| REQ-006 | J-001, section 02 | `resolveStatementCounts` | Phase 2 | TEST-025 | AC-005 |
| REQ-007 | J-002 | `report-cli --no-llm` | Phase 3 | TEST-003, TEST-016, TEST-020 | AC-006 |
| REQ-008 | J-001 | `ReportKpis`, `CashSeries?` | Phase 3 | TEST-002 | AC-007 |
| REQ-009 | J-001 | `normalizeBrief`, `fromBrief` | Phase 1 | TEST-014, TEST-019, TEST-022 | AC-008 |
| REQ-010 | J-001, section 06 | `groupIntoWaves` | Phase 2 | TEST-007, TEST-008, TEST-009, TEST-015 | AC-009 |
| REQ-011 | J-004 | `renderReport`, `writeReport` | Phase 1 → 3 | TEST-004, TEST-013, TEST-021 | AC-010 |
| REQ-012 | J-001, Appendix B | `findCatalogGaps`, `ReportGap` | Phase 3 | TEST-010, TEST-011 | AC-011 |
| REQ-013 | J-003, J-004 | `renderReport` from three surfaces | Phase 4 | TEST-001, TEST-017, TEST-018 | AC-012 |
| REQ-014 | J-001 | `critique('report', …)` | Phase 3 | covered by the stage-contract suite | AC-013 |

## Rollout, Migration, and Rollback

No database migration is generated or applied by this work; `mercatify-labs` has no schema and Phases 0–3 do not touch `src/modules/mercatify`. If Phase 4 ever needs one, `yarn db:generate` runs, the scoped SQL and snapshot are reviewed, and applying it is asked for first.

Three compatibility bridges carry the rollout:

1. **Brief version.** `v1` briefs already in `localStorage` keep loading through the upgrader; nothing in a client's browser breaks.
2. **Catalog merge.** The seven pre-merge keys resolve through an explicit finite alias table, not a fuzzy match, so the honest "not in catalog" fallback still means what it says. One legacy key, `site_survey_tracking`, is deliberately left unaliased: it is one client's register, not a capability, and aliasing it to `data.custom` would turn `build`/`medium` into `native`/`high` — a claim that the platform ships a Site Survey entity.
3. **Document version.** Regeneration after a send bumps `v1.0 → v1.1` and the client keeps the sent version until a deliberate resend.

Rollback is a revert: the package is source-only, the browser copy is generated, and the pages that read the private catalog copy still work until Phase 4 switches them.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| R1 — the catalog merge changes existing verdicts | a report says something different from yesterday's | before/after comparison of the seven pre-merge entries; the differences written down and approved by hand; `catalogMigration.test.ts` | a verdict that was wrong before is now wrong consistently |
| R2 — the third money model contradicts the two existing ones | two payback numbers in one product | the report prints **both**, deliberately and by name; `computeScenario` is untouched | a reader who reads only one number |
| R3 — a model writes a figure into prose | the credibility of the whole document | `assertNoFigures` as an allowlist, plus the `report` critic stage | prose that is vague rather than wrong |
| R4 — the golden comparison breaks on whitespace | false alarms, then a test nobody trusts | whitespace normalized; comparison per section, never the whole file | a real difference hidden inside an accepted section |
| R5 — the two halves drift on `ReportModel` | a week of work discarded | Phase 0 built jointly; every model change reviewed by both | — |
| R6 — `drop` versus five decisions | `mapCapabilities` has nothing to do with a sixth value | `ReportVerdict = Decision \| 'drop'` in the report layer only; the integrity test compares against the verdict the **reader** sees | a `drop` entry mis-stored as a bare `native` |
| R7 — a local model takes minutes per agent | the prose loop is slow | fake clients and `--no-llm` for the loop; one live run a day | — |
| R8 — a fourth vocabulary exists in `MercatifyLabPort` | the app module drifts from the engine | Phase 4 maps `ReportModel` onto the port without changing it | — |
| R9 — **the golden master contains three arithmetic errors** (the "34 seats" tile conflates seats with people; three unit prices are rounded so `seats × unit` misses the monthly by a dollar; the "2.4 months" callout should be 2.58 net / 2.35 gross) | a correct engine *must* diverge from the north star | the acceptance criterion is section-by-section with a short, explicit list of accepted deviations; a deviation outside that list is a defect | the list itself has to be maintained |
| R10 — **a guard can be green and useless** | see the lesson record; the first no-figures guard had a full green suite and passed the exact defect it was written for | the rule was rewritten from "forbidden shapes" to "permitted shapes" | an allowlist rejects legitimate author quantities; the author must add a fact and a slot or write the quantity in words — deliberate and costly |
| R11 — the money-field list inside the slot resolver is enumerated, and its gaps are silent | a money slot renders as `78` instead of `$78` and nothing reports it | the list is documented as needing an entry whenever a money field is added anywhere in `facts` | a new money field added without an entry |
| R12 — **closed 2026-09-19** — the renderer was shipped before anything held it to the golden master | the document could have drifted from the north star without a failing test | `src/__tests__/renderReport.test.ts` compares per section by visible text, strips generated SVG (which has its own proportion and scale tests), and fails both when an undeclared difference appears **and** when a declared deviation stops occurring | the `KNOWN_DEVIATIONS` list still has to be read by a human when it changes |

## Acceptance Criteria

- [ ] **AC-001** — One catalog: the browser copy regenerates byte-identically from the canonical JSON, and all 116 shared tool+slug pairs agree on target, verdict and confidence.
- [ ] **AC-002** — Every value in the rendered document traces to either a `facts` field or a `prose` field, and no code path lets one become the other.
- [ ] **AC-003** — No prose field reaches the document carrying a digit that is neither inside a slot nor directly after a label word; an unknown slot throws rather than rendering a hole.
- [ ] **AC-004** — `computeCashSeries` reproduces all 25 published points of the golden series to the dollar, together with the exposure floor, the break-even month and the 36-month net; both payback numbers are printed and the difference between them is named.
- [ ] **AC-005** — The section 02 counters are internally consistent and cannot under-report a gap the engine found.
- [ ] **AC-006** — A `--no-llm` run produces every table, number and figure, omits every prose-only section, and exits 0.
- [ ] **AC-007** — A run with no costs produces tables, verdicts and waves, omits the money KPIs and Figure 2, and states that costs were not supplied.
- [ ] **AC-008** — A malformed, oversized or empty brief is refused by name and field path before any part of it reaches a prompt.
- [ ] **AC-009** — Waves are reproducible from mappings, plan hours and terms alone; a `build` row without an estimate marks its total a floor.
- [ ] **AC-010** — The document is single-file with no external resource, every value escaped, written only after the whole file is in memory and only when the target is not a symlink.
- [ ] **AC-011** — Nothing off-catalog appears in any amount; everything off-catalog appears in the counters and in Appendix B.
- [ ] **AC-012** — The engine, the console and the client render from one renderer, and no page reads a hand-maintained catalog copy.
- [ ] **AC-013** — `critique('report', …)` returns objections and changes no number and no exit code.
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states. — **N/A: this specification adds no Open Mercato backend surface.** Applies to any future phase that moves the report into `src/modules/mercatify` (Q-004).
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md`, `.ai/guides/spec-delivery.md`, `.ai/specs/README.md`, `.ai/specs/SPEC-000-template.md`, `mercatify-labs/SPEC.md` |
| `om-spec-writing` (OMH-005) invoked before authoring | **fail** | The skill is not installed: `.ai/skills/` has no `om-spec-writing` and there is no `.agents/skills/` directory. `spec-delivery.md` says to run `yarn install-skills`; installing a dependency is an "ask first" action, so this specification was authored directly against `SPEC-000-template.md` and `.ai/guides/spec-delivery.md` with every section preserved. Resolve before the status leaves `Draft` (Q-006) |
| Spec authored before code | **fail** | Recorded openly in the header. Phase 0 and most of Phases 1–2 landed first. Every requirement carries a `built` / `partial` / `open` marker and no requirement is marked `built` without a currently green test |
| Data models, APIs, events, UI, and tests are internally consistent | pass | the traceability table; the 25 integration rows |
| Every workflow completes end to end without a catch-all integration phase | pass | J-001…J-004 each close inside a named phase; Phase 3 is assembly with its own requirements and exit gate, not a polish bucket |
| Platform-native reuse and extension points were chosen before custom code | pass | the reuse map: catalog, `mapCapabilities`, `computeScenario`, Migration Planner, Sandbox Engineer and QA are reused unchanged; only the three genuinely missing pure functions are new |
| UI contracts identify references, canonical components, and theme/state coverage | **N/A — no Open Mercato backend surface is added**; the three affected pages are static mockups outside the admin shell, recorded as such rather than dressed up as `/backend/*` routes |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | Phases 0–5 |
| Requirement traceability complete | partial | every requirement maps to a phase, a test and an acceptance criterion; REQ-013 and REQ-014 have no green test yet because Phases 3–4 have not started |

Verdict: `Blocked — om-spec-writing is not installed (Q-006); Q-001 is unresolved and affects what the coverage table prints; Phases 3–5 have not started`.

## Open Questions

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-001 | `CoverageRow.capability` in the golden master is a **tool role**, not a `CAPS` label. Does the engine print the catalog label, or carry a separate display field? | product owner | yes | pending |
| Q-002 | The list of accepted deviations from the golden master (R9) — who owns it? | product owner | no | **partly resolved 2026-09-19**: it lives as `KNOWN_DEVIATIONS` in `src/__tests__/renderReport.test.ts`, and the test fails when a listed deviation stops occurring, so the list cannot rot silently. Ownership of *approving* a new entry is still open |
| Q-003 | `site_survey_tracking` stays deliberately unaliased. Confirm, or add a real capability for it? | product owner | no | pending — the current behavior is the safe one |
| Q-004 | Does the report eventually live behind an Open Mercato admin page in `src/modules/mercatify`? If yes, that phase adds tenant/organization scope derivation, backend-UI contracts and extension-surface rows, and this specification is amended before that code | product owner | no | pending — not in scope for Phases 0–4 |
| Q-005 | Does `localStorage` stay the handoff for the mockups? The plan assumes yes; a real backend is a separate, larger scope | product owner | no | pending |
| Q-006 | Install the pinned delivery skills (`yarn install-skills`) so `om-spec-writing` and `om-implement-spec` can own this document's revisions and its phase delivery? | repository owner | yes | pending |

## Changelog

| Date | Change |
|---|---|
| 2026-09-19 | Initial draft, written after Phases 0–2 had landed; records the built behavior retroactively and Phases 3–5 spec-first. R12 and part of Q-002 closed within the same day, while drafting, by the golden-master comparison test |
