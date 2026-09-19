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

**Applies to**: `src/modules/mercatify/api/cases/route.ts`, `lib/case-list-filters.ts`, `/backend/requests`.
