import {
  clamp,
  groupNode,
  layoutText,
  progress,
  rect,
  shapeNode,
  textNode,
  type Ease,
  type FontSpec,
  type GroupNode,
  type SceneNode,
  type TextMeasurer,
} from '@html-animation-engine/core';

export interface KineticTextOptions {
  readonly id: string;
  /** The text; words in `*stars*` take `accent`, words in `_underscores_` take `accent2`. */
  readonly text: string;
  readonly font: FontSpec;
  readonly measurer: TextMeasurer;
  /** Anchor of the first line's top (left edge, or centre with `align: 'center'`). */
  readonly x: number;
  readonly y: number;
  readonly align?: 'left' | 'center';
  readonly maxWidth?: number;
  /** Word indices that start a new line. */
  readonly breaks?: readonly number[];
  readonly color: string;
  readonly accent?: string;
  readonly accent2?: string;
  /**
   * A highlighter colour: `_underscored_` words keep the text colour and get
   * this marker swept behind them as they arrive, instead of `accent2`.
   */
  readonly marker?: string;
  /** When the first letter starts arriving. */
  readonly at: number;
  /** Delay between letters (s). Default 0.018. */
  readonly stagger?: number;
  /** How long each letter takes to arrive (s). Default 0.7. */
  readonly duration?: number;
  /** Blur each letter arrives from (px). Default 10. */
  readonly blur?: number;
  /** How far each letter rises into place (px). Default 10. */
  readonly rise?: number;
  readonly ease: Ease;
}

export interface KineticText {
  /** The text at `t`; `exit` (0–1) slides it away with a motion blur. */
  (t: number, exit?: number): GroupNode;
  /** When each word starts arriving (for sound). */
  readonly words: readonly number[];
  /** When the last letter has fully arrived. */
  readonly end: number;
  readonly height: number;
  readonly width: number;
}

/**
 * A headline that arrives letter by letter, each letter coming into focus
 * (from blurred and transparent, rising slightly) on a short stagger. Laid
 * out once, so line breaks never move; letters sit where the whole word's
 * shaping puts them, so kerning is kept. Fully arrived words are drawn as
 * one text node each.
 */
export function kineticText(options: KineticTextOptions): KineticText {
  const stagger = options.stagger ?? 0.018;
  const duration = options.duration ?? 0.7;
  const blur = options.blur ?? 10;
  const rise = options.rise ?? 10;
  const raw = options.text.trim().split(/\s+/);
  const accent = raw.map((w) => /^\*.+\*[.,;:!?]?$/.test(w));
  const accent2 = raw.map((w) => /^_.+_[.,;:!?]?$/.test(w));
  const plain = raw.map((w, k) =>
    accent[k] ? w.replace(/\*/g, '') : accent2[k] ? w.replace(/^_|_(?=[.,;:!?]?$)/g, '') : w,
  );
  const layout = layoutText(
    plain.map((w, k) => (k === 0 ? '' : options.breaks?.includes(k) ? '\n' : ' ') + w).join(''),
    options.font,
    {
      measurer: options.measurer,
      ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      align: options.align ?? 'left',
    },
  );
  let index = 0;
  const words = layout.words.map((w) => {
    const letters = [...w.text].map((ch, k) => ({
      ch,
      dx: options.measurer.measure(w.text.slice(0, k), options.font),
      at: options.at + (index + k) * stagger,
    }));
    index += letters.length + 1;
    return {
      ...w,
      letters,
      color: accent[w.index]
        ? (options.accent ?? options.color)
        : accent2[w.index] && !options.marker
          ? (options.accent2 ?? options.accent ?? options.color)
          : options.color,
      marked: Boolean(options.marker && accent2[w.index]),
    };
  });
  const end = options.at + (index - 1) * stagger + duration;

  const draw = (t: number, exit = 0): GroupNode => {
    const out = clamp(exit);
    const nodes: SceneNode[] = [];
    const markers: SceneNode[] = [];
    for (const w of words) {
      const first = w.letters[0];
      const last = w.letters[w.letters.length - 1];
      if (!first || !last || t < first.at) continue;
      const x = options.x + w.x;
      const y = options.y + w.y;
      if (w.marked && options.marker) {
        // The marker sweeps on behind the word as its letters arrive.
        const sweep = progress(t, first.at, last.at + duration * 0.6 - first.at, options.ease);
        const lh = layout.lineHeight;
        const mw = (w.width + 10) * sweep;
        if (mw > 0.5)
          markers.push(
            shapeNode(`${options.id}-m${w.index}`, {
              geometry: rect(x - 5 + mw / 2, y + lh * 0.55, mw, lh * 0.62, 6),
              fill: options.marker,
            }),
          );
      }
      if (t >= last.at + duration) {
        nodes.push(
          textNode(`${options.id}-w${w.index}`, {
            text: w.text,
            font: options.font,
            fill: w.color,
            transform: { x, y },
          }),
        );
        continue;
      }
      w.letters.forEach((l, k) => {
        const p = progress(t, l.at, duration, options.ease);
        if (p <= 0) return;
        const soft = blur * (1 - p);
        nodes.push(
          textNode(`${options.id}-w${w.index}-${k}`, {
            text: l.ch,
            font: options.font,
            fill: w.color,
            transform: { x: x + l.dx, y: y + rise * (1 - p) },
            opacity: clamp(p * 1.4),
            ...(soft > 0.05 ? { blur: soft } : {}),
          }),
        );
      });
    }
    return groupNode(options.id, [...markers, ...nodes], {
      ...(out > 0
        ? {
            opacity: 1 - out,
            transform: { x: -40 * out * out },
            blur: { x: 28 * out, y: 1 + 2 * out },
          }
        : {}),
    });
  };
  return Object.assign(draw, {
    words: words.map((w) => w.letters[0]?.at ?? options.at),
    end,
    height: layout.height,
    width: layout.width,
  });
}
