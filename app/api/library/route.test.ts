import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { NextRequest } from 'next/server.js';
import { GET } from './route.ts';

const id = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
  mock.method(console, 'info', () => {});
});
afterEach(() => { mock.restoreAll(); delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY; });

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/library', { method: 'GET', headers: { cookie: 'spark-access-token=test-token', ...headers } });
}

function libraryBoundary() {
  return mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
    if (path === '/auth/v1/user') return Response.json({ id });
    if (path === '/rest/v1/ideas') return Response.json([{ id, text: 'A thought', created_at: '2026-09-08T12:00:00Z' }]);
    if (path === '/rest/v1/scripts') return Response.json([{ id, text: 'A script', idea_ids: [id], created_at: '2026-09-08T12:00:00Z' }]);
    throw new Error('Unexpected boundary');
  });
}

test('missing cookie is rejected without contacting the database', async () => {
  const external = mock.method(globalThis, 'fetch', async () => Response.json({ id }));
  const response = await GET(request({ cookie: '' }));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(external.mock.callCount(), 0);
});

test('invalid cookie is verified and rejected before loading the library', async () => {
  const external = mock.method(globalThis, 'fetch', async () => Response.json({ error: 'secret' }, { status: 401 }));
  const response = await GET(request());
  assert.equal(response.status, 401);
  assert.equal(external.mock.callCount(), 1);
});

test('returns ideas and scripts for an authenticated user', async () => {
  const external = libraryBoundary();
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const result = await response.json();
  assert.equal(result.ideas[0].title, 'A thought');
  assert.equal(result.scripts[0].title, 'A script');
  assert.equal(external.mock.callCount(), 3);
});

test('upstream library failure maps to a safe 503 without leaking internals', async () => {
  const external = mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname;
    if (path === '/auth/v1/user') return Response.json({ id });
    return new Response('secret', { status: 500 });
  });
  const response = await GET(request());
  assert.equal(response.status, 503);
  assert.equal(external.mock.callCount(), 3);
  assert.doesNotMatch(JSON.stringify(await response.json()), /secret|test-token/);
});
