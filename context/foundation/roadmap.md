---
project: "Mercatify"
version: 1
status: draft
created: 2026-09-19
updated: 2026-09-19
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: Mercatify

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline (2026-09-19).
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

An SMB owner trialing Open Mercato has no way, inside the OM admin, to find out which of their current SaaS tools OM replaces, with what confidence, and what that saves them net. Mercatify runs an interview about the SaaS stack in use — its functions and its costs — and shows a summary grounded in the real OM module registry: each capability mapped to a module or an external tool, one decision, a justification, a confidence band, and the net annual saving broken into separate lines. The analysis itself belongs to a separate module, Mercatify Lab; from the summary the client hands a `.md` configuration document to Lab and Lab implements it.

The insight the product rests on: *"Your SaaS stack is already your specification."*

## North star

**S-03: Client sees the analysis-filled mapping table** — this is the answer that decides the purchase, it is the only place where the product's claim ("your stack is your spec") becomes visible, and it can be built against a seeded case before the wizard exists.

> "North star" here means the smallest end-to-end slice whose successful delivery would show that the product's central claim holds — placed as early as its Prerequisites allow, because everything else only matters if this works.

## At a glance

| ID   | Change ID                       | Outcome (user can …)                                                                        | Prerequisites               | PRD refs                       | Status   |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------ | -------- |
| F-01 | `mercatify-module-scaffold`     | (foundation) Mercatify installs as a standard OM module with one seeded interview case       | —                           | FR-014, FR-015                 | ready    |
| F-02 | `mercatify-lab-analysis-contract` | (foundation) the Mercatify ↔ Lab interface is fixed, with a deterministic scripted adapter  | —                           | FR-003, FR-012, FR-013, OQ-2   | ready    |
| S-03 | `mercatify-mapping-summary`     | see the analysis-filled mapping table, with unmapped items flagged, and edit it              | F-01, F-02                  | US-01, FR-005, FR-006, FR-008  | proposed |
| S-01 | `mercatify-intake-start`        | open Mercatify and see the starting point: company profile and SaaS tools with monthly costs | F-01                        | US-01, FR-001, FR-014, FR-015  | proposed |
| S-02 | `mercatify-discovery-wizard`    | answer discovery questions step by step until the analysis says nothing is missing           | S-01, F-02                  | US-01, FR-002, FR-003, FR-004  | proposed |
| S-04 | `mercatify-savings-breakdown`   | see the net annual saving as three separate lines, with payback measured against net         | S-03                        | US-01, FR-007                  | blocked  |
| S-05 | `mercatify-handoff-document`    | see the `.md` configuration document below the table and edit it or paste their own          | S-03                        | US-01, FR-010, FR-011          | blocked  |
| S-06 | `mercatify-run-in-lab-handoff`  | click "Run in Mercatify Lab" and hand over exactly the `.md` as they left it                 | S-05, F-02                  | US-01, FR-012, FR-013          | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                    | Chain                        | Note                                                                                              |
| ------ | ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| A      | Module ground            | `F-01` → `S-01` → `S-02`     | The input side: the module exists, the starting point renders, the interview runs.                 |
| B      | Analysis seam & summary  | `F-02` → `S-03`              | Carries the north star. Runs fully parallel to Stream A once the contract is written.              |
| C      | Handoff to Lab           | `S-05` → `S-06`              | Joins Stream B at `S-03`. Starts only after the table-vs-`.md` question resolves.                  |
| D      | Money                    | `S-04`                       | Joins Stream B at `S-03`. Starts only after the saving formula and the two cost sources are fixed. |

With `main_goal: speed` and `top_blocker: time`, streams A and B are the two tracks to staff first and in parallel — nothing in A blocks anything in B.

## Baseline

