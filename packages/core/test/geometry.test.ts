import { describe, expect, it } from 'vitest';
import {
  applyMatrix,
  circle,
  compose,
  geometryToPath,
  invert,
  parsePath,
  pathLength,
  pill,
  rect,
  resampleClosed,
  rotate,
  sampleOutline,
  scale,
  serializePath,
  signedArea,
  translate,
  type PathCommand,
} from '../src/index.js';

const end = (commands: PathCommand[]) => {
  const last = commands.at(-1);
  return last && last.type !== 'Z' ? { x: last.x, y: last.y } : undefined;
};

describe('matrix', () => {
  it('composes right to left and inverts', () => {
    const m = compose(translate(10, 20), rotate(90), scale(2));
    const p = applyMatrix(m, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(10, 12);
    expect(p.y).toBeCloseTo(22, 12);
    const back = applyMatrix(invert(m), p);
    expect(back.x).toBeCloseTo(1, 12);
    expect(back.y).toBeCloseTo(0, 12);
  });

  it('rotates clockwise on screen (y down)', () => {
    const p = applyMatrix(rotate(90), { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(1, 12);
  });

  it('refuses to invert a singular matrix', () => {
    expect(() => invert(scale(0))).toThrow(RangeError);
  });
});

describe('parsePath', () => {
  it('normalises relative commands and H/V to absolute M/L', () => {
    expect(parsePath('m10 10 h20 v20 h-20 z')).toEqual([
      { type: 'M', x: 10, y: 10 },
      { type: 'L', x: 30, y: 10 },
      { type: 'L', x: 30, y: 30 },
      { type: 'L', x: 10, y: 30 },
      { type: 'Z' },
    ]);
  });

  it('treats extra pairs after M as line-tos and accepts compact numbers', () => {
    expect(parsePath('M0,0 10,0 10-10.5.5.5')).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: -10.5 },
      { type: 'L', x: 0.5, y: 0.5 },
    ]);
  });

  it('reflects control points for S and T', () => {
    const [, , s] = parsePath('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
    expect(s).toMatchObject({ type: 'C', x1: 10, y1: -10, x: 20, y: 0 });
    const quads = parsePath('M0 0 Q5 10 10 0 T20 0');
    expect(quads).toHaveLength(3);
    expect(quads[2]).toMatchObject({ type: 'C', x: 20, y: 0 });
  });

  it('converts arcs to cubics that end at the arc end point', () => {
    const commands = parsePath('M0 50 A50 50 0 0 1 100 50');
    expect(commands.slice(1).every((c) => c.type === 'C')).toBe(true);
    expect(commands.length - 1).toBe(2); // 180° → two 90° segments
    expect(end(commands)).toEqual({ x: 100, y: 50 });
  });

  it('rejects malformed paths', () => {
    expect(() => parsePath('10 10')).toThrow(SyntaxError);
    expect(() => parsePath('M10')).toThrow(SyntaxError);
  });

  it('serialises back to an equivalent path', () => {
    const d = 'M0 0L10 0C10 5 5 10 0 10Z';
    expect(serializePath(parsePath(d))).toBe(d);
  });
});

describe('lengths and sampling', () => {
  it('measures straight and curved paths', () => {
    expect(pathLength('M0 0 h100 v50 h-100 z')).toBeCloseTo(300, 9);
    const r = 40;
    const circlePath = `M${-r} 0 A${r} ${r} 0 1 1 ${r} 0 A${r} ${r} 0 1 1 ${-r} 0 Z`;
    expect(pathLength(circlePath) / (2 * Math.PI * r)).toBeCloseTo(1, 3);
  });

  it('resamples a closed outline to evenly spaced points', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const points = resampleClosed(square, 8);
    expect(points).toHaveLength(8);
    expect(points.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 5],
      [10, 10],
      [5, 10],
      [0, 10],
      [0, 5],
    ]);
  });
});

describe('rect-family shapes', () => {
  it('builds pills and circles as rounded rects', () => {
    expect(pill(0, 0, 200, 60)).toEqual(rect(0, 0, 200, 60, 30));
    expect(circle(5, 5, 10)).toEqual(rect(5, 5, 20, 20, 10));
  });

  it('outlines start at the top centre and run clockwise', () => {
    expect(geometryToPath(rect(50, 50, 100, 40))).toMatch(/^M50 30L100 30/);
    const outline = sampleOutline(rect(0, 0, 100, 40, 8), 64);
    expect(outline).toHaveLength(64);
    expect(outline[0]).toEqual({ x: 0, y: -20 });
    expect(signedArea(outline)).toBeGreaterThan(0);
  });

  it('makes counter-clockwise paths clockwise when sampling', () => {
    const ccw = { kind: 'path', d: 'M0 0 L0 10 L10 10 L10 0 Z' } as const;
    expect(signedArea(sampleOutline(ccw, 16))).toBeGreaterThan(0);
  });

  it('rejects multi-contour outlines with a clear message', () => {
    const twoContours = { kind: 'path', d: 'M0 0h10v10h-10zM20 0h10v10h-10z' } as const;
    expect(() => sampleOutline(twoContours, 16)).toThrow(/exactly one contour/);
  });
});
