<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Spark — Production Engineering Contract

Spark is a Next.js application. Treat requested features as production code. Apply security and integration rules when those capabilities are present; these rules do not request adding authentication, billing, AI, or other product features.

Canonical policy for all coding agents in this repository. `CLAUDE.md` imports
this file rather than maintaining a second copy.

- **P0:** security, authorization, billing, secrets, privacy, and data integrity.
  Violations block completion.
- **P1:** architecture and API boundaries. New code must comply; touched legacy
  must not expand a known violation.
- **P2:** engineering defaults. Deviations need a stated reason.

Read any more-specific `AGENTS.md` governing the files being changed. Report
conflicts instead of silently choosing the weaker rule.
For review, explanation, diagnosis, or planning requests, inspect and report only.
Do not commit, push, deploy, or touch production data unless explicitly requested.

## Simplicity and avoiding generated code bloat

- Make the smallest coherent patch. Search for existing components, hooks,
  utilities, API clients, and dependencies before adding another.
- One use case does not justify a new abstraction unless an existing boundary
  requires it. Avoid speculative extensibility, wrapper components with no
  purpose, and generic frameworks for a single feature.
- Keep state minimal; derive values instead of synchronizing duplicate state
  through effects. Use an effect only for synchronization with an external system.
- Reuse existing design tokens and UI patterns. Do not introduce a new visual
  language, decorative sections, animations, or filler copy outside the request.
- If a patch grows well beyond the feature, reassess the approach. Deleting code
  is a valid outcome; do not refactor unrelated code.
- Never suppress a check just to pass. A necessary narrow suppression needs a
  nearby reason; repository-wide suppressions are prohibited.

## Before changing code

1. Read `package.json`, the affected implementation, its callers, and nearby tests.
2. For Next.js behavior, read the relevant documentation in `node_modules/next/dist/docs/`. Do not rely on remembered Next.js APIs.
3. Check `git status` and preserve unrelated user changes.
4. Trace the complete flow across UI, API client, route handler, and any server or external service before changing a shared contract.
5. For cross-cutting or high-risk work, state the intended behavior, failure modes, and verification plan before implementation.

Do not add a runtime dependency, change authentication, alter billing or credit semantics, change a public API contract, introduce persistence, or modify deployment configuration unless the user explicitly requested that scope.

## Production invariants

A change is incomplete unless it is secure, observable, testable, accessible, and failure-safe.

Never:

- expose server secrets through `NEXT_PUBLIC_*`, client components, responses, URLs, or logs;
- create example, fixture, test, or documentation credentials that resemble
  plausible production secrets. Use conspicuous placeholders such as
  `FAKE_API_KEY_FOR_TESTS_ONLY`, with any required prefix or length supplied by
  repeated, obviously synthetic text rather than random, UUID-like, or
  provider-shaped values;
- put access or refresh tokens in URLs, `localStorage`, or `sessionStorage`;
- treat decoded JWT contents as proof of authentication;
- rely on client-side checks for authorization, billing, ownership, or credit enforcement;
- accept an external URL without SSRF-safe validation of protocol, resolved IP, redirects, and response size;
- use process-local memory as durable or shared production storage;
- add an unbounded collection, upload, request body, stream, retry loop, or cache;
- log tokens, authorization headers, cookies, complete prompts, transcripts, payment data, or personal information;
- silently fall back to development services in production;
- swallow errors without either user feedback, an intentional fallback, or observable reporting;
- use `any`, unchecked type assertions, or non-null assertions to bypass an uncertain boundary;
- add a new direct backend request from a component when an API client or server boundary already exists;
- weaken lint, TypeScript, tests, or security rules merely to make a change pass.

## Authentication and authorization

- Browser authentication must use server-issued `HttpOnly`, `Secure`, appropriately `SameSite` cookies.
- OAuth callbacks must exchange short-lived codes server-side. Tokens must not appear in query parameters.
- Every protected server route must authenticate the request and authorize the specific resource or operation.
- Expensive AI, billing, upload, media-session, and mutation endpoints require rate limiting.
- State-changing cookie-authenticated endpoints require CSRF protection or a documented same-origin design.
- Development login routes must be impossible to enable accidentally in production.

If legacy browser token storage is encountered, do not extend it. Move the affected path toward server-managed sessions or report the migration dependency.

## API and external-boundary rules

All untrusted inputs must be validated at the boundary:

