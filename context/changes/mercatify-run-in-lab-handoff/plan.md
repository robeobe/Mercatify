# Plan — S-06 / issue #22: Accept hands the document to Lab, not-installed first

Change ID: `mercatify-run-in-lab-handoff`. Roadmap S-06, PRD US-01 / FR-012 / FR-013.

Prerequisites shipped: S-05 (`InterviewCase.handoffDocument` + admin editor), S-10
(`mercatify.cases.answer`), F-02 (`MercatifyLabPort`).

## Routing (three-axis)

- Ownership: `module-data` (app-owned entity field, command, API) + `backend-ui` (the
  admin panel that renders the not-installed outcome).
- Work units: entity/migration (`om-data-model-design`), command/API (`om-module-scaffold`),
  read-back panel (`om-backend-ui-design`), unit tests alongside the command.
- Delivery: `direct` — S-06 is a roadmap slice with a written change.md and an issue with
  acceptance criteria; no new architecture, no cross-module contract beyond the module's own
  additive port export.

## Constraints that shape the design

1. **The trigger is Accept, not a button.** `mercatify.cases.answer` (S-10) is the only writer
   of `accepted`, so the handoff hangs off it. No new client-facing control.
2. **Exactly the current `.md`.** The handoff reads `InterviewCase.handoffDocument` at
   handoff time and never regenerates from the mapping table — PRD Open Question 8 resolved
   the two as independent artifacts.
3. **The document is admin-only.** S-05 reassigned the `.md` to the admin role, and
   `api/handoff-document/route.ts` is deliberately gated on `mercatify.handoff.view` so a
   session holding only `mercatify.cases.view` (the client) never receives it. FR-013's
   "see what would have been handed over" is therefore rendered on the **admin** handoff
   screen, not on the client's report screen. The client's Accept still succeeds normally —
   they see their existing acceptance confirmation, never an error and never a spinner.
4. **Lab does not exist.** Not-installed is the default state of the port registry, so it is
   the path the demo runs, and delivery failure can never fail the client's Accept.

## Phases

### 1. Handoff contract on the F-02 port (`lib/mercatify-lab-port.ts`)

Additive exports next to the existing `MercatifyLabPort`:
`MercatifyHandoffSchema` (`contractVersion: 1`, scope, `caseId`, `title`, `document`),
`MercatifyLabHandoffPort { receiveHandoff(h): Promise<void> }`,
`registerMercatifyLabHandoffPort()` / `getMercatifyLabHandoffPort()`.
Unlike `evaluate`, **nothing registers a default**: an unregistered port *is* "Lab is not
installed", which is what F-02 left open to this slice.

### 2. Outcome on the case (`data/entities.ts` + migration)

`labHandoffStatus` (`delivered | not_installed | no_document | failed`), `labHandoffDocument`
(the snapshot of exactly what was handed over) and `labHandoffAt`. A snapshot rather than a
re-read of `handoffDocument`, so a later admin edit can never rewrite history.

### 3. The handoff itself (`lib/lab-handoff.ts`)

`handOffToLab()` — resolve the port; no port → `not_installed`; blank document →
`no_document` (nothing was prepared, still not an error); port throws → `failed`, logged.
Returns the outcome plus the document in every branch.

### 4. Wire it to Accept (`commands/client-answer.ts`)

After the status write commits and only for `answer === 'accepted'`: run the handoff, persist
the outcome in a second write, put it in the command result and the audit snapshot. Wrapped
so the client's answer stands even if Lab misbehaves.

### 5. Admin read-back (`api/handoff-document/route.ts`, `HandoffDocumentEditor.tsx`)

List route returns the three new fields; the editor renders a panel above the document:
delivered → success, not installed → an informational panel titled "Mercatify Lab is not
installed" with the handed-over content in a `<pre>`, no-document → a note. All three are
normal outcomes; none is an `Alert status="error"`.

### 6. Tests

`lib/lab-handoff.test.ts` (four branches, port receives exactly the current text) and new
cases in `commands/__tests__/client-answer.test.ts` (accept stores the snapshot, consult
hands over nothing, a throwing port does not break the answer).

## Not doing

- No client-facing render of the `.md` (constraint 3), no "Run in Mercatify Lab" button
  (constraint 1), no regeneration from the mapping table (constraint 2).
- No new module event: `mercatify.case.answered` already marks the moment.
- No Lab-side receiver — Lab does not exist; phase 1 is the seam it plugs into.
