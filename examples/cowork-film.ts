/**
 * The Cowork film on the mood board: one continuous timeline (seconds from
 * the film's start) that moves a camera across the board and plays each
 * group's choreography in turn. Scenes are windows of this timeline
 * (`defineFilmScene`), so every cut is the same frame on both sides.
 *
 * The film opens with the queries video's first two scenes (`query-bubbles`,
 * `query-crack`: the screen fills with messages, cracks and falls away),
 * drawn over this film's own ground and aurora (`openingBackdrop`), which
 * drifts on up to the pinboard. Its windows start at the pinboard
 * (`FILM.lost`), whose first frame is that ground and aurora alone; the
 * board comes in over them. The board timeline still runs from 0 (the
 * board's own wall, crack and dive), because the queries group sits on the
 * board.
 */
import {
  clamp,
  createCanvasMeasurer,
  groupNode,
  lerp,
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
  IMPACT,
  INTRO,
  LOST,
  LOST_FALLS,
  QUERIES,
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
  createApps,
  cuesBetween,
  deskFocus,
  shotAt,
  stationA,
  stationC,
  stationD,
  type Apps,
  type AppsScene,
} from './cowork-apps.js';
import { SFX_DIV, beats, onGrid } from './cowork-beat.js';
import { createUi } from './cowork-ui.js';
import {
  C,
  LOOK_FONTS,
  HEAD,
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
  clap,
  cue,
  ding,
  pad,
  pluck,
  pop,
  rustle,
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
 * The board timeline is written in the film's beats (110 bpm, `cowork-beat.ts`):
 * the opening's five + seven beats replace board time 0–5.4, so board time `t`
 * is film time `t + OPEN`, and `at(n)` is the board time of the film's beat `n`.
 * Camera flights start and land on beats (two beats each), scene cuts fall
 * on beats, and each group's own choreography is on sixteenths from there.
 */
const OPEN = beats(12) - 5.4;
const at = (n: number) => beats(n) - OPEN;
const flight = (n: number) => ({ start: at(n), duration: beats(2) });

/** When each group's choreography starts, and the moves between groups. */
export const FILM = {
  /** The dive through the crack, and the white the camera passes through. */
  dive: flight(10),
  white: { up: at(11.5), peak: at(12), down: beats(1) },
  lost: at(12),
  toCriteria: flight(27),
  criteria: at(28),
  pullBack: { start: at(29), duration: beats(4), zoom: 1.06 },
  toIntro: flight(37),
  /** The tile lands. */
  intro: at(39),
  introEnd: at(46),
  /** Down to the product row. */
  toAsk: flight(45),
  /**
   * The product scenes replay the apps timeline (`cowork-apps.ts`): film
   * time = apps time + this offset (on a beat, so the apps' sixteenths are
   * the film's).
   */
  apps: at(45),
  askToWork: flight(60),
  workToAnswers: flight(74),
  answersToLibrary: flight(89),
  libraryEnd: at(108),
  /** Down to the payoff row: the montage, the week, then along the thread to Cowork. */
  toProof: flight(107),
  proof: at(109),
  toWeek: flight(116),
  week: at(117),
  toOutro: flight(124),
  /** A sixteenth before the camera lands, so the lockup's clap falls on the beat. */
  outro: at(125.75),
  end: at(133.5),
} as const;

/** The scenes, as windows of the timeline; every cut on a beat. */
export const FILM_SCENES = {
  lost: { start: FILM.white.peak, end: at(28), title: 'Knowledge gets lost' },
  criteria: { start: at(28), end: at(38), title: 'What AI should do' },
  intro: { start: at(38), end: FILM.introEnd, title: 'Introducing Cowork' },
  ask: { start: FILM.introEnd, end: at(61), title: 'The ask' },
  work: { start: at(61), end: at(75), title: 'The work' },
  answers: { start: at(75), end: at(90), title: 'The answers' },
  library: { start: at(90), end: FILM.libraryEnd, title: 'The library' },
  proof: { start: FILM.libraryEnd, end: at(117), title: 'In use' },
  week: { start: at(117), end: FILM.toOutro.start, title: 'A week, condensed' },
  outro: { start: FILM.toOutro.start, end: FILM.end, title: 'Join the waitlist' },
} as const;
export type FilmScene = keyof typeof FILM_SCENES;

/** Each group's local time. */
const local: Partial<Record<GroupId, (t: number) => number>> = {
  queries: (t) => t,
  lost: (t) => t - FILM.lost,
  criteria: (t) => t - FILM.criteria,
  intro: (t) => t - FILM.intro,
  week: (t) => t - FILM.week,
  outro: (t) => t - FILM.outro,
};

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

const Q = group('queries');
const V = {
  /** Close on the first questions. */
  start: { x: Q.x + 250, y: Q.y + 300, zoom: 1.9 },
  queries: groupView('queries'),
  impact: { x: Q.x + IMPACT.x, y: Q.y + IMPACT.y, zoom: 7 },
  lostIn: groupView('lost', 1.6),
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
  if (t < FILM.dive.start) {
    // The pull back as the wall fills, then a small shake as it cracks.
    const v = flightPath(V.start, V.queries, FW).at(progress(t, 0.25, 2.5, easing.camera));
    const s = t - QUERIES.crack.start;
    if (s <= 0 || s > 0.8) return v;
    const decay = Math.exp(-7 * s);
    return { ...v, x: v.x + 6 * decay * Math.sin(55 * s), y: v.y + 4 * decay * Math.cos(47 * s) };
  }
  if (t < FILM.lost) {
    return flightPath(V.queries, V.impact, FW).at(
      progress(t, FILM.dive.start, FILM.dive.duration, easing.exit),
    );
  }
  const lostView = (u: number) =>
    drift(
      flightPath(V.lostIn, V.lost, FW).at(progress(u, FILM.lost, beats(2), easing.enter)),
      u,
      FILM.lost + beats(2),
      6.8,
    );
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
}

const isApps = (id: GroupId): id is AppsScene => id in APPS_SCENES;
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
  return {
    board: await createBoard(measurer),
    apps: createApps(createUi(measurer)),
    heads,
    cards,
  };
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
  const tau = clamp(t - FILM.apps, Math.max(win.start, 0.5), win.end);
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
    if (at < win.start || at >= win.end || tau < at - 0.1) continue;
    const exit = progress(tau, c.out, 0.35, easing.exit);
    const card = state.cards[c.id];
    if (!card || exit >= 1) continue;
    heads.push(
      headlineCard(`${id}-head-${c.id}`, card, g.x + HEAD.x, g.y + HEAD.y, tau - at, exit),
    );
  }
  // The camera inside the deck: close on the component at work, wide on results.
  // Window point (x, y) of the screen in focus sits at DECK_Y on screen, zoomed.
  const shot = shotAt(state.apps.direction, tau);
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
  { desk: 1, from: 13.65 },
  { desk: 1, from: 22.7 },
  { desk: 1, from: 25.95 },
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
  // Only while the camera passes through the wall; afterwards the wall rests cracked.
  const dive =
    t < FILM.lost ? progress(t, FILM.dive.start + 0.4, FILM.dive.duration - 0.4, easing.exit) : 0;
  for (const id of visible(view)) {
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
          ...(id === 'queries' ? { dive } : {}),
          ...(id === 'criteria' ? { hubGone: t >= FILM.toIntro.start } : {}),
          ...(id === 'intro' ? { tileHidden: t < FILM.intro } : {}),
        }),
      ),
    );
  }
  content.push(...carrier(board, t));
  const blur = inFlight(t) ? motionBlur(screenVelocity(camera, t)) : undefined;
  // The pinboard opens on query-crack's last frame, the ground and aurora
  // alone, and the board comes in over them.
  const reveal = t < FILM.lost ? 1 : progress(t, FILM.lost, FILM.white.down, easing.enter);
  if (reveal <= 0) return backdrop(t, view);
  return [
    ...backdrop(t, view),
    groupNode(
      'moving',
      [
        groupNode('board-grid', [gridFor(view)], { transform: viewTransform(view, FRAME) }),
        edgeFade('fade', FRAME, C.bg.canvas, 0.3),
        groupNode('board', content, { transform: viewTransform(view, FRAME) }),
      ],
      { ...(blur ? { blur } : {}), ...(reveal < 1 ? { opacity: reveal } : {}) },
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

const L0 = FILM.lost;
const C0 = FILM.criteria;
const CUES: readonly Cues[] = [
  // The pinboard: each piece lands, each pin pressed in.
  Array.from({ length: 19 }, (_, k) => {
    const at = L0 + LOST.pieces.start + k * LOST.pieces.each;
    return [
      cue(at + 0.12, slap({ gain: 0.22, pan: (seeded('pb', k) - 0.5) * 0.8 })),
      k % 3 === 0 ? cue(at + LOST.pieces.pin + 0.05, tick({ degree: 2, gain: 0.25 })) : [],
    ];
  }),
  cue(L0 + 0.2, rustle({ take: 1, gain: 3 })),
  cue(L0 + LOST.headA, pluck({ degree: 4, octave: 1, gain: 0.35 })),
  // The loss: a low fall, and the notes tearing free.
  cue(L0 + LOST.loss.start, whoosh(1.4, { from: 1400, to: 160, peak: 0.2, gain: 0.55 })),
  cue(L0 + LOST.loss.start, pad(4.5, { chord: 'shadow', attack: 0.8, release: 1.5, gain: 0.55 })),
  // Pieces tear free one after another; a question mark is left in each gap.
  LOST_FALLS.map((at, k) => [
    cue(L0 + at, rustle({ take: k + 3, gain: 2.6, pan: k % 2 ? 0.3 : -0.3 })),
    k % 3 === 2 ? cue(L0 + at + 0.6, thump({ gain: 0.18 })) : [],
    cue(
      L0 + at + LOST.mark + 0.05,
      pluck({ degree: [2, 0, 4][k % 3] ?? 0, octave: 0, gain: 0.14 }),
    ),
  ]),
  // An hour of searching, coming back empty.
  [0, 1, 2].map((k) => {
    const at = L0 + LOST.b.start + LOST.b.search + k * LOST.b.each;
    return [
      cue(at, pluck({ degree: [7, 4, 2][k] ?? 0, octave: 1, gain: 0.3 })),
      cue(at + 0.4, pluck({ degree: 0, octave: 0, gain: 0.3 })),
    ];
  }),
  changeTimes(
    (u) =>
      Math.floor(
        (58 * progress(u, L0 + LOST.b.start + LOST.b.ring + 0.2, LOST.b.sweep, easing.camera)) / 4,
      ),
    L0 + LOST.b.start + LOST.b.ring,
    L0 + LOST.b.start + LOST.b.ring + 3,
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
  cue(FILM.intro, clap({ big: true, chord: 'home' })),
  cue(FILM.intro, thump({ gain: 0.55 })),
  cue(
    FILM.intro + 0.05,
    pad(FILM.introEnd - FILM.intro - 0.3, { chord: 'home', attack: 0.3, release: 1.5 }),
  ),
  cue(FILM.intro + INTRO.name + 0.05, bell({ degree: 4, gain: 0.6 })),
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
  cue(FILM.outro + 0.15, clap({ big: true, chord: 'home' })),
  cue(FILM.outro + 0.15, thump({ gain: 0.5 })),
  cue(
    FILM.outro + 0.2,
    pad(FILM.end - FILM.outro - 0.2, { chord: 'home', attack: 0.3, release: 1.2 }),
  ),
  cue(FILM.outro + INTRO.name + 0.05, bell({ degree: 4, gain: 0.55 })),
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
const onBeat = (t: number) => onGrid(t + OPEN, SFX_DIV) - OPEN;

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
  return [...flat, ...cuesBetween(0.5, APPS_SCENES.library.end, FILM.apps + 0.5)];
})();

/** One scene's sounds, timed from its own start (earlier cues ring on in the film). */
function sceneCues(scene: FilmScene): SoundEvent[] {
  const { start, end } = FILM_SCENES[scene];
  return ALL_CUES.filter((c) => c.at >= start && c.at < end).map((c) => ({
    ...c,
    at: c.at - start,
  }));
}

/** A scene of the Cowork film: its stretch of the timeline. */
export function defineFilmScene(scene: FilmScene, id: string) {
  const { start, end, title } = FILM_SCENES[scene];
  return defineSceneComposition({
    ...phoneDefaults,
    fonts: [
      ...phoneDefaults.fonts,
      ...LOOK_FONTS,
      ...BOARD_FONTS,
      ...APPS_FONTS,
      face('headline', 34, { letterSpacing: -0.6 }),
    ],
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
