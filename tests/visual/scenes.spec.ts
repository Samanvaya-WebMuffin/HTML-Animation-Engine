import { expect, test, type Page } from '@playwright/test';
import { frameShot, openCapture, renderAt } from './helpers.js';

/**
 * Videos made of scenes (`defineSequence`), and their scenes in order. Each
 * scene must pick up from the exact frame where the previous one ended, so
 * the cut is invisible.
 */
const VIDEOS: Record<string, readonly string[]> = {
  'cowork-film': [
    'query-bubbles',
    'query-crack',
    'cowork-lost',
    'cowork-criteria',
    'cowork-intro',
    'cowork-ask',
    'cowork-work',
    'cowork-answers',
    'cowork-library',
    'cowork-proof',
    'cowork-week',
    'cowork-outro',
  ],
};

async function shot(page: Page, name: string, at: (d: number) => number) {
  const info = await openCapture(page, name);
  await renderAt(page, at(info.duration));
  return { png: await frameShot(page, info), duration: info.duration };
}

for (const [video, scenes] of Object.entries(VIDEOS)) {
  test.describe(video, () => {
    for (let i = 1; i < scenes.length; i++) {
      const [before, after] = [scenes[i - 1] as string, scenes[i] as string];

      test(`${after} starts on the exact last frame of ${before}`, async ({ page }) => {
        const end = await shot(page, before, (d) => d);
        const start = await shot(page, after, () => 0);
        expect(start.png.equals(end.png), 'first frame equals previous scene’s last').toBe(true);
      });

      test(`the full video shows ${after} exactly as it is on its own`, async ({ page }) => {
        // Where the scene starts within the video.
        let offset = 0;
        for (const name of scenes.slice(0, i)) offset += (await shot(page, name, () => 0)).duration;
        const alone = await shot(page, after, () => 0.5);
        const inVideo = await shot(page, video, () => offset + 0.5);
        expect(inVideo.png.equals(alone.png), 'same frame in the video and alone').toBe(true);
      });
    }
  });
}
