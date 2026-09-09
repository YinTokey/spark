import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { generateScript, ScriptAgentError, type RunScriptAgent } from './script-agent.ts';

const RECENT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-09-08T05:00:00.000Z');
const recent = { id: RECENT_ID, transcript: 'Walking helps me think.', created_at: '2026-09-08T04:30:00.000Z' };
const output = { title: 'Walking', hook: 'Step outside.', body: 'A walk creates room to think.', outro: 'Take a walk today.', ideaIds: [RECENT_ID] };
const repository = { findRecentIdeas: async () => [recent] };
const inputs = { command: 'Create a script about walking', hint: 'walking', repository, now };
const validRunner: RunScriptAgent = async ({ retrieveRecentIdeas }) => {
  await retrieveRecentIdeas({ topic: '' });
  return output;
};

afterEach(() => { mock.restoreAll(); delete process.env.OPENAI_API_KEY; });

test('retrieval applies exactly one server hour and the command hint, exposing only source fields', async () => {
  const calls: [Date, string][] = [];
  const result = await generateScript({ ...inputs,
    repository: { findRecentIdeas: async (cutoff, hint) => { calls.push([cutoff, hint]); return [recent]; } },
    runAgent: async ({ retrieveRecentIdeas }) => {
      assert.deepEqual(await retrieveRecentIdeas({ topic: '' }), [recent]);
      return output;
    },
  });
  assert.equal(calls[0][0].toISOString(), '2026-09-08T04:00:00.000Z');
  assert.equal(calls[0][1], 'walking');
  assert.deepEqual(result, output);
});

test('a bounded explicit tool topic takes precedence over the command hint', async () => {
  await generateScript({ ...inputs,
    repository: { findRecentIdeas: async (_cutoff, hint) => { assert.equal(hint, 'focus'); return [recent]; } },
    runAgent: async ({ retrieveRecentIdeas }) => { await retrieveRecentIdeas({ topic: ' focus ' }); return output; },
  });
});

test('rejects output without a retrieval call', async () => {
  await assert.rejects(generateScript({ ...inputs, runAgent: async () => output }), /tool_required/);
});

test('rejects invented, duplicate and empty provenance', async () => {
  for (const ideaIds of [[OTHER_ID], [RECENT_ID, RECENT_ID], []]) {
    await assert.rejects(generateScript({ ...inputs, runAgent: async (context) => {
      await validRunner(context); return { ...output, ideaIds };
    } }), /invalid_(provenance|output)/);
  }
});

test('an empty retrieval returns null even when the runner invents a script', async () => {
  assert.equal(await generateScript({ ...inputs, repository: { findRecentIdeas: async () => [] }, runAgent: validRunner }), null);
});

test('filters old and future rows, includes the exact cutoff, sorts newest and returns at most 12', async () => {
  const rows = Array.from({ length: 13 }, (_, index) => ({
    ...recent, id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    created_at: index === 0 ? '2026-09-08T04:00:00.000Z' : '2026-09-08T04:30:00.000Z',
  }));
  await generateScript({ ...inputs,
    repository: { findRecentIdeas: async () => [
      { ...recent, created_at: '2026-09-08T03:59:59.999Z' }, ...rows,
      { ...recent, created_at: '2026-09-08T05:00:00.001Z' },
    ] },
    runAgent: async ({ retrieveRecentIdeas }) => {
      const retrieved = await retrieveRecentIdeas({});
      assert.equal(retrieved.length, 12);
      assert.ok(retrieved.every((row) => row.id !== RECENT_ID));
      assert.equal(retrieved[0].id, rows[1].id);
      return { ...output, ideaIds: retrieved.map((row) => row.id) };
    },
  });
  assert.deepEqual(await generateScript({ ...inputs,
    repository: { findRecentIdeas: async () => [{ ...recent, created_at: '2026-09-08T04:00:00.000Z' }] }, runAgent: validRunner,
  }), output);
});

