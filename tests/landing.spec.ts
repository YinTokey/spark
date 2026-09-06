import { test, expect } from '@playwright/test';

test('renders all four sections with the simplified Spark brand and stays within the viewport', async ({ page }) => {
  await page.goto('/');
  for (const heading of ['Ideas move with you.', 'Great ideas don’t wait.', 'From a thought to a video.', 'Capture today. A brighter tomorrow.']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.locator('main > section')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('link', { name: 'Spark by PrepVid home' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByText('A wearable AI companion for creators.')).toHaveCount(0);
});

test('demo progresses, restarts, closes with Escape and restores focus', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Try the demo', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Press the side button' })).toBeVisible();
  for (const title of ['Speak naturally', 'AI shapes your ideas', 'Turn into videos']) {
    await dialog.getByRole('button', { name: 'Next step' }).click();
    await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog.getByRole('heading', { name: 'Press the side button' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('early access honestly explains availability and can be dismissed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get Early Access' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Sign-ups aren’t open yet.');
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).not.toBeVisible();
});

test('content remains usable with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'From a thought to a video.' })).toBeVisible();
  expect(await page.locator('.waveform b').first().evaluate((bar) => getComputedStyle(bar).animationName)).toBe('none');
});

test('narrow-screen headline keeps word spacing and the AI checklist fits', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await expect.soft(page.locator('h1')).toHaveJSProperty('innerText', 'Ideas move with you.');
  const card = page.locator('.thinking-card');
  const fits = await card.evaluate(el => el.scrollHeight <= el.clientHeight);
  expect(fits, 'All four AI checklist items must fit without clipping').toBe(true);
});
