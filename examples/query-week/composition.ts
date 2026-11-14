import {
  clamp,
  createCanvasMeasurer,
  groupNode,
  lerp,
  mixColors,
  pathGeometry,
  progress,
  random,
  rect,
  shapeNode,
  withAlpha,
  type FontSpec,
  type SceneNode,
  type TextMeasurer,
} from '@html-animation-engine/core';
import {
  defineSceneComposition,
  elevationShadows,
  litFill,
  type Elevation,
} from '@html-animation-engine/renderers';
import { APPS_FONTS } from '../cowork-apps.js';
import {
  F,
  MARK_COLORS,
  UI,
  box,
  checkDisc,
  clockText,
  createUi,
  icon,
  label,
  type Ui,
} from '../cowork-ui.js';
import { font, lighting, phoneDefaults, theme } from '../index.js';
import { proof } from '../query-proof/composition.js';
import { wall } from '../query-bubbles/composition.js';
import { CX, HEADLINE, caption, type Caption } from '../query-story.js';
import {
  changeTimes,
  cue,
  ding,
  pad,
  rustle,
  slap,
  snap,
  soundtrack,
  thump,
  tick,
  whoosh,
} from '../sounds.js';

const { colors, easing } = theme;

/**
 * The hook: a whole week of digging, condensed. The last recording turns
 * into a desk calendar's Monday, piled with emails, files and chats; the
 * week flips past; the five days fold together into one finished report
 * while its clock ticks to a stop at 18:40; then its stamps go on.
 */
const T = {
  /** The recording becomes Monday's page. */
  morph: { blank: 0.18, start: 0.12, duration: 0.42 },
  /**
   * Page k (Mon–Thu) flips up at flip.start + k × flip.each. Each flip sweeps
   * a white page through the red band, so they are spaced for at most three
   * in any second (WCAG 2.3.1).
   */
  flip: { start: 0.62, each: 0.38, duration: 0.26 },
  /** The five days, side by side. */
  row: { start: 2.2, duration: 0.38 },
  /** Item k flies into the report at fly.start + fly.span × k / last. */
  fly: { start: 2.58, span: 0.5, move: 0.42 },
  card: { start: 2.62, duration: 0.6 },
  clock: { start: 2.8, end: 3.45 },
  caption: [2.4, 2.92],
  stamps: [3.75, 3.95, 4.15],
  duration: 5,
} as const;

const DAYS = ['Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.'] as const;
const PAGE = { x: CX, y: 690, w: 500, h: 600, band: 128, r: 24 } as const;
const MINI = { y: 700, scale: 0.26, xs: [72, 216, 360, 504, 648] } as const;
const CARD = { x: CX, y: 700, w: 470, h: 310, r: 22 } as const;
const BAND = mixColors(colors.alert, colors.ink, 0.12);

const DAY_FONT: FontSpec = { ...font('display', 66), letterSpacing: -2, lineHeight: 1 };
const STAMP_FONT: FontSpec = { ...font('display', 22), letterSpacing: 0.4, lineHeight: 1.1 };
const WEEK_FONTS = [DAY_FONT, STAMP_FONT] as const;

type Kind = 'mail' | 'file' | 'chat';
interface Item {
  readonly kind: Kind;
  /** Centre, relative to its page's centre. */
  readonly x: number;
  readonly y: number;
  readonly rot: number;
}

/** Each day's pile, growing through the week, in seeded disorder. */
const PILES: readonly (readonly Item[])[] = DAYS.map((_, d) =>
  Array.from({ length: 5 + d }, (_, k): Item => {
    const r = (key: string) => random('query-week', key, d, k);
    return {
      kind: (['mail', 'file', 'chat'] as const)[Math.floor(r('kind') * 3)] ?? 'mail',
      x: (r('x') - 0.5) * 230,
      y: 75 + (r('y') - 0.5) * 250 - k * 5,
      rot: (r('rot') - 0.5) * 30,
    };
  }),
);
/** Items' size on a full page. */
const ITEM = 1.3;
const ALL = PILES.flatMap((pile, d) => pile.map((item, k) => ({ item, d, k })));

