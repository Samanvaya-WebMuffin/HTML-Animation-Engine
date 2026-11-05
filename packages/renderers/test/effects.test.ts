import {
  defaultTheme,
  flattenScene,
  pathLength,
  rect,
  textNode,
  type SceneNode,
  type TextMeasurer,
} from '@html-animation-engine/core';
import { describe, expect, it } from 'vitest';
import {
  circleReveal,
  confetti,
  counterRoll,
  dotGrid,
  highlighterWipe,
  landingShadow,
  maskReveal,
  marquee,
  nodeGraph,
  particleBurst,
  pathDraw,
  pullBack,
  pushIn,
  shapeMorph,
  staggerGrid,
  typeOn,
} from '../src/index.js';

const { colors, easing } = defaultTheme;
/** Monospace fake measurer: every character is 0.6 em wide. */
const mono: TextMeasurer = {
  measure: (text, font) => [...text].length * font.size * 0.6,
  metrics: (font) => ({ ascent: font.size * 0.8, descent: font.size * 0.2 }),
};
const font = { family: 'Test', size: 20 };
const json = (node: unknown) => JSON.stringify(node);
const texts = (node: SceneNode) =>
  flattenScene({ width: 100, height: 100, world: [node] }).flatMap((item) =>
    item.node.type === 'text' && item.opacity > 0 ? [item.node.text] : [],
  );

/** Every effect, as (t) => node, for the shared checks. */
const effects: [string, (t: number) => unknown][] = [
  [
    'highlighterWipe',
    highlighterWipe({
      id: 'h',
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      color: colors.lime,
      start: 0,
      duration: 1,
    }),
  ],
  [
    'maskReveal',
    (t) =>
      maskReveal({ id: 'm', x: 0, y: 0, width: 100, height: 50, start: 0, duration: 1 })(t, []),
  ],
  [
    'circleReveal',
    (t) => circleReveal({ id: 'c', x: 0, y: 0, radius: 50, start: 0, duration: 1 })(t, []),
  ],
  [
    'typeOn',
    typeOn({
      id: 'ty',
      text: 'hello',
      font,
      fill: colors.paper,
      x: 0,
      y: 0,
      start: 0,
      charsPerSecond: 10,
      caret: { color: colors.lime },
      measurer: mono,
    }),
  ],
  [
    'counterRoll',
    counterRoll({
      id: 'n',
      from: 0,
      to: 1234,
      start: 0,
      duration: 1,
      font,
      fill: colors.paper,
      x: 0,
      y: 0,
      measurer: mono,
    }),
  ],
  [
    'particleBurst',
    particleBurst({
      id: 'p',
      seed: 1,
      x: 0,
      y: 0,
      start: 0,
      count: 20,
      colors: [colors.pink],
      speed: [100, 200],
    }),
  ],
  [
    'confetti',
    confetti({
      id: 'cf',
      seed: 2,
      x: 0,
      y: 0,
      start: 0,
      count: 20,
      colors: [colors.pink],
      speed: [100, 200],
    }),
  ],
  [
    'dotGrid',
    dotGrid({
      id: 'd',
      x: 0,
      y: 0,
      cols: 5,
      rows: 4,
      spacing: 10,
      radius: 2,
      color: colors.surface,
      accent: colors.lime,
      wavelength: 40,
      period: 2,
    }),
  ],
  [
    'nodeGraph',
    nodeGraph({
      id: 'g',
      seed: 3,
      count: 12,
      bounds: { x: 0, y: 0, width: 200, height: 100 },
      loopDuration: 4,
      drift: 10,
      linkDistance: 80,
      nodeRadius: 2,
      nodeColor: colors.blue,
      linkColor: colors.violet,
    }),
  ],
  [
    'shapeMorph',
    shapeMorph({
      id: 's',
      x: 0,
      y: 0,
      keys: [
        { at: 0, shape: rect(0, 0, 10, 10) },
        { at: 1, shape: rect(0, 0, 20, 10, 5) },
      ],
    }),
  ],
  [
    'pathDraw',
    pathDraw({ id: 'pd', d: 'M0 0 L100 0', color: colors.lime, width: 4, start: 0, duration: 1 }),
  ],
  [
    'staggerGrid',
    staggerGrid({
      id: 'sg',
      x: 0,
      y: 0,
      cols: 3,
      rows: 3,
      cell: 10,
      gap: 2,
      colors: [colors.pink],
      start: 0,
      each: 0.1,
      duration: 0.3,
      from: 'center',
    }),
  ],
  [
    'marquee',
    marquee({
      id: 'mq',
      text: 'loop',
      font,
      fill: colors.paper,
      y: 0,
      width: 300,
      gap: 10,
      speed: 50,
      loopDuration: 2,
      measurer: mono,
    }),
  ],
  [
    'landingShadow',
    landingShadow({
      id: 'l',
      geometry: rect(0, 0, 50, 50),
      fill: colors.lime,
      shadowColor: colors.paper,
      x: 0,
      y: 0,
      shadow: { x: 10, y: 10 },
      start: 0,
      duration: 1,
    }),
  ],
  [
    'pushIn',
    pushIn({ width: 100, height: 100, target: { x: 20, y: 20 }, zoom: 2, start: 0, duration: 1 }),
  ],
  [
    'particleBurst (lit streaks)',
    particleBurst({
      id: 'pl',
      seed: 1,
      x: 0,
      y: 0,
      start: 0,
      count: 20,
      colors: [colors.pink],
      speed: [100, 200],
      light: { core: colors.paper },
    }),
  ],
  [
    'confetti (lit)',
    confetti({
      id: 'cfl',
      seed: 2,
      x: 0,
      y: 0,
      start: 0,
      count: 20,
      colors: [colors.pink],
      speed: [100, 200],
      light: { core: colors.paper, shade: colors.ink },
    }),
  ],
  [
    'dotGrid (glow)',
    dotGrid({
      id: 'dg',
      x: 0,
      y: 0,
      cols: 5,
      rows: 4,
      spacing: 10,
      radius: 2,
      color: colors.surface,
      accent: colors.lime,
      wavelength: 40,
      period: 2,
      glow: 6,
    }),
  ],
  [
    'nodeGraph (glow, depth)',
    nodeGraph({
      id: 'gg',
      seed: 3,
      count: 12,
      bounds: { x: 0, y: 0, width: 200, height: 100 },
      loopDuration: 4,
      drift: 10,
      linkDistance: 80,
      nodeRadius: 2,
      nodeColor: colors.blue,
      linkColor: colors.violet,
      glow: { core: colors.paper },
      depth: 0.6,
    }),
  ],
];

