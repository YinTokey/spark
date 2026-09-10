import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { NextRequest } from 'next/server.js';
import { POST } from './route.ts';

const id = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
  process.env.OPENAI_API_KEY = 'fake-unit-test-only';
  mock.method(console, 'info', () => {});
});

afterEach(() => {
  mock.restoreAll();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.OPENAI_API_KEY;
});

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/capture/transcript', {
    method: 'POST',
    headers: { origin: 'http://localhost', cookie: 'spark-access-token=test-token', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function boundary() {
  return mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path === '/auth/v1/user') return Response.json({ id });
    if (path === '/rest/v1/ideas') {
      assert.deepEqual(JSON.parse(String(init?.body)), { text: 'A transcript from live captions' });
      return Response.json([{ id, text: 'A transcript from live captions', created_at: '2026-09-10T12:00:00Z' }]);
    }
    throw new Error(`Unexpected external boundary: ${path}`);
  });
}

test('rejects invalid transcript input before any persistence work', async () => {
  for (const body of [{ transcript: '' }, { transcript: 'x'.repeat(8_001) }, { transcript: 'valid', extra: true }, { text: 'valid' }]) {
    const external = boundary();
    const response = await POST(request(body));
    assert.equal(response.status, 400);
    assert.equal(external.mock.callCount(), 1);
    mock.restoreAll();
    mock.method(console, 'info', () => {});
  }
});

test('saves a validated live transcript without contacting the batch transcription endpoint', async () => {
  const external = boundary();
  const response = await POST(request({ transcript: '  A transcript from live captions  ' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).kind, 'idea');
  assert.deepEqual(external.mock.calls.map(call => new URL(String(call.arguments[0])).pathname), ['/auth/v1/user', '/rest/v1/ideas']);
});

test('rejects cross-origin transcript submissions before authentication or persistence', async () => {
  const external = boundary();
  assert.equal((await POST(request({ transcript: 'valid' }, { origin: 'https://attacker.example' }))).status, 403);
  assert.equal(external.mock.callCount(), 0);
});
