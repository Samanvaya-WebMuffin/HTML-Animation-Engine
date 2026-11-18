/**
 * The Cowork mood board: the whole queries video laid out on one canvas.
 * Each scene is a group of ideas at its own place on the board; threads run
 * from group to group along the story, coloured by what carries over; the
 * aurora behind lights each group in its scene's meaning. The camera travels
 * this board (scene 2, the crack, happens to scene 1's wall in place).
 *
 * Phase 2: every group is drawn at its key moment (style frames). Each group
 * is a function of its board origin, laid out in a 720 × 1280 frame.
 */
import {
  baselineOffset,
  clamp,
  groupNode,
  imageNode,
  lerp,
  progress,
  mixColors,
  linearGradient,
  radialGradient,
  random,
  rect,
  shapeNode,
  textNode,
  withAlpha,
  pathGeometry,
  type FontSpec,
  type SceneNode,
  type TextMeasurer,
} from '@html-animation-engine/core';
import {
  connector,
  elbow,
  elevationShadows,
  litFill,
  kineticText,
  roundedRoute,
  type AuroraPool,
  type BoardView,
  type KineticText,
} from '@html-animation-engine/renderers';
import {
  C,
  P,
  T,
  createLook,
  face,
  glassPanel,
  icon,
  lighting,
  look,
  sparkleStar,
  timeRing,
  tone,
  type IconName,
  HEAD,
  headlineCard,
  makeHeadline,
  type HeadSpec,
  type Headline,
  urgency,
  type Look,
  type Meaning,
} from './cowork-look.js';
import {
  chartPage,
  createPaperTextures,
  indexCard,
  notebookPage,
  pin,
  printedPage,
  scrap,
  stickyNote,
  tape,
  type PaperTextures,
  type Placed,
} from './cowork-paper.js';
import { SFX_DIV, beats, gridTimes, onGrid } from './cowork-beat.js';
import { createUi, type Ui } from './cowork-ui.js';
import { ASK, answersArt, askArt, workArt } from './cowork-scenes.js';
import { PILES, TILE, pile, preloadPileLogos, type PileKind } from './cowork-piles.js';

const { easing } = look;
export const FW = 720;
export const FH = 1280;

// ---------------------------------------------------------------------------
// Layout: where each group sits, what lights it, how threads join them
// ---------------------------------------------------------------------------

export type GroupId =
  'queries' | 'lost' | 'criteria' | 'intro' | 'ask' | 'work' | 'answers' | 'outro';

interface GroupSpec {
  readonly id: GroupId;
  /** Top-left of the group's 720 × 1280 frame on the board. */
  readonly x: number;
  readonly y: number;
  /** The scene's helper colour (its aurora hint), besides violet. */
  readonly hint: keyof typeof C.aurora;
}

const COL = 1080;
const ROW = 1760;
/** Three rows along the story: the problem, the product, the payoff. */
export const GROUPS: readonly GroupSpec[] = [
  { id: 'queries', x: 0, y: 0, hint: 'friction' },
  { id: 'lost', x: COL, y: 90, hint: 'time' },
  { id: 'criteria', x: 2 * COL, y: -40, hint: 'knowledge' },
  { id: 'intro', x: 3 * COL, y: 60, hint: 'outcome' },
  { id: 'ask', x: 3 * COL, y: ROW, hint: 'knowledge' },
  { id: 'work', x: 2 * COL, y: ROW + 80, hint: 'time' },
  { id: 'answers', x: COL, y: ROW - 50, hint: 'insight' },
  { id: 'outro', x: COL, y: 2 * ROW + 40, hint: 'outcome' },
];

export function group(id: GroupId): GroupSpec {
  const g = GROUPS.find((s) => s.id === id);
  if (!g) throw new Error(`board: no group ${id}`);
  return g;
}

/** The view that frames a group. */
export function groupView(id: GroupId, zoom = 1): BoardView {
  const g = group(id);
  return { x: g.x + FW / 2, y: g.y + FH / 2, zoom };
}

/** Everything: the view that fits the whole board in the frame. */
export function overviewView(): BoardView {
  const xs = GROUPS.flatMap((g) => [g.x, g.x + FW]);
  const ys = GROUPS.flatMap((g) => [g.y, g.y + FH]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const zoom = Math.min((FW - 80) / (x1 - x0), (FH - 260) / (y1 - y0));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + 40, zoom };
}

/** What each thread carries from one group to the next. */
const THREADS: readonly { from: GroupId; to: GroupId; meaning: Meaning }[] = [
  { from: 'queries', to: 'lost', meaning: 'friction' },
  { from: 'lost', to: 'criteria', meaning: 'knowledge' },
  { from: 'criteria', to: 'intro', meaning: 'brand' },
  { from: 'intro', to: 'ask', meaning: 'brand' },
  { from: 'ask', to: 'work', meaning: 'knowledge' },
  { from: 'work', to: 'answers', meaning: 'knowledge' },
  { from: 'answers', to: 'outro', meaning: 'brand' },
];

/** The route of a thread: out of one group's side, round the corner, into the next. */
function threadRoute(from: GroupSpec, to: GroupSpec) {
  const sameRow = Math.abs(from.y - to.y) < ROW / 2;
  if (sameRow) {
    const right = to.x > from.x;
    const a = { x: right ? from.x + FW + 30 : from.x - 30, y: from.y + FH * 0.55 };
    const b = { x: right ? to.x - 30 : to.x + FW + 30, y: to.y + FH * 0.45 };
    return elbow(a, b, 'horizontal');
  }
  const a = { x: from.x + FW / 2, y: from.y + FH + 40 };
  const b = { x: to.x + FW / 2, y: to.y - 40 };
  return elbow(a, b, 'vertical');
}

/** All the threads, drawn fully, with a pulse partway along each (style frames). */
/**
 * The threads between groups. With `flights` (each thread's flight start, or
 * null while it isn't travelled yet), a thread draws itself on as the camera
 * sets off along it, and a light pulse travels its length during the
 * flight; without, every thread is drawn with a pulse partway (style frames).
 */
export function threads(
  width = 3,
  t = SETTLED,
  flights?: readonly (readonly [start: number, duration: number] | null)[],
): SceneNode[] {
  return THREADS.flatMap((th, k) => {
    const route = threadRoute(group(th.from), group(th.to));
    const tn = tone(th.meaning);
    const flight = flights ? flights[k] : undefined;
    if (flights && !flight) return [];
    const [start, duration] = flight ?? [0, 2];
    return [
      connector({
        id: `thread${k}`,
        d: roundedRoute(route, 60),
        color: withAlpha(tn.fill, 0.45),
        width,
        start: flight ? start - 0.6 : 0,
        duration: flight ? 0.7 : 0.001,
        ease: flight ? easing.camera : easing.linear,
        dots: [0.15, 0.5, 0.85],
        dotColor: tn.fill,
        // One glowing pulse runs the thread once, unhurried: it sets off just
        // before the camera and arrives a little after it has landed.
        pulses: [
          {
            at: flight ? start - 0.35 : 0,
            duration: flight ? duration + 0.85 : duration,
            color: tn.fill,
            size: 2 * width,
          },
        ],
        pulseEase: easing.drift,
        glow: 1,
      })(flight ? t : 0.6 + 0.25 * random('thread', k)),
    ];
  });
}

