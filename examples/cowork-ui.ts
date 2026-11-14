/**
 * The Cowork product UI, drawn as plain scene nodes: windows, text, chips,
 * buttons, icons, the cursor and the typing caret. Every component is a pure
 * function of its props (no clocks), so screens built from them are pure
 * functions of time like everything else. Used by the application scenes of
 * the queries video (`cowork-apps.ts`) and the scenes after them.
 *
 * Coordinates are top-left based here (unlike core `rect`, which is centred),
 * because UI is laid out from its top-left corner.
 */
import {
  clamp,
  groupNode,
  lerp,
  mixColors,
  pathGeometry,
  rect,
  shapeNode,
  textNode,
  withAlpha,
  linearGradient,
  type FontSpec,
  type Paint,
  type SceneNode,
  type Shadow,
  type TextMeasurer,
} from '@html-animation-engine/core';
import { elevationShadows, litFill } from '@html-animation-engine/renderers';
import { font, lighting, theme } from './index.js';

const { colors } = theme;

/** UI colours, all mixed from theme tokens. */
export const UI = {
  surface: colors.light,
  /** Sidebars, inputs and quiet panels. */
  wash: mixColors(colors.paper, colors.light, 0.5),
  /** Hairlines and borders. */
  line: mixColors(colors.paper, colors.muted, 0.32),
  text: colors.ink,
  /** Secondary text (darker than `muted`, so it reads on white). */
  sub: mixColors(colors.muted, colors.ink, 0.38),
  faint: colors.muted,
  accent: colors.blue,
  accentSoft: mixColors(colors.blue, colors.light, 0.9),
  accentLine: mixColors(colors.blue, colors.light, 0.65),
  /** Done, checked, high confidence: lime deepened until it reads as text. */
  good: mixColors(colors.lime, colors.ink, 0.5),
  goodSoft: mixColors(colors.lime, colors.light, 0.72),
  alert: colors.alert,
  alertSoft: mixColors(colors.alert, colors.light, 0.9),
  warm: colors.orange,
  warmSoft: mixColors(colors.orange, colors.light, 0.85),
  violet: colors.violet,
  violetSoft: mixColors(colors.violet, colors.light, 0.88),
  pink: colors.pink,
  ink: colors.ink,
  shade: colors.shade,
} as const;

/** UI type. Inter is variable, so every weight comes from the one bundled file. */
export const F = {
  body: { ...font('body', 18), lineHeight: 1.38 },
  bodyStrong: { ...font('body', 18), weight: 600, lineHeight: 1.38 },
  small: { ...font('body', 15), lineHeight: 1.35 },
  smallStrong: { ...font('body', 15), weight: 600, lineHeight: 1.35 },
  tiny: { ...font('body', 13), weight: 600, letterSpacing: 0.3, lineHeight: 1.3 },
  title: { ...font('body', 23), weight: 700, letterSpacing: -0.4, lineHeight: 1.25 },
  heading: { ...font('body', 19), weight: 650, letterSpacing: -0.2, lineHeight: 1.3 },
  ask: { ...font('body', 21), weight: 500, letterSpacing: -0.25, lineHeight: 1.38 },
  mono: { ...font('mono', 16), lineHeight: 1.3 },
  clock: { ...font('mono', 32), weight: 600, letterSpacing: -0.5, lineHeight: 1.1 },
  role: { ...font('body', 17), weight: 650, lineHeight: 1.2 },
} satisfies Record<string, FontSpec>;
export const UI_FONTS: readonly FontSpec[] = Object.values(F);

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** A rounded box from its top-left corner. */
export function box(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  props: {
    fill?: Paint;
    stroke?: { color: string; width: number; dash?: readonly number[] };
    shadow?: Shadow | readonly Shadow[];
    opacity?: number;
  },
): SceneNode {
  return shapeNode(id, { geometry: rect(x + w / 2, y + h / 2, w, h, r), ...props });
}

