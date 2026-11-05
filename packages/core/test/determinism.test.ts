import { describe, expect, it } from 'vitest';
import {
  at,
  circle,
  clip,
  compositionSeed,
  createNoise,
  createRng,
  defaultTheme,
  flattenScene,
  frameCount,
  frameToTime,
  hashString,
  groupNode,
  label,
  layoutText,
  lerpCamera,
  mixColors,
  morph,
  pathGeometry,
  pill,
  random,
  rect,
  shapeNode,
  stagger,
  staggerProgress,
  tempo,
  textNode,
  timeline,
  type Scene,
  type TextMeasurer,
} from '../src/index.js';

const { colors, easing, type } = defaultTheme;
const W = 1280;
const H = 720;
const FPS = 30;
const DURATION = 6;

/**
 * A composition-shaped scene builder that touches every core module. Built
 * once ("setup"), then `frame(t)` must be a pure function of t.
 */
function createShowcase() {
  const seed = compositionSeed({ id: 'determinism-showcase' });
  const music = tempo({ bpm: 120 });
  const noise = createNoise(seed);
  const measurer: TextMeasurer = { measure: (text, font) => text.length * font.size * 0.55 };
  const title = layoutText(
    'Snap and settle, then hold',
    { ...type.display, size: 72 },
    {
      measurer,
      maxWidth: 700,
      align: 'center',
    },
  );
  const tl = timeline([
    clip('morph-in', music.beats(2)),
    label('drop'),
    stagger(
      ['a', 'b', 'c'].map((n) => clip(`dot-${n}`, 0.4)),
      0.08,
    ),
    clip('camera', 2, { at: at('drop', 0.5) }),
  ]);
  const hero = morph([
    { at: 0, shape: rect(0, 0, 160, 160), fill: colors.lime },
    {
      at: tl.clip('morph-in').end,
      shape: pill(0, 0, 360, 100),
      fill: colors.pink,
      ease: easing.snap,
    },
    { at: 2.5, shape: circle(0, 0, 70), fill: colors.blue, ease: easing.enter },
    {
      at: 4,
      shape: pathGeometry('M0 -90 L80 60 L-80 60 Z'),
      fill: colors.orange,
      ease: easing.camera,
    },
  ]);

  return (t: number): string => {
    const rng = createRng(seed); // fresh per frame: same draws every frame
    const p = tl.progress('camera', t, easing.camera);
    const camera = lerpCamera(
      { x: W / 2, y: H / 2, zoom: 1, rotation: 0 },
      { x: W / 2 + 120, y: H / 2 - 40, zoom: 1.6, rotation: 4 },
      p,
    );
    const form = hero.at(t);
    const stars = Array.from({ length: 40 }, (_, i) =>
      shapeNode(`star-${i}`, {
        geometry: circle(0, 0, 1 + random(seed, 'r', i) * 3),
        fill: mixColors(colors.paper, colors.violet, random(seed, 'c', i)),
        opacity: 0.4 + 0.6 * (0.5 + 0.5 * noise.loop(t / DURATION, 1.2, i)),
        transform: { x: rng.range(0, W), y: rng.range(0, H) },
      }),
    );
    const words = title.words.map((word) =>
      textNode(`word-${word.index}`, {
        text: word.text,
        font: { ...type.display, size: 72 },
        fill: colors.paper,
        opacity: staggerProgress(t, word.index, title.words.length, {
          start: 1,
          each: 0.06,
          duration: 0.3,
          ease: easing.enter,
        }),
        transform: { x: W / 2 + word.x, y: 520 + word.y },
      }),
    );
    const scene: Scene = {
      width: W,
      height: H,
      camera,
      world: [
        groupNode('stars', stars, { z: -1 }),
        shapeNode('hero', {
          geometry: form.geometry,
          ...(form.fill === undefined ? {} : { fill: form.fill }),
          opacity: form.opacity,
          transform: {
            x: W / 2,
            y: H / 2,
            rotation: form.rotation,
            scale: 1 + 0.08 * music.pulse(t),
          },
          shadow: { x: 12, y: 12, color: colors.ink },
        }),
      ],
      screen: [groupNode('title', words)],
    };
    return JSON.stringify(flattenScene(scene));
  };
}

const times = Array.from({ length: frameCount(DURATION, FPS) }, (_, f) => frameToTime(f, FPS));

describe('determinism', () => {
  it('renders the same frame twice byte-for-byte', () => {
    const frame = createShowcase();
    for (const t of times) expect(frame(t)).toBe(frame(t));
  });

  it('does not depend on render order', () => {
    const frame = createShowcase();
    const forward = times.map(frame);
    const backward = [...times].reverse().map(frame).reverse();
    const order = createRng('order').shuffle(times.map((_, i) => i));
    const shuffled: string[] = [];
    for (const i of order) shuffled[i] = frame(times[i] as number);
    expect(backward).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });

  it('does not depend on the instance (no hidden module state)', () => {
    const a = createShowcase();
    a(3.3); // advance one instance first
    const b = createShowcase();
    expect(times.map(b)).toEqual(times.map(a));
  });

  it('produces the pinned output (catches platform or library drift)', () => {
    const frame = createShowcase();
    const output = times.map(frame).join('\n');
    expect({ hash: hashString(output), length: output.length }).toMatchInlineSnapshot(`
      {
        "hash": 3268733590,
        "length": 3572136,
      }
    `);
  });
});
