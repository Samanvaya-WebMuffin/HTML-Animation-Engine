import { expect, test } from '@playwright/test';
import { createFlashDetector, type FlashDetector } from '../../packages/core/src/index.js';
import {
  decode,
  exampleNames,
  frameShot,
  hasGoldens,
  openCapture,
  renderAt,
  scrubTimes,
  updatingGoldens,
} from './helpers.js';

/** Downscale for the flash check: luminance is averaged per region anyway. */
const FLASH_SCALE = 0.1;

for (const name of exampleNames()) {
  test.describe(name, () => {
    test('key moments match the golden frames', async ({ page }, testInfo) => {
      test.skip(
        !hasGoldens() && !updatingGoldens(testInfo.config),
        `No ${process.platform} goldens yet: run the "Update goldens" workflow or ` +
          '`pnpm test:visual --update-snapshots` on this platform.',
      );
      const info = await openCapture(page, name);
      for (const t of info.stills) {
        await renderAt(page, t);
        await expect(page).toHaveScreenshot(`${name}-${t}.png`, {
          clip: { x: 0, y: 0, width: info.width, height: info.height },
          maxDiffPixelRatio: 0.002,
        });
      }
    });

    test('renders identical frames after scrubbing', async ({ page }) => {
      const info = await openCapture(page, name);
      const first: Buffer[] = [];
      for (const t of info.stills) {
        await renderAt(page, t);
        first.push(await frameShot(page, info));
      }
      for (const t of scrubTimes(info.duration, info.fps, 12)) await renderAt(page, t);
      for (const [i, t] of info.stills.entries()) {
        await renderAt(page, t);
        expect((await frameShot(page, info)).equals(first[i] as Buffer), `frame at ${t}s`).toBe(
          true,
        );
      }
    });

    test('is flash-safe (WCAG 2.3.1)', async ({ page }) => {
      const info = await openCapture(page, name);
      const cdp = await page.context().newCDPSession(page);
      const frames = Math.round(info.duration * info.fps);
      let detector: FlashDetector | undefined;
      for (let frame = 0; frame < frames; frame++) {
        await renderAt(page, frame / info.fps);
        const { data } = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          clip: { x: 0, y: 0, width: info.width, height: info.height, scale: FLASH_SCALE },
        });
        const png = decode(Buffer.from(data, 'base64'));
        detector ??= createFlashDetector({ width: png.width, height: png.height, fps: info.fps });
        detector.push(png.data);
      }
      const report = detector?.report();
      expect(report?.frames).toBe(frames);
      expect(report?.warnings, JSON.stringify(report?.warnings)).toEqual([]);
    });
  });
}
