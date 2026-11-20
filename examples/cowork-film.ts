/**
 * The Cowork film on the mood board: one continuous timeline (seconds from
 * the film's start) that moves a camera across the board and plays each
 * group's choreography in turn. Scenes are windows of this timeline
 * (`defineFilmScene`), so every cut is the same frame on both sides.
 *
 * Seven scenes. The first (the pain point, `cowork-pain`)
 * opens on the line at the centre above the pinboard, moves down to the
 * board as it fills, floods it into a wall of paper (`cowork-wall.ts`,
 * drawn over this timeline), breaks the wall, and lands on the board with
 * its gaps. Film time is board time.
 */
import {
  clamp,
  createCanvasMeasurer,
  groupNode,
  layoutText,
  lerp,
  linearGradient,
  mixColors,
  progress,
  rect,
  shapeNode,
  withAlpha,
  type SceneNode,
  type SoundEvent,
} from '@html-animation-engine/core';
import {
  aurora,
  defineSceneComposition,
  edgeFade,
  flightPath,
  gridBackdrop,
  kineticText,
  motionBlur,
  screenVelocity,
  viewTransform,
  type BoardView,
  type KineticText,
} from '@html-animation-engine/renderers';
import {
  CRITERIA,
  FH,
  FW,
  GROUPS,
  INTRO,
  LOST,
  OPENING,
  PITCH,
  revealSpot,
  RING,
  CIRCLE_PILE_SCALE,
  CIRCLE_SPOTS,
  WORD_SCALE,
  coworkWord,
  BOARD_FONTS,
  auroraPools,
  createBoard,
  group,
  groupArt,
  groupView,
  threads,
  type Board,
  type GroupId,
} from './cowork-board.js';
import {
  SCENE_FONTS,
  ANSWERS_SHOTS,
  WORK_SHOTS,
  answersArt,
  answersCues,
  askArt,
  askCues,
  workArt,
  workCues,
  type SceneKit,
} from './cowork-scenes.js';
import { SFX_DIV, beats, onGrid } from './cowork-beat.js';
import { F, UI, UI_FONTS, avatar, createUi, label, type Ui } from './cowork-ui.js';
import { PRODUCT_FONTS } from './cowork-product.js';
import { C, LOOK_FONTS, R, face, lighting, look } from './cowork-look.js';
import {
  BADGE_TIMES,
  FILE_KINDS,
  GLASS,
  POP_SLOTS,
  STACK_LANDINGS,
  STACK_SPOTS,
  pileNode,
} from './cowork-opening.js';
import { phoneDefaults } from './index.js';
import {
  bell,
  changeTimes,
  cue,
  strings,
  pad,
  pluck,
  pop,
  seeded,
  slap,
  soundtrack,
  tick,
  whoosh,
  type Cues,
} from './sounds.js';

const { easing } = look;
const FRAME = { width: FW, height: FH };

// ---------------------------------------------------------------------------
// The timeline
// ---------------------------------------------------------------------------

/**
 * The timeline is written in the film's beats (110 bpm, `cowork-beat.ts`):
 * `at(n)` is the time of beat `n`. Camera flights start and land on beats
 * (two beats each), scene cuts fall on beats, and each group's own
 * choreography is on sixteenths from there.
 */
const at = (n: number) => beats(n);
const flight = (n: number) => ({ start: at(n), duration: beats(2) });

/** When each group's choreography starts, and the moves between groups. */
export const FILM = {
  /** The wall breaks over the pinboard (`OPENING` in `cowork-board.ts` times the opening). */
  lost: OPENING.break,
  toCriteria: flight(19),
  criteria: at(20),
  pullBack: { start: at(21), duration: beats(4), zoom: 1.06 },
  toIntro: flight(29),
  /** "Cowork", carried from the circle, lands at the centre: "Meet Cowork". */
  intro: at(31),
  /** "Meet Cowork" holds, then the camera flies down to the ask. */
  introEnd: at(38),
  /** Down to the product row, then group to group: each lands a beat into its scene. */
  toAsk: flight(37),
  ask: at(39),
  askToWork: flight(53),
  work: at(55),
  workToAnswers: flight(74),
  answers: at(76),
  /** Down the thread to Cowork and the call to action. */
  toOutro: flight(89),
  /** "Stop waiting for answers. Just ask Cowork.", a sixteenth before the camera lands. */
  pitch: at(90.75),
  /** The lockup, after the pitch (`PITCH.lead`, 5.5 beats: 3 s). */
  outro: at(90.75 + 5.5),
  end: at(104),
} as const;

