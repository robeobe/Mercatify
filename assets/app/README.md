# Mocked Open Mercato app

Static HTML stand-in for the Mercatify workspace, for demoing the flow while the
real modules are still being built. No build step, no server — open
`login.html` in a browser.

## The flow

| Screen | File | What it is |
|---|---|---|
| 1. Sign in | `login.html` | Fake Open Mercato login. Any email and password get you in; the "session" is a localStorage entry. |
| 2. Stack intake | `intake.html` | The stack tool inside the app shell — for now the intake view only. The client ticks tools and modules, then sends. |
| 3. Stack requests | `requests.html` | Internal queue of everything that was sent. One row per company. |
| 4. Module coverage | `modules.html` | The mapping screen: which Open Mercato modules pick up the incoming jobs, and what is left to build. |

`assets/landing/index.html` sends its "Start mapping" buttons to `login.html`,
so the whole path from the marketing page to the mapping is clickable.

## What is real and what is mocked

- **Look** — tokens in `om.css` are the shadcn neutral scale from
  `src/app/globals.css`, the login mirrors the real `auth/frontend/login.tsx`
  layout, and the brand mark uses the gradient from `public/open-mercato.svg`.
- **Module names** — every id in `OM_MODULES` (`app.js`) is a real module folder
  in `@open-mercato/core`. Jobs nothing covers are shown as *build*, *integrate*
  or *keep* rather than pinned on a module that does not exist.
- **Tool catalog** — reused from `../stack-tool/catalog.js`, so the intake and
  the mapping speak one capability vocabulary.
- **Everything else** — mocked. Requests live in `localStorage` under
  `mercatify.requests.v1`, on top of three seeded cases that keep the queue from
  ever being empty. Nothing is sent anywhere.

## Resetting the demo

Run this in the browser console to drop submitted requests, the saved draft and
the session:

```js
['mercatify.requests.v1', 'mercatify.case.v1', 'mercatify.session.v1']
  .forEach(k => localStorage.removeItem(k))
```
