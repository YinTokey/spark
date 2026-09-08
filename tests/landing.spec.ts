import { test, expect } from '@playwright/test';

test('renders the complete Spark story and stays within the viewport', async ({ page }) => {
  await page.goto('/');
  for (const heading of ['Ideas move with you.', 'Great ideas don’t wait.', 'From a thought to a video.']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.locator('main > section')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('link', { name: 'Spark by PrepVid home' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByText('Press to capture')).toHaveCount(0);
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

test('content remains usable with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'From a thought to a video.' })).toBeVisible();
  expect(await page.locator('.waveform b').first().evaluate((bar) => getComputedStyle(bar).animationName)).toBe('none');
});

test('the first and last process steps use their dedicated images', async ({ page }) => {
  await page.goto('/');

  const steps = page.locator('#how-it-works .step');
  await expect(steps.nth(0).locator('img')).toHaveAttribute('src', /3-1\.webp/);
  await expect(steps.nth(3).locator('img')).toHaveAttribute('src', /3-4\.webp/);
  await expect(steps.nth(0).locator('img')).toHaveAttribute('sizes', '(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 25vw');
});

test('section four presents five image-led ideas without supporting copy', async ({ page }) => {
  await page.goto('/');

  const gallery = page.getByRole('region', { name: 'Ideas in motion' });
  await expect(gallery.getByRole('heading', { name: 'Ideas move when you do.', exact: true })).toBeVisible();
  await expect(gallery.getByRole('button', { name: 'Get Early Access', exact: true })).toBeVisible();
  const cards = gallery.locator('.moments-grid article');
  await expect(cards).toHaveCount(5);
  await expect(cards.locator('p')).toHaveCount(0);
  await expect(cards).toHaveCSS('border-radius', '20px');

  const expectedCards = [
    { heading: 'Walk. Think. Create.', image: '1-0.webp' },
    { heading: 'Capture the moment.', image: '1-1.webp' },
    { heading: 'Ideas on the go.', image: '1-2.webp' },
    { heading: 'Less friction. More flow.', image: '1-3.webp' },
    { heading: 'Your ideas deserve to be heard.', image: '1-4.webp' },
  ];

  for (const [index, expectedCard] of expectedCards.entries()) {
    const card = cards.nth(index);
    await expect(card.getByRole('heading', { name: expectedCard.heading, exact: true })).toBeVisible();
    await expect(card.locator('img')).toHaveAttribute('src', new RegExp(expectedCard.image.replace('.', '\\.')));
  }

  const alignment = await page.evaluate(() => {
    const steps = document.querySelector('.steps-grid')?.getBoundingClientRect();
    const moments = document.querySelector('.moments-grid')?.getBoundingClientRect();
    if (!steps || !moments) throw new Error('Section content is missing');
    return { leftDifference: Math.abs(steps.left - moments.left), rightDifference: Math.abs(steps.right - moments.right) };
  });
  expect(alignment.leftDifference).toBeLessThanOrEqual(1);
  expect(alignment.rightDifference).toBeLessThanOrEqual(1);
});

test('section four remains a keyboard-scrollable portrait gallery on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto('/');

  const gallery = page.getByRole('region', { name: 'Ideas in motion' }).locator('.moments-grid');
  const measurements = await gallery.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    firstCardWidth: element.querySelector('article')?.getBoundingClientRect().width ?? 0,
    firstCardHeight: element.querySelector('article')?.getBoundingClientRect().height ?? 0,
  }));

  expect(measurements.scrollWidth).toBeGreaterThan(measurements.clientWidth);
  expect(measurements.firstCardWidth).toBeGreaterThan(250);
  expect(measurements.firstCardHeight).toBeGreaterThan(measurements.firstCardWidth);
  await gallery.focus();
  await expect(gallery).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => gallery.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('section four avoids oversized image candidates on wide screens', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1200 });
  await page.goto('/');

  const image = page.getByRole('region', { name: 'Ideas in motion' }).locator('img').first();
  await image.scrollIntoViewIfNeeded();
  const naturalWidth = () => image.evaluate((element) => element instanceof HTMLImageElement ? element.naturalWidth : 0);
  await expect.poll(naturalWidth).toBeGreaterThan(0);
  expect(await naturalWidth()).toBeLessThanOrEqual(384);
});

test('section four keeps card photography sharp at the narrowest viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');

  const image = page.getByRole('region', { name: 'Ideas in motion' }).locator('img').first();
  await image.scrollIntoViewIfNeeded();
  const naturalWidth = () => image.evaluate((element) => element instanceof HTMLImageElement ? element.naturalWidth : 0);
  await expect.poll(naturalWidth).toBeGreaterThan(0);
  expect(await naturalWidth()).toBeGreaterThanOrEqual(272);
});

