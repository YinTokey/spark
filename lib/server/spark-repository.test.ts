import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { createSparkRepository, RepositoryError } from './spark-repository.ts';

const FOCUS_NEW_ID = '22222222-2222-4222-8222-222222222222';
const FOCUS_OLD_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ID = '44444444-4444-4444-8444-444444444444';

afterEach(() => {
  mock.restoreAll();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
});

function configureSupabase() {
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
}

function idea(id: string, transcript: string, created_at = '2026-09-08T03:30:00.000Z') {
  return { id, transcript, created_at };
}

test('recent ideas are user-scoped by bearer token, one-hour cutoff, and local hint ranking', async () => {
  configureSupabase();
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json([
    idea(OTHER_ID, 'Plan a kitchen renovation', '2026-09-08T03:50:00.000Z'),
    idea(FOCUS_NEW_ID, 'Focus rituals for a productive workday', '2026-09-08T03:40:00.000Z'),
    idea(FOCUS_OLD_ID, 'How focus protects deep work', '2026-09-08T03:20:00.000Z'),
  ]));

  const ideas = await createSparkRepository('user-token').findRecentIdeas(
    new Date('2026-09-08T04:00:00.000Z'),
    'focus at work',
  );

  assert.deepEqual(ideas.map((entry) => entry.id), [FOCUS_NEW_ID, FOCUS_OLD_ID]);
  assert.match(String(fetchMock.mock.calls[0].arguments[0]), /created_at=gte\./);
  assert.equal(new Headers(fetchMock.mock.calls[0].arguments[1]?.headers).get('Authorization'), 'Bearer user-token');
});

test('non-empty hints without searchable terms do not return unrelated recent ideas', async () => {
  configureSupabase();
  mock.method(globalThis, 'fetch', async () => Response.json([
    idea(OTHER_ID, 'Plan a kitchen renovation', '2026-09-08T03:50:00.000Z'),
    idea(FOCUS_NEW_ID, 'Focus rituals for a productive workday', '2026-09-08T03:40:00.000Z'),
  ]));
  const repository = createSparkRepository('user-token');
  const since = new Date('2026-09-08T04:00:00.000Z');

  assert.deepEqual(await repository.findRecentIdeas(since, 'the'), []);
  assert.deepEqual(await repository.findRecentIdeas(since, '✨!!'), []);
});

test('rejects an oversized or malformed PostgREST response', async () => {
  configureSupabase();
  mock.method(globalThis, 'fetch', async () => new Response('[]', { headers: { 'content-length': 'invalid' } }));
  await assert.rejects(
    createSparkRepository('user-token').loadLibrary(),
    (error: unknown) => error instanceof RepositoryError && error.code === 'upstream_invalid',
  );
});

test('script provenance must be a non-empty bounded UUID list', async () => {
  configureSupabase();
  const repository = createSparkRepository('user-token');
  await assert.rejects(
    repository.insertScript({ title: 'x', hook: 'x', body: 'x', outro: 'x', ideaIds: [] }),
    /invalid_script/,
  );
});

test('library loads newest ideas and scripts with bounded ordered queries', async () => {
  configureSupabase();
  const scriptId = '55555555-5555-4555-8555-555555555555';
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string) => Response.json(
    url.includes('/ideas?') ? [idea(FOCUS_NEW_ID, 'Focus today')] : [{
      id: scriptId, title: 'Focus video', hook: 'Hook', body: 'Body', outro: 'Outro', idea_ids: [FOCUS_NEW_ID], created_at: '2026-09-08T03:30:00.000Z',
    }],
  ));
  const library = await createSparkRepository('user-token').loadLibrary();
  assert.equal(library.ideas[0].id, FOCUS_NEW_ID);
  assert.equal(library.scripts[0].id, scriptId);
  assert.match(String(fetchMock.mock.calls[0].arguments[0]), /order=created_at.desc/);
  assert.match(String(fetchMock.mock.calls[0].arguments[0]), /limit=50/);
});

test('inserts send only safe headers and exactly one representation row', async () => {
  configureSupabase();
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json([idea(FOCUS_NEW_ID, 'A captured thought')]));
  const result = await createSparkRepository('user-token').insertIdea('A captured thought');
  assert.equal(result.id, FOCUS_NEW_ID);
  const init = fetchMock.mock.calls[0].arguments[1];
  const headers = new Headers(init?.headers);
  assert.equal(headers.get('Prefer'), 'return=representation');
  assert.equal(headers.get('Authorization'), 'Bearer user-token');
  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.equal(headers.get('X-Client-Info'), null);
});

test('script insert verifies every provenance id is visible to the user before inserting', async () => {
  configureSupabase();
  const scriptId = '55555555-5555-4555-8555-555555555555';
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.includes('/ideas?')) return Response.json([{ id: FOCUS_NEW_ID }]);
    return Response.json([{ id: scriptId, title: 'Focus video', hook: 'Hook', body: 'Body', outro: 'Outro', idea_ids: [FOCUS_NEW_ID], created_at: '2026-09-08T03:30:00.000Z' }]);
  });
  const repository = createSparkRepository('user-token');
  const script = await repository.insertScript({ title: 'Focus video', hook: 'Hook', body: 'Body', outro: 'Outro', ideaIds: [FOCUS_NEW_ID] });
  assert.equal(script.id, scriptId);
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.match(String(fetchMock.mock.calls[0].arguments[0]), /id=in/);
});

test('does not insert a script when any provenance id is not owned', async () => {
  configureSupabase();
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json([]));
  const repository = createSparkRepository('user-token');
  await assert.rejects(
    repository.insertScript({ title: 'Focus video', hook: 'Hook', body: 'Body', outro: 'Outro', ideaIds: [FOCUS_NEW_ID] }),
    (error: unknown) => error instanceof RepositoryError && error.code === 'invalid_script',
  );
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('rate RPC returns false and rejects unexpected database fields', async () => {
  configureSupabase();
  mock.method(globalThis, 'fetch', async () => Response.json(false));
  assert.equal(await createSparkRepository('user-token').consumeAiRequest(), false);
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => Response.json([{ ...idea(FOCUS_NEW_ID, 'Focus'), extra: 'unexpected' }]));
  await assert.rejects(createSparkRepository('user-token').loadLibrary(), /upstream_invalid/);
});

test('maps network failures, timeouts, response overflow, and invalid JSON to stable errors', async () => {
  configureSupabase();
  mock.method(globalThis, 'fetch', async () => { throw new Error('network'); });
  await assert.rejects(createSparkRepository('user-token').loadLibrary(), /upstream_unavailable/);
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => new Response('{', { headers: { 'content-length': '1' } }));
  await assert.rejects(createSparkRepository('user-token').loadLibrary(), /upstream_invalid/);
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => new Response('x'.repeat(300_000)));
  await assert.rejects(createSparkRepository('user-token').loadLibrary(), /upstream_invalid/);
});
