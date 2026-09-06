# Code Review Checklist

Review the actual diff, not just the intended change. Cite actionable findings
with file, line, severity, and impact. P0 blocks completion; P1/P2 deviations
require an explicit reason. Leave mechanical style checks to ESLint and TypeScript.

## P0 — security and integrity

- Protected server operations authenticate the caller and authorize the resource;
  client state never grants ownership, credits, billing privileges, or access.
- Secrets and private user content cannot escape through client bundles, logs,
  URLs, analytics, responses, or unsafe rendering of untrusted content.
- External requests validate destinations and redirects against SSRF; inputs,
  uploads, streams, retries, and responses have appropriate limits.
- Cookie-authenticated mutations have CSRF protection or the documented
  same-origin design. Paid or destructive retries are safe and idempotent.
- Failures do not report success, lose saved content, or silently substitute
  development services in production.

## P1 — architecture and contracts

- Components use existing API boundaries; server secrets stay server-side.
- Business authorization, billing, and durable state stay on the backend.
- Changed contracts are traced through UI, client, route, and backend; generated
  types, when a generation pipeline exists, are updated through its generation
  command, not hand-edited.
- Untrusted data is runtime-validated; casts and `any` do not bypass validation.
- Async work handles cancellation, races, stale results, and relevant recovery;
  effects clean up subscriptions, timers, streams, and media resources.
- Existing legacy violations are not copied or expanded.

## P2 — behavior, usability, and simplicity

- Tests assert observable behavior. Bugs have a failing-before-fix regression;
  new behavior covers success, failure, permissions, and relevant boundaries.
- UI states cover applicable loading, empty, error, retry, and denied access.
  Keyboard access, focus, labels, and responsive behavior remain usable.
- Existing components and design tokens are reused; no unrequested decorative
  UI, filler copy, speculative abstractions, duplicate state, or dependencies.
- The patch stays within scope and preserves unrelated working-tree changes.
- Valid review findings are resolved, followed by a separate simplification pass.
- Required checks passed on the final tree, or blockers are explicitly reported.
  Documentation-only changes follow the exception in `AGENTS.md`.
- Relevant documentation and examples match changed behavior and commands.
