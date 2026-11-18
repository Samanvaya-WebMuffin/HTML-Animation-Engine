import { expect, test } from '@playwright/test';

test('playground boots on the featured video, with its scenes, controls and no console errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');

  await expect(page).toHaveTitle('HTML-Animation-Engine');
  await expect(page.locator('[data-hae-stage="cowork-film"]')).toBeVisible();
  // The featured video's scenes, listed on the left; each one jumps to its start.
  const scenes = page.getByRole('navigation', { name: 'Scenes' }).getByRole('button');
  await expect(scenes).toHaveCount(7);
  for (const name of ['Play', '◀ Frame', 'Frame ▶', 'Export 4K']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('slider', { name: 'Scrubber' })).toBeVisible();
  await expect(page.getByLabel('FPS')).toBeVisible();
  await expect(page.getByLabel('Resolution')).toBeVisible();
  await scenes.nth(2).click();
  await expect(scenes.nth(2)).toHaveAttribute('aria-current', 'true');
  expect(errors).toEqual([]);
});

test('plays examples, and reduced motion only shows key moments', async ({ page }) => {
  await page.goto('/?example=shape-morph&fps=30');
  const stage = page.locator('[data-hae-stage="shape-morph"]');
  await expect(stage).toBeVisible();
  // A single composition has no scene list.
  await expect(page.locator('#scene-panel')).toBeHidden();

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