test('narrow-screen headline keeps word spacing and the AI checklist fits', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await expect.soft(page.locator('h1')).toHaveJSProperty('innerText', 'Ideas move with you.');
  const card = page.locator('.thinking-card');
  const fits = await card.evaluate(el => el.scrollHeight <= el.clientHeight);
  expect(fits, 'All four AI checklist items must fit without clipping').toBe(true);
});

for (const viewport of [{ width: 2466, height: 1180 }, { width: 1440, height: 700 }, { width: 1024, height: 768 }, { width: 768, height: 600 }, { width: 390, height: 667 }, { width: 320, height: 568 }]) {
  test(`hero fits a ${viewport.width}x${viewport.height} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const sections = [{ selector: '.hero', children: ['.site-header', '.hero-copy'] }];
    for (const { selector, children } of sections) {
      const measurements = await page.locator(selector).evaluate((element, childSelectors) => {
        const section = element.getBoundingClientRect();
        const tolerance = 1;
        return {
          height: section.height,
          childrenFit: childSelectors.every(childSelector => {
            const child = element.querySelector(childSelector);
            if (!child) return false;
            const bounds = child.getBoundingClientRect();
            return bounds.top >= section.top - tolerance
              && bounds.bottom <= section.bottom + tolerance
              && bounds.left >= section.left - tolerance
              && bounds.right <= section.right + tolerance;
          }),
        };
      }, children);
      expect(measurements.height).toBeLessThanOrEqual(viewport.height);
      expect(measurements.childrenFit, `${selector} content must remain inside the section`).toBe(true);
    }
    const layout = await page.evaluate(() => {
      const copy = document.querySelector('.hero-copy');
      const visual = document.querySelector('.hero-visual');
      const hero = document.querySelector('.hero');
      const photo = document.querySelector<HTMLImageElement>('.hero-photo');
      const heading = document.querySelector('h1');
      if (!copy || !visual || !hero || !photo || !heading) throw new Error('Hero content is missing');
      const b = visual.getBoundingClientRect();
      const photoIsLarge = b.width >= window.innerWidth * .9;
      const photoFit = getComputedStyle(photo).objectFit;
      const overflowing = [...document.querySelectorAll('.step h3, .step-status, .thinking-card, .thinking-card li, .card-copy, .hero-copy')]
        .filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
        .map(el => el.className || el.tagName);
      const brandName = document.querySelector<HTMLElement>('.brand strong');
      const brandByline = document.querySelector<HTMLElement>('.brand span');
      const brand = document.querySelector<HTMLElement>('.brand');
      const copyBounds = copy.getBoundingClientRect();
      return {
        photoIsLarge,
        photoFit,
        overflowing,
        headingLines: heading.getBoundingClientRect().height / parseFloat(getComputedStyle(heading).lineHeight),
        spaceBelowCopy: hero.getBoundingClientRect().bottom - copyBounds.bottom,
        brandNameSize: brandName ? parseFloat(getComputedStyle(brandName).fontSize) : 0,
        brandBylineSize: brandByline ? parseFloat(getComputedStyle(brandByline).fontSize) : 0,
        brandBackground: brand ? getComputedStyle(brand).backgroundColor : 'transparent',
        photoPosition: getComputedStyle(photo).objectPosition,
      };
    });
    expect(layout.photoIsLarge, 'Hero photograph must fill the section canvas').toBe(true);
    expect(layout.photoFit, 'Hero photograph must cover the section at every viewport').toBe('cover');
    expect(layout.spaceBelowCopy, 'Hero copy needs deliberate blank space beneath it').toBeGreaterThanOrEqual(40);
    expect(layout.brandNameSize, 'Spark wordmark must be clear and prominent').toBeGreaterThanOrEqual(viewport.width < 768 ? 34 : 40);
    expect(layout.brandBylineSize, 'PrepVid byline must remain clearly readable').toBeGreaterThanOrEqual(11);
    if (viewport.width < 768) {
      expect(layout.photoPosition, 'Mobile crop must retain the creator focal point').toBe('15% 50%');
      expect(layout.brandBackground, 'Mobile brand needs contrast over foliage').not.toBe('rgba(0, 0, 0, 0)');
    }
    expect(layout.overflowing, 'Text must fit without clipping').toEqual([]);
    expect(layout.headingLines).toBeLessThanOrEqual(2.1);
  });
}
