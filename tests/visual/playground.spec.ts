import { expect, test } from '@playwright/test';
import { exampleNames } from './helpers.js';

test('playground boots with its controls and no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'HTML-Animation-Engine' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Examples' })).toBeAttached();
  for (const name of ['Play', '◀ Frame', 'Frame ▶']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
  await expect(page.getByRole('slider', { name: 'Scrubber' })).toBeVisible();
  await expect(page.getByLabel('FPS')).toBeVisible();
  await expect(page.getByLabel('Resolution')).toBeVisible();

  const exampleCount = await page
    .getByRole('navigation', { name: 'Examples' })
    .locator('a')
    .count();
  if (exampleCount === 0) {
    await expect(page.getByText('No examples yet.')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('plays examples, and reduced motion only shows key moments', async ({ page }) => {
  await page.goto('/?example=shape-morph&fps=30');
  const stage = page.locator('[data-hae-stage="shape-morph"]');
  await expect(stage).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Examples' }).locator('a')).toHaveCount(
    exampleNames().length,
  );

  await page.getByRole('button', { name: 'Frame ▶' }).click();
  await expect(page.locator('#timecode')).toHaveText(/^0\.033 s · 1 \//);

  // Reduced motion: playback cuts between the example's stills (frames 9, 21, 45, 75, 105, 150).
  await page.getByLabel('Reduced motion').check();
  await expect(page).toHaveURL(/reduced=1/);
  const seen = new Set<string>();
  await page.getByRole('button', { name: 'Play' }).click();
  for (let i = 0; i < 12; i++) {
    seen.add((await page.locator('#timecode').textContent()) ?? '');
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: 'Pause' }).click();
  const frames = [...seen].map((text) => Number(/· (\d+) \//.exec(text)?.[1]));
  expect(frames.length).toBeGreaterThan(1);
  for (const frame of frames) expect([9, 21, 45, 75, 105, 150]).toContain(frame);
});
