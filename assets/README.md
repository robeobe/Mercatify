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
| `modules.html` | The mapping. The agent's pass is a starting point: under **By capability** every row's module, verdict and note is editable, edits are marked, and any row resets to what the agent proposed. |
| `report.html` | The report built from that mapping, with a preview of the client's page and the send button. |

Shell: the full staff sidebar and breadcrumbs.

### `shared/` — what both use

`om.css` (design system) and `om-core.js` (module catalog, capability map,
request store, both shells). Shared because both apps are Open Mercato surfaces
and the capability vocabulary has to agree across them.

## The loop

1. The client fills `client/intake.html` and sends → the request lands in the console queue as **new**.
2. A consultant opens `console/modules.html`, corrects whatever the agent got wrong, and moves on to the report.
3. `console/report.html` writes the opening line and the closing note; everything else is derived from the mapping, so an edit in step 2 shows up here without a regenerate step. The preview calls the same renderer the client's page does, so what you see is the document itself.
4. **Send** → status **report sent**, and only now can the client see anything.
5. She sees it on her tile and on the request's track, reads it in `client/offer.html`, and either **accepts** or **asks for a call with Sales** → status **accepted** or **consult asked**, visible back in the queue.

### The money in the report

A tool counts as a candidate to retire only when *every* job it carries lands
natively or by configuration. Anything with a build, integrate or keep row still
has a reason to exist, so counting its licence as saved would be a lie. On the
seeded Voltix case that comes out as €1,510/mo from three fully-covered tools,
with HubSpot staying because its marketing side is not ours to take.

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
- **Tool catalog** — reused from `stack-tool/catalog.js`, so the client's form
  and the console's mapping speak one capability vocabulary.
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
