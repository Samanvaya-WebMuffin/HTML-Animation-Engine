/**
 * The Cowork film on the mood board: one continuous timeline (seconds from
 * the film's start) that moves a camera across the board and plays each
 * group's choreography in turn. Scenes are windows of this timeline
 * (`defineFilmScene`), so every cut is the same frame on both sides.
 *
 * Ten scenes, as in the script. The first (the pain point, `cowork-pain`)
 * opens on the line at the centre above the pinboard, moves down to the
 * board as it fills, floods it into a wall of paper (`cowork-wall.ts`,
 * drawn over this timeline), breaks the wall, and lands on the board with
 * its gaps. Film time is board time.
 */
import {
  clamp,
  createCanvasMeasurer,
  groupNode,
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
  lightSweep,
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
  LOST_LANDINGS,
  OPENING,
  WEEK,
  tileSpot,
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
  APPS_FONTS,
  CAPTIONS,
  DESK,
  DOCK_ICON,
  SCENES as APPS_SCENES,
  WIN,
  MID,
  OFF_CAMERA,
  WIDE,
  createApps,
  cuesBetween,
  deskFocus,
  shotAt,
  stationA,
  stationC,
  stationD,
  windowOpening,
  HINT_SCALE,
  hintNodes,
  stretch,
  type Apps,
  type AppsScene,
  type ShotView,
} from './cowork-apps.js';
import { SFX_DIV, beats, onGrid } from './cowork-beat.js';
import { F, UI, avatar, createUi, label, mark } from './cowork-ui.js';
import { WALL_CUES } from './cowork-wall.js';
import {
  C,
  LOOK_FONTS,
  HEAD,
  R,
  face,
  glassPanel,
  headlineCard,
  makeHeadline,
  type HeadSpec,
  type Headline,
  lighting,
  look,
  markTile,
  paperCard,
  puck,
} from './cowork-look.js';
import { phoneDefaults } from './index.js';
import {
  bell,
  changeTimes,
  cue,
  ding,
  strings,
  pad,
  pluck,
  pop,
  seeded,
  slap,
  snap,
  soundtrack,
  thump,
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
  /** The tile lands. */
  intro: at(31),
  introEnd: at(38),
  /** Down to the product row. */
  toAsk: flight(37),
  /**
   * The product scenes replay the apps timeline (`cowork-apps.ts`) from
   * here (on a beat, so the apps' sixteenths are the film's), holding it
   * for three beats under each scene's intro card (`appsTime`): so each
   * product flight below comes three beats later per card before it.
   */
  apps: at(37),
  askToWork: flight(67),
  workToAnswers: flight(97),
  answersToLibrary: flight(127),
  libraryEnd: at(158),
  /** Down to the payoff row: the montage, the week, then along the thread to Cowork. */
  toProof: flight(157),
  proof: at(159),
  toWeek: flight(166),
  week: at(167),
  toOutro: flight(174),
  /** A sixteenth before the camera lands, so the lockup's clap falls on the beat. */
  outro: at(175.75),
  end: at(183.5),
} as const;

/**
 * Each product scene opens on its intro card, the cover of the screen it
 * starts on: seen as the camera flies in (the ask's opens out of the Cowork
 * tile with the rep's window), read while the apps timeline holds at `at`
 * (apps time, a settled moment), then lifted off the window like a blind.
 */
