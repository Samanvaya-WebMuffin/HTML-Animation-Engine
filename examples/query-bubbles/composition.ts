import {
  clamp,
  createCanvasMeasurer,
  createRng,
  groupNode,
  keyframes,
  lerp,
  mixColors,
  pathGeometry,
  progress,
  rect,
  shapeNode,
  textNode,
  withAlpha,
  type Camera,
  type FontSpec,
  type SceneNode,
} from '@html-animation-engine/core';
import {
  backdrop,
  defineSceneComposition,
  elevationShadows,
} from '@html-animation-engine/renderers';
import { font, lighting, phoneDefaults, theme } from '../index.js';
import { cue, ding, pad, pop, soundtrack, thump, whoosh } from '../sounds.js';

const { colors, easing } = theme;
const W = phoneDefaults.width;
const H = phoneDefaults.height;

/** What people keep asking, in the order they arrive. The first sits in the centre. */
const QUERIES = [
  'Where is my order?',
  'Can I get a refund?',
  'How do I reset my password?',
  'Is this in stock?',
  'Do you ship to Canada?',
  'Why was I charged twice?',
  'Can I change my plan?',
  'When does the sale end?',
  'How do I cancel?',
  'Is there a student discount?',
  "My code isn't working",
  'Can I talk to a human?',
  'What are your hours?',
  'Has my payment gone through?',
  'How long is delivery?',
  'Can I return this?',
  'Do you have it in blue?',
  'Where do I find my invoice?',
  'Is my data secure?',
  'Can I upgrade later?',
  'Why is the app so slow?',
  'How do I add a teammate?',
  'Can you call me back?',
  'Is there a free trial?',
  "What's the warranty?",
  'Can I pay monthly?',
  'How do I export my data?',
  'Did you get my email?',
  'Any update on my ticket?',
  'Can I change my address?',
  'Does it work on a Mac?',
  "Why can't I log in?",
  'Where did my file go?',
  'Can I share my account?',
  'Is this the latest version?',
  'How do I turn on dark mode?',
  'Can I get an invoice?',
  'Why did my order split?',
  'Can I pause my subscription?',
  'Is gift wrap available?',
  'Where do I enter a coupon?',
  'Can I change my email?',
  'Do you price match?',
  'What does this error mean?',
  'Can I book a demo?',
  'How do I sync my phone?',
  'Is support open on Sunday?',
  'Why was my card declined?',
  'Hello? Anyone there?',
];

const QUERY_FONT: FontSpec = { ...font('body', 21), weight: 500 };
const BADGE_FONT: FontSpec = { ...font('display', 15), letterSpacing: 0 };
const PAD = { x: 20, y: 15 };
/** Bubbles never touch: this much space is kept around each (badges included). */
const GAP = 18;

/**
 * Timing (3 s in all): a few bubbles arrive slowly, each with a ding, then the
 * flood accelerates until the screen is covered, and the last one lands.
 */
const T = {
  first: 0.12,
  /** How many arrive slowly (each with a ding) before the pace picks up. */
  slow: 5,
  /** The flood: from the end of the slow arrivals until the screen is covered. */
  floodEnd: 2.05,
  /** The last bubble, on top in the centre. */
  final: 2.2,
  duration: 3,
} as const;
/** Pop length while slow, and in the flood (shorter, so everything has landed well before the end). */
const POP = { slow: 0.5, fast: 0.32 } as const;

/** App icons drawn as simple generic glyphs (no real brand marks), white on a coloured tile. */
const ICONS = [
  {
    color: colors.blue,
    glyph:
      'M-8 -6 h16 a3 3 0 0 1 3 3 v7 a3 3 0 0 1 -3 3 h-9 l-5 4 v-4 h-2 a3 3 0 0 1 -3 -3 v-7 a3 3 0 0 1 3 -3 z',
  }, // chat
  { color: colors.orange, glyph: 'M-9 -6 h18 v12 h-18 z M-9 -6 l9 7 l9 -7' }, // mail
  {
    color: colors.violet,
    glyph:
      'M0 -9 a6 6 0 0 1 6 6 v5 l2 3 h-16 l2 -3 v-5 a6 6 0 0 1 6 -6 z M-2.5 7 h5 a2.5 2.5 0 0 1 -5 0 z',
  }, // bell
  { color: colors.lime, glyph: 'M-8 -6 h16 v14 h-16 z M-8 -2 h16 M-4 -9 v5 M4 -9 v5' }, // calendar
] as const;

