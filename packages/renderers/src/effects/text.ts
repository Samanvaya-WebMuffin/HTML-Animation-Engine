import {
  clamp,
  groupNode,
  layoutText,
  lerp,
  linear,
  mod,
  progress,
  random,
  rect,
  shapeNode,
  textNode,
  type FontSpec,
  type GroupNode,
  type SceneNode,
  type Shadows,
  type TextMeasurer,
} from '@html-animation-engine/core';
import type { Timing } from './reveal.js';

export interface TypeOnOptions {
  readonly id: string;
  readonly text: string;
  readonly font: FontSpec;
  readonly fill: string;
  /** Shadows or glows beneath the text. */
  readonly shadow?: Shadows;
  /** Top-left of the line box. */
  readonly x: number;
  readonly y: number;
  readonly start: number;
  /** Average typing speed. */
  readonly charsPerSecond: number;
  /** Random variation of each keystroke's timing, 0–1. Default 0.3. */
  readonly jitter?: number;
  readonly seed?: number;
  readonly caret?: {
    readonly color: string;
    readonly width?: number;
    /** Blinks per second once typing has finished (and before it starts). Default 1. */
    readonly blinkRate?: number;
    /** Shadows or glows beneath the caret. */
    readonly glow?: Shadows;
  };
  readonly measurer: TextMeasurer;
}

/** Text that types on one character at a time, with a blinking caret. */
export function typeOn(options: TypeOnOptions): (t: number) => GroupNode {
  const { id, font, measurer, caret } = options;
  const chars = Array.from(options.text);
  const jitter = options.jitter ?? 0.3;
  const step = 1 / options.charsPerSecond;
  // Keystroke times, fixed once: a pure function of the seed.
  const times: number[] = [];
  let clock = options.start;
  chars.forEach((_, i) => {
    clock += step * (1 + jitter * (random(options.seed ?? 0, id, i) * 2 - 1));
    times.push(clock);
  });
  const end = times.at(-1) ?? options.start;
  const widths = chars.map((_, i) => measurer.measure(chars.slice(0, i + 1).join(''), font));
  const lineHeight = font.size * (font.lineHeight ?? 1.2);
  const caretHeight = font.size * 1.05;

  return (t) => {
    let count = 0;
    while (count < times.length && (times[count] ?? Infinity) <= t) count++;
    const children: SceneNode[] = [
      textNode(`${id}-text`, {
        text: chars.slice(0, count).join(''),
        font,
        fill: options.fill,
        ...(options.shadow ? { shadow: options.shadow } : {}),
        transform: { x: options.x, y: options.y },
      }),
    ];
    if (caret) {
      const typing = t >= options.start && t < end;
      const since = t < options.start ? t : t - end;
      const blinkOn = typing || Math.floor(since * (caret.blinkRate ?? 1) * 2) % 2 === 0;
      const width = caret.width ?? Math.max(2, font.size * 0.07);
      const caretX = options.x + (count > 0 ? (widths[count - 1] ?? 0) : 0) + width;
      children.push(
        shapeNode(`${id}-caret`, {
          geometry: rect(caretX, options.y + lineHeight / 2, width, caretHeight),
          fill: caret.color,
          ...(caret.glow ? { shadow: caret.glow } : {}),
          opacity: blinkOn ? 1 : 0,
        }),
      );
    }
    return groupNode(id, children);
  };
}

export interface CounterOptions extends Timing {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly font: FontSpec;
  readonly fill: string;
  /** Anchor point: `x` per `align`, `y` = top of the line box. */
  readonly x: number;
  readonly y: number;
  readonly align?: 'left' | 'center' | 'right';
  readonly decimals?: number;
  /** Thousands separator, e.g. `','`. Default none. */
  readonly separator?: string;
  readonly prefix?: string;
  readonly suffix?: string;
  /** Shadows or glows beneath every character. */
  readonly shadow?: Shadows;
  /**
   * Extra room above and below each digit's clip, px, so glows are not cut
   * off. With padding, the incoming digit is drawn only while rolling. Default 0.
   */
  readonly clipPad?: number;
  readonly measurer: TextMeasurer;
}

/**
 * A number that counts up like an odometer: the lowest digit rolls
 * continuously and each higher digit rolls over as the one below carries.
 */
