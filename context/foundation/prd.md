---
project: "Mercatify"
version: 1
status: draft
created: 2026-09-19
context_type: brownfield
product_type: web-app   # No change — Mercatify is a module inside the existing Open Mercato admin (web)
target_scale: null      # TODO: target_scale — see Open Questions
timeline_budget:
  delivery_weeks: 1
  hard_deadline: null     # TODO: hard_deadline — see Open Questions (HackOn 2026 date not captured)
  after_hours_only: null  # TODO: after_hours_only — see Open Questions
---

# Mercatify — PRD

Generated 2026-09-19 from `context/foundation/shape-notes.md` (brownfield, quality check `warned`). This PRD covers **Mercatify (module 1)** only; **Mercatify Lab** is a separate module with its own shape session.

## Current System Overview

Source: the user-provided spec (`2026-09-18-mercatify.md`) and the repository the user pointed at (https://github.com/open-mercato/open-mercato — README and `packages/` tree, read 2026-09-19).

- **System purpose:** Open Mercato — open-source "AI-Engineering Foundation Framework"; a modular CRM/ERP/commerce platform with ready-made domain modules ("start at 80% done").
- **Key architecture:** modular monolith. Each feature is a module under `src/modules/<module>` with auto-discovered frontend/backend pages, APIs, CLI, i18n and DB entities; overlay overrides.
- **Tech stack:** Next.js App Router, TypeScript, zod, Awilix DI (container per request), MikroORM (per-module entities and migrations, no global schema), bcryptjs/JWT sessions, feature-based RBAC, multi-tenant by default (`directory` module: tenants + organizations; entities carry `tenant_id` + `organization_id`), custom entities & dynamic forms, event subscribers / workflows, hybrid JSONB indexing.
- **Current user base:** not captured in this session (see Open Questions). The persona affected by this change is described below.
- **Core functionality — the module registry** (the "real OM module registry" the change is grounded in):
  - `packages/core/src/modules`: api_docs, api_keys, attachments, audit_logs, auth, business_rules, catalog, communication_channels, configs, core, currencies, customer_accounts, customers, dashboards, data_sync, design_system, devices, dictionaries, directory, entities, eudr, feature_toggles, inbox_ops, integrations, messages, notifications, payment_gateways, perspectives, phone_calls, planner, portal, progress, push_notifications, query_index, resources, sales, seeds, shipping_carriers, staff, sync_excel, translations, warranty_claims, widgets, wms, workflows.
  - `packages/enterprise/src/modules`: agent_orchestrator, record_locks, sso, system_status_overlays.
  - Infrastructure packages (not domain modules): ai-assistant, cache, channel-* (apns, discord, expo, fcm, gmail, imap, resend, ses), checkout, cli, content, documents, events, gateway-stripe, onboarding, queue, scheduler, search, shared, starter, storage-s3, sync-akeneo, telemetry, tillio, ui, web-research(-*), webhooks.
- **Agent Orchestrator** (per the spec): v0.8.0 — runs, traces, proposal→approval.

## Problem Statement & Motivation

**Pain.** An SMB owner / management team trialing Open Mercato sits in the OM admin with their existing SaaS stack in mind and gets no answer to the question that decides the purchase: *which of my current SaaS tools does OM replace, with what confidence, and what does that save me net?* Today they must work it out themselves — or don't. (Cost of the status quo was not quantified — see Open Questions.)

**What changes.** Mercatify, a new module, runs an interview about the SaaS tools in use, their functions and costs, and shows the client a summary — which of those tools are replaced by existing OM modules, each with a justification, a confidence band and a net saving — grounded in the real OM module registry. The analysis behind the summary is performed by **Mercatify Lab**, a separate module/product; from the summary the client hands the plan to Lab with a "Run in Mercatify Lab" button, and Lab implements it. Preview screens, golden path and implementation belong to Lab, not to this module.

**Why now.** The occasion is the HackOn 2026 hackathon (team of 6). The moment the module serves is the trial: the client is deciding whether adopting OM is worth it.

**Insight** (adopted from the spec's tagline, in the user's words): *"Your SaaS stack is already your specification."* The status quo asks "what ERP do you need?"; Mercatify asks "what SaaS do you use today?" — the live stack already encodes real processes and real costs, so it is the specification.

## User & Persona

**Primary persona:** Owner / management of an SMB that is **trialing Open Mercato**.

- **Context:** logged into the OM admin on a trial tenant; runs the company on a handful of SaaS tools today.
- **What they know:** their SaaS monthly costs (from invoices) and what each tool is actually used for; they make the purchase decision.
- **Moment:** during the trial, when deciding whether adopting OM is worth it — they want to know what OM replaces for them and at what net saving.
- **Existing users whose experience changes:** none — the module is additive; existing OM users see no change unless the Mercatify feature is enabled for them.

No secondary persona captured. (Consultant / OM pre-sales personas were offered and not selected.)

## Success Criteria

### Primary
- On the demo dataset, the wizard runs end-to-end inside the OM admin of a trial tenant **with no manual fixing** (no time limit): the client opens Mercatify → sees the starting point (company profile, SaaS tools in use with monthly costs) → answers discovery questions step by step (chips, plus a free-text field); questions injected by Mercatify Lab's analysis keep coming until the analysis decides nothing is missing (bounded to a few questions) → sees the final summary: a table filled by the analysis (each capability / tool → a real OM module or an external tool, one decision native / configure / build / integrate / keep, a justification, a confidence band), the net annual saving with SaaS saving, OM operating cost and implementation cost as separate lines, and below it the `.md` configuration document in an edit window → edits it or pastes their own → clicks **Run in Mercatify Lab** and the current `.md` is handed to Lab (or, without Lab installed, sees what would be handed over).
- On the demo path the analysis questions and results are scripted (deterministic); the UI is the real dynamic wizard.

### Secondary
- **Live analysis path**: questions and the summary come live from Mercatify Lab instead of the scripted demo path. (Restates the earlier "real interview when time allows" stretch for the wizard shape — user to confirm; see Open Questions.)
- Further stretch: scenario toggle (one consolidation scenario recomputes the net saving).

### Guardrails
- **Confidence is always a band** — High / Medium / Low — never a percentage or any other false precision, regardless of what the analysis returns.
- **Existing Open Mercato keeps working unchanged** (preserved behavior): Mercatify is purely additive — own entities, own pages, own feature flags, own database changes. A Mercatify failure means Mercatify is down; no existing OM module, page, API or test changes behavior.

## User Stories

### US-01: Client turns their SaaS stack into a plan for Mercatify Lab

- **Given** a client logged into the OM admin of a trial tenant with the Mercatify feature enabled, and the demo starting point loaded (company profile, SaaS tools with monthly costs)
- **When** they answer the wizard's discovery questions (chips, optional free text) until the analysis decides nothing is missing, review the summary, and click "Run in Mercatify Lab"
- **Then** they have seen the analysis-filled table (each capability / tool → real OM module or external tool, one decision, justification, confidence band), the net annual saving with three separate lines, and the `.md` configuration document — and the current content of the `.md` (after their edits or paste) is handed to Lab, or shown as what would be handed over when Lab is not installed

*Before this change:* nothing comparable exists — a trialing client has no place in OM to turn their SaaS stack into a mapping and a plan.

#### Acceptance Criteria
- Every table row names a module that exists in the OM module registry, or an external tool when the decision is keep / integrate; unmapped items are visibly flagged, never dropped.
- Confidence appears only as High / Medium / Low.
- Savings show SaaS saving, OM operating cost and implementation cost as separate lines; payback is measured against net.
- What Lab receives is exactly the `.md` content as the client last left it.
- No manual fixing during the run; no time limit.

## Scope of Change

Everything below is **new** except FR-014, which is **preserved** (a defensive requirement). Nothing is modified or removed in the existing system. Socratic round: FR-001…FR-003 were challenged (blocks below); the user ended the round there — FR-004…FR-015 are unchallenged (see Open Questions).

### Intake
- [new] FR-001: Client can open Mercatify in the OM admin of their tenant and see the interview starting point: the company profile and the set of SaaS tools in use with their monthly costs. Priority: must-have
  > Socratic: Counter-arguments offered: "costs up front scare a trial client — ask at the end"; "company profile is a redundant screen"; "a ready dataset masks that the product cannot start from scratch." Resolution: no counter-argument accepted; stands as written.

### Wizard (interview loop)
- [new] FR-002: Client can answer discovery questions step by step (wizard) by clicking chips. Priority: must-have
  > Socratic: Counter-arguments offered: "chips limit answers to what was anticipated"; "a wizard with an unknown number of steps frustrates"; "a single form page would be faster." Resolution: no counter-argument accepted; stands as written.
- [new] FR-003: Client can see further questions injected dynamically by Mercatify Lab's analysis whenever it decides it lacks information — the loop is bounded to a few questions and ends when the analysis decides nothing is missing or the bound is reached. Priority: must-have
  > Socratic: Counter-argument considered: "an analysis is never 'sure it has everything' — an unbounded loop ends arbitrarily or never." Resolution: modified — user: "ogranicz do kilku pytań" (limit to a few questions); exact cap not set, see Open Questions.
- [new] FR-004: Client can add additional information in a generic free-text field. Priority: must-have

### Summary
- [new] FR-005: Client can see, once the analysis has everything, a table filled by the analysis: each capability / tool → a real OM module from the registry (or an external tool when the decision is keep / integrate), one decision (native / configure / build / integrate / keep), a justification and a confidence band. Priority: must-have
- [new] FR-006: Client can see in the table what the analysis did NOT map to an existing OM module, visibly flagged — never silently dropped. Priority: must-have
- [new] FR-007: Client can see the net annual saving with three separate lines (SaaS saving, OM operating cost, implementation cost) and payback measured against net. Priority: must-have
- [new] FR-008: Client can edit the analysis-filled table before the handoff. Priority: must-have
- [new] FR-009: Client can toggle one consolidation scenario and see the net saving recomputed. Priority: nice-to-have

### Handoff document
- [new] FR-010: Client can see, below the table, a `.md` configuration file with every detail Mercatify Lab needs for implementation, in an edit window. Priority: must-have
- [new] FR-011: Client can edit that file or paste in a whole file prepared elsewhere. Priority: must-have
- [new] FR-012: Client can click "Run in Mercatify Lab"; the input document handed to Lab is the current content of the `.md` file. Priority: must-have
- [new] FR-013: Client can see, when Mercatify Lab is not installed, what would have been handed over — not an error. Priority: must-have

### Request tracking and report delivery
> **Added 2026-09-19** (gap found while planning `mercatify-intake-start`'s follow-up slices, cross-checked against `assets/console/requests.html`, `assets/console/report.html`, `assets/client/requests.html`, `assets/client/request.html`, `assets/client/offer.html`): FR-001…FR-013 describe a single request end to end but never say how either side finds it among several, how the report itself gets built and sent (distinct from the `.md` handoff document in FR-010/011), or how the client comes back to answer it. These four requirements close that gap; they do not change FR-001…FR-013.
- [new] FR-016: Admin can see a queue of every submitted request, filterable by status, with the one next action per request (map / continue mapping / build report / report) surfaced directly on the row. Priority: must-have
- [new] FR-017: Client can see a list of their own submitted requests, each showing whose turn it is — with Mercatify or with them — and can reopen any one of them to see what was sent and its current status. Priority: must-have
- [new] FR-018: Admin can build a report from a confirmed mapping (FR-005/006/008) — the net saving lines (FR-007) alongside a tool-by-tool table with confidence bands, duplicates and the implementation backlog — and send it to the client. Priority: must-have
- [new] FR-019: Client can see the sent report and either accept it or ask for a consultation call; their answer is visible back to the admin. Priority: must-have

### Preserved / module conformance
- [preserved] FR-014: Existing OM users can use every existing module, page and API unchanged after Mercatify is installed. Priority: must-have
- [new] FR-015: OM operator can install Mercatify as a standard module (auto-discovered pages, APIs, entities, features) with no change to the core or enterprise packages. Priority: must-have

## Constraints & Compatibility

- **Purely additive module.** Own entities, own pages, own feature flags, own database changes. No change to the core or enterprise packages. Existing OM modules, pages, APIs and tests keep working unchanged (FR-014).
- **Existing module conventions respected.** The module layout, custom entities, feature-based access control, tenant/organization scoping and per-module database changes described in Current System Overview; Mercatify must pass OM auto-discovery as a standard module (FR-015).
- **Backward compatibility.** No existing API contract, data format or URL changes. Auth and roles unchanged: existing OM login, sessions and tenancy; no new roles; the module is gated by its own feature flags.
- **Data.** No existing data is moved or transformed; the module introduces only its own entities. Its data is tenant/organization-scoped like every other OM entity.
- **Dependency on Mercatify Lab.** The analysis (question generation, mapping, summary) is produced by Lab. The interface — what the interview sends, what the analysis returns (mappings, decisions, bands, amounts), and what "Run in Mercatify Lab" hands over — is a contract to be written before work is split (see Open Questions). On the demo path Lab's questions and analysis are scripted / deterministic.
- **Handoff contract.** The input document to Lab is exactly the current content of the `.md` configuration file as the client last left it (edited or pasted). When Lab is not installed, Mercatify shows what would have been handed over instead of failing.
- **Blast radius:** none outside the module — a Mercatify failure means only Mercatify is down.

## Business Logic Changes

# TODO: domain rule — see Open Questions

Not confirmed in the shaping session. What the user's own material says, recorded with provenance and **not** confirmed for this module after the split into Mercatify / Mercatify Lab:

- **Candidate one-sentence rule (from the spec):** every capability of every SaaS tool gets exactly one of five decisions — native / configure / build / integrate / keep — and the saving shown is always net of Open Mercato's operating cost.
- **Saving formula (from the spec, "formula is fixed"):**
  `grossAnnualSaving = Σ (monthlyCost of replaced tools) × 12`;
  `netAnnualSaving = grossAnnualSaving − omOperatingCost`;
  `netPaybackMonths = implementationCost / (netAnnualSaving / 12)`.
  SaaS saving, OM operating cost and implementation cost are reported as separate lines, never blended; payback is measured against net. All costs are customer-provided.
- **Where the rule applies is open:** the user decided that *the analysis lives in Mercatify Lab*. Whether the mapping and the saving are computed inside Mercatify or delivered by Lab — and therefore whether they are this module's business logic or a contract requirement on Lab — is an Open Question.
- **Confidence** is delivered and displayed only as a band (High / Medium / Low) — see Guardrails.

## Access Control Changes

No access control changes — current model preserved.

- **Current model:** existing OM sessions; feature-based access control (per-role and per-user feature flags); strict tenant/organization scoping on every entity and API.
- **How the persona reaches Mercatify:** as a logged-in OM admin user of their (trial) tenant. The module gates its pages and APIs with its own feature flags, per the existing convention — no new access mechanism, no access without an OM account.
- **Roles inside the module:** flat. Anyone holding the Mercatify feature in their tenant can run the interview, see and edit the summary, and hand off to Lab. Explicitly not chosen: a split between "fills the interview" and "sees the savings"; a dedicated role that maintains the SaaS→OM-module map in the UI.

## Non-Goals

Derived from decisions the user made in the shaping session:

- **Not building the preview, golden path or implementation.** Generated OM-admin preview screens, the Lead → Customer → Deal → Quote golden path, lead submit creating customer / deal / quote, and executing the plan all belong to Mercatify Lab — a separate module with its own shape session.
- **Not building the analysis itself.** Question generation, capability→module mapping and the summary are produced by Lab; Mercatify collects, displays, lets the client edit, and hands off.
- **No changes to OM auth, tenancy or roles**, and no dedicated role or UI for maintaining the SaaS→OM-module map.
- **No progress indicator** for the wizard — the number of steps is unknown by design.
- **No time-limit target** — the spec's "< 5 minutes" was dropped; the Primary criterion is "runs with no manual fixing".
- **No live analysis on the demo path** — the demo runs on scripted questions and analysis; live analysis is the first stretch (Secondary).
- **No free-form entry of the client's own SaaS stack in the MVP** — the demo starts from a ready dataset (offered as a counter-argument to FR-001; user kept FR-001 as written).
- **No hardcoded example company or industry-specific steps** baked into the module — Mercatify is a general solution.

## Open Questions

1. **What is the one-sentence business rule for this module?** — TBD by user. Block: yes (PRD is hollow until resolved). A spec-derived candidate is recorded in Business Logic Changes; it must be confirmed or replaced.
2. **Mercatify ↔ Mercatify Lab contract** — what the interview sends to the analysis, what the analysis returns (mappings, decisions, bands, amounts), what "Run in Mercatify Lab" hands over; where the spec's iron rules (catalog as lookup, money computed deterministically) live — inside Lab or as a contract requirement. Owner: team. By: before work is split at the hackathon.
3. **Source of OM operating cost** (from the seed) — who provides the number behind the "OM operating cost" line. Owner: user / team.
4. **Source of implementation cost** (from the seed) — who provides the number behind the "implementation cost" line. Owner: user / team.
5. **Who maintains the SaaS-capability → OM-module map** (from the seed) — narrowed: not a separate role in v1, no editor in the UI. Owner: team.
6. **Interview depth** (from the seed) — partly shaped as a wizard loop bounded to a few questions; how deep the questions go per tool is open. Owner: team.
7. **Question cap in the wizard loop (FR-003)** — user said "a few"; exact number to be fixed in planning. Owner: team.
8. **Table ↔ `.md` file** — does editing the table regenerate the `.md`, or are they independent artifacts (with the `.md` as the only handoff document)? Owner: team.
9. **Non-functional requirements not captured** — response-time expectations for the wizard and the analysis round-trip, handling of free-text answers and pasted `.md` content (sensitive data), browser support, retention. Consequence: the PRD has no measurable quality targets beyond the two guardrails. Owner: team.
10. **Product framing not captured** — `target_scale` (how many tenants / trialing clients), `hard_deadline` (HackOn 2026 date), `after_hours_only`. Consequence: frontmatter carries TODO placeholders. Owner: user.
11. **Socratic round for FR-004…FR-015** — ended by the user after FR-003; those FRs stand as drafted without a recorded counter-argument. Owner: user (optional).
12. **Live analysis path as the Secondary criterion** — the skill restated the earlier "real interview when time allows" stretch for the wizard shape; user to confirm. Owner: user.
13. **Current OM user base** — not captured; Current System Overview is incomplete on "who uses it today, rough scale". Non-blocking for this additive module. Owner: user.
14. **Cost of the status quo** — how much the trialing client loses today by working the mapping out alone (or not at all) was not quantified. Owner: user.
