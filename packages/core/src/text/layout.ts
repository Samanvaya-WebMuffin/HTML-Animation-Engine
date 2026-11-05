import { fontString, type FontSpec } from './font.js';

/** Measures the advance width of `text` in px. */
export interface TextMeasurer {
  measure(text: string, font: FontSpec): number;
}

/**
 * A measurer backed by Canvas 2D `measureText`, with a cache. Create it after
 * `loadFonts` has resolved, or widths will come from a fallback font.
 */
export function createCanvasMeasurer(doc: Document = document): TextMeasurer {
  const context = doc.createElement('canvas').getContext('2d');
  if (!context) throw new Error('createCanvasMeasurer: Canvas 2D is unavailable.');
  const cache = new Map<string, number>();
  return {
    measure(text, font) {
      const key = `${fontString(font)}|${font.letterSpacing ?? 0}|${text}`;
      let width = cache.get(key);
      if (width === undefined) {
        context.font = fontString(font);
        width = context.measureText(text).width + (font.letterSpacing ?? 0) * [...text].length;
        cache.set(key, width);
      }
      return width;
    },
  };
}

export interface LaidOutWord {
  readonly text: string;
  /** Index across the whole text, in reading order. */
  readonly index: number;
  readonly line: number;
  /** Left edge, relative to the text origin (see `align`). */
  readonly x: number;
  /** Top of the line box. */
  readonly y: number;
  readonly width: number;
}

export interface LaidOutLine {
  readonly text: string;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly words: readonly LaidOutWord[];
}

export interface TextLayout {
  readonly lines: readonly LaidOutLine[];
  readonly words: readonly LaidOutWord[];
  /** Width of the widest line. */
  readonly width: number;
  readonly height: number;
  /** Line box height in px. */
  readonly lineHeight: number;
}

export interface LayoutOptions {
  readonly measurer: TextMeasurer;
  /** Wrap width in px. Default: no wrapping (only explicit `\n` breaks). */
  readonly maxWidth?: number;
  /**
   * Horizontal anchor. `x = 0` is the left edge (`left`), the centre
   * (`center`) or the right edge (`right`) of each line.
   */
  readonly align?: 'left' | 'center' | 'right';
}

/**
 * Lays out text into lines and words with greedy wrapping. Words never
 * break; a word wider than `maxWidth` gets a line of its own.
 */
export function layoutText(text: string, font: FontSpec, options: LayoutOptions): TextLayout {
  const { measurer, maxWidth = Infinity, align = 'left' } = options;
  const lineHeight = font.size * (font.lineHeight ?? 1.2);
  const space = measurer.measure(' ', font);

  const rows: { text: string; width: number }[][] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let row: { text: string; width: number }[] = [];
    let rowWidth = 0;
    for (const word of words) {
      const width = measurer.measure(word, font);
      const next = row.length === 0 ? width : rowWidth + space + width;
      if (row.length > 0 && next > maxWidth) {
        rows.push(row);
        row = [{ text: word, width }];
        rowWidth = width;
      } else {
        row.push({ text: word, width });
        rowWidth = next;
      }
    }
    rows.push(row);
  }

  const lines: LaidOutLine[] = [];
  const allWords: LaidOutWord[] = [];
  rows.forEach((row, lineIndex) => {
    const width = row.reduce((sum, w, i) => sum + w.width + (i > 0 ? space : 0), 0);
    const lineX = align === 'center' ? -width / 2 : align === 'right' ? -width : 0;
    const y = lineIndex * lineHeight;
    let x = lineX;
    const words = row.map((w) => {
      const word: LaidOutWord = {
        text: w.text,
        index: allWords.length,
        line: lineIndex,
        x,
        y,
        width: w.width,
      };
      allWords.push(word);
      x += w.width + space;
      return word;
    });
    lines.push({
      text: row.map((w) => w.text).join(' '),
      index: lineIndex,
      x: lineX,
      y,
      width,
      words,
    });
  });

  return {
    lines,
    words: allWords,
    width: Math.max(0, ...lines.map((line) => line.width)),
    height: lines.length * lineHeight,
    lineHeight,
  };
}
