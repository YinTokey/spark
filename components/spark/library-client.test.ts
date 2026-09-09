import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { createIdea } from "./library-client.ts";

const idea = { id: "idea-1", title: "A thought", note: "A thought", date: "Today", time: "12:00", status: "Raw" as const };

afterEach(() => mock.restoreAll());

test("sends exactly the trimmed transcript and returns the created idea", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({ idea }));
  const result = await createIdea("  A thought  ");
  assert.deepEqual(result, { idea });
  const [url, init] = fetchMock.mock.calls[0].arguments as [string | URL | Request, RequestInit | undefined];
  assert.equal(String(url), "/api/ideas");
  assert.equal(init?.method, "POST");
  assert.equal(new Headers(init?.headers).get("Content-Type"), "application/json");
  assert.deepEqual(JSON.parse(String(init?.body)), { transcript: "A thought" });
});

test("rejects whitespace and overlong ideas before contacting the server", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({ idea }));
  const blank = await createIdea("   ");
  assert.ok("error" in blank && blank.error === "Enter an idea before saving.");
  const long = await createIdea("a".repeat(8_001));
  assert.ok("error" in long && long.error === "Keep your idea under 8,000 characters.");
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("accepts the 8,000-character bound", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ idea }));
  const result = await createIdea("a".repeat(8_000));
  assert.ok("idea" in result);
});

test("maps HTTP failures to safe UI text without trusting the server body", async () => {
  for (const [status, expected] of [
    [401, "sign in"], [429, "wait an hour"], [502, "saved"], [503, "temporarily unavailable"],
  ] as const) {
    mock.restoreAll();
    mock.method(globalThis, "fetch", async () => new Response('{"error":"secret"}', { status }));
    const result = await createIdea("A thought");
    assert.equal("error" in result, true);
    assert.match("error" in result ? result.error : "", new RegExp(expected, "i"));
  }
});

test("malformed and oversized responses fail closed", async () => {
  mock.method(globalThis, "fetch", async () => new Response("{", { headers: { "content-length": "1" } }));
  assert.ok("error" in await createIdea("A thought"));
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => new Response("x".repeat(65_537)));
  assert.ok("error" in await createIdea("A thought"));
});

test("an aborted request rethrows instead of returning a failure", async () => {
  const controller = new AbortController();
  mock.method(globalThis, "fetch", async () => { throw new DOMException("The operation was aborted.", "AbortError"); });
  await assert.rejects(createIdea("A thought", controller.signal), (error: unknown) => error instanceof DOMException && error.name === "AbortError");
});

test("does not leak unexpected server fields into the returned idea", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ idea: { ...idea, user_id: "leak", transcript: "leak" } }));
  const result = await createIdea("A thought");
  assert.ok("idea" in result);
  if ("idea" in result) assert.deepEqual(result.idea, idea);
});
