/**
 * Shared pieces of the Cowork story: scenes `query-lost` (the pain point),
 * `query-criteria` (what enterprise AI should do) and `query-cowork` (the
 * product). All three draw through one painter (`paint`) from a plain
 * `StoryState`, and each scene starts from the previous scene's final state,
 * so every cut is the same frame on both sides by construction.
 */
import {
  clamp,
  groupNode,
  layoutText,
  lerp,
  mixColors,
  pathGeometry,
  progress,
  random,
  rect,
  shapeNode,
  textNode,
  withAlpha,
  linearGradient,
  radialGradient,
  type FontSpec,
  type SceneNode,
  type Shadow,
  type TextMeasurer,
} from '@html-animation-engine/core';
import { backdrop, elevationShadows, litFill } from '@html-animation-engine/renderers';
import { ROOM } from './query-bubbles/composition.js';
import { font, lighting, phoneDefaults, theme } from './index.js';

const { colors, easing } = theme;
export const W = phoneDefaults.width;
export const H = phoneDefaults.height;
export const CX = W / 2;

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export const HEADLINE: FontSpec = { ...font('display', 46), lineHeight: 1.12, letterSpacing: -1.2 };
export const TAGLINE: FontSpec = { ...font('display', 40), lineHeight: 1.15, letterSpacing: -0.8 };
export const WORDMARK: FontSpec = { ...font('display', 104), letterSpacing: -3.5 };
const QUESTION: FontSpec = { ...font('display', 32), letterSpacing: 0 };
/** Every font the story uses (for a composition's `fonts`). */
export const STORY_FONTS = [HEADLINE, TAGLINE, WORDMARK, QUESTION] as const;

/** A caption: drawn at `t`, leaving as `exit` goes 0 → 1. */
export interface Caption {
  (t: number, exit?: number): SceneNode;
  /** When each word arrives, in reading order (for sound). */
  readonly words: readonly number[];
}

export interface CaptionSpec {
  /**
   * Phrases separated by `|`, each arriving at its time in `at`. Words in
   * `*stars*` take `accent`, in `_underscores_` take `accent2`.
   */
  readonly text: string;
  readonly at: readonly number[];
  readonly font: FontSpec;
  /** Top of the first line. */
  readonly y: number;
  readonly maxWidth: number;
  readonly color?: string;
  readonly accent?: string;
  readonly accent2?: string;
  /** Delay between words within a phrase. */
  readonly stagger?: number;
  /** Words (by index) that start a new line, besides the wrapping. */
  readonly breaks?: readonly number[];
}

/**
 * Text that arrives phrase by phrase, each word rising into place, laid out
 * once (centred on the frame) so line breaks never move.
 */
export function caption(id: string, spec: CaptionSpec, measurer: TextMeasurer): Caption {
  const stagger = spec.stagger ?? 0.045;
  const words: { text: string; at: number; fill: string }[] = [];
  spec.text.split('|').forEach((phrase, p) => {
    phrase
      .trim()
      .split(/\s+/)
      .forEach((raw, k) => {
        const star = /^\*(.+)\*$/.exec(raw);
        const under = /^_(.+)_$/.exec(raw);
        words.push({
          text: star?.[1] ?? under?.[1] ?? raw,
          at: (spec.at[p] ?? 0) + k * stagger,
          fill: star
            ? (spec.accent ?? colors.blue)
            : under
              ? (spec.accent2 ?? colors.violet)
              : (spec.color ?? colors.ink),
        });
      });
  });
  const layout = layoutText(
    words.map((w, k) => (k === 0 ? '' : spec.breaks?.includes(k) ? '\n' : ' ') + w.text).join(''),
    spec.font,
    {
      measurer,
      maxWidth: spec.maxWidth,
      align: 'center',
    },
  );
  const draw = (t: number, exit = 0): SceneNode => {
    const out = clamp(exit);
    const children: SceneNode[] = [];
    layout.words.forEach((w, k) => {
      const word = words[k];
      if (!word) return;
      const p = progress(t, word.at, 0.6, easing.enter);
      const opacity = clamp(p * 1.8) * (1 - out);
      if (p <= 0 || opacity <= 0) return;
      children.push(
        textNode(`${id}-${k}`, {
          text: w.text,
          font: spec.font,
          fill: word.fill,
          transform: { x: CX + w.x, y: spec.y + w.y + (1 - p) * 26 - out * 34 },
          opacity,
        }),
      );
    });
    return groupNode(id, children);
  };
  return Object.assign(draw, { words: words.map((w) => w.at) });
}

// ---------------------------------------------------------------------------
// The company's knowledge: paper notes pinned to a board, and stacks of
// files and folders in front of it.
// ---------------------------------------------------------------------------

/** The colours knowledge comes in; each note keeps its colour when it becomes a dot. */
const KINDS = [colors.blue, colors.orange, colors.violet, colors.pink] as const;
const DOT = 22;
/** What knowledge fades to when it is lost: the colour of dust on paper. */
const GHOST = mixColors(colors.paper, colors.muted, 0.42);
/** Cork and its wooden frame, mixed from the theme. */
const CORK = mixColors(mixColors(colors.orange, colors.ink, 0.3), colors.paper, 0.42);
const FRAME = mixColors(colors.orange, colors.ink, 0.66);
const MANILA = mixColors(colors.orange, colors.paper, 0.58);

