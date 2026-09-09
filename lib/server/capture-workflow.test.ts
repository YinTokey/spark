import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { CaptureWorkflowError, processCapture } from './capture-workflow.ts';
import { TranscriptionError } from './transcription.ts';
import { ScriptAgentError, type GeneratedScript } from './script-agent.ts';
import { RepositoryError } from './spark-repository.ts';
import type { Idea, Script } from '../spark-data.ts';

const audio = new File([new Uint8Array([1])], 'idea.webm', { type: 'audio/webm' });
const idea: Idea = { id: 'idea', title: 'A thought', note: 'A thought', date: 'Today', time: '12:00', status: 'Raw' };
const script: Script = { id: 'script', title: 'Focus', hook: 'Hook', points: ['Body'], outro: 'Outro', ideaIds: ['idea'], status: 'Ready to record' };
const generated: GeneratedScript = { title: 'Focus', hook: 'Hook', body: 'Body', outro: 'Outro', ideaIds: ['2b38059a-fb7f-4a21-a845-dc09b3045336'] };
afterEach(() => mock.restoreAll());

function dependencies(command = false) {
  const events: string[] = [];
  const repository = {
    consumeAiRequest: mock.fn(async () => { events.push('rate'); return true; }),
    insertIdea: mock.fn(async (text: string) => { events.push(`idea:${text}`); return idea; }),
    insertScript: mock.fn(async (input: unknown) => { assert.deepEqual(input, generated); events.push('script'); return script; }),
    findRecentIdeas: mock.fn(async () => []),
  };
  const transcribeAudio = mock.fn(async (file: File, options?: { correlationId?: string }): Promise<string> => { assert.equal(file, audio); assert.ok(options?.correlationId); events.push('transcribe'); return command ? 'Write a script about focus' : 'A thought'; });
  const parseScriptCommand = mock.fn(() => { events.push('parse'); return command ? { isCommand: true as const, hint: 'focus' } : { isCommand: false as const }; });
  const generateScript = mock.fn(async (options: Parameters<typeof import('./script-agent.ts').generateScript>[0]): Promise<GeneratedScript | null> => { assert.equal(options.hint, 'focus'); events.push('generate'); return generated; });
  return { repository, transcribeAudio, parseScriptCommand, generateScript, events };
}

test('ordinary speech consumes a rate slot, transcribes and inserts exactly one idea', async () => {
  const deps = dependencies();
  assert.deepEqual(await processCapture(audio, deps), { kind: 'idea', idea });
  assert.deepEqual(deps.events, ['rate', 'transcribe', 'parse', 'idea:A thought']);
  assert.equal(deps.generateScript.mock.callCount(), 0);
});

test('a command is never stored as an idea and one generated script is persisted', async () => {
  const deps = dependencies(true);
  assert.deepEqual(await processCapture(audio, deps), { kind: 'script', script });
  assert.deepEqual(deps.events, ['rate', 'transcribe', 'parse', 'generate', 'script']);
  assert.equal(deps.repository.insertIdea.mock.callCount(), 0);
  assert.equal(deps.repository.insertScript.mock.calls[0].arguments[0], generated);
  const options = deps.generateScript.mock.calls[0].arguments[0];
  assert.equal(options.command, 'Write a script about focus');
  assert.equal(options.hint, 'focus');
  assert.equal(options.repository, deps.repository);
  assert.match(options.correlationId ?? '', /^[0-9a-f-]{36}$/);
  assert.equal(options.correlationId, deps.transcribeAudio.mock.calls[0].arguments[1]?.correlationId);
});

test('no recent ideas returns an empty outcome and inserts nothing', async () => {
  const deps = dependencies(true);
  deps.generateScript.mock.mockImplementation(async () => null);
  const result = await processCapture(audio, deps);
  assert.equal(result.kind, 'no_recent_ideas');
  assert.equal(deps.repository.insertIdea.mock.callCount(), 0);
  assert.equal(deps.repository.insertScript.mock.callCount(), 0);
});

test('rate denial calls neither transcription nor generation', async () => {
  const deps = dependencies(true);
  deps.repository.consumeAiRequest.mock.mockImplementation(async () => false);
  await assert.rejects(processCapture(audio, deps), (error: unknown) => error instanceof CaptureWorkflowError && error.code === 'rate_limited' && error.status === 429);
  assert.deepEqual(deps.events, []);
  assert.equal(deps.transcribeAudio.mock.callCount(), 0);
  assert.equal(deps.generateScript.mock.callCount(), 0);
});

