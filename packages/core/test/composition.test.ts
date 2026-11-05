import { describe, expect, it } from 'vitest';
import {
  defineComposition,
  frameCount,
  frameToTime,
  snapToFrame,
  timeToFrame,
} from '../src/index.js';

const base = {
  id: 'demo',
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 2,
  background: '#000',
  render: () => undefined,
};

describe('defineComposition', () => {
  it('returns a valid composition unchanged', () => {
    expect(defineComposition(base)).toBe(base);
  });

  it.each([
    ['id', 'Not Kebab'],
    ['width', 0],
    ['height', 10.5],
    ['fps', -1],
    ['duration', 0],
    ['duration', Number.POSITIVE_INFINITY],
  ])('rejects an invalid %s (%s)', (key, value) => {
    expect(() => defineComposition({ ...base, [key]: value })).toThrow();
  });
});

describe('frame/time conversion', () => {
  it('counts frames in [0, duration)', () => {
    expect(frameCount(2, 30)).toBe(60);
    expect(frameCount(2.5, 24)).toBe(60);
    expect(frameCount(0.001, 30)).toBe(1);
  });

  it('round-trips every frame exactly', () => {
    for (const fps of [24, 25, 30, 50, 60]) {
      for (let frame = 0; frame < fps * 20; frame++) {
        expect(timeToFrame(frameToTime(frame, fps), fps)).toBe(frame);
      }
    }
  });

  it('absorbs floating-point error at frame boundaries', () => {
    expect(timeToFrame(0.1, 30)).toBe(3);
    expect(snapToFrame(0.1 + 0.2, 10)).toBeCloseTo(0.3, 12);
  });
});
