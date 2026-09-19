---
project: "Mercatify"
context_type: brownfield
created: 2026-09-19
updated: 2026-09-19
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "context type"
      decision: "brownfield — Mercatify is a new module inside the existing Open Mercato application (github.com/open-mercato/open-mercato). cwd was empty at detection time (no OM checkout yet); user asked the skill to decide; brownfield chosen because the stack is dictated by OM and the downstream chain is stack-assess → health-check."
    - topic: "scope authority (seed vs spec)"
      decision: "deferred to Phase 3 — user has not decided whether the narrow seed (interview → evaluation list) or the full spec (agents + HTML preview + golden path) is the contract"
    - topic: "must preserve in Open Mercato"
      decision: "existing OM modules untouched (Mercatify is purely additive: own module, own entities, no changes to core/enterprise); OM module conventions respected (module layout, custom entities, RBAC, tenancy, per-module migrations — must pass auto-discovery as a legal module)"
    - topic: "change category"
      decision: "new module (from seed: 'Moduł Open Mercato')"
    - topic: "primary persona"
      decision: "owner / management of an SMB that is trialing Open Mercato (trial tenant, inside OM admin); knows monthly SaaS costs from invoices and makes the purchase decision"
    - topic: "insight"
      decision: "spec tagline adopted verbatim: 'Your SaaS stack is already your specification' — ask 'what SaaS do you use today?', not 'what ERP do you need?'"
    - topic: "auth strategy"
      decision: "no change — existing OM login, sessions and tenant/organization scoping reused; no access without an OM account"
    - topic: "roles"
      decision: "no new roles — module gated by its own feature flags per OM convention; flat model inside the module (no interview-vs-evaluation split, no dedicated module-map maintainer role)"
    - topic: "scope authority (seed vs spec) — resolved"
      decision: "spec DoD (12 steps) is the MVP flow, generalized: no hardcoded Voltix, no industry-specific steps/entities baked into the model; Mercatify is a general solution"
    - topic: "SaaS catalog breadth"
      decision: "curated sample list of SaaS tools and their OM modules for MVP (lookup); not open-ended LLM mapping"
    - topic: "interview in MVP"
      decision: "hardcoded interview with a ready set of SaaS tools, modules and costs; a real interview is added only if time allows (stretch)"
    - topic: "golden path"
      decision: "fixed CRM path for every client: Lead → Customer → Deal → Quote (no industry-specific step such as Site Survey)"
    - topic: "delivery time"
      decision: "≤ 2 days (classic hackathon), team of 6 → delivery_weeks: 1"
    - topic: "interview UX in MVP"
      decision: "discovery questions are displayed and clicked through, but answers (chips) are pre-selected from the ready dataset; editable answers are a stretch"
    - topic: "scope vs 2 days"
      decision: "scope down, agents kept: MVP = DoD steps 1–7 + generated preview with click-through golden path (no writes); stretch = scenario toggle (step 8), lead submit creating customer/deal/quote in preview (steps 10–11), editable interview"
    - topic: "secondary criterion"
      decision: "editable interview is first in the stretch queue; scenario toggle and lead-submit-with-writes follow, unordered"
    - topic: "guardrails"
      decision: "user selected: confidence only as bands (High/Medium/Low, never a percentage). Skill added from Phase 1 must-preserve + blast-radius answer: existing OM works unchanged (purely additive module). Not selected as guardrails: deterministic numbers, net-only savings — to be revisited as FR / business logic in Phases 4–5"
    - topic: "blast radius"
      decision: "none outside the module — purely additive (own entities, pages, features); Mercatify failure ⇒ only Mercatify is down"
    - topic: "project split (2026-09-19, during Phase 4)"
      decision: "user split the project into two separate modules: (1) Mercatify — runs the interview, shows the summary and the mapping to existing OM modules, with a button 'Run in Mercatify Lab'; (2) Mercatify Lab — a set of agents used for requirements analysis during the interview and for implementing those requirements. Phases 3–4 to be revised for module 1; Lab scoped separately"
    - topic: "session scope after split"
      decision: "this shape session / PRD covers Mercatify (module 1) only; Mercatify Lab gets its own shape session later; the boundary is what the 'Run in Mercatify Lab' button hands over"
    - topic: "dependency on Mercatify Lab"
      decision: "analysis lives in Lab — Mercatify collects the interview and displays the result, but the mapping and summary are produced by Lab's analysis agents; module 1 does not show a summary without Lab"
    - topic: "'Run in Mercatify Lab' button in MVP"
      decision: "hands the plan (case: mappings, decisions, scenario) to Lab if installed; otherwise shows what would be handed over (no error)"
    - topic: "preserved FRs"
      decision: "one defensive FR (existing OM modules, pages and APIs unchanged) is sufficient — module is additive"
    - topic: "interview shape (2026-09-19, user's description during Phase 4)"
      decision: "wizard with an agent-driven loop: discovery questions can appear again after an evaluation pass; Lab's agents decide whether they need more information and inject questions dynamically; client clicks chips (optionally adds free text) and moves to the next step; when the agent decides nothing is missing it shows the final summary. Mockups for these steps exist."
    - topic: "final summary artifacts"
      decision: "(1) a table filled by the agent (mapping, decision, confidence etc.) editable by a human; (2) below it a configuration file (.md) with everything Lab needs for implementation, shown in an edit window — client can edit or paste a whole file prepared elsewhere; that .md is the input document to Mercatify Lab"
    - topic: "wizard in MVP — live vs scripted (supersedes 'hardcoded interview')"
      decision: "dynamic wizard UI; on the demo path the agents' questions and analysis are scripted/deterministic; the demo dataset (profile, SaaS tools, costs) is the starting point"
    - topic: "progress indicator"
      decision: "dropped (former FR-005) — the number of wizard steps is unknown, so a progress view has nothing to show"
    - topic: "free-text field"
      decision: "must-have — the agent must be able to receive information not anticipated in the chips"
    - topic: "time limit"
      decision: "none — the spec's '< 5 min' is dropped; Primary = the flow runs with no manual fixing"
    - topic: "socratic round"
      decision: "user ended the round after FR-003 ('Już mamy co potrzebujemy'); FR-004…FR-015 left unchallenged"
    - topic: "phases 5–6"
      decision: "skipped at the user's request; Business Logic, NFRs, Constraints, Non-Goals and product framing were filled only from content the user had already provided (spec + session decisions); gaps are marked TODO and routed to Open Questions"
  frs_drafted: 15
  quality_check_status: warned