interface IntroCard {
  readonly id: AppsScene;
  /** Apps time the timeline holds at. */
  readonly at: number;
  /** The screen it covers (0 = the rep, 1 = the COO, 2 = HR head and intern). */
  readonly desk: 0 | 1 | 2;
  readonly eyebrow: string;
  readonly title: string;
  readonly sub: string;
  readonly accent: string;
  readonly people: readonly (readonly [string, string, string])[];
}
const INTRO_CARDS: readonly IntroCard[] = [
  {
    id: 'ask',
    at: stretch(beats(2)),
    desk: 0,
    eyebrow: '01 · the ask',
    title: 'Ask it *anything.*',
    sub: 'One company, one Cowork.',
    accent: C.text.accent,
    people: [
      ['SR', 'Sales rep', C.avatar.rep],
      ['CO', 'COO', C.avatar.coo],
      ['HR', 'HR head', C.avatar.hr],
      ['IN', 'Intern', C.avatar.intern],
    ],
  },
  {
    id: 'work',
    at: stretch(beats(17)),
    desk: 1,
    eyebrow: '02 · the work',
    title: 'Then it gets to *work.*',
    sub: 'You stay in charge.',
    accent: C.text.accent,
    people: [['CO', 'COO', C.avatar.coo]],
  },
  {
    id: 'answers',
    at: stretch(beats(31.25)),
    desk: 2,
    eyebrow: '03 · the answers',
    title: 'Answers you can *trust.*',
    sub: 'Right person, right source.',
    accent: C.source.fg,
    people: [
      ['HR', 'HR head', C.avatar.hr],
      ['IN', 'Intern', C.avatar.intern],
      ['SR', 'Sales rep', C.avatar.rep],
    ],
  },
  {
    id: 'library',
    at: stretch(beats(46)),
    desk: 1,
    eyebrow: '04 · the library',
    title: 'Work that *stays.*',
    sub: 'Kept for the whole company.',
    accent: C.outcome.fg,
    people: [
      ['CO', 'COO', C.avatar.coo],
      ['CF', 'CFO', C.avatar.cfo],
      ['IN', 'Intern', C.avatar.intern],
    ],
  },
];
/** How long the apps timeline holds under each card, and the lift at its end. */
const HOLD = beats(3);
const LIFT = beats(0.75);

/** Apps time at film time `t`: held under each intro card. */
function appsTime(t: number): number {
  let u = t - FILM.apps;
  for (const c of INTRO_CARDS) {
    if (u <= c.at) break;
    if (u < c.at + HOLD) return c.at;
    u -= HOLD;
  }
  return u;
}
/** Film time of apps time `tau` (a moment at a hold plays when the card has lifted). */
function filmOfApps(tau: number): number {
  return FILM.apps + tau + HOLD * INTRO_CARDS.filter((c) => tau >= c.at).length;
}
/** When the card's timeline hold ends (the card is fully lifted). */
const cardResume = (c: IntroCard) => filmOfApps(c.at);

/** The scenes, as windows of the timeline; every cut on a beat. */
export const FILM_SCENES = {
  pain: { start: 0, end: at(20), title: 'The pain point' },
  criteria: { start: at(20), end: at(30), title: 'What AI should do' },
  intro: { start: at(30), end: FILM.introEnd, title: 'Introducing Cowork' },
  ask: { start: FILM.introEnd, end: at(68), title: 'The ask' },
  work: { start: at(68), end: at(98), title: 'The work' },
  answers: { start: at(98), end: at(128), title: 'The answers' },
  library: { start: at(128), end: FILM.libraryEnd, title: 'The library' },
  proof: { start: FILM.libraryEnd, end: at(167), title: 'In use' },
  week: { start: at(167), end: FILM.toOutro.start, title: 'A week, condensed' },
  outro: { start: FILM.toOutro.start, end: FILM.end, title: 'Join the waitlist' },
} as const;
export type FilmScene = keyof typeof FILM_SCENES;

/** Each group's local time. */
const local: Partial<Record<GroupId, (t: number) => number>> = {
  lost: (t) => t,
  criteria: (t) => t - FILM.criteria,
  intro: (t) => t - FILM.intro,
  week: (t) => t - FILM.week,
  outro: (t) => t - FILM.outro,
};

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

const V = {
  /** Above the pinboard, the opening line at the centre (the board just showing at the bottom). */
  open: { ...groupView('lost'), y: groupView('lost').y - 700 },
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
  if (t < FILM.lost) {
    // Down from the line to the pinboard, then still while the wall builds and breaks.
    const p = progress(t, OPENING.pan.start, OPENING.pan.duration, easing.camera);
    return { ...V.lost, y: lerp(V.open.y, V.lost.y, p) };
  }
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
    previous = (u: number) => drift(to, u, a.start + a.duration, 8, 0.02);
  }
  return previous(t);
}

/** The groups visited after the intro, and the flight that arrives at each. */
const LEGS: readonly { id: GroupId; arrive: { start: number; duration: number } }[] = [
  { id: 'ask', arrive: FILM.toAsk },
  { id: 'work', arrive: FILM.askToWork },
  { id: 'answers', arrive: FILM.workToAnswers },
  { id: 'library', arrive: FILM.answersToLibrary },
  { id: 'proof', arrive: FILM.toProof },
  { id: 'week', arrive: FILM.toWeek },
  { id: 'outro', arrive: FILM.toOutro },
];

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