What's already in place in the codebase as of `2026-09-19` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Next.js 16 App Router + React 19, `@open-mercato/ui`, Radix, Tailwind; a Markdown editor dependency is already installed.
- **Backend / API:** present — per-module auto-discovered API routes, Awilix DI container per request, zod validation, `mercato` CLI with a code-generation step.
- **Data:** present — MikroORM 7 on Postgres, per-module entities and migrations (no global schema); demonstrated by the shipped `example` module.
- **Auth:** present — the `auth` and `directory` modules are enabled; JWT sessions, feature-based RBAC, tenant + organization scoping on every entity.
- **Deploy / infra:** partial — Dockerfile, Railway config with a health check, docker-compose for local; no CI workflow in the repo.
- **Observability:** partial — telemetry and APM dependencies are installed, but the telemetry module is not in the enabled-module list.
- **Testing:** present — unit runner configured, plus an ephemeral integration/E2E harness.

Relevant gap: the app currently enables 11 OM modules (auth, directory, configs, entities, query_index, api_docs, audit_logs, notifications, dashboards, events, search) — far fewer than the full core + enterprise catalog the PRD names as "the real OM module registry". See Open Roadmap Question 15.

## Foundations

### F-01: Mercatify exists as a standard OM module

- **Outcome:** (foundation) Mercatify is installed as a standard auto-discovered module — its own feature flags, its own tenant- and organization-scoped interview case, the demo dataset seeded into that case, and the broad validation gates still green with no change to the core or enterprise packages.
- **Change ID:** `mercatify-module-scaffold`
- **PRD refs:** FR-015, FR-014, Constraints & Compatibility (purely additive module), Access Control Changes
- **Unlocks:** S-01, S-02, S-03, S-05, S-06; provides the verification path for FR-014 (existing modules, pages and APIs unchanged after install)
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:**
  - Which demo dataset — the concrete company profile, tool list and monthly costs were never captured. Owner: user. Block: no (placeholder content is enough to scaffold; S-01 is where it becomes visible).
- **Risk:** Sequenced first because nothing else can render or persist until the module passes auto-discovery. The risk is scope creep — this must stay the smallest legal module plus one case entity; every slice below still adds its own fields, APIs and screens.
- **Status:** ready

### F-02: The Mercatify ↔ Mercatify Lab interface is fixed

- **Outcome:** (foundation) the interface between this module and Mercatify Lab is written down as a versioned contract — what the interview sends, what the analysis returns (further questions, mappings, decisions, confidence bands, amounts), and what the handoff carries — with one deterministic scripted adapter behind it, so every downstream slice can be built, demoed and tested without Lab existing.
- **Change ID:** `mercatify-lab-analysis-contract`
- **PRD refs:** FR-003, FR-012, FR-013, Constraints & Compatibility (Dependency on Mercatify Lab), Success Criteria §Primary (scripted demo path), Open Question 2
- **Unlocks:** S-02, S-03, S-05, S-06; resolves the blocking unknown "Mercatify ↔ Mercatify Lab contract" (PRD Open Question 2) before work is split between the two modules
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:**
  - Where the spec's iron rules live (catalog used as a lookup; money computed deterministically rather than by the analysis) — inside Lab, or as a requirement this contract imposes on Lab. Owner: team. Block: no (this foundation is the place the decision gets recorded).
- **Risk:** Sequenced first alongside F-01 because it is the seam two teams work across at the same time; if it lands late, the wizard and the summary are each built against a guess and neither fits Lab. Kept minimal on purpose — one port plus one scripted adapter, not an analysis implementation.
- **Status:** ready

## Slices

### S-03: Client sees the mapping table — north star