- route parameters;
- query parameters;
- JSON bodies;
- uploaded files;
- backend responses;
- environment variables;
- external URLs;
- persisted browser data;
- SSE and WebRTC messages.

Validation must cover shape, length, allowed values, and total size. Return stable error codes and safe user-facing messages. Do not return raw upstream errors or internal exception text.

Network calls must define, where relevant:

- authentication and authorization;
- timeout and cancellation behavior;
- retry policy;
- idempotency behavior;
- maximum request and response size;
- safe error mapping;
- logging and trace correlation.

Retries are allowed only for safe or idempotent operations. Mutation retries require an idempotency key.

## Architecture

Use these boundaries as features require them; do not create empty folders or
placeholder layers. Spark currently starts with `app/` and `public/`.

- `app/` owns routing, layouts, server boundaries, and route handlers.
- `components/` owns presentation and feature UI.
- `lib/api/` owns typed backend communication.
- `lib/server/` owns server-only configuration, secrets, and integrations.
- `lib/types/` owns shared contracts, but backend responses must still be runtime-validated.
- Business authorization, billing enforcement, and durable state belong on the backend.

Components should not duplicate authentication, billing, routing, or error-handling logic. Extract shared behavior into the appropriate boundary.

Use Server Components by default. Add `"use client"` only when browser APIs, effects, or interactive state require it.

## Complexity ratchet

Existing large files are legacy debt, not a pattern to copy.

- New components should normally stay below 300 lines.
- New functions should normally stay below 60 lines.
- Do not make a file over 800 lines larger without explaining why extraction is unsafe.
- When materially changing a large file, extract at least one cohesive state machine, hook, utility, or subcomponent when practical.
- Do not split code into meaningless wrapper files merely to satisfy a line count.
- Prefer explicit state machines or reducers for multi-stage async flows such as chat jobs, uploads, recording, billing, and WebRTC sessions.

## React and UI rules

- Effects must have correct dependencies; never suppress hook warnings without a written reason.
- Async effects must handle cancellation and stale results.
- Loading, empty, partial, error, offline, retry, and permission-denied states are first-class states.
- Preserve keyboard access, focus behavior, semantic labels, and visible focus indicators.
- Interactive controls must use semantic elements.
- Do not use color alone to communicate status.
- Avoid layout shift and unnecessary client-side rendering.
- Use `next/image` for product images unless a documented technical constraint prevents it.

## Testing requirements

Test observable behavior, not implementation text.

Do not add source-regex tests except for a deliberate architectural invariant that cannot reasonably be tested through behavior.

Every bug fix requires a regression test that fails before the fix. Every new behavior requires tests for:

- the successful path;
- validation or permission failure;
- relevant network or backend failure;
- cancellation, retry, or stale-result behavior when asynchronous;
- boundary values for size, count, or timing limits.

Changes to authentication, billing, uploads, external URL fetching, AI proxying, SSE, recording, or WebRTC require focused integration tests.

Critical customer journeys require browser-level coverage when introduced,
including sign-in, paid operations, editing and persistence, and other essential
user flows. Add tests for the actual feature rather than copying ScriptStack tests.

Tests must not contact real production services or spend real AI or billing credits.

## Required verification

The canonical repository gate is:

```sh
npm run check
```

`npm run check` currently runs, in order:

1. Node.js hook regression tests (`test`);
2. ESLint with zero warnings (`lint:gate`);
3. Next.js route type generation and strict TypeScript checking (`typecheck`);
4. the production build (`build`).

Spark uses the built-in Node.js test runner for Git hook regression tests.
The macOS GUI PATH cases require Node.js/npm installed in a standard location
(`/opt/homebrew/bin` or `/usr/local/bin`) and are skipped on other platforms.
Spark browser tests in `scripts/spark.test.mjs` use Playwright with the Node.js
test runner and run through the existing `test` command. Run `npx playwright
install chromium` once locally; CI installs Chromium and system dependencies
before `check`. To use an installed Chrome locally, run
`PLAYWRIGHT_CHANNEL=chrome npm run check`. The browser suite starts a temporary Next.js dev server on port
3187, so stop any existing dev server for this checkout before running it.
There is no generated API contract pipeline.
When implementing behavior, add appropriate test tooling and meaningful tests,
wire automated tests into `check` and CI, and update this section. Do not add a
placeholder test command or claim tests passed when no tests exist. Add contract
checks only if a real generation pipeline is introduced.

Do not change quality-gate configuration unless the requested task concerns it.

