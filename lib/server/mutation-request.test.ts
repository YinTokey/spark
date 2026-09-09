import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { NextRequest } from 'next/server.js';
import { MutationError, readMutationBody } from './mutation-request.ts';

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
