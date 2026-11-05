// @vitest-environment happy-dom
import {
  compositionSeed,
  defineComposition,
  type RenderContext,
} from '@html-animation-engine/core';
import { describe, expect, it, vi } from 'vitest';
import { mountStage } from '../src/index.js';

function makeComposition() {
  const calls: { t: number; ctx: RenderContext }[] = [];
  const composition = defineComposition({
    id: 'stage-test',
    width: 320,
    height: 180,
    fps: 30,
    duration: 1,
    background: 'rgb(1, 2, 3)',
    setup: vi.fn(),
    teardown: vi.fn(),
    render(t: number, ctx: RenderContext) {
      calls.push({ t, ctx });
      ctx.root.dataset['t'] = String(t);
    },
  });
  return { composition, calls };
}

describe('mountStage', () => {
  it('creates a root of the exact composition size and runs setup once', async () => {
    const { composition } = makeComposition();
    const stage = await mountStage(document.body, composition);

    expect(stage.element.style.width).toBe('320px');
    expect(stage.element.style.height).toBe('180px');
    expect(stage.element.style.background).toContain('rgb(1, 2, 3)');
    expect(composition.setup).toHaveBeenCalledTimes(1);
  });

  it('passes t and the matching frame index to render', async () => {
    const { composition, calls } = makeComposition();
    const stage = await mountStage(document.body, composition, { fps: 60, pixelRatio: 2 });

    stage.render(0.5);
    expect(calls.at(-1)?.t).toBe(0.5);
    expect(calls.at(-1)?.ctx).toMatchObject({
      frame: 30,
      fps: 60,
      pixelRatio: 2,
      seed: compositionSeed({ id: 'stage-test' }),
    });
    expect(stage.element.dataset['t']).toBe('0.5');
  });

  it('tears down and removes the root on destroy', async () => {
    const { composition } = makeComposition();
    const stage = await mountStage(document.body, composition);

    stage.destroy();
    expect(composition.teardown).toHaveBeenCalledTimes(1);
    expect(stage.element.isConnected).toBe(false);
  });
});

describe('mountStage seeds and fonts', () => {
  it('derives ctx.seed from `seed`, falling back to the id', async () => {
    const { composition } = makeComposition();
    const seeds: number[] = [];
    const record = (_t: number, ctx: RenderContext) => void seeds.push(ctx.seed);
    for (const variant of [composition, { ...composition, seed: 'other' }]) {
      const stage = await mountStage(document.body, { ...variant, render: record });
      stage.render(0);
    }
    expect(seeds).toEqual([
      compositionSeed({ id: 'stage-test' }),
      compositionSeed({ id: 'ignored', seed: 'other' }),
    ]);
  });

  it('loads declared fonts before setup runs', async () => {
    const order: string[] = [];
    const fonts = {
      load: vi.fn((font: string) => {
        order.push(`load ${font}`);
        return Promise.resolve([]);
      }),
      check: vi.fn(() => true),
      ready: Promise.resolve(),
    };
    const original = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    try {
      const { composition } = makeComposition();
      await mountStage(document.body, {
        ...composition,
        fonts: [{ family: 'Inter', size: 48, weight: 700 }],
        setup: () => void order.push('setup'),
      });
      expect(order).toEqual(['load 700 48px Inter', 'setup']);
    } finally {
      if (original) Object.defineProperty(document, 'fonts', original);
      else Reflect.deleteProperty(document, 'fonts');
    }
  });
});
