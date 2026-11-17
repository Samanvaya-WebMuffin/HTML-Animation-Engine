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
  clamp,
  groupNode,
  imageNode,
  lerp,
  progress,
  layoutText,
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
  glowShadows,
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
  markTile,
  paperCard,
  puck,
  textLines,
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
import { mark } from './cowork-ui.js';

const { easing } = look;
export const FW = 720;
export const FH = 1280;

// ---------------------------------------------------------------------------
// Layout: where each group sits, what lights it, how threads join them
// ---------------------------------------------------------------------------

export type GroupId =
  | 'queries'
  | 'lost'
  | 'criteria'
  | 'intro'
  | 'ask'
  | 'work'
  | 'answers'
  | 'library'
  | 'proof'
  | 'week'
  | 'outro';

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
  { id: 'library', x: 0, y: ROW + 60, hint: 'people' },
  { id: 'proof', x: 0, y: 2 * ROW + 40, hint: 'knowledge' },
  { id: 'week', x: COL, y: 2 * ROW - 30, hint: 'time' },
  { id: 'outro', x: 2 * COL, y: 2 * ROW + 60, hint: 'outcome' },
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
  { from: 'answers', to: 'library', meaning: 'outcome' },
  { from: 'library', to: 'proof', meaning: 'brand' },
  { from: 'proof', to: 'week', meaning: 'time' },
  { from: 'week', to: 'outro', meaning: 'brand' },
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
    sub: 'Every step _checked._',
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
  week: { title: 'A week of digging.', sub: 'Condensed into *minutes.*', accent: C.text.accent },
};

/** The lockup's name and tagline (no card: they stand on the light). */
const HEADLINES: Readonly<
  Record<string, { text: string; font: FontSpec; color?: string; align?: 'left' | 'center' }>
> = {
  inName: { text: 'Cowork.', font: T.display },
  inTag: {
    text: 'Know what your company knows',
    font: face('title', 28, { weight: 500 }),
    color: C.text.secondary,
    align: 'center',
  },
  outName: { text: 'Cowork.', font: T.display },
  outTag: {
    text: 'Know what your company knows',
    font: face('title', 28, { weight: 500 }),
    color: C.text.secondary,
    align: 'center',
  },
};

/** Everything the board needs, made once (textures are generated and preloaded). */
export async function createBoard(measurer: TextMeasurer): Promise<Board> {
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
    });
  }
  const cards: Record<string, Headline> = {};
  for (const [key, spec] of Object.entries(CARDS))
    cards[key] = makeHeadline(`card-${key}`, spec, measurer);
  return {
    look: createLook(measurer),
    heads,
    cards,
    paper: await createPaperTextures('cowork-paper'),
  };
}