/**
 * Each product scene opens on its intro card: seen as the camera flies in,
 * held for `CARD_HOLD` after it lands, then lifted off like a blind to show
 * the scene, whose content time starts as the card has gone.
 */
interface IntroCard {
  readonly id: ProductScene;
  readonly eyebrow: string;
  readonly title: string;
  readonly sub: string;
  readonly accent: string;
  readonly people: readonly (readonly [string, string, string])[];
}
type ProductScene = 'ask' | 'work' | 'answers';
const INTRO_CARDS: readonly IntroCard[] = [
  {
    id: 'ask',
    eyebrow: 'the ask',
    title: 'Ask it *anything.*',
    sub: 'One company, one Cowork.',
    accent: C.text.accent,
    people: [],
  },
  {
    id: 'work',
    eyebrow: 'the work',
    title: 'Then it gets to *work.*',
    sub: 'You stay in charge.',
    accent: C.text.accent,
    people: [],
  },
  {
    id: 'answers',
    eyebrow: 'the answers',
    title: 'Answers you can *trust.*',
    sub: 'Right person, right source.',
    accent: C.source.fg,
    people: [],
  },
];
/**
 * How long each card holds after the camera lands, and the lift at its end
 * (slow, so it reads as the card being drawn away, not snatched). The
 * tagline's marker sweeps in as the camera lands, a beat before the lift.
 */
const CARD_HOLD = beats(3);
const LIFT = beats(1.25);
const MARKER = { from: -CARD_HOLD - beats(0.25), duration: beats(1) } as const;
/** When each product scene's camera lands. */
const LANDS: Record<ProductScene, number> = {
  ask: FILM.ask,
  work: FILM.work,
  answers: FILM.answers,
};
/** A product scene's content time at film time `t` (0 as its card has lifted). */
const contentTime = (id: ProductScene, t: number) => t - LANDS[id] - CARD_HOLD;
/** Film time of a product scene's content time `c`. */
const filmOfContent = (id: ProductScene) => (c: number) => LANDS[id] + CARD_HOLD + c;

/** The scenes, as windows of the timeline; every cut on a beat. */
export const FILM_SCENES = {
  pain: { start: 0, end: at(20), title: 'The pain point' },
  criteria: { start: at(20), end: at(30), title: 'What AI should do' },
  intro: { start: at(30), end: FILM.introEnd, title: 'Introducing Cowork' },
  ask: { start: FILM.introEnd, end: at(54), title: 'The ask' },
  work: { start: at(54), end: at(75), title: 'The work' },
  answers: { start: at(75), end: FILM.toOutro.start, title: 'The answers' },
  outro: { start: FILM.toOutro.start, end: FILM.end, title: 'Join the waitlist' },
} as const;
export type FilmScene = keyof typeof FILM_SCENES;

/** Each group's local time. */
const local: Partial<Record<GroupId, (t: number) => number>> = {
  lost: (t) => t,
  criteria: (t) => t - FILM.criteria,
  intro: (t) => t - FILM.intro,
  outro: (t) => t - FILM.outro,
};

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

const V = {
  lost: groupView('lost'),
  criteria: groupView('criteria', FILM.pullBack.zoom),
  intro: groupView('intro'),
} as const;

const drift = (
  view: BoardView,
  t: number,
  start: number,
  duration: number,
  amount = 0.025,
): BoardView => ({
  ...view,
  zoom: view.zoom * (1 + amount * progress(t, start, duration, easing.drift)),
});

