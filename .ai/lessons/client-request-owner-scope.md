---
title: "Client request lists are owner-scoped on the server"
modules: ["mercatify"]
areas: ["module-data", "backend-ui"]
topics: ["data-scoping", "acl"]
---

# Client request lists are owner-scoped on the server

**Context**: Issue #17 / S-08 adds a client “my requests” list on the staff backend. Employees already hold `mercatify.cases.manage` for intake, so a view-vs-manage feature split cannot hide other people’s cases.

**Problem**: Filtering only in the UI (or treating `cases.manage` as “own records”) lets an employee call `GET /api/mercatify/cases` and read every case in the organization.

**Rule**: Stamp `createdByUserId` from `auth.sub` on create. Callers without `mercatify.mapping.view` are always filtered to that owner. `mine=true` additionally excludes drafts and still requires an actor id. Never key this on role names.

The same rule governs client-facing *writes* and *single-record reads*, where there is no list to filter: issue #21 / S-10 gates `mercatify.cases.answer` and `GET /api/mercatify/cases/report/client` on `createdByUserId === auth.sub` inside the command/route, and treats a case with no recorded owner as nobody's — the feature only gets you to the route.

**Applies to**: `src/modules/mercatify/api/cases/route.ts`, `api/cases/answer/route.ts`, `api/cases/report/client/route.ts`, `commands/client-answer.ts`, `lib/case-list-filters.ts`, `/backend/requests`.