/** The board (centre and inner size) and the hub the network later forms around. */
export const BOARD = { x: CX, y: 636, w: 624, h: 380, frame: 14 } as const;
export const HUB = { x: CX, y: 800 } as const;

const SEED = 'query-story';
const COUNT = 28;

export type PinAt = 'left' | 'centre' | 'right';

export interface Note {
  /** Centre, relative to the board's centre. */
  readonly x: number;
  readonly y: number;
  readonly side: number;
  readonly rot: number;
  /** The colour it becomes as a dot, and the paper's faint tint of it. */
  readonly color: string;
  readonly paper: string;
  readonly pin: PinAt;
  readonly pinColor: string;
  /**
   * How far each corner (top left, top right, bottom right, bottom left)
   * stands off the board, in px: one clearly, the other three barely.
   */
  readonly lift: readonly [number, number, number, number];
  /** The corner that is clearly lifted. */
  readonly curl: number;
  /** Scribbled lines, as fractions of the full line. */
  readonly lines: readonly number[];
  /** Its place in the network (scene 2 of the story). */
  readonly net: { readonly x: number; readonly y: number };
}

/** Which corners can curl away from each pin (not the one the pin holds down). */
const CURLS: Record<PinAt, readonly number[]> = {
  left: [1, 2, 3],
  centre: [2, 3],
  right: [0, 2, 3],
};
const PINS: readonly PinAt[] = ['left', 'centre', 'right'];
const PIN_COLORS = [colors.alert, colors.blue, colors.orange, colors.violet, colors.lime] as const;

/** Notes in the order they are pinned up (later ones overlap earlier ones). */
export const NOTES: readonly Note[] = (() => {
  const [cols, rows] = [7, 4];
  const [cw, ch] = [BOARD.w / cols, BOARD.h / rows];
  const cells = Array.from({ length: COUNT }, (_, c) => c).sort(
    (a, b) => random(SEED, 'order', a) - random(SEED, 'order', b),
  );
  return cells.map((cell, i) => {
    const r = (key: string) => random(SEED, key, cell);
    const side = Math.round(56 + r('side') * 36);
    const room = { x: BOARD.w / 2 - side / 2 - 8, y: BOARD.h / 2 - side / 2 - 8 };
    const x = clamp(
      ((cell % cols) + 0.5) * cw - BOARD.w / 2 + (r('x') - 0.5) * cw * 0.6,
      -room.x,
      room.x,
    );
    const y = clamp(
      (Math.floor(cell / cols) + 0.5) * ch - BOARD.h / 2 + (r('y') - 0.5) * ch * 0.6,
      -room.y,
      room.y,
    );
    const pin = PINS[Math.floor(r('pin') * PINS.length)] ?? 'centre';
    const curls = CURLS[pin];
    const curl = curls[Math.floor(r('curl') * curls.length)] ?? 2;
    const lift = [0, 1, 2, 3].map((k) =>
      k === curl ? 10 + r('big') * 6 : 0.4 + random(SEED, 'small', cell, k) * 1.1,
    ) as unknown as Note['lift'];
    const color = KINDS[i % KINDS.length] ?? colors.blue;
    // Network places: a sunflower spread around the hub, outside the team's circle.
    const a = i * 2.39996 + (random(SEED, 'na', i) - 0.5) * 0.35;
    const nr = 112 + 150 * Math.sqrt((i + 0.5) / COUNT) + (random(SEED, 'nr', i) - 0.5) * 18;
    return {
      x,
      y,
      side,
      rot: (r('rot') - 0.5) * 12,
      color,
      paper: mixColors(colors.light, color, 0.06 + r('tint') * 0.12),
      pin,
      pinColor: PIN_COLORS[Math.floor(r('pinc') * PIN_COLORS.length)] ?? colors.alert,
      lift,
      curl,
      lines: [0.9, 0.55 + r('l1') * 0.4, 0.4 + r('l2') * 0.5, 0.5 + r('l3') * 0.4],
      net: { x: HUB.x + nr * Math.cos(a), y: HUB.y + nr * Math.sin(a) },
    };
  });
})();

/** The pieces that become the network: the notes. */
export const PIECES = NOTES;

/** A file or folder lying in a stack, seen edge on. */
export interface StackItem {
  readonly stack: number;
  /** Height in its stack (0 = bottom). */
  readonly level: number;
  /** When it lands, in order across all stacks (bottom layers first). */
  readonly order: number;
  readonly kind: 'folder' | 'papers';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rot: number;
  readonly color: string;
  /** Where the folder's tab sits along its top edge. */
  readonly tab: number;
}

export const STACKS = { base: 1172, xs: [168, 362, 556], counts: [7, 9, 8] } as const;

