import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium, expect } from '@playwright/test';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const IDEA = { id: '22222222-2222-4222-8222-222222222222', transcript: 'Walking unlocks ideas.', created_at: '2026-09-08T04:42:00.000Z' };
const SCRIPT = {
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Why walking unlocks ideas',
  hook: 'Your best idea may be one walk away.',
  body: 'Leave the desk for ten minutes.\n\nLet the unfinished thought move with you.',
  outro: 'Take the walk and keep the thought.',
  idea_ids: [IDEA.id],
  created_at: '2026-09-08T04:55:00.000Z',
};

const stubState = { ideas: [IDEA], scripts: [SCRIPT], ideaStatus: 200 };

let stub;
let stubUrl;
let server;
let browser;
let page;
let output = '';
const url = 'http://localhost:3187';

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

before(async () => {
  stub = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    res.setHeader('Content-Type', 'application/json');
    if (pathname === '/auth/v1/user') return res.end(JSON.stringify({ id: USER_ID }));
    if (pathname === '/rest/v1/rpc/consume_ai_request') return res.end('true');
    if (pathname === '/rest/v1/rpc/consume_idea_write') return res.end('true');
    if (pathname === '/rest/v1/ideas' && req.method === 'GET') return res.end(JSON.stringify(stubState.ideas));
    if (pathname === '/rest/v1/scripts' && req.method === 'GET') return res.end(JSON.stringify(stubState.scripts));
    if (pathname === '/rest/v1/ideas' && req.method === 'POST') {
      if (stubState.ideaStatus !== 200) { res.statusCode = stubState.ideaStatus; return res.end('{}'); }
      const body = JSON.parse((await readBody(req)) || '{}');
      return res.end(JSON.stringify([{ id: '44444444-4444-4444-8444-444444444444', transcript: body.transcript, created_at: '2026-09-08T05:00:00.000Z' }]));
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
  stubUrl = `http://127.0.0.1:${stub.address().port}`;

  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', 'localhost', '--port', '3187'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', SUPABASE_URL: stubUrl, SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => { output = (output + chunk).slice(-8000); });
  server.stderr.on('data', chunk => { output = (output + chunk).slice(-8000); });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) throw new Error(`Test server exited: ${output}`);
    if (!output.includes('Ready')) { await new Promise(resolve => setTimeout(resolve, 100)); continue; }
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* Still compiling. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error(`Test server did not become ready: ${output}`);
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(5000);
  await page.context().addCookies([{ name: 'spark-access-token', value: 'test-token', url }]);
  await page.addInitScript(() => {
    class FakeTrack { constructor() { this.onended = null; } stop() {} }
    class FakeStream { constructor() { this.tracks = [new FakeTrack()]; } getTracks() { return this.tracks; } }
    const mediaDevices = { getUserMedia: async () => new FakeStream() };
    try { Object.defineProperty(navigator, 'mediaDevices', { value: mediaDevices, configurable: true }); } catch { navigator.mediaDevices = mediaDevices; }
    class FakeAudioContext {
      constructor() { this.state = 'suspended'; this.destination = {}; }
      async resume() { this.state = 'running'; }
      async close() { this.state = 'closed'; }
      createAnalyser() { return { fftSize: 128, frequencyBinCount: 64, getByteFrequencyData() {}, connect() {} }; }
      createMediaStreamSource() { return { connect() {} }; }
    }
    window.AudioContext = FakeAudioContext;
    class FakeMediaRecorder {
      constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; this.ondataavailable = null; this.onstop = null; this.onerror = null; }
      start() { this.state = 'recording'; }
      stop() {
        if (this.state !== 'recording') return;
        this.state = 'inactive';
        if (this.ondataavailable) this.ondataavailable({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }) });
        if (this.onstop) this.onstop();
      }
    }
    window.MediaRecorder = FakeMediaRecorder;
  });
}, { timeout: 120000 });

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(timer);
  }
  stub?.close();
});