interface Bubble {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly at: number;
  /** How long its pop takes, s. */
  readonly pop: number;
  /** From this time on it is buried under later bubbles and not drawn. */
  readonly hiddenAt: number;
  /** A red unread count, or an app icon. */
  readonly badge:
    | { readonly kind: 'count'; readonly n: number }
    | { readonly kind: 'icon'; readonly icon: number };
}

/**
 * Lays the bubbles out, the same on every render (seeded):
 *
 * 1. The first in the centre, then others at seeded positions where they touch
 *    nothing, appearing roughly from the centre outwards, shuffled.
 * 2. The flood: the frame is sampled every 2 px, and each new bubble is put
 *    over a point that still shows background (anywhere, even half off the
 *    edge), until no background is left anywhere.
 * 3. The last query in the centre, on top of everything.
 *
 * Widths come from a generous estimate (0.56 em a character; Inter at this
 * size measures 0.46–0.54), so the layout needs no font and the soundtrack can
 * be built from it. Bubbles are drawn at exactly these sizes (text centred),
 * so the coverage check is exact.
 */
interface Placed {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly text: string;
}

function layout(seed: string): Bubble[] {
  const rng = createRng(seed);
  const h = Math.round(QUERY_FONT.size * (QUERY_FONT.lineHeight ?? 1.35) + 2 * PAD.y);
  const widthOf = (text: string) => Math.round(text.length * QUERY_FONT.size * 0.56 + 2 * PAD.x);

  // 1. Clear placements.
  const clean: Placed[] = [];
  const clear = (x: number, y: number, w: number) =>
    clean.every(
      (b) => Math.abs(b.x - x) > (b.w + w) / 2 + GAP || Math.abs(b.y - y) > (b.h + h) / 2 + GAP,
    );
  const body = QUERIES.slice(0, -1);
  for (const [i, text] of body.entries()) {
    const w = widthOf(text);
    if (i === 0) {
      clean.push({ x: W / 2, y: H / 2, w, h, text });
      continue;
    }
    for (let attempt = 0; attempt < 400; attempt++) {
      const x = lerp(w / 2 + 24, W - w / 2 - 24, rng.next());
      const y = lerp(h / 2 + 30, H - h / 2 - 22, rng.next());
      if (clear(x, y, w)) {
        clean.push({ x, y, w, h, text });
        break;
      }
    }
  }
  const outward = clean
    .map((b, i) => ({
      b,
      key: i === 0 ? -1 : Math.hypot((b.x - W / 2) / W, (b.y - H / 2) / H) + rng.next() * 0.35,
    }))
    .sort((p, q) => p.key - q.key)
    .map((p) => p.b);

  // 2. The flood, until every sampled point is covered.
  const STEP = 2;
  const INSET = 2.5;
  const [cols, rows] = [Math.ceil(W / STEP) + 1, Math.ceil(H / STEP) + 1];
  const covered = new Uint8Array(cols * rows);
  const inside = (b: Placed, px: number, py: number) => {
    // A pill (a rectangle with semicircular ends), shrunk by `INSET`: a point
    // only counts as covered well inside a bubble, so neighbours always
    // overlap and no hairline of the room shows between them (or at the
    // frame's edge) where anti-aliased edges merely touch.
    const r = b.h / 2;
    const dx = Math.max(Math.abs(px - b.x) - (b.w / 2 - r), 0);
    const dy = Math.abs(py - b.y);
    return dx * dx + dy * dy <= (r - INSET) ** 2;
  };
  const cover = (b: Placed) => {
    const [c0, c1] = [
      Math.max(0, Math.floor((b.x - b.w / 2) / STEP)),
      Math.min(cols - 1, Math.ceil((b.x + b.w / 2) / STEP)),
    ];
    const [r0, r1] = [
      Math.max(0, Math.floor((b.y - b.h / 2) / STEP)),
      Math.min(rows - 1, Math.ceil((b.y + b.h / 2) / STEP)),
    ];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) if (inside(b, c * STEP, r * STEP)) covered[r * cols + c] = 1;
    }
  };
  outward.forEach(cover);
  const flood: Placed[] = [];
  for (let n = 0; n < 2000; n++) {
    const open: number[] = [];
    covered.forEach((v, i) => {
      if (!v) open.push(i);
    });
    if (open.length === 0) break;
    const target = open[Math.floor(rng.next() * open.length)] as number;
    const [px, py] = [(target % cols) * STEP, Math.floor(target / cols) * STEP];
    const text = body[(outward.length + n) % body.length] as string;
    const w = widthOf(text);
    // Somewhere that puts the open point well inside the bubble.
    const b = {
      x: px + (rng.next() - 0.5) * (w - h) * 0.8,
      y: py + (rng.next() - 0.5) * h * 0.5,
      w,
      h,
      text,
    };
    flood.push(b);
    cover(b);
  }

  // 3. The last word.
  const finalText = QUERIES.at(-1) as string;
  const final: Placed = { x: W / 2, y: H / 2, w: widthOf(finalText), h, text: finalText };

  const ordered = [...outward, ...flood];
  const slowEnd = appearSlow(T.slow);
  return [
    ...ordered.map((b, i) => {
      let at: number;
      if (i < T.slow) at = appearSlow(i);
      else {
        // Accelerating: gaps shrink steadily until the last of the flood.
        const k = (i - T.slow + 1) / (ordered.length - T.slow);
        at = slowEnd + (T.floodEnd - slowEnd) * k ** 0.55;
      }
      return { ...b, at, pop: i < T.slow ? POP.slow : POP.fast };
    }),
    { ...final, at: T.final, pop: POP.slow },
  ].map((b, i, all) => ({
    ...b,
    badge:
      rng.next() < 0.6
        ? { kind: 'count' as const, n: 1 + Math.floor(rng.next() ** 2 * 12) }
        : { kind: 'icon' as const, icon: Math.floor(rng.next() * ICONS.length) },
    hiddenAt: hiddenFrom(b, all.slice(i + 1)),
  }));
}