/** The aurora: violet pools across the board, one hint pool per group in its meaning. */
export function auroraPools(): AuroraPool[] {
  const pools: AuroraPool[] = [];
  GROUPS.forEach((g, k) => {
    const r = (key: string) => random('aurora', key, k);
    pools.push(
      {
        x: g.x + FW * (r('px') < 0.5 ? 0.1 : 0.9),
        y: g.y + FH * (0.15 + 0.2 * r('py')),
        rx: 420 + 120 * r('prx'),
        ry: 330 + 90 * r('pry'),
        rotation: -30 + 60 * r('prot'),
        color: C.aurora.primary,
        alpha: g.id === 'intro' || g.id === 'outro' ? 0.4 : 0.3,
      },
      {
        x: g.x + FW * (r('sx') < 0.5 ? 0.85 : 0.15),
        y: g.y + FH * (0.75 + 0.15 * r('sy')),
        rx: 400,
        ry: 300,
        rotation: 20,
        color: C.aurora.soft,
        alpha: 0.34,
      },
      {
        x: g.x + FW * (0.3 + 0.4 * r('hx')),
        y: g.y + FH * (0.45 + 0.25 * r('hy')),
        rx: 300,
        ry: 220,
        rotation: -15,
        color: C.aurora[g.hint],
        alpha: 0.24,
      },
    );
  });
  return pools;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

export interface Board {
  readonly look: Look;
  /** The product kit's measurer (for the product scenes' frames). */
  readonly ui: Ui;
  readonly heads: Readonly<Record<string, KineticText>>;
  readonly cards: Readonly<Record<string, Headline>>;
  /** Pinboard fabric and paper grain, made from a seed at setup. */
  readonly paper: PaperTextures;
}

/** The board's headlines, each on its card (title, then serif subtext). */
const CARDS: Readonly<Record<string, HeadSpec>> = {
  lostB: {
    title: 'But every *hour* they spend tracking it down',
    sub: 'is an *hour* away from the work that needs their expertise.',
    accent: C.time.fg,
    breaks: [5],
  },
  criteria: {
    title: 'Enterprise AI should help teams see the *bigger* *picture,*',
    sub: 'and take on work they _couldn’t_ _before._',
    accent: C.text.accent,
    marker: C.insight.marker,
  },
  ask: { title: '*Bigger* questions.', accent: C.text.accent },
  work: {
    title: 'Researchers, in *parallel.*',
    sub: 'Every answer _checked._',
    accent: C.text.accent,
    accent2: C.outcome.fg,
  },
  answersA: { title: 'Only what you’re *allowed* to see.', accent: C.text.accent, breaks: [3] },
  answersB: {
    title: 'The *bigger* *picture.*',
    sub: 'Before _lunch._',
    accent: C.text.accent,
    accent2: C.time.fg,
  },
  library: { title: 'Saved. Shared. Never _lost._', accent2: C.outcome.fg },
  week: { title: 'Days of digging.', sub: 'One *run.*', accent: C.text.accent },
};

/** The call to action's type: violet Sora, large enough to read as the ask. */
export const CTA_FONT = face('title', 38, { weight: 500, letterSpacing: -0.4, lineHeight: 1.2 });

/** The reveal's type: a light Sora kicker over the name at display size. */
export const MEET_FONTS = {
  kicker: face('title', 34, { weight: 300, letterSpacing: 3 }),
  name: face('display', 150, { weight: 500, letterSpacing: -5, lineHeight: 1.05 }),
} as const;

/**
 * The outro's pitch, before the lockup: a quiet line naming the pain, and
 * the answer larger beneath it.
 */
export const PITCH_FONTS = {
  first: face('title', 40, { weight: 400, letterSpacing: -0.6, lineHeight: 1.2 }),
  second: face('display', 68, { weight: 500, letterSpacing: -2.2, lineHeight: 1.1 }),
} as const;
/** The lockup's name: the reveal's weight and tracking, at a smaller size. */
export const OUT_NAME_FONT = face('display', 92, {
  weight: 500,
  letterSpacing: -3,
  lineHeight: 1.05,
});

/** The lockup's name and tagline (no card: they stand on the light). */
const HEADLINES: Readonly<
  Record<
    string,
    {
      text: string;
      font: FontSpec;
      color?: string;
      align?: 'left' | 'center';
      /** Accent colours and arrival, where they differ from the defaults. */
      motion?: {
        accent?: string;
        accent2?: string;
        stagger?: number;
        duration?: number;
        blur?: number;
        rise?: number;
      };
    }
  >
> = {
  /** The reveal: "Meet" small above a large "Cowork", no tagline. */
  meetKicker: {
    text: 'Meet',
    font: MEET_FONTS.kicker,
    color: C.text.secondary,
    align: 'center',
  },
  /** The same name in light, shown only where the shimmer crosses it. */
  meetShine: { text: 'Cowork', font: MEET_FONTS.name, color: C.meet.shine, align: 'center' },
  /** Copies for the name's glow and the shimmer's halo (each layer needs its own nodes). */
  meetName: { text: 'Cowork', font: MEET_FONTS.name, align: 'center' },
  meetGlow: { text: 'Cowork', font: MEET_FONTS.name, align: 'center' },
  meetHalo: { text: 'Cowork', font: MEET_FONTS.name, color: C.meet.shine, align: 'center' },
  /** "Stop waiting for answers.": "waiting" in the coral of what is lost. */
  pitchFirst: {
    text: 'Stop _waiting_ for answers.',
    font: PITCH_FONTS.first,
    align: 'center',
    motion: { accent2: C.lost.coral, stagger: 0.016, duration: 0.55 },
  },
  /** "Just ask Cowork.": larger, arriving from further out of focus, "Cowork." in violet. */
  pitchSecond: {
    text: 'Just ask *Cowork.*',
    font: PITCH_FONTS.second,
    align: 'center',
    motion: { accent: C.text.accent, stagger: 0.022, duration: 0.6, blur: 18, rise: 18 },
  },
  outName: { text: 'Cowork.', font: OUT_NAME_FONT, align: 'center' },
  ctaText: { text: 'Join the waitlist', font: CTA_FONT, color: C.text.accent, align: 'center' },
  ctaShine: { text: 'Join the waitlist', font: CTA_FONT, color: C.meet.shine, align: 'center' },
  outTag: {
    text: 'Know what your company knows.',
    font: face('title', 28, { weight: 500 }),
    color: C.text.secondary,
    align: 'center',
  },
};

/** Everything the board needs, made once (textures are generated and preloaded). */
export async function createBoard(measurer: TextMeasurer): Promise<Board> {
  await preloadPileLogos();
  const heads: Record<string, KineticText> = {};
  for (const [key, h] of Object.entries(HEADLINES)) {
    heads[key] = kineticText({
      id: `head-${key}`,
      text: h.text,
      font: h.font,
      measurer,
      x: 0,
      y: 0,
      maxWidth: 620,
      ...(h.align ? { align: h.align } : {}),
      color: h.color ?? C.text.primary,
      at: 0,
      ease: easing.enter,
      ...h.motion,
    });
  }
  const cards: Record<string, Headline> = {};
  for (const [key, spec] of Object.entries(CARDS))
    cards[key] = makeHeadline(`card-${key}`, spec, measurer);
  return {
    look: createLook(measurer),
    ui: createUi(measurer),
    heads,
    cards,
    paper: await createPaperTextures('cowork-paper'),
  };
}

/** Fonts the board uses beyond the look's own (the intro's tagline). */
export const BOARD_FONTS = [
  face('title', 28, { weight: 500 }),
  face('title', 84, { weight: 600, letterSpacing: 0 }),
  MEET_FONTS.kicker,
  MEET_FONTS.name,
  OUT_NAME_FONT,
  CTA_FONT,
  PITCH_FONTS.first,
  PITCH_FONTS.second,
] as const;

/** Local time long after everything in a group has arrived (its settled, style-frame state). */
export const SETTLED = 1e4;

/** A headline pinned at (x, y) on the board, `t` s after it starts arriving; `exit` takes it away. */
function head(b: Board, key: string, x: number, y: number, t = SETTLED, exit = 0): SceneNode {
  const card = b.cards[key];
  if (card) return headlineCard(`pin-${key}`, card, x, y, t, exit);
  const k = b.heads[key];
  if (!k) return groupNode(`head-${key}-none`, []);
  return groupNode(`pin-${key}`, [k(t, exit)], { transform: { x, y } });
}

const txt = (
  id: string,
  text: string,
  x: number,
  y: number,
  f: FontSpec,
  fill: string,
  extra: { maxWidth?: number; align?: 'left' | 'center' | 'right' } = {},
) => textNode(id, { text, font: f, fill, transform: { x, y }, ...extra });

// ---------------------------------------------------------------------------
// The groups, at their key moments
// ---------------------------------------------------------------------------

const QUESTIONS = [
  'Where is the latest pricing deck?',
  'Who approved this discount?',
  'Is there a template for this?',
  'What did legal say about the MSA?',
  'Which version is final?',
  'Has anyone asked this before?',
  'Where are last quarter’s numbers?',
  'Who owns the Arden account?',
  'Can someone resend that file?',
  'What’s our policy on refunds?',
  'Did we promise them a date?',
  'Where do I find the SOW?',
  'Who knows how this works?',
  'Is this still accurate?',
  'Which deck did we send them?',
  'Who signed off the budget?',
  'Do we have a case study for this?',
  'What changed in the new contract?',
  'Is the forecast updated?',
  'Who should I ask about this?',
  'Where’s the onboarding doc?',
  'Did finance see this yet?',
  'What did the customer say?',
  'Which supplier was late?',
];

/** A frosted message card with a question, and a coral unread dot. */
function bubble(
  b: Board,
  id: string,
  text: string,
  x: number,
  y: number,
  options: {
    scale?: number;
    blur?: number;
    unread?: boolean;
    opacity?: number;
    shadow?: boolean;
  } = {},
): SceneNode {
  const f = T.body;
  const w = b.look.measurer.measure(text, f) + 44;
  const h = 52;
  return groupNode(
    id,
    [
      shapeNode(`${id}-g`, {
        geometry: rect(0, 0, w, h, 18),
        fill: litFill(lighting, C.message.bg, { y: 0, height: h }, { sheen: 0.1, shade: 0.04 }),
        ...(options.shadow === false ? {} : { shadow: elevationShadows(lighting, 'low') }),
      }),
      txt(`${id}-t`, text, -w / 2 + 22, -12, f, C.message.fg),
      ...(options.unread
        ? [
            shapeNode(`${id}-dot`, {
              geometry: rect(w / 2 - 6, -h / 2 + 6, 14, 14, 7),
              fill: C.message.unread,
              stroke: { color: P.white, width: 2 },
            }),
          ]
        : []),
    ],
    {
      transform: { x, y, scale: options.scale ?? 1 },
      ...(options.blur ? { blur: options.blur } : {}),
      ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
    },
  );
}

/** Choreography of the questions wall, in seconds of the group's own time. */
export const QUERIES = {
  /**
   * Bubble k of n (in arrival order) arrives at fill.start + fill.span × (k / n)^power;
   * a power under 1 spaces the first few out (a trickle), then packs the rest (a flood).
   */
  fill: { start: 0.12, span: 2.45, power: 0.5, each: 0.34 },
  /** The wall is complete. */
  full: 2.95,
  crack: { start: 3.05, grow: 0.75, fine: 0.45, glow: 0.15 },
} as const;

/** Where the crack starts, in the group's frame. */
export const IMPACT = { x: FW / 2, y: FH * 0.47 } as const;

/**
 * The wall of questions: rows of message bubbles packed edge to edge and
 * running off both sides, each row staggered, over a softer second wall that
 * closes every gap, with a couple near the lens out of focus. Bubbles arrive
 * in a trickle that becomes a flood, each coming into focus. At `crack`, the
 * wall cracks from the point of impact; `dive` (0–1) is the camera passing
 * through: the wall goes soft and the light from the crack fills the frame.
 */
function queries(b: Board, o: { x: number; y: number }, lt = SETTLED, dive = 0): SceneNode[] {
  const m = (q: string) => b.look.measurer.measure(q, T.body) + 44;
  const specs = (
    layer: 'back' | 'front',
    top: number,
    step: number,
    scale: number,
    shift: number,
  ) => {
    const out: {
      id: string;
      q: string;
      x: number;
      y: number;
      scale: number;
      unread: boolean;
      order: number;
    }[] = [];
    for (let row = 0; top + row * step < FH + step; row++) {
      const y = top + row * step;
      let x = -40 - random('wall', layer, 'start', row) * 160;
      let k = 0;
      while (x < FW + 40) {
        const q = QUESTIONS[(row * 5 + k * 3 + shift) % QUESTIONS.length] ?? '';
        const w = m(q) * scale;
        // Outwards from where the camera starts (close on the first questions), scattered.
        const order =
          Math.hypot(x + w / 2 - 250, y - 300) / FH + random('wall', layer, 'order', row, k) * 0.3;
        out.push({
          id: `w${layer}${row}-${k}`,
          q,
          x: x + w / 2,
          y,
          scale,
          unread: random('wall', layer, 'u', row, k) < 0.22,
          order,
        });
        x += w + (layer === 'back' ? 4 : 8);
        k++;
      }
    }
    const sorted = [...out].sort((a, c) => a.order - c.order);
    return out.map((s) => ({ ...s, rank: sorted.indexOf(s) / Math.max(1, out.length - 1) }));
  };
  const arrive = (rank: number, delay = 0) =>
    progress(
      lt,
      QUERIES.fill.start + delay + QUERIES.fill.span * rank ** QUERIES.fill.power,
      QUERIES.fill.each,
      easing.enter,
    );
  const draw = (s: ReturnType<typeof specs>[number], p: number, back: boolean) =>
    bubble(b, s.id, s.q, o.x + s.x, o.y + s.y, {
      scale: s.scale * (0.92 + 0.08 * p),
      unread: s.unread,
      ...(p < 1 ? { blur: 8 * (1 - p) } : {}),
      opacity: (back ? 0.9 : 1) * clamp(p * 1.6),
      shadow: !back,
    });
  // The back wall is soft as a whole: one blurred layer, not one per bubble.
  const backWall: SceneNode[] = [];
  for (const s of specs('back', 0, 44, 0.86, 2)) {
    const p = arrive(s.rank, 0.12);
    if (p > 0) backWall.push(draw(s, p, true));
  }
  const wall: SceneNode[] = backWall.length ? [groupNode('wall-back', backWall, { blur: 5 })] : [];
  for (const s of specs('front', 26, 56, 1, 0)) {
    const p = arrive(s.rank);
    if (p > 0) wall.push(draw(s, p, false));
  }
  [5, 13].forEach((k, i) => {
    const p = progress(lt, 2.3 + 0.2 * i, 0.5, easing.enter);
    if (p > 0)
      wall.push(
        bubble(b, `wnear${i}`, QUESTIONS[k] ?? '', o.x + (i ? 520 : 170), o.y + (i ? 980 : 330), {
          scale: 1.35,
          blur: 12,
          opacity: clamp(p * 1.5),
        }),
      );
  });
  const c = QUERIES.crack;
  if (lt < c.start) return wall;
  // The wall itself is the glass: it cracks edge to edge, and goes soft behind the cracks.
  const grow = progress(lt, c.start, c.grow, easing.enter);
  const fine = progress(lt, c.start + c.grow * 0.5, c.fine);
  const glow = clamp((lt - c.start) / c.glow);
  return [
    groupNode('wall-soft', wall, { blur: 2.5 * progress(lt, c.start, 0.5) + 12 * dive }),
    groupNode('cracked', crackNodes(o, grow, fine, glow, dive), {
      clip: rect(o.x + FW / 2, o.y + FH / 2, FW + 80, FH + 80),
    }),
  ];
}

/**
 * White cracks spreading from the point of impact (`grow` 0–1, each branch
 * drawn along its length), hairline side cracks (`fine`), and the light at
 * the impact (`glow`), which floods out to white as the camera dives (`dive`).
 */
function crackNodes(
  o: { x: number; y: number },
  grow = 1,
  fine = 1,
  glow = 1,
  dive = 0,
): SceneNode[] {
  const cx = o.x + IMPACT.x;
  const cy = o.y + IMPACT.y;
  const branches: { d: string; len: number }[] = [];
  const side: string[] = [];
  for (let k = 0; k < 11; k++) {
    let a = (k / 11) * Math.PI * 2 + random('crack', 'a', k) * 0.4;
    let x = cx;
    let y = cy;
    let d = `M${x} ${y}`;
    let len = 0;
    const steps = 6 + Math.floor(random('crack', 'n', k) * 6);
    for (let s = 0; s < steps; s++) {
      a += (random('crack', 'turn', k, s) - 0.5) * 0.7;
      const l = 26 + random('crack', 'len', k, s) * 48;
      x += Math.cos(a) * l;
      y += Math.sin(a) * l;
      len += l;
      d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
      if (random('crack', 'side', k, s) < 0.35) {
        const sa =
          a +
          (random('crack', 'sa', k, s) < 0.5 ? 1 : -1) * (0.6 + random('crack', 'sb', k, s) * 0.6);
        const sl = 18 + random('crack', 'sl', k, s) * 40;
        side.push(
          `M${x.toFixed(1)} ${y.toFixed(1)}L${(x + Math.cos(sa) * sl).toFixed(1)} ${(y + Math.sin(sa) * sl).toFixed(1)}`,
        );
      }
    }
    branches.push({ d, len });
  }
  for (let k = 0; k < 14; k++) {
    const a0 = (k / 14) * Math.PI * 2;
    const a1 = ((k + 0.8) / 14) * Math.PI * 2;
    const r = 34 + random('crack', 'ring', k) * 14;
    side.push(
      `M${(cx + Math.cos(a0) * r).toFixed(1)} ${(cy + Math.sin(a0) * r).toFixed(1)}L${(cx + Math.cos(a1) * r).toFixed(1)} ${(cy + Math.sin(a1) * r).toFixed(1)}`,
    );
  }
  const nodes: SceneNode[] = [];
  const R = 180 + 1700 * dive * dive;
  if (glow > 0) {
    nodes.push(
      shapeNode('crack-impact', {
        geometry: rect(cx, cy, 2 * R, 2 * R, R),
        fill: radialGradient(cx, cy, R, [
          withAlpha(P.white, 0.75 * glow + 0.25 * dive),
          withAlpha(P.white, (0.3 * glow + 0.7 * dive) * 0.9),
          withAlpha(P.white, 0),
        ]),
      }),
    );
  }
  // Shadows, glows and the white lines, each drawn as one layer (one blur each, not one per branch).
  const shadows: SceneNode[] = [];
  const glows: SceneNode[] = [];
  const lines: SceneNode[] = [];
  branches.forEach((br, k) => {
    // Branches start together and run out at their own speed.
    const g = clamp(grow * (1.15 - 0.03 * k));
    if (g <= 0) return;
    const dash = g < 1 ? { dash: [br.len * g, br.len + 1] } : {};
    const geometry = pathGeometry(br.d);
    shadows.push(
      shapeNode(`crack-shadow${k}`, {
        geometry,
        stroke: {
          color: withAlpha(lighting.shadow, 0.28),
          width: 2.6,
          cap: 'round',
          join: 'round',
          ...dash,
        },
        transform: { x: 1.2, y: 1.6 },
      }),
    );
    glows.push(
      shapeNode(`crack-glow${k}`, {
        geometry,
        stroke: { color: withAlpha(P.white, 0.75), width: 7, cap: 'round', join: 'round', ...dash },
      }),
    );
    lines.push(
      shapeNode(`crack-main${k}`, {
        geometry,
        stroke: { color: P.white, width: 2, cap: 'round', join: 'round', ...dash },
      }),
    );
  });
  if (shadows.length) {
    nodes.push(
      groupNode('crack-shadows', shadows, { blur: 2 }),
      groupNode('crack-glows', glows, { blur: 4 }),
      ...lines,
    );
  }
  if (fine > 0) {
    nodes.push(
      shapeNode('crack-fine', {
        geometry: pathGeometry(side.join('')),
        stroke: { color: P.white, width: 1, cap: 'round' },
        opacity: fine,
      }),
    );
  }
  return nodes;
}

/**
 * The film's opening (scene 1, the pain point, twenty beats), in seconds of
 * the film: the line arrives at the centre; as the board's pieces start to
 * appear and the camera moves down, the line breaks into grain and drifts
 * away; the board fills and a flood of paper covers everything into a
 * wall; the wall goes out of focus and "Most of it is lost." is printed on
 * it; the wall (with the line) cracks and breaks onto bare ground. The
 * paper wall is drawn by `cowork-wall.ts`; the pinboard under it is this
 * file's `lost` group, whose local time is the film's.
 */
/** When the wall's paper starts sorting into piles (`OPENING.sort.start`). */
const OPENING_SORT_START = beats(8);

export const OPENING = {
  text: 0,
  /** The line breaks into grain and drifts away. */
  dissolve: { start: beats(4.5), duration: beats(1.5) },
  pan: { start: beats(4.5), duration: beats(1.25) },
  fill: beats(4.5),
  flood: { start: beats(5.25), end: beats(7.5) },
  blur: { start: beats(7.5), duration: beats(0.5) },
  /**
   * Once the wall is out of focus, its paper lifts off, top layer first, and
   * sorts itself into the piles: departures spread over `span`, each flight
   * `flight` long (seconds).
   */
  sort: { start: OPENING_SORT_START, span: 1.0, flight: 0.62 },
  /** The last piece is in its pile and the wall is gone (the camera starts to drift). */
  break: beats(11),
} as const;

/**
 * Where the piles stand in the lost group (group-local px, the folders'
 * front centres), under the hour: three over two, at `PILE_SCALE`. Until the
 * wall has gone the camera stands still on the group, so these are also
 * their places on screen.
 */
export const PILE_SPOTS: Readonly<Record<PileKind, { x: number; y: number }>> = {
  mail: { x: 130, y: 860 },
  files: { x: 360, y: 860 },
  m365: { x: 590, y: 860 },
  workspace: { x: 245, y: 1100 },
  slack: { x: 475, y: 1100 },
};
export const PILE_SCALE = 0.72;
/**
 * The empty folders rise softly into place as the paper starts to lift,
 * left to right across the frame, `each` apart.
 */
export const PILE_REVEAL = { start: OPENING_SORT_START - 0.1, duration: 0.5, each: 0.07 } as const;
/** How far pile `kind` has risen into place at film time `t` (0–1). */
export function pileReveal(kind: PileKind, t: number): number {
  const order = [...PILES].sort((a, b) => PILE_SPOTS[a.kind].x - PILE_SPOTS[b.kind].x);
  const k = order.findIndex((p) => p.kind === kind);
  return progress(t, PILE_REVEAL.start + k * PILE_REVEAL.each, PILE_REVEAL.duration, easing.enter);
}

/**
 * The five piles at their spots (offset by `o`), each `fills[kind]` full
 * (0–1) and `reveal(kind)` (0–1) of the way into place.
 */
export function piles(
  tex: PaperTextures,
  o: { x: number; y: number },
  fills: Readonly<Record<PileKind, number>>,
  revealOf: (kind: PileKind) => number = () => 1,
): SceneNode[] {
  return PILES.flatMap(({ kind }) => {
    const spot = PILE_SPOTS[kind];
    const reveal = revealOf(kind);
    if (reveal <= 0) return [];
    return groupNode(
      `pile-${kind}-o`,
      [
        pile(`pile-${kind}`, kind, o.x + spot.x, o.y + spot.y, tex, {
          scale: PILE_SCALE,
          fill: fills[kind],
        }),
      ],
      reveal < 1
        ? {
            opacity: clamp(reveal * 1.4),
            transform: { y: 22 * (1 - reveal) },
            blur: 6 * (1 - reveal),
          }
        : {},
    );
  });
}
const FULL: Readonly<Record<PileKind, number>> = {
  mail: 1,
  files: 1,
  m365: 1,
  workspace: 1,
  slack: 1,
};

/** How many pinboard pieces are up from the first frame (the rest land as the camera arrives). */
const PRE_LANDED = 6;

/** Choreography of the lost-knowledge group, in seconds of the film. */
const LOST_WRITTEN = {
  /** Piece k (from `PRE_LANDED` on) lands at pieces.start + (k − PRE_LANDED) × pieces.each, its pin pressed in just after. */
  pieces: { start: OPENING.fill, each: 0.075, drop: 0.45, pin: 0.16 },
  /** The board's colour drains from the lower right once the wall has broken. */
  loss: { start: OPENING.break, duration: 1.6 },
  /** Pieces tear free and fall as the wall breaks (`fallAt`); a red question mark is left in each gap. */
  fall: 0.75,
  /** The question mark, this long after its piece starts to fall. */
  mark: 0.3,
  /** The second line: the board goes soft behind an hour of searching. */
  b: { start: beats(10.75), search: 0.9, each: 0.3, ring: 0.9, sweep: 2.6 },
} as const;
/** On the film's beat grid: sixteenths, the landing stagger on thirty-seconds. */
export const LOST = {
  ...gridTimes(LOST_WRITTEN),
  pieces: { ...gridTimes(LOST_WRITTEN.pieces), each: onGrid(LOST_WRITTEN.pieces.each, SFX_DIV) },
};
/** When piece `k` lands (before the film's first frame for the first few). */
const landAt = (k: number) =>
  k < PRE_LANDED ? -1 : LOST.pieces.start + (k - PRE_LANDED) * LOST.pieces.each;

type PieceKind = 'page' | 'chart' | 'sticky' | 'index' | 'notebook';
interface PieceSpec {
  readonly id: string;
  readonly kind: PieceKind;
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  readonly title?: string;
  readonly icon?: IconName;
  readonly curl?: number;
  readonly w?: number;
  readonly h?: number;
  /** Colour token name for sticky notes and chart bars. */
  readonly color?: string;
  readonly size?: number;
  readonly seed?: number;
  readonly lines?: readonly number[];
  readonly bars?: readonly number[];
  readonly ink?: string;
  readonly pin?: string;
  readonly tape?: { readonly dy: number; readonly w: number; readonly rot: number };
  /**
   * Its order in tearing free when the wall breaks (the written times are
   * squeezed into the half second after the break by `fallAt`).
   */
  readonly falls?: number;
}

/** The pinboard's pieces, in landing order (dense, overlapping clusters). */
const PIECES: readonly PieceSpec[] = [
  {
    id: 'pb-p1',
    kind: 'page',
    x: 140,
    y: 470,
    rot: -5,
    title: 'Q3 pricing',
    icon: 'doc',
    curl: 16,
    pin: C.person.fill,
  },
  {
    id: 'pb-s1',
    kind: 'sticky',
    x: 235,
    y: 390,
    rot: 8,
    color: C.insight.marker,
    seed: 1,
    size: 92,
    lines: [70, 52],
  },
  { id: 'pb-n1', kind: 'notebook', x: 355, y: 480, rot: 3, seed: 11, pin: C.brand.fill },
  {
    id: 'pb-c1',
    kind: 'chart',
    x: 565,
    y: 430,
    rot: 2,
    title: 'Late deliveries',
    bars: [0.35, 0.5, 0.42, 0.8, 0.95],
    color: C.source.icon,
    tape: { dy: -68, w: 84, rot: -4 },
  },
  {
    id: 'pb-s2',
    kind: 'sticky',
    x: 420,
    y: 590,
    rot: -6,
    color: C.person.glow,
    seed: 2,
    lines: [70, 84, 50],
    falls: onGrid(3.3, SFX_DIV),
  },
  {
    id: 'pb-i1',
    kind: 'index',
    x: 580,
    y: 570,
    rot: -3,
    seed: 4,
    curl: 10,
    pin: C.time.ring,
    falls: onGrid(3.1, SFX_DIV),
  },
  { id: 'pb-i2', kind: 'index', x: 165, y: 670, rot: -2, seed: 8, pin: C.source.icon },
  {
    id: 'pb-d1',
    kind: 'sticky',
    x: 655,
    y: 690,
    rot: 6,
    color: C.insight.marker,
    seed: 13,
    size: 96,
    pin: C.person.fill,
    falls: onGrid(2.45, SFX_DIV),
  },
  {
    id: 'pb-s3',
    kind: 'sticky',
    x: 95,
    y: 790,
    rot: 7,
    color: C.source.glow,
    seed: 3,
    size: 100,
    lines: [76, 60],
  },
  {
    id: 'pb-p2',
    kind: 'page',
    x: 330,
    y: 760,
    rot: -2,
    title: 'Re: Renewal terms',
    icon: 'mail',
    w: 170,
    h: 180,
    pin: C.outcome.fill,
    falls: onGrid(3.4, SFX_DIV),
  },
  {
    id: 'pb-s4',
    kind: 'sticky',
    x: 420,
    y: 845,
    rot: 5,
    color: C.outcome.glow,
    seed: 5,
    size: 96,
    falls: onGrid(2.9, SFX_DIV),
  },
  {
    id: 'pb-p3',
    kind: 'page',
    x: 575,
    y: 760,
    rot: 4,
    title: 'Supplier SLAs',
    icon: 'sheet',
    curl: 18,
    pin: C.person.fill,
    falls: onGrid(2.55, SFX_DIV),
  },
  {
    id: 'pb-p4',
    kind: 'page',
    x: 175,
    y: 960,
    rot: -3,
    title: 'Onboarding notes',
    icon: 'doc',
    curl: 20,
    tape: { dy: -94, w: 90, rot: 3 },
  },
  {
    id: 'pb-s5',
    kind: 'sticky',
    x: 285,
    y: 1030,
    rot: -8,
    color: C.time.track,
    seed: 9,
    size: 90,
    lines: [60, 72],
    falls: onGrid(3.0, SFX_DIV),
  },
  {
    id: 'pb-n2',
    kind: 'notebook',
    x: 430,
    y: 990,
    rot: -4,
    seed: 12,
    ink: C.text.primary,
    falls: onGrid(2.65, SFX_DIV),
  },
  {
    id: 'pb-c2',
    kind: 'chart',
    x: 590,
    y: 960,
    rot: -5,
    title: 'Margins by region',
    bars: [0.7, 0.55, 0.8, 0.45, 0.6],
    color: C.time.ring,
    falls: onGrid(2.15, SFX_DIV),
  },
  {
    id: 'pb-d2',
    kind: 'chart',
    x: 525,
    y: 1110,
    rot: 3,
    title: 'Supplier list',
    bars: [0.6, 0.3, 0.8, 0.5, 0.4],
    color: C.time.ring,
    pin: C.brand.fill,
    falls: onGrid(2.3, SFX_DIV),
  },
  {
    id: 'pb-s6',
    kind: 'sticky',
    x: 120,
    y: 1110,
    rot: 10,
    color: C.insight.marker,
    seed: 10,
    size: 88,
    lines: [60, 48],
    falls: onGrid(3.2, SFX_DIV),
  },
  {
    id: 'pb-d3',
    kind: 'index',
    x: 365,
    y: 1130,
    rot: -5,
    seed: 14,
    pin: C.source.icon,
    falls: onGrid(2.8, SFX_DIV),
  },
];

/** How tall a piece is (for placing its pin at its top). */
function pieceHeight(s: PieceSpec): number {
  switch (s.kind) {
    case 'page':
      return s.h ?? 196;
    case 'chart':
      return 140;
    case 'sticky':
      return s.size ?? 118;
    case 'index':
      return 118;
    case 'notebook':
      return 200;
  }
}

/**
 * The company's knowledge as a real pinboard: printed pages, charts, sticky
 * notes, notebook pages and index cards, pinned and taped up one by one. The
 * loss (`loss` 0–1) spreads from the lower right: colour drains, focus goes,
 * and three pieces tear free and fall, leaving their pins and torn scraps.
 */
function pinboard(b: Board, o: { x: number; y: number }, lt: number): SceneNode[] {
  const tex = b.paper;
  const B = { x: o.x + 24, y: o.y + 320, w: 672, h: 860 };
  const nodes: SceneNode[] = [
    groupNode(
      'pb-board',
      [
        shapeNode('pb-frame', {
          geometry: rect(B.x + B.w / 2, B.y + B.h / 2, B.w + 14, B.h + 14, 22),
          fill: linearGradient(0, B.y, 0, B.y + B.h, [P.white, C.stroke.hairline]),
          shadow: elevationShadows(lighting, 'mid'),
        }),
        groupNode(
          'pb-fabric',
          [
            imageNode('pb-fabric-img', {
              src: tex.fabric,
              width: B.w,
              height: B.h,
              transform: { x: B.x + B.w / 2, y: B.y + B.h / 2 },
            }),
          ],
          { clip: rect(B.x + B.w / 2, B.y + B.h / 2, B.w, B.h, 16) },
        ),
        shapeNode('pb-inset', {
          geometry: rect(B.x + B.w / 2, B.y + B.h / 2, B.w, B.h, 16),
          stroke: { color: withAlpha(lighting.shadow, 0.12), width: 1.5 },
        }),
      ],
      {},
    ),
  ];
  const L = progress(lt, LOST.loss.start, LOST.loss.duration, easing.camera);
  // How lost a spot on the board is: the loss front sweeps up from the lower right.
  const loss = (x: number, y: number) => {
    const s = clamp(((x - B.x) / B.w) * 0.55 + ((y - B.y) / B.h) * 0.45);
    const reach = clamp(s * 1.8 - 0.62);
    return clamp((L * 1.3 - (1 - s)) / 0.35) * reach;
  };
  const drain = (color: string, l: number) => mixColors(color, C.stroke.hairline, 0.75 * l);
  const pins: SceneNode[] = [];
  PIECES.forEach((s, k) => {
    const at = landAt(k);
    const p = progress(lt, at, LOST.pieces.drop, easing.enter);
    if (p <= 0) return;
    const bx = o.x + s.x;
    const by = o.y + s.y;
    const l = loss(bx, by);
    const f = s.falls === undefined ? 0 : progress(lt, fallAt(s.falls), LOST.fall, easing.exit);
    const h = pieceHeight(s);
    const pinPos = { x: bx, y: by - h / 2 + 10 };
    // Landing: held a little off the board, then pressed down. Falling: down and turning, smeared by speed.
    const speed = f > 0 && f < 1 ? 1300 * f : 0;
    const placed: Placed = {
      x: bx + 30 * f,
      y: by - 12 * (1 - p) + 1000 * f * f,
      rotation: s.rot + 34 * f,
      lift: 1 + 2.2 * (1 - p) + 2.5 * f,
      opacity: clamp(p * 2.5) * (1 - 0.25 * l) * (1 - f * f),
      // Only motion blurs a piece: the loss takes pieces away, it doesn't soften them.
      ...(speed > 30
        ? { blur: { x: 2 * 0.29 * (speed / 60) * 0.5, y: 2, angle: 92 + 34 * f } }
        : {}),
      scale: 1 + 0.06 * (1 - p),
    };
    const color = drain(s.color ?? C.source.icon, l);
    // Once it has fallen out of sight it is gone (only its pin and scrap remain).
    const gone = f >= 1;
    let node: SceneNode;
    switch (s.kind) {
      case 'page':
        node = printedPage(s.id, placed, tex, {
          title: s.title ?? '',
          icon: s.icon ?? 'doc',
          tint: drain(C.source.icon, l),
          curl: s.curl ?? 0,
          ...(s.w ? { w: s.w } : {}),
          ...(s.h ? { h: s.h } : {}),
        });
        break;
      case 'chart':
        node = chartPage(s.id, placed, tex, { title: s.title ?? '', bars: s.bars ?? [], color });
        break;
      case 'sticky':
        node = stickyNote(s.id, placed, tex, {
          color,
          seed: s.seed ?? 0,
          ...(s.size ? { size: s.size } : {}),
          ...(s.lines ? { lines: s.lines } : {}),
        });
        break;
      case 'index':
        node = indexCard(s.id, placed, tex, {
          seed: s.seed ?? 0,
          ...(s.curl ? { curl: s.curl } : {}),
        });
        break;
      case 'notebook':
        node = notebookPage(s.id, placed, tex, {
          seed: s.seed ?? 0,
          ...(s.ink ? { ink: s.ink } : {}),
        });
        break;
    }
    if (!gone) nodes.push(node);
    if (s.tape) {
      nodes.push(
        groupNode(
          `${s.id}-tape-o`,
          [tape(`${s.id}-tape`, bx, by + s.tape.dy, s.tape.w, s.tape.rot)],
          { opacity: clamp((p - 0.6) * 3) * (1 - f) },
        ),
      );
    }
    if (s.pin) {
      const pp = progress(lt, at + LOST.pieces.pin, 0.3, easing.snap);
      if (pp > 0) {
        // When the piece tears free, a scrap of it stays under the pin.
        if (f > 0.02)
          pins.push(
            scrap(
              `${s.id}-scrap`,
              pinPos.x,
              pinPos.y + 6,
              s.rot * 3,
              k,
              s.kind === 'sticky' ? color : P.white,
            ),
          );
        pins.push(
          groupNode(`${s.id}-pin-o`, [pin(`${s.id}-pin`, pinPos.x, pinPos.y, drain(s.pin, l))], {
            transform: {
              x: pinPos.x,
              y: pinPos.y,
              scale: lerp(1.5, 1, pp),
              originX: pinPos.x,
              originY: pinPos.y,
            },
            opacity: clamp(pp * 2),
          }),
        );
      }
    }
  });
  nodes.push(...pins);
  // Where knowledge was: a red question mark rises in each gap.
  PIECES.forEach((s) => {
    if (s.falls === undefined) return;
    const q = progress(lt, fallAt(s.falls) + LOST.mark, 0.5, easing.snap);
    if (q <= 0) return;
    const x = o.x + s.x;
    const y = o.y + s.y;
    const size = 0.9 + 0.25 * random('lost-q', s.id);
    nodes.push(
      groupNode(
        `${s.id}-q`,
        [
          textNode(`${s.id}-q-t`, {
            text: '?',
            font: LOST_MARK,
            fill: C.lost.mark,
            align: 'center',
            transform: { x, y: y - LOST_MARK.size * 0.62 },
            shadow: { x: 0, y: 0, blur: 22, color: withAlpha(C.lost.glow, 0.9) },
          }),
        ],
        {
          transform: {
            x,
            y,
            scale: size * lerp(0.4, 1, q),
            rotation: (random('lost-q-r', s.id) - 0.5) * 24,
            originX: x,
            originY: y,
          },
          opacity: clamp(q * 2),
        },
      ),
    );
  });
  return nodes;
}

/** The pinboard's question marks. */
const LOST_MARK = face('title', 84, { weight: 600, letterSpacing: 0 });
/** When a piece written to fall at `written` (2.15–3.4) tears free: in the 0.4 s after the wall breaks. */
function fallAt(written: number): number {
  return onGrid(OPENING.break + 0.05 + (written - 2.15) * 0.32, SFX_DIV);
}
/** When each piece that lands during the film lands (film time): for sound. */
export const LOST_LANDINGS: readonly number[] = PIECES.map((_, k) => landAt(k)).filter(
  (t) => t >= 0,
);
/** When each piece tears free (film time), in order: for sound. */
export const LOST_FALLS: readonly number[] = PIECES.flatMap((s) =>
  s.falls === undefined ? [] : [fallAt(s.falls)],
).sort((a, b) => a - b);

function lost(b: Board, o: { x: number; y: number }, lt = SETTLED, pilesGone = false): SceneNode[] {
  const L = b.look;
  const nodes: SceneNode[] = [];
  const B = LOST.b;
  // The board is only seen before the paper wall covers it; the wall breaks
  // onto the bare ground, and the line, the searches and the clock hold the
  // centre of the frame on their own.
  if (lt < OPENING.flood.end) nodes.push(groupNode('lost-board', pinboard(b, o, lt)));
  // The piles, full, once the wall has gone (until then the wall's layer draws them, above it).
  if (lt >= OPENING.break && !pilesGone) nodes.push(...piles(b.paper, o, FULL));
  if (lt >= B.start) {
    // The line on its card, then the searches beside the clock: one block above the piles.
    const card = b.cards['lostB'];
    const [cardW, cardH] = [card?.width ?? 640, card?.height ?? 220];
    const top = o.y + HOUR.top;
    const row = top + cardH + HOUR.gap;
    nodes.push(head(b, 'lostB', o.x + (FW - cardW) / 2, top, lt - B.start - 0.2));
    // Searching for an hour: queries that come back empty, the hour running out.
    ['latest pricing deck', 'who approved the discount', 'Arden renewal terms'].forEach((s, k) => {
      const at = B.start + B.search + k * B.each;
      const p = progress(lt, at, 0.45, easing.enter);
      if (p <= 0) return;
      const none = progress(lt, at + 0.4, 0.35, easing.snap);
      const w = L.measurer.measure(s, T.small) + 150;
      const x = o.x + 84 + (k % 2) * 30;
      const y = row + 24 + k * 64;
      // Who is searching: a profile icon left of each question, each person in their own tint.
      const who = SEARCHERS[k] ?? SEARCHERS[0];
      nodes.push(
        groupNode(
          `search${k}-o`,
          [
            shapeNode(`search${k}-who`, {
              geometry: rect(x - 28, y, 40, 40, 20),
              fill: litFill(lighting, who.fill, { y, height: 40 }, { sheen: 0.2, shade: 0.08 }),
              stroke: { color: C.surface.paper, width: 2 },
              shadow: elevationShadows(lighting, 'low'),
            }),
            icon(`search${k}-who-i`, 'person', x - 28, y, 20, P.white, 1.8),
            glassPanel(
              `search${k}`,
              x + w / 2,
              y,
              w,
              48,
              [
                icon(`search${k}-i`, 'search', -w / 2 + 24, 0, 18, C.text.secondary),
                txt(`search${k}-t`, s, -w / 2 + 44, -10, T.small, C.text.primary),
                ...(none > 0
                  ? [
                      groupNode(
                        `search${k}-no-o`,
                        [L.chip(`search${k}-no`, 'No results', w / 2 - 104, 0, 'friction').node],
                        { opacity: clamp(none * 2) },
                      ),
                    ]
                  : []),
              ],
              24,
            ),
          ],
          {
            opacity: clamp(p * 1.5),
            transform: { y: 10 * (1 - p) },
            ...(p < 1 ? { blur: 6 * (1 - p) } : {}),
          },
        ),
      );
    });
    const ring = progress(lt, B.start + B.ring, 0.45, easing.enter);
    if (ring > 0) {
      const sweep = progress(lt, B.start + B.ring + 0.2, B.sweep, easing.camera);
      nodes.push(
        groupNode(
          'hour-o',
          [
            timeRing(
              'hour',
              o.x + 572,
              row + HOUR.clock,
              86,
              sweep,
              hourLabel(sweep),
              'time',
              urgency(sweep),
            ),
          ],
          {
            opacity: clamp(ring * 1.5),
            transform: {
              x: o.x + 572,
              y: row + HOUR.clock,
              scale: lerp(0.9, 1, ring),
              originX: o.x + 572,
              originY: row + HOUR.clock,
            },
          },
        ),
      );
    }
  }
  return nodes;
}

/** The hour of searching, laid out under its card: gap, the row's height, the clock's centre in it. */
const HOUR = { top: 150, gap: 44, row: 200, clock: 96 } as const;
/** The three people searching, each in their own tint. */
const SEARCHERS = [tone('knowledge'), tone('outcome'), tone('insight')] as const;
/** The hour's clock: minutes counting up to a full hour (1:00). */
export function hourLabel(sweep: number): string {
  const minutes = Math.round(60 * clamp(sweep));
  return minutes >= 60 ? '1:00' : `0:${String(minutes).padStart(2, '0')}`;
}

/** Choreography of the criteria group, in seconds of its own time. */
const CRITERIA_WRITTEN = {
  head: 0.3,
  /**
   * The piles land as the circle's tiles (they are carried here on the
   * flight from the opening, which lands a beat into this group's time).
   */
  tiles: beats(1),
  /** "Cowork" at the centre, for the first time. */
  word: beats(1) + 0.15,
  spokes: { start: beats(1) + 0.3, each: 0.08, draw: 0.55 },
  pulses: { start: 1.6, every: 1.1 },
  reach: 1.0,
  field: { start: 1.3, duration: 1.7 },
} as const;
/** On the film's beat grid: sixteenths, the staggers on thirty-seconds. */
export const CRITERIA = {
  ...gridTimes(CRITERIA_WRITTEN),
  spokes: {
    ...gridTimes(CRITERIA_WRITTEN.spokes),
    each: onGrid(CRITERIA_WRITTEN.spokes.each, SFX_DIV),
  },
};

/** The circle's centre (group-local): "Cowork" sits here, the tiles around it. */
export const RING = { x: FW / 2, y: 760, r: 250 } as const;
/**
 * Each pile's place on the circle (group-local), evenly spaced from the top,
 * in the order that keeps the carried piles from crossing on the way.
 */
export const TILE_SPOTS: Readonly<Record<PileKind, { x: number; y: number }>> = (() => {
  const order: PileKind[] = ['files', 'm365', 'slack', 'workspace', 'mail'];
  const spots = {} as Record<PileKind, { x: number; y: number }>;
  order.forEach((kind, k) => {
    const a = ((-90 + k * 72) * Math.PI) / 180;
    spots[kind] = { x: RING.x + RING.r * Math.cos(a), y: RING.y + RING.r * Math.sin(a) };
  });
  return spots;
})();
/** "Cowork" at the circle's centre: the reveal's name (Sora 500) at this scale. */
export const WORD_SCALE = 0.3;

/**
 * "Cowork" set as the reveal's name (Sora 500, its tracking), centred on
 * (cx, cy) at `scale`: the circle's centre at `WORD_SCALE`, the reveal at 1,
 * and every size between as it is carried from one to the other.
 */
export function coworkWord(b: Board, id: string, cx: number, cy: number, scale: number): SceneNode {
  const name = b.heads['meetName'];
  const lh = MEET_FONTS.name.size * (MEET_FONTS.name.lineHeight ?? 1.2);
  if (!name) return groupNode(`${id}-none`, []);
  return groupNode(id, [renamed(name(SETTLED, 0), `${id}-`)], {
    transform: { x: cx, y: cy - (lh * scale) / 2, scale },
  });
}

/**
 * A spoke from (x1, y1) to (x2, y2): a thin line that is clear at both ends
 * and solid only in its middle, so it seems to dissolve into the tile and
 * into the name. `p` (0–1) draws it from the tile inwards; `pulses` are
 * points of light (0–1 along it) travelling in, fading at the ends too.
 */
function spoke(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  p: number,
  pulses: readonly number[],
  pulseColor: string,
): SceneNode | null {
  if (p <= 0) return null;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const c = C.stroke.strong;
  const kids: SceneNode[] = [
    shapeNode(`${id}-line`, {
      geometry: rect((len * p) / 2, 0, len * p, 3, 1.5),
      fill: linearGradient(0, 0, len, 0, [
        { offset: 0, color: withAlpha(c, 0) },
        { offset: 0.3, color: withAlpha(c, 0.85) },
        { offset: 0.7, color: withAlpha(c, 0.85) },
        { offset: 1, color: withAlpha(c, 0) },
      ]),
    }),
  ];
  pulses.forEach((u, k) => {
    if (u <= 0 || u >= 1 || u > p) return;
    kids.push(
      shapeNode(`${id}-pulse${k}`, {
        geometry: rect(len * u, 0, 7, 7, 3.5),
        fill: pulseColor,
        shadow: { x: 0, y: 0, blur: 8, color: withAlpha(pulseColor, 0.7) },
        opacity: Math.sin(Math.PI * u),
      }),
    );
  });
  return groupNode(id, kids, { transform: { x: x1, y: y1, rotation: angle } });
}

/** The hub, in board space relative to the group (the network plane pivots on it). */
export const HUB = { x: FW / 2, y: 780 } as const;

/** Something arriving into focus: scaled up a touch and blurred, then sharp. */
function focusIn(
  id: string,
  x: number,
  y: number,
  p: number,
  kids: readonly SceneNode[],
): SceneNode | null {
  if (p <= 0) return null;
  return groupNode(id, kids, {
    transform: { x, y, scale: lerp(1.08, 1, p), originX: x, originY: y },
    opacity: clamp(p * 1.6),
    ...(p < 1 ? { blur: 8 * (1 - p) } : {}),
  });
}

/**
 * A Glean-style network on a slightly tilted plane: the hub, the company's
 * sources (blue) and people (pink) around it, routed links with pulses
 * flowing in. The camera settles back as a violet field spreads past the
 * team's old reach (the bigger picture), and work they couldn't take on
 * before lights up (insight), then gets done (outcome). `hubGone` hides the
 * hub once it has left for the intro.
 */
function criteria(
  b: Board,
  o: { x: number; y: number },
  lt = SETTLED,
  hubGone = false,
): SceneNode[] {
  const hub = { x: RING.x, y: RING.y };
  const nodes: SceneNode[] = [head(b, 'criteria', o.x + HEAD.x, o.y + HEAD.y, lt - CRITERIA.head)];
  const net: (SceneNode | null)[] = [];
  const field = progress(lt, CRITERIA.field.start, CRITERIA.field.duration, easing.enter);
  if (field > 0) {
    const r = 380 * lerp(0.35, 1, field);
    net.push(
      shapeNode('field', {
        geometry: rect(hub.x, hub.y, 2 * r, 2 * r, r),
        fill: radialGradient(hub.x, hub.y, r, [
          withAlpha(C.brand.soft, 0.5 * field),
          withAlpha(C.brand.soft, 0.18 * field),
          withAlpha(C.brand.soft, 0),
        ]),
      }),
    );
  }
  const reach = progress(lt, CRITERIA.reach, 0.5, easing.enter);
  if (reach > 0) {
    net.push(
      shapeNode('reach', {
        geometry: rect(hub.x, hub.y, 300, 300, 150),
        stroke: { color: C.stroke.strong, width: 2, dash: [6, 8] },
        opacity: reach * (1 - 0.4 * field),
      }),
    );
  }
  // The piles, now tiles on the circle, joined to "Cowork" at the centre by
  // spokes that fade at both ends, with points of light travelling in.
  const kinds = PILES.map((p) => p.kind);
  if (lt >= CRITERIA.tiles) {
    kinds.forEach((kind, k) => {
      const spot = TILE_SPOTS[kind];
      const dx = hub.x - spot.x;
      const dy = hub.y - spot.y;
      const d = Math.hypot(dx, dy);
      const [ux, uy] = [dx / d, dy / d];
      const from = TILE.r + 8;
      const to = d - 78;
      const start = CRITERIA.spokes.start + k * CRITERIA.spokes.each;
      net.push(
        spoke(
          `cr-spoke${k}`,
          spot.x + ux * from,
          spot.y + uy * from,
          spot.x + ux * to,
          spot.y + uy * to,
          progress(lt, start, CRITERIA.spokes.draw, easing.enter),
          [0, 1, 2, 3, 4].map((n) =>
            clamp((lt - (CRITERIA.pulses.start + n * CRITERIA.pulses.every + k * 0.13)) / 1.0),
          ),
          C.pile[kind].icon,
        ),
      );
    });
    kinds.forEach((kind) => {
      const spot = TILE_SPOTS[kind];
      net.push(
        pile(`cr-tile-${kind}`, kind, spot.x, spot.y, b.paper, { scale: PILE_SCALE, morph: 1 }),
      );
    });
  }
  if (!hubGone) {
    const w = progress(lt, CRITERIA.word, 0.5, easing.enter);
    net.push(
      focusIn('cr-word-o', hub.x, hub.y, w, [coworkWord(b, 'cr-word', hub.x, hub.y, WORD_SCALE)]),
    );
  }
  nodes.push(
    groupNode(
      'cr-net',
      net.filter((n): n is SceneNode => n !== null),
      { transform: { x: o.x, y: o.y } },
    ),
  );
  return nodes;
}

/**
 * "Meet Cowork", from the moment the hub's light lands at the centre: the
 * bright pools bloom out of that point, "Meet" and the name arrive into
 * focus, then one band of light crosses the name. On the beat grid.
 */
export const MEET = gridTimes({
  bloom: 0.75,
  kicker: 0.05,
  name: 0.15,
  shine: { start: 0.8, duration: 0.9 },
  glint: 1.2,
} as const);
/** Where the name sits (group-local): the centre of the frame. */
export const MEET_AT = { y: 640, kicker: 108 } as const;

/**
 * The ball, from the moment the carried name lands (s): the name melts into
 * drops that run together into the ball (`merge` long; the film's Three.js
 * layer draws them), which is whole at `formed` and drops onto the floor.
 */
export const REVEAL = {
  melt: beats(3.75),
  merge: beats(1),
  formed: beats(4.75),
} as const;

/** The reveal's light pools, around the name (offset from the centre, radii, colour, strength). */
const MEET_POOLS: readonly {
  x: number;
  y: number;
  rx: number;
  ry: number;
  color: string;
  alpha: number;
  rot: number;
}[] = [
  { x: -170, y: -230, rx: 360, ry: 260, color: C.meet.violet, alpha: 0.62, rot: -18 },
  { x: 210, y: -150, rx: 320, ry: 240, color: C.meet.blue, alpha: 0.55, rot: 24 },
  { x: -230, y: 160, rx: 330, ry: 250, color: C.meet.pink, alpha: 0.5, rot: 12 },
  { x: 190, y: 250, rx: 340, ry: 230, color: C.meet.amber, alpha: 0.46, rot: -20 },
  { x: 40, y: 430, rx: 300, ry: 200, color: C.meet.teal, alpha: 0.4, rot: 6 },
  { x: 20, y: -10, rx: 260, ry: 170, color: C.meet.lilac, alpha: 0.5, rot: 0 },
];

/** The reveal: bright pools of colour, "Meet" above the name, one shimmer across it. */
function meet(b: Board, o: { x: number; y: number }, lt: number): SceneNode[] {
  const cx = o.x + FW / 2;
  const cy = o.y + MEET_AT.y;
  const nodes: SceneNode[] = [];
  // The pools bloom out of the centre, then breathe and drift slowly.
  const bloom = progress(lt, 0, MEET.bloom, easing.enter);
  if (bloom > 0) {
    MEET_POOLS.forEach((pool, k) => {
      const drift = lt * 0.6;
      const dx = 18 * Math.sin(drift + k * 1.7);
      const dy = 14 * Math.cos(drift * 0.8 + k * 2.3);
      const s = lerp(0.25, 1, bloom) * (1 + 0.04 * Math.sin(drift * 1.3 + k));
      nodes.push(
        shapeNode(`meet-pool${k}`, {
          geometry: rect(0, 0, 200, 200, 100),
          fill: radialGradient(0, 0, 100, [
            { offset: 0, color: withAlpha(pool.color, pool.alpha) },
            { offset: 0.45, color: withAlpha(pool.color, pool.alpha * 0.55) },
            { offset: 0.75, color: withAlpha(pool.color, pool.alpha * 0.18) },
            { offset: 1, color: withAlpha(pool.color, 0) },
          ]),
          transform: {
            x: cx + (pool.x + dx) * s,
            y: cy + (pool.y + dy) * s,
            rotation: pool.rot + 6 * lt,
            scaleX: (pool.rx / 100) * s,
            scaleY: (pool.ry / 100) * s,
          },
          opacity: clamp(bloom * 1.4),
        }),
      );
    });
  }
  const name = b.heads['meetName'];
  const glow = b.heads['meetGlow'];
  const shine = b.heads['meetShine'];
  const halo = b.heads['meetHalo'];
  const nameTop = cy - (MEET_FONTS.name.size * (MEET_FONTS.name.lineHeight ?? 1.2)) / 2;
  // "Meet" stays until the name melts.
  const melting = progress(lt, REVEAL.melt, 0.35, easing.exit);
  if (melting < 1)
    nodes.push(
      groupNode(
        'meet-kicker-o',
        [head(b, 'meetKicker', cx, nameTop - MEET_AT.kicker + 40, lt - MEET.kicker)],
        melting > 0 ? { opacity: 1 - melting } : {},
      ),
    );
  // The name itself, already whole (carried here from the circle's centre,
  // growing on the way), with a soft light behind it; later its letters
  // melt, one after another, each shrinking into its centre, where the
  // film's ball layer grows its drop.
  if (name && glow && lt >= 0) {
    const melt = progress(lt, REVEAL.melt - 0.05, 0.5, easing.enter);
    nodes.push(
      groupNode('meet-name-glow', [glow(SETTLED, 0)], {
        transform: { x: cx, y: nameTop },
        opacity: 0.35 * bloom * (1 - melt),
        blur: 22,
      }),
    );
    if (melt <= 0) nodes.push(coworkWord(b, 'meet-name', cx, cy, 1));
    else nodes.push(...meltingName(b, cx, cy, melt));
  }
  // The shimmer: a slanted band of light crossing the name once. Real light
  // has soft edges, so the band is many thin slices whose strength follows a
  // smooth curve (the letters' own edges stay sharp), with a faint bloom.
  const sweep = progress(lt, MEET.shine.start, MEET.shine.duration, easing.camera);
  if (shine && halo && sweep > 0 && sweep < 1) {
    const width = name?.width ?? 520;
    const h = MEET_FONTS.name.size * 1.3;
    const x = lerp(cx - width / 2 - 160, cx + width / 2 + 160, sweep);
    const slant = 60;
    const slice = (x0: number, w: number) =>
      pathGeometry(
        `M${x0 + slant} ${nameTop - 20}L${x0 + w + slant} ${nameTop - 20}L${x0 + w - slant} ${nameTop + h}L${x0 - slant} ${nameTop + h}Z`,
      );
    const lit = Math.sin(Math.PI * sweep);
    // Nested bands on one centre line, each narrower than the last, so their
    // light adds up to a bell-shaped sheen (no two edges ever meet).
    const BANDS = 16;
    const sigma = 46;
    const text = groupNode('meet-shine-t', [shine(SETTLED, 0)], {
      transform: { x: cx, y: nameTop },
    });
    for (let k = 0; k < BANDS; k++) {
      const level = (k + 0.5) / BANDS;
      const w = 2 * sigma * Math.sqrt(2 * Math.log(1 / level));
      nodes.push(
        groupNode(`meet-shine${k}`, [renamed(text, `meet-shine${k}-`)], {
          clip: slice(x - w / 2, w),
          opacity: (1.6 / BANDS) * lit,
        }),
      );
    }
    nodes.push(
      groupNode(
        'meet-bloom',
        [groupNode('meet-bloom-t', [halo(SETTLED, 0)], { transform: { x: cx, y: nameTop } })],
        {
          clip: slice(x - 50, 100),
          opacity: 0.4 * lit,
          blur: 10,
        },
      ),
    );
  }
  // One small glint on the name's last letter as the light leaves it.
  const glint = sparkleStar(
    'meet-glint',
    cx + (name?.width ?? 520) / 2 - 18,
    nameTop + 26,
    (lt - MEET.glint) / 0.7,
  );
  if (glint && lt < REVEAL.melt) nodes.push(glint);
  return nodes;
}

/**
 * The reveal's name melting (`melt` 0–1): each letter, a little after the one
 * before, shrinks into its own centre (mid x-height, where the ball's drop
 * grows: `nameLetters` in the film uses the same place) and goes.
 */
function meltingName(b: Board, cx: number, cy: number, melt: number): SceneNode[] {
  const font = MEET_FONTS.name;
  const text = 'Cowork';
  const m = b.ui.measurer;
  const width = m.measure(text, font);
  const lh = font.size * (font.lineHeight ?? 1.2);
  const metrics = m.metrics?.(font) ?? { ascent: font.size * 0.95, descent: font.size * 0.25 };
  const midY = baselineOffset(font, metrics) - font.size * 0.36 - lh / 2;
  const n = text.length;
  return [...text].flatMap((ch, i) => {
    const own = clamp(melt * 1.5 - (i / Math.max(1, n - 1)) * 0.5);
    const shrink = 1 - 0.8 * own * own;
    const fade = 1 - clamp((own - 0.35) / 0.55);
    if (fade <= 0) return [];
    const a = m.measure(text.slice(0, i), font);
    const right = m.measure(text.slice(0, i + 1), font);
    const lx = (a + right) / 2 - width / 2;
    return [
      groupNode(
        `meet-melt${i}`,
        [
          textNode(`meet-melt${i}-t`, {
            text: ch,
            font,
            fill: C.text.primary,
            transform: { x: a - width / 2 - lx, y: -lh / 2 - midY },
          }),
        ],
        { transform: { x: cx + lx, y: cy + midY, scale: shrink }, opacity: fade },
      ),
    ];
  });
}

/** A copy of a node tree with every id prefixed (the same drawing used more than once). */
function renamed(node: SceneNode, prefix: string): SceneNode {
  return node.type === 'group'
    ? { ...node, id: prefix + node.id, children: node.children.map((c) => renamed(c, prefix)) }
    : { ...node, id: prefix + node.id };
}

/** The lockup's choreography, from its first letter (on the film's beat grid, sixteenths). */
export const INTRO = gridTimes({ tagline: 1.0, halo: 1.2 } as const);
/** The lockup: the name, centred (no logo), the tagline and the call to action below. */
export const LOCKUP = { y: 560, tagline: 68, cta: 196 } as const;

/** Where the hub's light lands in the reveal (relative to the group). */
export function revealSpot(): { x: number; y: number } {
  return { x: FW / 2, y: MEET_AT.y };
}

/**
 * The reveal (`meet`), or with `cta` the outro's lockup: a soft violet light
 * blooming, the name arriving into focus at the centre, the
 * tagline beneath it, then the call to action.
 */
function intro(
  b: Board,
  o: { x: number; y: number },
  lt = SETTLED,
  options: { cta?: boolean } = {},
): SceneNode[] {
  if (!options.cta) return meet(b, o, lt);
  const pre = 'out';
  const cx = o.x + FW / 2;
  const ly = o.y + LOCKUP.y;
  const halo = progress(lt, 0, INTRO.halo, easing.enter);
  const bloom = Math.max(0, Math.sin(Math.PI * clamp(lt / 0.6)));
  const nodes: SceneNode[] = [];
  if (halo > 0) {
    nodes.push(
      shapeNode(`${pre}-halo`, {
        geometry: rect(cx, ly, 700, 700, 350),
        fill: radialGradient(cx, ly, 350 * lerp(0.4, 1, halo), [
          withAlpha(C.brand.glow, 0.4 + 0.25 * bloom),
          withAlpha(C.brand.glow, 0),
        ]),
      }),
    );
  }
  nodes.push(
    head(
      b,
      `${pre}Name`,
      cx,
      ly - (OUT_NAME_FONT.size * (OUT_NAME_FONT.lineHeight ?? 1.2)) / 2,
      lt,
    ),
    head(b, `${pre}Tag`, cx, ly + LOCKUP.tagline, lt - INTRO.tagline),
  );
  nodes.push(...callToAction(b, cx, ly + LOCKUP.cta, lt - (INTRO.tagline + 0.8)));
  return nodes;
}

/**
 * The call to action's one shimmer, on the beat: this long after the
 * tagline, a sweep this long, then the star's twinkle (0.8 s).
 */
const CTA_SHIMMER = { first: beats(2.5), sweep: beats(0.75), star: 0.8 } as const;

/**
 * "Join the waitlist" as text, not a button, from `u` s after it starts
 * arriving (centred on `cx`, its line box's centre at `y`): the letters
 * come into focus, then one band of light crosses the words and a star
 * twinkles at the end.
 */
function callToAction(b: Board, cx: number, y: number, u: number): SceneNode[] {
  const text = b.heads['ctaText'];
  const shine = b.heads['ctaShine'];
  if (!text || u < 0) return [];
  const lh = CTA_FONT.size * (CTA_FONT.lineHeight ?? 1.2);
  const w = text.width;
  const left = cx - w / 2;
  const top = y - lh / 2;
  const textCx = left + text.width / 2;
  const nodes: SceneNode[] = [head(b, 'ctaText', textCx, top, u)];
  // One band of light across the words, then a star at the end.
  const since = u - (CTA_SHIMMER.first - 0.8);
  const sweep = clamp(since / CTA_SHIMMER.sweep);
  if (shine && sweep > 0 && sweep < 1) {
    const x = lerp(left - 80, left + text.width + 80, sweep);
    const lit = Math.sin(Math.PI * sweep);
    const band = (bw: number) =>
      pathGeometry(
        `M${x - bw / 2 + 18} ${top - 6}L${x + bw / 2 + 18} ${top - 6}L${x + bw / 2 - 18} ${top + lh + 6}L${x - bw / 2 - 18} ${top + lh + 6}Z`,
      );
    for (let k = 0; k < 8; k++) {
      const level = (k + 0.5) / 8;
      const bw = 2 * 22 * Math.sqrt(2 * Math.log(1 / level));
      nodes.push(
        groupNode(
          `cta-shine${k}`,
          [
            renamed(
              groupNode('cta-shine-t', [shine(SETTLED, 0)], { transform: { x: textCx, y: top } }),
              `cta-shine${k}-`,
            ),
          ],
          { clip: band(bw), opacity: (1.4 / 8) * lit },
        ),
      );
    }
  }
  const star = sparkleStar(
    'cta-star',
    left + w + 6,
    top - 4,
    (since - CTA_SHIMMER.sweep) / CTA_SHIMMER.star,
  );
  if (star) nodes.push(star);
  return nodes;
}

/**
 * The pitch's choreography (s from its first letter, on sixteenths): the
 * second line a second after the first, the light-violet marker once it has
 * been read, then both leave for the lockup, which starts `lead` after the
 * pitch (5.5 beats: 3 s).
 */
export const PITCH = {
  ...gridTimes({ second: 1.0, mark: 2.05, leave: 2.6 } as const),
  lead: beats(5.5),
} as const;
/** Where the two lines' tops sit in the outro group (centred on the frame's middle). */
const PITCH_AT = { first: 516, second: 588 } as const;

/**
 * "Stop waiting for answers." arriving letter by letter, then a second
 * later "Just ask Cowork." larger beneath it, as the first line steps back
 * and a violet light swells behind the answer; a light-violet marker sweeps
 * behind "ask Cowork." once it has been read; then both slide away in a
 * motion blur, the first a moment ahead, for the lockup.
 */
function pitch(b: Board, o: { x: number; y: number }, u: number): SceneNode[] {
  const first = b.heads['pitchFirst'];
  const second = b.heads['pitchSecond'];
  if (!first || !second || u < 0 || u >= PITCH.lead) return [];
  const cx = o.x + FW / 2;
  const out = (delay: number) => progress(u, PITCH.leave + delay, 0.36, easing.exit);
  const step = progress(u, PITCH.second, 0.6, easing.enter);
  const nodes: SceneNode[] = [];
  // The answer's light: a soft violet pool swelling as it arrives, gone as it leaves.
  const s = u - PITCH.second;
  const swell = progress(s, 0, 0.9, easing.enter) * (1 - out(0.05));
  if (swell > 0) {
    const gy = o.y + PITCH_AT.second + 40;
    const r = lerp(180, 360, swell);
    nodes.push(
      shapeNode('pitch-light', {
        geometry: rect(cx, gy, 2 * r, 2 * r, r),
        fill: radialGradient(cx, gy, r, [
          withAlpha(C.brand.glow, 0.26 * swell),
          withAlpha(C.brand.glow, 0),
        ]),
      }),
    );
  }
  nodes.push(
    groupNode('pitch-first', [head(b, 'pitchFirst', cx, o.y + PITCH_AT.first, u, out(0))], {
      opacity: 1 - 0.4 * step,
    }),
  );
  // The marker behind "ask Cowork.", swept once the line has been read.
  const sweep = progress(u, PITCH.mark, 0.45, easing.enter);
  if (sweep > 0) {
    const lh = PITCH_FONTS.second.size * (PITCH_FONTS.second.lineHeight ?? 1.2);
    const left = cx - second.width / 2 + b.ui.measure('Just ', PITCH_FONTS.second) - 10;
    const w = (cx + second.width / 2 + 10 - left) * sweep;
    nodes.push(
      shapeNode('pitch-mark', {
        geometry: rect(left + w / 2, o.y + PITCH_AT.second + lh * 0.58, w, lh * 0.66, 10),
        fill: withAlpha(C.brand.soft, 0.85),
        opacity: 1 - out(0.06),
      }),
    );
  }
  nodes.push(head(b, 'pitchSecond', cx, o.y + PITCH_AT.second, s, out(0.06)));
  return nodes;
}

/**
 * A product scene as the film shows it (`cowork-scenes.ts`), at content
 * time `lt`; settled, a moment that shows the whole scene.
 */
const PRODUCT_SETTLED = { ask: ASK.pick - 0.05, work: 8.4, answers: 5.2 } as const;
function productFrame(
  b: Board,
  id: 'ask' | 'work' | 'answers',
  o: { x: number; y: number },
  lt: number,
): SceneNode {
  const c = lt >= SETTLED ? PRODUCT_SETTLED[id] : lt;
  const kit = { look: b.look, ui: b.ui };
  const art = id === 'ask' ? askArt(kit, c) : id === 'work' ? workArt(kit, c) : answersArt(kit, c);
  return groupNode(`${id}-frame`, art, { transform: { x: o.x, y: o.y } });
}

export interface ArtOptions {
  /** Local time in the group's choreography (default: settled). */
  readonly lt?: number;
  /** For the static two-beat groups. */
  readonly beat?: 'a' | 'b';
  /** The camera diving through the cracked wall (0–1). */
  readonly dive?: number;
  /** "Cowork" has left the criteria group (it is flying to the intro). */
  readonly hubGone?: boolean;
  /** The piles have left the lost group (they are flying to the circle). */
  readonly pilesGone?: boolean;
}

/** Everything a group shows at local time `lt` (its style frame when settled). */
export function groupArt(b: Board, id: GroupId, options: ArtOptions = {}): SceneNode[] {
  const g = group(id);
  const o = { x: g.x, y: g.y };
  const lt = options.lt ?? SETTLED;
  switch (id) {
    case 'queries':
      return queries(b, o, lt, options.dive ?? 0);
    case 'lost':
      return lost(b, o, lt, options.pilesGone ?? false);
    case 'criteria':
      return criteria(b, o, lt, options.hubGone ?? false);
    case 'intro':
      return intro(b, o, lt);
    case 'ask':
    case 'work':
    case 'answers':
      return [productFrame(b, id, o, lt)];
    case 'outro':
      return [...pitch(b, o, lt + PITCH.lead), ...intro(b, o, lt, { cta: true })];
  }
}