export const STACK_ITEMS: readonly StackItem[] = (() => {
  const items: Omit<StackItem, 'order'>[] = [];
  STACKS.xs.forEach((sx, stack) => {
    let top = STACKS.base;
    for (let level = 0; level < (STACKS.counts[stack] ?? 0); level++) {
      const r = (key: string) => random(SEED, 'stack', key, stack, level);
      const folder = r('kind') < 0.62;
      const h = folder ? 21 + Math.round(r('h') * 5) : 15 + Math.round(r('h') * 5);
      const w = 164 + Math.round(r('w') * 26);
      const tint = r('tint');
      items.push({
        stack,
        level,
        kind: folder ? 'folder' : 'papers',
        x: sx + (r('x') - 0.5) * 16,
        y: top - h / 2,
        w,
        h,
        rot: (r('rot') - 0.5) * 5,
        color: !folder
          ? colors.light
          : tint < 0.55
            ? MANILA
            : mixColors(
                colors.paper,
                KINDS[Math.floor(tint * 8) % KINDS.length] ?? colors.blue,
                0.4,
              ),
        tab: (r('tab') - 0.5) * (w - 50),
      });
      top -= h + 1;
    }
  });
  const ordered = [...items].sort((a, b) => a.level - b.level || a.stack - b.stack);
  return items.map((item) => ({ ...item, order: ordered.indexOf(item) }));
})();

/** Links of the network: each piece to its two nearest, and the nearest ones to the hub. */
export const LINKS: readonly { readonly a: number; readonly b: number }[] = (() => {
  const seen = new Set<string>();
  const out: { a: number; b: number }[] = [];
  PIECES.forEach((p, a) => {
    PIECES.map((q, b) => ({ b, d: Math.hypot(q.net.x - p.net.x, q.net.y - p.net.y) }))
      .filter((e) => e.b !== a)
      .sort((x, y) => x.d - y.d)
      .slice(0, 2)
      .forEach(({ b }) => {
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ a, b });
      });
  });
  // Ordered outwards from the hub, so the network grows from the centre.
  const d = (i: number) => {
    const p = PIECES[i]?.net ?? HUB;
    return Math.hypot(p.x - HUB.x, p.y - HUB.y);
  };
  return out.sort((x, y) => Math.min(d(x.a), d(x.b)) - Math.min(d(y.a), d(y.b)));
})();
/** Pieces linked straight to the hub: the closest ones. */
export const SPOKES: readonly number[] = PIECES.map((p, i) => ({
  i,
  d: Math.hypot(p.net.x - HUB.x, p.net.y - HUB.y),
}))
  .sort((a, b) => a.d - b.d)
  .slice(0, 7)
  .map((e) => e.i);

/** Work the team couldn't reach before: tiles on an outer ring. */
export const TASKS: readonly { readonly x: number; readonly y: number; readonly r: number }[] = [
  [-112, 296],
  [-67, 282],
  [-22, 302],
  [23, 288],
  [68, 304],
  [113, 290],
  [158, 300],
  [203, 284],
].map(([deg = 0, r = 0]) => {
  const a = (deg * Math.PI) / 180;
  return { x: HUB.x + r * Math.cos(a), y: HUB.y + r * Math.sin(a), r };
});

// ---------------------------------------------------------------------------
// State: everything a frame of the story shows.
// ---------------------------------------------------------------------------

export interface Place {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly opacity: number;
  readonly rot?: number;
}

export interface PieceState extends Place {
  readonly rot: number;
  /** 0 = a note, 1 = a dot in the network. */
  readonly dot: number;
  /** 0 = clear, 1 = faded to dust (lost). */
  readonly ghost: number;
  /** 0 = held off the board, 1 = pressed onto it (each corner at its own lift). */
  readonly press: number;
  /** Its pin: 0 = none, 1 = pushed in. */
  readonly pin: number;
}

export interface ItemState extends Place {
  readonly ghost: number;
}

export interface BoardState {
  readonly y: number;
  readonly scale: number;
  readonly opacity: number;
  /** How far the board and its notes have faded back into the room (0–1). */
  readonly veil: number;
}

/** The clock, which becomes the hub, which becomes the Cowork tile. */
export interface DialState {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly radius: number;
  readonly scale: number;
  /** 0 = a white clock face, 1 = the dark hub. */
  readonly dark: number;
  /** Clock ticks, hand and swept time (0–1). */
  readonly face: number;
  readonly sweep: number;
  /** The four-square mark inside (0–1). */
  readonly mark: number;
  readonly markScale: number;
  /** A light band crossing it (0–1 across; outside that, none). */
  readonly sheen: number;
}

export interface StoryState {
  readonly board: BoardState | null;
  readonly pieces: readonly (PieceState | null)[];
  readonly items: readonly (ItemState | null)[];
  readonly questions: readonly (Place | null)[];
  readonly people: readonly (Place | null)[];
  readonly lenses: readonly (Place | null)[];
  readonly work: Place | null;
  readonly dial: DialState | null;
  /** How far each link is drawn (0–1), and its strength. */
  readonly links: { readonly drawn: readonly number[]; readonly opacity: number } | null;
  /** The team's old reach: a dashed circle around the hub. */
  readonly reach: { readonly r: number; readonly opacity: number } | null;
  /** What the team can do now: a light field growing from the hub. */
  readonly field: { readonly r: number; readonly opacity: number } | null;
  readonly tasks: readonly ((Place & { readonly lit: number }) | null)[];
  readonly captions: readonly SceneNode[];
}

// ---------------------------------------------------------------------------
// The painter
// ---------------------------------------------------------------------------

const softShadow = (alpha: number, y = 4, blur = 10): Shadow => ({
  x: 0,
  y,
  blur,
  color: withAlpha(lighting.shadow, alpha),
});

