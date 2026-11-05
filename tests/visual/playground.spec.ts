import { expect, test } from '@playwright/test';

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
