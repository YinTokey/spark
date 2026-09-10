import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { NextRequest } from 'next/server.js';
import { POST } from './route.ts';

const ideaId = '22222222-2222-4222-8222-222222222222';
const scriptId = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
  process.env.OPENAI_API_KEY = 'fake-unit-test-only';
  mock.method(console, 'info', () => {});
});
afterEach(() => { mock.restoreAll(); delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY; delete process.env.OPENAI_API_KEY; });

function request(body: unknown = { ideaIds: [ideaId] }, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/scripts', {
    method: 'POST',
    headers: { origin: 'http://localhost', cookie: 'spark-access-token=test-token', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test('rejects malformed selected idea IDs before script generation', async () => {
  const external = mock.method(globalThis, 'fetch', async () => Response.json({ id: ideaId }));
  const response = await POST(request({ ideaIds: [] }));
  assert.equal(response.status, 400);
  assert.equal(external.mock.callCount(), 1);
});

test('generates a script from the requested saved ideas', async () => {
  let modelCalls = 0;
  const requests: string[] = [];
  const external = mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    const value = String(url);
    requests.push(value);
    if (new URL(value).pathname === '/auth/v1/user') return Response.json({ id: ideaId });
    if (value.includes('/rest/v1/ideas')) {
      return new URL(value).searchParams.get('select') === 'id'
        ? Response.json([{ id: ideaId }])
        : Response.json([{ id: ideaId, text: 'How to use color code', created_at: '2020-01-01T00:00:00.000Z' }]);
    }
    if (value.includes('/rest/v1/scripts')) return Response.json([{ id: scriptId, text: 'Color code\n\nUse color code well.', idea_ids: [ideaId], created_at: '2026-09-10T12:00:00.000Z' }]);
    if (value === 'https://api.openai.com/v1/responses') {
      modelCalls++;
      return Response.json(modelCalls === 1
        ? { id: 'resp', object: 'response', created_at: 1, status: 'completed', model: 'gpt', output: [{ type: 'function_call', id: 'fc', call_id: 'fc', name: 'retrieve_recent_ideas', arguments: '{}', status: 'completed' }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
        : { id: 'resp', object: 'response', created_at: 1, status: 'completed', model: 'gpt', output: [{ type: 'message', id: 'msg', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ text: 'Color code\n\nUse color code well.', ideaIds: [ideaId] }), annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } });
    }
    throw new Error(`Unexpected boundary: ${value}`);
  });
  const response = await POST(request());
  assert.equal(response.status, 200, JSON.stringify({ response: await response.clone().json(), requests }));
  assert.equal((await response.json()).script.id, scriptId);
  assert.equal(modelCalls, 2);
  assert.equal(external.mock.callCount(), 6);
});
