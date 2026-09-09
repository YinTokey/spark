import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { NextRequest } from 'next/server.js';
import { POST } from './route.ts';

const id = '22222222-2222-4222-8222-222222222222';
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
  mock.method(console, 'info', () => {});
});
afterEach(() => { mock.restoreAll(); delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY; });

function request(body: unknown = { transcript: '  A manual idea  ' }, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/ideas', { method: 'POST', headers: { origin: 'http://localhost', cookie: 'spark-access-token=test-token', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

function boundary() {
  return mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
    if (path === '/auth/v1/user') return Response.json({ id });
    if (path === '/rest/v1/rpc/consume_idea_write') return Response.json(true);
    if (path === '/rest/v1/ideas') return Response.json([{ id, ...JSON.parse(String(init?.body)), created_at: '2026-09-08T12:00:00Z' }]);
    throw new Error('Unexpected boundary');
  });
}

for (const [headers, status, count] of [
  [{ cookie: '' }, 401, 0],
  [{ origin: 'https://attacker.example' }, 403, 0],
  [{ origin: '' }, 403, 0],
  [{ 'content-length': '65537' }, 413, 1],
  [{ 'content-length': 'invalid' }, 413, 1],
  [{ 'content-type': 'text/plain' }, 400, 1],
] as const) {
  test(`rejects idea headers ${JSON.stringify(headers)} before database operations`, async () => {
    const external = boundary();
    const response = await POST(request(undefined, headers));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(external.mock.callCount(), count);
  });
}

test('invalid cookie is verified and rejected before insertion', async () => {
  const external = mock.method(globalThis, 'fetch', async () => Response.json({ error: 'secret' }, { status: 401 }));
  assert.equal((await POST(request())).status, 401);
  assert.equal(external.mock.callCount(), 1);
});

for (const body of [null, [], {}, { transcript: '' }, { transcript: '   ' }, { transcript: 1 }, { transcript: 'a'.repeat(8001) }, { transcript: 'A thought', user_id: id }, { transcript: 'A thought', created_at: '2026-09-08' }, { transcript: 'A thought', id }]) {
  test(`invalid idea input ${JSON.stringify(body).slice(0, 90)} causes no write`, async () => {
    const external = boundary();
    assert.equal((await POST(request(body))).status, 400);
    assert.equal(external.mock.callCount(), 1);
  });
}

test('malformed and oversized actual JSON bodies are rejected before the rate RPC', async () => {
  const external = boundary();
  for (const [body, status] of [['{', 400], [' '.repeat(65_537), 413]] as const) {
    const response = await POST(new NextRequest('http://localhost/api/ideas', { method: 'POST', headers: { origin: 'http://localhost', cookie: 'spark-access-token=test-token', 'content-type': 'application/json', 'content-length': '1' }, body }));
    assert.equal(response.status, status);
  }
  assert.equal(external.mock.callCount(), 2);
});

test('manual transcript is trimmed and saved once with no caller-owned fields or AI quota', async () => {
  const external = boundary();
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const result = await response.json();
  assert.equal(result.idea.note, 'A manual idea');
  assert.equal(result.idea.id, id);
  assert.equal(external.mock.callCount(), 3);
  assert.deepEqual(JSON.parse(String(external.mock.calls[2].arguments[1]?.body)), { transcript: 'A manual idea' });
});

for (const transcript of ['a', 'a'.repeat(8000)]) {
  test(`accepts transcript boundary ${transcript.length}`, async () => {
    boundary();
    assert.equal((await POST(request({ transcript }))).status, 200);
  });
}

test('manual JSON byte boundary is accepted', async () => {
  boundary();
  const body = JSON.stringify({ transcript: 'a' }).padEnd(65_536, ' ');
  const incoming = new NextRequest('http://localhost/api/ideas', { method: 'POST', headers: { origin: 'http://localhost', cookie: 'spark-access-token=test-token', 'content-type': 'application/json', 'content-length': '65536' }, body });
  assert.equal((await POST(incoming)).status, 200);
});

for (const failure of ['rate_denied', 'rate_failed', 'insert'] as const) {
  test(`manual ${failure} is safe and never retried`, async () => {
    const external = mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname;
      if (path === '/auth/v1/user') return Response.json({ id });
      if (path.endsWith('consume_idea_write')) return failure === 'rate_failed' ? new Response('secret', { status: 500 }) : Response.json(failure !== 'rate_denied');
      return new Response('secret', { status: 500 });
    });
    const response = await POST(request());
    assert.equal(response.status, failure === 'rate_denied' ? 429 : failure === 'rate_failed' ? 503 : 502);
    assert.equal(external.mock.callCount(), failure === 'insert' ? 3 : 2);
    assert.doesNotMatch(JSON.stringify(await response.json()), /secret|test-token/);
  });
}