/** Where the camera is at film time `t`. */
export function camera(t: number): BoardView {
  // Still on the opening while its items pop up and sort themselves.
  if (t < FILM.lost) return V.lost;
  const lostView = (u: number) => drift(V.lost, u, FILM.lost, 7.5);
  if (t < FILM.toCriteria.start) return lostView(t);
  const criteriaView = (u: number) => ({
    ...V.criteria,
    zoom: lerp(
      FILM.pullBack.zoom,
      1,
      progress(u, FILM.pullBack.start, FILM.pullBack.duration, easing.camera),
    ),
  });
  if (t < FILM.toCriteria.start + FILM.toCriteria.duration) {
    const s = progress(t, FILM.toCriteria.start, FILM.toCriteria.duration, easing.camera);
    return flightPath(lostView(FILM.toCriteria.start), V.criteria, FW).at(s);
  }
  if (t < FILM.toIntro.start) return criteriaView(t);
  if (t < FILM.toIntro.start + FILM.toIntro.duration) {
    const s = progress(t, FILM.toIntro.start, FILM.toIntro.duration, easing.camera);
    return flightPath(criteriaView(FILM.toIntro.start), V.intro, FW).at(s);
  }
  // The intro, then down to the product row and across it, group to group.
  let previous = (u: number) => drift(V.intro, u, FILM.intro, 4.5);
  for (const leg of LEGS) {
    const a = leg.arrive;
    const from = previous;
    if (t < a.start) return from(t);
    if (t < a.start + a.duration) {
      return flightPath(from(a.start), groupView(leg.id), FW).at(
        progress(t, a.start, a.duration, easing.camera),
      );
    }
    const to = groupView(leg.id);
    previous =
      leg.id === 'work'
        ? (u: number) => shotCamera('work', WORK_SHOTS, u)
        : leg.id === 'answers'
          ? (u: number) => shotCamera('answers', ANSWERS_SHOTS, u)
          : (u: number) => drift(to, u, a.start + a.duration, 8, 0.02);
  }
  return previous(t);
}

/** The groups visited after the intro, and the flight that arrives at each. */
const LEGS: readonly { id: GroupId; arrive: { start: number; duration: number } }[] = [
  { id: 'ask', arrive: FILM.toAsk },
  { id: 'work', arrive: FILM.askToWork },
  { id: 'answers', arrive: FILM.workToAnswers },
  { id: 'outro', arrive: FILM.toOutro },
];

/** On a product group: close on each step in turn, then the whole (its `*_SHOTS` table). */
function shotCamera(
  id: ProductScene,
  shots: readonly { at: number; duration: number; view: { x: number; y: number; zoom: number } }[],
  t: number,
): BoardView {
  const g = group(id);
  const c = contentTime(id, t);
  let v = { x: FW / 2, y: FH / 2, zoom: 1 };
  for (const shot of shots) {
    const p = progress(c, shot.at, Math.max(shot.duration, 1e-3), easing.camera);
    if (p <= 0) break;
    v = {
      x: lerp(v.x, shot.view.x, p),
      y: lerp(v.y, shot.view.y, p),
      zoom: Math.exp(lerp(Math.log(v.zoom), Math.log(shot.view.zoom), p)),
    };
  }
  return { x: g.x + v.x, y: g.y + v.y, zoom: v.zoom };
}