/** Fonts the board uses beyond the look's own (the intro's tagline). */
export const BOARD_FONTS = [
  face('title', 28, { weight: 500 }),
  face('title', 84, { weight: 600, letterSpacing: 0 }),
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

/** The Cowork mark, small, for app headers. */
function miniMark(id: string, x: number, y: number, size: number): SceneNode {
  // The same violet mark tile as the app screens.
  return mark(id, x, y, size * 1.1);
}

/**
 * An app screen: paper with a header (mark, title, optional tabs). Content
 * is laid out from the screen's top-left corner, clipped to the screen.
 */
function screen(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  kids: readonly SceneNode[],
  options: {
    tabs?: readonly string[];
    active?: number;
    blur?: number;
    rotation?: number;
    lift?: 0 | 1 | 2;
    measure?: (s: string, f: FontSpec) => number;
  } = {},
): SceneNode {
  const header: SceneNode[] = [
    miniMark(`${id}-mk`, 30, 30, 20),
    txt(`${id}-ttl`, title, 50, 19, T.heading, C.text.primary),
  ];
  const measure = options.measure;
  if (options.tabs && measure) {
    let tx = w - 24;
    const xs: number[] = [];
    for (let k = options.tabs.length - 1; k >= 0; k--) {
      tx -= measure(options.tabs[k] ?? '', T.label);
      xs[k] = tx;
      tx -= 22;
    }
    options.tabs.forEach((name, k) => {
      const active = k === (options.active ?? 0);
      header.push(
        txt(
          `${id}-tab${k}`,
          name,
          xs[k] ?? 0,
          22,
          T.label,
          active ? C.text.primary : C.text.tertiary,
        ),
      );
      if (active)
        header.push(
          shapeNode(`${id}-tabl${k}`, {
            geometry: rect(
              (xs[k] ?? 0) + measure(name, T.label) / 2,
              58,
              measure(name, T.label),
              3,
              1.5,
            ),
            fill: C.brand.fill,
          }),
        );
    });
  }
  header.push(
    shapeNode(`${id}-rule`, { geometry: rect(w / 2, 60, w, 1), fill: C.stroke.hairline }),
  );
  return paperCard(id, x + w / 2, y + h / 2, w, h, {
    lift: options.lift ?? 1,
    radius: 20,
    rotation: options.rotation ?? 0,
    ...(options.blur ? { blur: options.blur } : {}),
    children: [
      groupNode(`${id}-in`, [...header, ...kids], {
        transform: { x: -w / 2, y: -h / 2 },
        clip: rect(w / 2, h / 2, w, h, 20),
      }),
    ],
  });
}

/** A typed question in a composer, with its caret. */
function composerText(id: string, text: string, x: number, y: number, width: number): SceneNode[] {
  return [
    textNode(`${id}-q`, {
      text,
      font: face('body', 20, { weight: 500 }),
      fill: C.text.primary,
      maxWidth: width,
      transform: { x, y },
    }),
  ];
}

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
export const OPENING = {
  text: 0,
  /** The line breaks into grain and drifts away. */
  dissolve: { start: beats(4.5), duration: beats(1.5) },
  pan: { start: beats(4.5), duration: beats(1.25) },
  fill: beats(4.5),
  flood: { start: beats(5.25), end: beats(7.5) },
  blur: { start: beats(7.5), duration: beats(0.5) },
  /** "Most of it is lost." printed on the wall. */
  lost: beats(8),
  loosen: beats(8.75),
  crack: { start: beats(9.25), duration: 0.4 },
  break: beats(10),
} as const;

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
  b: { start: beats(10.5), search: 0.9, each: 0.3, ring: 0.9, sweep: 2.6 },
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

function lost(b: Board, o: { x: number; y: number }, lt = SETTLED): SceneNode[] {
  const L = b.look;
  const nodes: SceneNode[] = [];
  const B = LOST.b;
  // The board is only seen before the paper wall covers it; the wall breaks
  // onto the bare ground, and the line, the searches and the clock hold the
  // centre of the frame on their own.
  if (lt < OPENING.flood.end) nodes.push(groupNode('lost-board', pinboard(b, o, lt)));
  if (lt >= B.start) {
    // The line on its card, then the searches beside the clock: one block in the middle of the frame.
    const card = b.cards['lostB'];
    const [cardW, cardH] = [card?.width ?? 640, card?.height ?? 220];
    const top = o.y + (FH - (cardH + HOUR.gap + HOUR.row)) / 2;
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
const HOUR = { gap: 44, row: 200, clock: 96 } as const;
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
  hub: 0.1,
  sats: { start: 0.35, each: 0.08 },
  links: { start: 0.55, each: 0.08, draw: 0.55 },
  pulses: { start: 1.3, every: 1.1 },
  reach: 0.8,
  field: { start: 1.2, duration: 1.7 },
  tasks: [2.3, 2.55],
  done: 3.3,
} as const;
/** On the film's beat grid: sixteenths, the staggers on thirty-seconds. */
export const CRITERIA = {
  ...gridTimes(CRITERIA_WRITTEN),
  sats: { ...gridTimes(CRITERIA_WRITTEN.sats), each: onGrid(CRITERIA_WRITTEN.sats.each, SFX_DIV) },
  links: {
    ...gridTimes(CRITERIA_WRITTEN.links),
    each: onGrid(CRITERIA_WRITTEN.links.each, SFX_DIV),
  },
};

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
  const L = b.look;
  const hub = { x: FW / 2, y: 760 };
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
  const sats: [IconName, Meaning, number, number][] = [
    ['doc', 'knowledge', -230, -150],
    ['sheet', 'knowledge', 0, -235],
    ['chart', 'knowledge', 230, -150],
    ['chat', 'knowledge', -250, 70],
    ['people', 'people', 250, 70],
    ['mail', 'knowledge', -120, 220],
    ['people', 'people', 130, 225],
  ];
  sats.forEach(([ic, meaning, dx, dy], k) => {
    const end = { x: hub.x + dx, y: hub.y + dy };
    const start = CRITERIA.links.start + k * CRITERIA.links.each;
    net.push(
      connector({
        id: `cr-link${k}`,
        d: roundedRoute(
          elbow(end, hub, Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'),
          24,
        ),
        color: C.stroke.connector,
        width: 2,
        start,
        duration: CRITERIA.links.draw,
        ease: easing.enter,
        dots: [0.45],
        dotColor: C.stroke.strong,
        pulses: [0, 1, 2, 3, 4].map((n) => ({
          at: CRITERIA.pulses.start + n * CRITERIA.pulses.every + k * 0.13,
          duration: 1,
          color: tone(meaning).fill,
          size: 4,
        })),
        pulseEase: easing.drift,
      })(lt),
      focusIn(
        `cr-p${k}-o`,
        end.x,
        end.y,
        progress(lt, CRITERIA.sats.start + k * CRITERIA.sats.each, 0.45, easing.enter),
        [puck(`cr-p${k}`, end.x, end.y, 40, ic, meaning)],
      ),
    );
  });
  if (!hubGone) {
    net.push(
      focusIn('cr-hub-o', hub.x, hub.y, progress(lt, CRITERIA.hub, 0.5, easing.enter), [
        puck('cr-hub', hub.x, hub.y, 64, 'layers', 'brand'),
      ]),
    );
  }
  // Work they couldn't take on before: lit as insight; the second gets done.
  const tasks: [string, number, number][] = [
    ['Forecast Q3 demand', 200, 1100],
    ['Audit 2,400 contracts', 540, 1100],
  ];
  tasks.forEach(([label, x, y], k) => {
    const p = progress(lt, CRITERIA.tasks[k] ?? 0, 0.5, easing.enter);
    const done = k === 1 ? progress(lt, CRITERIA.done, 0.4, easing.snap) : 0;
    const meaning: Meaning = done > 0.5 ? 'outcome' : 'insight';
    const w = L.measurer.measure(label, T.small) + 70;
    net.push(
      focusIn(`task${k}-o`, x, y, p, [
        paperCard(`task${k}`, x, y, w, 56, {
          lift: 1,
          children: [
            shapeNode(`task${k}-glow`, {
              geometry: rect(0, 0, w, 56, 14),
              stroke: { color: tone(meaning).glow, width: 3 },
            }),
            groupNode(
              `task${k}-ic`,
              [
                icon(
                  `task${k}-i`,
                  meaning === 'outcome' ? 'check' : 'insight',
                  0,
                  0,
                  18,
                  tone(meaning).fill,
                  2,
                ),
              ],
              {
                transform: {
                  x: -w / 2 + 26,
                  y: 0,
                  scale: k === 1 ? 1 + 0.25 * Math.sin(Math.PI * done) : 1,
                },
              },
            ),
            txt(`task${k}-t`, label, -w / 2 + 46, -10, T.small, C.text.primary),
          ],
        }),
      ]),
    );
  });
  nodes.push(
    groupNode(
      'cr-net',
      net.filter((n): n is SceneNode => n !== null),
      {
        // A slightly tilted plane, pivoting on the hub so nothing slides off the frame.
        transform: {
          x: o.x + hub.x,
          y: o.y + hub.y + 20,
          skewX: -6,
          scaleY: 0.94,
          originX: hub.x,
          originY: hub.y,
        },
      },
    ),
  );
  return nodes;
}

/** Choreography of the intro, from the moment the tile lands. */
/** On the film's beat grid (sixteenths). */
export const INTRO = gridTimes({ name: 0.35, tagline: 1.0, halo: 1.2 } as const);
/** The lockup: a small Cowork tile on the left of the name, centred as a pair; the tagline below. */
export const LOCKUP = { y: 560, tile: 76, gap: 22, tagline: 62, cta: 190 } as const;

/** Where the tile sits in a group's lockup (relative to the group), for the carrier to land on. */
export function tileSpot(b: Board, cta = false): { x: number; y: number; size: number } {
  const nameW = b.heads[cta ? 'outName' : 'inName']?.width ?? 240;
  const width = LOCKUP.tile + LOCKUP.gap + nameW;
  return { x: FW / 2 - width / 2 + LOCKUP.tile / 2, y: LOCKUP.y, size: LOCKUP.tile };
}

/**
 * The Cowork tile (it has just landed, carried from the hub), its violet
 * halo blooming, then the name and the tagline arriving into focus. With
 * `cta`, the outro's call to action follows. `tileHidden` leaves the tile to
 * the carrier while it is still in flight.
 */
function intro(
  b: Board,
  o: { x: number; y: number },
  lt = SETTLED,
  options: { cta?: boolean; tileHidden?: boolean } = {},
): SceneNode[] {
  const L = b.look;
  const cta = options.cta ?? false;
  const pre = cta ? 'out' : 'in';
  const cx = o.x + FW / 2;
  const spot = tileSpot(b, cta);
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
  if (!options.tileHidden && lt >= 0)
    nodes.push(markTile(`${pre}-mark`, o.x + spot.x, ly, spot.size, { glow: 0.9 + 0.8 * bloom }));
  nodes.push(
    // The name sits beside the tile, its line box centred on the tile.
    head(
      b,
      `${pre}Name`,
      o.x + spot.x + LOCKUP.tile / 2 + LOCKUP.gap,
      ly - (T.display.size * (T.display.lineHeight ?? 1.2)) / 2,
      lt - INTRO.name,
    ),
    head(b, `${pre}Tag`, cx, ly + LOCKUP.tagline, lt - INTRO.tagline),
  );
  if (cta) {
    const p = progress(lt, INTRO.tagline + 0.8, 0.5, easing.enter);
    if (p > 0) {
      // Once it has landed, one quick shimmer crosses the button, and as it
      // leaves a single star twinkles at the button's top right.
      const since = lt - (INTRO.tagline + CTA_SHIMMER.first);
      const btn = L.button('cta', 'Join the waitlist.', 0, 0, {
        primary: true,
        ...(since > 0
          ? {
              shimmer: since / CTA_SHIMMER.sweep,
              sparkle: (since - CTA_SHIMMER.sweep) / CTA_SHIMMER.star,
            }
          : {}),
      });
      nodes.push(
        groupNode('cta-pos', [btn.node], {
          transform: {
            // originX is placed at x, so the button's centre sits on the lockup's axis.
            x: cx,
            y: ly + LOCKUP.cta + 10 * (1 - p),
            scale: 1.25,
            originX: btn.w / 2,
          },
          opacity: clamp(p * 1.6),
        }),
      );
    }
  }
  return nodes;
}

/**
 * The call to action's one shimmer, on the beat: this long after the
 * tagline, a sweep this long, then the star's twinkle (0.8 s).
 */
const CTA_SHIMMER = { first: beats(2.5), sweep: beats(0.75), star: 0.8 } as const;

const ASK_QUESTION =
  'Which suppliers slowed our deliveries this quarter, and what did we promise customers because of it?';
const ASK_FONT = face('body', 20, { weight: 500 });

function ask(b: Board, o: { x: number; y: number }): SceneNode[] {
  const L = b.look;
  const m = (s: string, f: FontSpec) => L.measurer.measure(s, f);
  const nodes: SceneNode[] = [head(b, 'ask', o.x + HEAD.x, o.y + HEAD.y)];
  // The caret sits just after the last typed character.
  const typed = layoutText(ASK_QUESTION, ASK_FONT, { measurer: L.measurer, maxWidth: 500 });
  const lastLine = typed.lines[typed.lines.length - 1];
  const caret = {
    x: 46 + (lastLine?.x ?? 0) + (lastLine?.width ?? 0) + 3,
    y: 156 + (lastLine?.y ?? 0) + typed.lineHeight / 2,
  };
  // Behind, out of focus: the rep's quick question and the HR head and intern asking the same thing.
  nodes.push(
    screen(
      'ask-rep',
      o.x - 60,
      o.y + 300,
      400,
      300,
      'Inbox',
      [
        ...Array.from({ length: 4 }, (_, k) =>
          textLines(`ask-rep-r${k}`, 24, 90 + k * 48, [200, 140], { gap: 16 }),
        ),
      ],
      { blur: 7, rotation: -4, lift: 0 },
    ),
    screen(
      'ask-hr',
      o.x + 420,
      o.y + 930,
      320,
      260,
      'Cowork',
      [...composerText('ask-hr', 'What were this year’s salary revisions?', 22, 90, 270)],
      { blur: 6, rotation: 5, lift: 0 },
    ),
  );
  const kids: SceneNode[] = [
    txt('ask-coo-h', 'What do you need to know?', 28, 86, T.title, C.text.primary),
    shapeNode('ask-coo-box', {
      geometry: rect(300, 236, 552, 190, 18),
      fill: C.surface.paper,
      stroke: { color: C.stroke.focus, width: 1.5 },
      shadow: glowShadows(lighting, C.brand.glow, { radius: 12, strength: 0.35 }),
    }),
    ...composerText('ask-coo', ASK_QUESTION, 46, 156, 500),
    shapeNode('ask-coo-caret', {
      geometry: rect(caret.x, caret.y, 2, 24, 1),
      fill: C.brand.fill,
    }),
    shapeNode('ask-lvl', { geometry: rect(160, 360, 240, 40, 12), fill: C.surface.sunken }),
    shapeNode('ask-lvl-sel', {
      geometry: rect(240, 360, 74, 32, 9),
      fill: C.surface.paper,
      shadow: elevationShadows(lighting, 'low'),
    }),
    ...['Level 1', 'Level 2', 'Level 3'].map((n, k) =>
      txt(`ask-lvl${k}`, n, 80 + k * 80, 351, T.label, k === 2 ? C.text.accent : C.text.tertiary, {
        align: 'center',
      }),
    ),
    L.chip('ask-deep', 'Deep analysis · 15–100 min', 300, 360, 'time', { icon: 'clock' }).node,
    L.button('ask-go', 'Ask', 470, 430, { primary: true, icon: 'send' }).node,
    txt('ask-rec', 'recent', 28, 480, T.caps, C.text.tertiary),
    ...['Which accounts renew next quarter?', 'Why did churn rise in the north?'].map((q, k) =>
      txt(`ask-rec${k}`, q, 56, 512 + k * 40, T.small, C.text.secondary),
    ),
    ...[0, 1].map((k) => icon(`ask-rec-i${k}`, 'search', 36, 522 + k * 40, 15, C.text.tertiary)),
  ];
  nodes.push(
    screen('ask-coo', o.x + 60, o.y + 360, 600, 600, 'Cowork', kids, {
      tabs: ['Ask', 'Work', 'Reports'],
      active: 0,
      measure: m,
      lift: 2,
    }),
  );
  return nodes;
}

function work(b: Board, o: { x: number; y: number }): SceneNode[] {
  const L = b.look;
  const m = (s: string, f: FontSpec) => L.measurer.measure(s, f);
  const nodes: SceneNode[] = [head(b, 'work', o.x + HEAD.x, o.y + HEAD.y)];
  nodes.push(
    screen(
      'wk-plan',
      o.x - 40,
      o.y + 290,
      330,
      360,
      'Plan',
      [
        txt('wk-plan-s', 'steps', 24, 84, T.caps, C.text.tertiary),
        ...[0, 1, 2, 3].map((k) => textLines(`wk-plan-l${k}`, 52, 122 + k * 40, [200])),
      ],
      { blur: 6, rotation: -5, lift: 0 },
    ),
  );
  const rows: SceneNode[] = [
    txt('wk-t', 'Supplier delays and promises', 28, 84, T.heading, C.text.primary),
    L.chip('wk-run', 'Running · 4 researchers', 28, 132, 'time', { icon: 'clock' }).node,
    txt('wk-el', 'elapsed', 572, 80, T.caps, C.text.tertiary, { align: 'right' }),
    txt('wk-clock', '16:30', 572, 98, T.clock, C.time.fg, { align: 'right' }),
    shapeNode('wk-rule', { geometry: rect(300, 168, 600, 1), fill: C.stroke.hairline }),
  ];
  [
    ['Delivery logs · ERP', 0.92, '1,038'],
    ['Supplier emails', 0.74, '702'],
    ['Customer contracts', 0.61, '388'],
    ['Teams threads', 0.83, '911'],
  ].forEach(([name, p, items], k) => {
    const y = 196 + k * 62;
    rows.push(
      shapeNode(`wk-r${k}-i`, { geometry: rect(46, y + 20, 36, 36, 11), fill: C.brand.tint }),
      icon(`wk-r${k}-ic`, 'search', 46, y + 20, 17, C.brand.fill, 1.7),
      txt(`wk-r${k}-n`, String(name), 76, y + 2, T.small, C.text.primary),
      txt(`wk-r${k}-c`, `${items} read`, 572, y + 2, T.mono, C.text.secondary, { align: 'right' }),
      shapeNode(`wk-r${k}-tr`, {
        geometry: rect(76 + 248, y + 34, 496, 4, 2),
        fill: C.surface.sunken,
      }),
      shapeNode(`wk-r${k}-b`, {
        geometry: rect(76 + 248 * Number(p), y + 34, 496 * Number(p), 4, 2),
        fill: C.brand.fill,
      }),
    );
  });
  rows.push(txt('wk-cl', 'checklist', 28, 462, T.caps, C.text.tertiary));
  [
    'Collected delivery logs for 46 suppliers',
    'Matched 1,318 late order lines',
    'Found 22 promises in emails and chats',
    'Checking every figure against its source',
  ].forEach((s, k) => {
    const y = 494 + k * 40;
    const done = k < 3;
    rows.push(
      shapeNode(`wk-c${k}`, {
        geometry: rect(40, y + 11, 22, 22, 11),
        fill: done ? C.status.done : C.surface.paper,
        stroke: done ? undefined : { color: C.status.running, width: 2, dash: [10, 4] },
      }),
      ...(done ? [icon(`wk-c${k}-i`, 'check', 40, y + 11, 16, P.white, 2.2)] : []),
      txt(`wk-c${k}-t`, s, 62, y, T.small, done ? C.text.primary : C.text.secondary),
    );
  });
  nodes.push(
    screen('wk-main', o.x + 60, o.y + 330, 600, 680, 'Cowork', rows, {
      tabs: ['Ask', 'Work', 'Reports'],
      active: 1,
      measure: m,
      lift: 2,
    }),
  );
  // The rep's answer, already there, beside it (out of focus).
  nodes.push(
    screen(
      'wk-rep',
      o.x + 400,
      o.y + 1000,
      330,
      230,
      'Cowork',
      [
        textLines('wk-rep-l', 22, 90, [270, 250, 180]),
        L.chip('wk-rep-c', 'High confidence', 22, 170, 'outcome', { icon: 'shield' }).node,
      ],
      { blur: 6, rotation: 4, lift: 0 },
    ),
  );
  return nodes;
}

function answers(b: Board, o: { x: number; y: number }, beat: 'a' | 'b'): SceneNode[] {
  const L = b.look;
  if (beat === 'a') {
    const nodes: SceneNode[] = [head(b, 'answersA', o.x + HEAD.x, o.y + HEAD.y)];
    // The HR head's and the intern's screens, one above the other.
    const W = 620;
    const H = 262;
    const pane = (
      id: string,
      y: number,
      who: string,
      color: string,
      initials: string,
      allowed: boolean,
    ) => {
      const kids: SceneNode[] = [
        L.avatar(`${id}-av`, initials, W - 40, 30, 16, color),
        shapeNode(`${id}-qb`, {
          geometry: rect(W - 24 - 170, 100, 340, 44, 18),
          fill: C.brand.tint,
        }),
        textNode(`${id}-q`, {
          text: 'What were this year’s salary revisions?',
          font: T.small,
          fill: C.text.primary,
          transform: { x: W - 24 - 340 + 20, y: 90 },
        }),
        txt(`${id}-who`, 'cowork', 24, 140, T.meta, C.text.tertiary),
      ];
      if (allowed) {
        const c1 = L.citation(`${id}-c1`, 1, 'doc', 'Revision policy', 24, 226);
        kids.push(
          textNode(`${id}-a`, {
            text: 'This year’s revision averaged 7.2%, effective 1 April. Bands 3 to 5 rose 8 to 10%.',
            font: T.small,
            fill: C.text.primary,
            maxWidth: W - 48,
            transform: { x: 24, y: 164 },
          }),
          c1.node,
          L.citation(`${id}-c2`, 2, 'doc', 'Pay committee', 32 + c1.w, 226).node,
        );
      } else {
        kids.push(
          shapeNode(`${id}-lockd`, { geometry: rect(46, 196, 44, 44, 22), fill: C.friction.bg }),
          icon(`${id}-lock`, 'lock', 46, 196, 22, C.friction.fg, 1.6),
          textNode(`${id}-e`, {
            text: 'Nothing you’re allowed to see answers this.',
            font: T.small,
            fill: C.text.secondary,
            transform: { x: 82, y: 186 },
          }),
        );
      }
      return screen(id, o.x + 50, y, W, H, who, kids, { lift: 2 });
    };
    nodes.push(
      pane('an-hr', o.y + 330, 'HR head', C.avatar.hr, 'HR', true),
      pane('an-in', o.y + 330 + H + 24, 'Intern', C.avatar.intern, 'IN', false),
    );
    return nodes;
  }
  // The report opens on its bottom line, with the source email behind it.
  const nodes: SceneNode[] = [head(b, 'answersB', o.x + HEAD.x, o.y + HEAD.y)];
  nodes.push(
    screen(
      'an-mail',
      o.x + 330,
      o.y + 300,
      380,
      280,
      'Re: Renewal terms',
      [
        shapeNode('an-mail-hl', { geometry: rect(190, 120, 330, 26, 6), fill: C.insight.marker }),
        textLines('an-mail-l', 24, 120, [300, 260, 280, 200], { gap: 30 }),
      ],
      { blur: 6, rotation: 5, lift: 0 },
    ),
  );
  const kids: SceneNode[] = [
    txt('rp-k', 'REPORT · LEVEL 3', 28, 84, T.caps, C.text.tertiary),
    txt('rp-t', 'Supplier delays and promises', 28, 106, T.title, C.text.primary),
    L.chip('rp-done', 'Done · 18:40', 28, 160, 'outcome', { icon: 'check' }).node,
    shapeNode('rp-bl', { geometry: rect(300, 252, 552, 120, 14), fill: C.surface.tint }),
    shapeNode('rp-bl-bar', { geometry: rect(26, 252, 4, 120, 2), fill: C.brand.fill }),
    txt('rp-bl-k', 'bottom line', 46, 204, T.caps, C.text.accent),
    shapeNode('rp-bl-hl', {
      geometry: rect(46 + 198 + 22, 240, 52, 26, 6),
      fill: C.insight.marker,
    }),
    textNode('rp-bl-t', {
      text: 'Three suppliers caused 71% of late deliveries. We promised 14 customers new dates or credits.',
      font: T.body,
      fill: C.text.primary,
      maxWidth: 520,
      transform: { x: 46, y: 228 },
    }),
    txt('rp-ch', 'Average days late, by supplier', 28, 340, T.label, C.text.secondary),
  ];
  [
    ['Kestrel Alloys', 9.4],
    ['Arbor Freight', 6.1],
    ['Halden Plastics', 4.8],
    ['All others', 1.2],
  ].forEach(([n, d], k) => {
    const y = 378 + k * 40;
    const w = (Number(d) / 10) * 320;
    kids.push(
      txt(`rp-b${k}-n`, String(n), 28, y - 9, T.small, C.text.secondary),
      shapeNode(`rp-b${k}`, {
        geometry: rect(176 + w / 2, y + 2, w, 22, 6),
        fill: k < 3 ? C.source.icon : C.stroke.strong,
      }),
      txt(`rp-b${k}-v`, `${Number(d).toFixed(1)} d`, 186 + w, y - 8, T.mono, C.text.primary),
    );
  });
  kids.push(
    txt('rp-src', 'SOURCES · 38', 28, 548, T.caps, C.text.tertiary),
    L.chip('rp-s1', 'Delivery emails · 21', 28, 590, 'knowledge', { icon: 'mail' }).node,
    L.chip('rp-s2', 'Logistics logs · 9', 230, 590, 'knowledge', { icon: 'doc' }).node,
  );
  nodes.push(screen('rp', o.x + 60, o.y + 380, 600, 650, 'Cowork', kids, { lift: 2 }));
  return nodes;
}

function library(b: Board, o: { x: number; y: number }): SceneNode[] {
  const L = b.look;
  const m = (s: string, f: FontSpec) => L.measurer.measure(s, f);
  const nodes: SceneNode[] = [head(b, 'library', o.x + HEAD.x, o.y + HEAD.y)];
  const rows: SceneNode[] = [
    txt('lib-t', 'Reports', 28, 80, T.title, C.text.primary),
    L.chip('lib-q', 'Q3 2026', 470, 96, 'time', { icon: 'calendar' }).node,
  ];
  const list: [string, string, string, string[]][] = [
    [
      'Supplier delays and promises',
      'COO · Level 3 · Updated 30 Sep',
      'v2',
      [C.avatar.coo, C.avatar.cfo],
    ],
    ['Renewals at risk, Q2', 'Sales ops · Level 3 · 24 Jun', 'v3', [C.avatar.rep, C.avatar.team]],
    ['Vendor contract terms', 'Legal · Level 3 · 19 Jun', 'v2', [C.avatar.hr]],
    ['Escalations this month', 'Support · Level 3 · 9 Jun', 'v4', [C.avatar.intern, C.avatar.rep]],
  ];
  list.forEach(([title, meta, v, people], k) => {
    const y = 140 + k * 86 + (k > 0 ? 96 : 0);
    if (k === 0)
      rows.push(
        shapeNode('lib-new', {
          geometry: rect(300, y + 36, 568, 76, 14),
          fill: C.surface.tint,
          stroke: { color: C.brand.soft, width: 1.2 },
        }),
      );
    rows.push(
      shapeNode(`lib-r${k}-i`, { geometry: rect(52, y + 36, 40, 40, 11), fill: C.source.bg }),
      icon(`lib-r${k}-ic`, 'doc', 52, y + 36, 20, C.source.icon),
      txt(`lib-r${k}-t`, title, 86, y + 14, T.small, C.text.primary),
      txt(`lib-r${k}-m`, meta, 86, y + 38, T.label, C.text.tertiary),
      L.chip(`lib-r${k}-v`, v, 410, y + 36, k === 0 ? 'outcome' : 'brand').node,
      ...people.map((c, i) =>
        L.avatar(`lib-r${k}-p${i}`, ['CO', 'CF', 'SR', 'HR'][i] ?? '', 480 + i * 26, y + 36, 14, c),
      ),
      shapeNode(`lib-r${k}-rule`, { geometry: rect(300, y + 80, 560, 1), fill: C.stroke.hairline }),
    );
  });
  // Another team's question, built on version 2.
  rows.push(
    paperCard('lib-build', 330, 290, 520, 76, {
      lift: 1,
      children: [
        L.avatar('lib-build-av', 'FT', -232, 0, 14, C.avatar.team),
        txt('lib-build-w', 'Finance team asked', -208, -24, T.label, C.text.tertiary),
        txt(
          'lib-build-q',
          'How will supplier delays affect Q3 margins?',
          -208,
          -2,
          T.small,
          C.text.primary,
        ),
        L.chip('lib-build-c', 'Builds on v2', 120, -18, 'knowledge', { icon: 'link' }).node,
      ],
    }),
    shapeNode('lib-thread', {
      geometry: pathGeometry('M52 210V262Q52 290 72 290'),
      stroke: { color: C.source.glow, width: 2, cap: 'round' },
    }),
  );
  nodes.push(
    screen('lib', o.x + 60, o.y + 330, 600, 640, 'Cowork', rows, {
      tabs: ['Ask', 'Work', 'Reports'],
      active: 2,
      measure: m,
      lift: 2,
    }),
  );
  // Shared with the CFO.
  const toastW = L.measurer.measure('Shared with CFO', T.small) + 70;
  nodes.push(
    groupNode(
      'lib-toast',
      [
        shapeNode('lib-toast-bg', {
          geometry: rect(0, 0, toastW, 50, 25),
          fill: C.text.primary,
          shadow: elevationShadows(lighting, 'mid'),
        }),
        shapeNode('lib-toast-ck', {
          geometry: rect(-toastW / 2 + 26, 0, 22, 22, 11),
          fill: C.status.done,
        }),
        icon('lib-toast-i', 'check', -toastW / 2 + 26, 0, 15, P.white, 2.2),
        txt('lib-toast-t', 'Shared with CFO', -toastW / 2 + 46, -11, T.small, P.white),
      ],
      { transform: { x: o.x + FW / 2, y: o.y + 1040 } },
    ),
  );
  return nodes;
}

function proof(b: Board, o: { x: number; y: number }): SceneNode[] {
  const L = b.look;
  const m = (s: string, f: FontSpec) => L.measurer.measure(s, f);
  const nodes: SceneNode[] = [];
  // A placeholder for a real screen recording: the product, tilted, shallow focus.
  const rows: SceneNode[] = [
    txt('pr-t', 'Supplier delays and promises', 28, 84, T.heading, C.text.primary),
    txt('pr-clock', '12:08', 572, 84, T.clock, C.time.fg, { align: 'right' }),
    ...[0, 1, 2, 3, 4].map((k) => textLines(`pr-l${k}`, 28, 160 + k * 60, [520, 420], { gap: 18 })),
  ];
  nodes.push(
    groupNode(
      'pr-tilt',
      [
        screen('pr-screen', 0, 0, 640, 560, 'Cowork', rows, {
          tabs: ['Ask', 'Work', 'Reports'],
          active: 1,
          measure: m,
          lift: 2,
        }),
      ],
      {
        transform: { x: o.x + 40, y: o.y + 230, skewY: -5, rotation: -2 },
      },
    ),
    paperCard('pr-fg', o.x + 120, o.y + 860, 300, 200, {
      lift: 2,
      rotation: -9,
      blur: 14,
      children: [textLines('pr-fg-l', -110, -40, [200, 160, 180])],
    }),
  );
  const cardText = 'Sparing hours of searching,';
  const w = L.measurer.measure(cardText, face('headline', 34)) + 64;
  nodes.push(
    glassPanel(
      'pr-card',
      o.x + FW / 2,
      o.y + 960,
      w,
      84,
      [txt('pr-card-t', cardText, -w / 2 + 32, -20, face('headline', 34), C.text.primary)],
      24,
    ),
    txt(
      'pr-note',
      'PLACEHOLDER · real screen recordings drop in here',
      o.x + FW / 2,
      o.y + 1060,
      T.caps,
      C.text.tertiary,
      { align: 'center' },
    ),
  );
  return nodes;
}

/** Choreography of the week hook, in seconds of its own time. */
const WEEK_WRITTEN = {
  head: 0.25,
  /** Day k's column comes into focus at days.start + k × days.each; its pile lands item by item. */
  days: { start: 0.1, each: 0.08, item: 0.07 },
  /** The five days fold into one report. */
  fold: { start: 1.6, duration: 0.8 },
  report: { start: 1.8, center: 2.3 },
  /** The clock runs its last seconds, stops, and turns green. */
  clock: { start: 2.0, end: 2.9 },
  chips: [3.1, 3.3, 3.5],
} as const;
/** On the film's beat grid: sixteenths, the piles' staggers on thirty-seconds. */
export const WEEK = {
  ...gridTimes(WEEK_WRITTEN),
  days: {
    start: onGrid(WEEK_WRITTEN.days.start),
    each: onGrid(WEEK_WRITTEN.days.each, SFX_DIV),
    item: onGrid(WEEK_WRITTEN.days.item, SFX_DIV),
  },
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
const REPORT = { x: 578, y: 610, center: FW / 2 } as const;

/**
 * The hook: a work week of digging, each day a column filling with emails,
 * files and chats; the five days fold together into one finished report
 * while its clock ticks to a stop at 18:40 and turns green; then it is
 * stamped Sourced, Checked and Shared.
 */
function week(b: Board, o: { x: number; y: number }, lt = SETTLED): SceneNode[] {
  const L = b.look;
  const nodes: SceneNode[] = [head(b, 'week', o.x + HEAD.x, o.y + HEAD.y, lt - WEEK.head)];
  const fold = progress(lt, WEEK.fold.start, WEEK.fold.duration, easing.camera);
  if (fold < 1) {
    DAYS.forEach((d, k) => {
      const at = WEEK.days.start + k * WEEK.days.each;
      const p = progress(lt, at, 0.45, easing.enter);
      if (p <= 0) return;
      const x0 = o.x + 82 + k * 72;
      // Folding: each day slides into the report, narrowing, smeared by speed.
      const x = lerp(x0, o.x + REPORT.x, fold);
      const kids: SceneNode[] = [
        shapeNode(`wh-col${k}-g`, {
          geometry: rect(0, 0, 64, 420, 20),
          fill: linearGradient(0, -210, 0, 210, [
            withAlpha(C.surface.glass, 0.85),
            withAlpha(C.surface.glass, 0.6),
          ]),
          stroke: { color: withAlpha(P.white, 0.95), width: 1.2 },
          shadow: elevationShadows(lighting, 'low'),
        }),
        txt(`wh-d${k}`, d, 0, -194, T.label, C.time.fg, { align: 'center' }),
      ];
      for (let n = 0; n < 3 + k; n++) {
        const q = progress(lt, at + 0.2 + n * WEEK.days.item, 0.35, easing.enter);
        if (q <= 0) continue;
        const kind = (['mail', 'doc', 'chat'] as const)[(n + k) % 3] ?? 'mail';
        kids.push(
          groupNode(
            `wh-d${k}-f${n}`,
            [
              shapeNode(`wh-d${k}-f${n}-bg`, {
                geometry: rect(0, 0, 50, 36, 8),
                fill: C.surface.paper,
                stroke: { color: C.stroke.hairline, width: 1 },
                shadow: elevationShadows(lighting, 'low'),
              }),
              icon(`wh-d${k}-f${n}-i`, kind, 0, 0, 17, C.time.ring, 1.6),
            ],
            {
              transform: {
                x: (random('wk', 'x', k, n) - 0.5) * 10,
                y: 170 - n * 40 - 24 * (1 - q),
                rotation: (random('wk', 'r', k, n) - 0.5) * 12,
              },
              opacity: clamp(q * 1.8),
            },
          ),
        );
      }
      nodes.push(
        groupNode(`wh-col${k}`, kids, {
          transform: { x, y: o.y + 610, scaleX: lerp(1, 0.2, fold), scale: lerp(1.04, 1, p) },
          opacity: clamp(p * 1.6) * (1 - fold),
          ...(fold > 0.02
            ? { blur: { x: 26 * Math.sin(Math.PI * fold), y: 1 } }
            : p < 1
              ? { blur: 6 * (1 - p) }
              : {}),
        }),
      );
    });
  }
  // The report the week becomes: it takes the centre once the days have folded into it.
  const r = progress(lt, WEEK.report.start, 0.5, easing.enter);
  if (r > 0) {
    const cx = lerp(REPORT.x, REPORT.center, progress(lt, WEEK.report.center, 0.6, easing.camera));
    const done = lt >= WEEK.clock.end;
    const secs = Math.round(
      lerp(1111, 1120, progress(lt, WEEK.clock.start, WEEK.clock.end - WEEK.clock.start)),
    );
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const bump = done ? Math.sin(Math.PI * clamp((lt - WEEK.clock.end) / 0.4)) : 0;
    nodes.push(
      groupNode(
        'wh-report-o',
        [
          paperCard('wh-report', 0, 0, 220, 340, {
            lift: 2,
            children: [
              shapeNode('wh-report-glow', {
                geometry: rect(0, 0, 220, 340, 14),
                stroke: { color: C.brand.glow, width: 2 },
                shadow: glowShadows(lighting, C.brand.glow, {
                  radius: 26,
                  strength: 0.6 + 0.4 * fold,
                }),
              }),
              txt('wh-report-k', 'report', -88, -150, T.caps, C.text.tertiary),
              textNode('wh-report-t', {
                text: 'Supplier delays and promises',
                font: T.heading,
                fill: C.text.primary,
                maxWidth: 180,
                transform: { x: -88, y: -128 },
              }),
              textLines('wh-report-l', -88, -54, [170, 140, 160]),
              groupNode(
                'wh-ring-o',
                [timeRing('wh-ring', 0, 70, 52, 1, '', done ? 'outcome' : 'time')],
                {
                  transform: { x: 0, y: 70, scale: 1 + 0.08 * bump, originX: 0, originY: 70 },
                },
              ),
              txt(
                'wh-report-c',
                clock,
                0,
                56,
                face('mono', 22, { weight: 600 }),
                done ? C.outcome.fg : C.time.fg,
                { align: 'center' },
              ),
            ],
          }),
        ],
        {
          transform: { x: o.x + cx, y: o.y + REPORT.y, scale: lerp(0.9, 1, r) },
          opacity: clamp(r * 1.6),
          ...(r < 1 ? { blur: 8 * (1 - r) } : {}),
        },
      ),
    );
  }
  const chips: [string, Meaning, IconName][] = [
    ['Sourced', 'knowledge', 'doc'],
    ['Checked', 'outcome', 'check'],
    ['Shared', 'people', 'people'],
  ];
  const chipFont = face('label', 16, { weight: 600 });
  const widths = chips.map(([label]) => L.measurer.measure(label, chipFont) + 44);
  let cx = o.x + FW / 2 - (widths.reduce((a, w) => a + w, 0) + 24) / 2;
  chips.forEach(([label, meaning, ic], k) => {
    const p = progress(lt, WEEK.chips[k] ?? 0, 0.45, easing.snap);
    const c = L.chip(`wh-chip${k}`, label, cx, o.y + 900, meaning, { icon: ic, font: chipFont });
    if (p > 0) {
      const mid = cx + c.w / 2;
      nodes.push(
        groupNode(`wh-chip${k}-o`, [c.node], {
          transform: {
            x: mid,
            y: o.y + 900,
            scale: lerp(1.3, 1, p),
            originX: mid,
            originY: o.y + 900,
          },
          opacity: clamp(p * 2),
        }),
      );
    }
    cx += c.w + 12;
  });
  return nodes;
}

export interface ArtOptions {
  /** Local time in the group's choreography (default: settled). */
  readonly lt?: number;
  /** For the static two-beat groups. */
  readonly beat?: 'a' | 'b';
  /** The camera diving through the cracked wall (0–1). */
  readonly dive?: number;
  /** The hub has left the criteria group (it is flying to the intro). */
  readonly hubGone?: boolean;
  /** The tile is still in flight (drawn by the carrier, not the intro). */
  readonly tileHidden?: boolean;
}

/** Everything a group shows at local time `lt` (its style frame when settled). */
export function groupArt(b: Board, id: GroupId, options: ArtOptions = {}): SceneNode[] {
  const g = group(id);
  const o = { x: g.x, y: g.y };
  const lt = options.lt ?? SETTLED;
  const beat = options.beat ?? 'a';
  switch (id) {
    case 'queries':
      return queries(b, o, lt, options.dive ?? 0);
    case 'lost':
      return lost(b, o, lt);
    case 'criteria':
      return criteria(b, o, lt, options.hubGone ?? false);
    case 'intro':
      return intro(b, o, lt, { tileHidden: options.tileHidden ?? false });
    case 'ask':
      return ask(b, o);
    case 'work':
      return work(b, o);
    case 'answers':
      return answers(b, o, beat);
    case 'library':
      return library(b, o);
    case 'proof':
      return proof(b, o);
    case 'week':
      return week(b, o, lt);
    case 'outro':
      return intro(b, o, lt, { cta: true });
  }
}