/** Rounded rectangles as one path (several sub-paths), for card details. */
function bars(list: readonly (readonly [number, number, number, number])[]): string {
  return list
    .map(([x, y, w, h]) => {
      const r = Math.min(h / 2, w / 2);
      return (
        `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
        `H${x + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
      );
    })
    .join('');
}

/** Tiny dots of cork grain, made once. */
const GRAIN = Array.from({ length: 220 }, (_, k) => {
  const x = (random(SEED, 'grain-x', k) - 0.5) * (BOARD.w - 6);
  const y = (random(SEED, 'grain-y', k) - 0.5) * (BOARD.h - 6);
  const r = 0.7 + random(SEED, 'grain-r', k) * 1.3;
  return `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0Z`;
}).join('');

function boardNode(b: BoardState): SceneNode {
  const { w, h, frame } = BOARD;
  return groupNode(
    'board',
    [
      shapeNode('board-frame', {
        geometry: rect(0, 0, w + 2 * frame, h + 2 * frame, 10),
        fill: litFill(lighting, FRAME, { y: 0, height: h + 2 * frame }),
        shadow: elevationShadows(lighting, 'mid', { strength: 0.7 * (1 - b.veil) }),
      }),
      shapeNode('board-cork', {
        geometry: rect(0, 0, w, h, 3),
        fill: litFill(lighting, CORK, { y: 0, height: h }, { sheen: 0.12, shade: 0.12 }),
      }),
      shapeNode('board-grain', {
        geometry: pathGeometry(GRAIN),
        fill: withAlpha(mixColors(CORK, colors.ink, 0.35), 0.4),
      }),
      // The frame's lip shades the top of the cork.
      shapeNode('board-lip', {
        geometry: rect(0, -h / 2 + 7, w, 14),
        fill: linearGradient(0, -h / 2, 0, -h / 2 + 14, [
          withAlpha(lighting.shadow, 0.22),
          withAlpha(lighting.shadow, 0),
        ]),
      }),
    ],
    { transform: { x: BOARD.x, y: BOARD.y + b.y, scale: b.scale }, opacity: b.opacity },
  );
}

/**
 * The board and its notes fading back: the room itself, drawn over the board
 * at `veil` strength. (Fading the board's own shapes would let the parts
 * hidden under each note show through, since opacity applies per shape.)
 */
function veilNode(b: BoardState): SceneNode {
  const { w, h, frame } = BOARD;
  return groupNode('veil', [backdrop('veil-room', lighting, ROOM)], {
    clip: rect(BOARD.x, BOARD.y + b.y, (w + 2 * frame) * b.scale, (h + 2 * frame) * b.scale, 10),
    opacity: b.veil * b.opacity,
  });
}

const PIN = { r: 6.5, inset: 11 } as const;

/** A polygon through points, as a path. */
const polygon = (points: readonly (readonly [number, number])[]) =>
  `M${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`;

/**
 * A paper note pinned to the board. Each corner stands off the board by its
 * own lift: the lifted corner draws in a little (it tilts towards us),
 * catches the light from above, and casts its shadow further down the cork.
 * As `dot` goes to 1 it lets go of its pin and shrinks into a dot.
 */
function noteNode(i: number, s: PieceState): SceneNode | null {
  const n = NOTES[i];
  if (!n || s.opacity <= 0) return null;
  const card = 1 - s.dot;
  const side = lerp(n.side, DOT, s.dot);
  const half = side / 2;
  const color = mixColors(mixColors(n.paper, n.color, s.dot), GHOST, s.ghost * 0.8);
  // Held off the board, every corner stands 16 px out; pressed on, each has its own lift.
  const lift = n.lift.map((l) => lerp(16, l, clamp(s.press)) * card);
  const corners: (readonly [number, number])[] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  const children: SceneNode[] = [];
  const shade = (1 - 0.6 * s.ghost) * card;
  // The paper's outline: as a note, each corner draws in towards the middle by
  // a little of its lift (it tilts towards us); as it becomes a dot, a square.
  const paper =
    s.dot <= 0
      ? corners.map(([x, y], c) => {
          const l = lift[c] ?? 0;
          return [x * (1 - (0.16 * l) / half), y * (1 - (0.12 * l) / half)] as const;
        })
      : corners;
  if (card > 0) {
    // Each corner casts its own shadow: its patch of paper, hidden under the
    // note, with a shadow further down the cork and softer the higher it stands.
    paper.forEach(([x, y], c) => {
      const l = lift[c] ?? 0;
      const [nx, ny] = paper[(c + 1) % 4] ?? [0, 0];
      const [px, py] = paper[(c + 3) % 4] ?? [0, 0];
      const patch = [
        [x, y],
        [lerp(x, nx, 0.5), lerp(y, ny, 0.5)],
        [x * 0.15, y * 0.15],
        [lerp(x, px, 0.5), lerp(y, py, 0.5)],
      ] as const;
      children.push(
        shapeNode(`p${i}-lift${c}`, {
          geometry: pathGeometry(polygon(patch)),
          fill: color,
          shadow: {
            x: 0.3 * l,
            y: 0.5 + 0.85 * l,
            blur: 1.5 + 0.55 * l,
            color: withAlpha(lighting.shadow, (0.2 + 0.014 * l) * shade),
          },
        }),
      );
    });
  }
  // Along its edges the paper sits close to the cork: a tight contact shadow.
  const contact = { x: 0, y: 0.6, blur: 1.5, color: withAlpha(lighting.shadow, 0.14 * shade) };
  if (s.dot <= 0) {
    const [cx, cy] = paper[n.curl] ?? [half, half];
    // The lifted corner bends: it rounds off, and turns up into the light from above.
    const bend = 0.9 * (lift[n.curl] ?? 0);
    const outline = paper
      .map(([x, y], c) => {
        if (c !== n.curl) return `${c ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
        const [ax, ay] = paper[(c + 3) % 4] ?? [0, 0];
        const [bx, by] = paper[(c + 1) % 4] ?? [0, 0];
        const towards = (tx: number, ty: number) => {
          const d = Math.hypot(tx - x, ty - y) || 1;
          return [x + ((tx - x) / d) * bend, y + ((ty - y) / d) * bend] as const;
        };
        const [p0, p1] = [towards(ax, ay), towards(bx, by)];
        return (
          `${c ? 'L' : 'M'}${p0[0].toFixed(2)} ${p0[1].toFixed(2)}` +
          `Q${x.toFixed(2)} ${y.toFixed(2)} ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`
        );
      })
      .join('');
    children.push(
      shapeNode(`p${i}-paper`, {
        geometry: pathGeometry(`${outline}Z`),
        fill: linearGradient(cx, cy, -cx * 0.6, -cy * 0.6, [
          { offset: 0, color: mixColors(color, colors.light, 0.9) },
          { offset: 0.18, color: mixColors(color, colors.light, 0.35) },
          { offset: 0.45, color },
          { offset: 1, color: mixColors(color, lighting.shadow, 0.1) },
        ]),
        shadow: contact,
      }),
    );
  } else {
    children.push(
      shapeNode(`p${i}-paper`, {
        geometry: rect(0, 0, side, side, lerp(2, DOT / 2, s.dot)),
        fill: color,
        shadow: contact,
      }),
    );
  }
  const ink = card ** 2 * (1 - 0.6 * s.ghost);
  if (ink > 0.002) {
    const rows = n.lines.filter((_, k) => -half + 26 + k * 11 < half - 10);
    children.push(
      shapeNode(`p${i}-ink`, {
        geometry: pathGeometry(
          bars(rows.map((f, k) => [-side * 0.34, -half + 24 + k * 11, side * 0.68 * f, 3.4])),
        ),
        fill: withAlpha(colors.ink, 0.3),
        opacity: ink,
      }),
    );
  }
  const pinned = clamp(s.pin) * card;
  if (pinned > 0) {
    const px = n.pin === 'left' ? -half + PIN.inset : n.pin === 'right' ? half - PIN.inset : 0;
    const py = -half + PIN.inset;
    const height = lerp(9, 2.5, clamp(s.pin));
    const head = mixColors(n.pinColor, GHOST, s.ghost * 0.5);
    children.push(
      groupNode(
        `p${i}-pin`,
        [
          shapeNode(`p${i}-pin-shadow`, {
            geometry: rect(height * 0.5, height, PIN.r * 3, PIN.r * 3, PIN.r * 1.5),
            fill: radialGradient(height * 0.5, height, PIN.r * 1.5, [
              { offset: 0, color: withAlpha(lighting.shadow, 0.35) },
              { offset: 0.6, color: withAlpha(lighting.shadow, 0.14) },
              { offset: 1, color: withAlpha(lighting.shadow, 0) },
            ]),
          }),
          shapeNode(`p${i}-pin-head`, {
            geometry: rect(0, 0, PIN.r * 2, PIN.r * 2, PIN.r),
            fill: radialGradient(-PIN.r * 0.35, -PIN.r * 0.4, PIN.r * 1.4, [
              { offset: 0, color: mixColors(head, colors.light, 0.55) },
              { offset: 0.45, color: head },
              { offset: 1, color: mixColors(head, lighting.shadow, 0.35) },
            ]),
          }),
        ],
        {
          transform: { x: px, y: py, scale: lerp(1.6, 1, s.pin) },
          opacity: clamp(pinned * 3),
        },
      ),
    );
  }
  return groupNode(`p${i}`, children, {
    transform: { x: s.x, y: s.y, rotation: s.rot, scale: s.scale },
    opacity: s.opacity,
  });
}

/** A file or folder in a stack. */
function itemNode(k: number, s: ItemState): SceneNode | null {
  const it = STACK_ITEMS[k];
  if (!it || s.opacity <= 0) return null;
  const color = mixColors(it.color, GHOST, s.ghost * 0.75);
  const children: SceneNode[] = [];
  if (it.kind === 'folder') {
    children.push(
      shapeNode(`f${k}-tab`, {
        geometry: rect(it.tab, -it.h / 2 - 3, 40, 9, 3),
        fill: mixColors(color, lighting.shadow, 0.06),
      }),
    );
  }
  children.push(
    shapeNode(`f${k}-body`, {
      geometry: rect(0, 0, it.w, it.h, it.kind === 'folder' ? 3 : 2),
      fill: litFill(lighting, color, { y: 0, height: it.h }),
      shadow: softShadow(0.2 * (1 - 0.6 * s.ghost), 2, 4),
    }),
  );
  const [l, r] = [-it.w / 2, it.w / 2];
  if (it.kind === 'folder') {
    // Papers inside, showing at the open edge, and the fold along the bottom.
    children.push(
      shapeNode(`f${k}-papers`, {
        geometry: rect(2, -it.h / 2 + 4.5, it.w - 22, 4, 1),
        fill: mixColors(colors.light, GHOST, s.ghost * 0.6),
      }),
      shapeNode(`f${k}-edges`, {
        geometry: pathGeometry(`M${l + 5} ${it.h / 2 - 4}H${r - 5}`),
        stroke: { color: withAlpha(colors.ink, 0.14), width: 1 },
      }),
    );
  } else {
    // The edges of the sheets in a ream.
    const rows = [-0.3, -0.1, 0.1, 0.3].map((f) => `M${l + 3} ${f * it.h}H${r - 3}`).join('');
    children.push(
      shapeNode(`f${k}-edges`, {
        geometry: pathGeometry(rows),
        stroke: { color: withAlpha(colors.ink, 0.13), width: 1 },
      }),
    );
  }
  return groupNode(`f${k}`, children, {
    transform: { x: s.x, y: s.y, rotation: s.rot ?? 0, scale: s.scale },
    opacity: s.opacity,
  });
}

function questionNode(k: number, s: Place): SceneNode {
  return groupNode(
    `ask${k}`,
    [
      shapeNode(`ask${k}-bubble`, {
        geometry: rect(0, 0, 54, 54, 27),
        fill: litFill(lighting, colors.ink, { y: 0, height: 54 }),
        shadow: softShadow(0.3, 5, 12),
      }),
      textNode(`ask${k}-mark`, {
        text: '?',
        font: QUESTION,
        fill: colors.light,
        align: 'center',
        transform: { y: (-QUESTION.size * (QUESTION.lineHeight ?? 1.05)) / 2 },
      }),
    ],
    { transform: { x: s.x, y: s.y, scale: s.scale, rotation: s.rot ?? 0 }, opacity: s.opacity },
  );
}

const PEOPLE_COLORS = [colors.blue, colors.pink, colors.orange] as const;

function personNode(k: number, s: Place): SceneNode {
  const color = PEOPLE_COLORS[k % PEOPLE_COLORS.length] ?? colors.blue;
  return groupNode(
    `person${k}`,
    [
      shapeNode(`person${k}-disc`, {
        geometry: rect(0, 0, 64, 64, 32),
        fill: litFill(lighting, color, { y: 0, height: 64 }),
        stroke: { color: colors.light, width: 3 },
        shadow: softShadow(0.28, 5, 12),
      }),
      groupNode(
        `person${k}-figure`,
        [
          shapeNode(`person${k}-head`, {
            geometry: rect(0, -9, 20, 20, 10),
            fill: colors.light,
          }),
          shapeNode(`person${k}-body`, {
            geometry: pathGeometry('M-19 30C-19 12-10 6 0 6S19 12 19 30Z'),
            fill: colors.light,
          }),
        ],
        { clip: rect(0, 0, 61, 61, 30.5) },
      ),
    ],
    { transform: { x: s.x, y: s.y, scale: s.scale }, opacity: s.opacity },
  );
}

function lensNode(k: number, s: Place): SceneNode {
  return groupNode(
    `lens${k}`,
    [
      shapeNode(`lens${k}-handle`, {
        geometry: pathGeometry('M17 17L36 36'),
        stroke: { color: colors.ink, width: 8, cap: 'round' },
      }),
      shapeNode(`lens${k}-glass`, {
        geometry: rect(0, 0, 46, 46, 23),
        fill: withAlpha(colors.light, 0.4),
        stroke: { color: colors.ink, width: 5 },
        shadow: softShadow(0.22, 4, 10),
      }),
      shapeNode(`lens${k}-glint`, {
        geometry: pathGeometry('M-12 -4A12 12 0 0 1 -4 -12'),
        stroke: { color: colors.light, width: 3, cap: 'round' },
      }),
    ],
    {
      transform: { x: s.x, y: s.y, scale: s.scale, rotation: s.rot ?? 0 },
      opacity: s.opacity,
    },
  );
}

/** The expertise: the real work, waiting. */
function workNode(s: Place): SceneNode {
  return groupNode(
    'work',
    [
      shapeNode('work-card', {
        geometry: rect(0, 0, 150, 92, 20),
        fill: litFill(lighting, colors.violet, { y: 0, height: 92 }),
        shadow: elevationShadows(lighting, 'low', { strength: 0.8 }),
      }),
      shapeNode('work-star', {
        geometry: pathGeometry('M-40 -18Q-38 -2-22 0Q-38 2-40 18Q-42 2-58 0Q-42 -2-40 -18Z'),
        fill: colors.light,
      }),
      shapeNode('work-lines', {
        geometry: pathGeometry(
          bars([
            [-12, -13, 62, 8],
            [-12, 5, 40, 8],
          ]),
        ),
        fill: withAlpha(colors.light, 0.85),
      }),
    ],
    { transform: { x: s.x, y: s.y, scale: s.scale, rotation: s.rot ?? 0 }, opacity: s.opacity },
  );
}

/** Point on a circle of radius r, `a` turns clockwise from 12 o'clock. */
const onDial = (a: number, r: number) => ({
  x: r * Math.sin(a * 2 * Math.PI),
  y: -r * Math.cos(a * 2 * Math.PI),
});

const MARK = [colors.blue, colors.violet, colors.pink, colors.orange] as const;

function dialNode(s: DialState): SceneNode {
  const children: SceneNode[] = [];
  const fill = mixColors(colors.light, colors.ink, s.dark);
  children.push(
    shapeNode('dial-body', {
      geometry: rect(0, 0, s.size, s.size, s.radius),
      fill: litFill(lighting, fill, { y: 0, height: s.size }),
      shadow: elevationShadows(lighting, 'mid', { strength: lerp(0.7, 1.1, s.dark) }),
    }),
  );
  const r = s.size / 2;
  if (s.face > 0) {
    const inner = r - 14;
    if (s.sweep > 0) {
      const a = Math.min(s.sweep, 0.9999);
      const end = onDial(a, inner);
      children.push(
        shapeNode('dial-time', {
          geometry: pathGeometry(
            `M0 0L0 ${-inner}A${inner} ${inner} 0 ${a > 0.5 ? 1 : 0} 1 ${end.x} ${end.y}Z`,
          ),
          fill: withAlpha(colors.blue, 0.2),
          opacity: s.face,
        }),
        shapeNode('dial-rim', {
          geometry: pathGeometry(
            `M0 ${-inner}A${inner} ${inner} 0 ${a > 0.5 ? 1 : 0} 1 ${end.x} ${end.y}`,
          ),
          stroke: { color: colors.blue, width: 7, cap: 'round' },
          opacity: s.face,
        }),
      );
    }
    const ticks = Array.from({ length: 12 }, (_, k) => {
      const [a, b] = [onDial(k / 12, r - 8), onDial(k / 12, r - (k % 3 === 0 ? 24 : 18))];
      return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}L${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
    }).join('');
    const hand = onDial(s.sweep, r * 0.72);
    children.push(
      shapeNode('dial-ticks', {
        geometry: pathGeometry(ticks),
        stroke: { color: colors.ink, width: 3.5, cap: 'round' },
        opacity: s.face * 0.75,
      }),
      shapeNode('dial-hour', {
        geometry: pathGeometry(`M0 0L${onDial(0.83, r * 0.42).x} ${onDial(0.83, r * 0.42).y}`),
        stroke: { color: colors.ink, width: 7, cap: 'round' },
        opacity: s.face,
      }),
      shapeNode('dial-hand', {
        geometry: pathGeometry(`M0 0L${hand.x.toFixed(2)} ${hand.y.toFixed(2)}`),
        stroke: { color: colors.ink, width: 5, cap: 'round' },
        opacity: s.face,
      }),
      shapeNode('dial-pin', {
        geometry: rect(0, 0, 14, 14, 7),
        fill: colors.ink,
        opacity: s.face,
      }),
    );
  }
  if (s.mark > 0) {
    // Four pieces of knowledge, together: the Cowork mark.
    const cell = 0.21 * s.size * s.markScale;
    const gap = 0.05 * s.size * s.markScale;
    MARK.forEach((color, k) => {
      const [col, row] = [k % 2, Math.floor(k / 2)];
      children.push(
        shapeNode(`dial-mark${k}`, {
          geometry: rect(
            (col - 0.5) * (cell + gap),
            (row - 0.5) * (cell + gap),
            cell,
            cell,
            cell * 0.3,
          ),
          fill: litFill(lighting, color, { y: (row - 0.5) * (cell + gap), height: cell }),
          opacity: s.mark,
        }),
      );
    });
  }
  if (s.sheen > 0 && s.sheen < 1) {
    const x = lerp(-s.size, s.size, s.sheen);
    children.push(
      shapeNode('dial-sheen', {
        geometry: rect(0, 0, s.size, s.size, s.radius),
        fill: {
          type: 'linear',
          x1: x - 70,
          y1: -s.size / 2,
          x2: x + 70,
          y2: s.size / 2,
          stops: [
            { offset: 0, color: withAlpha(colors.light, 0) },
            { offset: 0.5, color: withAlpha(colors.light, 0.16) },
            { offset: 1, color: withAlpha(colors.light, 0) },
          ],
        },
      }),
    );
  }
  return groupNode('dial', children, { transform: { x: s.x, y: s.y, scale: s.scale } });
}

function linksNode(state: StoryState, drawn: readonly number[], opacity: number): SceneNode[] {
  const at = (i: number) => state.pieces[i];
  const web: string[] = [];
  LINKS.forEach((link, k) => {
    const f = drawn[k] ?? 0;
    const [a, b] = [at(link.a), at(link.b)];
    if (f <= 0 || !a || !b) return;
    web.push(
      `M${a.x.toFixed(2)} ${a.y.toFixed(2)}L${lerp(a.x, b.x, f).toFixed(2)} ${lerp(a.y, b.y, f).toFixed(2)}`,
    );
  });
  const spokes: string[] = [];
  const hub = state.dial ?? { x: HUB.x, y: HUB.y };
  SPOKES.forEach((i, k) => {
    const f = drawn[LINKS.length + k] ?? 0;
    const p = at(i);
    if (f <= 0 || !p) return;
    spokes.push(
      `M${hub.x.toFixed(2)} ${hub.y.toFixed(2)}L${lerp(hub.x, p.x, f).toFixed(2)} ${lerp(hub.y, p.y, f).toFixed(2)}`,
    );
  });
  const out: SceneNode[] = [];
  if (web.length) {
    out.push(
      shapeNode('links-web', {
        geometry: pathGeometry(web.join('')),
        stroke: { color: withAlpha(colors.ink, 0.22), width: 2, cap: 'round' },
        opacity,
      }),
    );
  }
  if (spokes.length) {
    out.push(
      shapeNode('links-spokes', {
        geometry: pathGeometry(spokes.join('')),
        stroke: { color: withAlpha(colors.blue, 0.55), width: 3, cap: 'round' },
        opacity,
      }),
    );
  }
  return out;
}

function taskNode(k: number, s: Place & { readonly lit: number }): SceneNode {
  const children: SceneNode[] = [
    shapeNode(`task${k}-tile`, {
      geometry: rect(0, 0, 50, 50, 14),
      fill: mixColors(colors.paper, colors.violet, s.lit),
      stroke: {
        color: mixColors(colors.muted, colors.light, s.lit),
        width: 2.5,
        ...(s.lit < 1 ? { dash: [6, 5] } : {}),
      },
      ...(s.lit > 0 ? { shadow: softShadow(0.28 * s.lit, 5, 12) } : {}),
    }),
  ];
  if (s.lit > 0) {
    children.push(
      shapeNode(`task${k}-tick`, {
        geometry: pathGeometry('M-11 1L-3 9L12 -8'),
        stroke: { color: colors.light, width: 5, cap: 'round', join: 'round' },
        opacity: s.lit,
      }),
    );
  }
  return groupNode(`task${k}`, children, {
    transform: { x: s.x, y: s.y, scale: s.scale },
    opacity: s.opacity,
  });
}

/** Everything a story frame shows, above the room. */
export function paint(state: StoryState): SceneNode[] {
  const nodes: (SceneNode | null)[] = [];
  const hub = state.dial ?? { x: HUB.x, y: HUB.y };
  if (state.board && state.board.opacity > 0) nodes.push(boardNode(state.board));
  if (state.field && state.field.opacity > 0) {
    const { r, opacity } = state.field;
    nodes.push(
      shapeNode('field', {
        geometry: rect(hub.x, hub.y, 2 * r, 2 * r, r),
        fill: radialGradient(hub.x, hub.y, r, [
          { offset: 0, color: withAlpha(colors.violet, 0.02) },
          { offset: 0.75, color: withAlpha(colors.violet, 0.1) },
          { offset: 1, color: withAlpha(colors.violet, 0.2) },
        ]),
        stroke: { color: withAlpha(colors.violet, 0.75), width: 3 },
        opacity,
      }),
    );
  }
  if (state.reach && state.reach.opacity > 0) {
    const { r, opacity } = state.reach;
    nodes.push(
      shapeNode('reach', {
        geometry: rect(hub.x, hub.y, 2 * r, 2 * r, r),
        stroke: { color: colors.muted, width: 2.5, dash: [7, 7] },
        opacity,
      }),
    );
  }
  if (state.links && state.links.opacity > 0) {
    nodes.push(...linksNode(state, state.links.drawn, state.links.opacity));
  }
  // Notes still on the board sit under the veil; notes that have let go of it fly above.
  state.pieces.forEach((s, i) => nodes.push(s && s.dot <= 0 ? noteNode(i, s) : null));
  if (state.board && state.board.opacity > 0 && state.board.veil > 0) {
    nodes.push(veilNode(state.board));
  }
  state.pieces.forEach((s, i) => nodes.push(s && s.dot > 0 ? noteNode(i, s) : null));
  state.items.forEach((s, k) => nodes.push(s ? itemNode(k, s) : null));
  state.tasks.forEach((s, k) => nodes.push(s && s.opacity > 0 ? taskNode(k, s) : null));
  state.questions.forEach((s, k) => nodes.push(s && s.opacity > 0 ? questionNode(k, s) : null));
  state.people.forEach((s, k) => nodes.push(s && s.opacity > 0 ? personNode(k, s) : null));
  state.lenses.forEach((s, k) => nodes.push(s && s.opacity > 0 ? lensNode(k, s) : null));
  if (state.work && state.work.opacity > 0) nodes.push(workNode(state.work));
  if (state.dial) nodes.push(dialNode(state.dial));
  nodes.push(...state.captions);
  return nodes.filter((n): n is SceneNode => n !== null);
}

/** The Cowork tile (the clock, then hub, then tile) on its own. */
export function tileNode(s: DialState): SceneNode {
  return dialNode(s);
}

/** Blends two places (for moving things from one scene's layout to the next). */
export function blendPlace(a: Place, b: Place, p: number): Place {
  return {
    x: lerp(a.x, b.x, p),
    y: lerp(a.y, b.y, p),
    scale: lerp(a.scale, b.scale, p),
    opacity: lerp(a.opacity, b.opacity, p),
    rot: lerp(a.rot ?? 0, b.rot ?? 0, p),
  };
}