test('database ideas and scripts appear on Phone without fixture fallbacks', async () => {
  stubState.ideas = [IDEA]; stubState.scripts = [SCRIPT]; stubState.ideaStatus = 200;
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Walking unlocks ideas.', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI agents are becoming managers', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Scripts', exact: true }).click();
  await page.getByRole('button', { name: 'Why walking unlocks ideas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Why walking unlocks ideas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record with Teleprompter' }).click();
  await expect(page.getByText('Leave the desk for ten minutes.', { exact: true })).toBeVisible();
});

test('empty database arrays render both empty states', async () => {
  stubState.ideas = []; stubState.scripts = []; stubState.ideaStatus = 200;
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  await expect(page.getByText('No ideas yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Scripts', exact: true }).click();
  await expect(page.getByText('No scripts yet', { exact: true })).toBeVisible();
});

test('manual idea saving appears after success and retains input after a failure', async () => {
  stubState.ideas = []; stubState.scripts = []; stubState.ideaStatus = 200;
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.getByLabel('Your idea').fill('A manual idea');
  await page.getByRole('button', { name: 'Save idea' }).click();
  await expect(page.getByRole('button', { name: 'A manual idea', exact: true })).toBeVisible();
  stubState.ideaStatus = 502;
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.getByLabel('Your idea').fill('Fails to save');
  await page.getByRole('button', { name: 'Save idea' }).click();
  await expect(page.locator('.idea-form').getByRole('alert')).toHaveText(/saved/);
  await expect(page.getByLabel('Your idea')).toHaveValue('Fails to save');
  stubState.ideaStatus = 200;
});

test('a voice capture uploads and renders the returned idea', async () => {
  stubState.ideas = []; stubState.scripts = []; stubState.ideaStatus = 200;
  await page.route('**/api/capture', async route => {
    expect(route.request().method()).toBe('POST');
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ kind: 'idea', idea: { id: 'captured', title: 'A captured idea', note: 'A captured idea', date: 'Today', time: '1:00', status: 'Raw' } }),
    });
  });
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Start recording with Spark' }).click();
  await page.getByRole('button', { name: 'Finish my thought' }).click();
  await expect(page.getByRole('heading', { name: 'Your idea, captured.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A captured idea' })).toBeVisible();
});

test('capture no-match and error responses render their safe messages', async () => {
  stubState.ideas = []; stubState.scripts = []; stubState.ideaStatus = 200;
  await page.route('**/api/capture', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'no_recent_ideas', message: 'Capture a relevant idea first.' }) });
  });
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Start recording with Spark' }).click();
  await page.getByRole('button', { name: 'Finish my thought' }).click();
  await expect(page.getByText('Capture a relevant idea first.', { exact: true })).toBeVisible();
  await page.unroute('**/api/capture');
  await page.route('**/api/capture', async route => {
    await route.fulfill({ status: 502, contentType: 'application/json', body: '{}' });
  });
  await page.getByRole('button', { name: 'Try another idea' }).click();
  await page.getByRole('button', { name: 'Start recording with Spark' }).click();
  await page.getByRole('button', { name: 'Finish my thought' }).click();
  await expect(page.locator('.error-message')).toHaveText(/try again/i);
});

test('reset during a delayed capture prevents the stale result from appearing', async () => {
  stubState.ideas = []; stubState.scripts = []; stubState.ideaStatus = 200;
  await page.route('**/api/capture', async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'idea', idea: { id: 'stale', title: 'Stale', note: 'Stale', date: 'Today', time: '1:00', status: 'Raw' } }) }).catch(() => {});
  });
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Start recording with Spark' }).click();
  await page.getByRole('button', { name: 'Finish my thought' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(700);
  await expect(page.getByRole('heading', { name: 'Ready when you are.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your idea, captured.' })).toHaveCount(0);
});

test('mobile width does not overflow and keyboard focus reaches new controls', async () => {
  stubState.ideas = [IDEA]; stubState.scripts = [SCRIPT]; stubState.ideaStatus = 200;
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
  await page.getByRole('button', { name: 'Scripts', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Why walking unlocks ideas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Why walking unlocks ideas', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1050 });
});