/** The hub, carried from the network to the intro, becoming the Cowork tile. */
function carrier(board: Board, t: number): SceneNode[] {
  if (t < FILM.toIntro.start || t >= FILM.intro) return [];
  const cg = group('criteria');
  const ig = group('intro');
  const from = { x: cg.x + FW / 2, y: cg.y + 780 };
  const spot = tileSpot(board);
  const to = { x: ig.x + spot.x, y: ig.y + spot.y };
  const s = progress(t, FILM.toIntro.start, FILM.toIntro.duration, easing.camera);
  const x = lerp(from.x, to.x, s);
  const y = lerp(from.y, to.y, s) - 140 * Math.sin(Math.PI * s);
  const m = progress(t, FILM.toIntro.start + 0.3, 0.75, easing.camera);
  const size = lerp(128, spot.size, m);
  return [
    groupNode('carry-puck-o', [puck('carry-puck', x, y, 64, 'layers', 'brand')], {
      transform: { x, y, scale: size / 128, originX: x, originY: y },
      opacity: 1 - m,
    }),
    groupNode('carry-tile-o', [markTile('carry-tile', x, y, size)], { opacity: m }),
  ];
}

// ---------------------------------------------------------------------------
// The product scenes: each group is a deck of the three people's screens
// ---------------------------------------------------------------------------

export interface FilmState {
  readonly board: Board;
  readonly apps: Apps;
  /** The montage's card lines. */
  readonly heads: Readonly<Record<string, KineticText>>;
  /** The product scenes' headline cards, pinned to their groups. */
  readonly cards: Readonly<Record<string, Headline>>;
  /** Each product scene's intro card: its title and subtext. */
  readonly intros: Readonly<Record<string, { title: KineticText; sub: KineticText }>>;
}

const isApps = (id: GroupId): id is AppsScene => id in APPS_SCENES;
/** Hints stay below this line of the frame (clear of the headline cards). */
const HINT_TOP = 300;
/** Where the deck's screen in focus sits in its group, and its scale when wide. */
const DECK_Y = 790;
const DECK_SCALE = 0.86;

/**
 * The product scenes' headlines, each on its card: a Sora title, a short
 * Newsreader line under it, accents coloured by meaning.
 */
const APP_HEADS: Readonly<Record<string, HeadSpec>> = {
  less: { title: '*Less* searching.', sub: 'One question, every source.', accent: C.text.accent },
  bigger: { title: '*Bigger* questions.', sub: 'Asked in plain words.', accent: C.text.accent },
  same: {
    title: 'Same *question.*',
    sub: 'Two people, two levels of access.',
    accent: C.text.accent,
  },
  plans: {
    title: 'It *plans* first.',
    sub: 'You check it before it starts.',
    accent: C.text.accent,
  },
  seconds: { title: 'Answered in *seconds.*', sub: 'Every source cited.', accent: C.time.fg },
  parallel: {
    title: 'Researchers, in *parallel.*',
    sub: 'Every step _checked._',
    accent: C.text.accent,
    accent2: C.outcome.fg,
  },
  allowed: { title: 'Only what you’re *allowed* to see.', accent: C.text.accent, breaks: [3] },
  source: {
    title: 'Straight to the *source.*',
    sub: 'The email it came from.',
    accent: C.source.fg,
  },
  picture: {
    title: 'The *bigger* *picture.*',
    sub: 'Before _lunch._',
    accent: C.text.accent,
    accent2: C.time.fg,
  },
  saved: { title: 'Saved. Shared. Never _lost._', accent2: C.outcome.fg },
  protected: {
    title: 'Still *protected.*',
    sub: 'A shared link opens nothing extra.',
    accent: C.text.accent,
  },
  building: {
    title: 'Knowledge that keeps *building.*',
    sub: 'Refreshed next quarter, built on by others.',
    accent: C.outcome.fg,
    breaks: [2],
  },
};

