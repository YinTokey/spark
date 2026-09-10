import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { NextRequest } from 'next/server.js';
import { authorizeMutation, MutationError, readMutationBody } from './mutation-request.ts';

test('authorization returns the verified user ID with the cookie token', async () => {
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
  const external = mock.method(globalThis, 'fetch', async () => Response.json({ id: 'user-1' }));
  const request = new NextRequest('http://localhost/api/ideas', {
    method: 'POST',
    headers: { origin: 'http://localhost', cookie: 'spark-access-token=test-token' },
  });

  try {
    assert.deepEqual(await authorizeMutation(request, 1024), { token: 'test-token', userId: 'user-1' });
    assert.equal(external.mock.callCount(), 1);
  } finally {
    mock.restoreAll();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  }
});

function streamingRequest(body: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  const init = { method: 'POST', body, signal, duplex: 'half' as const };
  return new NextRequest('http://localhost/api/capture', init);
}

test('stalled request bodies time out and cancel their reader', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const cancel = mock.fn();
  const pending = readMutationBody(streamingRequest(new ReadableStream({ cancel })), 1024);
  const rejected = assert.rejects(pending, (error: unknown) => error instanceof MutationError && error.status === 408 && error.code === 'request_timeout');
  context.mock.timers.tick(15_000);
  await rejected;
  assert.equal(cancel.mock.callCount(), 1);
});

test('cancellation interrupts a stalled body read', async () => {
  const controller = new AbortController();
  const cancel = mock.fn();
  const pending = readMutationBody(streamingRequest(new ReadableStream({ cancel }), controller.signal), 1024);
  const rejected = assert.rejects(pending, (error: unknown) => error instanceof MutationError && error.status === 409);
  controller.abort();
  await rejected;
  assert.equal(cancel.mock.callCount(), 1);
});

test('broken incoming stream returns a stable error without internal text', async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('private detail')); } });
  await assert.rejects(readMutationBody(streamingRequest(body), 1024), (error: unknown) => error instanceof MutationError && error.code === 'invalid_body' && !error.message.includes('private detail'));
});
