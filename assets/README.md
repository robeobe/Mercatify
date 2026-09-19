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
| `login.html` | Client sign-in, branded to their tenant (Voltix Energy). |
| `intake.html` | The stack form, empty. After sending, it becomes a read-only view of **her own** request and nothing else. |

Shell: a single top bar, no navigation. There is one thing to do here and the
chrome should not imply otherwise. The page reads only the ref stored under
`mercatify.client.ref.v1`; it has no way to list the queue.

### `console/` — what Mercatify sees

| File | What it is |
|---|---|
| `login.html` | Staff sign-in, separate session from the client's. |
| `requests.html` | Every request that came in — one row per company. |
| `modules.html` | The mapping: which Open Mercato modules pick the incoming jobs up, and what is left to build. |

Shell: the full staff sidebar and breadcrumbs.

### `shared/` — what both use

`om.css` (design system) and `om-core.js` (module catalog, capability map,
request store, both shells). Shared because both apps are Open Mercato surfaces
and the capability vocabulary has to agree across them.

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
  which is how it shows up in the console. Nothing is sent anywhere.

## Resetting the demo

In the browser console:

```js
['mercatify.requests.v1', 'mercatify.case.v1', 'mercatify.client.ref.v1',
 'mercatify.session.client.v1', 'mercatify.session.console.v1']
  .forEach(k => localStorage.removeItem(k))
```