/**
 * When a bubble is completely buried under later bubbles that have finished
 * popping, it can no longer be seen, so it stops being drawn (hundreds of
 * blurred shadows otherwise slow playback as the screen fills). The test
 * covers its badge, tail and shadow too, so dropping it changes no pixels;
 * points off-screen count as covered.
 */
function hiddenFrom(
  b: Placed,
  later: readonly (Placed & { readonly at: number; readonly pop: number })[],
): number {
  const [x0, x1] = [b.x - b.w / 2 - 12, b.x + b.w / 2 + 12];
  const [y0, y1] = [b.y - b.h / 2 - 18, b.y + b.h / 2 + 24];
  const near = later.filter(
    (o) => o.x + o.w / 2 > x0 && o.x - o.w / 2 < x1 && o.y + o.h / 2 > y0 && o.y - o.h / 2 < y1,
  );
  const inPill = (o: Placed, px: number, py: number) => {
    const r = o.h / 2;
    const dx = Math.max(Math.abs(px - o.x) - (o.w / 2 - r), 0);
    return dx * dx + (py - o.y) ** 2 <= (r - 1.5) ** 2; // a hair inside, clear of anti-aliasing
  };
  let hidden = 0;
  for (let py = y0; py <= y1; py += 3) {
    for (let px = x0; px <= x1; px += 3) {
      if (px < 0 || px > W || py < 0 || py > H) continue;
      let first = Infinity;
      for (const o of near) {
        // A bubble covers fully once its pop (and its overshoot) has settled.
        if (inPill(o, px, py)) first = Math.min(first, o.at + o.pop);
      }
      hidden = Math.max(hidden, first);
      if (hidden === Infinity) return Infinity;
    }
  }
  return hidden;
}

/** The slow arrivals: gaps of 0.3 s shrinking by a fifth each time. */
function appearSlow(i: number): number {
  let t = T.first;
  for (let k = 0; k < i; k++) t += 0.3 * 0.8 ** k;
  return t;
}