for (const [stage, code, status, failure] of [
  ['rate', 'rate_limit_unavailable', 503, new RepositoryError('upstream_unavailable')],
  ['transcribe', 'transcription_failed', 502, new TranscriptionError('upstream_invalid')],
  ['transcribe', 'ai_not_configured', 503, new TranscriptionError('not_configured')],
  ['idea', 'idea_save_failed', 502, new RepositoryError('upstream_unavailable')],
  ['generate', 'script_generation_failed', 502, new ScriptAgentError('retrieval_failed')],
  ['generate', 'script_generation_failed', 502, new ScriptAgentError('timeout')],
  ['generate', 'ai_not_configured', 503, new ScriptAgentError('not_configured')],
  ['script', 'script_save_failed', 502, new RepositoryError('upstream_invalid')],
] as const) {
  test(`${stage} failure maps to ${code} without retries or subsequent writes`, async () => {
    const deps = dependencies(stage === 'generate' || stage === 'script');
    const fail = async () => { throw failure; };
    if (stage === 'rate') deps.repository.consumeAiRequest.mock.mockImplementation(fail);
    if (stage === 'transcribe') deps.transcribeAudio.mock.mockImplementation(fail);
    if (stage === 'idea') deps.repository.insertIdea.mock.mockImplementation(fail);
    if (stage === 'generate') deps.generateScript.mock.mockImplementation(fail);
    if (stage === 'script') deps.repository.insertScript.mock.mockImplementation(fail);
    await assert.rejects(processCapture(audio, deps), (error: unknown) => error instanceof CaptureWorkflowError && error.code === code && error.status === status);
    assert.ok(deps.repository.consumeAiRequest.mock.callCount() <= 1);
    assert.ok(deps.transcribeAudio.mock.callCount() <= 1);
    assert.ok(deps.generateScript.mock.callCount() <= 1);
    assert.equal(deps.repository.insertIdea.mock.callCount(), stage === 'idea' ? 1 : 0);
    assert.equal(deps.repository.insertScript.mock.callCount(), stage === 'script' ? 1 : 0);
  });
}

test('cancellation after transcription prevents stale persistence', async () => {
  const deps = dependencies();
  const controller = new AbortController();
  deps.transcribeAudio.mock.mockImplementation(async () => { controller.abort(); return 'A thought'; });
  await assert.rejects(processCapture(audio, { ...deps, signal: controller.signal }), (error: unknown) => error instanceof CaptureWorkflowError && error.code === 'capture_cancelled');
  assert.equal(deps.repository.insertIdea.mock.callCount(), 0);
  assert.equal(deps.generateScript.mock.callCount(), 0);
});

test('workflow forwards cancellation to every boundary and reports cancellation during generation', async () => {
  const deps = dependencies(true);
  const controller = new AbortController();
  deps.generateScript.mock.mockImplementation(async (options) => {
    assert.equal(options.signal, controller.signal);
    controller.abort();
    throw new ScriptAgentError('cancelled');
  });
  await assert.rejects(processCapture(audio, { ...deps, signal: controller.signal }), (error: unknown) => error instanceof CaptureWorkflowError && error.code === 'capture_cancelled');
  assert.equal(deps.repository.insertScript.mock.callCount(), 0);
});

test('an abort during the final idea insert forwards the signal and reports cancellation', async () => {
  const deps = dependencies();
  const controller = new AbortController();
  deps.repository.insertIdea.mock.mockImplementation(async (_text: string, signal?: AbortSignal) => {
    assert.equal(signal, controller.signal);
    controller.abort();
    throw new RepositoryError('cancelled');
  });
  await assert.rejects(processCapture(audio, { ...deps, signal: controller.signal }), (error: unknown) => error instanceof CaptureWorkflowError && error.code === 'capture_cancelled');
});

test('an abort during the final script insert forwards the signal and reports cancellation', async () => {
  const deps = dependencies(true);
  const controller = new AbortController();
  deps.repository.insertScript.mock.mockImplementation(async (_input: unknown, signal?: AbortSignal) => {
    assert.equal(signal, controller.signal);
    controller.abort();
    throw new RepositoryError('cancelled');
  });
  await assert.rejects(processCapture(audio, { ...deps, signal: controller.signal }), (error: unknown) => error instanceof CaptureWorkflowError && error.code === 'capture_cancelled');
});

test('workflow logs contain correlation and stage status without user content or raw errors', async () => {
  const log = mock.method(console, 'info', () => {});
  const deps = dependencies();
  deps.repository.insertIdea.mock.mockImplementation(async () => { throw new Error('private secret'); });
  await assert.rejects(processCapture(audio, deps));
  const entries = JSON.stringify(log.mock.calls.map((call) => call.arguments));
  assert.match(entries, /capture.completed/);
  assert.match(entries, /idea_save_failed/);
  assert.doesNotMatch(entries, /A thought|private secret/);
});
