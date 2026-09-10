# Live Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render low-latency live spoken text in the Capture panel using `gpt-realtime-whisper`, then use that final text to save an idea or create a script.

**Architecture:** A protected server route mints a short-lived Realtime client secret and the browser connects its microphone stream through WebRTC. A focused client hook converts bounded Realtime transcription events into ordered text. The recorder uses the final text with a protected transcript route, retaining the current audio upload workflow as the recovery path.

**Tech Stack:** Next.js 16 Route Handlers, React 19, TypeScript, OpenAI Node SDK already installed, WebRTC, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-live-transcription-design.md`

## Global Constraints

- Keep `OPENAI_API_KEY` server-only; browser code may receive only a short-lived Realtime client secret.
- Require same-origin validation, authenticated sessions, rate limits, bounded input/output, safe error mapping, and no secret or transcript logging on every new route.
- Use `gpt-realtime-whisper` with browser WebRTC; do not add a runtime dependency.
- Limit final transcripts to 8,000 trimmed characters and data-channel messages to 64 KiB.
- Preserve existing MediaRecorder audio playback and batch `/api/capture` fallback behavior.
- Do not commit, push, or change deployment configuration without explicit user instruction.

---

## File Structure

- Create `lib/server/realtime-token.ts`: server-only creation and validation of an ephemeral Realtime client secret.
- Create `lib/server/realtime-token.test.ts`: safe secret creation, upstream error mapping, and response validation.
- Modify `lib/server/rate-limit.ts`: add the bounded `realtime_session` operation, separate from the finished-capture allowance.
- Modify `lib/server/rate-limit.test.ts`: verify Realtime-session and capture allowances remain independent.
- Create `app/api/realtime-token/route.ts`: authenticated, same-origin, separately rate-limited credential route.
- Create `app/api/realtime-token/route.test.ts`: route-level security and failure behavior.
- Create `components/live-transcript-client.ts`: typed browser request for the ephemeral credential.
- Create `components/use-live-transcript.ts`: WebRTC transcript connection, event parsing, status, and cleanup.
- Create `components/use-live-transcript.test.ts`: isolated event ordering, bounds, connection failure, and cleanup tests.
- Modify `lib/server/capture-workflow.ts`: share the command/persistence behavior for a pre-transcribed string.
- Modify `lib/server/capture-workflow.test.ts`: behavior equivalence for transcription and supplied transcript input.
- Create `app/api/capture/transcript/route.ts`: protected bounded transcript mutation route.
- Create `app/api/capture/transcript/route.test.ts`: route contract tests.
- Modify `components/use-recorder.ts`: coordinate recorder and Realtime lifecycle; submit final text or fall back to audio upload.
- Modify `components/capture.tsx` and `app/globals.css`: accessible live-caption panel using the existing visual system.
- Modify `scripts/spark.test.mjs`: browser coverage for live captions and fallback UI.

### Task 1: Server-only ephemeral credential service

**Files:**
- Create: `lib/server/realtime-token.ts`
- Test: `lib/server/realtime-token.test.ts`

**Interfaces:**
- Produces: `createRealtimeClientSecret(options: { correlationId: string; signal?: AbortSignal }): Promise<{ value: string; expiresAt: number }>`.
- Produces: `RealtimeTokenError` with codes `not_configured`, `upstream_unavailable`, and `upstream_invalid`.

- [ ] **Step 1: Write the failing tests**

```ts
test('creates a bounded client secret for the fixed Whisper Realtime transcription configuration', async () => {
  process.env.OPENAI_API_KEY = 'server-only-test-key';
  mock.method(globalThis, 'fetch', async () => Response.json({
    value: 'ek_test', expires_at: 1_800_000_000,
    session: { type: 'transcription', audio: { input: { transcription: { model: 'gpt-realtime-whisper' }, turn_detection: null } } },
  }));
  assert.deepEqual(await createRealtimeClientSecret({ correlationId: 'capture-1' }), { value: 'ek_test', expiresAt: 1_800_000_000 });
});