/** Everything the film needs, made once. */
export async function createFilmState(): Promise<FilmState> {
  const measurer = createCanvasMeasurer();
  const heads: Record<string, KineticText> = {};
  const cards: Record<string, Headline> = {};
  for (const [id, spec] of Object.entries(APP_HEADS)) {
    cards[id] = makeHeadline(`apphead-${id}`, spec, measurer);
  }
  const card = face('headline', 34, { letterSpacing: -0.6 });
  heads['proof1'] = kineticText({
    id: 'proof1',
    text: 'Sparing *hours* of searching,',
    font: card,
    measurer,
    x: 0,
    y: 0,
    align: 'center',
    color: C.text.primary,
    accent: C.time.fg,
    at: 0,
    ease: easing.enter,
  });
  heads['proof2'] = kineticText({
    id: 'proof2',
    text: 'so teams can do the work that *matters.*',
    font: card,
    measurer,
    x: 0,
    y: 0,
    align: 'center',
    maxWidth: 560,
    breaks: [4],
    color: C.text.primary,
    accent: C.text.accent,
    at: 0,
    ease: easing.enter,
  });
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
  return {
    board: await createBoard(measurer),
    apps: createApps(createUi(measurer)),
    heads,
    cards,
    intros,
  };
}

/** The intro card's type and layout (window-local px). */
const CARD = {
  pad: 56,
  inner: WIN.w - 112,
  eyebrow: face('mono', 17, { letterSpacing: 0.3 }),
  title: face('headline', 58, { letterSpacing: -1.6, lineHeight: 1.08 }),
  sub: face('subtext', 34, { lineHeight: 1.25 }),
  top: 300,
} as const;
/** Long after any entrance: the card's text fully settled. */
const SETTLED_TEXT = 1e4;

/**
 * An intro card over the window it covers (window-local, top left 0, 0):
 * Cloud, the Cowork mark, a lowercase mono eyebrow, the Sora title, the
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
): SceneNode | null {
  const text = state.intros[card.id];
  if (!text || lift >= 1) return null;
  const ui = state.apps.ui;
  const id = `ic-${card.id}`;
  // Lifting, the card slides up off the window, cut at the window's top edge.
  const d = WIN.h * lift;
  const outline = shape
    ? rect(shape.cx, shape.cy, shape.w, shape.h, shape.r)
    : rect(WIN.w / 2, WIN.h / 2 - d, WIN.w, WIN.h, R.card);
  const frame = shape ? outline : rect(WIN.w / 2, WIN.h / 2, WIN.w, WIN.h, R.card);
  const { pad } = CARD;
  const titleY = CARD.top + 40;
  const subY = titleY + text.title.height + 18;
  const kids: SceneNode[] = [
    mark(`${id}-mark`, pad + 13, 64, 26),
    label(`${id}-name`, 'Cowork', pad + 36, 49, F.title, C.text.primary),
    label(`${id}-eyebrow`, card.eyebrow, pad, CARD.top, CARD.eyebrow, C.text.accent),
    groupNode(`${id}-title`, [text.title(SETTLED_TEXT, 0)], {
      transform: { x: pad, y: titleY },
    }),
    groupNode(`${id}-sub`, [text.sub(SETTLED_TEXT, 0)], { transform: { x: pad, y: subY } }),
  ];
  // Who the scene follows: monogram pills along the bottom.
  let x = pad;
  const y = WIN.h - 100;
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
        fill: linearGradient(0, -d, 0, WIN.h - d, [
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

/** A copy of a node tree with every id prefixed (so the same screens can appear in two groups at once). */
function prefixed(node: SceneNode, prefix: string): SceneNode {
  return node.type === 'group'
    ? { ...node, id: prefix + node.id, children: node.children.map((c) => prefixed(c, prefix)) }
    : { ...node, id: prefix + node.id };
}

/**
 * A product scene's group: the rep's, the COO's, and the HR head and
 * intern's screens as a deck. The screen being used is forward and sharp;
 * the others sit softly behind it, and focus pulls between them as the
 * story moves from one person to the next. The headline is pinned above.
 */