/** The camera starts close on the first bubble and pulls back as the flood begins. */
const zoom = keyframes(
  [
    { at: 0, value: 1.5 },
    { at: appearSlow(1), value: 1.5 },
    { at: T.floodEnd - 0.4, value: 1, ease: easing.camera },
  ],
  lerp,
);

function bubbleNode(
  b: Bubble,
  i: number,
  t: number,
  measure: Measure,
  harden = 0,
): SceneNode | null {
  const p = progress(t, b.at, b.pop, easing.snap);
  if (p <= 0 || t >= b.hiddenAt) return null;
  const [hw, hh] = [b.w / 2, b.h / 2];
  // The last bubble is the punchline: inverted (light on the dark wall the flood has made).
  const last = b.text === QUERIES.at(-1);
  // Hardening (scene 2) sinks every colour into the wall's; at 0 nothing changes.
  const hard = (c: string) => (harden > 0 ? mixColors(c, colors.ink, harden) : c);
  const [surface, ink] = (last ? [colors.paper, colors.ink] : [colors.ink, colors.paper]).map(
    hard,
  ) as [string, string];
  const children: SceneNode[] = [
    // The tail, then the body, sharing one shadow so they read as one shape.
    shapeNode(`q${i}-tail`, {
      geometry: pathGeometry(
        `M ${-hw + 16} ${hh - 6} L ${-hw + 12} ${hh + 10} L ${-hw + 34} ${hh - 6} Z`,
      ),
      fill: surface,
    }),
    shapeNode(`q${i}-body`, {
      geometry: rect(0, 0, b.w, b.h, b.h / 2),
      fill: surface,
      // The first few get a full soft shadow; the flood, which lands mostly on
      // other bubbles, a single small one (far cheaper to draw).
      shadow:
        i < T.slow || last
          ? elevationShadows(lighting, last ? 'high' : 'mid', {
              strength: last ? 1.4 : 0.55,
              lift: lerp(2.2, 1, clamp(p)),
            })
          : { x: 0, y: lerp(9, 4, clamp(p)), blur: 10, color: withAlpha(lighting.shadow, 0.32) },
    }),
    textNode(`q${i}-text`, {
      text: b.text,
      font: QUERY_FONT,
      fill: ink,
      // Centred: the bubble is sized from an estimate a little wider than the text.
      transform: { x: -measure(b.text, QUERY_FONT) / 2, y: -hh + PAD.y },
    }),
  ];
  // The badge pops a beat after its bubble.
  const q = progress(t, b.at + b.pop * 0.22, b.pop * 0.8, easing.snap);
  if (q > 0) {
    if (b.badge.kind === 'count') {
      const label = String(b.badge.n);
      const r = 14;
      const bw = Math.max(2 * r, measure(label, BADGE_FONT) + 14);
      children.push(
        groupNode(
          `q${i}-badge`,
          [
            shapeNode(`q${i}-badge-dot`, {
              geometry: rect(0, 0, bw, 2 * r, r),
              fill: hard(colors.alert),
              stroke: { color: hard(colors.paper), width: 3 },
            }),
            textNode(`q${i}-badge-n`, {
              text: label,
              font: BADGE_FONT,
              fill: hard(colors.light),
              transform: {
                x: -measure(label, BADGE_FONT) / 2,
                y: (-BADGE_FONT.size * (BADGE_FONT.lineHeight ?? 1.05)) / 2,
              },
            }),
          ],
          { transform: { x: hw - 10, y: -hh + 2, scale: q } },
        ),
      );
    } else {
      const icon = ICONS[b.badge.icon] ?? ICONS[0];
      children.push(
        groupNode(
          `q${i}-icon`,
          [
            shapeNode(`q${i}-icon-tile`, {
              geometry: rect(0, 0, 32, 32, 9),
              fill: hard(icon.color),
              stroke: { color: hard(colors.paper), width: 3 },
            }),
            shapeNode(`q${i}-icon-glyph`, {
              geometry: pathGeometry(icon.glyph),
              fill: icon === ICONS[1] || icon === ICONS[3] ? 'transparent' : hard(colors.light),
              stroke: { color: hard(colors.light), width: 2, join: 'round', cap: 'round' },
            }),
          ],
          { transform: { x: -hw + 8, y: -hh + 2, scale: q } },
        ),
      );
    }
  }
  return groupNode(`q${i}`, children, {
    // Pops out from its tail, with a slight turn that settles.
    // The pivot (`origin`) is what lands at (x, y): offset by it so the bubble's centre is (b.x, b.y).
    // The last word lands larger, grown from its centre so it stays centred.
    transform: last
      ? { x: b.x, y: b.y, scale: p * 1.45, rotation: lerp(-6, 0, clamp(p)) }
      : {
          x: b.x - hw + 14,
          y: b.y + hh + 8,
          scale: p,
          rotation: lerp(-6, 0, clamp(p)),
          originX: -hw + 14,
          originY: hh + 8,
        },
    opacity: clamp(p * 4),
  });
}