const flipAt = (k: number) => T.flip.start + k * T.flip.each;
const flyAt = (n: number) => T.fly.start + (T.fly.span * n) / (ALL.length - 1);
/** The clock on the report, ticking its last seconds to a stop. */
const seconds = (t: number) =>
  Math.round(lerp(1111, 1120, progress(t, T.clock.start, T.clock.end - T.clock.start)));

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function itemNode(id: string, kind: Kind, x: number, y: number, rot: number, s: number, o: number) {
  const kids: SceneNode[] = [];
  const shadow = elevationShadows(lighting, 'low', { strength: 0.5 });
  if (kind === 'mail') {
    kids.push(
      box(`${id}-bg`, -66, -44, 132, 88, 10, { fill: UI.surface, shadow }),
      icon(`${id}-ic`, 'mail', -44, -22, 20, UI.accent),
      box(`${id}-l1`, -28, -27, 78, 8, 4, { fill: UI.line }),
      box(`${id}-l2`, -50, 0, 100, 7, 3.5, { fill: UI.wash }),
      box(`${id}-l3`, -50, 16, 72, 7, 3.5, { fill: UI.wash }),
    );
  } else if (kind === 'file') {
    kids.push(
      shapeNode(`${id}-bg`, {
        geometry: pathGeometry('M-46 -60H24L50 -34V60H-46Z'),
        fill: UI.surface,
        shadow,
      }),
      shapeNode(`${id}-fold`, { geometry: pathGeometry('M24 -60V-34H50Z'), fill: UI.line }),
      box(`${id}-tag`, -32, -42, 34, 12, 4, { fill: UI.warmSoft }),
      ...[0, 1, 2, 3].map((k) =>
        box(`${id}-l${k}`, -32, -16 + k * 16, k === 3 ? 44 : 66, 6, 3, { fill: UI.wash }),
      ),
    );
  } else {
    kids.push(
      shapeNode(`${id}-bg`, {
        geometry: pathGeometry(
          'M-56 -34H56A12 12 0 0 1 68 -22V18A12 12 0 0 1 56 30H-24L-44 46V30H-56A12 12 0 0 1 -68 18V-22A12 12 0 0 1 -56 -34Z',
        ),
        fill: UI.accentSoft,
        shadow,
      }),
      box(`${id}-l1`, -52, -18, 96, 8, 4, { fill: UI.accentLine }),
      box(`${id}-l2`, -52, 0, 64, 8, 4, { fill: UI.accentLine }),
    );
  }
  return groupNode(id, kids, { transform: { x, y, rotation: rot, scale: s }, opacity: o });
}

/** A calendar page (day `d`) centred on (x, y), `s` its scale; `flip` 0–1 folds it up. */
function pageNode(
  ui: Ui,
  d: number,
  x: number,
  y: number,
  s: number,
  o: number,
  flip = 0,
  items = true,
) {
  const kids: SceneNode[] = [
    box(`page${d}-bg`, -PAGE.w / 2, -PAGE.h / 2, PAGE.w, PAGE.h, PAGE.r, {
      fill: UI.surface,
      shadow: elevationShadows(lighting, 'mid', { strength: 0.45 }),
    }),
    shapeNode(`page${d}-band`, {
      geometry: pathGeometry(
        `M${-PAGE.w / 2} ${-PAGE.h / 2 + PAGE.band}V${-PAGE.h / 2 + PAGE.r}A${PAGE.r} ${PAGE.r} 0 0 1 ${-PAGE.w / 2 + PAGE.r} ${-PAGE.h / 2}H${PAGE.w / 2 - PAGE.r}A${PAGE.r} ${PAGE.r} 0 0 1 ${PAGE.w / 2} ${-PAGE.h / 2 + PAGE.r}V${-PAGE.h / 2 + PAGE.band}Z`,
      ),
      fill: litFill(lighting, BAND, { y: -PAGE.h / 2 + PAGE.band / 2, height: PAGE.band }),
    }),
    label(`page${d}-day`, DAYS[d] ?? '', 0, -PAGE.h / 2 + 30, DAY_FONT, colors.light, {
      align: 'center',
    }),
    ...[-150, 150].map((rx, k) =>
      box(`page${d}-ring${k}`, rx - 9, -PAGE.h / 2 - 12, 18, 30, 9, {
        fill: litFill(lighting, mixColors(UI.line, UI.ink, 0.35), {
          y: -PAGE.h / 2 + 3,
          height: 30,
        }),
      }),
    ),
  ];
  if (items) {
    PILES[d]?.forEach((item, k) =>
      kids.push(itemNode(`page${d}-i${k}`, item.kind, item.x, item.y, item.rot, ITEM, 1)),
    );
  }
  if (flip > 0) {
    kids.push(
      box(`page${d}-shade`, -PAGE.w / 2, -PAGE.h / 2, PAGE.w, PAGE.h, PAGE.r, {
        fill: withAlpha(UI.shade, 0.2 * flip),
      }),
    );
  }
  void ui;
  return groupNode(`page${d}`, kids, {
    transform: { x, y: y - (PAGE.h / 2) * s, scale: s, scaleY: 1 - flip, originY: -PAGE.h / 2 },
    opacity: o,
  });
}

