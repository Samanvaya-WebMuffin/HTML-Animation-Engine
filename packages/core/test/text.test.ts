import { describe, expect, it } from 'vitest';
import { fontString, layoutText, staggerProgress, type TextMeasurer } from '../src/index.js';

/** Monospace fake: every character is half the font size wide. */
const mono: TextMeasurer = { measure: (text, font) => text.length * font.size * 0.5 };
const font = { family: 'Test', size: 20, lineHeight: 1.5 } as const; // char 10 px, line 30 px

describe('layoutText', () => {
  it('wraps greedily at maxWidth and keeps words whole', () => {
    const layout = layoutText('snap and settle motion', font, { measurer: mono, maxWidth: 140 });
    expect(layout.lines.map((l) => l.text)).toEqual(['snap and', 'settle motion']);
    expect(layout.lineHeight).toBe(30);
    expect(layout.height).toBe(60);
    expect(layout.width).toBe(130);
  });

  it('positions words and numbers them in reading order', () => {
    const layout = layoutText('one two\nthree', font, { measurer: mono });
    expect(layout.words.map((w) => [w.text, w.index, w.line, w.x, w.y, w.width])).toEqual([
      ['one', 0, 0, 0, 0, 30],
      ['two', 1, 0, 40, 0, 30],
      ['three', 2, 1, 0, 30, 50],
    ]);
  });

  it('anchors lines for centre and right alignment', () => {
    const centre = layoutText('ab\nabcd', font, { measurer: mono, align: 'center' });
    expect(centre.lines.map((l) => l.x)).toEqual([-10, -20]);
    const right = layoutText('ab', font, { measurer: mono, align: 'right' });
    expect(right.lines[0]?.x).toBe(-20);
  });

  it('gives an over-long word its own line', () => {
    const layout = layoutText('a extraordinarily b', font, { measurer: mono, maxWidth: 50 });
    expect(layout.lines.map((l) => l.text)).toEqual(['a', 'extraordinarily', 'b']);
  });

  it('drives per-word and per-line stagger', () => {
    const layout = layoutText('one two three\nfour', font, { measurer: mono });
    const at = (t: number) =>
      layout.words.map((w) =>
        staggerProgress(t, w.index, layout.words.length, { start: 1, each: 0.1, duration: 0.2 }),
      );
    expect(at(1.1)).toEqual([0.5, 0, 0, 0].map((v) => expect.closeTo(v, 9)));
    expect(at(1.25)[2]).toBeCloseTo(0.25, 9);
    const lineAt = (t: number) =>
      layout.lines.map((l) =>
        staggerProgress(t, l.index, layout.lines.length, { start: 0, each: 0.5, duration: 0.5 }),
      );
    expect(lineAt(0.5)).toEqual([1, 0]);
  });
});

describe('fontString', () => {
  it('builds a CSS font shorthand', () => {
    expect(
      fontString({ family: 'Inter, sans-serif', size: 48, weight: 700, style: 'italic' }),
    ).toBe('italic 700 48px Inter, sans-serif');
    expect(fontString({ family: 'Inter', size: 12 })).toBe('400 12px Inter');
  });
});
