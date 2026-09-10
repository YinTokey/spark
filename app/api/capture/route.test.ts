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
afterEach(() => { mock.restoreAll(); delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY; delete process.env.OPENAI_API_KEY; });

function request(form?: FormData, headers: Record<string, string> = {}) {
  const body = form ?? new FormData();
  if (!form) body.set('audio', new File([new Uint8Array([1])], 'idea.webm', { type: 'audio/webm' }));
  return new NextRequest('http://localhost/api/capture', { method: 'POST', headers: { origin: 'http://localhost', cookie: 'spark-access-token=test-token', ...headers }, body });
}

function boundary() {
  return mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    const path = new URL(target).pathname;
    assert.equal(new Headers(init?.headers).get('Authorization'), target.includes('openai.com') ? 'Bearer fake-unit-test-only' : 'Bearer test-token');
    if (path.endsWith('/auth/v1/user')) return Response.json({ id });
    if (path.endsWith('/audio/transcriptions')) return Response.json({ text: 'A captured idea' });
    if (path.endsWith('/rest/v1/ideas')) return Response.json([{ id, text: 'A captured idea', created_at: '2026-09-08T12:00:00Z' }]);
    throw new Error(`Unexpected external boundary: ${path}`);
  });
}

for (const [headers, status, count] of [
  [{ cookie: '' }, 401, 0],
  [{ origin: 'https://attacker.example' }, 403, 0],
  [{ origin: '' }, 403, 0],
  [{ origin: 'null' }, 403, 0],
  [{ 'content-length': '8912897' }, 413, 1],
  [{ 'content-length': 'invalid' }, 413, 1],
] as const) {
  test(`rejects capture headers ${JSON.stringify(headers)} before downstream operations`, async () => {
    const external = boundary();
    const response = await POST(request(undefined, headers));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(external.mock.callCount(), count);
  });
}

test('invalid cookies are authenticated and rejected before parsing or operations', async () => {
  const external = mock.method(globalThis, 'fetch', async () => Response.json({ error: 'private upstream' }, { status: 401 }));
  const response = await POST(request());
  assert.equal(response.status, 401);
  assert.equal(external.mock.callCount(), 1);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private upstream/);
});

for (const variant of ['missing', 'text', 'duplicate', 'extra', 'empty', 'type', 'oversized'] as const) {
  test(`rejects ${variant} audio before rate consumption or OpenAI`, async () => {
    const external = boundary();
    const form = new FormData();
    if (variant !== 'missing') form.append('audio', variant === 'text' ? 'not a file' : new File([new Uint8Array(variant === 'empty' ? 0 : variant === 'oversized' ? 8_388_609 : 1)], 'audio', { type: variant === 'type' ? 'text/plain' : 'audio/webm' }));
    if (variant === 'duplicate') form.append('audio', new File(['x'], 'more.webm', { type: 'audio/webm' }));
    if (variant === 'extra') form.append('user_id', id);
    const response = await POST(request(form));
    assert.equal(response.status, variant === 'oversized' ? 413 : 400);
    assert.equal(external.mock.callCount(), 1);
  });
}

test('malformed multipart and unsupported body encoding are safely rejected', async () => {
  const external = boundary();
  for (const contentType of ['multipart/form-data; boundary=broken', 'application/json']) {
    const response = await POST(new NextRequest('http://localhost/api/capture', { method: 'POST', headers: { origin: 'http://localhost', cookie: 'spark-access-token=test-token', 'content-type': contentType }, body: '{' }));
    assert.equal(response.status, 400);
  }
  assert.equal(external.mock.callCount(), 2);
});

test('actual body size is capped without trusting content-length and the stream is cancelled', async () => {
  const external = boundary();
  const cancel = mock.fn();
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8_912_897)); }, cancel });
  const init = { method: 'POST', headers: { origin: 'http://localhost', cookie: 'spark-access-token=test-token', 'content-type': 'multipart/form-data; boundary=x', 'content-length': '1' }, body, duplex: 'half' as const };
  const incoming = new NextRequest('http://localhost/api/capture', init);
  const response = await POST(incoming);
  assert.equal(response.status, 413);
  assert.equal(external.mock.callCount(), 1);
  assert.equal(cancel.mock.callCount(), 1);
});

test('valid audio authenticates, rate-limits, transcribes and persists exactly once', async () => {
  const external = boundary();
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const result = await response.json();
  assert.equal(result.kind, 'idea');
  assert.equal(result.idea.note, 'A captured idea');
  assert.equal(result.idea.id, id);
  assert.deepEqual(external.mock.calls.map((call) => new URL(String(call.arguments[0])).pathname), ['/auth/v1/user', '/v1/audio/transcriptions', '/rest/v1/ideas']);
  assert.deepEqual(JSON.parse(String(external.mock.calls[2].arguments[1]?.body)), { text: 'A captured idea' });
});

test('maximum supported audio size is accepted', async () => {
  const external = boundary();
  const form = new FormData();
  form.set('audio', new File([new Uint8Array(8_388_608)], 'idea.webm', { type: 'audio/webm' }));
  assert.equal((await POST(request(form))).status, 200);
  assert.equal(external.mock.callCount(), 3);
});

test('preserves the case-sensitive WebKit multipart boundary from the original header', async () => {
  const external = boundary();
  const boundaryName = '----WebKitFormBoundaryAaB03xYz';
  const body = `--${boundaryName}\r\nContent-Disposition: form-data; name="audio"; filename="idea.webm"\r\nContent-Type: audio/webm\r\n\r\nx\r\n--${boundaryName}--\r\n`;
  const incoming = new NextRequest('http://localhost/api/capture', {
    method: 'POST', headers: { origin: 'http://localhost', cookie: 'spark-access-token=test-token', 'content-type': `multipart/form-data; boundary=${boundaryName}` }, body,
  });
  const response = await POST(incoming);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).kind, 'idea');
  assert.equal(external.mock.callCount(), 3);
});

test('supported browser codec parameters are accepted and unsupported media bases are rejected', async () => {
  const external = boundary();
  for (const [type, status] of [['audio/webm;codecs=opus', 200], ['video/webm;codecs=opus', 400]] as const) {
    const form = new FormData();
    form.set('audio', new File(['x'], 'idea.webm', { type }));
    assert.equal((await POST(request(form))).status, status);
  }
  assert.equal(external.mock.callCount(), 4);
});

for (const failure of ['transcription', 'insert'] as const) {
  test(`${failure} returns a safe error with no automatic retries`, async () => {
    const calls: string[] = [];
    mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname;
      calls.push(path);
      if (path === '/auth/v1/user') return Response.json({ id });
      if (path.endsWith('transcriptions') && failure !== 'transcription') return Response.json({ text: 'A captured idea' });
      return new Response('secret', { status: 500 });
    });
    const response = await POST(request());
    assert.equal(response.status, 502);
    assert.equal(new Set(calls).size, calls.length);
    assert.equal(calls.length, failure === 'transcription' ? 2 : 3);
    const result = await response.json();
    assert.equal(typeof result.code, 'string');
    assert.equal(typeof result.error, 'string');
    assert.doesNotMatch(JSON.stringify(result), /secret|test-token|fake-unit/);
  });
}