type Measure = (text: string, font: FontSpec) => number;

const SEED = 'query-bubbles';
const BUBBLES = layout(SEED);

/**
 * Each of the slow arrivals pops and dings, panned to where it appears. Once
 * the pace picks up the dings stop: the flood is a patter of soft pops under
 * a rising rush of air. The last bubble lands with a ding of its own.
 */
const FINAL = BUBBLES.length - 1;
const audio = soundtrack([
  cue(0, pad(T.final + 0.2, { chord: 'lift', attack: 0.8, release: 0.9, gain: 0.85 })),
  cue(
    appearSlow(T.slow),
    whoosh(T.floodEnd - appearSlow(T.slow), { from: 300, to: 4200, peak: 0.95, gain: 1.6 }),
  ),
  BUBBLES.map((b, i) => {
    const pan = clamp((b.x - W / 2) / (W / 2), -1, 1) * 0.6;
    if (i === FINAL) {
      return [
        cue(b.at, pop({ degree: 4, take: i })),
        cue(b.at + 0.02, ding({ degree: 4, octave: 4, gain: 1.1 })),
        cue(b.at, thump({ gain: 0.7 })),
      ];
    }
    if (i < T.slow) {
      return [
        cue(b.at, pop({ degree: i % 5, take: i, pan, gain: 0.8 })),
        cue(b.at + 0.02, ding({ degree: [4, 2, 5, 7, 4][i] ?? 4, pan })),
      ];
    }
    // The flood: quieter the faster they come.
    const gap = (BUBBLES[i + 1]?.at ?? b.at + 0.1) - b.at;
    return cue(b.at, pop({ degree: i % 5, take: i, pan, gain: clamp(gap / 0.2, 0.22, 0.7) }));
  }),
]);

function createMeasure(): Measure {
  const measurer = createCanvasMeasurer();
  return (text, spec) => measurer.measure(text, spec);
}

/** The light room behind the bubbles (its look, for anything that must match it). */
export const ROOM = {
  width: W,
  height: H,
  centre: colors.paper,
  edge: mixColors(colors.paper, colors.muted, 0.28),
} as const;
const room = backdrop('backdrop', lighting, ROOM);

/**
 * This scene's drawing, for the next scene to pick up from its exact last
 * frame: `world(wall.end, measure)` is that frame, and `harden` (0–1) sinks
 * every bubble's colours into one dark surface.
 */
export const wall = {
  end: T.duration,
  fonts: [QUERY_FONT, BADGE_FONT] as const,
  createMeasure,
  room,
  camera: (t: number): Camera => ({ x: W / 2, y: H / 2, zoom: zoom(t), rotation: 0 }),
  world: (t: number, measure: Measure, harden = 0): SceneNode[] => [
    room,
    ...BUBBLES.map((b, i) => bubbleNode(b, i, t, measure, harden)).filter(
      (n): n is SceneNode => n !== null,
    ),
  ],
};

export type { Measure };

export default defineSceneComposition({
  ...phoneDefaults,
  fonts: [...phoneDefaults.fonts, QUERY_FONT, BADGE_FONT],
  id: 'query-bubbles',
  seed: SEED,
  audio,
  title: 'Queries pile up',
  duration: T.duration,
  background: colors.paper,
  renderer: 'svg',
  setup: createMeasure,
  scene: (t, _ctx, measure) => ({ camera: wall.camera(t), world: wall.world(t, measure) }),
});
