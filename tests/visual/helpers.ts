import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FullConfig, Page } from '@playwright/test';
import { PNG } from 'pngjs';
// Also brings in the `window.haeCapture` type declared by the capture page.
import type { CaptureInfo as PageInfo } from '../../apps/playground/src/capture.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Every example folder that has a composition. */
export function exampleNames(): string[] {
  return readdirSync(`${ROOT}examples`, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        (existsSync(`${ROOT}examples/${d.name}/composition.ts`) ||
          existsSync(`${ROOT}examples/${d.name}/composition.tsx`)),
    )
    .map((d) => d.name)
    .sort();
}

/** What the capture page reports, with `stills` as a mutable copy. */
export type CaptureInfo = Omit<PageInfo, 'stills'> & { stills: number[] };

/** Opens the capture page for `name` at its exact size and waits until it is ready. */
export async function openCapture(
  page: Page,
  name: string,
  options: { fps?: number } = {},
): Promise<CaptureInfo> {
  const fps = options.fps ? `&fps=${options.fps}` : '';
  await page.goto(`/capture.html?example=${encodeURIComponent(name)}${fps}`);
  const info = await page.evaluate(() => window.haeCapture.ready);
  await page.setViewportSize({ width: info.width, height: info.height });
  return { ...info, stills: [...info.stills] };
}

export async function renderAt(page: Page, t: number): Promise<void> {
  await page.evaluate((time) => window.haeCapture.render(time), t);
}

/** Screenshot of exactly the composition frame. */
export async function frameShot(page: Page, info: CaptureInfo): Promise<Buffer> {
  return page.screenshot({ clip: { x: 0, y: 0, width: info.width, height: info.height } });
}

export function decode(png: Buffer): PNG {
  return PNG.sync.read(png);
}

/** Golden images live in `__goldens__/<platform>/`. */
export function hasGoldens(): boolean {
  return existsSync(fileURLToPath(new URL(`./__goldens__/${process.platform}`, import.meta.url)));
}

/** True when the run was started with `--update-snapshots`. */
export function updatingGoldens(config: FullConfig): boolean {
  return config.updateSnapshots === 'all' || config.updateSnapshots === 'changed';
}

/** Deterministic pseudo-random frame times for scrub tests (no Math.random). */
export function scrubTimes(duration: number, fps: number, count: number): number[] {
  const frames = Math.round(duration * fps);
  return Array.from({ length: count }, (_, i) => Math.floor((i * 7919) % frames) / fps);
}