/**
 * The finished report. `morph` 0–1 turns it into the Cowork tile (for the
 * outro): it turns over as it shrinks to a square, and its back is the dark
 * tile with the mark.
 */
function reportCard(ui: Ui, t: number, appear: number, morph = 0, sheen = 0): SceneNode | null {
  if (appear <= 0) return null;
  const m = progress(morph, 0, 1, easing.camera);
  const tile = { y: 470, size: 200, r: 50 };
  const w = lerp(CARD.w, tile.size, m);
  const h = lerp(CARD.h, tile.size, m);
  const y = lerp(CARD.y, tile.y, m);
  const r = lerp(CARD.r, tile.r, m);
  // Turning over: the front narrows to an edge, then the back opens out.
  const back = m >= 0.5;
  const turn = Math.max(0.02, Math.abs(Math.cos(Math.PI * m)));
  const dark = back ? 1 : 0;
  const fill = mixColors(colors.light, colors.ink, dark);
  const kids: SceneNode[] = [
    shapeNode('card-bg', {
      geometry: rect(0, 0, w, h, r),
      fill: litFill(
        lighting,
        fill,
        { y: 0, height: h },
        { sheen: lighting.sheen * dark, shade: lighting.shade * dark },
      ),
      shadow: elevationShadows(lighting, 'mid' as Elevation, { strength: lerp(0.55, 1.1, dark) }),
    }),
  ];
  const content = back ? 0 : 1;
  if (content > 0) {
    const done = t >= T.clock.end;
    const x0 = -CARD.w / 2 + 28;
    const y0 = -CARD.h / 2;
    kids.push(
      groupNode(
        'card-content',
        [
          label('card-k', 'REPORT · LEVEL 3', x0, y0 + 26, F.tiny, UI.faint),
          label('card-title', 'Supplier delays and promises', x0, y0 + 48, F.title),
          box('card-bl', x0, y0 + 96, CARD.w - 56, 64, 12, { fill: UI.accentSoft }),
          box('card-blbar', x0, y0 + 96, 4, 64, 2, { fill: UI.accent }),
          label(
            'card-blt',
            '3 suppliers caused 71% of late deliveries;',
            x0 + 16,
            y0 + 106,
            F.small,
            UI.text,
          ),
          label(
            'card-blt2',
            '14 customers were promised new dates.',
            x0 + 16,
            y0 + 128,
            F.small,
            UI.text,
          ),
          ...[0.94, 0.61, 0.48].map((v, k) =>
            box(`card-bar${k}`, x0, y0 + 180 + k * 22, 230 * v, 14, 5, { fill: UI.accent }),
          ),
          label('card-el', 'ELAPSED', CARD.w / 2 - 28, y0 + 182, F.tiny, UI.faint, {
            align: 'right',
          }),
          label(
            'card-clock',
            clockText(seconds(t)),
            CARD.w / 2 - 28,
            y0 + 200,
            F.clock,
            done ? UI.good : UI.text,
            {
              align: 'right',
            },
          ),
          ...(done
            ? [
                checkDisc(
                  'card-done',
                  CARD.w / 2 - 140,
                  y0 + 219,
                  9,
                  progress(t, T.clock.end, 0.4, easing.enter),
                ),
              ]
            : []),
        ],
        { opacity: content, transform: { scale: Math.min(w / CARD.w, h / CARD.h) } },
      ),
    );
  }
  const mk = back ? 1 : 0;
  if (mk > 0) {
    // The Cowork mark, in the same proportions as the tile in the intro.
    const cell = 0.21 * tile.size;
    const gap = 0.05 * tile.size;
    MARK_COLORS.forEach((c, k) => {
      const [col, row] = [k % 2, Math.floor(k / 2)];
      const cy = (row - 0.5) * (cell + gap);
      kids.push(
        shapeNode(`card-mark${k}`, {
          geometry: rect((col - 0.5) * (cell + gap), cy, cell, cell, cell * 0.3),
          fill: litFill(lighting, c, { y: cy, height: cell }),
          opacity: mk,
        }),
      );
    });
  }
  if (sheen > 0 && sheen < 1) {
    const sx = lerp(-w, w, sheen);
    kids.push(
      shapeNode('card-sheen', {
        geometry: rect(0, 0, w, h, r),
        fill: {
          type: 'linear',
          x1: sx - 70,
          y1: -h / 2,
          x2: sx + 70,
          y2: h / 2,
          stops: [
            { offset: 0, color: withAlpha(colors.light, 0) },
            { offset: 0.5, color: withAlpha(colors.light, 0.16) },
            { offset: 1, color: withAlpha(colors.light, 0) },
          ],
        },
      }),
    );
  }
  void ui;
  if (m > 0 && m < 1) {
    // The turning face catches less light at a steep angle.
    kids.push(
      shapeNode('card-turn', {
        geometry: rect(0, 0, w, h, r),
        fill: withAlpha(colors.shade, 0.18 * Math.sin(Math.PI * m)),
      }),
    );
  }
  return groupNode('card', kids, {
    transform: { x: CARD.x, y, scale: lerp(0.4, 1, appear), scaleX: turn },
    opacity: clamp(appear * 2.5),
  });
}

