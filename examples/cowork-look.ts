/**
 * The Cowork look, on WebMuffin's Soft Calm design system: pillowy Cloud
 * cards with hairline edges and wide faint shadows, pill buttons and tags,
 * one violet for action and AI, natural tints for meaning, Sora headlines,
 * Newsreader subtext, Inter UI and lowercase mono metadata. Every colour
 * comes from the Cowork theme's named component tokens; every icon from one
 * 1.5 px line set. Components are pure functions of their props, positioned
 * by their centre unless noted.
 */
import {
  clamp,
  coworkTheme,
  layoutText,
  softCalmRadii,
  groupNode,
  lerp,
  linearGradient,
  mixColors,
  pathGeometry,
  rect,
  shapeNode,
  textNode,
  withAlpha,
  type FontSpec,
  type SceneNode,
  type TextMeasurer,
} from '@html-animation-engine/core';
import {
  elevationShadows,
  glowShadows,
  kineticText,
  lightSweep,
  litFill,
  litGradient,
  type KineticText,
} from '@html-animation-engine/renderers';

export const look = coworkTheme;
export const C = coworkTheme.components;
export const P = coworkTheme.colors;
/** Cowork's purple as the chrome ball wears it, and the reveal's name with it. */
export const BALL_PURPLE = mixColors(C.meet.violet, C.brand.deep, 0.25);
export const lighting = coworkTheme.lighting;
const { type } = coworkTheme;

/** A theme type token at a size. */
export function face(
  token: keyof typeof type,
  size: number,
  extra: Partial<FontSpec> = {},
): FontSpec {
  return { ...type[token], size, ...extra };
}

/** Corner radii: chips, inputs, cards (buttons and tags are pills). */
export const R = softCalmRadii;

/**
 * The type scale: Sora titles (never heavier than 500), Newsreader subtext
 * (italic for its emphasised words), Inter for UI and reading, lowercase
 * JetBrains Mono for metadata, scores and clocks.
 */
export const T = {
  headline: face('headline', 60),
  /** Headline cards: a Sora title over a Newsreader subtext. */
  cardTitle: face('headline', 46, { letterSpacing: -1 }),
  cardSub: face('subtext', 30, { lineHeight: 1.28 }),
  display: face('display', 76),
  title: face('title', 24),
  heading: face('title', 19, { letterSpacing: -0.2 }),
  subtext: face('subtext', 32),
  subtextItalic: face('subtext', 32, { style: 'italic' }),
  body: face('body', 18),
  small: face('body', 15),
  label: face('label', 14),
  button: face('label', 16),
  /** Lowercase metadata and eyebrows (no all-caps). */
  meta: face('mono', 13, { letterSpacing: 0.2 }),
  /** Kept for callers of the old caps style: now the lowercase mono eyebrow. */
  caps: face('mono', 13, { letterSpacing: 0.2 }),
  mono: face('mono', 16),
  clock: face('mono', 30, { weight: 500, letterSpacing: -0.5 }),
} as const;
export const LOOK_FONTS: readonly FontSpec[] = Object.values(T);

// ---------------------------------------------------------------------------
// Icons: one line set, 24 px grid, 1.5 px strokes
// ---------------------------------------------------------------------------

