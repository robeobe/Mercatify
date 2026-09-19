# Mocked Open Mercato surfaces

Static HTML stand-ins for demoing the flow while the real modules are still
being built. No build step, no server — open an `index.html` or `login.html` in
a browser.

## Two separate products

They are two apps, not two tabs of one. A client never reaches the console, and
the console has no link into the client's form. That mirrors Open Mercato
itself, where the customer portal and the staff backend are separate surfaces.

### `client/` — what the customer sees

| File | What it is |
|---|---|
| `login.html` | Client sign-in, branded to their tenant (Voltix Energy). A returning client lands on her requests, a first-time one on the form. |
| `intake.html` | The stack form, empty. Nothing else — sending files the request and takes her to it. |
| `requests.html` | Her requests as tiles, each carrying the one thing she came back for: where it got to, and whether the ball is with her or with us. |
| `request.html` | One request: what she sent, and a four-step track from *you sent your stack* to *you decide*. The map card appears here once a consultant actually sends it. |
| `offer.html` | The map itself. She reads it, then either accepts or asks for a call with Sales; her answer goes straight back to the console. |

Shell: a top bar with one link, *My requests*, and only once she has something
to come back to — an empty list would be a dead end on a first visit. The client
app reads only the refs under `mercatify.client.refs.v1`, never the queue, and a
ref in a URL that is not hers gives *Not found* rather than quietly showing her
a different request.

### `console/` — what Mercatify sees

| File | What it is |
|---|---|
| `login.html` | Staff sign-in, separate session from the client's. |
| `requests.html` | Every request that came in — one row per company, through to the client's answer. |
| `modules.html` | The mapping. The agent's pass is a starting point: under **Edit the mapping** every row's module, verdict and note is editable, edits are marked, and any row resets to what the agent proposed. Confirming closes it. |
| `report.html` | The report built from the confirmed mapping, with a preview of the client's page and the send button. |

Shell: the full staff sidebar and breadcrumbs.

### `shared/` — what both use

`om.css` (design system) and `om-core.js` (module catalog, capability map,
request store, both shells). Shared because both apps are Open Mercato surfaces
and the capability vocabulary has to agree across them.

Three of the files here are **generated and never edited by hand** — each says
so in its first line, and a test in `mercatify-labs` fails if the copy on disk
is not what the generator produces:

| File | Generated from | Refresh |
|---|---|---|
| `catalog.generated.js` | `mercatify-labs/src/catalogData.json` joined with the module structure in `stack-tool/catalog.js` | `npm run catalog:generate` |
| `report-renderer.generated.js` | `mercatify-labs/src/report/renderReport.ts` and its imports | `npm run renderer:generate` |

`report-model.js` is not generated: it is the adapter that turns a request (or
a stack-tool mapping) into the `ReportModel` the renderer eats. It is the only
place that decides what a mapping *cannot* say — see below.

### Mapping and reporting are not both available at once

The two verbs follow one state machine, read by the queue row, the mapping
screen and the report screen alike, so they cannot disagree about what is
possible next:

| Status | Queue row offers | Mapping | Report |
|---|---|---|---|
| `new` | Map | opens on arrival, which is what starts it | locked |
| `mapping` | Continue mapping | editable, autosaved | locked |
| `mapped` | Build report · Mapping | closed; reopens on request | available |
| `sent` | Report | closed; reopening is deliberate | resend replaces |
| `accepted` / `consult` | Report | closed | read-only history |

`mapped` is the gate. A report can only be built from a mapping somebody
confirmed — which is also what gives the consultant something to confirm, and
what makes `in mapping` last longer than a moment. Reopening a sent mapping does
not un-send it: the client keeps the version they were given until a new report
is sent on purpose.

## The loop

1. The client fills `client/intake.html` and sends → the request lands in the console queue as **new**.
2. A consultant opens `console/modules.html` — which moves the request to **in mapping** — and corrects whatever the agent got wrong. Changes save as they are made and the bar says so. **Confirm mapping** closes it and unlocks the report.
3. `console/report.html` writes the opening line and the closing note; everything else is derived from the mapping, so an edit in step 2 shows up here without a regenerate step. Reached before the mapping is confirmed, it sends you back instead. The preview calls the same renderer the client's page does, so what you see is the document itself.
4. **Send** → status **report sent**, and only now can the client see anything.
5. She sees it on her tile and on the request's track, reads it in `client/offer.html`, and either **accepts** or **asks for a call with Sales** → status **accepted** or **consult asked**, visible back in the queue.

