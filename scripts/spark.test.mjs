import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';

let server;
let browser;
let page;
let output = '';
const url = 'http://127.0.0.1:3187';

before(async () => {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3187'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => { output = (output + chunk).slice(-8000); });
  server.stderr.on('data', chunk => { output = (output + chunk).slice(-8000); });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) throw new Error(`Test server exited: ${output}`);
    if (!output.includes('Ready')) { await new Promise(resolve => setTimeout(resolve, 100)); continue; }
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* The server may still be compiling its first response. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error(`Test server did not become ready: ${output}`);
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(5000);
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
});

test('Ideas and Scripts navigate to their matching details', async () => {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Spark', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'AI agents are becoming managers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AI agents are becoming managers', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to ideas' }).click();
  await page.getByRole('button', { name: 'Scripts', exact: true }).click();
  await page.getByRole('button', { name: 'Why AI coding is becoming management', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Why AI coding is becoming management', exact: true })).toBeVisible();
  await expect(page.getByText('Humans are becoming reviewers', { exact: true })).toBeVisible();
});

test('Add idea rejects whitespace, accepts trimmed content, and cancel does not save', async () => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.getByLabel('Title', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'Save idea' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Give your idea a title.');
  await page.getByLabel('Title', { exact: true }).fill('  A small creative habit  ');
  await page.getByLabel('Your thought').fill('Five minutes of writing every morning.');
  await page.getByRole('button', { name: 'Save idea' }).click();
  await page.getByRole('button', { name: 'A small creative habit', exact: true }).click();
  await expect(page.getByText('Five minutes of writing every morning.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to ideas' }).click();
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Canceled thought');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Canceled thought', exact: true })).toHaveCount(0);
});

test('Idea fields enforce title and note limits', async () => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Add idea' }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveAttribute('maxlength', '100');
  await expect(page.getByLabel('Your thought')).toHaveAttribute('maxlength', '2000');
  await page.getByLabel('Title', { exact: true }).fill('a'.repeat(100));
  await page.getByLabel('Your thought').fill('b'.repeat(2000));
  await page.getByRole('button', { name: 'Save idea' }).click();
  await expect(page.getByRole('button', { name: 'a'.repeat(100), exact: true })).toBeVisible();
});

test('Teleprompter starts, pauses, changes speed and resets on exit', async () => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Scripts', exact: true }).click();
  await page.getByRole('button', { name: 'Why AI coding is becoming management', exact: true }).click();
  await page.getByRole('button', { name: 'Record with Teleprompter' }).click();
  await expect(page.getByText('Demo mode · No video or audio is captured')).toBeVisible();
  await page.clock.install();
  await page.getByRole('button', { name: 'Start rehearsal' }).click();
  await page.clock.fastForward(3000);
  await expect(page.getByRole('timer')).toHaveText('00:03');
  await page.getByRole('button', { name: 'Pause rehearsal' }).click();
  await page.clock.fastForward(3000);
  await expect(page.getByRole('timer')).toHaveText('00:03');
  await page.getByRole('button', { name: 'Reading speed' }).click();
  await expect(page.getByRole('button', { name: 'Reading speed' })).toHaveText('1.25×');
  await page.getByRole('button', { name: 'Reset rehearsal' }).click();
  await expect(page.getByRole('timer')).toHaveText('00:00');
  await page.getByRole('button', { name: 'Close teleprompter' }).click();
  await expect(page.getByRole('heading', { name: 'Why AI coding is becoming management', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Record with Teleprompter' }).click();
  await expect(page.getByRole('timer')).toHaveText('00:00');
});

test('Mobile layout stays within viewport and keyboard navigation reaches content', async () => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Spark', exact: true })).toBeVisible();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
  await page.getByRole('button', { name: 'Scripts', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'What I learned from walking', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What I learned from walking', exact: true })).toBeFocused();
});


test('The demo rejects additional ideas at its 50 idea limit', async () => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(url);
  for (let i = 0; i < 42; i++) {
    await page.getByRole('button', { name: 'Add idea' }).click();
    await page.getByLabel('Title', { exact: true }).fill(`Session idea ${i + 1}`);
    await page.getByRole('button', { name: 'Save idea' }).click();
  }
  await page.getByRole('button', { name: 'Add idea' }).click();
  await page.getByLabel('Title', { exact: true }).fill('One too many');
  await page.getByRole('button', { name: 'Save idea' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('This demo holds up to 50 ideas. Reload to start a fresh session.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'One too many', exact: true })).toHaveCount(0);
});

test('Rehearsal stops at ten minutes and reset makes it available again', async () => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Scripts', exact: true }).click();
  await page.getByRole('button', { name: 'Why AI coding is becoming management', exact: true }).click();
  await page.getByRole('button', { name: 'Record with Teleprompter' }).click();
  await page.clock.install();
  await page.getByRole('button', { name: 'Start rehearsal' }).click();
  await page.clock.runFor(600000);
  await expect(page.getByRole('timer')).toHaveText('10:00');
  await expect(page.getByRole('button', { name: 'Start rehearsal' })).toBeDisabled();
  await page.getByRole('button', { name: 'Reset rehearsal' }).click();
  await expect(page.getByRole('timer')).toHaveText('00:00');
  await expect(page.getByRole('button', { name: 'Start rehearsal' })).toBeEnabled();
});