/** Moving between groups (motion blur applies), not diving or settling. */
function inFlight(t: number): boolean {
  const within = (m: { start: number; duration: number }) =>
    t > m.start && t < m.start + m.duration;
  return [FILM.toCriteria, FILM.toIntro, ...LEGS.map((l) => l.arrive)].some(within);
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

const light = aurora({
  id: 'aurora',
  seed: 'cowork-film',
  // The light is far away: it moves at 0.6 of the board's speed.
  pools: () => auroraPools().map((p) => ({ ...p, x: p.x * 0.6, y: p.y * 0.6 })),
});
/**
 * The drafting grid, only where the camera can see it (a whole-board dashed
 * path is hundreds of thousands of dashes to rasterise every frame). Cells
 * snap to the board's grid, so the lines never swim as the view moves.
 */
function gridFor(view: BoardView): SceneNode {
  const cell = 120;
  const halfW = FW / 2 / view.zoom + cell;
  const halfH = FH / 2 / view.zoom + cell;
  const x = Math.floor((view.x - halfW) / cell) * cell;
  const y = Math.floor((view.y - halfH) / cell) * cell;
  return gridBackdrop({
    id: 'grid',
    x,
    y,
    width: Math.ceil((2 * halfW) / cell + 1) * cell,
    height: Math.ceil((2 * halfH) / cell + 1) * cell,
    cell,
    color: C.bg.grid,
    majorColor: C.bg.gridMajor,
  });
}

/** Flights along each thread (index matches the board's threads), or null. */
const FLIGHTS = [
  null,
  [FILM.toCriteria.start, FILM.toCriteria.duration],
  [FILM.toIntro.start, FILM.toIntro.duration],
  ...LEGS.map((l) => [l.arrive.start, l.arrive.duration] as const),
] as const;

/**
 * What the camera carries between groups: on the way from the opening to the
 * circle, the five piles, each tucking its pages in and rounding into its
 * tile as it travels; on the way to the reveal, "Cowork" from the circle's
 * centre, growing into the reveal's name (the same type, only scaled).
 */
function carrier(board: Board, t: number): SceneNode[] {
  const nodes: SceneNode[] = [];
  const pc = FILM.toCriteria;
  if (t >= pc.start && t < pc.start + pc.duration) {
    const lg = group('lost');
    const cg = group('criteria');
    const s = progress(t, pc.start, pc.duration, easing.camera);
    // The stacks fly straight into their places round the circle, shrinking to fit.
    for (const { kind } of FILE_KINDS) {
      const a = STACK_SPOTS[kind];
      const b = CIRCLE_SPOTS[kind];
      const x = lerp(lg.x + a.x, cg.x + b.x, s);
      const y = lerp(lg.y + a.y, cg.y + b.y, s) - 60 * Math.sin(Math.PI * s);
      nodes.push(pileNode(`carry-${kind}`, kind, x, y, board.paper, lerp(1, CIRCLE_PILE_SCALE, s)));
    }
  }
  const wc = FILM.toIntro;
  if (t >= wc.start && t < FILM.intro) {
    const cg = group('criteria');
    const ig = group('intro');
    const spot = revealSpot();
    const s = progress(t, wc.start, wc.duration, easing.camera);
    const x = lerp(cg.x + RING.x, ig.x + spot.x, s);
    const y = lerp(cg.y + RING.y, ig.y + spot.y, s) - 140 * Math.sin(Math.PI * s);
    const scale = Math.exp(lerp(Math.log(WORD_SCALE), 0, s));
    nodes.push(coworkWord(board, 'carry-word', x, y, scale));
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// The product scenes: each group is a deck of the three people's screens
// ---------------------------------------------------------------------------

export interface FilmState {
  readonly board: Board;
  /** The product scenes' look and measurer. */
  readonly kit: SceneKit;
  /** Each product scene's intro card: its title and subtext. */
  readonly intros: Readonly<Record<string, { title: KineticText; sub: KineticText }>>;
}

const isProduct = (id: GroupId): id is ProductScene => id in LANDS;

/** Everything the film needs, made once. */
export async function createFilmState(): Promise<FilmState> {
  const measurer = createCanvasMeasurer();
  const intros: Record<string, { title: KineticText; sub: KineticText }> = {};
  for (const c of INTRO_CARDS) {
    const common = { measurer, x: 0, y: 0, at: 0, ease: easing.enter } as const;
    intros[c.id] = {
      title: kineticText({
        ...common,
        id: `intro-${c.id}-title`,
        text: c.title,
        font: CARD.title,
        maxWidth: CARD.inner,
        color: C.text.primary,
        accent: c.accent,
      }),
      sub: kineticText({
        ...common,
        id: `intro-${c.id}-sub`,
        text: c.sub,
        font: CARD.sub,
        maxWidth: CARD.inner,
        color: C.text.secondary,
      }),
    };
  }
  const board = await createBoard(measurer);
  return { board, kit: { look: board.look, ui: createUi(measurer) }, intros };
}

/** The intro card's size (it covers the scene as the old app windows did). */
const CARD_WIN = { w: 640, h: 860 } as const;

/** The intro card's type and layout (window-local px). */
const CARD = {
  pad: 56,
  inner: CARD_WIN.w - 112,
  eyebrow: face('mono', 17, { letterSpacing: 0.3 }),
  title: face('headline', 58, { letterSpacing: -1.6, lineHeight: 1.08 }),
  sub: face('subtext', 34, { lineHeight: 1.25 }),
  top: 300,
} as const;
/** Long after any entrance: the card's text fully settled. */
const SETTLED_TEXT = 1e4;

/**
 * An intro card over the window it covers (window-local, top left 0, 0):
 * Cloud, the Cowork name, a lowercase mono eyebrow, the Sora title, the
 * Newsreader subtext, and who the scene follows. `lift` 0–1 rolls it up off
 * the window from the bottom; for the ask, `shape` is the window's outline
 * as it opens out of the tile, and `content` how far its content shows.
 */
function introCard(
  state: FilmState,
  card: IntroCard,
  lift: number,
  shape?: { cx: number; cy: number; w: number; h: number; r: number },
  content = 1,
  marker = 1,
  /** Seconds since its text began arriving (letters into focus); settled by default. */
  since = SETTLED_TEXT,
): SceneNode | null {
  const text = state.intros[card.id];
  if (!text || lift >= 1) return null;
  const ui = state.kit.ui;
  const id = `ic-${card.id}`;
  // Lifting, the card slides up off the window, cut at the window's top edge.
  const d = CARD_WIN.h * lift;
  const outline = shape
    ? rect(shape.cx, shape.cy, shape.w, shape.h, shape.r)
    : rect(CARD_WIN.w / 2, CARD_WIN.h / 2 - d, CARD_WIN.w, CARD_WIN.h, R.card);
  const frame = shape
    ? outline
    : rect(CARD_WIN.w / 2, CARD_WIN.h / 2, CARD_WIN.w, CARD_WIN.h, R.card);
  const { pad } = CARD;
  const titleY = CARD.top + 40;
  const subY = titleY + text.title.height + 18;
  const kids: SceneNode[] = [
    groupNode(
      `${id}-labels`,
      [
        label(`${id}-name`, 'Cowork', pad, 49, F.title, C.text.primary),
        label(`${id}-eyebrow`, card.eyebrow, pad, CARD.top, CARD.eyebrow, C.text.accent),
      ],
      since < SETTLED_TEXT ? { opacity: clamp(since / 0.35) } : {},
    ),
    groupNode(`${id}-title`, [text.title(since, 0)], {
      transform: { x: pad, y: titleY },
    }),
    // The tagline's highlighter: light violet, swept on line by line, behind the words.
    ...markerSweep(ui, id, card.sub, pad, subY, marker),
    groupNode(`${id}-sub`, [text.sub(since - 0.25, 0)], { transform: { x: pad, y: subY } }),
  ];
  // Who the scene follows: monogram pills along the bottom.
  let x = pad;
  const y = CARD_WIN.h - 100;
  card.people.forEach(([initials, role, color], k) => {
    const w = Math.round(ui.measure(role, F.role) + 58);
    kids.push(
      shapeNode(`${id}-p${k}-bg`, {
        geometry: rect(x + w / 2, y, w, 44, 22),
        fill: UI.surface,
        stroke: { color: C.stroke.hairline, width: 1 },
      }),
      avatar(`${id}-p${k}-av`, initials, x + 22, y, 14, color),
      label(`${id}-p${k}-t`, role, x + 44, y - 10, F.role, C.text.secondary),
    );
    x += w + 10;
  });
  return groupNode(
    id,
    [
      shapeNode(`${id}-sheet`, {
        geometry: outline,
        fill: linearGradient(0, -d, 0, CARD_WIN.h - d, [
          C.surface.paper,
          mixColors(C.surface.paper, C.brand.tint, 0.6),
        ]),
        ...(lift > 0
          ? {
              shadow: {
                x: 0,
                y: 12,
                blur: 30,
                color: withAlpha(lighting.shadow, 0.22 * (1 - lift)),
              },
            }
          : {}),
      }),
      groupNode(`${id}-clip`, [groupNode(`${id}-content`, kids, { transform: { y: -d } })], {
        clip: outline,
        opacity: clamp(content),
      }),
    ],
    { clip: frame },
  );
}

/** A highlighter swept behind `text` (laid out as the card's subtext) at `p` (0–1), line by line. */
function markerSweep(
  ui: Ui,
  id: string,
  text: string,
  x: number,
  y: number,
  p: number,
): SceneNode[] {
  if (p <= 0) return [];
  const layout = layoutText(text.replace(/[*_]/g, ''), CARD.sub, {
    measurer: ui.measurer,
    maxWidth: CARD.inner,
  });
  const total = layout.lines.reduce((sum, l) => sum + l.width + 16, 0);
  let used = 0;
  const lh = layout.lineHeight;
  return layout.lines.flatMap((line, k) => {
    const w = line.width + 16;
    const share = clamp((p * total - used) / w);
    used += w;
    if (share <= 0) return [];
    const mw = w * share;
    return [
      shapeNode(`${id}-marker${k}`, {
        geometry: rect(x + line.x - 8 + mw / 2, y + line.y + lh * 0.58, mw, lh * 0.66, 8),
        fill: withAlpha(C.brand.soft, 0.85),
      }),
    ];
  });
}

/**
 * A product scene's group: its own content (`cowork-scenes.ts`) under its
 * intro card, which covers it while the camera flies in and for
 * `CARD_HOLD` after, then lifts off.
 */
function productScene(state: FilmState, id: ProductScene, t: number): SceneNode[] {
  const g = group(id);
  const c = contentTime(id, t);
  const art = id === 'ask' ? askArt : id === 'work' ? workArt : answersArt;
  const nodes: SceneNode[] = [
    groupNode(`${id}-art`, art(state.kit, c), { transform: { x: g.x, y: g.y } }),
  ];
  const card = INTRO_CARDS.find((k) => k.id === id);
  const lift = progress(c, -LIFT, LIFT, easing.wipe);
  if (card && lift < 1) {
    const sheet = introCard(
      state,
      card,
      lift,
      undefined,
      1,
      progress(c, MARKER.from, MARKER.duration, easing.wipe),
      SETTLED_TEXT,
    );
    if (sheet)
      nodes.push(
        groupNode(`${id}-intro-card`, [sheet], {
          transform: { x: g.x + (FW - CARD_WIN.w) / 2, y: g.y + 210 },
          // It lifts away and fades as it goes, leaving no edge behind.
          opacity: 1 - lift * lift,
        }),
      );
  }
  return nodes;
}

/** Groups near the view. */
function visible(view: BoardView): GroupId[] {
  const halfW = FW / 2 / view.zoom + FW;
  const halfH = FH / 2 / view.zoom + FH;
  return GROUPS.filter(
    (g) => Math.abs(g.x + FW / 2 - view.x) < halfW && Math.abs(g.y + FH / 2 - view.y) < halfH,
  ).map((g) => g.id);
}

/** Everything at film time `t`. */
export function filmWorld(state: FilmState, t: number): SceneNode[] {
  const { board } = state;
  const view = camera(t);
  const content: SceneNode[] = [...threads(3, t, FLIGHTS)];
  for (const id of visible(view)) {
    // The old opening's group is on the board, but not in the film.
    if (id === 'queries') continue;
    if (isProduct(id)) {
      content.push(groupNode(`group-${id}`, productScene(state, id, t)));
      continue;
    }
    const lt = local[id]?.(t);
    // The outro's pitch plays before its lockup's time starts.
    const lead = id === 'outro' ? PITCH.lead : 0;
    if (lt === undefined || lt < -lead - 0.5) continue;
    content.push(
      groupNode(
        `group-${id}`,
        groupArt(board, id, {
          lt,
          ...(id === 'criteria'
            ? {
                hubGone: t >= FILM.toIntro.start,
                circleOut: progress(t, FILM.toIntro.start, 0.45, easing.exit),
              }
            : {}),
          ...(id === 'lost' ? { pilesGone: t >= FILM.toCriteria.start } : {}),
        }),
      ),
    );
  }
  content.push(...carrier(board, t));
  const blur = inFlight(t) ? motionBlur(screenVelocity(camera, t)) : undefined;
  return [
    ...backdrop(t, view),
    groupNode(
      'moving',
      [
        groupNode('board-grid', [gridFor(view)], { transform: viewTransform(view, FRAME) }),
        edgeFade('fade', FRAME, C.bg.canvas, 0.3),
        groupNode('board', content, { transform: viewTransform(view, FRAME) }),
      ],
      blur ? { blur } : {},
    ),
  ];
}

/** The ground and the far aurora (at 0.6 of the board's parallax) for a view at `t`. */
function backdrop(t: number, view: BoardView): SceneNode[] {
  return [
    shapeNode('base', { geometry: rect(FW / 2, FH / 2, FW, FH), fill: C.bg.canvas }),
    groupNode('far', [light(t)], { transform: viewTransform(view, FRAME, 0.6) }),
  ];
}

/**
 * The opening scenes' background, `before` s before the pinboard opens: the
 * ground and aurora exactly as the pinboard's first frame draws them, the
 * aurora drifting on up to it, so the cut needs no fade.
 */
export function openingBackdrop(before: number): SceneNode[] {
  return backdrop(FILM.lost - before, camera(FILM.lost));
}

// ---------------------------------------------------------------------------
// Sound, timed from the same numbers as the motion
// ---------------------------------------------------------------------------

const C0 = FILM.criteria;
const CUES: readonly Cues[] = [
  // The opening: a tiny tick each time items pop up (louder the more at
  // once, panned to where they are), a pad swelling under the glass, a very
  // quiet slap as items land on their stacks, and a rising pop per badge.
  POP_SLOTS.map((s, k) =>
    cue(s.at, tick({ degree: 2 + (k % 7), gain: 0.2 * Math.sqrt(s.n), pan: s.x * 1.2 })),
  ),
  cue(GLASS.start, pad(2.2, { chord: 'lift', attack: 0.4, release: 1.2, gain: 0.4 })),
  [...new Set(STACK_LANDINGS)].map((at, k) =>
    cue(
      at,
      slap({
        gain: 0.11 * Math.sqrt(STACK_LANDINGS.filter((l) => l === at).length),
        pan: (seeded('stack-land', k) - 0.5) * 0.6,
      }),
    ),
  ),
  BADGE_TIMES.map((at, k) =>
    cue(at, pop({ degree: [0, 2, 4, 5, 7, 9][k] ?? 0, take: k, gain: 0.35 })),
  ),
  // The wall has broken onto bare ground: a low bed under the hour of searching.
  cue(LOST.loss.start, pad(4.5, { chord: 'shadow', attack: 0.8, release: 1.5, gain: 0.5 })),
  // An hour of searching, coming back empty.
  [0, 1, 2].map((k) => {
    const at = LOST.b.start + LOST.b.search + k * LOST.b.each;
    return [
      cue(at, pluck({ degree: [7, 4, 2][k] ?? 0, octave: 1, gain: 0.3 })),
      cue(at + 0.4, pluck({ degree: 0, octave: 0, gain: 0.3 })),
    ];
  }),
  changeTimes(
    (u) =>
      Math.floor(
        (58 * progress(u, LOST.b.start + LOST.b.ring + 0.2, LOST.b.sweep, easing.camera)) / 4,
      ),
    LOST.b.start + LOST.b.ring,
    LOST.b.start + LOST.b.ring + 3,
  ).map((at, k) => cue(at, tick({ degree: 4, gain: 0.25, pan: k % 2 ? 0.2 : -0.2 }))),
  // The flight to the network.
  cue(
    FILM.toCriteria.start,
    whoosh(FILM.toCriteria.duration, { from: 260, to: 1500, peak: 0.5, gain: 0.45 }),
  ),
  // The piles land as tiles (a soft strum), "Cowork" appears at the centre,
  // the spokes reach in; the field spreads.
  [0, 2, 4, 7, 9].map((degree, k) =>
    cue(C0 + CRITERIA.tiles + k * 0.03, pluck({ degree, octave: 2, gain: 0.26 })),
  ),
  cue(C0 + CRITERIA.word, pop({ degree: 0, gain: 0.5 })),
  cue(
    C0 + CRITERIA.field.start,
    whoosh(CRITERIA.field.duration, { from: 250, to: 3000, peak: 0.8, gain: 0.6 }),
  ),
  cue(
    C0 + CRITERIA.field.start,
    pad(4.6, { chord: 'lift', attack: 0.5, release: 1.2, gain: 0.55 }),
  ),
  // "Cowork" flies on, grows, and becomes the reveal's name.
  cue(
    FILM.toIntro.start,
    whoosh(FILM.toIntro.duration, { from: 220, to: 4000, peak: 0.88, gain: 0.9 }),
  ),
  // Cowork appears: no hit, a swell of synth strings, high and low.
  cue(FILM.intro, strings()),
  cue(
    FILM.intro + 0.05,
    pad(FILM.introEnd - FILM.intro - 0.3, { chord: 'home', attack: 0.3, release: 1.5 }),
  ),
  // Each flight its air.
  LEGS.map((l) =>
    cue(l.arrive.start, whoosh(l.arrive.duration, { from: 260, to: 1500, peak: 0.5, gain: 0.45 })),
  ),
  // Each intro card: a soft note as the camera lands on it, paper as it lifts off.
  INTRO_CARDS.map((c, k) => [
    cue(LANDS[c.id], pluck({ degree: [4, 7, 9][k] ?? 4, octave: 1, gain: 0.28 })),
    cue(
      LANDS[c.id] + CARD_HOLD - LIFT,
      whoosh(LIFT, { from: 700, to: 2600, peak: 0.6, gain: 0.3 }),
    ),
  ]),
  // The product scenes' own sounds (typing, clicks, plucks), on their content time.
  askCues(filmOfContent('ask')),
  workCues(filmOfContent('work')),
  answersCues(filmOfContent('answers')),
  // Along the thread to Cowork once more.
  cue(
    FILM.toOutro.start,
    pad(FILM.outro - FILM.toOutro.start + 0.4, {
      chord: 'lift',
      attack: 0.6,
      release: 1,
      gain: 0.5,
    }),
  ),
  // The pitch: a low note under the first line, a bell for the answer, a soft
  // air as the marker sweeps, and the lines leaving.
  cue(FILM.pitch + 0.05, pluck({ degree: 2, octave: 1, gain: 0.26 })),
  cue(FILM.pitch + PITCH.second + 0.05, pluck({ degree: 4, octave: 1, gain: 0.3 })),
  cue(FILM.pitch + PITCH.second + 0.1, bell({ degree: 7, octave: 1, gain: 0.32 })),
  cue(FILM.pitch + PITCH.mark, whoosh(0.45, { from: 1600, to: 3600, peak: 0.6, gain: 0.12 })),
  cue(FILM.pitch + PITCH.leave, whoosh(0.4, { from: 900, to: 2400, peak: 0.5, gain: 0.25 })),
  cue(FILM.outro + 0.15, strings()),
  cue(
    FILM.outro + 0.2,
    pad(FILM.end - FILM.outro - 0.2, { chord: 'home', attack: 0.3, release: 1.2 }),
  ),
  [0, 2, 4, 7, 9].map((degree, k) =>
    cue(
      FILM.outro + INTRO.tagline + k * 0.08,
      pluck({ degree, octave: 2, gain: 0.26, pan: (k - 2) * 0.15 }),
    ),
  ),
  cue(FILM.outro + INTRO.tagline + 0.8, pop({ degree: 7, gain: 0.45 })),
  cue(FILM.outro + INTRO.tagline + 0.85, bell({ degree: 9, octave: 1, gain: 0.4 })),
];

/** A board time moved to the nearest thirty-second of the film's beat. */
const onBeat = (t: number) => onGrid(t, SFX_DIV);

/**
 * Every sound, in board time: the film's own, each on the beat grid, and the
 * product scenes' (already on it: the apps timeline starts on a beat).
 */
const ALL_CUES: readonly SoundEvent[] = (() => {
  const flat: SoundEvent[] = [];
  const walk = (c: Cues) => {
    if ('sound' in c) flat.push({ ...c, at: onBeat(c.at) });
    else c.forEach(walk);
  };
  CUES.forEach(walk);
  return flat;
})();

/** One scene's sounds, timed from its own start (earlier cues ring on in the film). */
export function sceneCues(scene: FilmScene): SoundEvent[] {
  const { start, end } = FILM_SCENES[scene];
  return ALL_CUES.filter((c) => c.at >= start && c.at < end).map((c) => ({
    ...c,
    at: c.at - start,
  }));
}

/** A scene of the Cowork film: its stretch of the timeline. */
/** Every font the film's timeline draws with. */
export const FILM_FONTS = [
  ...phoneDefaults.fonts,
  ...LOOK_FONTS,
  ...BOARD_FONTS,
  ...UI_FONTS,
  ...PRODUCT_FONTS,
  ...SCENE_FONTS,
];

export function defineFilmScene(scene: FilmScene, id: string) {
  const { start, end, title } = FILM_SCENES[scene];
  return defineSceneComposition({
    ...phoneDefaults,
    fonts: FILM_FONTS,
    id,
    seed: id,
    title,
    audio: soundtrack(sceneCues(scene)),
    duration: end - start,
    background: C.bg.canvas,
    renderer: 'svg',
    setup: createFilmState,
    scene: (t, _ctx, state) => ({ world: filmWorld(state, start + t) }),
  });
}
