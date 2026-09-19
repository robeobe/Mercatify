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

**S-03: Admin sees the analysis-filled mapping table** *(reassigned from client, 2026-09-19)* — this is the answer that decides the purchase, it is the only place where the product's claim ("your stack is your spec") becomes visible, and it can be built against a seeded case before the wizard exists.

> "North star" here means the smallest end-to-end slice whose successful delivery would show that the product's central claim holds — placed as early as its Prerequisites allow, because everything else only matters if this works.

## At a glance

| ID   | Change ID                       | Outcome (user can …)                                                                        | Prerequisites               | PRD refs                       | Status   |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------ | -------- |
| F-01 | `mercatify-module-scaffold`     | (foundation) Mercatify installs as a standard OM module with one seeded interview case       | —                           | FR-014, FR-015                 | done     |
| F-02 | `mercatify-lab-analysis-contract` | (foundation) the Mercatify ↔ Lab interface is fixed, with a deterministic scripted adapter  | —                           | FR-003, FR-012, FR-013, OQ-2   | done     |
| S-03 | `mercatify-mapping-summary`     | **admin** sees the analysis-filled mapping table, with unmapped items flagged, and edits it *(reassigned from client, 2026-09-19)* | F-01, F-02                  | US-01, FR-005, FR-006, FR-008  | done     |
| S-07 | `mercatify-request-queue`       | **admin** sees a queue of every submitted request, filterable by status, with the one next action per row *(added 2026-09-19 — gap)* | F-01                        | FR-016                         | ready    |
| S-01 | `mercatify-intake-start`        | employee opens Mercatify, builds and sends the interview starting point: company profile and SaaS tools with monthly costs | F-01                        | US-01, FR-001, FR-014, FR-015  | ready    |
| S-08 | `mercatify-client-requests`     | **client** (employee role) sees a list of their own requests and reopens one to see what was sent and its status *(added 2026-09-19 — gap; revises S-01's "terminal after Send")* | S-01                        | FR-017                         | ready    |
| S-02 | `mercatify-discovery-wizard`    | *(superseded 2026-09-19 — no client-facing wizard; Send is terminal for the employee, no agent feedback follows)* | S-01, F-02                  | US-01, FR-002, FR-003, FR-004  | superseded |
| S-04 | `mercatify-savings-breakdown`   | see the net annual saving as three separate lines, with payback measured against net         | S-03                        | US-01, FR-007                  | ready    |
| S-05 | `mercatify-handoff-document`    | **admin** sees the `.md` configuration document while preparing the report and edits it or pastes their own *(reassigned from client, not shown to the client, 2026-09-19)* | S-03                        | US-01, FR-010, FR-011          | blocked  |
| S-09 | `mercatify-report-build-send`   | **admin** builds the client-facing report from a confirmed mapping (KPIs, tool table, duplicates, backlog, cash curve) and sends it *(added 2026-09-19 — gap, distinct from S-04's saving lines and S-05's `.md` editor)* | S-03, S-04                  | FR-018                         | blocked  |
| S-10 | `mercatify-client-offer`        | **client** (employee role) sees the sent report and accepts it or asks for a consult call *(added 2026-09-19 — gap; this is what S-06 assumed already existed)* | S-08, S-09                  | FR-019                         | blocked  |
| S-06 | `mercatify-run-in-lab-handoff`  | the client's existing **Accept** action (not a separate button) triggers handing over exactly the current `.md` *(reassigned 2026-09-19)* | S-05, S-10, F-02             | US-01, FR-012, FR-013          | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                    | Chain                        | Note                                                                                              |
| ------ | ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| A      | Module ground            | `F-01` → `S-01` → `S-08` → `S-02` | The input side: the module exists, the starting point renders, the client can find it again, the interview (superseded) never runs. |
| B      | Analysis seam & summary  | `F-02` → `S-03` → `S-07`     | Carries the north star. `S-07` (admin queue, added 2026-09-19) is the practical entry point into `S-03`. Runs fully parallel to Stream A once the contract is written. |
| C      | Handoff to Lab           | `S-05` → `S-09` → `S-10` → `S-06` | Joins Stream B at `S-03`. `S-09`/`S-10` (added 2026-09-19) are the report screen and the client's view of it, both presupposed but never built by the original `S-05`/`S-06`. Starts only after the table-vs-`.md` question resolves. |
| D      | Money                    | `S-04`                       | Joins Stream B at `S-03`. Saving formula and the two cost sources fixed 2026-09-19 (issue #18); also feeds `S-09`'s report. |

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
- **Unlocks:** S-01, S-02, S-03, S-05, S-06, S-07, S-08; provides the verification path for FR-014 (existing modules, pages and APIs unchanged after install)
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:**
  - Which demo dataset — the concrete company profile, tool list and monthly costs were never captured. Owner: user. Block: no (placeholder content is enough to scaffold; S-01 is where it becomes visible).
- **Risk:** Sequenced first because nothing else can render or persist until the module passes auto-discovery. The risk is scope creep — this must stay the smallest legal module plus one case entity; every slice below still adds its own fields, APIs and screens.
- **Status:** done

### F-02: The Mercatify ↔ Mercatify Lab interface is fixed

- **Outcome:** (foundation) the interface between this module and Mercatify Lab is written down as a versioned contract — what the interview sends, what the analysis returns (further questions, mappings, decisions, confidence bands, amounts), and what the handoff carries — with one deterministic scripted adapter behind it, so every downstream slice can be built, demoed and tested without Lab existing.
- **Change ID:** `mercatify-lab-analysis-contract`
- **PRD refs:** FR-003, FR-012, FR-013, Constraints & Compatibility (Dependency on Mercatify Lab), Success Criteria §Primary (scripted demo path), Open Question 2
- **Unlocks:** S-03, S-05, S-06 (S-02 superseded 2026-09-19 — see its own entry); resolves the blocking unknown "Mercatify ↔ Mercatify Lab contract" (PRD Open Question 2) before work is split between the two modules
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:**
  - Where the spec's iron rules live (catalog used as a lookup; money computed deterministically rather than by the analysis) — inside Lab, or as a requirement this contract imposes on Lab. Owner: team. Block: no (this foundation is the place the decision gets recorded).
- **Risk:** Sequenced first alongside F-01 because it is the seam two teams work across at the same time; if it lands late, the wizard and the summary are each built against a guess and neither fits Lab. Kept minimal on purpose — one port plus one scripted adapter, not an analysis implementation.
- **Status:** done

## Slices

### S-03: Admin sees the mapping table — north star

> **Amended 2026-09-19** (`mercatify-intake-start` follow-up): reassigned from the client to the **admin** role, per the evolved `assets/console/modules.html` mockup — "the agent's pass is a starting point," admin edits rows, "Confirm mapping" closes it and unlocks the report. This same decision supersedes S-02.

- **Outcome:** Admin can see, in one table filled by the analysis, every capability or tool mapped to a real OM module (or to an external tool when the decision is keep or integrate), with one decision out of native / configure / build / integrate / keep, a justification and a confidence band — with anything the analysis could not map visibly flagged rather than dropped — and can edit the table before the report is built and sent. The employee who submitted the intake never sees this table.
- **Change ID:** `mercatify-mapping-summary`
- **PRD refs:** US-01, FR-005, FR-006, FR-008
- **Prerequisites:** F-01, F-02
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:**
  - Which module registry the table may name — resolved 2026-09-19 (issue #14 acceptance criteria): the 11 modules this app actually enables, checked at generation time via `getEnabledModuleIds()`. Any row naming a module outside that set is treated as flagged the same way an unmapped capability is — this is what the demo's `customers`/`sales` rows now exercise.
  - Who maintains the SaaS-capability → OM-module map, given that v1 has no editor for it in the UI (PRD Open Question 5). Owner: team. Block: no.
- **Risk:** Placed before the intake and wizard slices deliberately — it is the north star and its Prerequisites are only the two foundations, so deferring it behind the interview would delay the one thing that proves the product. The risk is that it is built against a fixture that drifts from what the wizard actually collects; F-02's contract is what keeps them aligned. This slice can be built and demoed against a directly-linked case before `S-07` exists (its entry point is a URL, matching `console/modules.html?ref=`); `S-07` only matters for the admin persona reaching it without a link in hand.
- **Status:** done

### S-07: Admin sees the request queue
> **Added 2026-09-19** (gap found reviewing `assets/console/requests.html` against this roadmap while planning `mercatify-intake-start`'s follow-up work — no slice built the list an admin actually lands on before `S-03`'s mapping table).

- **Outcome:** Admin can see every submitted request in one queue, filterable by status, with header stats (new / in mapping / with the client / answered) and, per row, the one next action that status allows — Map, Continue mapping, Build report, or Report — matching `assets/shared/om-core.js`'s `requestActions()` state machine so the queue, the mapping screen and the report screen never disagree about what is possible next.
- **Change ID:** `mercatify-request-queue`
- **PRD refs:** FR-016
- **Unlocks:** the practical entry point into S-03 for the admin persona (S-03 itself does not require this to be built or tested — see its Risk note)
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-03
- **Blockers:** —
- **Unknowns:**
  - Whether "admin" here is a role within the same trial tenant (consistent with S-01's/S-03's existing decision to keep everything inside one OM admin, no separate staff portal) or genuinely cross-tenant Mercatify staff seeing every trial company's requests, as the literal `console/` mockup depicts. Owner: user. Block: no for a single-tenant demo; blocking if the cross-tenant reading is wanted, since that reopens Access Control Changes.
- **Risk:** Low — mostly a status-aware rendering of the same case list F-01/S-01 already produce. The risk is scope creep into building a second, cross-tenant staff app that the PRD's "no access control changes" constraint does not currently license.
- **Status:** ready

### S-01: Client sees the interview starting point

> **Amended 2026-09-19** (gap-analysis follow-up): the in-flight plan for this change (`context/changes/mercatify-intake-start/plan.md`) describes Send as terminal — "the employee sees a read-only confirmation and nothing else … no further status appears to them." That stands for *this slice's own build*, but it is superseded as a roadmap-wide claim by `S-08`/`S-10`: once a report is sent, the client must be able to come back and see it. The plan's own scope is unaffected (it still only builds create/edit/send/lock); the false claim is that nothing further ever gets built for that role, which `S-08`/`S-10` now do.

- **Outcome:** Client (employee role) can open Mercatify inside the OM admin of their tenant, build the interview starting point (company profile plus SaaS tools with monthly costs, including catalog picks and custom tools), save a draft, and send it — after which this slice locks the case to a read-only confirmation.
- **Change ID:** `mercatify-intake-start`
- **PRD refs:** US-01, FR-001, FR-015, FR-014
- **Prerequisites:** F-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - The demo dataset's actual content (which tools, which costs) was not captured in shaping. Owner: user. Block: no.
- **Risk:** This is the first slice where auto-discovery, the module's feature flags and tenant scoping become observable to a person rather than to a test, so it doubles as the live check on FR-014 and FR-015. Low risk; the main failure mode is building a bespoke screen where installed admin primitives already do the job.
- **Status:** ready

### S-08: Client sees their own requests
> **Added 2026-09-19** (gap found reviewing `assets/client/requests.html` and `assets/client/request.html`; this revises `mercatify-intake-start`'s (`S-01`) "Sending is terminal — the employee sees a read-only confirmation and nothing else" language, which cannot be true once `S-10` requires the client to come back and read a sent report).

- **Outcome:** Client (the `employee` role from S-01) can see a list of every request they have submitted, each showing whose turn it is — with Mercatify or with them — and can reopen any one to see what they sent and a plain progress track (sent → a consultant reads it → your report comes back → you decide). Once a report is sent, this is where the client discovers it and reaches it. This does not reopen editing of a sent case (S-01's lock stands); it only adds a way back in to *see* status and, once ready, the report.
- **Change ID:** `mercatify-client-requests`
- **PRD refs:** FR-017
- **Unlocks:** the client-side entry point S-10 depends on
- **Prerequisites:** S-01
- **Parallel with:** S-02 (superseded, no interaction)
- **Blockers:** —
- **Unknowns:**
  - Same single-OM-admin-surface question as S-07: this list is scoped to the trial tenant's own cases (already true of S-01's list page), not a separate client portal — consistent with S-01's explicit Non-Goal of not building `client/login.html` or a separate portal.
- **Risk:** Low. The main failure mode is treating S-01's "terminal" language as still literally true and building nothing here, leaving the client with no way to discover a sent report short of a direct link.
- **Status:** ready

### S-02: Client answers the discovery questions — SUPERSEDED

> **Superseded 2026-09-19** (`mercatify-intake-start` follow-up, user decision): the employee's flow ends at Send — "the submission is sent, and that's it," no wizard, no agent feedback follows. If the analysis needs more information, the **admin** resolves it while editing the mapping (S-03), not the employee through a chip-based loop. Kept below for history; do not plan or implement this slice as written.

- **Outcome (historical, not to be built):** Client can answer discovery questions step by step by clicking chips, add anything unanticipated in a free-text field, and keep receiving further questions injected by the analysis whenever it decides it lacks information — the loop ending when the analysis says nothing is missing or the question cap is reached.
- **Change ID:** `mercatify-discovery-wizard`
- **PRD refs:** US-01, FR-002, FR-003, FR-004 (superseded — see PRD amendment)
- **Prerequisites:** S-01, F-02
- **Parallel with:** —
- **Blockers:** —
- **Status:** superseded

### S-04: Client sees the savings broken down

> **Amended 2026-09-19** (GitHub issue #18, user decision): business rule confirmed — three-line net formula, payback against net. OM operating cost and implementation cost are **customer-provided** (admin-entered), matching the repo's existing `mercatify-labs/` prototype's `computeScenario.ts` formula exactly ("iron rule #2": these two figures are inputs, never computed by an analysis step). F-02's original "no money in the `MercatifyLabPort` contract" design stands unchanged — see `context/changes/mercatify-savings-breakdown/change.md` for the full two-round decision record.

- **Outcome:** Client can see the net annual saving presented as three separate lines — SaaS saving, OM operating cost and implementation cost, never blended — with payback measured against the net figure.
- **Change ID:** `mercatify-savings-breakdown`
- **PRD refs:** US-01, FR-007
- **Unlocks:** S-09 (the report screen presents these three lines alongside the mapping table)
- **Prerequisites:** S-03 (done)
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** — (PRD Open Questions 1, 3, 4 resolved 2026-09-19; see Amended note)
- **Status:** ready

### S-05: Admin sees and edits the handoff document

> **Amended 2026-09-19** (`mercatify-intake-start` follow-up, user decision): reassigned from the client to the **admin** role. The `.md` is prepared while the admin builds the report (alongside S-03/S-04) and is never shown to the client directly — the client sees the report (`client/offer.html`) and either accepts or asks for a consult call.

- **Outcome:** Admin can see, while preparing the report, a `.md` configuration document carrying everything Mercatify Lab needs for implementation, in an edit window — and can edit it or paste in a whole document prepared elsewhere.
- **Change ID:** `mercatify-handoff-document`
- **PRD refs:** US-01, FR-010, FR-011
- **Unlocks:** S-06 (the `.md` this slice produces is what gets handed to Lab); parallel/overlapping concern with S-09's report screen — see S-09's Unknowns on whether they are one artifact or two
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-09
- **Blockers:** —
- **Unknowns:**
  - ~~Whether editing the table regenerates the `.md`, or the two are independent artifacts~~ — **Resolved 2026-09-19** (user decision, PRD Open Question 8): independent artifacts. Editing the table never touches the `.md`; the `.md` is the only document that travels to Lab.
  - Handling of pasted content that may carry sensitive data — no rule captured (PRD Open Question 9). Owner: team. Block: no.
- **Risk:** None from the regeneration question anymore (resolved as independent artifacts — no serializer, no cross-artifact conflict story needed). Remaining risk is ordinary UI risk for a plain textarea editor with paste-to-replace.
- **Status:** done

### S-09: Admin builds and sends the report
> **Added 2026-09-19** (gap found reviewing `assets/console/report.html`; distinct from `S-04`'s three saving lines and `S-05`'s `.md` editor — neither builds the report screen or its **Send to the client** action, and nothing currently flips a request's status to `sent`).

- **Outcome:** Admin can build, from a confirmed (`mapped`) request, the report the client will see: a computed headline and summary, the four KPIs, a verdict bar per job in the stack, the tool-by-tool table with confidence bands (from S-03's mapping), the duplicates, the net saving as three separate lines (S-04) with a basis for each figure, the build backlog with hours and cost (unestimated hours print as "to estimate"), the cash curve, and the client's own stated pains/must-keep — then send it, which sets status to `sent` and is what first makes anything visible to the client (S-10).
- **Change ID:** `mercatify-report-build-send`
- **PRD refs:** FR-018
- **Unlocks:** S-10
- **Prerequisites:** S-03, S-04
- **Parallel with:** S-05
- **Blockers:** Inherits S-04's blockers for the money portions (Open Questions 1, 3, 4) — the table/verdict/backlog portions of the report do not depend on the saving formula and could be built first if S-04 stays blocked.
- **Unknowns:**
  - ~~Whether this report screen and S-05's `.md` document are the same generated artifact viewed two ways, or genuinely independent~~ — **Resolved 2026-09-19** alongside PRD Open Question 8: genuinely independent. This report screen renders from the mapping/report data; S-05's `.md` is a separate document that only travels to Lab. Neither regenerates the other.
- **Risk:** The richest UI in the roadmap (headline, 4 KPIs, verdict bar, table, cash curve). Risk is under-scoping it to just the saving lines already covered by S-04 and calling that "the report" — the mockup's `stack-tool/report.html` is the shape to match.
- **Status:** blocked (same money-formula blockers as S-04; the non-money portions are not blocked)

### S-10: Client sees the offer and answers it
> **Added 2026-09-19** (gap found reviewing `assets/client/offer.html`; `S-06`'s change.md already assumed this screen exists — "the client's existing Accept action on the report (`client/offer.html`)" — but no slice built it).

- **Outcome:** Client (employee role) can read the sent report and either **accept** it or **ask for a call with Sales** — the same screen and the same two actions `S-06` wires to the Lab handoff. Their answer (`accepted` or `consult`) is visible back to the admin in S-07's queue and on their own S-08 request tile/track.
- **Change ID:** `mercatify-client-offer`
- **PRD refs:** FR-019
- **Unlocks:** S-06 (S-06's Accept trigger has no screen to fire from without this)
- **Prerequisites:** S-08, S-09
- **Parallel with:** —
- **Blockers:** Transitively blocked behind S-09 (money formula).
- **Unknowns:** —
- **Risk:** Low once S-09 exists — this is mostly a read-only render of the same report plus two buttons. The risk is building it as a second, disconnected renderer instead of reusing S-09's report output, which is what keeps an admin edit visible to the client "without a regenerate step" per the mockup.
- **Status:** blocked (behind S-09)

### S-06: Accepting the report hands the plan to Mercatify Lab

> **Amended 2026-09-19** (`mercatify-intake-start` follow-up, user decision): "when the client accepts, you send it to Lab" — the trigger is the client's existing **Accept** action on the report (`client/offer.html`), not a separate client-facing "Run in Mercatify Lab" button (no such button exists in the evolved mockups).

> **Amended 2026-09-19** (gap-analysis follow-up): this change's outcome already assumed "the client's existing Accept action on the report (`client/offer.html`)" exists. Nothing in the roadmap built that screen; `S-10` now does, and is added as a prerequisite here.

- **Outcome:** When the client accepts the report, exactly the current content of the `.md` — as the admin last left it, edited or pasted — is handed to Lab; when Lab is not installed, what would have been handed over is shown instead of an error.
- **Change ID:** `mercatify-run-in-lab-handoff`
- **PRD refs:** US-01, FR-012, FR-013
- **Prerequisites:** S-05, S-10, F-02
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
| S-03       | `mercatify-mapping-summary`       | Show the admin-facing analysis-filled mapping table with flagged unmapped items | yes       | North star. F-01 and F-02 landed. Reassigned to admin 2026-09-19      |
| S-07       | `mercatify-request-queue`         | Show the admin request queue with status filters and per-row next action | yes       | Added 2026-09-19 — gap. Only needs F-01                               |
| S-01       | `mercatify-intake-start`          | Employee builds and sends the interview starting point: profile and SaaS tools with costs | yes | F-01 landed                                                  |
| S-08       | `mercatify-client-requests`       | Show the client's list of their own requests plus a per-request progress track | yes       | Added 2026-09-19 — gap. Needs S-01; revises S-01's "terminal" claim   |
| S-02       | `mercatify-discovery-wizard`      | ~~Run the discovery wizard with dynamically injected questions~~    | no                    | **Superseded 2026-09-19** — do not implement                          |
| S-04       | `mercatify-savings-breakdown`     | Show the three-line net saving and payback                          | no                    | Ready 2026-09-19 (issue #18) — OM operating/implementation cost are customer-provided (admin-entered), matching `mercatify-labs/computeScenario.ts`; no F-02 contract change for money |
| S-05       | `mercatify-handoff-document`      | Show and edit the `.md` handoff document (admin-facing)             | no                    | Blocked on the table-vs-document question (Q8). Reassigned to admin 2026-09-19 |
| S-09       | `mercatify-report-build-send`     | Admin builds and sends the client-facing report from a confirmed mapping | no       | Added 2026-09-19 — gap. Blocked with S-04 on the money formula        |
| S-10       | `mercatify-client-offer`          | Client sees the sent report and accepts or asks for a consult call  | no                    | Added 2026-09-19 — gap. Needs S-08 and S-09; is what S-06 assumed already existed |
| S-06       | `mercatify-run-in-lab-handoff`    | Client's Accept action hands the document to Lab, with a first-class not-installed path | no | Ready once S-05 and S-10 land; Lab itself is still external. Trigger reassigned 2026-09-19 |

## Open Roadmap Questions

Carried from PRD §Open Questions, plus one surfaced while probing the codebase. Per-slice unknowns stay in their slice.

1. ~~**The module's one-sentence business rule**~~ — **Resolved 2026-09-19** (issue #18, owner: user): every capability keeps its one of five decisions from S-03's mapping; the saving shown is always net of OM's operating cost and implementation cost; the three-line formula (SaaS saving / OM operating cost / implementation cost, never blended) with payback against net. See `context/changes/mercatify-savings-breakdown/change.md`.
2. **The Mercatify ↔ Mercatify Lab contract** — what the interview sends, what the analysis returns, what the handoff carries, and where the spec's iron rules live. Owner: team. Block: this is F-02's deliverable, so it resolves by being built rather than by being answered. Amended 2026-09-19: the contract gains additive optional money fields per Question 1's resolution — Lab now also returns OM operating cost and implementation cost as net dollar amounts.
3. ~~**Source of the OM operating cost figure.**~~ — **Resolved 2026-09-19** (issue #18, owner: user): customer-provided, admin-entered — matches the repo's `mercatify-labs/` prototype, where this figure is an opaque input to `computeScenario`, never computed by Lab.
4. ~~**Source of the implementation cost figure.**~~ — **Resolved 2026-09-19** (issue #18, owner: user): same as Question 3 — customer-provided, admin-entered.
5. **Who maintains the SaaS-capability → OM-module map** — narrowed already: not a separate role in v1, no editor in the UI. Owner: team. Block: S-03 (non-blocking).
6. **Interview depth** — moot; S-02, the mechanism this question concerned, is superseded (2026-09-19). Owner: team. Block: none.
7. **The question cap in the wizard loop** — moot; S-02 is superseded (2026-09-19). Owner: team. Block: none.
8. **Table ↔ `.md` document** — does editing the table regenerate the document, or are they independent artifacts with the document as the only thing that travels? Owner: team. Block: S-05.
9. **Non-functional requirements** — response-time expectation for the analysis round trip, handling of free-text and pasted content that may carry sensitive data, browser support, retention. Owner: team. Block: roadmap-wide (non-blocking; no slice can state a quality target until these exist).
10. **Product framing** — `target_scale`, the HackOn 2026 hard deadline, `after_hours_only`. Owner: user. Block: roadmap-wide (non-blocking). Worth answering anyway: with `top_blocker: time`, an unrecorded deadline is the one input the whole sequence is tuned against.
11. **Socratic round for FR-004…FR-015** — ended early; those requirements stand without a recorded counter-argument. Owner: user. Block: none (optional).
12. **The live analysis path as the secondary success criterion** — user to confirm. Owner: user. Block: none; parked below for now.
13. **Current OM user base** — not captured. Owner: user. Block: none.
14. **Cost of the status quo** — how much the trialing client loses today by working the mapping out alone. Owner: user. Block: none.
15. **Which module registry the mapping table may name** *(new — surfaced by the codebase probe)* — this app enables 11 OM modules, while the PRD's "real OM module registry" is the full core + enterprise catalog. The acceptance criterion says every row must name a module that exists in the registry; which registry decides whether the demo can map a tool to, say, a sales or catalog module that is not enabled here. Owner: team. Block: S-03 (non-blocking), and it also constrains what the `.md` handed to Lab may claim.
16. **Is "admin" a role inside the same trial tenant, or cross-tenant Mercatify staff?** *(new — surfaced 2026-09-19 while adding S-07/S-08/S-09/S-10)* — `S-01`/`S-03` already assume the former (one OM admin, no separate staff portal), but the `console/` mockup literally depicts a second app seeing every trial company's requests. The single-tenant reading needs no PRD change; the cross-tenant reading reopens Access Control Changes ("no access control changes … current model preserved"). Owner: user. Block: no for the single-tenant demo, which is what S-07/S-08 assume.

## Parked

- **Client-facing discovery wizard answering Lab-injected follow-up questions (formerly S-02, FR-002–004)** — Why parked: superseded 2026-09-19 (user decision) — the employee's flow ends at Send, no agent feedback follows. If Lab needs more information, admin resolves it while editing the mapping (S-03).
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

- **F-01: (foundation) Mercatify is installed as a standard OM module — its own feature flags, its own tenant- and organization-scoped interview case, the demo dataset seeded into that case, and the broad validation gates still green with no change to the core or enterprise packages.** — Archived 2026-09-19 → `context/archive/2026-09-19-mercatify-module-scaffold/`. Lesson: —.
- **F-02: (foundation) the interface between this module and Mercatify Lab is written down as a versioned contract — what the interview sends, what the analysis returns (further questions, mappings, decisions, confidence bands, amounts), and what the handoff carries — with one deterministic scripted adapter behind it, so every downstream slice can be built, demoed and tested without Lab existing.** — Archived 2026-09-19 → `context/archive/2026-09-19-mercatify-lab-analysis-contract/`. Lesson: —.