/** Text whose line box starts at (x, y). */
export function label(
  id: string,
  text: string,
  x: number,
  y: number,
  f: FontSpec,
  fill: string = UI.text,
  options: { align?: 'left' | 'center' | 'right'; maxWidth?: number; opacity?: number } = {},
): SceneNode {
  return textNode(id, { text, font: f, fill, transform: { x, y }, ...options });
}

/** Line icons on a 24 px grid (drawn with round 2 px strokes unless filled). */
const ICONS = {
  search: 'M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13ZM15.4 15.4L20 20',
  lock: 'M7 11h10a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 17 20H7a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 7 11ZM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  check: 'M5.5 12.5l4 4L18.5 7.5',
  mail: 'M5 6h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM4.5 7.5l7.5 5.5l7.5-5.5',
  chat: 'M5.5 5h13A1.5 1.5 0 0 1 20 6.5v8a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3.5V16h-1A1.5 1.5 0 0 1 4 14.5v-8A1.5 1.5 0 0 1 5.5 5Z',
  file: 'M7 3.5h6.5L18 8v12.5H7ZM13.5 3.5V8H18M9.5 12.5h6M9.5 16h6',
  refresh: 'M18.5 12a6.5 6.5 0 1 1-1.9-4.6M18.5 4.5v4h-4',
  share: 'M12 14.5V4.5M8.5 8L12 4.5L15.5 8M6 12v7h12v-7',
  send: 'M12 18.5V6M6.5 11.5L12 6l5.5 5.5',
  chevron: 'M7.5 10l4.5 4.5l4.5-4.5',
  link: 'M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1',
  clock: 'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16ZM12 8v4.5l3 2',
  paperclip:
    'M15.5 7.5l-6.2 6.2a1.8 1.8 0 0 0 2.5 2.5l6.4-6.4a3.5 3.5 0 0 0-5-5l-6.4 6.4a5.2 5.2 0 0 0 7.4 7.4l5.3-5.3',
  plus: 'M12 5.5v13M5.5 12h13',
  doc: 'M6.5 3.5h11v17h-11ZM9 8h6M9 11.5h6M9 15h4',
} as const;
export type IconName = keyof typeof ICONS;

/** A line icon centred on (x, y), `size` px across. */
export function icon(
  id: string,
  name: IconName,
  x: number,
  y: number,
  size: number,
  color: string,
  options: { width?: number; opacity?: number } = {},
): SceneNode {
  const s = size / 24;
  return shapeNode(id, {
    geometry: pathGeometry(ICONS[name]),
    stroke: {
      color,
      width: (options.width ?? 2) / s,
      cap: 'round',
      join: 'round',
    },
    transform: { x, y, scale: s, originX: 12, originY: 12 },
    opacity: options.opacity,
  });
}

/** The Cowork mark: four rounded squares, the company's knowledge together. */
export const MARK_COLORS = [colors.blue, colors.violet, colors.pink, colors.orange] as const;
export function mark(id: string, x: number, y: number, size: number, opacity = 1): SceneNode {
  const cell = size * 0.44;
  const gap = size * 0.12;
  return groupNode(
    id,
    MARK_COLORS.map((c, k) => {
      const [col, row] = [k % 2, Math.floor(k / 2)];
      const cy = (row - 0.5) * (cell + gap);
      return shapeNode(`${id}-${k}`, {
        geometry: rect((col - 0.5) * (cell + gap), cy, cell, cell, cell * 0.3),
        fill: litFill(lighting, c, { y: cy, height: cell }),
      });
    }),
    { transform: { x, y }, opacity },
  );
}

/** The macOS-style arrow pointer, its tip at (x, y). `press` 0–1 squeezes it for a click. */
export function cursor(id: string, x: number, y: number, press = 0, opacity = 1): SceneNode {
  return shapeNode(id, {
    geometry: pathGeometry('M0 0L0 19.5L4.6 15.2L7.7 22.2L11 20.8L7.9 13.9L14.2 13.9Z'),
    fill: UI.ink,
    stroke: { color: UI.surface, width: 1.6, join: 'round' },
    shadow: [
      { x: 0, y: 1.5, blur: 3, color: withAlpha(UI.shade, 0.35) },
      { x: 0, y: 4, blur: 8, color: withAlpha(UI.shade, 0.18) },
    ],
    transform: { x, y, scale: 1 - 0.12 * clamp(press) },
    opacity,
  });
}