function deck(state: FilmState, id: AppsScene, t: number): SceneNode[] {
  const g = group(id);
  const win = APPS_SCENES[id];
  const tau = clamp(appsTime(t), Math.max(win.start, 0.5), win.end);
  const card = INTRO_CARDS.find((c) => c.id === id);
  const resume = card ? cardResume(card) : -Infinity;
  const lift = progress(t, resume - LIFT, LIFT, easing.wipe);
  const focus = deskFocus(tau);
  const ui = state.apps.ui;
  const screens = [stationC(ui, tau), stationA(ui, tau), stationD(ui, tau)];
  // The rep's ask bar carries the Cowork mark.
  const dockMark = clamp((tau - 0.9) / 0.3);
  if (dockMark > 0) {
    screens[0]?.push(
      groupNode(
        'c-dock-mark-o',
        [
          markTile(
            'c-dock-mark',
            DESK.c - WIN.w / 2 + DOCK_ICON.x,
            WIN.top + DOCK_ICON.y,
            DOCK_ICON.size,
            { glow: 0.3 },
          ),
        ],
        {
          opacity: dockMark,
        },
      ),
    );
  }
  // The intro card covers the screen the scene starts on, until it lifts off.
  if (card && t < resume) {
    const left = [DESK.c, DESK.a, DESK.d][card.desk] ?? DESK.c;
    const opening = card.desk === 0 ? windowOpening(tau) : null;
    const sheet = introCard(
      state,
      card,
      lift,
      opening && opening.open < 1 ? opening.shape : undefined,
      opening ? clamp((opening.open - 0.45) / 0.45) : 1,
    );
    if (sheet) {
      screens[card.desk]?.push(
        groupNode(`${id}-intro-card`, [sheet], {
          transform: { x: left - WIN.w / 2, y: WIN.top },
        }),
      );
    }
  }
  // Wide on the intro card, easing into the scene's first shot as it lifts.
  const shot =
    t < resume
      ? blendShot(WIDE, shotAt(state.apps.direction, tau), lift)
      : shotAt(state.apps.direction, tau);
  // Hints on the screens, held the same size on screen however close the camera is.
  if (t >= resume) {
    // What the camera shows of the screen in focus (window-local), below the headline card.
    const sc = DECK_SCALE * shot.zoom;
    const view = {
      x0: shot.x - FW / 2 / sc,
      x1: shot.x + FW / 2 / sc,
      y0: shot.y + (HINT_TOP - DECK_Y) / sc,
      y1: shot.y + (FH - DECK_Y) / sc,
    };
    const inFocus = Math.round(focus);
    ([0, 1, 2] as const).forEach((d) => {
      const hints = hintNodes(ui, d, tau, HINT_SCALE / shot.zoom, d === inFocus ? view : undefined);
      if (hints.length === 0) return;
      const left = [DESK.c, DESK.a, DESK.d][d] ?? DESK.c;
      screens[d]?.push(
        groupNode(`${id}-hints${d}`, hints, { transform: { x: left - WIN.w / 2, y: WIN.top } }),
      );
    });
  }
  const desks = [DESK.c, DESK.a, DESK.d];
  const layers = screens
    .map((nodes, i) => {
      const rel = i - focus;
      const away = Math.min(Math.abs(rel), 1);
      return {
        away,
        node: groupNode(
          `${id}-desk${i}`,
          nodes.map((n) => prefixed(n, `${id}-`)),
          {
            transform: {
              x: g.x + FW / 2 + rel * 300,
              y: g.y + DECK_Y,
              scale: DECK_SCALE - 0.16 * away,
              originX: desks[i] ?? DESK.c,
              originY: MID,
            },
            opacity: 1 - 0.3 * away,
            ...(away > 0.02 ? { blur: 9 * away } : {}),
          },
        ),
      };
    })
    .sort((a, b) => b.away - a.away);
  const heads: SceneNode[] = [];
  for (const c of CAPTIONS) {
    const at = c.at[0] ?? 0;
    if (t < resume || at < win.start || at >= win.end || tau < at - 0.1) continue;
    const exit = progress(tau, c.out, 0.35, easing.exit);
    const card = state.cards[c.id];
    if (!card || exit >= 1) continue;
    heads.push(
      headlineCard(`${id}-head-${c.id}`, card, g.x + HEAD.x, g.y + HEAD.y, tau - at, exit),
    );
  }
  // The camera inside the deck: close on the component at work, wide on results.
  // Window point (x, y) of the screen in focus sits at DECK_Y on screen, zoomed.
  const s0 = DECK_SCALE;
  const centre = { x: g.x + FW / 2, y: g.y + FH / 2 };
  const target = { x: g.x + FW / 2, y: g.y + DECK_Y };
  const focusPt = {
    x: g.x + FW / 2 + (shot.x - WIN.w / 2) * s0,
    y: g.y + DECK_Y + (shot.y - WIN.h / 2) * s0,
  };
  const pivot = {
    x: focusPt.x - (target.x - centre.x) / shot.zoom,
    y: focusPt.y - (target.y - centre.y) / shot.zoom,
  };
  return [
    groupNode(
      `${id}-cam`,
      layers.map((l) => l.node),
      {
        transform: {
          x: centre.x,
          y: centre.y,
          scale: shot.zoom,
          originX: pivot.x,
          originY: pivot.y,
        },
      },
    ),
    ...heads,
  ];
}

