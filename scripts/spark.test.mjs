import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium, expect } from '@playwright/test';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const IDEA = { id: '22222222-2222-4222-8222-222222222222', text: 'Walking unlocks ideas.', created_at: '2026-09-08T04:42:00.000Z' };
const SCRIPT = {
  id: '33333333-3333-4333-8333-333333333333',
  text: 'Why walking unlocks ideas\n\nYour best idea may be one walk away.\n\nLeave the desk for ten minutes.\n\nLet the unfinished thought move with you.\n\nTake the walk and keep the thought.',
  idea_ids: [IDEA.id],
  created_at: '2026-09-08T04:55:00.000Z',
};

const stubState = { ideas: [IDEA], scripts: [SCRIPT], ideaStatus: 200, libraryStatus: 200 };

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
    if (pathname === '/rest/v1/ideas' && req.method === 'GET') {
      if (stubState.libraryStatus !== 200) { res.statusCode = stubState.libraryStatus; return res.end('{}'); }
      return res.end(JSON.stringify(stubState.ideas));
    }
    if (pathname === '/rest/v1/scripts' && req.method === 'GET') {
      if (stubState.libraryStatus !== 200) { res.statusCode = stubState.libraryStatus; return res.end('{}'); }
      return res.end(JSON.stringify(stubState.scripts));
    }
    if (pathname === '/rest/v1/ideas' && req.method === 'POST') {
      if (stubState.ideaStatus !== 200) { res.statusCode = stubState.ideaStatus; return res.end('{}'); }
      const body = JSON.parse((await readBody(req)) || '{}');
      return res.end(JSON.stringify([{ id: '44444444-4444-4444-8444-444444444444', text: body.text, created_at: '2026-09-08T05:00:00.000Z' }]));
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
    class FakeStream { constructor() { this.tracks = [new FakeTrack()]; } getTracks() { return this.tracks; } getAudioTracks() { return this.tracks; } }
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
    class FakeDataChannel {
      constructor() { this.readyState = 'open'; }
      addEventListener(type, handler) { if (type === 'message') window.__emitRealtimeEvent = data => handler({ data: JSON.stringify(data) }); }
      send(data) { window.__realtimeClientEvents = [...(window.__realtimeClientEvents || []), JSON.parse(data)]; }
      close() {}
    }
    class FakePeerConnection {
      constructor() { this.connectionState = 'connected'; this.channel = new FakeDataChannel(); }
      createDataChannel() { return this.channel; }
      addTrack() {}
      addEventListener() {}
      async createOffer() { return { type: 'offer', sdp: 'v=0\r\n' }; }
      async setLocalDescription() {}
      async setRemoteDescription() {
        window.__emitRealtimeEvent?.({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'item-1', delta: 'A live idea' });
      }
      close() { this.connectionState = 'closed'; }
    }
    window.RTCPeerConnection = FakePeerConnection;
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
  await expect(page.getByRole('heading', { name: /Hook|Key points|Outro/ })).toHaveCount(0);
  await expect(page.getByText('Your best idea may be one walk away.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record with Teleprompter' }).click();
  await expect(page.getByText('Leave the desk for ten minutes.', { exact: true })).toBeVisible();
  const promptBounds = await page.locator('.prompt-overlay').evaluate(element => {
    const prompt = element.getBoundingClientRect();
    const recorder = element.parentElement.getBoundingClientRect();
    return { promptBottom: prompt.bottom - recorder.top, recorderHeight: recorder.height };
  });
  expect(promptBounds.promptBottom).toBeLessThanOrEqual(promptBounds.recorderHeight / 2 + 1);
});

test('hovering an idea highlights only its clickable surface', async () => {
  stubState.ideas = [IDEA]; stubState.scripts = [SCRIPT]; stubState.ideaStatus = 200; stubState.libraryStatus = 200;
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  const ideaButton = page.getByRole('button', { name: 'Walking unlocks ideas.', exact: true });
  await ideaButton.hover();
  const backgrounds = await ideaButton.evaluate(button => ({
    button: getComputedStyle(button).backgroundColor,
    row: getComputedStyle(button.parentElement).backgroundColor,
  }));
  expect(backgrounds).toEqual({ button: 'rgb(233, 229, 220)', row: 'rgba(0, 0, 0, 0)' });
});