test('does not expose an upstream response body when credential creation fails', async () => {
  process.env.OPENAI_API_KEY = 'server-only-test-key';
  mock.method(globalThis, 'fetch', async () => new Response('private upstream detail', { status: 503 }));
  await assert.rejects(createRealtimeClientSecret({ correlationId: 'capture-1' }), errorWithCode('upstream_unavailable'));
});
```

- [ ] **Step 2: Run the service test to verify it fails**

Run: `node --test lib/server/realtime-token.test.ts`

Expected: FAIL because the service module does not exist.

- [ ] **Step 3: Implement the minimal server-only service**

```ts
const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ session: { type: 'transcription', audio: { input: { transcription: { model: 'gpt-realtime-whisper' }, turn_detection: null } } } }),
  signal: AbortSignal.any([AbortSignal.timeout(10_000), options.signal].filter(Boolean) as AbortSignal[]),
  cache: 'no-store', redirect: 'error',
});
```

Validate the response object, secret prefix and length, and future bounded expiry before returning only `{ value, expiresAt }`. Log status and duration without the secret or transcript.

- [ ] **Step 4: Run the service test to verify it passes**

Run: `node --test lib/server/realtime-token.test.ts`

Expected: PASS.

### Task 2: Protected credential route

**Files:**
- Modify: `lib/server/rate-limit.ts`
- Test: `lib/server/rate-limit.test.ts`
- Create: `app/api/realtime-token/route.ts`
- Test: `app/api/realtime-token/route.test.ts`

**Interfaces:**
- Consumes: `createRealtimeClientSecret` from Task 1 and the existing session/origin protections.
- Produces: `POST /api/realtime-token` returning `{ value: string; expiresAt: number }` with `Cache-Control: private, no-store`.

- [ ] **Step 1: Write failing route tests**

```ts
test('rejects cross-origin and unauthenticated credential requests before OpenAI is contacted', async () => {
  const response = await POST(new NextRequest('http://localhost/api/realtime-token', { method: 'POST', headers: { origin: 'https://attacker.example' } }));
  assert.equal(response.status, 403);
});

test('returns only the ephemeral credential for an authenticated, rate-limited caller', async () => {
  const response = await POST(authenticatedRequest());
  assert.deepEqual(await response.json(), { value: 'ek_test', expiresAt: 1_800_000_000 });
});

