# Spark iPhone Prototype Implementation Plan

**Goal:** Implement the user-approved single-page iPhone prototype from the supplied reference, without bottom tabs.

**Architecture:** A server page hosts a focused interactive client component. Typed sample ideas and scripts live separately from presentation. All mutations last only for the current page session. No camera, microphone, network, or storage integration.

**Tech stack:** Existing Next.js, React, TypeScript, CSS; browser testing only as a development dependency.

**Approved design:** Centered iPhone frame, white/lavender Ideas and Scripts views, idea creation and details, script details with source ideas, simulated teleprompter with start/pause, timer and speed. Responsive phone-sized layout, keyboard controls and clear simulation messaging.

## Implementation

- [ ] Write browser tests for switching lists, opening details, adding valid and invalid ideas, canceling drafts, and teleprompter controls before implementation; observe the starter page fail.
- [ ] Add typed fixtures in `lib/spark-data.ts`; build focused UI in `components/spark/`, page composition in `app/page.tsx`, and matching styles in `app/globals.css`. Bound titles to 100 characters, notes to 2,000 and session ideas to 50. Use inline validation and preserve canceled/invalid form behavior.
- [ ] Implement recording simulation with a cleaned-up timer, bounded session duration, speed controls and reset; never request device permissions or imply media was captured.
- [ ] Verify browser behavior at desktop and mobile sizes and run `npm run check`. Browser test tooling must remain development-only; preserve the existing gate commands.
- [ ] Freeze the diff and obtain independent review using `docs/independent-review.md`; address verified findings, simplify separately, then recheck changed files and request at most one follow-up review.

## Integration notes

Replace the fixture import and local state mutations with a future API boundary when real HTTP behavior is specified. This task introduces no endpoint, authentication, persistence, deployment, or production dependency. No commit or deployment is requested.