describe('every effect', () => {
  it.each(effects)('%s is a pure function of t', (_name, effect) => {
    const times = Array.from({ length: 31 }, (_, i) => i / 10);
    const forward = times.map((t) => json(effect(t)));
    const backward = [...times]
      .reverse()
      .map((t) => json(effect(t)))
      .reverse();
    expect(backward).toEqual(forward);
  });
});

describe('looping effects with light options', () => {
  it('loop seamlessly', () => {
    const grid = dotGrid({
      id: 'dg',
      x: 0,
      y: 0,
      cols: 5,
      rows: 4,
      spacing: 10,
      radius: 2,
      color: colors.surface,
      accent: colors.lime,
      wavelength: 40,
      period: 2,
      glow: 6,
    });
    expect(json(grid(2))).toEqual(json(grid(0)));
    const graph = nodeGraph({
      id: 'gg',
      seed: 3,
      count: 12,
      bounds: { x: 0, y: 0, width: 200, height: 100 },
      loopDuration: 4,
      drift: 10,
      linkDistance: 80,
      nodeRadius: 2,
      nodeColor: colors.blue,
      linkColor: colors.violet,
      glow: { core: colors.paper },
      depth: 0.6,
    });
    expect(json(graph(4))).toEqual(json(graph(0)));
  });
});