export function counterRoll(options: CounterOptions): (t: number) => GroupNode {
  const { id, font, measurer, fill } = options;
  const shadow = options.shadow ? { shadow: options.shadow } : {};
  const pad = options.clipPad ?? 0;
  const decimals = options.decimals ?? 0;
  const scale = 10 ** decimals;
  const maxValue = Math.max(Math.abs(options.from), Math.abs(options.to));
  const integerDigits = Math.max(1, Math.floor(Math.log10(Math.max(1, Math.round(maxValue)))) + 1);
  const places = integerDigits + decimals; // digit columns, least significant = place 0
  const digitWidth = Math.max(...'0123456789'.split('').map((d) => measurer.measure(d, font)));
  const lineHeight = font.size * (font.lineHeight ?? 1.2);
  const measure = (s: string) => (s ? measurer.measure(s, font) : 0);

  // Static layout, left to right: prefix, digit columns with separators, suffix.
  type Cell =
    | { kind: 'digit'; place: number; x: number }
    /** `after`: the digit place this separator follows; it shows once that digit does. */
    | { kind: 'static'; text: string; x: number; after?: number };
  const cells: Cell[] = [];
  let cursor = 0;
  if (options.prefix) {
    cells.push({ kind: 'static', text: options.prefix, x: cursor });
    cursor += measure(options.prefix);
  }
  for (let place = places - 1; place >= 0; place--) {
    cells.push({ kind: 'digit', place, x: cursor });
    cursor += digitWidth;
    const integerPlace = place - decimals;
    if (place === decimals && decimals > 0) {
      cells.push({ kind: 'static', text: '.', x: cursor });
      cursor += measure('.');
    } else if (options.separator && integerPlace > 0 && integerPlace % 3 === 0) {
      cells.push({ kind: 'static', text: options.separator, x: cursor, after: place });
      cursor += measure(options.separator);
    }
  }
  if (options.suffix) {
    cells.push({ kind: 'static', text: options.suffix, x: cursor });
    cursor += measure(options.suffix);
  }
  const totalWidth = cursor;
  const align = options.align ?? 'left';
  const originX =
    options.x - (align === 'center' ? totalWidth / 2 : align === 'right' ? totalWidth : 0);

  /** Counter value at `time`, in units of the last digit. */
  const valueAt = (time: number) => {
    const p = progress(time, options.start, options.duration, options.ease ?? linear);
    return Math.round(lerp(options.from, options.to, p) * scale * 1e6) / 1e6;
  };
  /** Carry fraction of digit `place`: how far it has rolled towards the next digit. */
  const carryOf = (value: number, place: number) => {
    const unit = 10 ** place;
    return place === 0 ? value - Math.floor(value) : clamp((value % unit) - (unit - 1));
  };

  return (t) => {
    const value = valueAt(t);
    // How fast the value moves (last-digit units per second), from t alone.
    const rate = Math.abs(valueAt(t + 1 / 240) - valueAt(t - 1 / 240)) * 120;
    const children: SceneNode[] = [];
    for (const cell of cells) {
      if (cell.kind === 'static') {
        if (
          cell.after !== undefined &&
          Math.floor(value / 10 ** cell.after) === 0 &&
          carryOf(value, cell.after) === 0
        ) {
          continue; // separator to the left of the leading digit
        }
        children.push(
          textNode(`${id}-s${cell.x.toFixed(2)}`, {
            text: cell.text,
            font,
            fill,
            ...shadow,
            transform: { x: originX + cell.x, y: options.y },
          }),
        );
        continue;
      }
      const unit = 10 ** cell.place;
      const position = value / unit;
      const digit = Math.floor(position) % 10;
      // A digit changing faster than the eye can follow ticks instead of
      // rolling: the roll fades in as it slows below 8 changes per second.
      const changesPerSecond = rate / unit;
      const carry = carryOf(value, cell.place) * clamp((8 - changesPerSecond) / 4);
      // Leading zeros above the decimal point are blank; a new leading digit
      // rolls in from blank.
      const leading = cell.place > decimals && Math.floor(position) === 0;
      const columnX = originX + cell.x;
      const offset = carry * lineHeight;
      const digitNode = (suffix: string, d: number | '', dy: number) =>
        textNode(`${id}-d${cell.place}${suffix}`, {
          text: String(d),
          font,
          fill,
          ...shadow,
          align: 'center',
          transform: { x: digitWidth / 2, y: dy },
        });
      children.push(
        groupNode(
          `${id}-col${cell.place}`,
          [
            digitNode('a', leading ? '' : digit, -offset),
            ...(pad > 0 && offset === 0
              ? []
              : [digitNode('b', (digit + 1) % 10, lineHeight - offset)]),
          ],
          {
            transform: { x: columnX, y: options.y },
            clip: rect(digitWidth / 2, lineHeight / 2, digitWidth + pad * 2, lineHeight + pad * 2),
          },
        ),
      );
    }
    return groupNode(id, children);
  };
}

export interface MarqueeOptions {
  readonly id: string;
  readonly text: string;
  readonly font: FontSpec;
  readonly fill: string;
  /** Top of the line box. */
  readonly y: number;
  /** Width of the area to fill (usually the frame width). */
  readonly width: number;
  /** Space between repeats, px. */
  readonly gap: number;
  /** Approximate speed in px/s. */
  readonly speed: number;
  /**
   * If set, the speed is adjusted so the marquee repeats exactly every
   * `loopDuration` seconds (for seamless loops).
   */
  readonly loopDuration?: number;
  readonly direction?: 'left' | 'right';
  /** Shadows or glows beneath the text. */
  readonly shadow?: Shadows;
  readonly measurer: TextMeasurer;
}

/** Repeating text that scrolls across the frame. */
export function marquee(options: MarqueeOptions): (t: number) => GroupNode {
  const { id, font, fill, measurer } = options;
  const unit = layoutText(options.text, font, { measurer }).width + options.gap;
  const speed = options.loopDuration
    ? (Math.max(1, Math.round((options.speed * options.loopDuration) / unit)) * unit) /
      options.loopDuration
    : options.speed;
  const copies = Math.ceil(options.width / unit) + 1;
  const sign = options.direction === 'right' ? -1 : 1;
  return (t) => {
    // With a loop duration, wrap time first so the loop point is exact.
    const local = options.loopDuration ? mod(t, options.loopDuration) : t;
    const travelled = (speed * local) % unit;
    const offset = sign > 0 ? -travelled : travelled - unit;
    return groupNode(
      id,
      Array.from({ length: copies + 1 }, (_, i) =>
        textNode(`${id}-${i}`, {
          text: options.text,
          font,
          fill,
          ...(options.shadow ? { shadow: options.shadow } : {}),
          transform: { x: offset + i * unit, y: options.y },
        }),
      ),
    );
  };
}
