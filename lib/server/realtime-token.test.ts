import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { RealtimeTokenError, createRealtimeClientSecret } from './realtime-token.ts';

const endpoint = 'https://api.openai.com/v1/realtime/client_secrets';

afterEach(() => {
  mock.restoreAll();
  delete process.env.OPENAI_API_KEY;
});

function isError(code: RealtimeTokenError['code']) {
  return (error: unknown) => error instanceof RealtimeTokenError && error.code === code;
}

test('creates a short-lived client secret for the fixed live transcription session', async () => {
  process.env.OPENAI_API_KEY = 'server-only-test-key';
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({
    value: 'ek_test_live_transcription',
    expires_at: Math.floor(Date.now() / 1_000) + 300,
    session: { type: 'transcription' },
  }));

  const result = await createRealtimeClientSecret({ correlationId: 'capture-1' });

  assert.equal(result.value, 'ek_test_live_transcription');
  assert.ok(result.expiresAt > Math.floor(Date.now() / 1_000));
  const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
  assert.equal(url, endpoint);
  assert.equal(init.method, 'POST');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.redirect, 'error');
  assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer server-only-test-key');
  assert.deepEqual(JSON.parse(String(init.body)), {
    expires_after: { anchor: 'created_at', seconds: 60 },
    session: {
      type: 'transcription',
      audio: { input: { transcription: { model: 'gpt-realtime-whisper' }, turn_detection: null } },
    },
  });
});

test('maps inaccessible or malformed upstream responses to safe errors', async () => {
  process.env.OPENAI_API_KEY = 'server-only-test-key';
  mock.method(globalThis, 'fetch', async () => new Response('private upstream detail', { status: 503 }));
  await assert.rejects(createRealtimeClientSecret({ correlationId: 'capture-1' }), isError('upstream_unavailable'));

  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => Response.json({ value: 'not-a-secret', expires_at: 0, session: {} }));
  await assert.rejects(createRealtimeClientSecret({ correlationId: 'capture-1' }), isError('upstream_invalid'));
});

test('does not call OpenAI without a configured server key', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ value: 'unreachable' }));
  await assert.rejects(createRealtimeClientSecret({ correlationId: 'capture-1' }), isError('not_configured'));
  assert.equal(fetchMock.mock.callCount(), 0);
});