describe('effect behaviour', () => {
  it('highlighter grows from nothing to its full width', () => {
    const wipe = highlighterWipe({
      id: 'h',
      x: 50,
      y: 0,
      width: 100,
      height: 20,
      color: colors.lime,
      start: 1,
      duration: 1,
      ease: easing.wipe,
    });
    expect(wipe(0).geometry).toMatchObject({ width: 0 });
    expect(wipe(5).geometry).toMatchObject({ width: 100, x: 0 });
  });

  it('path draw shows nothing at the start and the whole stroke at the end', () => {
    const d = 'M0 0 C50 -50 100 50 150 0';
    const draw = pathDraw({ id: 'pd', d, color: colors.lime, width: 4, start: 0, duration: 1 });
    expect(draw(0).visible).toBe(false);
    const end = draw(1).stroke;
    expect(end?.dashOffset).toBe(0);
    expect(end?.dash?.[0]).toBeGreaterThan(pathLength(d));
  });

  it('type-on reveals characters in order and finishes the text', () => {
    const typed = typeOn({
      id: 'ty',
      text: 'hello',
      font,
      fill: colors.paper,
      x: 0,
      y: 0,
      start: 0,
      charsPerSecond: 10,
      jitter: 0,
      measurer: mono,
    });
    expect(texts(typed(0))).toEqual(['']);
    expect(texts(typed(0.25))).toEqual(['he']);
    expect(texts(typed(9))).toEqual(['hello']);
  });

  it('counter lands exactly on its target, with separators', () => {
    const counter = counterRoll({
      id: 'n',
      from: 0,
      to: 1284930,
      start: 0,
      duration: 2,
      font,
      fill: colors.paper,
      x: 0,
      y: 0,
      separator: ',',
      measurer: mono,
    });
    const shown = flattenScene({ width: 100, height: 100, world: [counter(5)] })
      .filter(
        (item) =>
          (item.node.type === 'text' && item.node.id.endsWith('a')) ||
          (item.node.type === 'text' && item.node.text === ','),
      )
      .map((item) => (item.node.type === 'text' ? item.node.text : ''))
      .join('');
    expect(shown).toBe('1,284,930');
  });

  it('counter hides separators to the left of the leading digit', () => {
    const counter = counterRoll({
      id: 'n',
      from: 500,
      to: 500,
      start: 0,
      duration: 1,
      font,
      fill: colors.paper,
      x: 0,
      y: 0,
      separator: ',',
      measurer: mono,
    });
    // 500 in a column layout sized for 500: no separators at all.
    expect(texts(counter(1)).filter((t) => t === ',')).toHaveLength(0);
    const big = counterRoll({
      id: 'n',
      from: 0,
      to: 2000,
      start: 0,
      duration: 1,
      font,
      fill: colors.paper,
      x: 0,
      y: 0,
      separator: ',',
      measurer: mono,
    });
    expect(texts(big(0)).filter((t) => t === ',')).toHaveLength(0); // shows "0"
    expect(texts(big(1)).filter((t) => t === ',')).toHaveLength(1); // shows "2,000"
  });

  it('particles follow the closed-form drag + gravity solution', () => {
    // With no drag, a particle is a parabola: y = vy·t + ½·g·t².
    const burst = particleBurst({
      id: 'p',
      seed: 1,
      x: 0,
      y: 0,
      start: 0,
      count: 1,
      colors: [colors.pink],
      speed: [100, 100],
      direction: 0,
      spread: 0,
      gravity: 100,
      drag: 0,
      life: [5, 5],
    });
    const transform = (t: number) =>
      (burst(t).children[0] as { transform: { x: number; y: number } }).transform;
    expect(transform(1).x).toBeCloseTo(100, 9);
    expect(transform(1).y).toBeCloseTo(50, 9);
    expect(transform(2).y).toBeCloseTo(200, 9);
  });

  it('particles are hidden before launch and after their lifetime', () => {
    const burst = particleBurst({
      id: 'p',
      seed: 1,
      x: 0,
      y: 0,
      start: 1,
      count: 5,
      colors: [colors.pink],
      speed: [100, 200],
      life: [1, 1],
    });
    expect(burst(0.5).children.every((c) => c.visible === false)).toBe(true);
    expect(burst(1.5).children.every((c) => c.visible !== false)).toBe(true);
    expect(burst(2.5).children.every((c) => c.visible === false)).toBe(true);
  });

  it('loops are seamless: dot grid, node graph and marquee repeat exactly', () => {
    const [, grid] = effects.find(([name]) => name === 'dotGrid') ?? [];
    const [, graph] = effects.find(([name]) => name === 'nodeGraph') ?? [];
    const [, scroller] = effects.find(([name]) => name === 'marquee') ?? [];
    expect(json(grid?.(2))).toBe(json(grid?.(0)));
    expect(json(graph?.(4))).toBe(json(graph?.(0)));
    expect(json(scroller?.(2))).toBe(json(scroller?.(0)));
  });

  it('the landing shadow grows from zero to its full offset', () => {
    const land = landingShadow({
      id: 'l',
      geometry: rect(0, 0, 50, 50),
      fill: colors.lime,
      shadowColor: colors.paper,
      x: 0,
      y: 0,
      shadow: { x: 10, y: 10 },
      start: 0,
      duration: 1,
      content: [textNode('label', { text: 'hi', font, fill: colors.ink })],
    });
    // The hard shadow is the last (topmost) in the list, above any ambient layers.
    const shadowAt = (t: number) =>
      (land(t).children[0] as { shadow: readonly { x: number }[] }).shadow.at(-1)?.x;
    expect(shadowAt(0)).toBe(0);
    expect(shadowAt(1)).toBe(10);
    expect(land(1).transform).toMatchObject({ y: 0, scale: 1 });
    expect(land(1).children).toHaveLength(2);
  });

  it('the landing ambient shadow is given the height above the resting place', () => {
    const heights: number[] = [];
    const land = landingShadow({
      id: 'l',
      geometry: rect(0, 0, 50, 50),
      fill: colors.lime,
      shadowColor: colors.paper,
      x: 0,
      y: 0,
      shadow: { x: 10, y: 10 },
      start: 0,
      duration: 1,
      ambient: (height) => {
        heights.push(height);
        return [{ x: 0, y: 4, blur: 8, color: colors.ink }];
      },
    });
    const shadows = (t: number) => (land(t).children[0] as { shadow: readonly unknown[] }).shadow;
    expect(shadows(0)).toHaveLength(2);
    land(1);
    expect(heights).toEqual([1, 0]);
  });

  it('stagger grid tiles finish at full size', () => {
    const grid = staggerGrid({
      id: 'sg',
      x: 0,
      y: 0,
      cols: 3,
      rows: 3,
      cell: 10,
      gap: 2,
      colors: [colors.pink],
      start: 0,
      each: 0.1,
      duration: 0.3,
      from: 'center',
    });
    expect(grid(0).children.every((c) => c.visible === false)).toBe(true);
    expect(grid(5).children.every((c) => c.transform?.scale === 1)).toBe(true);
  });

  it('push in and pull back are mirror images', () => {
    const options = {
      width: 100,
      height: 100,
      target: { x: 20, y: 30 },
      zoom: 3,
      start: 0,
      duration: 1,
    };
    expect(pushIn(options)(0)).toEqual({ x: 50, y: 50, zoom: 1, rotation: 0 });
    expect(pushIn(options)(1)).toEqual({ x: 20, y: 30, zoom: 3, rotation: 0 });
    expect(pullBack(options)(0)).toEqual(pushIn(options)(1));
    expect(pullBack(options)(1)).toEqual(pushIn(options)(0));
  });

  it('confetti flutters (its apparent height changes over time)', () => {
    const [, cf] = effects.find(([name]) => name === 'confetti') ?? [];
    const scaleY = (t: number) =>
      (cf?.(t) as { children: { transform?: { scaleY?: number } }[] }).children[0]?.transform
        ?.scaleY ?? 0;
    expect(new Set([0.1, 0.2, 0.3, 0.4].map((t) => scaleY(t).toFixed(3))).size).toBe(4);
  });
});
