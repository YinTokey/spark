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

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/realtime-token', {
    method: 'POST', headers: { origin: 'http://localhost', cookie: 'spark-access-token=test-token', ...headers },
  });
}

function boundary() {
  return mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname;
    if (path === '/auth/v1/user') return Response.json({ id });
    if (path === '/v1/realtime/client_secrets') return Response.json({
      value: 'ek_test_live_token', expires_at: Math.floor(Date.now() / 1_000) + 60, session: { type: 'transcription' },
    });
    throw new Error(`Unexpected external boundary: ${path}`);
  });
}

test('rejects cross-origin and unauthenticated requests before a Realtime secret is created', async () => {
  const external = boundary();
  assert.equal((await POST(request({ origin: 'https://attacker.example' }))).status, 403);
  assert.equal((await POST(request({ cookie: '' }))).status, 401);
  assert.equal(external.mock.callCount(), 0);
});

test('returns only a short-lived credential to an authenticated same-origin caller', async () => {
  const external = boundary();
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json();
  assert.equal(body.value, 'ek_test_live_token');
  assert.ok(body.expiresAt >= Math.floor(Date.now() / 1_000) + 59);
  assert.ok(body.expiresAt <= Math.floor(Date.now() / 1_000) + 60);
  assert.equal(external.mock.callCount(), 2);
});

test('returns a safe unavailable error when the Realtime credential provider fails', async () => {
  const external = mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    if (new URL(String(url)).pathname === '/auth/v1/user') return Response.json({ id });
    return new Response('private upstream error', { status: 503 });
  });
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private|fake-unit|test-token/);
  assert.equal(external.mock.callCount(), 2);
});