test('provenance cannot reference a row excluded from tool output', async () => {
  await assert.rejects(generateScript({ ...inputs,
    repository: { findRecentIdeas: async () => [recent, { ...recent, id: OTHER_ID, created_at: '2026-09-08T03:00:00.000Z' }] },
    runAgent: async (context) => { await validRunner(context); return { ...output, ideaIds: [OTHER_ID] }; },
  }), /invalid_provenance/);
});

test('rejects malformed or oversized repository output', async () => {
  for (const rows of [Array.from({ length: 21 }, () => recent), [{ ...recent, transcript: 'x'.repeat(10_001) }], [{ ...recent, created_at: 'invalid' }]]) {
    await assert.rejects(generateScript({ ...inputs, repository: { findRecentIdeas: async () => rows }, runAgent: validRunner }), /retrieval_failed/);
  }
});

test('tool truncates source excerpts to 2000 characters and rejects repeated retrieval', async () => {
  await generateScript({ ...inputs,
    repository: { findRecentIdeas: async () => [{ ...recent, transcript: 'x'.repeat(10_000) }] },
    runAgent: async ({ retrieveRecentIdeas }) => {
      const rows = await retrieveRecentIdeas({});
      assert.equal(rows[0].transcript.length, 2000);
      return output;
    },
  });
  await assert.rejects(generateScript({ ...inputs, runAgent: async (context) => {
    await validRunner(context); return validRunner(context);
  } }), /tool_limit/);
});

test('validates command, hint, tool argument shape and tool topic limits', async () => {
  for (const input of [{ command: '' }, { command: 'x'.repeat(8001) }, { hint: 'x'.repeat(241) }, { now: new Date('invalid') }]) {
    await assert.rejects(generateScript({ ...inputs, ...input, runAgent: validRunner }), /invalid_input/);
  }
  for (const arguments_ of [{ topic: 'x'.repeat(241) }, { cutoff: '1900-01-01' }, { topic: 1 }]) {
    await assert.rejects(generateScript({ ...inputs, runAgent: async ({ retrieveRecentIdeas }) => {
      await retrieveRecentIdeas(arguments_); return output;
    } }), /invalid_tool_input/);
  }
  assert.deepEqual(await generateScript({ ...inputs, command: 'x'.repeat(8000), hint: 'x'.repeat(240), runAgent: validRunner }), output);
  await generateScript({ ...inputs, runAgent: async ({ retrieveRecentIdeas }) => {
    await retrieveRecentIdeas({ topic: ` ${'x'.repeat(240)} ` });
    return output;
  } });
});

test('enforces structured output field bounds including exactly twelve source IDs', async () => {
  for (const [field, limit] of [['title', 100], ['hook', 500], ['body', 6000], ['outro', 500]] as const) {
    for (const text of ['', ' ', 'x'.repeat(limit + 1)]) {
      await assert.rejects(generateScript({ ...inputs, runAgent: async (context) => {
        await validRunner(context); return { ...output, [field]: text };
      } }), /invalid_output/);
    }
    const result = await generateScript({ ...inputs, runAgent: async (context) => {
      await validRunner(context); return { ...output, [field]: 'x'.repeat(limit) };
    } });
    assert.equal(result?.[field].length, limit);
    const normalized = await generateScript({ ...inputs, runAgent: async (context) => {
      await validRunner(context); return { ...output, [field]: ` ${'x'.repeat(limit)} ` };
    } });
    assert.equal(normalized?.[field].length, limit);
  }
  await assert.rejects(generateScript({ ...inputs, runAgent: async (context) => {
    await validRunner(context); return { ...output, ideaIds: Array.from({ length: 13 }, () => RECENT_ID) };
  } }), /invalid_output/);
});

test('maps repository and runner failures to stable safe errors with no retry', async () => {
  let attempts = 0;
  await assert.rejects(generateScript({ ...inputs, runAgent: async () => {
    attempts++; throw new Error('secret prompt upstream details');
  } }), (error: unknown) => error instanceof ScriptAgentError && error.message === 'upstream_unavailable');
  assert.equal(attempts, 1);
  await assert.rejects(generateScript({ ...inputs,
    repository: { findRecentIdeas: async () => { throw new Error('secret database details'); } }, runAgent: validRunner,
  }), /retrieval_failed/);
});