const STAMPS = [
  { text: 'Sourced', x: 172, rot: -7 },
  { text: 'Checked', x: 360, rot: 3 },
  { text: 'Shared', x: 548, rot: -4 },
] as const;
const STAMP_Y = 930;

function stampNode(ui: Ui, k: number, t: number, leave: number): SceneNode | null {
  const s = STAMPS[k];
  const at = T.stamps[k];
  if (!s || at === undefined) return null;
  const p = progress(t, at, 0.42, easing.snap);
  if (p <= 0) return null;
  const tw = ui.measure(s.text.toUpperCase(), STAMP_FONT);
  const w = tw + 70;
  const h = 52;
  const ink = UI.good;
  return groupNode(
    `stamp${k}`,
    [
      box(`stamp${k}-o`, -w / 2, -h / 2, w, h, 12, { stroke: { color: ink, width: 3 } }),
      box(`stamp${k}-i`, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 8, {
        stroke: { color: withAlpha(ink, 0.55), width: 1.5 },
      }),
      label(`stamp${k}-t`, s.text.toUpperCase(), -w / 2 + 22, -12, STAMP_FONT, ink),
      icon(`stamp${k}-ck`, 'check', w / 2 - 26, 0, 24, ink, { width: 3 }),
    ],
    {
      // Pressed down from above, like a rubber stamp.
      transform: {
        x: s.x,
        y: STAMP_Y,
        rotation: s.rot,
        scale: lerp(1.5, 1, p) * (1 - 0.15 * leave),
      },
      opacity: clamp(p * 3) * 0.92 * (1 - leave),
    },
  );
}

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------