// ---------------------------------------------------------------------------
// Social proof: a fast montage of the product at work
// ---------------------------------------------------------------------------

/**
 * Each clip replays a moment of the screens' timeline, full width, tilted a
 * little with shallow focus (placeholders until the real screen recordings
 * arrive): an answer streaming in with its sources, researchers at work
 * against the clock, the report opening, the Reports library.
 */
const PROOF_CLIPS: readonly { desk: 0 | 1 | 2; from: number }[] = [
  { desk: 0, from: OFF_CAMERA.stream - 0.15 },
  { desk: 1, from: stretch(13.65) },
  { desk: 1, from: stretch(22.7) },
  { desk: 1, from: stretch(25.95) },
];
/** Each clip is seven eighths (cuts land on the grid). */
const PROOF_CLIP = beats(1.75);
/**
 * How each clip's screen turns in depth while it is on (degrees about the
 * vertical axis; positive = right side away) and drifts sideways (px).
 * Alternate clips turn opposite ways, so each hard cut reads as a new angle.
 */
const PROOF_TURNS: readonly { from: number; to: number; x: readonly [number, number] }[] = [
  { from: 24, to: 11, x: [34, -8] },
  { from: -22, to: -10, x: [-32, 8] },
  { from: 20, to: 8, x: [28, -8] },
  { from: -18, to: -5, x: [-24, 4] },
];
/** The last clip keeps turning, more slowly, until the camera leaves. */
const PROOF_LAST_TURN = 1.7;
/** The two cards, each spanning two clips. */
const PROOF_CARDS = [
  { id: 'proof1', at: beats(0.25), out: 2 * PROOF_CLIP - beats(0.25) },
  { id: 'proof2', at: 2 * PROOF_CLIP, out: Infinity },
] as const;