/** A click: how far the press is (0 up → 1 down → 0) at `t` for a click at `at`. */
export function pressAt(t: number, at: number): number {
  const d = t - at;
  if (d < -0.06 || d > 0.16) return 0;
  return d < 0 ? 1 + d / 0.06 : 1 - d / 0.16;
}

/** The soft ring a click leaves, for the 0.4 s after it. */
export function clickRing(
  id: string,
  x: number,
  y: number,
  t: number,
  at: number,
): SceneNode | null {
  const p = (t - at) / 0.4;
  if (p <= 0 || p >= 1) return null;
  const r = lerp(6, 22, 1 - (1 - p) ** 3);
  return box(id, x - r, y - r, 2 * r, 2 * r, r, {
    stroke: { color: withAlpha(UI.accent, 0.5 * (1 - p)), width: 2 },
  });
}

/** The typing caret: solid while typing, blinking (every 0.53 s) when idle since `idle`. */
export function caret(
  id: string,
  x: number,
  y: number,
  h: number,
  t: number,
  idle: number,
  color: string = UI.accent,
): SceneNode | null {
  if (t >= idle && Math.floor((t - idle) / 0.53) % 2 === 1) return null;
  return box(id, x, y, 2, h, 1, { fill: color });
}

/** A spinner (a 3/4 ring turning once every 0.9 s), centred on (x, y). */
export function spinner(id: string, x: number, y: number, r: number, t: number, color: string) {
  const a = (t / 0.9) * 360;
  return groupNode(
    id,
    [
      box(`${id}-track`, -r, -r, 2 * r, 2 * r, r, {
        stroke: { color: withAlpha(color, 0.18), width: 2.5 },
      }),
      shapeNode(`${id}-arc`, {
        geometry: pathGeometry(`M0 ${-r}A${r} ${r} 0 1 1 ${-r} 0`),
        stroke: { color, width: 2.5, cap: 'round' },
      }),
    ],
    { transform: { x, y, rotation: a } },
  );
}

/** A moving highlight for loading placeholders: where the band is (0–1) at `t`. */
export function shimmer(t: number, period = 1.3): number {
  return (((t % period) + period) % period) / period;
}

/** A grey placeholder line with a shimmer band crossing it. */
export function skeleton(id: string, x: number, y: number, w: number, h: number, t: number) {
  const s = shimmer(t);
  const bx = lerp(-0.4, 1.4, s) * w;
  return box(id, x, y, w, h, h / 2, {
    fill: linearGradient(x + bx - 90, 0, x + bx + 90, 0, [
      { offset: 0, color: UI.wash },
      { offset: 0.5, color: mixColors(UI.wash, UI.line, 0.6) },
      { offset: 1, color: UI.wash },
    ]),
  });
}

/** An avatar: a coloured disc with a person glyph. */
export function avatar(id: string, x: number, y: number, r: number, color: string, opacity = 1) {
  const s = r / 16;
  return groupNode(
    id,
    [
      box(`${id}-disc`, -r, -r, 2 * r, 2 * r, r, {
        fill: litFill(lighting, color, { y: 0, height: 2 * r }),
      }),
      shapeNode(`${id}-glyph`, {
        geometry: pathGeometry(
          'M0 -9.5a4.6 4.6 0 1 1 0 9.2a4.6 4.6 0 1 1 0-9.2ZM-8.2 9.6a8.2 7 0 0 1 16.4 0Z',
        ),
        fill: withAlpha(UI.surface, 0.92),
        transform: { scale: s },
      }),
    ],
    { transform: { x, y }, opacity },
  );
}