interface State {
  readonly ui: Ui;
  readonly proof: ReturnType<typeof proof.createState>;
  readonly caption: Caption;
}

function createState(measurer: TextMeasurer): State {
  return {
    ui: createUi(measurer),
    proof: proof.createState(measurer),
    caption: caption(
      'week-cap',
      {
        text: 'A week of digging. | Condensed into *minutes.*',
        at: T.caption,
        font: HEADLINE,
        y: 140,
        maxWidth: 620,
        breaks: [4],
      },
      measurer,
    ),
  };
}

/** Taking the report on into the next scene: everything else leaves (`exit`) as it becomes the tile (`morph`). */
export interface Onward {
  readonly exit: number;
  readonly morph: number;
  readonly sheen: number;
}

function world(
  t: number,
  state: State,
  onward: Onward = { exit: 0, morph: 0, sheen: 0 },
): SceneNode[] {
  const { ui } = state;
  const nodes: SceneNode[] = [];
  // The last recording, blanking to a white page as its card leaves.
  const blank = progress(t, 0, T.morph.blank);
  if (blank < 1)
    nodes.push(
      ...proof.world(proof.duration + t, state.proof, progress(t, 0, T.morph.blank, easing.exit)),
    );
  const m = progress(t, T.morph.start, T.morph.duration, easing.camera);
  if (m < 1) {
    // The recording's window (full width, top on the frame's top) shrinks into Monday's page.
    const from = { x: CX, y: 967 / 2, w: 720, h: 967, r: 27 };
    const g = {
      x: lerp(from.x, PAGE.x, m),
      y: lerp(from.y, PAGE.y, m),
      w: lerp(from.w, PAGE.w, m),
      h: lerp(from.h, PAGE.h, m),
      r: lerp(from.r, PAGE.r, m),
    };
    nodes.push(
      shapeNode('week-morph', {
        geometry: rect(g.x, g.y, g.w, g.h, g.r),
        fill: UI.surface,
        shadow: elevationShadows(lighting, 'mid', { strength: 0.45 * m }),
        opacity: blank,
      }),
    );
  }
  // The week: Monday to Friday, each page flipping up to show the next.
  const row = progress(t, T.row.start, T.row.duration, easing.camera);
  if (m > 0.7 && row <= 0) {
    for (let d = DAYS.length - 1; d >= 0; d--) {
      const f = d < DAYS.length - 1 ? progress(t, flipAt(d), T.flip.duration, easing.exit) : 0;
      const showing = d === 0 || t >= flipAt(d - 1);
      if (!showing || f >= 1) continue;
      const fade = d === 0 ? clamp((m - 0.7) / 0.3) : 1;
      nodes.push(pageNode(ui, d, PAGE.x, PAGE.y, 1, fade, f));
    }
  }
  // The five days side by side, then their piles fly into one report.
  if (row > 0) {
    DAYS.forEach((_, d) => {
      const slot = MINI.xs[d] ?? CX;
      const from =
        d === DAYS.length - 1 ? { x: PAGE.x, y: PAGE.y, s: 1 } : { x: CX, y: -400, s: MINI.scale };
      const p =
        d === DAYS.length - 1
          ? row
          : progress(t, T.row.start + 0.05 * d, T.row.duration, easing.enter);
      const gone = progress(
        t,
        flyAt(PILES.slice(0, d + 1).reduce((n, pile) => n + pile.length, 0) - 1),
        0.3,
        easing.exit,
      );
      if (gone >= 1) return;
      nodes.push(
        groupNode(`mini${d}`, [
          pageNode(
            ui,
            d,
            lerp(from.x, slot, p),
            lerp(from.y, MINI.y, p),
            lerp(from.s, MINI.scale, p),
            1 - gone,
            0,
            false,
          ),
        ]),
      );
    });
    ALL.forEach(({ item, d }, n) => {
      const slot = MINI.xs[d] ?? CX;
      const p =
        d === DAYS.length - 1
          ? row
          : progress(t, T.row.start + 0.05 * d, T.row.duration, easing.enter);
      const from =
        d === DAYS.length - 1 ? { x: PAGE.x, y: PAGE.y, s: 1 } : { x: CX, y: -400, s: MINI.scale };
      const s = lerp(from.s, MINI.scale, p);
      const px = lerp(from.x, slot, p);
      const py = lerp(from.y, MINI.y, p);
      const f = progress(t, flyAt(n), T.fly.move, easing.exit);
      if (f >= 1) return;
      const x = lerp(px + item.x * s, CARD.x, f);
      const y = lerp(py + item.y * s, CARD.y, f) - 60 * Math.sin(Math.PI * f);
      nodes.push(
        itemNode(
          `fly${n}`,
          item.kind,
          x,
          y,
          lerp(item.rot, 0, f),
          s * ITEM * lerp(1, 0.5, f),
          1 - clamp((f - 0.7) / 0.3),
        ),
      );
    });
  }
  const card = reportCard(
    ui,
    t,
    progress(t, T.card.start, T.card.duration, easing.snap),
    onward.morph,
    onward.sheen,
  );
  if (card) nodes.push(card);
  STAMPS.forEach((_, k) => {
    const s = stampNode(ui, k, t, onward.exit);
    if (s) nodes.push(s);
  });
  nodes.push(state.caption(t, onward.exit));
  return nodes;
}