- **Outcome:** Client can see, in one table filled by the analysis, every capability or tool mapped to a real OM module (or to an external tool when the decision is keep or integrate), with one decision out of native / configure / build / integrate / keep, a justification and a confidence band — with anything the analysis could not map visibly flagged rather than dropped — and can edit the table before handing anything over.
- **Change ID:** `mercatify-mapping-summary`
- **PRD refs:** US-01, FR-005, FR-006, FR-008
- **Prerequisites:** F-01, F-02
- **Parallel with:** S-01, S-02
- **Blockers:** —
- **Unknowns:**
  - Which module registry the table may name — the 11 modules enabled in this app, or the full core + enterprise catalog quoted in the PRD. Owner: team. Block: no (either reading produces a demonstrable table; the choice changes the lookup source, not the slice's shape).
  - Who maintains the SaaS-capability → OM-module map, given that v1 has no editor for it in the UI (PRD Open Question 5). Owner: team. Block: no.
- **Risk:** Placed before the intake and wizard slices deliberately — it is the north star and its Prerequisites are only the two foundations, so deferring it behind the interview would delay the one thing that proves the product. The risk is that it is built against a fixture that drifts from what the wizard actually collects; F-02's contract is what keeps them aligned.
- **Status:** proposed

### S-01: Client sees the interview starting point

- **Outcome:** Client can open Mercatify inside the OM admin of their tenant and see the starting point: their company profile and the set of SaaS tools in use with their monthly costs.
- **Change ID:** `mercatify-intake-start`
- **PRD refs:** US-01, FR-001, FR-015, FR-014
- **Prerequisites:** F-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - The demo dataset's actual content (which tools, which costs) was not captured in shaping. Owner: user. Block: no.
- **Risk:** This is the first slice where auto-discovery, the module's feature flags and tenant scoping become observable to a person rather than to a test, so it doubles as the live check on FR-014 and FR-015. Low risk; the main failure mode is building a bespoke screen where installed admin primitives already do the job.
- **Status:** proposed

### S-02: Client answers the discovery questions

- **Outcome:** Client can answer discovery questions step by step by clicking chips, add anything unanticipated in a free-text field, and keep receiving further questions injected by the analysis whenever it decides it lacks information — the loop ending when the analysis says nothing is missing or the question cap is reached.
- **Change ID:** `mercatify-discovery-wizard`
- **PRD refs:** US-01, FR-002, FR-003, FR-004
- **Prerequisites:** S-01, F-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - The exact question cap — the PRD records "a few" and routes the number to planning (PRD Open Question 7). Owner: team. Block: no.
  - How deep the questions go per tool (PRD Open Question 6). Owner: team. Block: no.
  - What happens to free-text answers that may carry sensitive data — no retention or handling rule was captured (PRD Open Question 9). Owner: team. Block: no.
- **Risk:** The only slice with an unbounded-by-design interaction; the cap is what keeps it demoable. Sequenced after S-01 because it continues from the starting point, and after F-02 because the injected questions come across the analysis seam.
- **Status:** proposed

### S-04: Client sees the savings broken down

- **Outcome:** Client can see the net annual saving presented as three separate lines — SaaS saving, OM operating cost and implementation cost, never blended — with payback measured against the net figure.
- **Change ID:** `mercatify-savings-breakdown`
- **PRD refs:** US-01, FR-007
- **Prerequisites:** S-03
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:**
  - The module's one-sentence business rule and the saving formula are still a spec-derived candidate, not a decision (PRD Open Question 1). Owner: user. Block: yes.
  - Who provides the OM operating cost figure (PRD Open Question 3). Owner: user / team. Block: yes.
  - Who provides the implementation cost figure (PRD Open Question 4). Owner: user / team. Block: yes.
- **Risk:** Blocked, but cheaply: confirming the spec's candidate rule ("all costs are customer-provided", the three-line formula, payback against net) answers all three unknowns at once and promotes this slice to ready. Left blocked rather than guessed, because a saving figure derived from an unconfirmed formula is exactly the false precision the PRD's guardrail exists to prevent.
- **Status:** blocked

### S-05: Client sees and edits the handoff document

- **Outcome:** Client can see, below the table, a `.md` configuration document carrying everything Mercatify Lab needs for implementation, in an edit window — and can edit it or paste in a whole document prepared elsewhere.
- **Change ID:** `mercatify-handoff-document`
- **PRD refs:** US-01, FR-010, FR-011
- **Prerequisites:** S-03
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - Whether editing the table regenerates the `.md`, or the two are independent artifacts with the `.md` as the only document that travels (PRD Open Question 8). Owner: team. Block: yes.
  - Handling of pasted content that may carry sensitive data — no rule captured (PRD Open Question 9). Owner: team. Block: no.
- **Risk:** Blocked on one cheap decision that nevertheless changes the slice's whole shape: a regenerated document needs a serializer and a conflict story for edits made on both sides, an independent document needs neither. Planning before that call would be planning two different slices at once.
- **Status:** blocked

### S-06: Client hands the plan to Mercatify Lab

- **Outcome:** Client can click "Run in Mercatify Lab" and have exactly the current content of the `.md` — as they last left it, edited or pasted — handed to Lab; when Lab is not installed they see what would have been handed over instead of an error.
- **Change ID:** `mercatify-run-in-lab-handoff`
- **PRD refs:** US-01, FR-012, FR-013
- **Prerequisites:** S-05, F-02
- **Parallel with:** S-04
- **Blockers:** Mercatify Lab does not exist yet — it has not had its own shaping session, so the installed-Lab path can only be verified end-to-end once Lab ships a receiving surface. The not-installed path (FR-013) is fully verifiable now and is what the demo runs on.
- **Unknowns:**
  - How "Lab is installed" is detected, given F-02 fixes the contract but not the discovery mechanism. Owner: team. Block: no.
- **Risk:** Last in dependency order because it needs the document that S-05 produces, but it is also the slice whose demo value is highest per unit of work — the not-installed path is a small amount of work and closes the flow. Risk is treating the absent-Lab case as an error path rather than a first-class outcome; FR-013 is explicit that it is not.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                         | Suggested issue title                                              | Ready for `/10x-plan` | Notes                                                                 |
| ---------- | --------------------------------- | ------------------------------------------------------------------ | --------------------- | --------------------------------------------------------------------- |
| F-01       | `mercatify-module-scaffold`       | Install Mercatify as a standard OM module with one seeded case      | yes                   | Start here — unlocks everything, including the north star             |
| F-02       | `mercatify-lab-analysis-contract` | Fix the Mercatify ↔ Lab contract and ship a scripted adapter        | yes                   | Staff in parallel with F-01; it is the seam two teams work across     |
| S-03       | `mercatify-mapping-summary`       | Show the analysis-filled mapping table with flagged unmapped items  | no                    | North star. Ready once F-01 and F-02 land                             |
| S-01       | `mercatify-intake-start`          | Show the interview starting point: profile and SaaS tools with costs| no                    | Ready once F-01 lands                                                 |
| S-02       | `mercatify-discovery-wizard`      | Run the discovery wizard with dynamically injected questions        | no                    | Ready once S-01 and F-02 land; fix the question cap during planning   |
| S-04       | `mercatify-savings-breakdown`     | Show the three-line net saving and payback                          | no                    | Blocked on the business rule and the two cost sources (Q1, Q3, Q4)    |
| S-05       | `mercatify-handoff-document`      | Show and edit the `.md` handoff document                            | no                    | Blocked on the table-vs-document question (Q8)                        |
| S-06       | `mercatify-run-in-lab-handoff`    | Hand the document to Lab, with a first-class not-installed path     | no                    | Ready once S-05 lands; Lab itself is still external                   |

## Open Roadmap Questions

Carried from PRD §Open Questions, plus one surfaced while probing the codebase. Per-slice unknowns stay in their slice.

1. **The module's one-sentence business rule** — confirm or replace the spec-derived candidate (every capability gets exactly one of five decisions; the saving shown is always net of OM's operating cost; the three-line formula with payback against net). Owner: user. Block: S-04. Highest leverage in the list.
2. **The Mercatify ↔ Mercatify Lab contract** — what the interview sends, what the analysis returns, what the handoff carries, and where the spec's iron rules live. Owner: team. Block: this is F-02's deliverable, so it resolves by being built rather than by being answered.
3. **Source of the OM operating cost figure.** Owner: user / team. Block: S-04. Answered in one move by Question 1 if the candidate rule stands ("all costs are customer-provided").
4. **Source of the implementation cost figure.** Owner: user / team. Block: S-04. Same as Question 3.
5. **Who maintains the SaaS-capability → OM-module map** — narrowed already: not a separate role in v1, no editor in the UI. Owner: team. Block: S-03 (non-blocking).
6. **Interview depth** — how far the questions go per tool. Owner: team. Block: S-02 (non-blocking).
7. **The question cap in the wizard loop** — "a few" needs a number. Owner: team. Block: S-02 (non-blocking).
8. **Table ↔ `.md` document** — does editing the table regenerate the document, or are they independent artifacts with the document as the only thing that travels? Owner: team. Block: S-05.
9. **Non-functional requirements** — response-time expectation for the analysis round trip, handling of free-text and pasted content that may carry sensitive data, browser support, retention. Owner: team. Block: roadmap-wide (non-blocking; no slice can state a quality target until these exist).
10. **Product framing** — `target_scale`, the HackOn 2026 hard deadline, `after_hours_only`. Owner: user. Block: roadmap-wide (non-blocking). Worth answering anyway: with `top_blocker: time`, an unrecorded deadline is the one input the whole sequence is tuned against.
11. **Socratic round for FR-004…FR-015** — ended early; those requirements stand without a recorded counter-argument. Owner: user. Block: none (optional).
12. **The live analysis path as the secondary success criterion** — user to confirm. Owner: user. Block: none; parked below for now.
13. **Current OM user base** — not captured. Owner: user. Block: none.
14. **Cost of the status quo** — how much the trialing client loses today by working the mapping out alone. Owner: user. Block: none.
15. **Which module registry the mapping table may name** *(new — surfaced by the codebase probe)* — this app enables 11 OM modules, while the PRD's "real OM module registry" is the full core + enterprise catalog. The acceptance criterion says every row must name a module that exists in the registry; which registry decides whether the demo can map a tool to, say, a sales or catalog module that is not enabled here. Owner: team. Block: S-03 (non-blocking), and it also constrains what the `.md` handed to Lab may claim.