function proofMontage(state: FilmState, t: number): SceneNode[] {
  const g = group('proof');
  const lt = t - FILM.proof;
  const k = Math.min(PROOF_CLIPS.length - 1, Math.max(0, Math.floor(lt / PROOF_CLIP)));
  const clip = PROOF_CLIPS[k] ?? PROOF_CLIPS[0];
  if (!clip) return [];
  const into = Math.max(0, lt - k * PROOF_CLIP);
  const tau = clip.from + into;
  const ui = state.apps.ui;
  const draw = [stationC, stationA, stationD][clip.desk] ?? stationA;
  const nodes = draw(ui, tau);
  if (clip.desk === 0) {
    nodes.push(
      markTile(
        'c-dock-mark',
        DESK.c - WIN.w / 2 + DOCK_ICON.x,
        WIN.top + DOCK_ICON.y,
        DOCK_ICON.size,
        { glow: 0.3 },
      ),
    );
  }
  const desk = [DESK.c, DESK.a, DESK.d][clip.desk] ?? DESK.a;
  // The screen turns in depth: narrowing with the angle (cos), its edges
  // slanting with it (skew), a sheen crossing as it turns to the light, its
  // shadow falling away from the near side. Already moving at the cut, easing out.
  const turn = PROOF_TURNS[k] ?? PROOF_TURNS[0];
  if (!turn) return [];
  const span = k === PROOF_CLIPS.length - 1 ? PROOF_LAST_TURN : PROOF_CLIP;
  const m = 1 - (1 - clamp(into / span)) ** 1.6;
  const angle = lerp(turn.from, turn.to, m);
  const rad = (angle * Math.PI) / 180;
  const window = { x: desk, y: MID, width: WIN.w, height: WIN.h };
  const sheen = lightSweep(
    `proof${k}-sheen`,
    rect(window.x, window.y, window.width, window.height, 18),
    window,
    0.12 + 0.76 * m,
    { color: lighting.highlight, width: 260, angle: angle > 0 ? 200 : -20, strength: 0.2 },
  );
  // Each cut lands with a quick focus pull.
  const focus = progress(into, 0, 0.2, easing.focus);
  const out: SceneNode[] = [
    groupNode(
      `proof-clip${k}`,
      [
        shapeNode(`proof${k}-cast`, {
          geometry: rect(desk - angle * 1.6, MID + 36, WIN.w * 0.94, WIN.h * 0.94, 28),
          fill: withAlpha(lighting.shadow, 0.2),
          blur: 48,
        }),
        ...nodes.map((n) => prefixed(n, `proof${k}-`)),
        ...(sheen ? [sheen] : []),
      ],
      {
        transform: {
          x: g.x + FW / 2 + lerp(turn.x[0], turn.x[1], m),
          y: g.y + 600,
          scale: 1.06 + 0.05 * m,
          scaleX: Math.cos(rad),
          skewY: 0.24 * angle,
          rotation: -2,
          originX: desk,
          originY: MID,
        },
        ...(focus < 1 ? { blur: 7 * (1 - focus) } : {}),
      },
    ),
    // A sheet near the lens, out of focus, for depth.
    paperCard('proof-near', g.x + 110, g.y + 1130, 300, 200, {
      lift: 1,
      rotation: -9,
      blur: 16,
      opacity: 0.55,
    }),
  ];
  for (const card of PROOF_CARDS) {
    const k2 = state.heads[card.id];
    if (!k2 || lt < card.at) continue;
    const exit = progress(lt, card.out, 0.25, easing.exit);
    if (exit >= 1) continue;
    const p = progress(lt, card.at, 0.45, easing.enter);
    const w = k2.width + 64;
    const h = k2.height + 36;
    const y = g.y + 1040;
    out.push(
      groupNode(
        `${card.id}-o`,
        [
          glassPanel(`${card.id}-panel`, g.x + FW / 2, y + h / 2, w, h, [], 24),
          groupNode(`${card.id}-text`, [k2(lt - card.at, exit)], {
            transform: { x: g.x + FW / 2, y: y + 18 },
          }),
        ],
        { opacity: clamp(p * 1.6) * (1 - exit), transform: { y: 14 * (1 - p) } },
      ),
    );
  }
  return out;
}

