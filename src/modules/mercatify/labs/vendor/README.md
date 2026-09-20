# mercatify-labs (vendored)

This directory is an unmodified-as-possible copy of the `mercatify-labs`
package from branch `feat/mercatify-report-pipeline` (GitHub PR
[robeobe/Mercatify#33](https://github.com/robeobe/Mercatify/pull/33)) at
commit range up to `89c2205` on `main`.

It is a framework-agnostic, dependency-free (only `node:fs`/`node:path`)
TypeScript library: a deterministic capability-matching + ROI engine, plus a
portable agent/tool-spec layer for an optional LLM-authored "prose" pass. It
has **no Open Mercato dependency** and is not itself an OM module — the thin
adapter/route/UI code that wires it into this app's request flow lives one
level up, in `src/modules/mercatify/labs/`.

## Why vendored instead of a package dependency

`mercatify-labs` is not published to a registry; it lives in this fork's own
`mercatify-labs/` top-level folder on a different branch. Copying its `src`,
`agents/`, and `tools/` here (verbatim, tests/CLIs/examples excluded) is the
only option short of a git submodule, which this repo does not otherwise use.

## What was left out

Only `mercatify-labs/src/__tests__/**`, `mercatify-labs/bin/**`,
`mercatify-labs/examples/**`, and `mercatify-labs/scripts/**` were dropped —
none of them are imported by `buildReport`, the single entry point this app
calls (see `../adapter.ts` and `../../commands/requests.ts`).

## Do not hand-edit

Treat this folder like `node_modules`: fixes belong upstream, on
`feat/mercatify-report-pipeline`. If a local patch is unavoidable (e.g. a
path-resolution quirk under Next.js bundling), note it in the file itself and
in this README, rather than silently drifting from the source PR.

## Entry point

`vendor/src/index.ts` re-exports the public API. The only function this app
calls directly is `buildReport()` from `vendor/src/report/buildReport.ts`:
called without `llmClient` it is fully deterministic (facts only — "Analizuj
Labs"); called with one (an `OpenAiCompatibleLlmClient` pointed at OpenRouter)
it also produces agent-authored prose ("Analizuj Labs z AI"). Every number in
`facts` still comes from a pure function either way — see that file's own
header comment for the three guarantees this package makes.

## Runtime file reads

`agentLoader.ts` reads `agents/*.json` and `tools/*.json` via
`fs.readdirSync` at call time (not bundled as static imports). If this app
ever moves to `output: 'standalone'`, add
`src/modules/mercatify/labs/vendor/{agents,tools}` to
`outputFileTracingIncludes` in `next.config.ts` — Next's dependency tracer
cannot see a dynamic `fs.readdirSync` call.

**Another noted local patch**: `report/buildReport.ts` had two `for (const
module of tool.modules)` loops. This app's ESLint config includes Next.js's
`@next/next/no-assign-module-variable` rule, which fails the build on any
local binding named `module` (it shadows webpack's own module-wrapper
variable). Both loops (and every reference inside them) were renamed to
`mod` — a pure rename, no behaviour change. Reapply on any resync.

**One noted local patch**: upstream resolves the package root as
`join(__dirname, '..')`. This app's OpenAPI generator bundles route files
(and their transitive imports, including this one) into a single ESM module
for schema extraction, where `__dirname` is undefined and the bundle throws.
`next dev`/`next build` run this file as CommonJS and never hit that path, so
the break was generator-only — but the fix (`join(process.cwd(),
'src/modules/mercatify/labs/vendor')`) resolves identically and correctly in
every context this app actually runs it in. If this file is ever resynced
from upstream, reapply this one-line change.

**Another noted local patch**: `llmClient.ts`'s `OpenAiCompatibleLlmClient`
never sent `max_tokens`. OpenRouter defaults an omitted `max_tokens` to the
target model's own maximum completion length (65536+ tokens for large modern
models), then runs a pre-flight "could this account afford the worst case"
balance check against *that* number — which 402s a low- or modest-balance key
even though the actual completion would cost a fraction of a cent. Confirmed
against the live API: the identical request succeeds once `max_tokens` is set
to something modest (verified with `max_tokens: 200`) and 402s without it, on
both a large model (`openai/gpt-5.6-luna`, default 65536) and a small one
(`openai/gpt-4o-mini`, default 16384) — so this hits every model, not a
specific one. Added an optional `maxTokens` field to
`OpenAiCompatibleLlmClientOptions` (default `8000`) and send it as `max_tokens`
on every call. `labsAnalyzeWithAiCommand` forwards an optional `maxTokens`
from the request so a consultant on a well-funded key can raise it for a very
large-context model — but raising it does not fix a near-empty account
balance, it only avoids the artificial worst-case pre-check; the real
per-request cost is still `actual_output_tokens × price`. Reapply on resync.

**Another noted local patch**: `llmClient.ts` sent `strict: true` on every
agent's `response_format.json_schema`. OpenAI's strict structured-output mode
requires every object in the schema to declare `additionalProperties: false`
and a `required` array covering *every* key in `properties` (an optional
field must be modeled as nullable, not simply left out of `required`). A
schema audit of all 14 `agents/*.json` found 7 that violate this
(`saas_auditor`, `process_analyst`, `om_architect`, `finops`,
`consolidation_strategist`, `catalog_curator` — see each file's own
`resultSchema`). Confirmed live: `openai/gpt-5.6-luna` enforces strict
validation and returned a 400 ("Invalid schema for response_format ...") for
every one of those agents before generating anything at all, while
`openai/gpt-4o-mini` tolerated the same schemas without complaint — so the
break is model-dependent, not universal, which is why it wasn't caught
earlier. Rather than hand-patching 7 schema files (risking a semantics change
for the genuinely-optional fields, e.g. `process_analyst`'s `frequency`),
`strict` was flipped to `false`. `response_format: json_schema` still sends
the schema as a best-effort guide either way; this app's own degradation
handling (each narrative step's individual try/catch) already tolerates a
response that doesn't perfectly match it. Reapply on resync, or fix the 7
schemas upstream and revert this once they're strict-mode-compliant.