test('pendant LED appears only while recording', async () => {
  await page.goto(`${url}/home`);
  const led = page.locator('.pendant-led');
  expect(await led.evaluate(element => getComputedStyle(element).display)).toBe('none');
  await page.getByRole('button', { name: 'Start recording with Spark' }).click();
  await expect.poll(() => led.evaluate(element => getComputedStyle(element).display)).toBe('block');
  const horizontalPosition = await led.evaluate(element => {
    const ledBox = element.getBoundingClientRect();
    const pendantBox = element.parentElement.getBoundingClientRect();
    return Math.round(((ledBox.left + ledBox.width / 2 - pendantBox.left) / pendantBox.width) * 100);
  });
  expect(horizontalPosition).toBe(46);
  await page.getByRole('button', { name: 'Finish my thought' }).click();
  await expect.poll(() => led.evaluate(element => getComputedStyle(element).display)).toBe('none');
});

test('selected ideas create a script and open it in Phone', async () => {
  stubState.ideas = [IDEA]; stubState.scripts = []; stubState.ideaStatus = 200; stubState.libraryStatus = 200;
  await page.route('**/api/scripts', async route => {
    expect(route.request().method()).toBe('POST');
    expect(JSON.parse(route.request().postData())).toEqual({ ideaIds: [IDEA.id] });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ script: { id: SCRIPT.id, title: 'Why walking unlocks ideas', status: 'Ready to record', ideaIds: [IDEA.id], text: SCRIPT.text } }),
    });
  });
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select Walking unlocks ideas.' }).check();
  await page.getByRole('button', { name: 'Create script (1)' }).click();
  await expect(page.getByRole('heading', { name: 'Why walking unlocks ideas', exact: true })).toBeVisible();
  await page.unroute('**/api/scripts');
});