test('does not consume the finished-capture allowance while minting a Realtime credential', () => {
  assert.equal(demoRateLimiter.consume('user-1', 'realtime_session', 20), true);
  assert.equal(demoRateLimiter.consume('user-1', 'ai_capture', 20), true);
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run: `node --test app/api/realtime-token/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement route security and safe mapping**

```ts
const session = await authorizeMutation(request, 1_024);
if (!demoRateLimiter.consume(session.userId, 'realtime_session', 20)) {
  return privateJson({ code: 'rate_limited', error: 'Too many captures. Please wait an hour before trying again.' }, 429);
}
return privateJson(await createRealtimeClientSecret({ correlationId: randomUUID(), signal: request.signal }));
```

Map configuration and upstream failures to safe 503 responses. Do not include OpenAI error text or the permanent key.

- [ ] **Step 4: Run route tests to verify they pass**

Run: `node --test app/api/realtime-token/route.test.ts`

Expected: PASS.

### Task 3: Shared transcript capture workflow and protected text route

**Files:**
- Modify: `lib/server/capture-workflow.ts`
- Test: `lib/server/capture-workflow.test.ts`
- Create: `app/api/capture/transcript/route.ts`
- Test: `app/api/capture/transcript/route.test.ts`

**Interfaces:**
- Produces: `processTranscript(transcript: string, deps: Dependencies): Promise<CaptureResult>`.
- Produces: `POST /api/capture/transcript` accepting exactly `{ transcript: string }`.

- [ ] **Step 1: Write failing workflow and route tests**

```ts
test('processes supplied transcript text through the same idea persistence path', async () => {
  const result = await processTranscript('An idea spoken live', dependencies());
  assert.equal(result.kind, 'idea');
  assert.equal(deps.transcribeAudio.mock.callCount(), 0);
});

test('rejects empty, oversized, unknown-field, cross-origin, and unauthenticated transcript submissions', async () => {
  for (const body of [{ transcript: '' }, { transcript: 'x'.repeat(8_001) }, { transcript: 'valid', extra: true }]) {
    assert.equal((await POST(authenticatedJsonRequest(body))).status, 400);
  }
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `node --test lib/server/capture-workflow.test.ts app/api/capture/transcript/route.test.ts`

Expected: FAIL because `processTranscript` and the route do not exist.

- [ ] **Step 3: Implement a shared, bounded text entry point**

```ts
function validateTranscript(value: string) {
  const transcript = value.trim();
  if (transcript.length === 0 || transcript.length > 8_000) throw new CaptureWorkflowError('transcription_failed');
  return transcript;
}

export async function processTranscript(transcript: string, deps: Dependencies) {
  return processCapturedTranscript(validateTranscript(transcript), deps);
}
```

Refactor `processCapture` so it obtains text with `transcribeAudio` and calls the same internal persistence function. The route must use `authorizeMutation`, bounded JSON parsing, the existing capture rate limit, and `privateJson`.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `node --test lib/server/capture-workflow.test.ts app/api/capture/transcript/route.test.ts`

Expected: PASS.

### Task 4: Browser Realtime transcript hook

**Files:**
- Create: `components/live-transcript-client.ts`
- Create: `components/use-live-transcript.ts`
- Test: `components/use-live-transcript.test.ts`

**Interfaces:**
- Produces: `useLiveTranscript(): { transcript: string; status: 'idle' | 'connecting' | 'live' | 'unavailable'; start(stream: MediaStream): Promise<void>; stop(): Promise<string | null>; reset(): void }`.
- Consumes: `POST /api/realtime-token` and a caller-owned microphone stream.

- [ ] **Step 1: Write failing hook tests using faked browser transport**

```ts
test('appends valid delta events and uses the completed event as final transcript', async () => {
  const live = createLiveTranscriptForTest(fakePeerConnection());
  await live.start(stream);
  fakeDataChannel.emitMessage({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'item-1', delta: 'A live ' });
  fakeDataChannel.emitMessage({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'A live idea' });
  assert.equal(await live.stop(), 'A live idea');
});

test('ignores malformed and oversized data-channel messages and reports transport failure without throwing', async () => {
  const live = createLiveTranscriptForTest(fakePeerConnection());
  await live.start(stream);
  fakeDataChannel.emitMessage('not json');
  fakeDataChannel.emitMessage('x'.repeat(65_537));
  fakePeerConnection.fail();
  assert.equal(live.status(), 'unavailable');
});
```

- [ ] **Step 2: Run the hook test to verify it fails**

Run: `node --test components/use-live-transcript.test.ts`

Expected: FAIL because the hook module does not exist.

- [ ] **Step 3: Implement bounded WebRTC lifecycle behavior**

```ts
const response = await fetch('/api/realtime-token', { method: 'POST', signal });
const { value } = await readRealtimeToken(response);
const peer = new RTCPeerConnection();
stream.getAudioTracks().forEach(track => peer.addTrack(track, stream));
const channel = peer.createDataChannel('oai-events');
channel.addEventListener('message', event => acceptTranscriptEvent(event.data));
```

Use the ephemeral credential only in the direct Realtime connection setup, parse only known event shapes, cap the visible transcript, and close listeners, channel, peer connection, and pending work on reset. Ignore events from stale sessions.

- [ ] **Step 4: Run the hook test to verify it passes**

Run: `node --test components/use-live-transcript.test.ts`

Expected: PASS.

### Task 5: Recorder integration and accessible caption UI

**Files:**
- Modify: `components/use-recorder.ts`
- Modify: `components/capture.tsx`
- Modify: `app/globals.css`
- Test: `scripts/spark.test.mjs`

**Interfaces:**
- Consumes: the hook from Task 4 and `POST /api/capture/transcript` from Task 3.
- Produces: recorder fields `transcript` and `liveTranscriptStatus` for the Capture UI.

- [ ] **Step 1: Add failing browser tests**

```ts
test('recording shows live text and submits the finalized transcript once stopped', async () => {
  await page.route('**/api/realtime-token', route => route.fulfill({ json: { value: 'ek_test', expiresAt: 1_800_000_000 } }));
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Start recording with Spark' }).click();
  await expect(page.getByRole('status', { name: 'Live transcript' })).toContainText('A spoken idea');
  await page.getByRole('button', { name: 'Finish my thought' }).click();
  await expect(page.getByRole('heading', { name: 'Your idea, captured.' })).toBeVisible();
});

test('a Realtime connection failure keeps recording and falls back to the existing audio upload', async () => {
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Start recording with Spark' }).click();
  await expect(page.getByText('Live captions are unavailable; your recording will still be captured.')).toBeVisible();
});
```

- [ ] **Step 2: Run the browser test to verify failure**

Run: `node --test scripts/spark.test.mjs --test-name-pattern="live text|Realtime connection"`

Expected: FAIL because live captions and transcript submission do not exist.

- [ ] **Step 3: Implement minimal integration and UI**

```tsx
<div className="live-transcript" role="status" aria-label="Live transcript" aria-live="polite">
  {recording.transcript || (recording.liveTranscriptStatus === 'unavailable'
    ? 'Live captions are unavailable; your recording will still be captured.'
    : 'Listening for your words…')}
</div>
```

Start the live hook only after microphone access succeeds. On stop, await its bounded finalization; when it returns non-empty text, send it to the transcript route, otherwise call `uploadCapture(blobData)`. Preserve cancellation/session guards and release all live resources in `reset`, media failure, unmount, and automatic 60-second stop.

- [ ] **Step 4: Run focused browser tests to verify they pass**

Run: `node --test scripts/spark.test.mjs --test-name-pattern="voice capture|live text|Realtime connection|capture no-match|reset during"`

Expected: PASS.

### Task 6: Final verification and independent review

**Files:**
- Review: all Task 1–5 files and their tests.

**Interfaces:**
- Consumes: the complete implementation and final test results.
- Produces: evidence-backed completion report and an independent review disposition.

- [ ] **Step 1: Run focused Node tests**

Run: `node --test lib/server/realtime-token.test.ts app/api/realtime-token/route.test.ts lib/server/capture-workflow.test.ts app/api/capture/transcript/route.test.ts components/use-live-transcript.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the full repository gate**

Run: `npm run check`

Expected: exit code 0, including Node tests, ESLint, route type generation, TypeScript, production build, and Playwright.

- [ ] **Step 3: Request independent review, round 1**

Send the implementation diff, tested file list, applicable `AGENTS.md`, `docs/independent-review.md`, and `docs/code-review-checklist.md` to a fresh review-only subagent. Keep reviewed files unchanged until it reports.

- [ ] **Step 4: Verify and resolve review findings**

For each finding, inspect the cited code and test. Fix confirmed issues with a failing regression test first; record concrete evidence for rejected findings.

- [ ] **Step 5: Make a simplification-only pass**

Remove redundant state, single-use wrappers, dead branches, and unused files while preserving the security and lifecycle boundaries.

- [ ] **Step 6: Re-run final checks and review follow-up changes**

Run: `npm run check`

Expected: exit code 0. Then send the subsequent diff and each finding disposition to the same reviewer for round 2, if the code changed after round 1.