/** This scene, for the next to pick up from its exact last frame. */
export const week = { duration: T.duration, createState, world, fonts: WEEK_FONTS, reportCard };

/**
 * Pages flipping (a slap of paper and a breath of air each), the piles
 * rushing into the report, the clock ticking to a stop on a ding, and three
 * stamps thumping down.
 */
const audio = soundtrack([
  cue(0.05, pad(T.duration - 0.4, { chord: 'shadow', attack: 0.4, release: 1, gain: 0.55 })),
  cue(T.morph.start, whoosh(0.45, { from: 1600, to: 500, peak: 0.4, gain: 0.35 })),
  cue(T.morph.start + T.morph.duration, slap({ gain: 0.45 })),
  DAYS.slice(0, -1).map((_, k) => [
    cue(flipAt(k), whoosh(T.flip.duration, { from: 900, to: 2600, peak: 0.6, gain: 0.3 })),
    cue(flipAt(k) + 0.05, rustle({ take: k, gain: 3 })),
    cue(flipAt(k) + T.flip.duration, slap({ gain: 0.35 })),
  ]),
  cue(T.row.start, whoosh(T.row.duration, { from: 500, to: 1500, peak: 0.5, gain: 0.3 })),
  cue(
    T.fly.start,
    whoosh(T.fly.span + T.fly.move, { from: 300, to: 3200, peak: 0.85, gain: 0.55 }),
  ),
  cue(T.card.start + 0.25, thump({ gain: 0.5 })),
  changeTimes(seconds, T.clock.start, T.clock.end).map((at, k) =>
    cue(at, tick({ degree: 4, gain: 0.45, pan: k % 2 ? 0.15 : -0.15 })),
  ),
  cue(T.clock.end, ding({ degree: 4, gain: 0.5 })),
  T.stamps.map((at, k) => [
    cue(at + 0.06, thump({ gain: 0.45, pan: ((STAMPS[k]?.x ?? CX) - CX) / CX })),
    cue(
      at + 0.06,
      snap({
        degree: [0, 2, 4][k] ?? 0,
        take: k,
        gain: 0.5,
        pan: ((STAMPS[k]?.x ?? CX) - CX) / CX,
      }),
    ),
  ]),
]);

export default defineSceneComposition({
  ...phoneDefaults,
  fonts: [...phoneDefaults.fonts, ...APPS_FONTS, ...proof.fonts, ...WEEK_FONTS],
  id: 'query-week',
  seed: 'query-week',
  audio,
  title: 'A week, condensed',
  duration: T.duration,
  background: colors.paper,
  renderer: 'svg',
  setup: () => createState(createCanvasMeasurer()),
  scene: (t, _ctx, state) => ({
    camera: wall.camera(wall.end),
    world: [wall.room, ...world(t, state)],
  }),
});
