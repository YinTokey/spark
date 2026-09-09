import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { TranscriptionError, transcribeAudio } from './transcription.ts';

const endpoint = 'https://api.openai.com/v1/audio/transcriptions';

afterEach(() => {
  mock.restoreAll();
  delete process.env.OPENAI_API_KEY;
});

function configureOpenAi() {
  process.env.OPENAI_API_KEY = 'server-only-test-key';
}

function audio(type = 'audio/webm', size = 3) {
  return new File([new Uint8Array(size)], 'idea.webm', { type });
}

function isError(code: TranscriptionError['code']) {
  return (error: unknown) => error instanceof TranscriptionError && error.code === code;
}

test('sends valid audio to the fixed Whisper endpoint with a bounded no-store request', async () => {
  configureOpenAi();
  let timeoutMs = 0;
  mock.method(AbortSignal, 'timeout', (delay: number) => {
    timeoutMs = delay;
    return new AbortController().signal;
  });
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ text: 'An idea about making creator tools disappear.' }));

  const text = await transcribeAudio(audio(), { correlationId: 'capture-123' });

  assert.equal(text, 'An idea about making creator tools disappear.');
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(fetchMock.mock.calls[0].arguments[0], endpoint);
  const init = fetchMock.mock.calls[0].arguments[1];
  assert.equal(init?.method, 'POST');
  assert.equal(init?.cache, 'no-store');
  assert.equal(init?.redirect, 'error');
  assert.equal(timeoutMs, 30_000);
  assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-only-test-key');
  assert.ok(init?.body instanceof FormData);
  assert.equal(init.body.get('model'), 'whisper-1');
  assert.equal((init.body.get('file') as File).name, 'idea.webm');
});

test('accepts each MediaRecorder audio type', async () => {
  configureOpenAi();
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ text: 'Captured idea' }));

  for (const type of ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']) {
    assert.equal(await transcribeAudio(audio(type)), 'Captured idea');
  }
  assert.equal(fetchMock.mock.callCount(), 5);
});

test('supports codec parameters only for allowed audio media types', async () => {
  configureOpenAi();
  const external = mock.method(globalThis, 'fetch', async () => Response.json({ text: 'A browser recording' }));
  assert.equal(await transcribeAudio(audio('audio/webm;codecs=opus')), 'A browser recording');
  await assert.rejects(transcribeAudio(audio('video/webm;codecs=opus')), isError('invalid_audio'));
  assert.equal(external.mock.callCount(), 1);
});

test('rejects invalid audio before contacting Whisper', async () => {
  configureOpenAi();
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ text: 'unreachable' }));

  await assert.rejects(transcribeAudio(audio('audio/webm', 0)), isError('invalid_audio'));
  await assert.rejects(transcribeAudio(audio('audio/flac')), isError('invalid_audio'));
  await assert.rejects(transcribeAudio(audio('audio/webm', 8 * 1024 * 1024 + 1)), isError('invalid_audio'));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('does not call Whisper without a server API key', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ text: 'unreachable' }));

  await assert.rejects(transcribeAudio(audio()), isError('not_configured'));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('caller cancellation reaches Whisper and rejects a late response without another request', async () => {
  configureOpenAi();
  const controller = new AbortController();
  const external = mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    assert.equal(init?.signal?.aborted, false);
    controller.abort();
    assert.equal(init?.signal?.aborted, true);
    return Response.json({ text: 'Late transcript' });
  });
  await assert.rejects(transcribeAudio(audio(), { signal: controller.signal }), /cancelled/);
  assert.equal(external.mock.callCount(), 1);
  await assert.rejects(transcribeAudio(audio(), { signal: controller.signal }), /cancelled/);
  assert.equal(external.mock.callCount(), 1);
});

test('maps rate limits and unavailable upstream failures without exposing their text', async () => {
  configureOpenAi();
  mock.method(globalThis, 'fetch', async () => new Response('secret upstream details', { status: 429 }));
  await assert.rejects(transcribeAudio(audio()), isError('upstream_unavailable'));
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => new Response('secret upstream details', { status: 503 }));
  await assert.rejects(transcribeAudio(audio()), isError('upstream_unavailable'));
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => { throw new Error('network details'); });
  await assert.rejects(transcribeAudio(audio()), isError('upstream_unavailable'));
});

test('rejects oversized or malformed Whisper responses and invalid transcripts', async () => {
  configureOpenAi();
  mock.method(globalThis, 'fetch', async () => new Response('{', { headers: { 'content-length': '1' } }));
  await assert.rejects(transcribeAudio(audio()), isError('upstream_invalid'));
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => new Response('{"text":"x"}', { headers: { 'content-length': '65537' } }));
  await assert.rejects(transcribeAudio(audio()), isError('upstream_invalid'));
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => Response.json({ text: '   ' }));
  await assert.rejects(transcribeAudio(audio()), isError('upstream_invalid'));
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => Response.json({ text: 'x'.repeat(8_001) }));
  await assert.rejects(transcribeAudio(audio()), isError('upstream_invalid'));
});
