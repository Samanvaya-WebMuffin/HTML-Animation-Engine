/**
 * Test fixture: builds a scene with the core engine and paints it with a
 * minimal Canvas 2D painter, so the visual tests can compare real pixels.
 * The production renderers live in packages/renderers.
 */
import {
  circle,
  createCanvasMeasurer,
  createNoise,
  defaultTheme,
  flattenScene,
  fontString,
  geometryToPath,
  layoutText,
  lerpCamera,
  loadFonts,
  morph,
  pathGeometry,
  pill,
  random,
  rect,
  shapeNode,
  staggerProgress,
  textNode,
  type DrawItem,
  type Matrix,
  type Scene,
} from '../../../packages/core/src/index.js';

const { colors, easing, type } = defaultTheme;
const W = 640;
const H = 360;
const SEED = 1234;

function paint(ctx: CanvasRenderingContext2D, items: readonly DrawItem[]) {
  const set = (m: Matrix) => ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = colors.ink;
  ctx.fillRect(0, 0, W, H);
  for (const item of items) {
    ctx.save();
    for (const region of item.clips) {
      set(region.matrix);
      ctx.clip(new Path2D(geometryToPath(region.geometry)));
    }
    set(item.matrix);
    ctx.globalAlpha = item.opacity;
    const { node } = item;
    if (node.type === 'shape') {
      if (node.fill) {
        ctx.fillStyle = node.fill;
        ctx.fill(new Path2D(geometryToPath(node.geometry)));
      }
    } else {
      ctx.font = fontString(node.font);
      // Must match the measurer, which includes letter spacing in word widths.
      ctx.letterSpacing = `${node.font.letterSpacing ?? 0}px`;
      ctx.fillStyle = node.fill ?? colors.paper;
      ctx.textBaseline = 'top';
      ctx.fillText(node.text, 0, 0);
    }
    ctx.restore();
  }
}

export async function createFixture() {
  const font = { ...type.display, size: 40 };
  await loadFonts([font]);
  const title = layoutText('Pure function of time', font, {
    measurer: createCanvasMeasurer(),
    align: 'center',
  });
  const noise = createNoise(SEED);
  const hero = morph([
    { at: 0, shape: rect(0, 0, 120, 120), fill: colors.lime },
    { at: 1, shape: pill(0, 0, 260, 70), fill: colors.pink, ease: easing.snap },
    { at: 2, shape: circle(0, 0, 50), fill: colors.blue, ease: easing.enter },
    { at: 3, shape: pathGeometry('M0 -70 L60 45 L-60 45 Z'), fill: colors.orange },
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No Canvas 2D');

  const scene = (t: number): Scene => {
    const form = hero.at(t);
    return {
      width: W,
      height: H,
      camera: lerpCamera(
        { x: W / 2, y: H / 2, zoom: 1, rotation: 0 },
        { x: W / 2 + 40, y: H / 2, zoom: 1.4, rotation: 3 },
        Math.min(1, t / 3),
      ),
      world: [
        ...Array.from({ length: 30 }, (_, i) =>
          shapeNode(`dot-${i}`, {
            geometry: circle(0, 0, 2 + 3 * random(SEED, 'size', i)),
            fill: colors.violet,
            opacity: 0.5 + 0.5 * noise.loop(t / 3, 1, i),
            transform: { x: random(SEED, 'x', i) * W, y: random(SEED, 'y', i) * H },
          }),
        ),
        shapeNode('hero', {
          geometry: form.geometry,
          ...(form.fill ? { fill: form.fill } : {}),
          transform: { x: W / 2, y: H / 2 - 30, rotation: form.rotation },
        }),
      ],
      screen: title.words.map((word) =>
        textNode(`w${word.index}`, {
          text: word.text,
          font,
          fill: colors.paper,
          opacity: staggerProgress(t, word.index, title.words.length, {
            start: 0.5,
            each: 0.1,
            duration: 0.3,
          }),
          transform: { x: W / 2 + word.x, y: 280 + word.y },
        }),
      ),
    };
  };

  return {
    /** Renders frame `t` and returns the SHA-256 of the raw RGBA pixels. */
    async renderHash(t: number): Promise<string> {
      paint(ctx, flattenScene(scene(t)));
      const pixels = ctx.getImageData(0, 0, W, H).data;
      const digest = await crypto.subtle.digest('SHA-256', pixels);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    },
  };
}