### The report

**There is one renderer, and it is not here.** `console/report.html`,
`client/offer.html` and `stack-tool/report.html` all call
`window.renderReport(model)` from `shared/report-renderer.generated.js`, which
is `mercatify-labs/src/report/renderReport.ts` transpiled for the browser. The
console's preview and the client's page render the *same string* — byte for
byte, which is what makes "what you see is what they get" a fact rather than a
claim. Each page shows it in an iframe, because the document is a whole page
with its own stylesheet, and a preview that let the report restyle the console
around it would not be a preview of anything.

The document itself is the engine's: a cover, six KPI tiles, the scope and its
counters, the stack as invoiced, capability coverage with Figure 1 over it, the
money line by line, the sequence, the risks, the next steps and two appendices.
Sections whose data is missing **do not render** — they do not render empty.

**What a mapping cannot say.** A request in the queue carries tools, seats,
monthly cost, capability slugs and the consultant's overrides. It carries no
waves and no timed cash model, so `facts.waves` is empty and `facts.cash` is
left out: section 06 disappears and section 05 says, in words, that there is no
curve to plot. That is deliberate. A cash curve drawn through months nobody
stated would be the one figure in the document that nobody could recompute.

**The money.** A tool counts as a candidate to retire only when *every* job it
carries lands natively or by configuration. Anything with a build, integrate or
keep row still has a reason to exist, so counting its licence as saved would be
a lie; a tool that stays keeps costing what it costs, which is what *licences
after* is made of. Hours are never guessed — a build row with no estimate prints
as "to estimate" and the total says it is a floor, not a quote.

**What the consultant writes** goes into the prose half of the model: the
opening line becomes the recommendation on the cover, the closing note opens
section 09 above the signatures, and each open question becomes a row in section
08. The opening line may carry a `{slot}` — `{kpis.netRecurringAnnual}` prints
the computed figure — so a sentence can quote a number without authoring one.

## Writing

The client is a role, not a person: UI copy says *the client* or *they*, never
*she*. Labels name the consequence rather than the mechanic — a capability paid
for in two tools is **paid twice**, not "done twice", because what matters is
the second licence.

## Entry points

- `landing/index.html` — the marketing page; its CTAs open `client/login.html`.
- `console/login.html` — opened directly; it is not linked from anywhere public.

## What is real and what is mocked

- **Look** — tokens in `shared/om.css` are the shadcn neutral scale from
  `src/app/globals.css`, the login mirrors the real `auth/frontend/login.tsx`
  layout, and the brand mark uses the gradient from `public/open-mercato.svg`.
- **Module names** — every id in `OM_MODULES` is a real module folder in
  `@open-mercato/core`. Jobs nothing covers are shown as *build*, *integrate* or
  *keep* rather than pinned on a module that does not exist.
- **Tool catalog** — one vocabulary for every page, so the client's form and the
  console's mapping cannot disagree. Verdicts and Open Mercato targets come from
  `mercatify-labs/src/catalogData.json` through `shared/catalog.generated.js`;
  `stack-tool/catalog.js` keeps the helpers and the module structure the JSON has
  no room for (ids, names, descriptions, which slugs a module groups).
- **Everything else** — mocked. Requests live in `localStorage` under
  `mercatify.requests.v1`, on top of three seeded cases that keep the console
  from ever being empty. The client's own submission lands in that same store,
  which is how it shows up in the console. Mapping edits, reports and the
  client's answer go to `mercatify.patches.v1`, keyed by ref and applied over
  both seeded and submitted requests — the seeded ones are constants in the
  source and cannot be written back to. Nothing is sent anywhere.

## Resetting the demo

In the browser console:

```js
['mercatify.requests.v1', 'mercatify.patches.v1', 'mercatify.case.v1',
 'mercatify.client.refs.v1', 'mercatify.client.ref.v1',
 'mercatify.session.client.v1', 'mercatify.session.console.v1']
  .forEach(k => localStorage.removeItem(k))
```
