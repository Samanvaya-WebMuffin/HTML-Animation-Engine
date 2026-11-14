// @vitest-environment happy-dom
import {
  compositionSeed,
  defineComposition,
  type Composition,
  type Soundtrack,
} from '@html-animation-engine/core';
import { describe, expect, it } from 'vitest';
import { defineSequence, isSequence, mountStage, sceneAt, sceneStarts } from '../src/index.js';

/** A scene that writes what it was asked to draw into its root. */
function scene(id: string, duration: number, audio?: Soundtrack): Composition {
  return defineComposition({
    id,
    width: 90,
    height: 160,
    fps: 60,
    duration,
    background: 'rgb(1, 2, 3)',
    ...(audio ? { audio } : {}),
    render(t, ctx) {
      ctx.root.textContent = `${id}@${t.toFixed(4)} seed ${ctx.seed}`;
    },
  });
}

const tone = (at: number): Soundtrack => ({
  events: [{ at, sound: { type: 'tone', wave: 'sine', freq: 440, envelope: { decay: 0.1 } } }],
});

describe('defineSequence', () => {
  const a = scene('scene-a', 3, tone(0.5));
  const b = scene('scene-b', 4, tone(1));
  const video = defineSequence({ id: 'video', scenes: [a, b] });

  it('runs the scenes back to back', () => {
    expect(video.duration).toBe(7);
    expect(sceneStarts([a, b])).toEqual([0, 3]);
    expect(sceneAt([a, b], 2.99)).toEqual({ index: 0, local: 2.99 });
    // A scene's first frame comes exactly where the previous one ends.
    expect(sceneAt([a, b], 3)).toEqual({ index: 1, local: 0 });
    expect(sceneAt([a, b], 6.5)).toEqual({ index: 1, local: 3.5 });
  });

  it('lists its scenes for chapter lists and progress markers', () => {
    expect(isSequence(video)).toBe(true);
    expect(isSequence(a)).toBe(false);
    expect(video.scenes).toEqual([
      { id: 'scene-a', title: 'scene-a', start: 0, duration: 3 },
      { id: 'scene-b', title: 'scene-b', start: 3, duration: 4 },
    ]);
  });

  it('merges the soundtracks at each scene start', () => {
    expect(video.audio?.events.map((e) => e.at)).toEqual([0.5, 4]);
  });

  it('adds music under the whole video, timed from its start', () => {
    const scored = defineSequence({ id: 'scored', scenes: [a, b], music: tone(2) });
    expect(scored.audio?.events.map((e) => e.at)).toEqual([0.5, 4, 2]);
  });

  it('rejects scenes of different sizes', () => {
    const wide = defineComposition({ ...a, id: 'wide', width: 160, height: 90 });
    expect(() => defineSequence({ id: 'bad', scenes: [a, wide] })).toThrow(/must match/);
  });

  it('draws each scene at its local time with its own seed, the others hidden', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const stage = await mountStage(host, video, { fps: 60 });
    const layers = () => [...(stage.element.children as HTMLCollectionOf<HTMLElement>)];
    const shown = () => layers().filter((l) => l.style.display !== 'none');

    stage.render(1.25);
    expect(shown().map((l) => l.textContent)).toEqual([
      `scene-a@1.2500 seed ${compositionSeed(a)}`,
    ]);
    stage.render(3);
    expect(shown().map((l) => l.textContent)).toEqual([
      `scene-b@0.0000 seed ${compositionSeed(b)}`,
    ]);
    // Deterministic, in any order: going back gives the same frame.
    stage.render(1.25);
    expect(shown()[0]?.textContent).toBe(`scene-a@1.2500 seed ${compositionSeed(a)}`);
    stage.destroy();
  });
});
