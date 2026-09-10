import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { readRealtimeAnswer, requestRealtimeToken } from './live-transcript-client.ts';

test('accepts a bounded SDP answer and rejects an oversized streamed answer', async () => {
  assert.equal(await readRealtimeAnswer(new Response('v=0\r\na=setup:active')), 'v=0\r\na=setup:active');
  assert.equal(await readRealtimeAnswer(new Response('v=0' + 'x'.repeat(65_536))), null);
});

test('rejects empty and non-SDP Realtime answers', async () => {
  assert.equal(await readRealtimeAnswer(new Response('')), null);
  assert.equal(await readRealtimeAnswer(new Response('{"error":"private"}')), null);
});

test('logs only safe token failure metadata for browser diagnostics', async () => {
  const warn = mock.method(console, 'warn', () => {});
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('private upstream message', { status: 503 }));
  await assert.rejects(requestRealtimeToken(), /realtime_token_unavailable/);
  assert.deepEqual(warn.mock.calls[0].arguments, ['live_transcription.failed', { stage: 'token_request', httpStatus: 503 }]);
  assert.doesNotMatch(JSON.stringify(warn.mock.calls), /private upstream message/);
  fetchMock.mock.restore();
  warn.mock.restore();
});