const ICONS = {
  doc: 'M7 3.5h7l4 4v13H7ZM14 3.5v4h4M9.5 12h6M9.5 15.5h6',
  sheet: 'M4.5 5.5h15v13h-15ZM4.5 10h15M4.5 14.5h15M10 5.5v13',
  chat: 'M5.5 5h13A1.5 1.5 0 0 1 20 6.5v8a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3.5V16h-1A1.5 1.5 0 0 1 4 14.5v-8A1.5 1.5 0 0 1 5.5 5Z',
  chart: 'M4.5 19.5h15M7.5 16v-4M12 16V8M16.5 16v-6',
  mail: 'M5 6h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM4.5 7.5l7.5 5.5l7.5-5.5',
  person: 'M12 4.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7ZM5 19.5a7 6 0 0 1 14 0',
  people:
    'M9 5.5a3 3 0 1 1 0 6a3 3 0 1 1 0-6ZM3.5 18.5a5.5 5 0 0 1 11 0M16 6a2.5 2.5 0 1 1 0 5M17 13.5a4.5 4.5 0 0 1 3.5 4.5',
  lock: 'M7 11h10a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 17 20H7a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 7 11ZM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  check: 'M5.5 12.5l4 4L18.5 7.5',
  shield: 'M12 3.5l7 2.5v5.5c0 4.5-3 7.5-7 9c-4-1.5-7-4.5-7-9V6ZM9 12l2 2l4-4',
  search: 'M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13ZM15.4 15.4L20 20',
  folder:
    'M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z',
  calendar: 'M5 6h14v13.5H5ZM5 10h14M9 4v4M15 4v4',
  clock: 'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16ZM12 8v4.5l3 2',
  insight:
    'M12 3.5a5.5 5.5 0 0 1 3.3 9.9c-.8.6-1.3 1.4-1.3 2.4v.7h-4v-.7c0-1-.5-1.8-1.3-2.4A5.5 5.5 0 0 1 12 3.5ZM10 19.5h4',
  link: 'M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1',
  refresh: 'M18.5 12a6.5 6.5 0 1 1-1.9-4.6M18.5 4.5v4h-4',
  share: 'M12 14.5V4.5M8.5 8L12 4.5L15.5 8M6 12v7h12v-7',
  send: 'M12 18.5V6M6.5 11.5L12 6l5.5 5.5',
  plus: 'M12 5.5v13M5.5 12h13',
  layers: 'M12 4l8.5 4.5L12 13L3.5 8.5ZM3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5',
  /** Level 1: quick. */
  bolt: 'M13.5 3.5L6 13.5h5.5L10.5 20.5L18 10.5h-5.5Z',
  /** Level 3: planned (steps). */
  plan: 'M9.5 6.5h9.5M9.5 12h9.5M9.5 17.5h9.5M5 5.5l1 1l2-2M5 11l1 1l2-2M5 16.5l1 1l2-2',
  sparkle: 'M12 3.5l1.6 5.4l5.4 1.6l-5.4 1.6L12 17.5l-1.6-5.4L5 10.5l5.4-1.6Z',
  /** Microsoft 365, as a category: four app tiles (a plain line icon, not the brand's mark). */
  apps: 'M5 5h5.5v5.5H5ZM13.5 5H19v5.5h-5.5ZM5 13.5h5.5V19H5ZM13.5 13.5H19V19h-5.5Z',
  /** Google Workspace, as a category: documents in the cloud (not the brand's mark). */
  cloud:
    'M7.5 18.5h9.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.6a4.5 4.5 0 0 0 .5 8.9ZM10 14.5h5M10 12h3',
  /** Slack, as a category: a channel's hash (not the brand's mark). */
  hash: 'M9.5 4.5L8 19.5M16 4.5l-1.5 15M5 9h14.5M4.5 15H19',
  /** A PDF: a page with a banner across it. */
  pdf: 'M7 3.5h7l4 4v13H7ZM14 3.5v4h4M5 11.5h9v5H5Z',
  /** Slides: a screen on a stand. */
  slides: 'M3.5 5h17M5 5v10h14V5M12 15v3.5M9 20.5l3-2l3 2',
} as const;
export type IconName = keyof typeof ICONS;

/** A line icon centred on (x, y), `size` px across, strokes `width` px. */
export function icon(
  id: string,
  name: IconName,
  x: number,
  y: number,
  size: number,
  color: string,
  width = 1.5,
): SceneNode {
  const s = size / 24;
  return shapeNode(id, {
    geometry: pathGeometry(ICONS[name]),
    stroke: { color, width: width / s, cap: 'round', join: 'round' },
    transform: { x, y, scale: s, originX: 12, originY: 12 },
  });
}

// ---------------------------------------------------------------------------
// Meanings: each helper colour stands for one thing
// ---------------------------------------------------------------------------

export type Meaning =
  'knowledge' | 'people' | 'insight' | 'time' | 'friction' | 'outcome' | 'brand';

