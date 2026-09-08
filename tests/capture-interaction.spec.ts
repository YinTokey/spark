import { expect, test } from '@playwright/test';

test.describe('pendant interaction', () => {
  for (const stage of [{ width: 600, height: 500 }, { width: 400, height: 700 }]) {
    test(`targets the artwork side button in a ${stage.width}x${stage.height} stage`, async ({ page }) => {
      await page.goto('/');
      const geometry = await page.evaluate(({ width, height }) => {
        const productStage = document.createElement('div');
        productStage.className = 'product-stage';
        productStage.style.cssText = `width:${width}px;height:${height}px`;
        const necklace = document.createElement('div');
        necklace.className = 'necklace';
        necklace.innerHTML = `
          <img src="/necklace.svg" width="520" height="850" alt="">
          <button class="pendant-button" aria-label="Start recording with Spark"><span class="button-ring"></span></button>
          <div class="press-note"><span>Press here</span><svg viewBox="0 0 82 58"><path d="M75 5Q70 42 10 42m0 0 12-9m-12 9 14 6"></path></svg></div>`;
        productStage.append(necklace);
        document.body.append(productStage);

        const stageBounds = productStage.getBoundingClientRect();
        const host = necklace.getBoundingClientRect();
        const button = necklace.querySelector('.pendant-button')!.getBoundingClientRect();
        const note = necklace.querySelector('.press-note')!.getBoundingClientRect();
        return {
          aspectRatio: host.width / host.height,
          fitsStage: host.width <= stageBounds.width && host.height <= stageBounds.height,
          buttonX: (button.left + button.width / 2 - host.left) / host.width,
          buttonY: (button.top + button.height / 2 - host.top) / host.height,
          noteY: (note.top + note.height / 2 - host.top) / host.height,
        };
      }, stage);

      expect(geometry.aspectRatio).toBeCloseTo(520 / 850, 2);
      expect(geometry.fitsStage).toBe(true);
      expect(geometry.buttonX).toBeGreaterThan(0.67);
      expect(geometry.buttonX).toBeLessThan(0.76);
      expect(geometry.buttonY).toBeGreaterThan(0.68);
      expect(geometry.buttonY).toBeLessThan(0.75);
      expect(Math.abs(geometry.noteY - geometry.buttonY)).toBeLessThan(0.07);
    });
  }

  test('pressed state exposes visible button feedback', async ({ page }) => {
    await page.goto('/');
    const animations = await page.evaluate(() => {
      const necklace = document.createElement('div');
      necklace.className = 'necklace is-pressed';
      necklace.innerHTML = '<button class="pendant-button"><span class="button-ring"></span></button>';
      document.body.append(necklace);
      return {
        button: getComputedStyle(necklace.querySelector('.pendant-button')!).animationName,
        ring: getComputedStyle(necklace.querySelector('.button-ring')!).animationName,
      };
    });

    expect(animations.button).not.toBe('none');
    expect(animations.ring).not.toBe('none');
  });

  test('reduced motion keeps a non-moving pressed cue', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const cue = await page.evaluate(() => {
      const necklace = document.createElement('div');
      necklace.className = 'necklace is-pressed';
      necklace.innerHTML = '<button class="pendant-button"><span class="button-ring"></span></button>';
      document.body.append(necklace);
      return getComputedStyle(necklace.querySelector('.pendant-button')!, '::before').opacity;
    });

    expect(Number(cue)).toBeGreaterThan(0);
  });
});