/** A check that draws itself (`p` 0–1) in a filled disc. */
export function checkDisc(id: string, x: number, y: number, r: number, p: number, color = UI.good) {
  if (p <= 0)
    return box(id, x - r, y - r, 2 * r, 2 * r, r, { stroke: { color: UI.line, width: 1.6 } });
  const fill = clamp(p * 2.5);
  const draw = clamp((p - 0.2) / 0.8);
  // The check is drawn as a 3-point stroke; `draw` reveals it along its length.
  const [a, b, c] = [
    [-0.42, 0.02],
    [-0.12, 0.32],
    [0.44, -0.3],
  ] as const;
  const first = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const total = first + Math.hypot(c[0] - b[0], c[1] - b[1]);
  const along = draw * total;
  const pts: [number, number][] = [[a[0], a[1]]];
  if (along <= first) {
    const f = along / first;
    pts.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f)]);
  } else {
    const f = (along - first) / (total - first);
    pts.push([b[0], b[1]], [lerp(b[0], c[0], f), lerp(b[1], c[1], f)]);
  }
  return groupNode(
    id,
    [
      box(`${id}-disc`, -r, -r, 2 * r, 2 * r, r, { fill: color, opacity: fill }),
      ...(draw > 0
        ? [
            shapeNode(`${id}-tick`, {
              geometry: pathGeometry(
                pts
                  .map(
                    ([px, py], k) =>
                      `${k ? 'L' : 'M'}${(px * r).toFixed(2)} ${(py * r).toFixed(2)}`,
                  )
                  .join(''),
              ),
              stroke: {
                color: UI.surface,
                width: Math.max(1.6, r * 0.24),
                cap: 'round',
                join: 'round',
              },
            }),
          ]
        : []),
    ],
    {
      transform: {
        x,
        y,
        scale: lerp(0.86, 1, clamp(p * 3)) + 0.08 * Math.sin(Math.PI * clamp(p * 2)),
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Components that need text measured
// ---------------------------------------------------------------------------

export interface ChipStyle {
  readonly fill: string;
  readonly color: string;
  readonly font?: FontSpec;
  readonly icon?: IconName;
  readonly stroke?: string;
  readonly height?: number;
}

export interface Ui {
  readonly measurer: TextMeasurer;
  readonly measure: (text: string, f: FontSpec) => number;
  /** A pill with optional leading icon; returns the node and its width. */
  chip(
    id: string,
    text: string,
    x: number,
    y: number,
    style: ChipStyle,
    opacity?: number,
  ): {
    node: SceneNode;
    w: number;
  };
  /** A button (`primary` filled with the accent, else outlined); `press` 0–1 darkens and sinks it. */
  button(
    id: string,
    text: string,
    x: number,
    y: number,
    options?: { primary?: boolean; icon?: IconName; press?: number; hover?: number; h?: number },
  ): { node: SceneNode; w: number };
  /** How many characters of `text` fit in `maxWidth` (for ellipsis-free cropping). */
  fit(text: string, f: FontSpec, maxWidth: number): string;
}

export function createUi(measurer: TextMeasurer): Ui {
  const measure = (text: string, f: FontSpec) => measurer.measure(text, f);
  return {
    measurer,
    measure,
    chip(id, text, x, y, style, opacity = 1) {
      const f = style.font ?? F.smallStrong;
      const h = style.height ?? 28;
      const pad = 11;
      const iconW = style.icon ? 20 : 0;
      const w = Math.round(measure(text, f) + pad * 2 + iconW);
      const ty = y + (h - f.size * (f.lineHeight ?? 1.2)) / 2;
      const children: SceneNode[] = [
        box(`${id}-bg`, x, y, w, h, h / 2, {
          fill: style.fill,
          stroke: style.stroke ? { color: style.stroke, width: 1 } : undefined,
        }),
      ];
      if (style.icon)
        children.push(icon(`${id}-icon`, style.icon, x + pad + 7, y + h / 2, 15, style.color));
      children.push(label(`${id}-text`, text, x + pad + iconW, ty, f, style.color));
      return { node: groupNode(id, children, { opacity }), w };
    },
    button(id, text, x, y, options = {}) {
      const f = F.bodyStrong;
      const h = options.h ?? 42;
      const iconW = options.icon ? 24 : 0;
      const w = Math.round(measure(text, f) + 36 + iconW);
      const press = clamp(options.press ?? 0);
      const hover = clamp(options.hover ?? 0);
      const primary = options.primary ?? false;
      const base = primary ? UI.accent : UI.surface;
      const fill = mixColors(base, UI.ink, 0.06 * hover + 0.16 * press);
      const color = primary ? UI.surface : UI.text;
      const ty = y + (h - f.size * (f.lineHeight ?? 1.2)) / 2;
      const children: SceneNode[] = [
        box(`${id}-bg`, x, y, w, h, 12, {
          fill: primary ? litFill(lighting, fill, { y: y + h / 2, height: h }) : fill,
          stroke: primary ? undefined : { color: UI.line, width: 1.2 },
          shadow: primary
            ? elevationShadows(lighting, 'low', { strength: 0.45 * (1 - press) })
            : undefined,
        }),
      ];
      if (options.icon)
        children.push(icon(`${id}-icon`, options.icon, x + 18 + 9, y + h / 2, 17, color));
      children.push(label(`${id}-text`, text, x + 18 + iconW, ty, f, color));
      return {
        node: groupNode(id, children, {
          transform: {
            x: x + w / 2,
            y: y + h / 2 + press * 1,
            scale: 1 - 0.02 * press,
            originX: x + w / 2,
            originY: y + h / 2,
          },
        }),
        w,
      };
    },
    fit(text, f, maxWidth) {
      if (measure(text, f) <= maxWidth) return text;
      let n = text.length;
      while (n > 0 && measure(`${text.slice(0, n).trimEnd()}…`, f) > maxWidth) n--;
      return `${text.slice(0, n).trimEnd()}…`;
    },
  };
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

export interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly r?: number;
}

/**
 * An app window: a white rounded panel with a soft elevation, its content
 * clipped to it. Children are in the window's own coordinates (0, 0 = top left).
 */
export function windowNode(
  id: string,
  frame: Frame,
  children: readonly (SceneNode | null)[],
  options: {
    opacity?: number;
    lift?: number;
    /** The panel's outline while it opens (centre, size, radius in local px); default the frame. */
    shape?: { cx: number; cy: number; w: number; h: number; r: number };
    /** Opacity of the content alone (the panel stays). */
    content?: number;
  } = {},
): SceneNode {
  const { x, y, w, h } = frame;
  const r = frame.r ?? 24;
  const s = options.shape ?? { cx: w / 2, cy: h / 2, w, h, r };
  const outline = rect(s.cx, s.cy, s.w, s.h, s.r);
  const content = options.content ?? 1;
  return groupNode(
    id,
    [
      shapeNode(`${id}-panel`, {
        geometry: outline,
        fill: UI.surface,
        shadow: elevationShadows(lighting, 'mid', { strength: 0.42, lift: options.lift ?? 1 }),
      }),
      ...(content > 0
        ? [
            groupNode(
              `${id}-content`,
              children.filter((c): c is SceneNode => c !== null),
              { clip: outline, opacity: content },
            ),
          ]
        : []),
      shapeNode(`${id}-edge`, {
        geometry: outline,
        stroke: { color: withAlpha(UI.shade, 0.07), width: 1 },
      }),
    ],
    { transform: { x, y }, opacity: options.opacity },
  );
}

/** A thin horizontal rule. */
export function rule(id: string, x: number, y: number, w: number, color: string = UI.line) {
  return box(id, x, y, w, 1, 0, { fill: color });
}

/** Thousands separators, the same on every machine (no locale). */
export function grouped(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** mm:ss from seconds. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