/** The tint, ink (text-safe), fill and glow of a meaning. */
export function tone(meaning: Meaning): { bg: string; fg: string; fill: string; glow: string } {
  switch (meaning) {
    case 'knowledge':
      return { bg: C.source.bg, fg: C.source.fg, fill: C.source.icon, glow: C.source.glow };
    case 'people':
      return { bg: C.person.bg, fg: C.person.fg, fill: C.person.fill, glow: C.person.glow };
    case 'insight':
      return { bg: C.insight.bg, fg: C.insight.fg, fill: C.insight.fill, glow: C.insight.marker };
    case 'time':
      return { bg: C.time.bg, fg: C.time.fg, fill: C.time.ring, glow: C.time.track };
    case 'friction':
      return { bg: C.friction.bg, fg: C.friction.fg, fill: C.friction.fill, glow: C.friction.glow };
    case 'outcome':
      return { bg: C.outcome.bg, fg: C.outcome.fg, fill: C.outcome.fill, glow: C.outcome.glow };
    default:
      return { bg: C.brand.tint, fg: C.brand.deep, fill: C.brand.fill, glow: C.brand.glow };
  }
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/**
 * A Cloud card: a hairline edge and a wide, faint shadow for its height
 * (`lift` 0 = resting, 1 = mid, 2 = high), pillowy corners. Content is drawn
 * by the caller in the card's own coordinates (0, 0 = its centre).
 */
export function paperCard(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: {
    lift?: 0 | 1 | 2;
    radius?: number;
    children?: readonly SceneNode[];
    opacity?: number;
    rotation?: number;
    blur?: number;
  } = {},
): SceneNode {
  const level = (['low', 'mid', 'high'] as const)[options.lift ?? 1] ?? 'mid';
  const r = options.radius ?? Math.min(R.card, Math.min(w, h) / 4);
  return groupNode(
    id,
    [
      shapeNode(`${id}-paper`, {
        geometry: rect(0, 0, w, h, r),
        fill: litFill(lighting, C.surface.paper, { y: 0, height: h }),
        stroke: { color: C.stroke.hairline, width: 1 },
        shadow: elevationShadows(lighting, level),
      }),
      ...(options.children ?? []),
    ],
    {
      transform: { x, y, rotation: options.rotation ?? 0 },
      ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
      ...(options.blur ? { blur: options.blur } : {}),
    },
  );
}

/** Placeholder lines of text on paper (for fragments seen at a glance). */
export function textLines(
  id: string,
  x: number,
  y: number,
  widths: readonly number[],
  options: { gap?: number; height?: number; color?: string } = {},
): SceneNode {
  const gap = options.gap ?? 14;
  const h = options.height ?? 6;
  return groupNode(
    id,
    widths.map((w, k) =>
      shapeNode(`${id}-${k}`, {
        geometry: rect(x + w / 2, y + k * gap, w, h, h / 2),
        fill: options.color ?? C.stroke.strong,
      }),
    ),
  );
}

/** Frosted glass: translucent Cloud with a bright hairline, over whatever light is behind. */
export function glassPanel(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  children: readonly SceneNode[] = [],
  radius: number = R.card,
): SceneNode {
  return groupNode(
    id,
    [
      shapeNode(`${id}-glass`, {
        geometry: rect(0, 0, w, h, radius),
        fill: linearGradient(0, -h / 2, 0, h / 2, [
          withAlpha(C.surface.glass, 0.82),
          withAlpha(C.surface.glass, 0.66),
        ]),
        stroke: { color: withAlpha(C.surface.glass, 0.95), width: 1.2 },
        shadow: elevationShadows(lighting, 'mid', { strength: 0.8 }),
      }),
      ...children,
    ],
    { transform: { x, y } },
  );
}

/**
 * A raised puck: a white disc with an edge highlight and a soft contact
 * shadow, holding an icon on a tint of its meaning.
 */
export function puck(
  id: string,
  x: number,
  y: number,
  r: number,
  name: IconName,
  meaning: Meaning,
): SceneNode {
  const t = tone(meaning);
  return groupNode(
    id,
    [
      shapeNode(`${id}-disc`, {
        geometry: rect(0, 0, 2 * r, 2 * r, r),
        fill: litGradient(lighting, C.surface.raised, -r, r, { sheen: 0.2, shade: 0.06 }),
        stroke: { color: C.stroke.hairline, width: 1 },
        shadow: elevationShadows(lighting, 'mid'),
      }),
      shapeNode(`${id}-tint`, { geometry: rect(0, 0, 1.25 * r, 1.25 * r, 0.625 * r), fill: t.bg }),
      icon(`${id}-icon`, name, 0, 0, r * 0.82, t.fill, 1.6),
    ],
    { transform: { x, y } },
  );
}

/**
 * The Cowork app icon: an electric-violet tile with a glass highlight and a
 * soft violet glow, holding the mark (knowledge, people, insight, outcomes).
 */
export function markTile(
  id: string,
  x: number,
  y: number,
  size: number,
  options: { glow?: number } = {},
): SceneNode {
  const r = size * 0.26;
  const cell = size * 0.22;
  const gap = size * 0.06;
  const colors = [C.mark.knowledge, C.mark.people, C.mark.insight, C.mark.outcome];
  return groupNode(
    id,
    [
      shapeNode(`${id}-tile`, {
        geometry: rect(0, 0, size, size, r),
        fill: linearGradient(-size / 2, -size / 2, size / 2, size / 2, [
          P.violet400,
          P.violet500,
          P.violet700,
        ]),
        shadow: [
          ...glowShadows(lighting, C.brand.glow, {
            radius: size * 0.35,
            strength: options.glow ?? 0.9,
          }),
          ...elevationShadows(lighting, 'high', { strength: 0.9 }),
        ],
      }),
      // Glass: light across the top half.
      shapeNode(`${id}-gloss`, {
        geometry: rect(0, 0, size, size, r),
        fill: linearGradient(0, -size / 2, 0, size * 0.1, [
          withAlpha(P.white, 0.28),
          withAlpha(P.white, 0),
        ]),
      }),
      shapeNode(`${id}-rim`, {
        geometry: rect(0, 0, size - 1, size - 1, r - 0.5),
        stroke: { color: withAlpha(P.white, 0.35), width: 1 },
      }),
      ...colors.map((c, k) => {
        const [col, row] = [k % 2, Math.floor(k / 2)];
        const cy = (row - 0.5) * (cell + gap);
        return shapeNode(`${id}-m${k}`, {
          geometry: rect((col - 0.5) * (cell + gap), cy, cell, cell, cell * 0.3),
          fill: litFill(lighting, c, { y: cy, height: cell }, { sheen: 0.25, shade: 0.05 }),
          shadow: { x: 0, y: 1, blur: 3, color: withAlpha(P.violet800, 0.3) },
        });
      }),
    ],
    { transform: { x, y } },
  );
}

/** A sand time ring: progress round a track, the time in mono digits in the middle. */
export function timeRing(
  id: string,
  x: number,
  y: number,
  r: number,
  p: number,
  label: string,
  /** Time while it runs; an outcome (sage) once the work is done. */
  meaning: 'time' | 'outcome' = 'time',
  /** A colour that overrides the meaning's (arc and label; the track is its tint). */
  color?: string,
): SceneNode {
  const base = tone(meaning);
  const t = color ? { ...base, fill: color, fg: color, glow: withAlpha(color, 0.2) } : base;
  const a = Math.min(clamp(p), 0.9999) * 2 * Math.PI;
  const end = { x: r * Math.sin(a), y: -r * Math.cos(a) };
  return groupNode(
    id,
    [
      shapeNode(`${id}-track`, {
        geometry: rect(0, 0, 2 * r, 2 * r, r),
        stroke: { color: t.glow, width: 5 },
      }),
      ...(p > 0
        ? [
            shapeNode(`${id}-arc`, {
              geometry: pathGeometry(
                `M0 ${-r}A${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${end.x} ${end.y}`,
              ),
              stroke: { color: t.fill, width: 5, cap: 'round' },
            }),
          ]
        : []),
      textNode(`${id}-t`, {
        text: label,
        font: T.clock,
        fill: t.fg,
        align: 'center',
        transform: { y: -20 },
      }),
    ],
    { transform: { x, y } },
  );
}

// ---------------------------------------------------------------------------
// Components that measure text
// ---------------------------------------------------------------------------

export interface Look {
  readonly measurer: TextMeasurer;
  /** A pill in a meaning's tint, with optional icon; positioned by its left edge and vertical centre. */
  chip(
    id: string,
    text: string,
    x: number,
    y: number,
    meaning: Meaning,
    options?: { icon?: IconName; font?: FontSpec },
  ): { node: SceneNode; w: number };
  /**
   * A pill button, positioned by its left edge and vertical centre: `primary`
   * is solid Index Violet (the one key action on a screen), `soft` Violet
   * Haze, `secondary` hairline Cloud, `link` violet text with an arrow.
   */
  button(
    id: string,
    text: string,
    x: number,
    y: number,
    options?: {
      primary?: boolean;
      variant?: ButtonVariant;
      icon?: IconName;
      press?: number;
      /** A shimmer crossing the button (0–1; none outside that). */
      shimmer?: number;
      /** A little star twinkling at the top right corner (0–1; none outside that). */
      sparkle?: number;
    },
  ): { node: SceneNode; w: number };
  /** A text input (left edge, vertical centre): hairline, a violet-200 ring when focused, a caret. */
  input(
    id: string,
    x: number,
    y: number,
    w: number,
    options?: {
      text?: string;
      placeholder?: string;
      icon?: IconName;
      focus?: number;
      caret?: boolean;
      h?: number;
    },
  ): { node: SceneNode; w: number; h: number };
  /** A status line: a dot in the meaning's colour, then the text (left edge, vertical centre). */
  status(id: string, text: string, x: number, y: number, meaning: Meaning): SceneNode;
  /** A relevance score in mono on Violet Haze (left edge, vertical centre). */
  score(id: string, value: string, x: number, y: number): { node: SceneNode; w: number };
  /**
   * A search result card (left/top corner): a document tile, title, mono
   * metadata, an AI summary with the passage that answered gently highlighted
   * in sand and a citation, tags, and a score.
   */
  resultCard(
    id: string,
    x: number,
    y: number,
    w: number,
    content: {
      title: string;
      meta: string;
      before: string;
      passage: string;
      after: string;
      cite?: number;
      tags?: readonly [string, Meaning][];
      score?: string;
      highlight?: number;
    },
  ): { node: SceneNode; h: number };
  /** A source citation: number, icon and label. */
  citation(
    id: string,
    n: number,
    name: IconName,
    text: string,
    x: number,
    y: number,
  ): { node: SceneNode; w: number };
  /** A monogram avatar in the people family. */
  avatar(id: string, initials: string, x: number, y: number, r: number, color: string): SceneNode;
}

export type ButtonVariant = 'primary' | 'soft' | 'secondary' | 'link';

export function createLook(measurer: TextMeasurer): Look {
  const measure = (text: string, f: FontSpec) => measurer.measure(text, f);
  const textTop = (f: FontSpec) => -(f.size * (f.lineHeight ?? 1.2)) / 2;
  return {
    measurer,
    chip(id, text, x, y, meaning, options = {}) {
      const f = options.font ?? T.label;
      const t = tone(meaning);
      const h = 30;
      const iconW = options.icon ? 20 : 0;
      const w = Math.round(measure(text, f) + 24 + iconW);
      return {
        w,
        node: groupNode(
          id,
          [
            shapeNode(`${id}-bg`, { geometry: rect(w / 2, 0, w, h, h / 2), fill: t.bg }),
            ...(options.icon ? [icon(`${id}-i`, options.icon, 12 + 8, 0, 15, t.fg, 1.5)] : []),
            textNode(`${id}-t`, {
              text,
              font: f,
              fill: t.fg,
              transform: { x: 12 + iconW, y: textTop(f) },
            }),
          ],
          { transform: { x, y } },
        ),
      };
    },
    button(id, text, x, y, options = {}) {
      const f = T.button;
      const variant: ButtonVariant = options.variant ?? (options.primary ? 'primary' : 'secondary');
      const h = 46;
      const iconW = options.icon ? 24 : 0;
      const link = variant === 'link';
      const arrow = link ? 22 : 0;
      const w = Math.round(measure(text, f) + (link ? 0 : 44) + iconW + arrow);
      const press = clamp(options.press ?? 0);
      const fg =
        variant === 'primary'
          ? C.button.primaryFg
          : variant === 'soft' || link
            ? C.button.softFg
            : C.button.secondaryFg;
      const pad = link ? 0 : 22;
      const kids: SceneNode[] = [];
      if (variant === 'primary') {
        kids.push(
          shapeNode(`${id}-bg`, {
            geometry: rect(w / 2, 0, w, h, h / 2),
            fill: linearGradient(0, -h / 2, 0, h / 2, [C.button.primaryTop, C.button.primaryBg]),
            // A soft violet lift, never a hard edge; a press settles it.
            shadow: [
              { x: 0, y: 10 * (1 - press) + 4, blur: 28, color: withAlpha(C.brand.fill, 0.28) },
              { x: 0, y: 2, blur: 4, color: withAlpha(C.brand.deep, 0.18) },
            ],
          }),
        );
      } else if (variant === 'soft') {
        kids.push(
          shapeNode(`${id}-bg`, { geometry: rect(w / 2, 0, w, h, h / 2), fill: C.button.softBg }),
        );
      } else if (variant === 'secondary') {
        kids.push(
          shapeNode(`${id}-bg`, {
            geometry: rect(w / 2, 0, w, h, h / 2),
            fill: C.button.secondaryBg,
            stroke: { color: C.button.secondaryStroke, width: 1 },
            shadow: elevationShadows(lighting, 'low', { strength: 0.5 }),
          }),
        );
      }
      const shine =
        options.shimmer === undefined || link
          ? null
          : lightSweep(
              `${id}-shine`,
              rect(w / 2, 0, w, h, h / 2),
              { x: w / 2, y: 0, width: w, height: h },
              options.shimmer,
              { color: lighting.highlight, width: 64, angle: 18, strength: 0.42 },
            );
      if (shine) kids.push(shine);
      const star =
        options.sparkle === undefined || link
          ? null
          : sparkleStar(`${id}-star`, w - 10, -h / 2 + 6, options.sparkle);
      if (options.icon) kids.push(icon(`${id}-i`, options.icon, pad + 9, 0, 18, fg, 1.6));
      kids.push(
        textNode(`${id}-t`, {
          text,
          font: f,
          fill: fg,
          transform: { x: pad + iconW, y: textTop(f) },
        }),
      );
      if (link) {
        kids.push(
          shapeNode(`${id}-arrow`, {
            geometry: pathGeometry('M0 0h12M7 -5l5 5l-5 5'),
            stroke: { color: fg, width: 1.6, cap: 'round', join: 'round' },
            transform: { x: w - 14, y: 0 },
          }),
        );
      }
      if (star) kids.push(star);
      return {
        w,
        node: groupNode(id, kids, {
          transform: { x: x + w / 2, y: y + press, scale: lerp(1, 0.98, press), originX: w / 2 },
        }),
      };
    },
    input(id, x, y, w, options = {}) {
      const h = options.h ?? 54;
      const focus = clamp(options.focus ?? 0);
      const f = T.body;
      const iconW = options.icon ? 34 : 0;
      const pad = 20;
      const typed = options.text ?? '';
      const shown = typed || options.placeholder || '';
      const kids: SceneNode[] = [];
      if (focus > 0) {
        kids.push(
          shapeNode(`${id}-ring`, {
            geometry: rect(w / 2, 0, w + 6, h + 6, R.input + 3),
            stroke: { color: withAlpha(C.stroke.focus, focus), width: 3 },
          }),
        );
      }
      kids.push(
        shapeNode(`${id}-bg`, {
          geometry: rect(w / 2, 0, w, h, R.input),
          fill: C.surface.paper,
          stroke: { color: focus > 0.5 ? C.brand.soft : C.stroke.hairline, width: 1 },
        }),
      );
      if (options.icon) {
        kids.push(icon(`${id}-i`, options.icon, pad + 10, 0, 20, C.text.tertiary, 1.5));
      }
      kids.push(
        textNode(`${id}-t`, {
          text: shown,
          font: f,
          fill: typed ? C.text.primary : C.text.tertiary,
          transform: { x: pad + iconW, y: textTop(f) },
        }),
      );
      if (options.caret) {
        const cx = pad + iconW + (typed ? measure(typed, f) : 0) + 2;
        kids.push(
          shapeNode(`${id}-caret`, {
            geometry: rect(cx, 0, 2, f.size * 1.2, 1),
            fill: C.brand.fill,
          }),
        );
      }
      return { w, h, node: groupNode(id, kids, { transform: { x, y } }) };
    },
    status(id, text, x, y, meaning) {
      const f = T.small;
      const t = tone(meaning);
      return groupNode(
        id,
        [
          shapeNode(`${id}-dot`, { geometry: rect(5, 0, 10, 10, 5), fill: t.fill }),
          textNode(`${id}-t`, {
            text,
            font: f,
            fill: C.text.primary,
            transform: { x: 22, y: textTop(f) },
          }),
        ],
        { transform: { x, y } },
      );
    },
    score(id, value, x, y) {
      const f = face('mono', 14);
      const h = 30;
      const w = Math.round(measure(value, f) + 22);
      return {
        w,
        node: groupNode(
          id,
          [
            shapeNode(`${id}-bg`, { geometry: rect(w / 2, 0, w, h, R.chip), fill: C.brand.tint }),
            textNode(`${id}-t`, {
              text: value,
              font: f,
              fill: C.button.softFg,
              transform: { x: 11, y: textTop(f) },
            }),
          ],
          { transform: { x, y } },
        ),
      };
    },
    resultCard(id, x, y, w, content) {
      const pad = 28;
      const titleF = face('label', 18, { weight: 500 });
      const bodyF = face('body', 17, { lineHeight: 1.6 });
      const inner = w - 2 * pad;
      const kids: SceneNode[] = [];
      // Document tile, title and metadata.
      kids.push(
        shapeNode(`${id}-tile`, {
          geometry: rect(pad + 24, pad + 24, 48, 48, 14),
          fill: C.brand.tint,
        }),
        icon(`${id}-doc`, 'doc', pad + 24, pad + 24, 22, C.button.softFg, 1.5),
        textNode(`${id}-title`, {
          text: content.title,
          font: titleF,
          fill: C.text.primary,
          transform: { x: pad + 64, y: pad + 1 },
        }),
        textNode(`${id}-meta`, {
          text: content.meta,
          font: T.meta,
          fill: C.text.tertiary,
          transform: { x: pad + 64, y: pad + 28 },
        }),
      );
      if (content.score) {
        const sc = createLook(measurer).score(`${id}-score`, content.score, 0, 0);
        kids.push(
          groupNode(`${id}-score-pos`, [sc.node], {
            transform: { x: w - pad - sc.w, y: pad + 22 },
          }),
        );
      }
      // The summary, with the passage that answered highlighted in sand.
      const text = `${content.before}${content.passage}${content.after}`;
      const layout = layoutText(text, bodyF, { measurer, maxWidth: inner });
      const top = pad + 80;
      const lh = layout.lineHeight;
      const startIdx = content.before.length;
      const endIdx = startIdx + content.passage.length;
      const hp = clamp(content.highlight ?? 1);
      let offset = 0;
      layout.lines.forEach((line, i) => {
        const lineStart = text.indexOf(line.text, offset);
        const lineEnd = lineStart + line.text.length;
        offset = lineEnd;
        const a = Math.max(startIdx, lineStart);
        const b = Math.min(endIdx, lineEnd);
        if (b > a && hp > 0) {
          const x0 = measure(line.text.slice(0, a - lineStart), bodyF);
          const x1 = measure(line.text.slice(0, b - lineStart), bodyF);
          const ww = (x1 - x0 + 12) * hp;
          kids.push(
            shapeNode(`${id}-hl${i}`, {
              geometry: rect(pad + x0 - 6 + ww / 2, top + i * lh + lh / 2, ww, lh * 0.84, 6),
              fill: C.insight.marker,
            }),
          );
        }
      });
      kids.push(
        textNode(`${id}-body`, {
          text,
          font: bodyF,
          fill: C.text.primary,
          maxWidth: inner,
          transform: { x: pad, y: top },
        }),
      );
      const last = layout.lines[layout.lines.length - 1];
      if (content.cite !== undefined && last) {
        const cx = pad + measure(last.text, bodyF) + 3;
        const cy = top + (layout.lines.length - 1) * lh + 4;
        kids.push(
          textNode(`${id}-cite`, {
            text: `[${content.cite}]`,
            font: face('label', 11, { weight: 500 }),
            fill: C.citation.number,
            transform: { x: cx, y: cy },
          }),
        );
      }
      let h = top + layout.lines.length * lh + 16;
      if (content.tags && content.tags.length > 0) {
        let tx = pad;
        const look = createLook(measurer);
        content.tags.forEach(([tag, meaning], k) => {
          const c = look.chip(`${id}-tag${k}`, tag, tx, h + 16, meaning, { font: T.small });
          kids.push(c.node);
          tx += c.w + 8;
        });
        h += 32 + 8;
      }
      h += pad - 8;
      kids.unshift(
        shapeNode(`${id}-card`, {
          geometry: rect(w / 2, h / 2, w, h, R.card),
          fill: C.surface.paper,
          stroke: { color: C.stroke.hairline, width: 1 },
          shadow: elevationShadows(lighting, 'mid'),
        }),
      );
      return { h, node: groupNode(id, kids, { transform: { x, y } }) };
    },
    citation(id, n, name, text, x, y) {
      const f = T.small;
      const h = 34;
      const w = Math.round(measure(text, f) + 74);
      return {
        w,
        node: groupNode(
          id,
          [
            shapeNode(`${id}-bg`, {
              geometry: rect(w / 2, 0, w, h, h / 2),
              fill: C.surface.paper,
              stroke: { color: C.stroke.hairline, width: 1 },
            }),
            shapeNode(`${id}-n`, { geometry: rect(17, 0, 22, 22, 7), fill: C.citation.bg }),
            textNode(`${id}-nt`, {
              text: String(n),
              font: T.label,
              fill: C.citation.number,
              align: 'center',
              transform: { x: 17, y: textTop(T.label) },
            }),
            icon(`${id}-i`, name, 42, 0, 16, C.source.fg, 1.5),
            textNode(`${id}-t`, {
              text,
              font: f,
              fill: C.text.primary,
              transform: { x: 56, y: textTop(f) },
            }),
          ],
          { transform: { x, y } },
        ),
      };
    },
    avatar(id, initials, x, y, r, color) {
      const f = face('label', r * 0.8, { weight: 600, letterSpacing: 0 });
      return groupNode(
        id,
        [
          shapeNode(`${id}-disc`, {
            geometry: rect(0, 0, 2 * r, 2 * r, r),
            fill: litFill(lighting, color, { y: 0, height: 2 * r }, { sheen: 0.18, shade: 0.06 }),
            stroke: { color: C.surface.paper, width: 2 },
            shadow: elevationShadows(lighting, 'low'),
          }),
          textNode(`${id}-t`, {
            text: initials,
            font: f,
            fill: P.white,
            align: 'center',
            transform: { y: textTop(f) },
          }),
        ],
        { transform: { x, y } },
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Headline cards: every line of copy sits on its own Cloud card
// ---------------------------------------------------------------------------

/**
 * A headline's copy: a Sora title and an optional Newsreader subtext. Words
 * in `*stars*` take `accent`, in `_underscores_` `accent2` (or the `marker`
 * swept behind them).
 */
export interface HeadSpec {
  readonly title: string;
  readonly sub?: string;
  readonly accent?: string;
  readonly accent2?: string;
  readonly marker?: string;
  readonly breaks?: readonly number[];
  readonly subBreaks?: readonly number[];
}

export interface Headline {
  readonly title: KineticText;
  readonly sub: KineticText | null;
  /** When the subtext starts arriving, after the title. */
  readonly subAt: number;
  readonly width: number;
  readonly height: number;
}

/** Card layout: inset from the frame's left edge and top, padding, gap between title and subtext. */
export const HEAD = { x: 28, y: 72, padX: 30, padY: 26, gap: 12, maxWidth: 604 } as const;

/** Lays a headline out once (setup). */
export function makeHeadline(id: string, spec: HeadSpec, measurer: TextMeasurer): Headline {
  const common = {
    measurer,
    x: 0,
    y: 0,
    maxWidth: HEAD.maxWidth,
    color: C.text.primary,
    ...(spec.accent ? { accent: spec.accent } : {}),
    ...(spec.accent2 ? { accent2: spec.accent2 } : {}),
    ...(spec.marker ? { marker: spec.marker } : {}),
    at: 0,
    ease: look.easing.enter,
  };
  const title = kineticText({
    ...common,
    id: `${id}-title`,
    text: spec.title,
    font: T.cardTitle,
    ...(spec.breaks ? { breaks: spec.breaks } : {}),
  });
  const sub = spec.sub
    ? kineticText({
        ...common,
        id: `${id}-sub`,
        text: spec.sub,
        font: T.cardSub,
        color: C.text.secondary,
        stagger: 0.012,
        ...(spec.subBreaks ? { breaks: spec.subBreaks } : {}),
      })
    : null;
  const width = Math.max(title.width, sub?.width ?? 0) + 2 * HEAD.padX;
  const height = title.height + (sub ? HEAD.gap + sub.height : 0) + 2 * HEAD.padY;
  return { title, sub, subAt: Math.min(0.55, title.end * 0.6), width, height };
}

/**
 * A headline on its card, the card's top left at (x, y), `t` s after it
 * starts arriving: the card settles in first, the title arrives letter by
 * letter, the subtext follows; `exit` (0–1) takes it all away.
 */
export function headlineCard(
  id: string,
  h: Headline,
  x: number,
  y: number,
  t: number,
  exit = 0,
): SceneNode {
  const p = clamp(t / 0.4);
  const e = 1 - (1 - p) ** 3;
  const cx = x + h.width / 2;
  const cy = y + h.height / 2;
  const children: SceneNode[] = [
    shapeNode(`${id}-card`, {
      geometry: rect(cx, cy, h.width, h.height, R.card),
      fill: withAlpha(C.surface.paper, 0.97),
      stroke: { color: C.stroke.hairline, width: 1 },
      shadow: elevationShadows(lighting, 'high', { strength: 0.9 }),
    }),
    groupNode(`${id}-t`, [h.title(t - 0.08, exit)], {
      transform: { x: x + HEAD.padX, y: y + HEAD.padY },
    }),
  ];
  if (h.sub && t >= h.subAt) {
    children.push(
      groupNode(`${id}-s`, [h.sub(t - h.subAt, exit)], {
        transform: { x: x + HEAD.padX, y: y + HEAD.padY + h.title.height + HEAD.gap },
      }),
    );
  }
  return groupNode(id, children, {
    opacity: clamp(e * 1.4) * (1 - exit),
    transform: { x: cx, y: cy, scale: 0.97 + 0.03 * e, originX: cx, originY: cy },
    ...(e < 0.98 ? { blur: 6 * (1 - e) } : {}),
  });
}

/** Time running out: green at the start, orange halfway, vibrant red at the end (0–1). */
export function urgency(p: number): string {
  const u = clamp(p);
  return u < 0.5
    ? mixColors(C.urgency.start, C.urgency.middle, u * 2)
    : mixColors(C.urgency.middle, C.urgency.end, u * 2 - 1);
}

/**
 * A little four-pointed star that twinkles once as `p` goes 0 → 1: it grows
 * from nothing to full size, glowing most at its peak, then shrinks back to
 * nothing. White with a violet glow, so it reads on the button and on the
 * light ground behind it.
 */
export function sparkleStar(id: string, x: number, y: number, p: number): SceneNode | null {
  if (!(p > 0 && p < 1)) return null;
  // Up and back down on one smooth arc: 0 → 1 → 0.
  const s = Math.sin(Math.PI * p);
  const size = 11 * s;
  if (size <= 0.01) return null;
  const k = 0.18;
  const star = `M0 -1Q${k} ${-k} 1 0Q${k} ${k} 0 1Q${-k} ${k} -1 0Q${-k} ${-k} 0 -1Z`;
  return groupNode(
    id,
    [
      shapeNode(`${id}-shape`, {
        geometry: pathGeometry(star),
        fill: lighting.highlight,
        // The glow swells with the star and is brightest at full size.
        shadow: [
          { x: 0, y: 0, blur: 0.5, color: withAlpha(C.brand.glow, 0.9 * s) },
          { x: 0, y: 0, blur: 1.2, color: withAlpha(C.brand.fill, 0.55 * s) },
          { x: 0, y: 0, blur: 2.6, color: withAlpha(C.brand.glow, 0.4 * s) },
        ],
      }),
    ],
    { transform: { x, y, scale: size } },
  );
}