test('refresh button reloads the phone library and surfaces failures', async () => {
  stubState.ideas = [IDEA]; stubState.scripts = [SCRIPT]; stubState.ideaStatus = 200; stubState.libraryStatus = 200;
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Walking unlocks ideas.', exact: true })).toBeVisible();
  stubState.ideas = [IDEA, { id: '55555555-5555-4555-8555-555555555555', text: 'A freshly refreshed idea.', created_at: '2026-09-09T04:42:00.000Z' }];
  await page.getByRole('button', { name: 'Refresh phone data' }).click();
  await expect(page.getByRole('button', { name: 'A freshly refreshed idea.', exact: true })).toBeVisible();
  stubState.libraryStatus = 503;
  await page.getByRole('button', { name: 'Refresh phone data' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load your library' })).toBeVisible();
  stubState.libraryStatus = 200;
});

test('a successful refresh clears a failed initial library load', async () => {
  stubState.ideas = [IDEA]; stubState.scripts = [SCRIPT]; stubState.ideaStatus = 200; stubState.libraryStatus = 503;
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  await expect(page.locator('.library-error')).toBeVisible();
  await page.getByRole('button', { name: 'Refresh phone data' }).click();
  await expect(page.locator('.library-error')).toHaveCount(0);
  await expect(page.locator('.refresh-error')).toHaveCount(1);
  stubState.libraryStatus = 200;
  await page.getByRole('button', { name: 'Refresh phone data' }).click();
  await expect(page.getByRole('button', { name: 'Walking unlocks ideas.', exact: true })).toBeVisible();
  await expect(page.locator('.library-error')).toHaveCount(0);
  await expect(page.locator('.refresh-error')).toHaveCount(0);
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

test('the recording panel shows a visible, animated live waveform', async () => {
  stubState.ideas = []; stubState.scripts = []; stubState.ideaStatus = 200;
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Start recording with Spark' }).click();
  await expect(page.getByRole('heading', { name: 'Listening to you.' })).toBeVisible();

  const wave = page.locator('.recording-content .waveform');
  const bars = wave.locator('i');
  await expect(bars).toHaveCount(32);

  const bar = await bars.first().evaluate(element => {
    const styles = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const parent = element.parentElement.getBoundingClientRect();
    return {
      width: parseFloat(styles.width),
      height: parseFloat(styles.height),
      background: styles.backgroundImage,
      transitionProperty: styles.transitionProperty,
      transitionDuration: parseFloat(styles.transitionDuration),
      centerOffset: Math.abs((box.top + box.height / 2) - (parent.top + parent.height / 2)),
    };
  });
  expect(bar.width).toBeGreaterThan(0);
  expect(bar.height).toBeGreaterThan(0);
  expect(bar.background).not.toBe('none');
  expect(bar.transitionProperty).toContain('height');
  expect(bar.transitionDuration).toBeGreaterThan(0);
  expect(bar.centerOffset).toBeLessThanOrEqual(1);
  expect(await wave.evaluate(element => getComputedStyle(element, '::before').animationName)).not.toBe('none');
  const glowCount = () => page.evaluate(() => document.getAnimations().filter(animation => animation.animationName === 'wave-glow').length);
  expect(await glowCount()).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  try {
    const reduced = await wave.evaluate(element => ({
      glow: getComputedStyle(element, '::before').animationName,
      transition: parseFloat(getComputedStyle(element.querySelector('i')).transitionDuration),
    }));
    expect(reduced.glow).toBe('none');
    expect(reduced.transition).toBe(0);
    expect(await glowCount()).toBe(0);
  } finally {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }

  await page.getByRole('button', { name: 'Cancel' }).click();
});

test('live captions await completed text and retry the transcript route without batch transcription', async () => {
  let transcriptRequests = 0;
  let batchRequests = 0;
  await page.route('**/api/realtime-token', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ value: 'ek_test', expiresAt: 1_800_000_000 }),
  }));
  await page.route('https://api.openai.com/v1/realtime/calls', route => route.fulfill({ status: 200, contentType: 'application/sdp', body: 'v=0\r\na=setup:active' }));
  await page.route('**/api/capture/transcript', async route => {
    transcriptRequests++;
    expect(JSON.parse(route.request().postData())).toEqual({ transcript: 'A live idea, finalized.' });
    if (transcriptRequests === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'idea', idea: { id: 'live', title: 'A live idea', note: 'A live idea, finalized.', date: 'Today', time: '1:00', status: 'Raw' } }) });
  });
  await page.route('**/api/capture', async route => { batchRequests++; await route.fulfill({ status: 500, body: '{}' }); });

  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Start recording with Spark' }).click();
  await expect(page.getByRole('status', { name: 'Live transcript' })).toContainText('A live idea');
  await page.getByRole('button', { name: 'Finish my thought' }).click();
  await expect.poll(() => page.evaluate(() => window.__realtimeClientEvents)).toEqual([{ type: 'input_audio_buffer.commit' }]);
  await page.evaluate(() => window.setTimeout(() => window.__emitRealtimeEvent({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item-1', transcript: 'A live idea, finalized.' }), 1_500));
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Your idea, captured.' })).toBeVisible();
  expect(transcriptRequests).toBe(2);
  expect(batchRequests).toBe(0);

  await page.unroute('**/api/realtime-token');
  await page.unroute('https://api.openai.com/v1/realtime/calls');
  await page.unroute('**/api/capture/transcript');
  await page.unroute('**/api/capture');
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
  await expect(page.getByRole('heading', { name: "Couldn't transcribe that." })).toBeVisible();
});

test('non-retryable capture failures do not resubmit the rejected recording', async () => {
  stubState.ideas = []; stubState.scripts = []; stubState.ideaStatus = 200;
  let requests = 0;
  await page.route('**/api/capture', async route => {
    requests++;
    await route.fulfill({ status: 413, contentType: 'application/json', body: '{}' });
  });
  await page.goto(`${url}/home`);
  await page.getByRole('button', { name: 'Start recording with Spark' }).click();
  await page.getByRole('button', { name: 'Finish my thought' }).click();
  await expect(page.getByRole('button', { name: 'Record again' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Record again' }).click();
  await expect(page.getByRole('button', { name: 'Finish my thought' })).toBeVisible();
  expect(requests).toBe(1);
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