test('45-second timeout aborts a runner that ignores cancellation and rejects late tool work', async () => {
  const controller = new AbortController();
  mock.method(AbortSignal, 'timeout', (delay: number) => {
    assert.equal(delay, 45_000); return controller.signal;
  });
  let context: Parameters<RunScriptAgent>[0] | undefined;
  const promise = generateScript({ ...inputs, runAgent: async (value) => {
    context = value; controller.abort(); return new Promise(() => {});
  } });
  await assert.rejects(promise, /timeout/);
  assert.ok(context?.signal.aborted);
  await assert.rejects(context.retrieveRecentIdeas({}), /timeout/);
});

test('logs only safe outcome metadata and omits malformed correlation identifiers', async () => {
  const entries: unknown[][] = [];
  mock.method(console, 'info', (...args: unknown[]) => { entries.push(args); });
  await generateScript({ ...inputs, correlationId: 'capture-123', runAgent: validRunner });
  await generateScript({ ...inputs, correlationId: 'private content\n', runAgent: validRunner });
  const logs = JSON.stringify(entries);
  assert.match(logs, /capture-123/);
  for (const privateText of [inputs.command, recent.transcript, output.body, 'private content']) assert.ok(!logs.includes(privateText));
});

test('default runner refuses missing server credentials', async () => {
  await assert.rejects(generateScript(inputs), /not_configured/);
});

function modelResponse(items: unknown[]) {
  return Response.json({
    id: 'resp_test', object: 'response', created_at: 1, status: 'completed', model: 'gpt-4.1-mini',
    output: items, usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
  });
}

const retrievalCall = { type: 'function_call', id: 'fc_test', call_id: 'call_test', name: 'retrieve_recent_ideas', arguments: '{"topic":"walking"}', status: 'completed' };

test('real SDK wiring calls the retrieval tool then emits structured output without storing responses or exporting traces', async () => {
  process.env.OPENAI_API_KEY = 'test-server-key';
  const requests: unknown[] = [];
  let calls = 0;
  mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-server-key');
    assert.ok(init?.signal);
    assert.equal(typeof init?.body, 'string');
    const body: unknown = JSON.parse(String(init?.body));
    requests.push(body);
    calls++;
    return calls === 1 ? modelResponse([retrievalCall]) : modelResponse([{
      type: 'message', id: 'msg_test', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }],
    }]);
  });
  assert.deepEqual(await generateScript(inputs), output);
  assert.equal(calls, 2);
  for (const request of requests) {
    assert.ok(request && typeof request === 'object');
    assert.equal('store' in request && request.store, false);
    assert.equal('max_output_tokens' in request && request.max_output_tokens, 2500);
  }
  assert.match(JSON.stringify(requests[1]), /Walking helps me think/);
});

test('real SDK stops on empty retrieval and never retries upstream failures', async () => {
  process.env.OPENAI_API_KEY = 'test-server-key';
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => { calls++; return modelResponse([retrievalCall]); });
  assert.equal(await generateScript({ ...inputs, repository: { findRecentIdeas: async () => [] } }), null);
  assert.equal(calls, 1);
  mock.restoreAll();
  calls = 0;
  mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ error: { message: 'sensitive upstream text' } }, { status: 429 }); });
  await assert.rejects(generateScript(inputs), /upstream_unavailable/);
  assert.equal(calls, 1);
});

test('real SDK rejects declared and streamed oversized responses before accepting model output', async () => {
  process.env.OPENAI_API_KEY = 'test-server-key';
  let calls = 0;
  mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    calls++;
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.redirect, 'error');
    return new Response('x', { headers: { 'content-length': '262145' } });
  });
  await assert.rejects(generateScript(inputs), /upstream_unavailable/);
  assert.equal(calls, 1);
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => new Response('x'.repeat(262_145)));
  await assert.rejects(generateScript(inputs), /upstream_unavailable/);
});