The versioned `.githooks/pre-commit` runs `npm run precommit` (zero-warning
ESLint and route type generation/TypeScript) before each commit. `npm install`
and `npm ci` install it through `prepare` in local Git checkouts; run
`npm run prepare` to reinstall. CI skips hook installation and runs `check`.
The hook checks the working tree, not an isolated staged snapshot; partial
staging still requires reviewing the staged diff and PR CI. It does not run
builds, behavioral tests, secret scanning, or independent agent review. Local
hooks can be bypassed and do not replace the full gate.

Before every commit, inspect the complete staged diff and run the repository's
configured secret scanner, if present. Do not commit until every credential-like
value is confirmed to be either a legitimate non-secret identifier or an
unmistakably fake placeholder. Treat realistic-looking generated API keys,
tokens, UUID-like credentials, and provider-shaped test values as failures even
when they are not active secrets; replace them with conspicuously synthetic
values before committing. This agent-side check is required even when the Git
hook does not perform secret scanning.

Run focused tests while developing, then run the complete gate before declaring completion.

If `npm run check` does not exist or is not green, report that as repository infrastructure debt. Do not claim that a change is fully verified.

For user-visible critical flows, also run the relevant browser tests.

## Dependencies

Before adding a package:

1. demonstrate that existing platform or repository capabilities are insufficient;
2. check maintenance, license, bundle impact, and server/client compatibility;
3. prefer a small focused package over a large framework;
4. obtain approval for every new production dependency;
5. commit the lockfile with the manifest.

Never hand-edit the lockfile.

## Observability and privacy

- Use structured event names and correlation IDs.
- Record operation, status, duration, and safe identifiers.
- Redact secrets and user content by default.
- User-visible failures need an actionable message and a traceable server event.
- Expected failures are not logged as crashes.
- Analytics and AI tracing must not collect private content without an explicit product decision.

## Definition of done

1. Confirm the requested behavior and run focused behavioral tests while iterating.
2. Run `npm run check`; run relevant browser tests for critical user-visible flows.
3. Dispatch a separate review sub-agent using `docs/independent-review.md` to
   inspect the actual diff against `docs/code-review-checklist.md`.
4. Verify each finding against the code. Fix valid findings; explain rejected
   findings instead of silently dropping them. P0 findings block completion.
5. Perform a separate simplification-only pass with behavior held fixed. Remove
   unnecessary one-caller helpers, single-implementation abstractions, redundant
   state, speculative props, dead branches, and unused files. Preserve boundaries
   that provide a concrete benefit. If nothing can shrink, say so and move on.
6. After fixes or simplification, re-run `npm run check` and any affected browser
   tests. Have the reviewer check the subsequent changes and finding resolutions.
   An earlier green result or review does not verify a changed tree.
7. Report what changed, checks actually run, and remaining risks. Never claim a
   check passed without observing its output. If a required check cannot run,
   report the blocker and any substitute; do not claim full verification.

Documentation-only changes require reviewing the diff and verifying referenced
paths and commands; the application test/build gate is not required unless
application behavior, configuration, or tooling also changes.

## Independent review delegation

- For implementation tasks, the coordinating agent must delegate review to a
  separate sub-agent when that capability is available. Use a fresh context and
  the bounded handoff in `docs/independent-review.md`, not the implementation
  conversation history. Documentation-only changes may use the same process.
- Reviewers inspect and report only. They do not edit, commit, launch additional
  reviewers, or own the implementation's definition-of-done loop.
- Keep the reviewed files stable while review runs. The coordinator owns fixes,
  simplification, verification, and the final report.
- Maximum two review rounds per implementation task: the initial review and one
  follow-up. Stop earlier when complete. Do not reset the count by replacing the
  reviewer or splitting the same work into new tasks. After round two, report
  unresolved findings or changes still needing independent review and ask the
  user how to proceed; do not start a third round without explicit authorization.
  The limit never waives blocking findings or permits a false completion claim.
- If delegation is unavailable or fails, report that independent review did not
  complete. Self-review is a useful fallback but must not be labeled independent.
- Include the review scope, findings and dispositions, follow-up review outcome,
  and check results in the final response or PR. This is an agent workflow rule;
  the existing CI gate does not enforce that a separate reviewer was used.

## Legacy-code policy

Apply these rules as a ratchet:

- do not introduce new violations;
- do not increase existing warning counts;
- improve nearby debt when it is safe and directly related;
- do not turn a focused feature into an unauthorized rewrite;
- explicitly document important debt that cannot be fixed within the current scope.