/** A shot between two others (zoom eased in log space). */
function blendShot(a: ShotView, b: ShotView, p: number): ShotView {
  return {
    x: lerp(a.x, b.x, p),
    y: lerp(a.y, b.y, p),
    zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), p)),
  };
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
    if (isApps(id)) {
      content.push(groupNode(`group-${id}`, deck(state, id, t)));
      continue;
    }
    if (id === 'proof') {
      if (t >= FILM.proof - 1.5) content.push(groupNode('group-proof', proofMontage(state, t)));
      continue;
    }
    const lt = local[id]?.(t);
    if (lt === undefined || lt < -0.5) continue;
    content.push(
      groupNode(
        `group-${id}`,
        groupArt(board, id, {
          lt,
          ...(id === 'criteria' ? { hubGone: t >= FILM.toIntro.start } : {}),
          ...(id === 'intro' ? { tileHidden: t < FILM.intro } : {}),
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
  // The opening: the line, the flood, the wall out of focus, "is lost", the crack and the break.
  WALL_CUES,
  // The pinboard fills as the camera arrives: each piece lands, every third pin pressed in.
  LOST_LANDINGS.map((at, k) => [
    cue(at + 0.12, slap({ gain: 0.22, pan: (seeded('pb', k) - 0.5) * 0.8 })),
    k % 3 === 0 ? cue(at + LOST.pieces.pin + 0.05, tick({ degree: 2, gain: 0.25 })) : [],
  ]),
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
  // The network assembles; the field spreads; new work lights up, and gets done.
  cue(C0 + CRITERIA.hub, pop({ degree: 0, gain: 0.5 })),
  Array.from({ length: 7 }, (_, k) =>
    cue(
      C0 + CRITERIA.sats.start + k * CRITERIA.sats.each,
      pluck({ degree: [0, 2, 4, 7, 9, 7, 4][k] ?? 0, octave: 2, gain: 0.32 }),
    ),
  ),
  cue(
    C0 + CRITERIA.field.start,
    whoosh(CRITERIA.field.duration, { from: 250, to: 3000, peak: 0.8, gain: 0.6 }),
  ),
  cue(
    C0 + CRITERIA.field.start,
    pad(4.6, { chord: 'lift', attack: 0.5, release: 1.2, gain: 0.55 }),
  ),
  CRITERIA.tasks.map((at, k) =>
    cue(C0 + at + 0.1, snap({ degree: 4 + 3 * k, take: k, gain: 0.45 })),
  ),
  cue(C0 + CRITERIA.done, ding({ degree: 7, gain: 0.4 })),
  // The hub flies on and becomes Cowork.
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
  // The product scenes keep their own sounds (typing, clicks, plucks), and each flight its air.
  LEGS.map((l) =>
    cue(l.arrive.start, whoosh(l.arrive.duration, { from: 260, to: 1500, peak: 0.5, gain: 0.45 })),
  ),
  [0, 2, 4, 7, 9].map((degree, k) =>
    cue(
      FILM.intro + INTRO.tagline + k * 0.08,
      pluck({ degree, octave: 2, gain: 0.28, pan: (k - 2) * 0.15 }),
    ),
  ),
  // Each intro card: a soft note as it settles in view, paper as it lifts off.
  INTRO_CARDS.map((c, k) => [
    cue(cardResume(c) - HOLD, pluck({ degree: [4, 7, 9, 7][k] ?? 4, octave: 1, gain: 0.28 })),
    cue(cardResume(c) - LIFT, whoosh(LIFT, { from: 700, to: 2600, peak: 0.6, gain: 0.3 })),
  ]),
  // The montage: a soft tick on every cut, a pluck as each card lands.
  PROOF_CLIPS.map((_, k) =>
    cue(
      FILM.proof + k * PROOF_CLIP,
      tick({ degree: 2 + 2 * k, gain: 0.3, pan: (k % 2 ? 1 : -1) * 0.2 }),
    ),
  ),
  cue(FILM.proof, thump({ gain: 0.3 })),
  PROOF_CARDS.map((c, k) =>
    cue(FILM.proof + c.at + 0.1, pluck({ degree: [4, 7][k] ?? 4, octave: 1, gain: 0.32 })),
  ),
  // The week: the days pile up, fold into one report, the clock stops in time.
  Array.from({ length: 5 }, (_, k) =>
    cue(
      FILM.week + WEEK.days.start + k * WEEK.days.each + 0.1,
      slap({ gain: 0.16, pan: (k - 2) * 0.25 }),
    ),
  ),
  cue(
    FILM.week + WEEK.fold.start,
    whoosh(WEEK.fold.duration, { from: 1600, to: 300, peak: 0.6, gain: 0.4 }),
  ),
  cue(FILM.week + WEEK.report.center, slap({ gain: 0.3 })),
  Array.from({ length: 9 }, (_, k) =>
    cue(
      FILM.week + WEEK.clock.start + ((WEEK.clock.end - WEEK.clock.start) * k) / 9,
      tick({ degree: 4, gain: 0.2, pan: k % 2 ? 0.2 : -0.2 }),
    ),
  ),
  cue(FILM.week + WEEK.clock.end, ding({ degree: 7, gain: 0.4 })),
  WEEK.chips.map((at, k) => cue(FILM.week + at, snap({ degree: 4 + 3 * k, take: k, gain: 0.4 }))),
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
  // The product scenes' sounds, in apps time, moved past the holds under the intro cards.
  const apps = cuesBetween(0.5, APPS_SCENES.library.end, 0.5).map((c) => ({
    ...c,
    at: filmOfApps(c.at),
  }));
  return [...flat, ...apps];
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
  ...APPS_FONTS,
  face('headline', 34, { letterSpacing: -0.6 }),
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
