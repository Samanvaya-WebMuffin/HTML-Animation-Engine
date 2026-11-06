import { expect, test } from '@playwright/test';
import {
  createFlashDetector,
  decodeWav,
  renderSoundtrack,
  type FlashDetector,
  type PcmAudio,
} from '../../packages/core/src/index.js';
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

/** Export's default frame rate (kept in step with `DEFAULT_EXPORT_FPS` in packages/export). */
const DEFAULT_EXPORT_FPS = 60;

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
          // Frames are deterministic per platform, so the per-pixel colour
          // tolerance is tight: Playwright's default (0.2) let subtle changes
          // such as a new backdrop gradient or a soft shadow pass unnoticed.
          threshold: 0.05,
          maxDiffPixelRatio: 0.002,
        });
      }
    });

    test('has a soundtrack that fits the composition and renders identically', async ({ page }) => {
      const info = await openCapture(page, name);
      const track = info.audio;
      expect(track, 'Composition.audio').toBeDefined();
      if (!track) return;
      for (const event of track.events) {
        expect(event.at, 'cue time').toBeGreaterThanOrEqual(0);
        expect(event.at, 'cue time').toBeLessThan(info.duration);
      }
      // Every sample loads through the page's server as 48 kHz WAV.
      const samples: Record<string, PcmAudio> = {};
      for (const [sample, url] of Object.entries(track.samples ?? {})) {
        const response = await page.request.get(new URL(url, page.url()).toString());
        expect(response.ok(), url).toBe(true);
        samples[sample] = decodeWav(await response.body());
        expect(samples[sample].sampleRate, url).toBe(48000);
      }
      const render = () =>
        renderSoundtrack(track, { duration: info.duration, samples, seed: info.seed });
      const [a, b] = [render(), render()];
      expect(a.channels[0]?.length).toBe(Math.round(info.duration * 48000));
      const bytes = (pcm: PcmAudio) =>
        Buffer.concat(pcm.channels.map((c) => Buffer.from(c.buffer)));
      expect(bytes(a).equals(bytes(b)), 'byte-identical renders').toBe(true);
    });

    test('renders identical frames regardless of what was drawn before', async ({ page }) => {
      // Capture after every frame, as export does: a frame's pixels must not
      // depend on which frames were drawn (and captured) before it.
      const info = await openCapture(page, name);
      const first: Buffer[] = [];
      for (const t of info.stills) {
        await renderAt(page, t);
        first.push(await frameShot(page, info));
      }
      for (const t of scrubTimes(info.duration, info.fps, 12)) {
        await renderAt(page, t);
        await frameShot(page, info);
      }
      for (const [i, t] of [...info.stills.entries()].reverse()) {
        await renderAt(page, t);
        const same = (await frameShot(page, info)).equals(first[i] as Buffer);
        expect(same, `frame at ${t}s`).toBe(true);
      }
    });

    test('is flash-safe (WCAG 2.3.1)', async ({ page }) => {
      // Checked at the export frame rate: every frame a video will contain.
      // That is a few hundred screenshots, so allow more than the default 30 s.
      test.setTimeout(120_000);
      const info = await openCapture(page, name, { fps: DEFAULT_EXPORT_FPS });
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