product_type: web-app   # No change — Mercatify is a module inside the existing OM admin (web)
target_scale: null      # TODO — not captured; see Open Questions
timeline_budget:
  delivery_weeks: 1
  hard_deadline: null
  after_hours_only: null
---

# Shape notes — Mercatify

## Seed

Verbatim seed passed to `/10x-shape` (2026-09-19):

> Moduł Open Mercato: wywiad o używanych SaaS-ach, ich funkcjach i kosztach → lista ewaluacji, które z nich zastępują istniejące moduły OM, z uzasadnieniem, pasmem pewności i oszczędnością netto. Zespół 6 osób, hackathon HackOn 2026. Katalog docelowy oparty o rzeczywisty rejestr modułów OM. Nierozstrzygnięte: głębokość wywiadu, kto utrzymuje mapę modułów, źródło kosztu operacyjnego OM i kosztu wdrożenia.

Seed document read in full: `/Users/alek/Downloads/2026-09-18-mercatify.md` (spec draft "Mercatify — SaaS-to-Open-Mercato consolidation, run by an AI company", HackOn 2026 Track 02, changelog 2026-09-18).

Target system: Open Mercato — https://github.com/open-mercato/open-mercato

## Current System

Source: user-provided spec (`2026-09-18-mercatify.md`) and the repository the user pointed at (https://github.com/open-mercato/open-mercato — README + `packages/` tree, read 2026-09-19). User confirmed the summary by not correcting it.

- **Purpose:** Open Mercato — open-source "AI-Engineering Foundation Framework"; modular CRM/ERP/commerce platform with ready-made domain modules ("start at 80% done").
- **Architecture:** modular monolith. Each feature is a module under `src/modules/<module>` with auto-discovered frontend/backend pages, APIs, CLI, i18n and DB entities; overlay overrides.
- **Tech stack:** Next.js App Router, TypeScript, zod, Awilix DI (container per request), MikroORM (per-module entities and migrations, no global schema), bcryptjs/JWT sessions, feature-based RBAC, multi-tenant by default (`directory` module: tenants + organizations; entities carry `tenant_id` + `organization_id`), custom entities & dynamic forms, event subscribers / workflows, hybrid JSONB indexing.
- **Module registry (the "real OM module registry" the seed refers to):**
  - `packages/core/src/modules`: api_docs, api_keys, attachments, audit_logs, auth, business_rules, catalog, communication_channels, configs, core, currencies, customer_accounts, customers, dashboards, data_sync, design_system, devices, dictionaries, directory, entities, eudr, feature_toggles, inbox_ops, integrations, messages, notifications, payment_gateways, perspectives, phone_calls, planner, portal, progress, push_notifications, query_index, resources, sales, seeds, shipping_carriers, staff, sync_excel, translations, warranty_claims, widgets, wms, workflows.
  - `packages/enterprise/src/modules`: agent_orchestrator, record_locks, sso, system_status_overlays.
  - Infrastructure packages (not domain modules): ai-assistant, cache, channel-* (apns, discord, expo, fcm, gmail, imap, resend, ses), checkout, cli, content, documents, events, gateway-stripe, onboarding, queue, scheduler, search, shared, starter, storage-s3, sync-akeneo, telemetry, tillio, ui, web-research(-*), webhooks.
- **Agent Orchestrator** (per spec): v0.8.0 — runs, traces, proposal→approval.
- **Current user base:** not discussed in this session; not load-bearing for this module. The persona affected by the change is captured below.

## Vision & Problem Statement

Delta-framed: what this new module adds to Open Mercato and why.

**Pain.** An SMB owner / management team trialing Open Mercato sits in the OM admin with their existing SaaS stack in mind and gets no answer to the question that decides the purchase: *which of my current SaaS tools does OM replace, with what confidence, and what does that save me net?* Today they must work it out themselves — or don't. (Cost of the status quo was not quantified in this session.)

**What the module adds** (from the seed, revised 2026-09-19 after the split into two modules): Mercatify (this module) runs an interview about the SaaS tools in use, their functions and costs, and shows the client a summary — which of those tools are replaced by existing OM modules, each with a justification, a confidence band and a net saving — grounded in the real OM module registry. The analysis behind that summary is performed by the agents of **Mercatify Lab**, a separate module/product; from the summary the client hands the plan to Lab with a "Run in Mercatify Lab" button, and Lab's agents implement it. Preview screens, golden path and implementation belong to Lab, not to this module.

**Insight** (adopted from the spec's tagline, user's words): *"Your SaaS stack is already your specification."* The status quo asks "what ERP do you need?"; Mercatify asks "what SaaS do you use today?" — the live stack already encodes real processes and real costs, so it is the specification.

## User & Persona

**Primary persona:** Owner / management of an SMB that is **trialing Open Mercato**.

- **Context:** logged into the OM admin on a trial tenant; runs the company on a handful of SaaS tools today.
- **What they know:** their SaaS monthly costs (from invoices) and what each tool is actually used for; they make the purchase decision.
- **Moment:** during the trial, when deciding whether adopting OM is worth it — they want to know what OM replaces for them and at what net saving.

No secondary persona captured. (The spec frames Mercatify as an "AI consolidation company"; the user chose the trialing client as the person at the keyboard. Consultant / OM pre-sales personas were offered and not selected.)

## Access Control

No changes planned — current model preserved.

- **Current OM model** (from repo): JWT sessions; feature-based RBAC (per-role and per-user feature flags); strict tenant/organization scoping on every entity and API.
- **How the persona reaches Mercatify:** as a logged-in OM admin user of their (trial) tenant. The module gates its pages and APIs with its own feature flags, per OM convention — no new access mechanism.
- **Roles inside the module:** flat. Anyone holding the Mercatify feature in their tenant can run the interview and see the evaluation. Explicitly not chosen: a split between "fills the interview" and "sees the savings"; a dedicated role that maintains the SaaS→OM-module map in the UI.
- **Data scoping:** follows from the preserved conventions — Mercatify entities are tenant/organization-scoped like every other OM entity.

## Success Criteria

Revised 2026-09-19 (twice): after the split into Mercatify / Mercatify Lab, and after the user described the wizard loop and the summary artifacts.

### Primary
- On the demo dataset, the wizard runs end-to-end inside the OM admin of a trial tenant **with no manual fixing** (no time limit): the client opens Mercatify → sees the starting point (company profile, SaaS tools in use with monthly costs) → answers discovery questions step by step (chips, plus a free-text field); questions injected by Mercatify Lab's analysis agents keep coming until the agent decides nothing is missing → sees the final summary: an agent-filled table (each capability / tool → a real OM module or an external tool, one decision native / configure / build / integrate / keep, a justification, a confidence band), the net annual saving with SaaS saving, OM operating cost and implementation cost as separate lines, and below it the `.md` configuration document in an edit window → edits it or pastes their own → clicks **Run in Mercatify Lab** and the current `.md` is handed to Lab (or, without Lab installed, sees what would be handed over).
- On the demo path the agents' questions and analysis are scripted (deterministic); the UI is the real dynamic wizard.

### Secondary
- **Live analysis path**: the agents' questions and the summary come live from Mercatify Lab instead of the scripted demo path. (Restates the earlier "real interview when time allows" stretch for the wizard shape — user to confirm.)
- Further stretch: scenario toggle (one consolidation scenario recomputes the net saving).
- Moved out of this module to Mercatify Lab: generated OM-admin preview, golden path Lead → Customer → Deal → Quote, lead submit creating customer / deal / quote.

### Guardrails
- **Confidence is always a band** — High / Medium / Low — never a percentage or any other false precision, regardless of what the analysis returns.
- **Existing Open Mercato keeps working unchanged** (preserved behavior; from Phase 1 must-preserve and the blast-radius answer): Mercatify is purely additive — own entities, own pages, own feature flags, own migrations. A Mercatify failure means Mercatify is down; no existing OM module, page, API or test changes behavior.

### Working notes — interview shape (user, 2026-09-19)
Steps "questions" and "evaluation" may run several times. Discovery questions can appear after an evaluation pass; the agents decide whether they need more information and dynamically inject questions that Mercatify displays. The client clicks through them wizard-style. When the agent has all the information and decides nothing is missing, it shows the final summary. Mockups for these steps exist. A generic free-text field for additional information is included. The final summary is a table filled by the agent (with confidence etc.) editable by a human; below it a configuration file with all the details Lab needs for implementation, shown as an .md file in an edit window — the user can edit it or paste a whole file prepared elsewhere. Only that .md is the input document to Mercatify Lab.

### Scope decision (2-day hackathon, team of 6)
- Scope-cost surfaced on 2026-09-19: the full 12-step spec DoD is bigger than a 2-day hackathon typically ships. User first chose scope-down with agents kept; then **split the project into two modules** — Mercatify (interview + summary + mapping + handoff) and Mercatify Lab (analysis and implementation agents). This session covers Mercatify. `timeline_budget.delivery_weeks: 1`.
- Dependency accepted by the user: Mercatify's Primary depends on Lab's analysis agents (scripted on the demo path) — both modules must be ready for the demo.

## Functional Requirements

Format: `FR-NNN: [Actor] can [capability]. Priority: must-have | nice-to-have. Change: new | modified | preserved`. Drafted 2026-09-19 from the locked MVP flow and the user's description; accepted by the user with edits (progress indicator removed, free text must-have).

Socratic round: FR-001…FR-003 challenged (blocks below); the user ended the round there — FR-004…FR-015 are unchallenged.

### Intake
- FR-001: Client can open Mercatify in the OM admin of their tenant and see the interview starting point: the company profile and the set of SaaS tools in use with their monthly costs. Priority: must-have. Change: new
  > Socrates: Counter-arguments offered: "costs up front scare a trial client — ask at the end"; "company profile is a redundant screen"; "a ready dataset masks that the product cannot start from scratch." Resolution: no counter-argument accepted; stands as written.

### Wizard (interview loop)
- FR-002: Client can answer discovery questions step by step (wizard) by clicking chips. Priority: must-have. Change: new
  > Socrates: Counter-arguments offered: "chips limit answers to what the agent anticipated"; "a wizard with an unknown number of steps frustrates"; "a single form page would be faster." Resolution: no counter-argument accepted; stands as written.
- FR-003: Client can see further questions injected dynamically by Mercatify Lab's analysis agents whenever the analysis decides it lacks information — the loop is bounded to a few questions and ends when the agent decides nothing is missing or the bound is reached. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: "an agent is never 'sure it has everything' — an unbounded loop ends arbitrarily or never." Resolution: modified — user: "ogranicz do kilku pytań" (limit to a few questions); exact cap not set in this session, to be fixed in planning.
- FR-004: Client can add additional information in a generic free-text field. Priority: must-have. Change: new

### Summary
- FR-005: Client can see, once the analysis has everything, a table filled by the agent: each capability / tool → a real OM module from the registry (or an external tool when the decision is keep / integrate), one decision (native / configure / build / integrate / keep), a justification and a confidence band. Priority: must-have. Change: new
- FR-006: Client can see in the table what the analysis did NOT map to an existing OM module, visibly flagged — never silently dropped. Priority: must-have. Change: new
- FR-007: Client can see the net annual saving with three separate lines (SaaS saving, OM operating cost, implementation cost) and payback measured against net. Priority: must-have. Change: new
- FR-008: Client can edit the agent-filled table before the handoff. Priority: must-have. Change: new
- FR-009: Client can toggle one consolidation scenario and see the net saving recomputed. Priority: nice-to-have. Change: new

### Handoff document
- FR-010: Client can see, below the table, a `.md` configuration file with every detail Mercatify Lab needs for implementation, in an edit window. Priority: must-have. Change: new
- FR-011: Client can edit that file or paste in a whole file prepared elsewhere. Priority: must-have. Change: new
- FR-012: Client can click "Run in Mercatify Lab"; the input document handed to Lab is the current content of the `.md` file. Priority: must-have. Change: new
- FR-013: Client can see, when Mercatify Lab is not installed, what would have been handed over — not an error. Priority: must-have. Change: new

### Preserved / module conformance
- FR-014: Existing OM users can use every existing module, page and API unchanged after Mercatify is installed. Priority: must-have. Change: preserved
- FR-015: OM operator can install Mercatify as a standard module (auto-discovered pages, APIs, entities, features) with no change to core / enterprise. Priority: must-have. Change: new

## User Stories

### US-01: Client turns their SaaS stack into a plan for Mercatify Lab

- **Given** a client logged into the OM admin of a trial tenant with the Mercatify feature enabled, and the demo starting point loaded (company profile, SaaS tools with monthly costs)
- **When** they answer the wizard's discovery questions (chips, optional free text) until the analysis agents decide nothing is missing, review the summary, and click "Run in Mercatify Lab"
- **Then** they have seen the agent-filled table (each capability / tool → real OM module or external tool, one decision, justification, confidence band), the net annual saving with three separate lines, and the `.md` configuration document — and the current content of the `.md` (after their edits or paste) is handed to Lab, or shown as what would be handed over when Lab is not installed

#### Acceptance Criteria
- Every table row names a module that exists in the OM module registry, or an external tool when the decision is keep / integrate; unmapped items are visibly flagged, never dropped.
- Confidence appears only as High / Medium / Low.
- Savings show SaaS saving, OM operating cost and implementation cost as separate lines; payback is measured against net.
- What Lab receives is exactly the `.md` content as the client last left it.
- No manual fixing during the run; no time limit.

## Business Logic

# TODO: domain rule — see Open Questions

Not confirmed in this session (Phase 5 skipped by the user). What the user's own material says, recorded with provenance and **not** confirmed for this module after the split:

- **Candidate one-sentence rule (from the spec, §5.3/§6):** every capability of every SaaS tool gets exactly one of five decisions — native / configure / build / integrate / keep — and the saving shown is always net of Open Mercato's operating cost.
- **ROI formula (from the spec §5.3, "formula is fixed"):**
  `grossAnnualSaving = Σ (monthlyCost of replaced tools) × 12`;
  `netAnnualSaving = grossAnnualSaving − omOperatingCost`;
  `netPaybackMonths = implementationCost / (netAnnualSaving / 12)`.
  SaaS saving, OM operating cost and implementation cost are reported as separate lines, never blended; payback is measured against net. All costs are customer-provided.
- **Where the rule executes is open:** the user decided (Phase 4) that *the analysis lives in Mercatify Lab*. Whether the mapping lookup and the ROI formula run inside Mercatify or inside Lab — and therefore whether they are this module's business logic or a contract requirement on Lab — is Open Question #5.
- **Confidence** is delivered and displayed only as a band (High / Medium / Low) — see Guardrails.

## Non-Functional Requirements

Not captured in this session (Phase 5 skipped by the user). Only what follows from decisions already made:

- Confidence is shown to the client only as High / Medium / Low — never a percentage (guardrail, user-selected).
- Installing Mercatify changes no externally observable behavior of any existing OM module, page or API (preserved behavior, user-selected).
- # TODO: response-time expectations for the wizard and the analysis round-trip, data handling of free-text answers and pasted `.md` content, browser support, retention — see Open Questions.

## Constraints & Preserved Behavior

Collected from Phases 1–4 (the user did not run a dedicated Phase 5 round):

- **Purely additive module.** Own entities, own pages, own feature flags, own migrations. No change to `packages/core` or `packages/enterprise`. Existing OM modules, pages, APIs and tests keep working unchanged (FR-014).
- **OM module conventions respected.** Module layout under `src/modules/<module>`, custom entities, feature-based RBAC, tenant/organization scoping, per-module MikroORM migrations; Mercatify must pass OM auto-discovery as a standard module (FR-015).
- **Auth and roles unchanged.** Existing OM login, sessions and tenancy; no new roles; module gated by its own feature flags.
- **Dependency on Mercatify Lab.** The analysis (question generation, mapping, summary) is produced by Lab's agents. The interface — what the interview sends, what the analysis returns (mappings, decisions, bands, amounts), and what "Run in Mercatify Lab" hands over — is a contract to be written before work is split (Open Question #5). On the demo path Lab's questions and analysis are scripted / deterministic.
- **Handoff contract.** The input document to Lab is exactly the current content of the `.md` configuration file as the client last left it (edited or pasted). When Lab is not installed, Mercatify shows what would have been handed over instead of failing.
- **No data migration** of existing OM data is involved; Mercatify introduces only its own entities.
- **Blast radius:** none outside the module — a Mercatify failure means only Mercatify is down.

## Non-Goals

Derived from decisions the user made in this session (Phase 6 round not run):

- **Not building the preview, golden path or implementation.** Generated OM-admin preview screens, the Lead → Customer → Deal → Quote golden path, lead submit creating customer / deal / quote, and executing the plan all belong to Mercatify Lab — a separate module with its own shape session.
- **Not building the analysis itself.** Question generation, capability→module mapping and the summary are produced by Lab's agents; Mercatify collects, displays, lets the client edit, and hands off.
- **No changes to OM auth, tenancy or roles**, and no dedicated role or UI for maintaining the SaaS→OM-module map.
- **No progress indicator** for the wizard — the number of steps is unknown by design.
- **No time-limit target** — the spec's "< 5 minutes" was dropped; the Primary criterion is "runs with no manual fixing".
- **No live analysis on the demo path** — the demo runs on scripted agent questions and analysis; live analysis is the first stretch (Secondary).
- **No free-form entry of the client's own SaaS stack in the MVP** — the demo starts from a ready dataset (offered as a counter-argument to FR-001; user kept FR-001 as written).

## Quality cross-check

Run 2026-09-19 at the user's request to close the session (`quality_check_status: warned`). Each gap named with its consequence so `/10x-prd` can mirror it into `## Open Questions`:

- **Business Logic:** not captured as a confirmed one-sentence rule — the PRD's Business Logic Changes section will carry the spec-derived candidate marked TODO; until confirmed the PRD is hollow on *what this module decides*.
- **Non-Functional Requirements:** not captured — the PRD will have no measurable quality targets beyond the two guardrails.
- **Product framing:** `target_scale`, `hard_deadline` (HackOn 2026 date) and `after_hours_only` not captured — PRD frontmatter gets TODO placeholders.
- **Socratic round:** FR-004…FR-015 unchallenged — those FRs stand as drafted without a recorded counter-argument.
- Present: Access Control; Project artifacts; Timeline-cost (delivery_weeks 1 ≤ 3; scope-cost surfaced and resolved by splitting the project); Non-Goals; Preserved behavior.

## Forward: tech-stack

Informational for the downstream stack-assessment step — NOT part of the PRD.

- Platform is dictated: Mercatify is a module inside the existing Open Mercato monorepo (Next.js App Router, TypeScript, MikroORM, Awilix DI, zod). No stack selection to make; the step after PRD is `10x-stack-assess` against OM's conventions.
- Spec says Mercatify runs *on* OM (dogfooding): every case/artifact as an OM custom entity; agents under OM's Agent Orchestrator (v0.8.0). Spec also points at OM agent skills (`open-mercato/skills`) for custom entities, CRUD API, tests.
- Team: 6 people, hackathon HackOn 2026 (Track 02 — AI Company).
- The working directory `/Users/alek/Projects/Mercatify` was empty at shape time — an OM checkout / fork is expected to land here before stack-assess / health-check can run.

## Forward: technical-roadmap

Informational — NOT part of the PRD.

- Mockups exist for the wizard steps (user, 2026-09-19); location not captured in this session.
- Mercatify Lab (separate module/product): analysis agents used during the interview + implementation agents that execute the plan from the .md handoff document. Preview screens, golden path Lead → Customer → Deal → Quote and lead submit moved there from the original spec. Needs its own `/10x-shape`.

## Open Questions

Carried from the seed (unresolved at intake; to be resolved or routed to PRD Open Questions):

1. Głębokość wywiadu o SaaS-ach.
2. Kto utrzymuje mapę modułów (SaaS capability → OM module). *Zawężone w Fazie 2:* nie jest to osobna rola RBAC w v1 — mapa nie ma dedykowanego edytora w UI.
3. Źródło kosztu operacyjnego OM.
4. Źródło kosztu wdrożenia.
5. **Kontrakt Mercatify ↔ Mercatify Lab** (dodane 2026-09-19 po podziale): co wywiad wysyła do analizy, co analiza zwraca (mapowania, decyzje, pasma, kwoty), co przekazuje przycisk „Run in Mercatify Lab”; gdzie żyją żelazne zasady speca (katalog jako lookup, LLM nie liczy pieniędzy) — po stronie Lab czy jako wymaganie kontraktu. Właściciel: zespół; termin: przed podziałem pracy na hackathonie.
7. **Reguła biznesowa modułu 1** — potwierdzić (lub zastąpić) kandydata ze speca: „każda capability dostaje dokładnie jedną z pięciu decyzji; oszczędność zawsze netto kosztu operacyjnego OM”. Właściciel: użytkownik. Blokuje: PRD jest puste bez decyzji domenowej.
8. **NFR** — czas odpowiedzi wizarda i rundy analizy, postępowanie z wolnym tekstem i wklejonym .md (dane wrażliwe), przeglądarki, retencja. Właściciel: zespół.
9. **Ramowanie produktu** — `target_scale` (ile tenantów/klientów w trialu), `hard_deadline` (data HackOn 2026), `after_hours_only`. Właściciel: użytkownik.
10. **Sokrates FR-004…FR-015** — runda przerwana przez użytkownika; FR stoją bez zapisanego kontrargumentu. Właściciel: użytkownik (opcjonalnie).
11. **Limit pytań w pętli wizarda (FR-003)** — użytkownik: „kilka”; dokładna liczba do ustalenia w planowaniu. Właściciel: zespół.
6. **Tabela ↔ plik .md** (dodane 2026-09-19): czy edycja tabeli regeneruje plik .md, czy są to niezależne artefakty (a .md jest jedynym dokumentem wsadowym)? Właściciel: zespół.
