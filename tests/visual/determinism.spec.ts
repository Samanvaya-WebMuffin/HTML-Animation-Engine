import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const FIXTURE = `/@fs${fileURLToPath(new URL('./fixtures/core-canvas.ts', import.meta.url))}`;

/** Loads the fixture in the page and renders the given times, returning pixel hashes. */
async function renderHashes(page: Page, times: number[]): Promise<string[]> {
  return page.evaluate(
    async ({ fixture, times }) => {
      const key = '__haeFixture';
      const win = window as unknown as Record<string, unknown>;
      win[key] ??= await (await import(/* @vite-ignore */ fixture)).createFixture();
      const instance = win[key] as { renderHash(t: number): Promise<string> };
      const out: string[] = [];
      for (const t of times) out.push(await instance.renderHash(t));
      return out;
    },
    { fixture: FIXTURE, times },
  );
}

test.describe('core engine determinism (Canvas 2D pixels)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('the same frame renders to identical bytes twice', async ({ page }) => {
    const [first, second] = await renderHashes(page, [1.5, 1.5]);
    expect(second).toBe(first);
  });

  test('a frame is identical after scrubbing through other frames', async ({ page }) => {
    const times = Array.from({ length: 90 }, (_, f) => f / 30);
    const [before] = await renderHashes(page, [1.5]);
    const all = await renderHashes(page, times);
    const [after] = await renderHashes(page, [1.5]);
    expect(after).toBe(before);
    expect(all[45]).toBe(before);
    expect(new Set(all).size).toBeGreaterThan(60); // frames really do differ
  });

  test('a fresh page renders the same bytes', async ({ page, browser }) => {
    const [here] = await renderHashes(page, [2.4]);
    const context = await browser.newContext();
    const other = await context.newPage();
    await other.goto('/');
    const [there] = await renderHashes(other, [2.4]);
    await context.close();
    expect(there).toBe(here);
  });
});
