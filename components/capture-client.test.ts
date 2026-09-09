import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { uploadCapture } from "./capture-client.ts";

const idea = { id: "idea-1", title: "A thought", note: "A full thought", date: "Today", time: "12:00", status: "Raw" as const };
const script = {
  id: "script-1", title: "A script", status: "Ready to record" as const,
  ideaIds: ["idea-1"], hook: "A hook", points: ["A point"], outro: "An outro",
};
const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });

afterEach(() => mock.restoreAll());

test("uploads a multipart audio file to the capture route without manual auth", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({ kind: "idea", idea }));
  const result = await uploadCapture(audio);
  assert.equal(result.kind, "idea");
  const [url, init] = fetchMock.mock.calls[0].arguments as [string | URL | Request, RequestInit | undefined];
  assert.equal(String(url), "/api/capture");
  assert.equal(init?.method, "POST");
  assert.ok(init?.body instanceof FormData);
  const file = init.body.get("audio");
  assert.ok(file instanceof File);
  assert.equal(file.type, "audio/webm");
  assert.equal(new Headers(init?.headers).get("Authorization"), null);
});

test("maps HTTP failures to safe UI text without trusting the server body", async () => {
  for (const [status, expected] of [
    [401, "sign in"], [413, "too large"], [429, "wait an hour"], [502, "try again"], [503, "temporarily unavailable"],
  ] as const) {
    mock.restoreAll();
    mock.method(globalThis, "fetch", async () => new Response('{"error":"secret"}', { status }));
    const result = await uploadCapture(audio);
    assert.equal(result.kind, "error");
    assert.match(result.message, new RegExp(expected, "i"));
  }
});

test("malformed and oversized responses fail closed as retryable errors", async () => {
  mock.method(globalThis, "fetch", async () => new Response("{", { headers: { "content-length": "1" } }));
  const malformed = await uploadCapture(audio);
  assert.equal(malformed.kind, "error");
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => new Response("x".repeat(65_537)));
  const oversized = await uploadCapture(audio);
  assert.equal(oversized.kind, "error");
  assert.equal(oversized.retryable, true);
});

test("an aborted request rethrows instead of returning a failure", async () => {
  const controller = new AbortController();
  mock.method(globalThis, "fetch", async () => { throw new DOMException("The operation was aborted.", "AbortError"); });
  await assert.rejects(uploadCapture(audio, controller.signal), (error: unknown) => error instanceof DOMException && error.name === "AbortError");
});

test("forwards the caller signal to fetch", async () => {
  const controller = new AbortController();
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({ kind: "no_recent_ideas", message: "none" }));
  await uploadCapture(audio, controller.signal);
  assert.equal((fetchMock.mock.calls[0].arguments as [string, RequestInit])[1].signal, controller.signal);
});

test("validates the idea, script and no-match response variants", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ kind: "idea", idea }));
  assert.deepEqual(await uploadCapture(audio), { kind: "idea", idea });
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => Response.json({ kind: "script", script }));
  assert.deepEqual(await uploadCapture(audio), { kind: "script", script });
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => Response.json({ kind: "no_recent_ideas", message: "Capture an idea first." }));
  assert.deepEqual(await uploadCapture(audio), { kind: "no_recent_ideas", message: "Capture an idea first." });
});

test("does not leak unknown server or upstream fields into client state", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ kind: "idea", idea: { ...idea, user_id: "leak", openai: "leak", supabase: "leak" }, error: "leak" }));
  const result = await uploadCapture(audio);
  assert.equal(result.kind, "idea");
  assert.deepEqual(result.idea, idea);
  assert.ok(!("user_id" in result.idea) && !("openai" in result.idea) && !("supabase" in result.idea));
});
