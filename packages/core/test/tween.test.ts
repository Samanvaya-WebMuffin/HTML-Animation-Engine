import { describe, expect, it } from 'vitest';
import {
  clamp,
  cubicBezier,
  holdFor,
  invLerp,
  keyframes,
  lerp,
  lerpAngle,
  lerpPoints,
  lerpRect,
  mixColors,
  mod,
  progress,
  remap,
  staggerProgress,
} from '../src/index.js';

describe('math', () => {
  it('lerp hits its endpoints exactly', () => {
    expect(lerp(0.1, 0.3, 1)).toBe(0.3);
    expect(lerp(0.1, 0.3, 0)).toBe(0.1);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });

  it('clamps, inverts, remaps and wraps', () => {
    expect(clamp(2)).toBe(1);
    expect(invLerp(10, 20, 15)).toBe(0.5);
    expect(remap(15, 10, 20, 0, 100)).toBe(50);
    expect(remap(99, 10, 20, 0, 100)).toBe(100);
    expect(mod(-1, 360)).toBe(359);
    expect(lerpAngle(350, 10, 0.5)).toBe(360);
  });
});

describe('progress', () => {
  it('is 0 before, 1 after, eased inside', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(progress(0.5, 1, 2)).toBe(0);
    expect(progress(2, 1, 2)).toBe(0.5);
    expect(progress(3, 1, 2)).toBe(1);
    expect(progress(1.2, 1, 2, ease)).toBeLessThan(0.1);
    expect(progress(1, 1, 0)).toBe(1);
    expect(progress(0.99, 1, 0)).toBe(0);
  });

  it('staggers by index', () => {
    const options = { start: 0, each: 0.1, duration: 0.2, from: 'end' as const };
    expect(staggerProgress(0.1, 2, 3, options)).toBe(0.5);
    expect(staggerProgress(0.1, 0, 3, options)).toBe(0);
  });
});

describe('holdFor', () => {
  it('is 1.2 s plus 0.25 s per word', () => {
    expect(holdFor('Snap and settle')).toBe(1.95);
    expect(holdFor(0)).toBe(1.2);
    expect(holdFor('  spaced   out  ')).toBe(1.7);
  });
});

describe('keyframes', () => {
  const track = keyframes(
    [
      { at: 0, value: 0 },
      { at: 1, value: 10 },
      { at: 3, value: 10 },
      { at: 4, value: 0, ease: cubicBezier(0.7, 0, 0.84, 0) },
    ],
    lerp,
  );

  it('holds outside the keys and mixes between them', () => {
    expect(track(-1)).toBe(0);
    expect(track(0.5)).toBe(5);
    expect(track(2)).toBe(10);
    expect(track(3.5)).toBeGreaterThan(5); // ease-in: still near 10 halfway
    expect(track(9)).toBe(0);
  });

  it('rejects keys out of order and empty tracks', () => {
    expect(() =>
      keyframes(
        [
          { at: 1, value: 0 },
          { at: 0, value: 1 },
        ],
        lerp,
      ),
    ).toThrow(RangeError);
    expect(() => keyframes([], lerp)).toThrow(RangeError);
  });
});

describe('interpolators', () => {
  it('lerps point lists of equal length', () => {
    expect(lerpPoints([{ x: 0, y: 0 }], [{ x: 10, y: 20 }], 0.5)).toEqual([{ x: 5, y: 10 }]);
    expect(() => lerpPoints([{ x: 0, y: 0 }], [], 0.5)).toThrow(RangeError);
  });

  it('lerps every rectangle property, with fill in OKLCH', () => {
    const a = { x: 0, y: 0, width: 100, height: 50, radius: 0, rotation: 0, fill: '#c6ff3d' };
    const b = { x: 100, y: 50, width: 200, height: 50, radius: 25, rotation: 360, fill: '#ff5fa2' };
    expect(lerpRect(a, b, 0.5)).toEqual({
      x: 50,
      y: 25,
      width: 150,
      height: 50,
      radius: 12.5,
      rotation: 180,
      fill: mixColors('#c6ff3d', '#ff5fa2', 0.5),
    });
    expect(lerpRect(a, b, 1).fill).toBe('#ff5fa2');
  });
});
