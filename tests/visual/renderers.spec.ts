import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { decode } from './helpers.js';

const FIXTURE = `/@fs${fileURLToPath(new URL('./fixtures/parity.ts', import.meta.url))}`;
const W = 800;
const H = 500;

async function drawAll(page: Page, which: 'basic' | 'light') {
  await page.setViewportSize({ width: W, height: H * 3 });
  await page.goto('/capture.html');
  await page.evaluate(
    async ([fixture, scene]) => (await import(/* @vite-ignore */ fixture)).mountAll(scene),
    [FIXTURE, which] as const,
  );
  const shot = async (index: number) =>
    decode(await page.screenshot({ clip: { x: 0, y: index * H, width: W, height: H } }));
  const [canvas, svg, dom] = [await shot(0), await shot(1), await shot(2)];
  const diff = (a: typeof canvas, b: typeof canvas) =>
    pixelmatch(a.data, b.data, undefined, W, H, { threshold: 0.1, includeAA: true }) / (W * H);
  return { svgDiff: diff(canvas, svg), domDiff: diff(canvas, dom) };
}

test('Canvas, SVG and DOM renderers draw the same scene', async ({ page }) => {
  // Measured on macOS: SVG 0.06 %, DOM 0.63 %. The DOM difference is one-pixel
  // anti-aliasing on CSS box edges and HTML text outlines; shapes, colours,
  // positions and order match. A shape off by 2 px or a wrong fill scores far
  // higher than these limits.
  const { svgDiff, domDiff } = await drawAll(page, 'basic');
  test.info().annotations.push({ type: 'diff', description: `svg ${svgDiff}, dom ${domDiff}` });
  expect(svgDiff).toBeLessThan(0.003);
  expect(domDiff).toBeLessThan(0.015);
});

test('Canvas, SVG and DOM renderers draw the same gradients, shadows and glows', async ({
  page,
}) => {
  const { svgDiff, domDiff } = await drawAll(page, 'light');
  // Measured on macOS: SVG 0.02 %, DOM 0.16 %.
  test.info().annotations.push({ type: 'diff', description: `svg ${svgDiff}, dom ${domDiff}` });
  expect(svgDiff).toBeLessThan(0.003);
  expect(domDiff).toBeLessThan(0.015);
});

test('the stage blocks CSS transitions and Web Animations', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  await page.goto('/capture.html');
  const result = await page.evaluate(
    async (fixture) => (await import(/* @vite-ignore */ fixture)).mountClockDriven(),
    FIXTURE,
  );
  // translateX(100px) applied immediately: no 2 s transition in progress.
  expect(result.transform).toBe('matrix(1, 0, 0, 1, 100, 0)');
  expect(result.animations).toBe(0);
  expect(warnings.some((w) => w.includes('clock-driven animation'))).toBe(true);
});
