# Voice Capture and Agent-Generated Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Replace Spark's simulated voice result and fixture phone library with authenticated Whisper transcription, durable ideas, tool-selected recent ideas, and agent-generated YouTube scripts.

**Architecture:** A thin authenticated Next.js route accepts bounded audio and delegates to independently tested rate-limit, transcription, intent, repository, and Agents SDK modules. Supabase REST runs under the user's access token and RLS; the Server Component loads the initial library, while shared client state incorporates capture and manual-create responses without reloading. Rate limits are intentionally process-local because this is a single-instance demo.

**Tech Stack:** Next.js 16.3.4 Route Handlers and Server Components, React 19.2.8, TypeScript, Supabase Auth/PostgREST/PostgreSQL migration, OpenAI whisper-1, OpenAI Agents SDK for TypeScript, Zod 4, Node test runner, Playwright.

**Spec:** \`docs/superpowers/specs/2026-09-08-voice-capture-agent-script-design.md\`

## Global Constraints

- Recordings remain limited to 60 seconds and 8 MB.
- Persist no audio and no command transcript.
- Read and write data only for the authenticated Supabase user; RLS must independently enforce ownership.
- Retrieve script source ideas only from the preceding hour, newest first, with a maximum of 20 candidates and 12 selected ideas.
- Keep \`OPENAI_API_KEY\` server-only; never log audio, transcripts, prompts, cookies, tokens, tool results, or scripts.
- Use explicit upstream timeouts, bounded response reads, stable safe errors, and no automatic retries for mutations or agent runs.
- Use Server Components by default and keep OpenAI dependencies out of client bundles.
- Do not apply the migration to a remote project or deploy.
- Every implementation task follows red-green-refactor and ends in a focused commit.

---

### Task 1: Durable schema and shared product contracts

**Files:**
- Create: \`supabase/migrations/20260908000000_voice_capture.sql\`
- Modify: \`lib/spark-data.ts\`
- Create: \`lib/spark-data.test.ts\`
- Modify: \`package.json\`
- Modify: \`package-lock.json\` only through npm

**Interfaces:**
- Produces: \`IdeaRecord\`, \`ScriptRecord\`, \`Idea\`, \`Script\`, \`LibraryData\`, \`toIdea(record)\`, and \`toScript(record)\`.
- Later tasks consume the exact persisted fields defined here.

- [ ] **Step 1: Extend the repository test command and add failing mapping tests**

Update \`package.json\` so the Node suite includes all new tests explicitly:

\`\`\`json
"test": "node --test components/*.test.ts components/necklace/*.test.ts components/spark/*.test.ts app/api/auth/route.test.ts app/api/capture/route.test.ts app/api/ideas/route.test.ts lib/*.test.ts lib/server/*.test.ts"
\`\`\`

Create \`lib/spark-data.test.ts\` with fixed UTC timestamps and assertions like:

\`\`\`ts
test("maps a database idea into phone presentation without duplicated stored fields", () => {
  const idea = toIdea({
    id: "11111111-1111-4111-8111-111111111111",
    text: "Walking without headphones gives unfinished thoughts room to connect.",
    created_at: "2026-09-08T04:42:00.000Z",
  }, new Date("2026-09-08T05:00:00.000Z"));

  assert.equal(idea.title, "Walking without headphones gives unfinished thoughts…");
  assert.equal(idea.note, "Walking without headphones gives unfinished thoughts room to connect.");
  assert.equal(idea.date, "Today");
  assert.equal(idea.status, "Raw");
});

test("keeps full script text and derives its display title", () => {
  const script = toScript({
    id: "22222222-2222-4222-8222-222222222222",
    text: "Why walking unlocks ideas\\n\\nYour best idea may be one walk away.",
    idea_ids: ["11111111-1111-4111-8111-111111111111"],
    created_at: "2026-09-08T04:55:00.000Z",
  });

  assert.equal(script.title, "Why walking unlocks ideas");
  assert.match(script.text, /Your best idea may be one walk away/);
});
\`\`\`

- [ ] **Step 2: Run the mapping tests and observe the missing exports**

Run: \`node --test lib/spark-data.test.ts\`

Expected: FAIL because \`IdeaRecord\`, \`ScriptRecord\`, \`toIdea\`, and \`toScript\` do not exist.

- [ ] **Step 3: Replace fixtures with bounded record and presentation contracts**

In \`lib/spark-data.ts\`, define:

\`\`\`ts
export type IdeaRecord = {
  id: string;
  text: string;
  created_at: string;
};

export type ScriptRecord = {
  id: string;
  text: string;
  idea_ids: string[];
  created_at: string;
};

export type LibraryData = { ideas: Idea[]; scripts: Script[] };
\`\`\`

Implement pure mapping with \`MAX_TITLE_LENGTH = 56\`. Derive idea and script titles from their first non-empty lines, truncate with an ellipsis, derive Today/Yesterday/date and localized time from \`created_at\`, and keep the full script text unchanged. Delete \`sampleIdeas\` and \`sampleScripts\`; do not retain production fixture fallbacks.

- [ ] **Step 4: Add the migration**

Create SQL that:

- enables \`pgcrypto\`;
- creates \`ideas\` and \`scripts\`;
- uses \`auth.uid()\` ownership policies for select/insert on product tables;
- requires every script provenance ID to reference an idea owned by the current user;
- checks idea text and full script text lengths and limits \`idea_ids\` to 1–12;
- indexes \`(user_id, created_at desc)\`;

- [ ] **Step 5: Install the approved production dependencies**

Run: \`npm install @openai/agents zod\`

Expected: \`package.json\` and \`package-lock.json\` change; no other production dependency is added.

- [ ] **Step 6: Run focused tests and inspect the migration**

Run: \`node --test lib/spark-data.test.ts\`

Expected: PASS.

Run: \`git diff --check && rg -n "enable row level security|auth.uid|idea_ids" supabase/migrations/20260908000000_voice_capture.sql\`

Expected: no whitespace errors and all security clauses present. Do not execute the migration against the configured database.

- [ ] **Step 7: Commit**

\`\`\`bash
git add package.json package-lock.json lib/spark-data.ts lib/spark-data.test.ts supabase/migrations/20260908000000_voice_capture.sql
git commit -m "feat: add persistent ideas and scripts schema"
\`\`\`

---

### Task 2: Authenticated Supabase boundary and repository

**Files:**
- Create: \`lib/server/bounded-response.ts\`
- Create: \`lib/server/session.ts\`
- Create: \`lib/server/spark-repository.ts\`
- Create: \`lib/server/spark-repository.test.ts\`
- Modify: \`app/home/page.tsx\`
- Modify: \`app/api/auth/route.ts\`

**Interfaces:**
- Produces: \`authenticateAccessToken(token): Promise<AuthenticatedUser | null>\`.
- Produces: \`createSparkRepository(token)\` with \`loadLibrary()\`, \`insertIdea(text)\`, \`findRecentIdeas(since, hint)\`, and \`insertScript(input)\`.
- Consumes record mappers from Task 1.

- [ ] **Step 1: Write failing repository behavior tests**

Mock \`globalThis.fetch\` and assert:

\`\`\`ts
test("recent ideas are user-scoped by bearer token, one-hour cutoff, and local hint ranking", async () => {
  // Return three bounded PostgREST rows, two containing focus-related words.
  const ideas = await createSparkRepository("user-token").findRecentIdeas(
    new Date("2026-09-08T04:00:00.000Z"),
    "focus at work",
  );
  assert.deepEqual(ideas.map(idea => idea.id), [FOCUS_NEW_ID, FOCUS_OLD_ID]);
  assert.match(String(fetchMock.mock.calls[0].arguments[0]), /created_at=gte\\./);
  assert.equal(new Headers(fetchMock.mock.calls[0].arguments[1]?.headers).get("Authorization"), "Bearer user-token");
});

test("rejects an oversized or malformed PostgREST response", async () => {
  // Supply an invalid content length and expect RepositoryError("upstream_invalid").
});

test("script provenance must be a non-empty bounded UUID list", async () => {
  await assert.rejects(
    repository.insertScript({ text: "Title", ideaIds: [] }),
    /invalid_script/,
  );
});
\`\`\`

Also cover load ordering, safe insert headers, rate RPC false, timeouts, response-size overflow, invalid JSON, and unexpected database fields.

- [ ] **Step 2: Run repository tests and observe failure**

Run: \`node --test lib/server/spark-repository.test.ts\`

Expected: FAIL because the repository modules do not exist.

- [ ] **Step 3: Extract bounded response reading and session verification**

Move the reusable bounded stream reader and bounded JSON response logic out of \`app/api/auth/route.ts\` into \`lib/server/bounded-response.ts\`. Keep limits explicit at each call site.

Create \`lib/server/session.ts\`:

\`\`\`ts
export type AuthenticatedUser = { id: string };

export async function authenticateAccessToken(
  token: string,
): Promise<AuthenticatedUser | null> {
  // GET fixed Supabase /auth/v1/user endpoint, 5s timeout,
  // redirect:error, no-store, bounded JSON, validate a non-empty user UUID/string.
}
\`\`\`

Refactor the auth route and \`app/home/page.tsx\` to use the shared bounded helper without changing current login behavior.

- [ ] **Step 4: Implement the repository**

Use fixed URLs derived only from validated \`getSupabaseConfig().url\`. Every call supplies the publishable key and the user's bearer token, \`redirect: "error"\`, \`cache: "no-store"\`, and an explicit timeout.

Runtime-validate all returned rows with Zod. Fetch at most 50 library rows per table and 20 recent candidates. For \`findRecentIdeas\`, fetch only rows newer than the supplied server cutoff, then score locally using normalized non-stopword tokens from the bounded hint; return at most 12. An empty hint returns newest candidates, while a non-empty hint never silently falls back to unrelated ideas.

Use \`Prefer: return=representation\` for inserts and accept exactly one returned row. Rate limiting is handled by the server route rather than the persistence repository.

- [ ] **Step 5: Make the Server Component load the library directly**

In \`app/home/page.tsx\`, authenticate once, create the repository with the cookie token, and call \`loadLibrary()\` directly rather than calling the application's own API route. Pass \`initialLibrary\` and a safe \`libraryError\` flag into \`Capture\`. Keep redirects outside recoverable database error handling.

- [ ] **Step 6: Run auth and repository tests**

Run: \`node --test app/api/auth/route.test.ts lib/server/spark-repository.test.ts\`

Expected: PASS, including unchanged authentication behavior.

- [ ] **Step 7: Commit**

\`\`\`bash
git add lib/server/bounded-response.ts lib/server/session.ts lib/server/spark-repository.ts lib/server/spark-repository.test.ts app/home/page.tsx app/api/auth/route.ts
git commit -m "feat: add authenticated Spark data boundary"
\`\`\`

---

### Task 3: Natural script-command parsing

**Files:**
- Create: \`lib/server/script-command.ts\`
- Create: \`lib/server/script-command.test.ts\`

**Interfaces:**
- Produces: \`parseScriptCommand(transcript): { isCommand: false } | { isCommand: true; hint: string }\`.
- Task 5 consumes the parsed hint; Task 6 uses the command/idea branch.

- [ ] **Step 1: Write the command matrix as failing tests**

\`\`\`ts
for (const transcript of [
  "Create a script about creator burnout",
  "Could you make me a YouTube script using my focus ideas?",
  "Draft a video script from what I just said about walking",
  "Turn my recent ideas about AI management into a script",
]) {
  test(\`recognizes command: \${transcript}\`, () => {
    assert.equal(parseScriptCommand(transcript).isCommand, true);
  });
}

for (const transcript of [
  "My idea is a video about why scripts often sound generic",
  "I rewrote the script today and the hook feels stronger",
  "Creators need ideas before they need a script",
]) {
  test(\`keeps ordinary idea: \${transcript}\`, () => {
    assert.deepEqual(parseScriptCommand(transcript), { isCommand: false });
  });
}
\`\`\`

Add boundary cases for blank input, punctuation/case, 8,000-character rejection, extracted topic hints, and explicit command wording without a topic.

- [ ] **Step 2: Run the parser tests and observe failure**

Run: \`node --test lib/server/script-command.test.ts\`

Expected: FAIL because \`parseScriptCommand\` is missing.

- [ ] **Step 3: Implement the smallest conservative parser**

Normalize Unicode, whitespace, punctuation, and case. Require either:

- an imperative/request construction with a create/write/make/draft/generate verb and script/video-script object; or
- an explicit “turn/use … ideas … into … script” construction.

Remove only the matched command frame when extracting the hint. Bound the returned hint to 240 characters. Do not classify from the isolated word “script.”

- [ ] **Step 4: Run the full command matrix**

Run: \`node --test lib/server/script-command.test.ts\`

Expected: PASS.

- [ ] **Step 5: Commit**

\`\`\`bash
git add lib/server/script-command.ts lib/server/script-command.test.ts
git commit -m "feat: recognize natural script commands"
\`\`\`

---

### Task 4: Bounded Whisper transcription

**Files:**
- Create: \`lib/server/transcription.ts\`
- Create: \`lib/server/transcription.test.ts\`

**Interfaces:**
- Produces: \`transcribeAudio(file, options?): Promise<string>\`.
- Throws stable \`TranscriptionError\` codes: \`not_configured\`, \`invalid_audio\`, \`upstream_unavailable\`, \`upstream_invalid\`.
- Task 6 consumes this function.

- [ ] **Step 1: Write failing transcription boundary tests**

Cover:

- sends multipart \`file\` and exact \`model=whisper-1\` to \`https://api.openai.com/v1/audio/transcriptions\`;
- authorizes with the server environment key;
- uses \`redirect: "error"\`, \`cache: "no-store"\`, and a 30-second abort signal;
- accepts \`audio/webm\`, \`audio/ogg\`, \`audio/mp4\`, \`audio/mpeg\`, and \`audio/wav\`;
- rejects empty files, files over 8 MB, unsupported types, missing key, oversized/malformed JSON, blank transcript, and transcript over 8,000 characters;
- maps 429 and 5xx to safe stable errors without exposing upstream text.

Representative assertion:

\`\`\`ts
const text = await transcribeAudio(
  new File([new Uint8Array([1, 2, 3])], "idea.webm", { type: "audio/webm" }),
);
assert.equal(text, "An idea about making creator tools disappear.");
const body = fetchMock.mock.calls[0].arguments[1]?.body;
assert.ok(body instanceof FormData);
assert.equal(body.get("model"), "whisper-1");
\`\`\`

- [ ] **Step 2: Run tests and observe failure**

Run: \`node --test lib/server/transcription.test.ts\`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement transcription**

Validate before constructing the upstream request. Read the response with \`readBoundedJson(response, 64 * 1024)\`, validate \`{ text: string }\` using Zod, trim it, and enforce the transcript bound. Log only safe event name, status, duration, and caller-provided correlation ID.

- [ ] **Step 4: Run transcription tests**

Run: \`node --test lib/server/transcription.test.ts\`

Expected: PASS and mock assertions confirm no real OpenAI request occurred.

- [ ] **Step 5: Commit**

\`\`\`bash
git add lib/server/transcription.ts lib/server/transcription.test.ts
git commit -m "feat: transcribe bounded voice captures"
\`\`\`

---

### Task 5: Agents SDK script generator with required retrieval tool

**Files:**
- Create: \`lib/server/script-agent.ts\`
- Create: \`lib/server/script-agent.test.ts\`

**Interfaces:**
- Produces \`generateScript({ command, hint, repository, correlationId }): Promise<GeneratedScript | null>\`.
- \`GeneratedScript\` is \`{ text; ideaIds }\`.
- Consumes \`repository.findRecentIdeas(cutoff, hint)\`; the tool owns the cutoff and selection bounds.

- [ ] **Step 1: Write failing agent-policy tests around an injectable runner**

Structure \`generateScript\` with a narrow optional \`runAgent\` dependency so tests never spend credits. Assert:

\`\`\`ts
test("the retrieval tool enforces the server cutoff and records retrieved IDs", async () => {
  const now = new Date("2026-09-08T05:00:00.000Z");
  const result = await generateScript({
    command: "Create a script about walking",
    hint: "walking",
    repository,
    now,
    runAgent: fakeRunnerThatCallsToolThenReturnsValidOutput,
  });
  assert.equal(repository.findRecentIdeas.mock.calls[0].arguments[0].toISOString(), "2026-09-08T04:00:00.000Z");
  assert.deepEqual(result?.ideaIds, [RECENT_ID]);
});

test("rejects output when the runner did not call retrieve_recent_ideas", async () => {
  await assert.rejects(
    generateScript({ command: "Create a script", hint: "", repository, runAgent: fakeRunnerWithoutToolCall }),
    /tool_required/,
  );
});

test("rejects invented provenance IDs", async () => {
  await assert.rejects(
    generateScript({ command: "Create a script", hint: "", repository, runAgent: fakeRunnerWithUnknownIdeaId }),
    /invalid_provenance/,
  );
});
\`\`\`

Also test empty retrieval returns null without persistence, output field bounds, maximum 12 IDs, runner timeout/error mapping, and command/hint bounds.

- [ ] **Step 2: Run agent tests and observe failure**

Run: \`node --test lib/server/script-agent.test.ts\`

Expected: FAIL because the generator is absent.

- [ ] **Step 3: Implement the retrieval tool and structured agent**

Define Zod schemas:

\`\`\`ts
const toolInput = z.object({
  topic: z.string().trim().max(240).default(""),
});

const scriptOutput = z.object({
  text: z.string().trim().min(1).max(8_000),
  ideaIds: z.array(z.string().uuid()).min(1).max(12),
});
\`\`\`

Create \`retrieve_recent_ideas\` with \`tool()\`. Its execute function chooses the explicit model topic when present, otherwise the parsed command hint, calculates \`new Date(now.getTime() - 60 * 60 * 1000)\`, calls the repository, records returned IDs in per-run context, and returns only bounded IDs, timestamps, and transcripts.

Create a single \`Agent\` with \`outputType: scriptOutput\`. Instructions require the tool before writing, use only retrieved content, return null/no-match behavior when empty, and generate a useful YouTube script rather than commentary. Run it once with a 45-second timeout and no retry. Validate output again and require every \`ideaId\` to be in the recorded retrieved set.

- [ ] **Step 4: Run agent tests**

Run: \`node --test lib/server/script-agent.test.ts\`

Expected: PASS with only fake runners and repositories.

- [ ] **Step 5: Commit**

\`\`\`bash
git add lib/server/script-agent.ts lib/server/script-agent.test.ts
git commit -m "feat: generate scripts with a recent-ideas tool"
\`\`\`

---

### Task 6: Authenticated capture and manual-idea routes

**Files:**
- Create: \`lib/server/capture-workflow.ts\`
- Create: \`lib/server/capture-workflow.test.ts\`
- Create: \`app/api/capture/route.ts\`
- Create: \`app/api/capture/route.test.ts\`
- Create: \`app/api/ideas/route.ts\`
- Create: \`app/api/ideas/route.test.ts\`

**Interfaces:**
- Produces capture response union:
  \`{ kind: "idea"; idea: Idea }\`,
  \`{ kind: "script"; script: Script }\`, or
  \`{ kind: "no_recent_ideas"; message: string }\`.
- Produces manual idea response \`{ idea: Idea }\`.
- Consumes Tasks 2–5.

- [ ] **Step 1: Write failing workflow tests**

Inject transcription, parser, repository, and generator dependencies. Test:

- ordinary transcript inserts exactly one idea and never calls the agent;
- command transcript never calls \`insertIdea\`;
- command calls the agent, then inserts exactly one validated script;
- no recent ideas inserts nothing;
- rate-limit denial calls neither Whisper nor the agent;
- transcription, repository, agent, and insert failures return stable errors;
- stale/double execution is not automatically retried.

\`\`\`ts
test("a command is never stored as an idea", async () => {
  const result = await processCapture(file, depsReturningCommand);
  assert.equal(deps.repository.insertIdea.mock.callCount(), 0);
  assert.equal(deps.generateScript.mock.callCount(), 1);
  assert.equal(result.kind, "script");
});
\`\`\`

- [ ] **Step 2: Run workflow tests and observe failure**

Run: \`node --test lib/server/capture-workflow.test.ts\`

Expected: FAIL because \`processCapture\` does not exist.

- [ ] **Step 3: Implement the orchestration service**

Make \`processCapture\` consume the in-memory rate slot before the first paid call, create one correlation UUID, and follow this exact order:

\`\`\`ts
consumeCaptureSlot
  -> transcribeAudio
  -> parseScriptCommand
  -> insertIdea
     OR generateScript -> insertScript
\`\`\`

Return mapped presentation data. Map expected failures to a typed \`CaptureWorkflowError\` with safe code, status, and user message.

- [ ] **Step 4: Write failing route tests**

For both mutation routes, test missing/invalid cookie, cross-origin request, oversized declared body, malformed multipart/JSON, success, and safe failure mapping. Assert rejected requests do not call downstream dependencies.

The capture request helper uses real \`FormData\`:

\`\`\`ts
const form = new FormData();
form.set("audio", new File([new Uint8Array([1])], "idea.webm", { type: "audio/webm" }));
const request = new NextRequest("http://localhost/api/capture", {
  method: "POST",
  headers: { origin: "http://localhost", cookie: "spark-access-token=test-token" },
  body: form,
});
\`\`\`

- [ ] **Step 5: Implement thin Node-runtime route handlers**

Export \`runtime = "nodejs"\`. Check origin against \`request.nextUrl.origin\`; require the HttpOnly cookie; authenticate it; check \`content-length\` against 8.5 MB before parsing; accept exactly one \`audio\` File; and call the workflow. Use \`Cache-Control: private, no-store\`.

The ideas route accepts exactly \`{ text: string }\`, trims it, enforces 1–8,000 characters and a 64 KB JSON body limit, then inserts through the repository. Do not accept user IDs or timestamps.

- [ ] **Step 6: Run all server route tests**

Run: \`node --test app/api/auth/route.test.ts app/api/capture/route.test.ts app/api/ideas/route.test.ts lib/server/*.test.ts\`

Expected: PASS.

- [ ] **Step 7: Commit**

\`\`\`bash
git add lib/server/capture-workflow.ts lib/server/capture-workflow.test.ts app/api/capture/route.ts app/api/capture/route.test.ts app/api/ideas/route.ts app/api/ideas/route.test.ts
git commit -m "feat: add authenticated capture workflow"
\`\`\`

---

### Task 7: Submit real recordings and surface durable results

**Files:**
- Modify: \`components/use-recorder.ts\`
- Create: \`components/capture-client.ts\`
- Create: \`components/capture-client.test.ts\`
- Modify: \`components/capture.tsx\`
- Modify: \`app/globals.css\`

**Interfaces:**
- Produces recorder fields \`result\`, \`retryUpload()\`, and \`onCreated(result)\`.
- \`uploadCapture(audio, signal)\` validates the response union from Task 6.
- Consumes shared parent callbacks \`onIdeaCreated\` and \`onScriptCreated\`.

- [ ] **Step 1: Write failing capture-client tests**

Test \`uploadCapture\` with mocked fetch:

- multipart upload contains the audio file;
- 401/413/429/502 messages map to safe UI text;
- malformed or oversized responses fail closed;
- aborts are distinguishable from errors;
- idea, script, and no-match variants validate;
- no OpenAI or Supabase fields leak into returned client state.

- [ ] **Step 2: Run tests and observe failure**

Run: \`node --test components/capture-client.test.ts\`

Expected: FAIL because the client module does not exist.

- [ ] **Step 3: Implement the typed client API**

Use a same-origin \`fetch("/api/capture", { method: "POST", body: form, signal })\` with no manual auth header. Bound response text to 64 KB before JSON parsing and validate the discriminated union with Zod-compatible manual guards kept out of the browser's dependency graph if bundle inspection shows Zod would be material.

- [ ] **Step 4: Write a recorder state-machine regression test**

Extract pure transitions if necessary so a test can assert:

\`\`\`ts
recording -> processing -> done
recording -> processing -> error -> processing (retry) -> done
processing -> reset -> ready
\`\`\`

The stale completion after reset must not change \`ready\`, and the abort signal must be triggered.

- [ ] **Step 5: Connect MediaRecorder output to upload**

Retain the Blob rather than only its URL. When \`MediaRecorder.onstop\` fires, immediately call the upload client and remain in \`processing\`. Remove the 1.6-second fake timer. Revoke the URL and abort outstanding requests on reset/unmount. A retry reuses the captured Blob but never auto-retries.

- [ ] **Step 6: Replace fake result copy**

Render:

- real transcript for \`kind: "idea"\`;
- script title and a “View it in Phone → Scripts” action for \`kind: "script"\`;
- the no-recent-ideas message for \`kind: "no_recent_ideas"\`;
- role=alert error plus explicit retry/reset actions for failure.

Update the privacy line from “Your voice stays in this browser” to accurate transient-processing copy. Preserve semantic buttons, focus visibility, microphone denial handling, local playback, and 60-second limit.

- [ ] **Step 7: Run client and existing component tests**

Run: \`node --test components/*.test.ts components/necklace/*.test.ts\`

Expected: PASS.

- [ ] **Step 8: Commit**

\`\`\`bash
git add components/use-recorder.ts components/capture-client.ts components/capture-client.test.ts components/capture.tsx app/globals.css
git commit -m "feat: submit voice captures and show results"
\`\`\`

---

### Task 8: Database-backed phone library and manual ideas

**Files:**
- Modify: \`components/capture.tsx\`
- Modify: \`components/spark/spark-prototype.tsx\`
- Modify: \`components/spark/teleprompter.tsx\`
- Create: \`components/spark/library-client.ts\`
- Create: \`components/spark/library-client.test.ts\`
- Modify: \`app/globals.css\`

**Interfaces:**
- \`Capture({ initialLibrary, libraryError })\` owns \`ideas\` and \`scripts\`.
- \`SparkPrototype({ ideas, scripts, onIdeaCreated, libraryError })\` is presentation plus manual-create state.
- \`createIdea(text, signal): Promise<Idea>\` calls Task 6.

- [ ] **Step 1: Write failing manual-create client tests**

Cover valid create, whitespace, 8,000-character bound, malformed server response, 401/429/502, and abort. Assert the request body contains only \`text\`.

- [ ] **Step 2: Run tests and observe failure**

Run: \`node --test components/spark/library-client.test.ts\`

Expected: FAIL because \`createIdea\` is missing.

- [ ] **Step 3: Lift library state into Capture**

Initialize from \`initialLibrary\`. Add immutable prepend helpers that deduplicate by ID. Pass callbacks to the recording experience and phone prototype. When a capture creates a script, selecting “View it” changes the top navigation to Phone and opens Scripts; avoid duplicated synchronized state by passing one pending navigation intent and clearing it after consumption.

- [ ] **Step 4: Replace fixture imports in the phone**

Remove every \`sampleIdeas\` and \`sampleScripts\` reference. Render the passed arrays, derive groups, links, and counts from them, and show:

- “No ideas yet” with recording/manual-create guidance;
- “No scripts yet” with command guidance;
- a safe database-unavailable alert when \`libraryError\` is true, never fixtures.

Persist the manual form through \`createIdea\`. Disable its submit while saving, keep user input after a failure, show a role=alert retryable error, abort on unmount, and retain focus after success/cancel.

- [ ] **Step 5: Adapt details and teleprompter to persisted script text**

Render the paragraphs after the first title line from \`script.text\`. Resolve linked source ideas from the current ideas array; if an older source is outside the 50-row library window, show the linked-script count without inventing a title. Keep camera fallback and timer behavior unchanged.

- [ ] **Step 6: Run focused client tests**

Run: \`node --test components/*.test.ts components/necklace/*.test.ts components/spark/*.test.ts\`

Expected: PASS.

- [ ] **Step 7: Commit**

\`\`\`bash
git add components/capture.tsx components/spark/spark-prototype.tsx components/spark/teleprompter.tsx components/spark/library-client.ts components/spark/library-client.test.ts app/globals.css
git commit -m "feat: load ideas and scripts from the database"
\`\`\`

---

### Task 9: Critical browser journey, full verification, review, and simplification

**Files:**
- Modify: \`scripts/spark.test.mjs\`
- Modify: \`tests/landing.spec.ts\` only if its assumptions conflict with authenticated /home behavior
- Modify: \`tests/capture-interaction.spec.ts\`
- Modify: \`README.md\`
- Modify: implementation files only for verified failures, review findings, or simplification

**Interfaces:**
- Tests the complete observable contract produced by Tasks 1–8.
- No new product interface.

- [ ] **Step 1: Add a local Supabase stub to the browser harness**

In \`scripts/spark.test.mjs\`, start a loopback-only HTTP server on an ephemeral port before Next. It must return bounded deterministic responses for:

- \`GET /auth/v1/user\`;
- \`GET /rest/v1/ideas\`;
- \`GET /rest/v1/scripts\`;
- \`POST /rest/v1/ideas\`.

Launch Next with \`SUPABASE_URL\` set to this stub, a test publishable key, and no production secrets. Set the \`spark-access-token\` cookie in the browser context before visiting \`/home\`. Close both servers in \`after\`.

- [ ] **Step 2: Write failing browser tests**

Add tests that:

- database ideas and scripts appear on Phone, fixtures do not, details open, and teleprompter displays persisted body;
- empty database arrays render the two empty states;
- manual idea saving remains on screen during the request, appears after success, and retains input after a mocked 502;
- mocked MediaRecorder records/stops, \`page.route("**/api/capture")\` receives multipart upload, and idea/script/no-match/error responses render correctly;
- reset during a delayed capture response prevents the stale result from appearing;
- mobile width does not overflow and keyboard focus reaches new controls.

- [ ] **Step 3: Run the browser suite and observe failures**

Run: \`npm run build && npm run test:browser\`

Expected: new cases fail before the final harness/UI adjustments.

- [ ] **Step 4: Make only the test-proven integration adjustments**

Fix observable wiring, accessibility, and responsive issues found by the browser tests. Do not add test-only application bypasses, production fallback fixtures, or an OpenAI base-URL override.

- [ ] **Step 5: Document local setup and migration**

Update \`README.md\` with:

- required \`SUPABASE_URL\`, \`SUPABASE_PUBLISHABLE_KEY\`, and \`OPENAI_API_KEY\`;
- the migration filename to apply through the project's normal Supabase workflow;
- the exact \`npm run check\` gate;
- the 60-second/8 MB limits and statement that audio is not stored;
- a note that tests mock external services and spend no OpenAI credits.

- [ ] **Step 6: Run focused checks, then the canonical gate**

Run:

\`\`\`bash
npm run test
npm run lint:gate
npm run typecheck
npm run build
npm run test:browser
npm run check
\`\`\`

Expected: every command exits 0. If the full gate fails because the configured database migration has not been remotely applied, correct the tests to use mocks; do not mutate the remote database.

- [ ] **Step 7: Freeze the diff and dispatch independent review round 1**

Record \`git status --short\`, \`git diff --stat\`, base commit, and current HEAD. Keep reviewed files unchanged while a fresh review sub-agent follows \`docs/independent-review.md\` and \`docs/code-review-checklist.md\`. Supply the requested behavior, exact commits/files, checks run, and exclusions without secrets.

Expected reviewer result: actionable findings with IDs/severity/file:line, or explicit “no actionable findings.”

- [ ] **Step 8: Verify findings and fix only confirmed issues**

For each finding, inspect the cited path and reproduce or reason from the concrete call flow. Add a failing regression test before each valid fix. Record why any finding is rejected. P0 findings block completion.

- [ ] **Step 9: Perform the separate simplification-only pass**

With behavior fixed, inspect changed files for one-caller wrappers, duplicated validators/state, speculative props, dead branches, and files that can be removed. Preserve server/client, auth, database, and test seams that provide concrete isolation. If nothing can shrink, record that result.

- [ ] **Step 10: Rerun the full gate after all changes**

Run: \`npm run check\`

Expected: exits 0 on the final changed tree.

- [ ] **Step 11: Request review round 2 only when round-1 fixes or simplification changed code**

Send the same reviewer the subsequent diff and every finding disposition. Freeze files again. Stop after this follow-up; report unresolved findings rather than starting a third round.

- [ ] **Step 12: Commit final verification changes**

\`\`\`bash
git add scripts/spark.test.mjs tests components app lib README.md package.json package-lock.json supabase
git commit -m "test: verify persistent voice capture workflow"
\`\`\`

- [ ] **Step 13: Report completion evidence**

Report the worktree branch/path, migration file, product behavior, exact checks and outputs, review rounds and dispositions, simplification result, and any remaining risk. Do not claim the migration was applied or that live OpenAI calls were tested.
