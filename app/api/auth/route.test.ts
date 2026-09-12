import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { NextRequest } from 'next/server.js';
import { POST } from './route.ts';

const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
  mock.restoreAll();
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
  else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
});

function authRequest(body: Record<string, string>) {
  return new NextRequest('http://localhost/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' }, body: JSON.stringify(body) });
}

function configureSupabase() {
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
}

test('password login stores the Supabase session in HTTP-only cookies', async () => {
  configureSupabase();
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }));
  const response = await POST(authRequest({ mode: 'login', email: 'creator@example.com', password: 'secret1' }));
  assert.equal(response.status, 200);
  assert.equal(fetchMock.mock.calls[0].arguments[0], 'https://project.supabase.co/auth/v1/token?grant_type=password');
  const cookies = response.headers.getSetCookie().join('\n');
  assert.match(cookies, /spark-access-token=access/);
  assert.match(cookies, /spark-refresh-token=refresh/);
  assert.match(cookies, /HttpOnly/);
});

test('password registration uses the Supabase signup endpoint', async () => {
  configureSupabase();
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ access_token: 'access', refresh_token: 'refresh' }));
  const response = await POST(authRequest({ mode: 'register', email: 'creator@example.com', confirmEmail: 'creator@example.com', password: 'secret1', invitationCode: 'sparkvid' }));
  assert.equal(response.status, 200);
  assert.equal(fetchMock.mock.calls[0].arguments[0], 'https://project.supabase.co/auth/v1/signup');
});

test('registration without an immediate session asks for email confirmation', async () => {
  configureSupabase();
  mock.method(globalThis, 'fetch', async () => Response.json({ id: 'user-id', email: 'creator@example.com' }));
  const response = await POST(authRequest({ mode: 'register', email: 'creator@example.com', confirmEmail: 'creator@example.com', password: 'secret1', invitationCode: 'sparkvid' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: 'Check your email to finish registering.' });
});

test('server rejects a short registration password before Supabase', async () => {
  configureSupabase();
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({}));
  const response = await POST(authRequest({ mode: 'register', email: 'creator@example.com', confirmEmail: 'creator@example.com', password: '12345', invitationCode: 'sparkvid' }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Register with a valid email and a password of at least 6 characters.' });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('server rejects mismatched registration emails before Supabase', async () => {
  configureSupabase();
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({}));
  const response = await POST(authRequest({ mode: 'register', email: 'creator@example.com', confirmEmail: 'other@example.com', password: 'secret1', invitationCode: 'sparkvid' }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Email addresses do not match.' });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('server rejects an invalid invitation code before Supabase', async () => {
  configureSupabase();
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({}));
  const response = await POST(authRequest({ mode: 'register', email: 'creator@example.com', confirmEmail: 'creator@example.com', password: 'secret1', invitationCode: 'wrong' }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Enter a valid invitation code.' });
  assert.equal(fetchMock.mock.callCount(), 0);
});
