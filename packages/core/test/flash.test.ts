import { describe, expect, it } from 'vitest';
import { createFlashDetector, relativeLuminance } from '../src/index.js';

const W = 60;
const H = 60;
const FPS = 30;

/** A frame that is `base` everywhere and `patch` inside the given box. */
function frame(
  base: number,
  patch?: { value: number; x: number; y: number; w: number; h: number },
) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inside =
        patch && x >= patch.x && x < patch.x + patch.w && y >= patch.y && y < patch.y + patch.h;
      const v = inside ? patch.value : base;
      data.set([v, v, v, 255], (y * W + x) * 4);
    }
  }
  return data;
}

/** Alternates between two frames at `hz` full cycles per second for `seconds`. */
function strobe(a: Uint8ClampedArray, b: Uint8ClampedArray, hz: number, seconds = 2) {
  const detector = createFlashDetector({ width: W, height: H, fps: FPS });
  for (let f = 0; f < seconds * FPS; f++) {
    const phase = Math.floor((f / FPS) * hz * 2) % 2;
    detector.push(phase === 0 ? a : b);
  }
  return detector.report();
}

describe('relativeLuminance', () => {
  it('matches the WCAG formula', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 10);
    expect(relativeLuminance(255, 0, 0)).toBeCloseTo(0.2126, 4);
  });
});

describe('createFlashDetector', () => {
  const black = frame(0);
  const white = frame(255);

  it('flags a full-frame strobe above 3 flashes per second', () => {
    const report = strobe(black, white, 5);
    expect(report.safe).toBe(false);
    expect(report.maxFlashesPerSecond).toBeGreaterThan(3);
    expect(report.warnings[0]).toMatchObject({ region: { x: 0, y: 0, width: 20, height: 20 } });
  });

  it('passes a strobe at 3 flashes per second or fewer', () => {
    expect(strobe(black, white, 3).safe).toBe(true);
    expect(strobe(black, white, 1).safe).toBe(true);
  });

  it('flags a flash that covers a whole region, and locates it', () => {
    const patch = frame(0, { value: 255, x: 40, y: 40, w: 20, h: 20 });
    const report = strobe(black, patch, 6);
    expect(report.safe).toBe(false);
    expect(report.warnings.map((w) => w.region)).toContainEqual({
      x: 40,
      y: 40,
      width: 20,
      height: 20,
    });
  });

  it('ignores a small flicker that is diluted below 10 % of a region', () => {
    const tiny = frame(0, { value: 255, x: 5, y: 5, w: 4, h: 4 }); // 4 % of a region
    expect(strobe(black, tiny, 8).safe).toBe(true);
  });

  it('ignores changes smaller than 10 % and changes between bright states', () => {
    expect(strobe(frame(40), frame(60), 8).safe).toBe(true);
    expect(strobe(frame(240), frame(255), 8).safe).toBe(true);
  });

  it('does not count a slow fade as flashing', () => {
    const detector = createFlashDetector({ width: W, height: H, fps: FPS });
    for (let f = 0; f <= 60; f++) detector.push(frame(Math.round((f / 60) * 255)));
    expect(detector.report().safe).toBe(true);
  });

  it('rejects frames of the wrong size', () => {
    const detector = createFlashDetector({ width: W, height: H, fps: FPS });
    expect(() => detector.push(new Uint8ClampedArray(10))).toThrow(RangeError);
  });
});
