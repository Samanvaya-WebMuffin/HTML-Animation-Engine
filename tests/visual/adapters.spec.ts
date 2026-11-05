import { expect, test, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { decode, frameShot, openCapture, renderAt } from './helpers.js';

async function shotsAt(page: Page, name: string, times: number[]) {
  const info = await openCapture(page, name);
  const shots: Buffer[] = [];
  for (const t of times) {
    await renderAt(page, t);
    shots.push(await frameShot(page, info));
  }
  return { info, shots };
}

test.describe('Remotion adapter', () => {
  test('engine → Remotion → engine draws the same frames as the engine alone', async ({
    browser,
  }) => {
    const native = await browser.newPage();
    const roundtrip = await browser.newPage();
    const times = [0.3, 0.7, 1.5, 2.5, 3.5, 5];
    const a = await shotsAt(native, 'shape-morph', times);
    const b = await shotsAt(roundtrip, 'remotion-roundtrip', times);
    for (const [i, t] of times.entries()) {
      const [x, y] = [decode(a.shots[i] as Buffer), decode(b.shots[i] as Buffer)];
      const different = pixelmatch(x.data, y.data, undefined, x.width, x.height, { threshold: 0 });
      expect(different, `frame at ${t}s`).toBe(0);
    }
    await native.close();
    await roundtrip.close();
  });

  test('Remotion code sees the exact frame: a <Sequence> starts on frame 45', async ({ page }) => {
    await openCapture(page, 'remotion-title');
    const subtitle = page.getByTestId('subtitle');
    await renderAt(page, 44 / 30);
    await expect(subtitle).toHaveCount(0);
    await renderAt(page, 45 / 30);
    await expect(subtitle).toHaveCSS('opacity', '0');
    await renderAt(page, 60 / 30);
    await expect(subtitle).toHaveCSS('opacity', '1');
    await renderAt(page, 0); // and back again: seeking, not playing
    await expect(subtitle).toHaveCount(0);
  });

  for (const name of ['remotion-title', 'remotion-roundtrip']) {
    test(`${name} renders identical frames in a fresh page`, async ({ browser }) => {
      const times = [0.2, 1.1, 2.6, 3.7];
      const first = await browser.newPage();
      const second = await browser.newPage();
      const a = await shotsAt(first, name, times);
      // Render in a different order in the second page.
      const b = await shotsAt(second, name, [...times].reverse());
      b.shots.reverse();
      for (const [i, t] of times.entries()) {
        expect((a.shots[i] as Buffer).equals(b.shots[i] as Buffer), `frame at ${t}s`).toBe(true);
      }
      await first.close();
      await second.close();
    });
  }
});