## Parked

- **Consolidation scenario toggle (FR-009, nice-to-have)** — Why parked: `main_goal: speed` with `top_blocker: time`; it recomputes a number the client can already read, and the PRD ranks it behind the live analysis path in the stretch queue.
- **Live analysis path — questions and summary coming from Lab instead of the scripted path** — Why parked: PRD §Success Criteria lists it as secondary, and F-02's contract is written so it can be swapped in later without reopening any slice.
- **Generated preview screens, the Lead → Customer → Deal → Quote golden path, and lead submit creating records** — Why parked: PRD §Non-Goals; they belong to Mercatify Lab.
- **The analysis itself — question generation, capability→module mapping, the summary** — Why parked: PRD §Non-Goals; produced by Lab. This module collects, displays, lets the client edit, and hands off.
- **Any change to OM auth, tenancy or roles; a dedicated role or UI for maintaining the SaaS→module map** — Why parked: PRD §Non-Goals and §Access Control Changes.
- **A progress indicator for the wizard** — Why parked: PRD §Non-Goals; the number of steps is unknown by design, so the indicator has nothing to show.
- **A time-limit target for the run** — Why parked: PRD §Non-Goals; the spec's "under 5 minutes" was dropped in favour of "runs with no manual fixing".
- **Free-form entry of the client's own SaaS stack** — Why parked: PRD §Non-Goals for the MVP; the demo starts from a ready dataset.
- **A hardcoded example company or industry-specific wizard steps** — Why parked: PRD §Non-Goals; Mercatify is a general solution.

## Done

(Empty on first generation. `/10x-archive` appends entries here.)
