/**
 * The product scenes' choreography, as one continuous timeline: three
 * people's screens (a sales rep, the COO, and an HR head beside an intern),
 * each with the Cowork app, played through the script's beats. The Cowork
 * film (`cowork-film.ts`) shows them as a deck on each product group of the
 * mood board, pulling focus to whichever screen the story is on
 * (`deskFocus`), from film time = timeline time + `FILM.apps`.
 *
 * Three stories run through it (the script's C, A and D threads):
 * C: the rep asks a quick question, the answer is waiting, its source opens.
 * A: the COO asks a deep question; Cowork plans, researches, reports, and the
 *    report is kept, shared and refreshed (B).
 * D: an HR head and an intern ask the same question; only the HR head may see
 *    the answer, and the intern can't open the COO's report either.
 */
import {
  clamp,
  groupNode,
  layoutText,
  lerp,
  pathGeometry,
  progress,
  random,
  shapeNode,
  textNode,
  withAlpha,
  type SceneNode,
  type SoundEvent,
} from '@html-animation-engine/core';
import { elevationShadows } from '@html-animation-engine/renderers';
import { SFX_DIV, beats, gridTimes, onGrid } from './cowork-beat.js';
import { C, lighting, look, tone, type Meaning } from './cowork-look.js';
import { phoneDefaults } from './index.js';
import {
  F,
  UI,
  UI_FONTS,
  avatar,
  box,
  caret,
  clickRing,
  cursor,
  grouped,
  icon,
  label,
  pressAt,
  type Ui,
} from './cowork-ui.js';
import {
  G,
  GR,
  PF,
  PRODUCT_FONTS,
  TOP,
  answerMeta,
  answerText,
  barChart,
  checkbox,
  composerFrame,
  composerLayout,
  dialog,
  followUps,
  gridButton,
  gridWindow,
  hairline,
  levelMenu,
  levelMenuBox,
  miniChart,
  monoChip,
  plainAvatar,
  popover,
  popoverFoot,
  popoverHeight,
  searching,
  tabs,
  toast,
  topBar,
  userMessage,
} from './cowork-product.js';
import {
  bell,
  cue,
  tap,
  ding,
  key,
  pluck,
  pop,
  snap,
  thump,
  tick,
  whoosh,
  type Cues,
} from './sounds.js';

const { easing } = look;

/** The frame's centre line. */
const CX = phoneDefaults.width / 2;

// ---------------------------------------------------------------------------
// The timeline (seconds from the start of the product scenes)
// ---------------------------------------------------------------------------

/** Where each scene starts and ends on the timeline. */
// The timeline starts on a beat of the film (`cowork-beat.ts`), so its
// sixteenths are the film's: every moment below is moved onto them.

/**
 * Holds written into the timeline so each story beat can be read: at each
 * settled moment (`at`, in the timeline as first written) the screens take
 * `beats` longer, while the hints explain what is on them. Everything
 * written at or after a hold comes that much later (`stretch`); motion that
 * spans a hold (the elapsed clock racing, a spinner) simply takes longer.
 * Each product scene adds exactly what makes it 30 beats in the film.
 */
export const HOLDS: readonly { readonly at: number; readonly beats: number }[] = [
  // The ask (+12)
  { at: 1.8, beats: 3 },
  { at: 3.2, beats: 3 },
  { at: 5.8, beats: 2 },
  { at: 6.0, beats: 2 },
  { at: 8.5, beats: 2 },
  // The work (+13)
  { at: 9.7, beats: 3 },
  { at: 9.9, beats: 2 },
  { at: 10.1, beats: 2 },
  { at: 10.42, beats: 2 },
  { at: 11.6, beats: 1 },
  { at: 14.25, beats: 2 },
  { at: 15.1, beats: 1 },
  // The answers (+12)
  { at: 18.4, beats: 2.5 },
  { at: 19.0, beats: 1 },
  { at: 20.45, beats: 2 },
  { at: 21.6, beats: 2 },
  { at: 23.3, beats: 1.5 },
  { at: 23.9, beats: 1.5 },
  { at: 24.5, beats: 1.5 },
  // The library (+9)
  { at: 25.8, beats: 1.5 },
  { at: 27.0, beats: 1 },
  { at: 28.95, beats: 1.5 },
  { at: 29.8, beats: 1.5 },
  { at: 32.4, beats: 1.5 },
  { at: 32.6, beats: 1 },
  { at: 33.4, beats: 1 },
];
/** A time as first written, moved past every hold at or before it. */
export function stretch(t: number): number {
  let s = t;
  for (const h of HOLDS) if (t >= h.at) s += beats(h.beats);
  return s;
}
/** Hold `k` in the stretched timeline: when it starts and ends. */
export function holdWindow(k: number): { start: number; end: number } {
  const h = HOLDS[k];
  if (!h) return { start: 0, end: 0 };
  const end = stretch(h.at);
  return { start: end - beats(h.beats), end };
}
/** Every number in a table of written times, stretched past the holds. */
function stretchAll<V>(table: V): V {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'number') return Number.isFinite(value) ? stretch(value) : value;
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    return value;
  };
  return walk(table) as V;
}

export const SCENES = {
  ask: { start: 0, end: stretch(beats(16)) },
  work: { start: stretch(beats(16)), end: stretch(beats(30)) },
  answers: { start: stretch(beats(30)), end: stretch(beats(45)) },
  library: { start: stretch(beats(45)), end: stretch(beats(63)) },
} as const;
export type AppsScene = keyof typeof SCENES;

const T_WRITTEN = {
  /** The previous scene's captions leave; the rep's window opens out of the tile. */
  intro: { exit: 0.3, tile: 0.1, tileMove: 0.9, open: 0.3, openDur: 0.8 },
  // C1: the rep clicks into the composer and asks.
  c1: { cursor: 1.2, click: 1.72, type: 1.86, send: 3.1 },
  // A1: the COO asks a bigger question, picking Level 3 from the dropdown.
  a1: { type: 3.72, cursor: 5.5, menu: 5.79, level: 5.85, ask: 6.12, chip: 6.75 },
  // D1: the HR head and the intern ask the same question.
  d1: { hr: 6.86, intern: 7.0, sendHr: 8.18, sendIntern: 8.3 },
  // A2: the plan chip; Review opens the plan; save as a report; go ahead.
  a2: { cursor: 9.45, review: 9.75, save: 10.06, go: 10.46, work: 10.62 },
  // C2: the rep's answer is already there.
  c2: { ready: 4.4, sweep: 11.35 },
  // Before the camera returns to the rep: the answer streams in and a source opens (for the montage).
  c1b: { stream: 4.5, streamEnd: 5.1, cursor: 4.95, click: 5.36, open: 5.4, close: 6.4 },
  // A3: the agents at work, the elapsed clock racing; the panel closes off camera.
  a3: {
    race: 13.35,
    raceEnd: 15.95,
    steps: [11.9, 13.85, 14.5, 15.15] as const,
    close: 16.9,
    writing: 20.0,
  },
  // D2: the HR head's answer streams in; the intern's honest answer.
  d2: { stream: 17.05, streamEnd: 18.0, empty: 17.25, emptyEnd: 17.95 },
  // C3: the rep opens citation 1: a popover, its link to Outlook.
  c3: { cursor: 20.0, click: 20.48, open: 20.52, highlight: 21.0 },
  // A5: the report card; the report page; its citation card.
  a5: { done: 23.0, cursor: 23.15, open: 23.36, bars: 23.55, citeCursor: 23.92, cite: 24.02 },
  // B1: Reports; the report is shared with the CFO.
  b1: {
    cursor: 25.15,
    land: 25.33,
    more: 25.98,
    share: 26.18,
    type: 26.26,
    cfo: 26.62,
    confirm: 27.05,
    toast: 27.08,
    toastEnd: 28.05,
  },
  // D3: the intern opens the report's link and can't.
  d3: { swap: 28.0, message: 28.55, cursor: 28.7, click: 29.05, page: 29.18 },
  // B2: next quarter, a refresh, version 2; the CFO's answer cites the report.
  b2: {
    page: 29.6,
    cursor: 31.4,
    refresh: 31.62,
    confirm: 31.66,
    yes: 32.42,
    v2: 32.46,
    menu: 32.56,
    menuEnd: 32.95,
    cfo: 32.98,
    cite: 33.22,
  },
} as const;
const T = gridTimes(stretchAll(T_WRITTEN));

/** Captions: each phrase arrives at its time, and the whole line leaves at `out`. */
const CAPTIONS_WRITTEN: readonly {
  id: string;
  text: string;
  at: readonly number[];
  out: number;
  breaks?: readonly number[];
}[] = [
  { id: 'less', text: '*Less* searching.', at: [1.75], out: 3.35 },
  { id: 'bigger', text: '*Bigger* questions.', at: [4.0], out: 6.35 },
  { id: 'same', text: 'Same *question.*', at: [7.05], out: 8.78 },
  { id: 'plans', text: 'It *plans* first.', at: [9.28], out: 10.98 },
  { id: 'seconds', text: 'Answered in *seconds.*', at: [11.38], out: 13.3 },
  {
    id: 'parallel',
    text: 'Researchers, in *parallel.* | Every answer *checked.*',
    at: [13.62, 14.3],
    out: 16.5,
  },
  { id: 'allowed', text: "Only what you're *allowed* to see.", at: [17.1], out: 19.5, breaks: [3] },
  { id: 'source', text: 'Straight to the *source.*', at: [20.3], out: 22.4 },
  {
    id: 'picture',
    text: 'The *bigger* *picture.* | Before _lunch._',
    at: [22.95, 23.55],
    out: 25.4,
    breaks: [3],
  },
  { id: 'saved', text: 'Saved. | Shared. | Never *lost.*', at: [25.75, 26.1, 26.45], out: 28.3 },
  { id: 'protected', text: 'Still *protected.*', at: [29.15], out: 30.85 },
  {
    id: 'building',
    text: 'Knowledge that | keeps *building.*',
    at: [31.5, 31.9],
    out: 99,
    breaks: [2],
  },
];
/** Each caption arrives and leaves on a sixteenth. */
export const CAPTIONS = CAPTIONS_WRITTEN.map((c) => ({
  ...c,
  at: c.at.map((t) => onGrid(stretch(t))),
  out: onGrid(stretch(c.out)),
}));

// ---------------------------------------------------------------------------
// The desks and the camera
// ---------------------------------------------------------------------------

/** Each desk's centre on the (wide) desk plane; one frame apart. */
export const DESK = { c: CX, a: CX + 720, d: CX + 1440 } as const;
/** The window every desk shows. */
export const WIN = { w: 640, h: 860, top: 330 } as const;
export const MID = WIN.top + WIN.h / 2;
/** The HR head's and the intern's windows, full width, one above the other. */
const PANE = { h: 422, gap: 16 } as const;
/** The intern's window top (window-local, below the HR head's). */
const LOW = PANE.h + PANE.gap;

/** Camera moves: arrive at desk `to`, moving over [at, at + duration]. */
const MOVES_WRITTEN: readonly { to: number; at: number; duration: number }[] = [
  { to: DESK.a, at: 3.2, duration: 0.72 },
  { to: DESK.d, at: 6.25, duration: 0.72 },
  { to: DESK.a, at: 8.55, duration: 0.72 },
  { to: DESK.c, at: 10.75, duration: 0.72 },
  { to: DESK.a, at: 13.0, duration: 0.72 },
  { to: DESK.d, at: 16.3, duration: 0.72 },
  { to: DESK.c, at: 19.25, duration: 0.95 },
  { to: DESK.a, at: 22.15, duration: 0.72 },
  { to: DESK.d, at: 27.95, duration: 0.72 },
  { to: DESK.a, at: 30.65, duration: 0.72 },
];
/** Each move starts and lands on a sixteenth. */
const MOVES = MOVES_WRITTEN.map((m) => ({
  ...m,
  at: onGrid(stretch(m.at)),
  duration: onGrid(m.duration),
}));

/**
 * Which desk is in focus at `t` (0 = the rep, 1 = the COO, 2 = HR and intern),
 * continuous through each move: the film uses it to pull focus between screens.
 */
export function deskFocus(t: number): number {
  return (camera(t).x - DESK.c) / 720;
}

/** The camera: which desk point is centred, and a slight pull back mid-move. */
function camera(t: number): { x: number; zoom: number } {
  let x: number = DESK.c;
  let zoom = 1;
  for (const m of MOVES) {
    const p = progress(t, m.at, m.duration, easing.camera);
    const from = x;
    x = lerp(x, m.to, p);
    const span = Math.abs(m.to - from) / 720;
    const raw = clamp((t - m.at) / m.duration);
    zoom -= 0.05 * span * Math.sin(Math.PI * raw);
  }
  return { x, zoom };
}

// ---------------------------------------------------------------------------
// Typing, cursors and text
// ---------------------------------------------------------------------------

interface Typing {
  readonly text: string;
  /** When each character appears. */
  readonly times: readonly number[];
  readonly end: number;
}

/** Human typing: uneven key gaps, a little longer after spaces and punctuation. */
function typing(id: string, text: string, start: number, cps: number): Typing {
  const times: number[] = [];
  let at = start;
  [...text].forEach((ch, i) => {
    times.push(at);
    const gap = (0.55 + 0.9 * random('typing', id, i)) / cps;
    at += gap + (ch === ' ' ? 0.3 / cps : 0) + (/[,?.']/.test(ch) ? 1.6 / cps : 0);
  });
  return { text, times, end: at };
}
const typed = (k: Typing, t: number) => {
  let n = 0;
  while (n < k.times.length && (k.times[n] ?? Infinity) <= t) n++;
  return k.text.slice(0, n);
};

const Q = {
  c: 'What rate did we approve for the renewal?',
  a: 'Which suppliers slowed our deliveries this quarter, and what did we promise customers because of it?',
  d: "What were this year's salary revisions?",
};
const TYPE = {
  c: typing('c', Q.c, T.c1.type, 37),
  a: typing('a', Q.a, T.a1.type, 54),
  hr: typing('hr', Q.d, T.d1.hr, 31),
  intern: typing('intern', Q.d, T.d1.intern, 33),
};

interface Way {
  readonly at: number;
  readonly x: number;
  readonly y: number;
}

/** A pointer gliding between points (arriving at each `at`), on a slight arc. */
function pointer(t: number, ways: readonly Way[], hide = Infinity) {
  const first = ways[0];
  if (!first || t < first.at - 0.25 || t > hide + 0.3) return null;
  let x = first.x;
  let y = first.y;
  for (let k = 1; k < ways.length; k++) {
    const [a, b] = [ways[k - 1], ways[k]];
    if (!a || !b) continue;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const duration = Math.min(0.2 + dist / 1500, b.at - a.at - 0.04, 0.55);
    const p = progress(t, b.at - duration, duration, easing.camera);
    const arc = 0.07 * dist * Math.sin(Math.PI * p);
    const [nx, ny] = dist > 0 ? [-(b.y - a.y) / dist, (b.x - a.x) / dist] : [0, 0];
    if (p > 0) {
      x = lerp(a.x, b.x, p) + nx * arc;
      y = lerp(a.y, b.y, p) + ny * arc;
    }
  }
  const opacity = clamp((t - (first.at - 0.25)) / 0.2) * (1 - clamp((t - hide) / 0.3));
  return { x, y, opacity };
}

/** A person tag above a window: who is at this desk (a film label, not product UI). */
function personTag(ui: Ui, id: string, role: string, who: Person, x: number, y: number) {
  const w = ui.measure(role, F.role) + 40;
  return groupNode(id, [
    face(`${id}-av`, who, x - w / 2 + 13, y, 13),
    label(`${id}-role`, role, x - w / 2 + 36, y - 10, F.role, UI.sub),
  ]);
}

/** Monogram avatars for the film's person tags, every one in the people family (rose). */
const PEOPLE = {
  SR: C.avatar.rep,
  CO: C.avatar.coo,
  HR: C.avatar.hr,
  IN: C.avatar.intern,
  CF: C.avatar.cfo,
} as const;
type Person = keyof typeof PEOPLE;
const face = (id: string, who: Person, x: number, y: number, r: number, opacity = 1) =>
  avatar(id, who, x, y, r, PEOPLE[who], opacity);

// ---------------------------------------------------------------------------
// The product's frame and composer, shared by every Cowork window
// ---------------------------------------------------------------------------

/** The main column (the whole window: no sidebar), and the text column inside it (window-local). */
const MAIN = { x: 0, w: WIN.w } as const;
const COL = { x: 24, w: WIN.w - 48 } as const;
/** The composer: under the greeting on an empty chat, at the foot once a question is sent. */
const COMPOSER = { x: 16, w: WIN.w - 32, h: 56, empty: 336, greet: 270 } as const;
const PLACEHOLDER = 'Ask across your workspace…';
/** A sent question's widest line. */
const MSG_W = 420;
/** The conversation's first line. */
const CHAT_TOP = TOP + 22;

/** Pure layouts, worked out once per measurer (they depend on nothing else). */
const LAYOUTS = new WeakMap<Ui, Map<string, unknown>>();
function memo<V>(ui: Ui, key: string, make: () => V): V {
  let m = LAYOUTS.get(ui);
  if (!m) {
    m = new Map();
    LAYOUTS.set(ui, m);
  }
  if (!m.has(key)) m.set(key, make());
  return m.get(key) as V;
}

/** The composer's height for `text`: one row while it fits beside the controls, else the text above them. */
function composerFit(ui: Ui, text: string, w: number, level: 1 | 3) {
  const row = composerLayout(ui, 0, 0, w, COMPOSER.h, level);
  const inline = row.chip.x - 12 - 16;
  const multi = text.length > 0 && ui.measure(text, PF.body) > inline;
  const textH = multi
    ? layoutText(text, PF.body, { measurer: ui.measurer, maxWidth: w - 32 }).height
    : 0;
  return { multi, h: multi ? Math.ceil(textH) + 14 + 52 : COMPOSER.h };
}

/** The composer with its text (typed or placeholder), caret and controls; `y` is its top. */
function composer(
  ui: Ui,
  id: string,
  x: number,
  y: number,
  w: number,
  o: { text: string; t: number; focus: number; level: 1 | 3; press?: number; idle?: number },
): { nodes: SceneNode[]; h: number; layout: ReturnType<typeof composerLayout> } {
  const fit = composerFit(ui, o.text, w, o.level);
  const L = composerLayout(ui, x, y, w, fit.h, o.level);
  const empty = o.text.length === 0;
  const nodes: (SceneNode | null)[] = composerFrame(ui, id, x, y, w, fit.h, {
    focus: o.focus,
    level: o.level,
    ready: !empty,
    press: o.press ?? 0,
    empty: empty && o.focus < 0.5,
  });
  const tx = x + 16;
  const lh = PF.body.size * PF.body.lineHeight;
  const ty = fit.multi ? y + 14 : y + (COMPOSER.h - lh) / 2;
  const maxWidth = fit.multi ? w - 32 : 2000;
  if (empty) {
    const room = (o.focus < 0.5 ? L.hint.x : L.chip.x) - 12 - tx;
    nodes.push(label(`${id}-ph`, ui.fit(PLACEHOLDER, PF.body, room), tx, ty, PF.body, G.faint));
  } else {
    nodes.push(
      textNode(`${id}-text`, {
        text: o.text,
        font: PF.body,
        fill: G.ink,
        maxWidth,
        transform: { x: tx, y: ty },
      }),
    );
  }
  if (o.focus > 0.5) {
    const layout = layoutText(empty ? ' ' : o.text, PF.body, { measurer: ui.measurer, maxWidth });
    const line = layout.lines[layout.lines.length - 1];
    const space = o.text.endsWith(' ') ? ui.measure(' ', PF.body) : 0;
    const cx = !empty && line ? tx + line.x + line.width + space + 1 : tx;
    nodes.push(
      caret(
        `${id}-caret`,
        cx,
        ty + (line?.y ?? 0) + lh * 0.14,
        lh * 0.72,
        o.t,
        o.idle ?? -10,
        G.ink,
      ),
    );
  }
  return { nodes: nodes.filter((n): n is SceneNode => n !== null), h: fit.h, layout: L };
}

/** Where a conversation's parts sit: the question, the answer, its meta row and pills. */
interface ChatLayout {
  readonly msgH: number;
  readonly y0: number;
  readonly answerH: number;
  readonly cites: Record<string, Box>;
  readonly metaY: number;
  readonly meta: ReturnType<typeof answerMeta>;
  readonly pillsY: number;
}
interface ChatSpec {
  readonly key: string;
  readonly question: string;
  readonly answer: string;
  readonly meta: { confidence: 'High' | 'Low'; reason: string; sources: number };
  /** The question's top (window-local). */
  readonly top?: number;
}
function chatLayout(ui: Ui, spec: ChatSpec): ChatLayout {
  return memo(ui, `chat-${spec.key}`, () => {
    const top = spec.top ?? CHAT_TOP;
    const msg = userMessage(ui, 'm', spec.question, COL.x + COL.w, top, MSG_W);
    const y0 = top + msg.h + 20;
    const ans = answerText(ui, 'm', spec.answer, COL.x, y0, COL.w);
    const metaY = y0 + ans.h + 14;
    const meta = answerMeta(ui, 'm', COL.x, metaY, { ...spec.meta, w: COL.w });
    return {
      msgH: msg.h,
      y0,
      answerH: ans.h,
      cites: ans.cites,
      metaY,
      meta,
      pillsY: metaY + meta.h + 6,
    };
  });
}

/** Words in an answer (for streaming it word by word). */
const wordCount = (text: string) => text.split(/\s+/).length;

/**
 * A sent conversation: the question, an answer streaming in word by word
 * (`shown`), then the access line, the meta row and (if `pills`) the
 * follow-up pills fading in (`extras`). `hot` marks a citation as open.
 */
function chatNodes(
  ui: Ui,
  id: string,
  spec: ChatSpec,
  o: { shown: number; extras: number; pills?: boolean; hot?: string; hotP?: number },
): SceneNode[] {
  const L = chatLayout(ui, spec);
  const msg = userMessage(
    ui,
    `${id}-msg`,
    spec.question,
    COL.x + COL.w,
    spec.top ?? CHAT_TOP,
    MSG_W,
  );
  const nodes: SceneNode[] = [msg.node];
  const hot = o.hot ? L.cites[o.hot] : undefined;
  if (hot && (o.hotP ?? 0) > 0)
    nodes.push(
      box(`${id}-hot`, hot.x - 1, hot.y - 1, hot.w + 2, hot.h + 2, 2, {
        fill: G.selected,
        opacity: o.hotP,
      }),
    );
  nodes.push(answerText(ui, `${id}-ans`, spec.answer, COL.x, L.y0, COL.w, { shown: o.shown }).node);
  if (o.extras > 0) {
    const extras: SceneNode[] = [
      answerMeta(ui, `${id}-meta`, COL.x, L.metaY, { ...spec.meta, w: COL.w }).node,
    ];
    if (o.pills) extras.push(followUps(ui, `${id}-pills`, COL.x, L.pillsY, COL.w).node);
    nodes.push(
      groupNode(`${id}-extras`, extras, {
        opacity: o.extras,
        transform: { y: 8 * (1 - o.extras) },
      }),
    );
  }
  return nodes;
}

/** A source popover under citation `n` of a conversation: its box. */
function citePopoverBox(ui: Ui, spec: ChatSpec, n: string, body: string): Box {
  const L = chatLayout(ui, spec);
  const c = L.cites[n] ?? { x: COL.x, y: L.y0, w: 10, h: 14 };
  const w = COL.w;
  return { x: COL.x, y: c.y + c.h + 10, w, h: popoverHeight(ui, body, w) };
}

// ---------------------------------------------------------------------------
// C: the sales rep, in the Cowork web app
// ---------------------------------------------------------------------------

const C_CHAT: ChatSpec = {
  key: 'c',
  question: Q.c,
  answer:
    "You approved *8.5%* for Arden Logistics' three-year renewal.[1] The deal desk signed it off on 12 May, and the customer confirmed it in Teams the next day.[2]",
  meta: { confidence: 'High', reason: 'Two sources agree on the rate.', sources: 2 },
};
const C_SOURCE = {
  title: 'Re: Renewal terms – Arden Logistics',
  body: 'The snippet, permission verdict, and live-freshness for this source resolve when you open it.',
  foot: 'Outlook · Open',
};

/**
 * The rep's window growing out of the tile (centred on it), as an app opens
 * from its icon: its outline (window-local) and how far it is open (0–1).
 */
export function windowOpening(t: number): {
  open: number;
  shape: { cx: number; cy: number; w: number; h: number; r: number };
} {
  const open = progress(t, T.intro.open, T.intro.openDur, easing.enter);
  const tileY = 512 - WIN.top;
  return {
    open,
    shape: {
      cx: WIN.w / 2,
      cy: lerp(tileY, WIN.h / 2, open),
      w: lerp(200, WIN.w, open),
      h: lerp(200, WIN.h, open),
      r: lerp(50, 10, open),
    },
  };
}

/** Where the rep's composer sits: under the greeting, then at the foot once the question is sent. */
const composerY = (move: number, h = COMPOSER.h) => lerp(COMPOSER.empty, WIN.h - 18 - h, move);

function cLayout(ui: Ui) {
  return memo(ui, 'c', () => {
    const L = chatLayout(ui, C_CHAT);
    const pop = citePopoverBox(ui, C_CHAT, '1', C_SOURCE.body);
    const cite = L.cites['1'] ?? { x: COL.x, y: L.y0, w: 10, h: 14 };
    return { ...L, pop, cite, foot: popoverFoot(ui, pop, C_SOURCE.foot) };
  });
}

export function stationC(ui: Ui, t: number): SceneNode[] {
  const { open, shape } = windowOpening(t);
  if (open <= 0) return [];
  const L = cLayout(ui);
  const left = DESK.c - WIN.w / 2;
  const sent = t >= T.c1.send;
  const move = progress(t, T.c1.send + 0.05, 0.5, easing.camera);
  const kids: (SceneNode | null)[] = [];
  // The empty chat's greeting, giving way to the conversation.
  if (move < 1)
    kids.push(
      label(
        'c-greet',
        'What can I help you find?',
        MAIN.x + MAIN.w / 2,
        COMPOSER.greet,
        PF.greeting,
        G.ink,
        {
          align: 'center',
          opacity: 1 - clamp(move * 2),
        },
      ),
    );
  if (move > 0) {
    // The question rises from the composer; the answer is searched for, then streams in.
    const msgTop = lerp(COMPOSER.empty, CHAT_TOP, move);
    const ready = progress(t, T.c2.ready, 0.3);
    const wait = clamp((t - T.c1.send - 0.35) / 0.25) * (1 - ready);
    const shown = lerp(
      0,
      wordCount(C_CHAT.answer) + 1,
      progress(t, T.c1b.stream, T.c1b.streamEnd - T.c1b.stream),
    );
    const pop = Math.max(
      progress(t, T.c1b.open, 0.25, easing.enter) *
        (1 - progress(t, T.c1b.close, 0.25, easing.exit)),
      progress(t, T.c3.open, 0.25, easing.enter),
    );
    const hover = (click: number) => clamp((t - (click - 0.25)) / 0.1) * (t < click + 0.1 ? 1 : 0);
    const hotP = Math.max(pop, hover(T.c1b.click), hover(T.c3.click));
    kids.push(
      groupNode(
        'c-chat',
        chatNodes(ui, 'c', C_CHAT, {
          shown: ready > 0 ? shown : 0,
          extras: progress(t, T.c1b.streamEnd, 0.35, easing.enter),
          pills: true,
          hot: '1',
          hotP,
        }),
        { transform: { y: msgTop - CHAT_TOP }, opacity: clamp(move * 2) },
      ),
    );
    if (wait > 0)
      kids.push(
        groupNode('c-wait', [searching('c-search', COL.x, L.y0, COL.w, t)], { opacity: wait }),
      );
    // The source behind citation 1: a popover, and its link to Outlook.
    if (pop > 0)
      kids.push(popover(ui, 'c-pop', L.pop, pop, C_SOURCE, progress(t, T.c3.highlight, 0.15)));
  }
  // The composer: focused and typed into, then back to its placeholder at the foot.
  const text = sent ? '' : typed(TYPE.c, t);
  const comp = composer(
    ui,
    'c-comp',
    COMPOSER.x,
    sent ? composerY(move) : COMPOSER.empty,
    COMPOSER.w,
    {
      text,
      t,
      focus: sent ? 0 : progress(t, T.c1.click, 0.15),
      level: 1,
      press: pressAt(t, T.c1.send),
      idle: text.length === 0 ? -10 : text.length < TYPE.c.text.length ? Infinity : TYPE.c.end,
    },
  );
  kids.push(...comp.nodes);

  kids.push(...topBar(ui, 'c-top', WIN.w));
  // Pointers: into the composer; to citation 1 (twice); onto the Outlook link.
  const cite = { x: L.cite.x + L.cite.w / 2, y: L.cite.y + 7 };
  const p1 = pointer(
    t,
    [
      { at: T.c1.cursor, x: 500, y: 620 },
      { at: T.c1.click - 0.04, x: COMPOSER.x + 150, y: COMPOSER.empty + 30 },
    ],
    T.c1.type + 0.25,
  );
  if (p1) kids.push(cursor('c-cursor1', p1.x, p1.y, pressAt(t, T.c1.click), p1.opacity));
  kids.push(clickRing('c-ring1', COMPOSER.x + 150, COMPOSER.empty + 30, t, T.c1.click));
  const p2 = pointer(
    t,
    [
      { at: T.c1b.cursor, x: 520, y: 600 },
      { at: T.c1b.click - 0.05, x: cite.x, y: cite.y },
    ],
    T.c1b.click + 0.5,
  );
  if (p2) kids.push(cursor('c-cursor2', p2.x, p2.y, pressAt(t, T.c1b.click), p2.opacity));
  const p3 = pointer(
    t,
    [
      { at: T.c3.cursor, x: 520, y: 640 },
      { at: T.c3.click - 0.05, x: cite.x, y: cite.y },
      { at: T.c3.highlight, x: L.foot.x + 70, y: L.foot.y + 18 },
    ],
    stretch(22.1),
  );
  if (p3) kids.push(cursor('c-cursor3', p3.x, p3.y, pressAt(t, T.c3.click), p3.opacity));
  kids.push(clickRing('c-ring3', cite.x, cite.y, t, T.c3.click));

  return [
    groupNode('c-tag-o', [personTag(ui, 'c-tag', 'Sales rep', 'SR', DESK.c, WIN.top - 30)], {
      opacity: clamp((open - 0.5) / 0.5),
    }),
    gridWindow('c-win', { x: left, y: WIN.top, w: WIN.w, h: WIN.h }, kids, {
      shape,
      content: clamp((open - 0.45) / 0.45),
    }),
  ];
}

// ---------------------------------------------------------------------------
// A: the COO (a Level 3 run: plan → work → report → Reports), and the CFO
// ---------------------------------------------------------------------------

const REPORT_TITLE = 'Supplier delays and promises';

/** The deep run's plan, in the product's sections. */
const PLAN = {
  asked:
    'Which suppliers slowed deliveries this quarter, and what we promised customers because of it.',
  scope:
    'Mail, Teams and files from 1 Apr to 30 Jun. Only items you can already open are searched.',
  who: 'Every supplier that delivered late this quarter, and the customers whose orders they touched.',
  measures: [
    ['Days late', 'the average delay per late order'],
    ['Promises', 'new dates or credits offered to customers'],
  ],
  steps: [
    ['Lead', 'Split the question and brief the researchers'],
    ['Researcher', 'Read delivery logs, supplier emails and Teams chats'],
    ['Researcher', 'Match late orders to customers and what we promised'],
    ['Checker', 'Check each answer against its source'],
  ],
  limits: 'Delivery logs from before April are not in files you can open.',
} as const;

/** The Work tab's agents: the Lead, then the researchers (mail, Teams and files only). */
const AGENTS = [
  {
    agent: 'Lead',
    task: 'Briefing and merging',
    steps: [1, 9],
    srch: [0, 0],
    read: [0, 0],
    progs: [0, 0],
    tokens: [6, 41],
  },
  {
    agent: 'Researcher 1',
    task: 'Delivery logs (files)',
    steps: [1, 14],
    srch: [2, 18],
    read: [4, 64],
    progs: [0, 3],
    tokens: [9, 212],
  },
  {
    agent: 'Researcher 2',
    task: 'Supplier emails',
    steps: [1, 12],
    srch: [3, 22],
    read: [7, 131],
    progs: [0, 0],
    tokens: [11, 168],
  },
  {
    agent: 'Researcher 3',
    task: 'Customer contracts (files)',
    steps: [1, 8],
    srch: [1, 9],
    read: [2, 27],
    progs: [0, 1],
    tokens: [5, 74],
  },
  {
    agent: 'Researcher 4',
    task: 'Teams chats',
    steps: [1, 10],
    srch: [2, 15],
    read: [5, 88],
    progs: [0, 0],
    tokens: [7, 120],
  },
] as const;
const CHECKER = { agent: 'Checker', task: 'Checking every answer' } as const;

/** The elapsed clock (seconds) on the deep run: 19 minutes in all. */
function elapsed(t: number): number {
  const go = T.a2.go;
  if (t < go) return 0;
  if (t < T.a3.race) return lerp(0, 252, (t - go) / (T.a3.race - go));
  if (t < T.a3.raceEnd)
    return lerp(252, 1112, progress(t, T.a3.race, T.a3.raceEnd - T.a3.race, easing.camera));
  return lerp(1112, 1140, clamp((t - T.a3.raceEnd) / (T.a5.done - T.a3.raceEnd)));
}
/** How far the researchers have got (0–1). */
const researched = (t: number) => clamp(elapsed(t) / 1112);
/** m:ss, as the product writes it. */
const mss = (s: number) => {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

/** The report, as each version reads. */
interface ReportVersion {
  readonly v: 1 | 2;
  readonly meta: string;
  readonly bottom: string;
  readonly findings: readonly string[];
  readonly trust: string;
  readonly chart: string;
  readonly bars: readonly { name: string; value: number }[];
}
const REPORT: Record<1 | 2, ReportVersion> = {
  1: {
    v: 1,
    meta: 'Mail, Files and Teams to 30 Jun · run 30 Jun · v1',
    bottom: 'Three suppliers caused 71% of late deliveries this quarter.',
    findings: [
      'Kestrel Alloys ran 9.4 days late on average after a furnace repair.[1]',
      'We promised 14 customers new dates or credits.[2]',
      'Three of those promises are still open.[3]',
    ],
    trust: 'Read 21 emails, 8 Teams messages, 9 files · 1 Apr–30 Jun · 4 of 4 sections checked',
    chart: 'Three suppliers ran 5–9 days late',
    bars: [
      { name: 'Kestrel', value: 9.4 },
      { name: 'Arbor', value: 6.1 },
      { name: 'Halden', value: 5.2 },
      { name: 'Others', value: 1.2 },
    ],
  },
  2: {
    v: 2,
    meta: 'Mail, Files and Teams to 30 Sep · run 30 Sep · v2',
    bottom: 'Late deliveries fell by a third; Kestrel Alloys is still the slowest.',
    findings: [
      'Kestrel Alloys still ran 6.2 days late on average.[1]',
      'Halden Plastics is back on time since July.[2]',
      'All 14 promises to customers are now closed.[3]',
    ],
    trust: 'Read 26 emails, 11 Teams messages, 12 files · 1 Jul–30 Sep · 4 of 4 sections checked',
    chart: 'Kestrel Alloys still ran 6 days late',
    bars: [
      { name: 'Kestrel', value: 6.2 },
      { name: 'Arbor', value: 3.4 },
      { name: 'Halden', value: 1.1 },
      { name: 'Others', value: 1.0 },
    ],
  },
};
/** The report's citation card (the exact line it used). */
const CITATION = {
  kind: 'Email · [1]',
  title: 'Re: May shipments – revised dates',
  from: 'Kestrel Alloys · 14 May',
  passage:
    "We can't ship the May order before 23 May; the furnace repair has moved every batch back about nine days.",
  cited: 'Cited in §1',
  open: 'Open in Outlook',
} as const;

/** The CFO's conversation, citing the COO's report. */
const CFO_CHAT: ChatSpec = {
  key: 'cfo',
  question: 'Which customers did we promise credits for late deliveries?',
  answer:
    'We promised credits to 6 customers and new dates to 8. Three promises are still open, all on Kestrel Alloys orders.[1]',
  meta: { confidence: 'High', reason: 'Taken from a checked report.', sources: 1 },
};

/** Reports in the library (all from Level 3 plans): the newest is the COO's. */
const LIBRARY = [
  {
    title: 'Renewals at risk, Q2',
    bottom: 'Nine renewals carry a price or service risk; four need a call this month.',
    sources: ['mail', 'doc'],
    period: '1 Apr–30 Jun',
    shared: 'Shared by Maya Chen',
    date: '24 Jun',
    trend: [3, 5, 4, 7, 6, 9],
  },
  {
    title: 'Vendor contract terms',
    bottom: 'Two vendors can raise prices mid-term; one contract has no exit clause.',
    sources: ['doc'],
    period: '2024–2026',
    shared: 'Shared with 2',
    date: '19 Jun',
    trend: [6, 6, 5, 7, 8, 8],
  },
  {
    title: 'Escalations this month',
    bottom: 'Most escalations trace back to onboarding delays in two regions.',
    sources: ['mail', 'chat'],
    period: '1–30 Jun',
    shared: 'Shared by Omar Haddad',
    date: '9 Jun',
    trend: [8, 6, 7, 5, 4, 4],
  },
  {
    title: 'Pricing changes since 2025',
    bottom: 'List prices rose twice; discounts above 15% need the deal desk.',
    sources: ['mail', 'doc', 'chat'],
    period: 'Jan 2025–Jun 2026',
    shared: 'Only you',
    date: '2 Jun',
    trend: [2, 3, 3, 5, 6, 6],
  },
] as const;
const NEW_REPORT = {
  title: REPORT_TITLE,
  bottom: REPORT[1].bottom,
  sources: ['mail', 'chat', 'doc'],
  period: '1 Apr–30 Jun',
  date: '30 Jun',
  trend: [2, 4, 9, 7, 5, 3],
} as const;
/** People the COO can share with (initials only appear here, as in the product). */
const SUGGESTIONS = [
  {
    initials: 'PR',
    name: 'Priya Raman',
    email: 'priya.raman@company.com',
    job: 'Chief Financial Officer',
  },
  {
    initials: 'PK',
    name: 'Prisha Kapoor',
    email: 'prisha.kapoor@company.com',
    job: 'Procurement lead',
  },
] as const;
const SHARE_TYPED = typing('share', 'pri', 0, 9);

/** The plan chip in the chat and the progress/report card under it. */
function aChatLayout(ui: Ui) {
  return memo(ui, 'a-chat', () => {
    const msg = userMessage(ui, 'm', Q.a, COL.x + COL.w, CHAT_TOP, MSG_W);
    const chipY = CHAT_TOP + msg.h + 20;
    const chip = { x: COL.x, y: chipY, w: COL.w, h: 96 };
    const card = { x: COL.x, y: chip.y + chip.h + 14, w: COL.w };
    const review = {
      x: COL.x + 14,
      y: chip.y + 48,
      w: ui.measure('Review ›', PF.label) + 24,
      h: 34,
    };
    const openBtn = { x: card.x + 16, y: 0, w: ui.measure('Open report', PF.label) + 24, h: 34 };
    return { msgH: msg.h, chip, card, review, openBtn };
  });
}

/** The Research workspace panel (full window under the top bar) and its parts. */
const PANEL = { head: 50, tabs: 40 } as const;
const PANEL_TOP = TOP;
const PANEL_BODY = TOP + PANEL.head + PANEL.tabs;
const FOOT_H = 124;

interface PlanSection {
  readonly title: string;
  readonly y: number;
  readonly bodyY: number;
  readonly h: number;
}
function planLayout(ui: Ui) {
  return memo(ui, 'plan', () => {
    const w = WIN.w - 48;
    const lines = (text: string) =>
      layoutText(text, PF.small, { measurer: ui.measurer, maxWidth: w }).height;
    let y = PANEL_BODY + 16;
    const kicker = y;
    y += 22;
    const title = y;
    y += 32;
    const vrow = y;
    y += 34;
    const sections: PlanSection[] = [];
    const add = (title: string, h: number) => {
      sections.push({ title, y, bodyY: y + 21, h });
      y += 21 + h + 10;
    };
    add('What you asked for', lines(PLAN.asked));
    add('Scope — what will be read', lines(PLAN.scope));
    add('Who is included', lines(PLAN.who));
    add('Measures', PLAN.measures.length * 21);
    add('Steps — who does what', PLAN.steps.length * 28);
    add('Limits I can already see', lines(PLAN.limits));
    const footY = WIN.h - FOOT_H;
    const goW = Math.round(ui.measure('Go ahead', PF.label) + 24);
    const go = { x: WIN.w - 24 - goW, y: footY + 74, w: goW, h: 34 };
    const steps = sections[4] ?? { y: 0, bodyY: 0, h: 0, title: '' };
    return {
      kicker,
      title,
      vrow,
      sections,
      footY,
      save: { x: 24, y: footY + 16, w: 290, h: 44 },
      notify: { x: 330, y: footY + 16, w: 290, h: 24 },
      go,
      steps: { x: 16, y: steps.y - 6, w: WIN.w - 32, h: steps.h + 30 },
    };
  });
}

/** The Work tab's table: columns (right edges for numbers) and rows. */
const WORK = {
  strip: PANEL_BODY + 12,
  group: PANEL_BODY + 72,
  head: PANEL_BODY + 98,
  row0: PANEL_BODY + 124,
  row: 44,
  cols: {
    agent: 24,
    task: 120,
    time: 360,
    steps: 404,
    srch: 448,
    read: 498,
    progs: 552,
    tokens: 616,
  },
} as const;
const checkerTop = WORK.row0 + AGENTS.length * WORK.row + 22;

function reportLayout(ui: Ui, v: 1 | 2) {
  return memo(ui, `report${v}`, () => {
    const r = REPORT[v];
    const x = COL.x;
    const w = COL.w;
    let y = TOP + 16;
    const back = y;
    y += 34;
    const title = y;
    y += 34;
    const chips = y;
    y += 30;
    const meta = y;
    y += 26;
    const buttons = y;
    y += 46;
    const banner = v === 2 ? y : -1;
    if (v === 2) y += 78;
    const rule = y;
    y += 14;
    const bottomHead = y;
    y += 28;
    const bottom = y;
    const bottomH = layoutText(r.bottom, PF.bodyStrong, {
      measurer: ui.measurer,
      maxWidth: w,
    }).height;
    y += bottomH + 10;
    const findings = r.findings.map((f, k) => {
      const a = answerText(ui, 'm', f, x + 22, y, w - 22);
      const at = { y, h: a.h, cites: a.cites, k };
      y += a.h + 8;
      return at;
    });
    const trust = y + 4;
    const trustH = layoutText(r.trust, PF.monoSmall, { measurer: ui.measurer, maxWidth: w }).height;
    y = trust + trustH + 20;
    const overview = y;
    y += 30;
    const chartTitle = y;
    y += 26;
    const chart = { x, y, w, h: 200 };
    const cite = findings[0]?.cites['1'] ?? { x, y: bottom, w: 10, h: 14 };
    const card = { x, y: cite.y + cite.h + 10, w, h: 0 };
    const passageH = layoutText(CITATION.passage, PF.body, {
      measurer: ui.measurer,
      maxWidth: w - 46,
    }).height;
    const cardH = 14 + 20 + 26 + 22 + 14 + passageH + 18 + 40;
    // Buttons: Only you, Sources · 38, ↻ Refresh, Share, ⋯
    let bx = x;
    const btn = (text: string, withIcon = false) => {
      const bw = Math.round(ui.measure(text, PF.label) + 24 + (withIcon ? 22 : 0));
      const b = { x: bx, y: buttons, w: bw, h: 32 };
      bx += bw + 8;
      return b;
    };
    const onlyYou = btn('Only you');
    const sources = btn('Sources · 38');
    const refresh = btn('Refresh', true);
    const share = btn('Share');
    const more = { x: bx, y: buttons, w: 34, h: 32 };
    const readyW = ui.measure('Ready', PF.monoSmall) + 14;
    const version = {
      x: x + readyW + 8,
      y: chips,
      w: ui.measure(`v${v} ⌄`, PF.monoSmall) + 14,
      h: 22,
    };
    return {
      back,
      title,
      chips,
      meta,
      buttons: { onlyYou, sources, refresh, share, more },
      version,
      banner,
      rule,
      bottomHead,
      bottom,
      bottomH,
      findings,
      trust,
      overview,
      chartTitle,
      chart,
      cite,
      card: { ...card, h: cardH },
      answerBox: { x: x - 8, y: bottomHead - 8, w: w + 16, h: trust - bottomHead + 4 },
    };
  });
}

/** The Reports page: header, tabs, filters and rows (window-local). */
const LIB = {
  title: TOP + 18,
  search: TOP + 58,
  tabs: TOP + 106,
  filters: TOP + 146,
  rows: TOP + 192,
  row: 98,
} as const;
function libraryLayout(ui: Ui) {
  return memo(ui, 'lib', () => {
    const moreX = COL.x + COL.w - 12;
    const row0 = LIB.rows;
    const menu = { x: COL.x + COL.w - 170, y: row0 + 40, w: 170, h: 3 * 34 + 12 };
    const share = { x: menu.x, y: menu.y + 6 + 34, w: menu.w, h: 34 };
    const dialog = { x: 40, y: 150, w: WIN.w - 80, h: 470 };
    const input = { x: dialog.x + 24, y: dialog.y + 118, w: dialog.w - 48, h: 40 };
    const suggestion = (k: number) => ({ x: input.x, y: input.y + 50 + k * 54, w: input.w, h: 50 });
    const confirmW = Math.round(ui.measure('Share (can view)', PF.label) + 24);
    const confirm = {
      x: dialog.x + dialog.w - 24 - confirmW,
      y: dialog.y + dialog.h - 58,
      w: confirmW,
      h: 34,
    };
    const sharedText = 'Shared with 1';
    const metaPrefix = ` · ${NEW_REPORT.period} · Ready · `;
    const iconsW = NEW_REPORT.sources.length * 18 + 4;
    const sharedX = COL.x + iconsW + ui.measure(metaPrefix, PF.monoSmall);
    return {
      moreX,
      more: { x: moreX - 14, y: row0 + 10, w: 28, h: 28 },
      menu,
      share,
      dialog,
      input,
      suggestion,
      confirm,
      shared: { x: sharedX - 4, y: row0 + 64, w: ui.measure(sharedText, PF.monoSmall) + 8, h: 22 },
      row0: { x: COL.x - 14, y: row0, w: COL.w + 22, h: LIB.row },
    };
  });
}

/** A crossfade between pages of one window: which page shows at `t`, and the one before it while it fades. */
function pagesAt<K extends string>(
  t: number,
  pages: readonly { key: K; from: number }[],
  fade = 0.2,
) {
  let k = 0;
  while (k + 1 < pages.length && t >= (pages[k + 1]?.from ?? Infinity)) k++;
  const cur = pages[k];
  const prev = pages[k - 1];
  const p = cur ? clamp((t - cur.from) / fade) : 1;
  const out: { key: K; opacity: number }[] = [];
  if (prev && p < 1) out.push({ key: prev.key, opacity: 1 });
  if (cur) out.push({ key: cur.key, opacity: p });
  return out;
}

export function stationA(ui: Ui, t: number): SceneNode[] {
  const left = DESK.a - WIN.w / 2;
  const cfo = progress(t, T.b2.cfo, 0.45, easing.camera);
  const pages = pagesAt(t, [
    { key: 'chat', from: -Infinity },
    { key: 'report1', from: T.a5.open },
    { key: 'library', from: T.b1.land },
    { key: 'report2', from: T.b2.page },
    { key: 'cfo', from: T.b2.cfo },
  ] as const);
  const kids: (SceneNode | null)[] = [];
  for (const page of pages) {
    const nodes =
      page.key === 'chat'
        ? chatViewA(ui, t)
        : page.key === 'report1'
          ? reportPage(ui, 'a-r1', t, 1)
          : page.key === 'library'
            ? libraryView(ui, t)
            : page.key === 'report2'
              ? reportPage(ui, 'a-r2', t, t >= T.b2.v2 ? 2 : 1)
              : cfoView(ui, t);
    kids.push(groupNode(`a-page-${page.key}`, nodes, { opacity: page.opacity }));
  }
  // The Research workspace panel slides over the chat while the plan is reviewed and run.
  const panelIn = progress(t, T.a2.review + 0.03, 0.45, easing.enter);
  const panelOut = progress(t, T.a3.close, 0.45, easing.exit);
  if (panelIn > 0 && panelOut < 1)
    kids.push(
      groupNode('a-panel', panelA(ui, t), {
        transform: { x: WIN.w * (1 - panelIn) + WIN.w * panelOut },
      }),
    );
  kids.push(...topBar(ui, 'a-top', WIN.w));
  kids.push(...pointersA(ui, t));
  return [
    groupNode('a-tag-coo', [personTag(ui, 'a-tag', 'COO', 'CO', DESK.a, WIN.top - 30)], {
      opacity: 1 - cfo,
    }),
    ...(cfo > 0
      ? [
          groupNode('a-tag-cfo', [personTag(ui, 'a-tag2', 'CFO', 'CF', DESK.a, WIN.top - 30)], {
            opacity: cfo,
          }),
        ]
      : []),
    gridWindow('a-win', { x: left, y: WIN.top, w: WIN.w, h: WIN.h }, kids),
  ];
}

/** The COO's chat: the question and the level, the plan chip, the progress card, then the report card. */
function chatViewA(ui: Ui, t: number): SceneNode[] {
  const L = aChatLayout(ui);
  const kids: (SceneNode | null)[] = [];
  const sent = t >= T.a1.ask;
  const move = progress(t, T.a1.ask + 0.05, 0.5, easing.camera);
  const level: 1 | 3 = t >= T.a1.level ? 3 : 1;
  if (move < 1)
    kids.push(
      label(
        'a-greet',
        'What can I help you find?',
        MAIN.x + MAIN.w / 2,
        COMPOSER.greet,
        PF.greeting,
        G.ink,
        {
          align: 'center',
          opacity: 1 - clamp(move * 2),
        },
      ),
    );
  if (move > 0) {
    const top = lerp(COMPOSER.empty, CHAT_TOP, move);
    const msg = userMessage(ui, 'a-msg', Q.a, COL.x + COL.w, top, MSG_W);
    kids.push(groupNode('a-msg-o', [msg.node], { opacity: clamp(move * 2) }));
    // The plan chip: awaiting the go-ahead, then approved.
    const chipP = progress(t, T.a1.chip, 0.4, easing.enter);
    if (chipP > 0) {
      const c = L.chip;
      const approved = t >= T.a2.go;
      const review = gridButton(ui, 'a-chip-review', 'Review ›', L.review.x, L.review.y, {
        press: pressAt(t, T.a2.review),
        hover: clamp((t - (T.a2.review - 0.25)) / 0.1) * (t < T.a2.review + 0.3 ? 1 : 0),
      });
      kids.push(
        groupNode(
          'a-chip',
          [
            box('a-chip-bg', c.x, c.y, c.w, c.h, GR, {
              fill: G.panel,
              stroke: { color: G.border, width: 1 },
            }),
            icon('a-chip-ic', 'doc', c.x + 24, c.y + 25, 16, G.ink),
            label(
              'a-chip-t',
              ui.fit(
                approved ? 'Plan · v1 · 4 steps' : 'Plan · v1 · 4 steps — awaiting your go-ahead',
                PF.smallStrong,
                c.w - 56,
              ),
              c.x + 40,
              c.y + 15,
              PF.smallStrong,
              G.ink,
            ),
            review.node,
            ...(approved
              ? []
              : [
                  gridButton(
                    ui,
                    'a-chip-change',
                    'Change the plan',
                    L.review.x + L.review.w + 8,
                    L.review.y,
                    {
                      kind: 'ghost',
                    },
                  ).node,
                ]),
          ],
          { opacity: chipP, transform: { y: 8 * (1 - chipP) } },
        ),
      );
    }
    // The progress card, then the report card.
    const progressP = progress(t, T.a2.go + 0.1, 0.4, easing.enter);
    const done = progress(t, T.a5.done, 0.25, easing.enter);
    if (progressP > 0 && done < 1)
      kids.push(groupNode('a-prog-o', [progressCard(ui, t)], { opacity: progressP * (1 - done) }));
    if (done > 0) kids.push(groupNode('a-card-o', [reportCard(ui, t)], { opacity: done }));
  }
  // The composer: centred on the empty chat, at the foot once asked.
  const text = sent ? '' : typed(TYPE.a, t);
  const fit = composerFit(ui, text, COMPOSER.w, level);
  const y = sent ? lerp(COMPOSER.empty, WIN.h - 18 - COMPOSER.h, move) : COMPOSER.empty;
  const comp = composer(ui, 'a-comp', COMPOSER.x, y, COMPOSER.w, {
    text,
    t,
    focus: sent ? 0 : progress(t, TYPE.a.times[0] ?? 0, 0.15),
    level,
    press: pressAt(t, T.a1.ask),
    idle: text.length < TYPE.a.text.length ? Infinity : TYPE.a.end,
  });
  kids.push(...comp.nodes);
  // The level dropdown: opened, Level 3 picked.
  const menu =
    progress(t, T.a1.menu + 0.02, 0.2, easing.enter) *
    (1 - progress(t, T.a1.level + 0.04, 0.18, easing.exit));
  if (menu > 0) {
    const chip = composerLayout(ui, COMPOSER.x, COMPOSER.empty, COMPOSER.w, fit.h, 1).chip;
    const hover = t >= T.a1.level - 0.25 ? 3 : t >= T.a1.menu + 0.05 ? 1 : undefined;
    kids.push(levelMenu(ui, 'a-menu', chip, menu, level, hover).node);
  }
  return kids.filter((n): n is SceneNode => n !== null);
}

/** The composer's box on the COO's empty chat once the question is typed (for the pointer and the hints). */
function aComposer(ui: Ui) {
  return memo(ui, 'a-comp', () => {
    const fit = composerFit(ui, Q.a, COMPOSER.w, 1);
    const L = composerLayout(ui, COMPOSER.x, COMPOSER.empty, COMPOSER.w, fit.h, 1);
    const L3 = composerLayout(ui, COMPOSER.x, COMPOSER.empty, COMPOSER.w, fit.h, 3);
    return { h: fit.h, chip: L.chip, chip3: L3.chip, send: L3.send, menu: levelMenuBox(L.chip) };
  });
}

/** The chat's report progress card ("Researching · m:ss so far"). */
function progressCard(ui: Ui, t: number): SceneNode {
  const L = aChatLayout(ui);
  const { x, y, w } = L.card;
  const h = 236;
  const checking = t >= T.a3.steps[3];
  const writing = t >= T.a3.writing;
  const stepsDone = T.a3.steps.filter((s) => t >= s).length;
  const states: [string, 'done' | 'now' | 'next'][] = [
    ['Plan approved', 'done'],
    [`Researching · ${Math.min(stepsDone, 4)} of 4 steps done`, checking ? 'done' : 'now'],
    ['Checking', writing ? 'done' : checking ? 'now' : 'next'],
    ['Writing the report', writing ? 'now' : 'next'],
  ];
  const sections = writing ? 3 : checking ? 1 : 0;
  const kids: SceneNode[] = [
    box('a-prog-bg', x, y, w, h, GR, { fill: G.panel, stroke: { color: G.border, width: 1 } }),
    label(
      'a-prog-h',
      ui.fit(`Researching · ${mss(elapsed(t))} so far · usually 15–30 min`, PF.smallStrong, w - 32),
      x + 16,
      y + 14,
      PF.smallStrong,
      G.ink,
    ),
  ];
  states.forEach(([text, state], k) => {
    const sy = y + 46 + k * 26;
    kids.push(
      state === 'done'
        ? icon(`a-prog-s${k}`, 'check', x + 24, sy + 10, 15, G.good, { width: 2 })
        : box(`a-prog-s${k}`, x + 19, sy + 5, 10, 10, 5, {
            fill: state === 'now' ? G.ink : G.panel,
            stroke: { color: state === 'now' ? G.ink : G.faint, width: 1.2 },
            opacity: state === 'now' ? 0.55 + 0.45 * Math.sin(t * Math.PI * 2.4) : 1,
          }),
      label(`a-prog-t${k}`, text, x + 40, sy, PF.small, state === 'next' ? G.faint : G.ink),
    );
  });
  kids.push(
    label(
      'a-prog-f',
      `Report forming · ${sections} of 4 sections written`,
      x + 16,
      y + 158,
      PF.monoSmall,
      G.muted,
    ),
    gridButton(ui, 'a-prog-open', 'Open report', x + 16, y + 186).node,
    gridButton(ui, 'a-prog-stop', 'Stop', x + 16 + L.openBtn.w + 8, y + 186, {
      kind: 'ghost',
      icon: 'stop',
    }).node,
  );
  return groupNode('a-prog', kids);
}

/** The chat's report card once the run is done. */
function reportCardBox(ui: Ui): Box {
  const L = aChatLayout(ui);
  return { x: L.card.x, y: L.card.y, w: L.card.w, h: 148 };
}
function reportCardOpen(ui: Ui): Box {
  const b = reportCardBox(ui);
  return { x: b.x + 16, y: b.y + 100, w: ui.measure('Open report', PF.label) + 24, h: 34 };
}
function reportCard(ui: Ui, t: number): SceneNode {
  const b = reportCardBox(ui);
  const open = reportCardOpen(ui);
  const meta = ['4 sections · 1 chart · 38 sources in the report', '19 min · checked'] as const;
  return groupNode('a-card', [
    box('a-card-bg', b.x, b.y, b.w, b.h, GR, {
      fill: G.panel,
      stroke: { color: G.border, width: 1 },
    }),
    icon('a-card-ic', 'doc', b.x + 24, b.y + 26, 16, G.ink),
    label('a-card-t', REPORT_TITLE, b.x + 40, b.y + 14, PF.bodyStrong, G.ink),
    label('a-card-m1', meta[0], b.x + 16, b.y + 48, PF.monoSmall, G.muted),
    label('a-card-m2', meta[1], b.x + 16, b.y + 66, PF.monoSmall, G.muted),
    gridButton(ui, 'a-card-open', 'Open report', open.x, open.y, {
      kind: 'primary',
      press: pressAt(t, T.a5.open),
    }).node,
    gridButton(ui, 'a-card-copy', 'Copy link', open.x + open.w + 8, open.y, { icon: 'link' }).node,
  ]);
}

/** The Research workspace panel: Plan, Work and Sources tabs. */
function panelA(ui: Ui, t: number): SceneNode[] {
  const toWork = progress(t, T.a2.work, 0.3, easing.camera);
  const tabNames = ['Plan', 'Work', 'Sources'];
  const tb = tabs(ui, 'a-p-tabs', tabNames, 24, PANEL_TOP + PANEL.head + 2, toWork > 0.5 ? 1 : 0);
  const kids: SceneNode[] = [
    box('a-p-bg', 0, PANEL_TOP, WIN.w, WIN.h - PANEL_TOP, 0, { fill: G.panel }),
    box('a-p-edge', 0, PANEL_TOP, 1, WIN.h - PANEL_TOP, 0, { fill: G.border }),
    label('a-p-title', 'Research workspace', 24, PANEL_TOP + 14, PF.heading, G.ink),
    icon('a-p-close', 'close', WIN.w - 30, PANEL_TOP + 25, 18, G.muted),
    tb.node,
    hairline('a-p-rule', 0, PANEL_BODY - 1, WIN.w),
  ];
  if (toWork < 1)
    kids.push(groupNode('a-plan', planView(ui, t), { opacity: 1 - clamp(toWork * 2) }));
  if (toWork > 0)
    kids.push(groupNode('a-work', workView(ui, t), { opacity: clamp(toWork * 2 - 1) }));
  return kids;
}

/** The Plan tab: the proposed plan in the product's sections, with Save as a report and Go ahead. */
function planView(ui: Ui, t: number): SceneNode[] {
  const P = planLayout(ui);
  const w = WIN.w - 48;
  const unfold = (k: number) => {
    const p = progress(t, T.a2.review + 0.12 + k * 0.03, 0.3, easing.enter);
    return { opacity: p, transform: { y: 8 * (1 - p) } };
  };
  const v1 = monoChip(ui, 'a-plan-v', 'v1', 24, P.vrow);
  const kids: SceneNode[] = [
    groupNode(
      'a-plan-head',
      [
        label('a-plan-k', 'Proposed plan', 24, P.kicker, PF.monoSmall, G.faint),
        label('a-plan-title', REPORT_TITLE, 24, P.title, PF.title, G.ink),
        v1.node,
        label(
          'a-plan-go',
          'Nothing runs until you say go',
          24 + v1.w + 10,
          P.vrow + 1,
          PF.small,
          G.muted,
        ),
      ],
      unfold(0),
    ),
  ];
  P.sections.forEach((s, k) => {
    const body: SceneNode[] = [label(`a-plan-s${k}`, s.title, 24, s.y, PF.smallStrong, G.ink)];
    const para = (text: string) =>
      textNode(`a-plan-b${k}`, {
        text,
        font: PF.small,
        fill: G.muted,
        maxWidth: w,
        transform: { x: 24, y: s.bodyY },
      });
    if (k === 0) body.push(para(PLAN.asked));
    if (k === 1) body.push(para(PLAN.scope));
    if (k === 2) body.push(para(PLAN.who));
    if (k === 3)
      PLAN.measures.forEach(([name, meaning], j) =>
        body.push(
          label(`a-plan-m${j}`, `${name} — ${meaning}`, 24, s.bodyY + j * 21, PF.small, G.muted),
        ),
      );
    if (k === 4)
      PLAN.steps.forEach(([who, what], j) => {
        const y = s.bodyY + j * 28;
        const pill = monoChip(ui, `a-plan-p${j}`, who, 24, y);
        body.push(pill.node, label(`a-plan-st${j}`, what, 124, y + 1, PF.small, G.ink));
      });
    if (k === 5) body.push(para(PLAN.limits));
    kids.push(groupNode(`a-plan-sec${k}`, body, unfold(k + 1)));
  });
  // The footer stays put over the plan: save it as a report, then go ahead.
  const saved = progress(t, T.a2.save, 0.12, easing.snap);
  kids.push(
    groupNode(
      'a-plan-foot',
      [
        box('a-plan-fbg', 0, P.footY, WIN.w, WIN.h - P.footY, 0, { fill: G.panel }),
        hairline('a-plan-frule', 0, P.footY, WIN.w),
        checkbox(
          'a-save',
          P.save.x,
          P.save.y,
          saved,
          'Save as a report',
          'A page you can share and come back to.',
        ),
        checkbox('a-notify', P.notify.x, P.notify.y, 1, 'Notify me when it pauses or is ready'),
        label('a-reply', 'Reply in chat to change the plan', 24, P.go.y + 7, PF.small, G.muted),
        label(
          'a-plan-count',
          '4 steps · 3 sources',
          P.go.x - 12,
          P.go.y + 8,
          PF.monoSmall,
          G.muted,
          { align: 'right' },
        ),
        gridButton(ui, 'a-go', 'Go ahead', P.go.x, P.go.y, {
          kind: 'primary',
          press: pressAt(t, T.a2.go),
        }).node,
        ...[clickRing('a-ring-save', P.save.x + 9, P.save.y + 11, t, T.a2.save)].filter(
          (n): n is SceneNode => n !== null,
        ),
      ],
      unfold(7),
    ),
  );
  return kids;
}

/** The Work tab: the run strip (elapsed, Stop) and the agents at work, as columns. */
function workView(ui: Ui, t: number): SceneNode[] {
  const c = WORK.cols;
  const r = researched(t);
  const checking = t >= T.a3.steps[3];
  const kids: SceneNode[] = [
    box('a-w-strip', 16, WORK.strip, WIN.w - 32, 44, GR, {
      fill: G.page,
      stroke: { color: G.border, width: 1 },
    }),
    label('a-w-el', 'Elapsed', 30, WORK.strip + 12, PF.small, G.muted),
    label(
      'a-w-clock',
      mss(elapsed(t)),
      30 + ui.measure('Elapsed ', PF.small),
      WORK.strip + 12,
      PF.mono,
      G.ink,
    ),
    label(
      'a-w-run',
      'running',
      30 + ui.measure('Elapsed ', PF.small) + ui.measure(mss(elapsed(t)), PF.mono) + 8,
      WORK.strip + 12,
      PF.small,
      G.muted,
    ),
    gridButton(ui, 'a-w-stop', 'Stop', WIN.w - 30 - 82, WORK.strip + 6, { icon: 'stop', h: 32 })
      .node,
    label('a-w-g', checking ? 'Done · 4' : 'Working · 4', 24, WORK.group, PF.smallStrong, G.ink),
  ];
  const head = (y: number, id: string) => {
    const cols: [string, number, 'left' | 'right'][] = [
      ['agent', c.agent, 'left'],
      ['task', c.task, 'left'],
      ['time', c.time, 'right'],
      ['steps', c.steps, 'right'],
      ['srch', c.srch, 'right'],
      ['read', c.read, 'right'],
      ['progs', c.progs, 'right'],
      ['tokens', c.tokens, 'right'],
    ];
    return [
      ...cols.map(([name, x, align]) =>
        label(`${id}-${name}`, name, x, y, PF.monoSmall, G.faint, { align }),
      ),
      hairline(`${id}-rule`, 16, y + 22, WIN.w - 32),
    ];
  };
  kids.push(...head(WORK.head, 'a-w-h'));
  const row = (
    id: string,
    y: number,
    a: { agent: string; task: string },
    v: (string | number)[],
  ) => {
    const [time, steps, srch, read, progs, tokens] = v;
    return [
      label(`${id}-a`, a.agent, c.agent, y + 12, PF.monoSmall, G.ink),
      label(
        `${id}-t`,
        ui.fit(a.task, PF.small, c.time - c.task - 44),
        c.task,
        y + 11,
        PF.small,
        G.ink,
      ),
      label(`${id}-time`, String(time), c.time, y + 12, PF.monoSmall, G.ink, { align: 'right' }),
      label(`${id}-steps`, String(steps), c.steps, y + 12, PF.monoSmall, G.ink, { align: 'right' }),
      label(`${id}-srch`, String(srch), c.srch, y + 12, PF.monoSmall, G.ink, { align: 'right' }),
      label(`${id}-read`, String(read), c.read, y + 12, PF.monoSmall, G.ink, { align: 'right' }),
      label(`${id}-progs`, String(progs), c.progs, y + 12, PF.monoSmall, G.ink, { align: 'right' }),
      label(`${id}-tok`, String(tokens), c.tokens, y + 12, PF.monoSmall, G.ink, { align: 'right' }),
      hairline(`${id}-rule`, 16, y + WORK.row - 1, WIN.w - 32),
    ];
  };
  const runTime = (k: number) => elapsed(Math.min(t, T.a3.steps[3])) - 6 * k;
  AGENTS.forEach((a, k) => {
    const pace = clamp(r * (1 + 0.06 * (k - 2)));
    const at = (pair: readonly [number, number]) => Math.round(lerp(pair[0], pair[1], pace));
    kids.push(
      ...row(`a-w-r${k}`, WORK.row0 + k * WORK.row, a, [
        mss(k === 0 ? elapsed(t) : runTime(k)),
        at(a.steps),
        at(a.srch),
        grouped(at(a.read)),
        at(a.progs),
        `${at(a.tokens)}k`,
      ]),
    );
  });
  // The Checker joins once the researchers are done.
  const check = progress(t, T.a3.steps[3], 0.4, easing.enter);
  if (check > 0) {
    const cp = clamp((t - T.a3.steps[3]) / (T.a5.done - T.a3.steps[3]));
    kids.push(
      groupNode(
        'a-w-check',
        [
          label('a-w-g2', 'Working · 1', 24, checkerTop, PF.smallStrong, G.ink),
          ...row('a-w-c', checkerTop + 24, CHECKER, [
            mss(elapsed(t) - elapsed(T.a3.steps[3])),
            Math.round(lerp(1, 8, cp)),
            0,
            Math.round(lerp(4, 38, cp)),
            0,
            `${Math.round(lerp(3, 52, cp))}k`,
          ]),
        ],
        { opacity: check, transform: { y: 8 * (1 - check) } },
      ),
    );
  }
  return kids;
}

/** A report page: back link, title, Ready, the meta line, buttons, the bottom line, findings, trust line, chart. */
function reportPage(ui: Ui, id: string, t: number, v: 1 | 2): SceneNode[] {
  const L = reportLayout(ui, v);
  const r = REPORT[v];
  const x = COL.x;
  const w = COL.w;
  const B = L.buttons;
  const kids: SceneNode[] = [
    icon(`${id}-back-i`, 'back', x + 8, L.back + 10, 15, G.muted),
    label(`${id}-back`, 'Back to the conversation', x + 22, L.back, PF.label, G.muted),
    label(`${id}-title`, REPORT_TITLE, x, L.title, PF.title, G.ink),
    monoChip(ui, `${id}-ready`, 'Ready', x, L.chips, 'good').node,
    monoChip(ui, `${id}-v`, `v${v} ⌄`, L.version.x, L.version.y).node,
    label(`${id}-meta`, ui.fit(r.meta, PF.monoSmall, w), x, L.meta, PF.monoSmall, G.muted),
    gridButton(ui, `${id}-only`, 'Only you', B.onlyYou.x, B.onlyYou.y, { h: 32 }).node,
    gridButton(ui, `${id}-src`, 'Sources · 38', B.sources.x, B.sources.y, { h: 32 }).node,
    gridButton(ui, `${id}-ref`, 'Refresh', B.refresh.x, B.refresh.y, {
      icon: 'refresh',
      h: 32,
      press: pressAt(t, T.b2.refresh),
      hover:
        id === 'a-r2'
          ? clamp((t - (T.b2.refresh - 0.25)) / 0.1) * (t < T.b2.refresh + 0.3 ? 1 : 0)
          : 0,
    }).node,
    gridButton(ui, `${id}-share`, 'Share', B.share.x, B.share.y, { h: 32 }).node,
    box(`${id}-more`, B.more.x, B.more.y, B.more.w, B.more.h, GR, {
      fill: G.panel,
      stroke: { color: G.border, width: 1 },
    }),
    icon(`${id}-more-i`, 'more', B.more.x + 17, B.more.y + 16, 18, G.ink, { width: 2.6 }),
  ];
  if (v === 2) {
    kids.push(
      box(`${id}-banner`, x, L.banner, w, 64, GR, {
        fill: G.page,
        stroke: { color: G.border, width: 1 },
      }),
      label(
        `${id}-banner-t`,
        'What changed since the previous version',
        x + 14,
        L.banner + 10,
        PF.smallStrong,
        G.ink,
      ),
      label(
        `${id}-banner-s`,
        'Updated for 1 Jul–30 Sep · 3 findings changed',
        x + 14,
        L.banner + 34,
        PF.small,
        G.muted,
      ),
    );
  }
  kids.push(
    hairline(`${id}-rule`, x, L.rule, w),
    label(`${id}-bl`, 'Bottom line', x, L.bottomHead, PF.heading, G.ink),
    textNode(`${id}-blt`, {
      text: r.bottom,
      font: PF.bodyStrong,
      fill: G.ink,
      maxWidth: w,
      transform: { x, y: L.bottom },
    }),
  );
  const hot = id === 'a-r1' ? progress(t, T.a5.cite - 0.2, 0.1) : 0;
  L.findings.forEach((f, k) => {
    const c = f.cites[String(k + 1)];
    if (k === 0 && c && hot > 0)
      kids.push(
        box(`${id}-hot`, c.x - 1, c.y - 1, c.w + 2, c.h + 2, 2, { fill: G.selected, opacity: hot }),
      );
    kids.push(
      label(`${id}-fn${k}`, `${k + 1}.`, x, f.y, PF.body, G.muted),
      answerText(ui, `${id}-f${k}`, r.findings[k] ?? '', x + 22, f.y, w - 22).node,
    );
  });
  kids.push(
    textNode(`${id}-trust`, {
      text: r.trust,
      font: PF.monoSmall,
      fill: G.muted,
      maxWidth: w,
      transform: { x, y: L.trust },
    }),
    label(`${id}-ov`, 'Overview', x, L.overview, PF.heading, G.ink),
    label(`${id}-ct`, r.chart, x, L.chartTitle, PF.smallStrong, G.ink),
    barChart(
      ui,
      `${id}-chart`,
      L.chart,
      r.bars,
      10,
      v === 1 ? progress(t, T.a5.bars, 0.8, easing.enter) : 1,
    ),
  );
  // The citation card: the email behind finding 1, its exact passage.
  const card = id === 'a-r1' ? progress(t, T.a5.cite + 0.03, 0.3, easing.enter) : 0;
  if (card > 0) kids.push(citationCard(ui, `${id}-cite`, L.card, card));
  return kids;
}

/** The report's citation card: where the line came from, and the line itself. */
function citationCard(ui: Ui, id: string, b: Box, p: number): SceneNode {
  const passageH = layoutText(CITATION.passage, PF.body, {
    measurer: ui.measurer,
    maxWidth: b.w - 46,
  }).height;
  const py = b.y + 84;
  return groupNode(
    id,
    [
      box(`${id}-bg`, b.x, b.y, b.w, b.h, GR + 2, {
        fill: G.panel,
        stroke: { color: G.border, width: 1 },
        shadow: elevationShadows(lighting, 'mid', { strength: 0.7 }),
      }),
      label(`${id}-k`, CITATION.kind, b.x + 16, b.y + 14, PF.monoSmall, G.faint),
      label(`${id}-t`, CITATION.title, b.x + 16, b.y + 34, PF.smallStrong, G.ink),
      label(`${id}-f`, CITATION.from, b.x + 16, b.y + 56, PF.small, G.muted),
      box(`${id}-bar`, b.x + 16, py, 3, passageH, 1.5, { fill: G.ink }),
      textNode(`${id}-p`, {
        text: CITATION.passage,
        font: PF.body,
        fill: G.ink,
        maxWidth: b.w - 46,
        transform: { x: b.x + 30, y: py },
      }),
      hairline(`${id}-rule`, b.x, b.y + b.h - 40, b.w),
      label(`${id}-c`, CITATION.cited, b.x + 16, b.y + b.h - 29, PF.monoSmall, G.faint),
      label(`${id}-o`, CITATION.open, b.x + b.w - 38, b.y + b.h - 30, PF.mono, G.ink, {
        align: 'right',
      }),
      icon(`${id}-o-i`, 'external', b.x + b.w - 24, b.y + b.h - 21, 14, G.ink),
    ],
    {
      opacity: clamp(p * 1.6),
      transform: {
        x: b.x,
        y: b.y + 6 * (1 - p),
        scale: lerp(0.98, 1, p),
        originX: b.x,
        originY: b.y,
      },
    },
  );
}

/** The Reports page: search, tabs, filters, rows; the ⋯ menu, the Share dialog and its toast. */
function libraryView(ui: Ui, t: number): SceneNode[] {
  const LL = libraryLayout(ui);
  const x = COL.x;
  const w = COL.w;
  const kids: SceneNode[] = [
    label('a-l-title', 'Reports', x, LIB.title, PF.title, G.ink),
    box('a-l-search', x, LIB.search, w, 38, GR, {
      fill: G.panel,
      stroke: { color: G.border, width: 1 },
    }),
    icon('a-l-search-i', 'search', x + 18, LIB.search + 19, 15, G.faint),
    label(
      'a-l-search-t',
      'Search titles, headings, bottom lines…',
      x + 34,
      LIB.search + 9,
      PF.small,
      G.faint,
    ),
    tabs(ui, 'a-l-tabs', ['All', 'Mine', 'Shared with me'], x, LIB.tabs, 0).node,
  ];
  let fx = x;
  ['Status', 'Date', 'Shared by', 'Sort'].forEach((f, k) => {
    const b = gridButton(ui, `a-l-f${k}`, `${f} ⌄`, fx, LIB.filters, { h: 30 });
    kids.push(b.node);
    fx += b.w + 8;
  });
  kids.push(hairline('a-l-rule', MAIN.x, LIB.rows - 6, MAIN.w));
  const shared = t >= T.b1.toast;
  const rows = [
    { ...NEW_REPORT, shared: shared ? 'Shared with 1' : 'Only you', fresh: true },
    ...LIBRARY.map((r) => ({ ...r, fresh: false })),
  ];
  rows.forEach((row, k) => {
    const y = LIB.rows + k * LIB.row;
    if (y > WIN.h) return;
    const id = `a-l-r${k}`;
    kids.push(
      ...(row.fresh ? [box(`${id}-dot`, x - 14, y + 20, 7, 7, 3.5, { fill: G.link })] : []),
      label(`${id}-t`, ui.fit(row.title, PF.bodyStrong, w - 110), x, y + 12, PF.bodyStrong, G.ink),
      miniChart(`${id}-chart`, x + w - 96, y + 14, row.trend),
      icon(`${id}-more`, 'more', LL.moreX, y + 24, 18, G.muted, { width: 2.6 }),
      label(`${id}-b`, ui.fit(row.bottom, PF.small, w), x, y + 40, PF.small, G.muted),
    );
    let mx = x;
    row.sources.forEach((s, j) => {
      kids.push(
        icon(
          `${id}-s${j}`,
          s === 'mail' ? 'mail' : s === 'chat' ? 'chat' : 'doc',
          mx + 7,
          y + 75,
          14,
          G.muted,
        ),
      );
      mx += 18;
    });
    kids.push(
      label(
        `${id}-m`,
        ui.fit(
          ` · ${row.period} · Ready · ${row.shared} · ${row.date}`,
          PF.monoSmall,
          w - (mx - x),
        ),
        mx + 4,
        y + 66,
        PF.monoSmall,
        G.muted,
      ),
      hairline(`${id}-rule`, MAIN.x, y + LIB.row - 6, MAIN.w),
    );
  });
  // The row's ⋯ menu, with Share.
  const menu =
    progress(t, T.b1.more + 0.02, 0.18, easing.enter) *
    (1 - progress(t, T.b1.share + 0.04, 0.15, easing.exit));
  if (menu > 0) {
    const m = LL.menu;
    kids.push(
      groupNode(
        'a-l-menu',
        [
          box('a-l-menu-bg', m.x, m.y, m.w, m.h, GR + 2, {
            fill: G.panel,
            stroke: { color: G.border, width: 1 },
            shadow: elevationShadows(lighting, 'mid', { strength: 0.6 }),
          }),
          ...(t >= T.b1.share - 0.25
            ? [box('a-l-menu-on', m.x + 6, LL.share.y, m.w - 12, 34, GR, { fill: G.hover })]
            : []),
          ...['Open', 'Share', 'Copy link'].map((item, k) =>
            label(`a-l-menu-${k}`, item, m.x + 18, m.y + 12 + k * 34, PF.label, G.ink),
          ),
        ],
        { opacity: clamp(menu * 1.6) },
      ),
    );
  }
  // The Share dialog: people in your company, by name or email.
  const dlg =
    progress(t, T.b1.share + 0.04, 0.25, easing.enter) *
    (1 - progress(t, T.b1.confirm + 0.03, 0.2, easing.exit));
  if (dlg > 0) kids.push(shareDialog(ui, t, dlg));
  const tp =
    progress(t, T.b1.toast, 0.35, easing.enter) *
    (1 - progress(t, T.b1.toastEnd, 0.3, easing.exit));
  if (tp > 0)
    kids.push(
      toast(
        ui,
        'a-toast',
        ['Shared with Priya Raman.', "They'll find it under Shared with me."],
        ['Copy link', 'Tell them in Teams'],
        WIN,
        tp,
      ).node,
    );
  return kids;
}

function shareDialog(ui: Ui, t: number, p: number): SceneNode {
  const LL = libraryLayout(ui);
  const d = LL.dialog;
  const typedShare = SHARE_TYPED.text.slice(
    0,
    SHARE_TYPED.times.filter((at) => t >= T.b1.type + at).length,
  );
  const picked = t >= T.b1.cfo;
  const kids: SceneNode[] = [
    label('a-sh-title', 'Share', d.x + 24, d.y + 22, PF.title, G.ink),
    label('a-sh-sub', REPORT_TITLE, d.x + 24, d.y + 56, PF.small, G.muted),
    label('a-sh-people', 'People in your company', d.x + 24, d.y + 92, PF.smallStrong, G.ink),
    box('a-sh-input', LL.input.x, LL.input.y, LL.input.w, LL.input.h, GR, {
      fill: G.panel,
      stroke: { color: G.ink, width: 1.5 },
    }),
  ];
  let ix = LL.input.x + 12;
  if (picked) {
    const chip = monoChip(ui, 'a-sh-chip', 'Priya Raman ×', ix, LL.input.y + 9);
    kids.push(chip.node);
    ix += chip.w + 8;
  } else if (typedShare.length > 0) {
    kids.push(label('a-sh-typed', typedShare, ix, LL.input.y + 9, PF.body, G.ink));
    ix += ui.measure(typedShare, PF.body) + 1;
  } else {
    kids.push(label('a-sh-ph', 'Name or email', ix, LL.input.y + 9, PF.body, G.faint));
  }
  if (!picked) {
    const caretNode = caret(
      'a-sh-caret',
      ix,
      LL.input.y + 10,
      20,
      t,
      typedShare.length < 3 ? Infinity : T.b1.type + 0.3,
      G.ink,
    );
    if (caretNode) kids.push(caretNode);
  }
  // Suggestions as the name is typed (initials appear only here).
  if (!picked && typedShare.length >= 2) {
    SUGGESTIONS.forEach((s, k) => {
      const b = LL.suggestion(k);
      const hover = k === 0 ? clamp((t - (T.b1.cfo - 0.25)) / 0.1) : 0;
      kids.push(
        ...(hover > 0
          ? [box(`a-sh-s${k}-on`, b.x, b.y, b.w, b.h, GR, { fill: G.hover, opacity: hover })]
          : []),
        box(`a-sh-s${k}-av`, b.x + 8, b.y + 9, 32, 32, 16, {
          fill: G.selected,
          stroke: { color: G.border, width: 1 },
        }),
        label(`a-sh-s${k}-i`, s.initials, b.x + 24, b.y + 16, PF.monoSmall, G.ink, {
          align: 'center',
        }),
        label(`a-sh-s${k}-n`, s.name, b.x + 52, b.y + 5, PF.label, G.ink),
        label(
          `a-sh-s${k}-e`,
          ui.fit(`${s.email} · ${s.job}`, PF.small, b.w - 60),
          b.x + 52,
          b.y + 26,
          PF.small,
          G.muted,
        ),
      );
    });
  }
  const whoY = LL.suggestion(2).y + 10;
  kids.push(
    label('a-sh-who', 'Who has access', d.x + 24, whoY, PF.smallStrong, G.ink),
    plainAvatar('a-sh-owner-av', d.x + 40, whoY + 44, 14),
    label('a-sh-owner', 'Dana Ortiz (you)', d.x + 64, whoY + 33, PF.label, G.ink),
    label('a-sh-owner-r', 'Owner', d.x + d.w - 24, whoY + 34, PF.small, G.muted, {
      align: 'right',
    }),
    hairline('a-sh-rule', d.x, d.y + d.h - 74, d.w),
    gridButton(ui, 'a-sh-copy', 'Copy link', d.x + 16, LL.confirm.y, {
      kind: 'ghost',
      icon: 'link',
    }).node,
    gridButton(
      ui,
      'a-sh-done',
      'Done',
      LL.confirm.x - 8 - Math.round(ui.measure('Done', PF.label) + 24),
      LL.confirm.y,
    ).node,
    gridButton(ui, 'a-sh-go', 'Share (can view)', LL.confirm.x, LL.confirm.y, {
      kind: 'primary',
      press: pressAt(t, T.b1.confirm),
    }).node,
  );
  return dialog('a-share', WIN, d, p, kids);
}

/** The CFO's chat: an answer that cites the COO's report. */
function cfoView(ui: Ui, t: number): SceneNode[] {
  const pop = progress(t, T.b2.cite + 0.03, 0.25, easing.enter);
  const kids: SceneNode[] = [
    ...chatNodes(ui, 'a-cfo', CFO_CHAT, {
      shown: Infinity,
      extras: 1,
      pills: true,
      hot: '1',
      hotP: Math.max(pop, clamp((t - (T.b2.cite - 0.25)) / 0.1)),
    }),
    ...composer(ui, 'a-cfo-comp', COMPOSER.x, WIN.h - 18 - COMPOSER.h, COMPOSER.w, {
      text: '',
      t,
      focus: 0,
      level: 1,
    }).nodes,
  ];
  if (pop > 0) kids.push(popover(ui, 'a-cfo-pop', cfoPopover(ui), pop, CFO_SOURCE));
  return kids;
}
const CFO_SOURCE = { title: REPORT_TITLE, body: '', foot: 'Report · Open' } as const;
const cfoPopover = (ui: Ui) => citePopoverBox(ui, CFO_CHAT, '1', '');

/** The refresh confirmation over the report page. */
const CONFIRM = { x: 40, y: 250, w: WIN.w - 80, h: 236 } as const;
function refreshConfirm(ui: Ui, t: number, p: number): SceneNode {
  const d = CONFIRM;
  const yesW = Math.round(ui.measure('Refresh', PF.label) + 24);
  const yes = { x: d.x + d.w - 24 - yesW, y: d.y + d.h - 58 };
  return dialog('a-confirm', WIN, d, p, [
    label('a-cf-t', 'Refresh this report?', d.x + 24, d.y + 22, PF.heading, G.ink),
    textNode('a-cf-b', {
      text: 'The saved plan runs again on today’s data (usually 15–30 min) and fills a new version on the same link. This version stays readable.',
      font: PF.body,
      fill: G.muted,
      maxWidth: d.w - 48,
      transform: { x: d.x + 24, y: d.y + 58 },
    }),
    gridButton(
      ui,
      'a-cf-no',
      'Cancel',
      yes.x - 8 - Math.round(ui.measure('Cancel', PF.label) + 24),
      yes.y,
    ).node,
    gridButton(ui, 'a-cf-yes', 'Refresh', yes.x, yes.y, {
      kind: 'primary',
      press: pressAt(t, T.b2.yes),
    }).node,
  ]);
}
const confirmYes = (ui: Ui) => {
  const yesW = Math.round(ui.measure('Refresh', PF.label) + 24);
  return { x: CONFIRM.x + CONFIRM.w - 24 - yesW, y: CONFIRM.y + CONFIRM.h - 58, w: yesW, h: 34 };
};

/** The versions menu under the version chip (v2 · 30 Sep, v1 · 30 Jun). */
function versionsMenu(ui: Ui, p: number): SceneNode {
  const L = reportLayout(ui, 2);
  const b = { x: L.version.x, y: L.version.y + 28, w: 200, h: 84 };
  return groupNode(
    'a-versions',
    [
      box('a-ver-bg', b.x, b.y, b.w, b.h, GR + 2, {
        fill: G.panel,
        stroke: { color: G.border, width: 1 },
        shadow: elevationShadows(lighting, 'mid', { strength: 0.6 }),
      }),
      box('a-ver-on', b.x + 6, b.y + 6, b.w - 12, 34, GR, { fill: G.hover }),
      label('a-ver-2', 'v2 · 30 Sep', b.x + 16, b.y + 14, PF.mono, G.ink),
      icon('a-ver-ck', 'check', b.x + b.w - 24, b.y + 23, 15, G.ink),
      label('a-ver-1', 'v1 · 30 Jun', b.x + 16, b.y + 50, PF.mono, G.muted),
    ],
    {
      opacity: clamp(p * 1.6),
      transform: { x: b.x, y: b.y - 6 * (1 - p), originX: b.x, originY: b.y },
    },
  );
}
const versionsBox = (ui: Ui): Box => {
  const L = reportLayout(ui, 2);
  return { x: L.version.x, y: L.version.y, w: 200, h: 112 };
};

/** Every pointer on the COO's (and then the CFO's) screen. */
function pointersA(ui: Ui, t: number): SceneNode[] {
  const out: (SceneNode | null)[] = [];
  const AC = aComposer(ui);
  const chipC = { x: AC.chip.x + AC.chip.w / 2, y: AC.chip.y + 13 };
  const level3 = { x: AC.menu.x + 120, y: AC.menu.y + 8 + 58 + 27 };
  const send = { x: AC.send.x + 16, y: AC.send.y + 16 };
  const pa = pointer(
    t,
    [
      { at: T.a1.cursor, x: 540, y: 640 },
      { at: T.a1.menu - 0.04, ...chipC },
      { at: T.a1.level - 0.04, ...level3 },
      { at: T.a1.ask - 0.04, ...send },
    ],
    T.a1.ask + 0.4,
  );
  if (pa)
    out.push(
      cursor(
        'a-cursor1',
        pa.x,
        pa.y,
        Math.max(pressAt(t, T.a1.menu), pressAt(t, T.a1.level), pressAt(t, T.a1.ask)),
        pa.opacity,
      ),
    );
  out.push(
    clickRing('a-ring-menu', chipC.x, chipC.y, t, T.a1.menu),
    clickRing('a-ring-lvl', level3.x, level3.y, t, T.a1.level),
  );
  // The plan: Review, then Save as a report, then Go ahead.
  const L = aChatLayout(ui);
  const P = planLayout(ui);
  const pb = pointer(
    t,
    [
      { at: T.a2.cursor, x: 560, y: 700 },
      { at: T.a2.review - 0.04, x: L.review.x + 40, y: L.review.y + 18 },
      { at: T.a2.save - 0.05, x: P.save.x + 9, y: P.save.y + 11 },
      { at: T.a2.go - 0.05, x: P.go.x + P.go.w / 2, y: P.go.y + 18 },
    ],
    T.a2.go + 0.35,
  );
  if (pb)
    out.push(
      cursor(
        'a-cursor2',
        pb.x,
        pb.y,
        Math.max(pressAt(t, T.a2.review), pressAt(t, T.a2.save), pressAt(t, T.a2.go)),
        pb.opacity,
      ),
    );
  // The report: open it from its card, then a citation.
  const open = reportCardOpen(ui);
  const R1 = reportLayout(ui, 1);
  const cite = { x: R1.cite.x + R1.cite.w / 2, y: R1.cite.y + 7 };
  const pd = pointer(
    t,
    [
      { at: T.a5.cursor, x: 520, y: 640 },
      { at: T.a5.open - 0.04, x: open.x + open.w / 2, y: open.y + 18 },
      { at: T.a5.citeCursor, x: 480, y: R1.cite.y + 90 },
      { at: T.a5.cite - 0.04, ...cite },
    ],
    T.a5.cite + 0.5,
  );
  if (pd)
    out.push(
      cursor(
        'a-cursor3',
        pd.x,
        pd.y,
        Math.max(pressAt(t, T.a5.open), pressAt(t, T.a5.cite)),
        pd.opacity,
      ),
    );
  out.push(clickRing('a-ring-cite', cite.x, cite.y, t, T.a5.cite));
  // Reports: the row's ⋯, Share, the CFO, Share (can view).
  const LL = libraryLayout(ui);
  const sug = LL.suggestion(0);
  const pc = pointer(
    t,
    [
      { at: T.b1.cursor, x: 300, y: 500 },
      { at: T.b1.more - 0.04, x: LL.moreX, y: LL.more.y + 14 },
      { at: T.b1.share - 0.04, x: LL.share.x + 60, y: LL.share.y + 17 },
      { at: T.b1.cfo - 0.04, x: sug.x + 160, y: sug.y + 25 },
      { at: T.b1.confirm - 0.04, x: LL.confirm.x + LL.confirm.w / 2, y: LL.confirm.y + 18 },
    ],
    T.b1.confirm + 0.4,
  );
  if (pc)
    out.push(
      cursor(
        'a-cursor4',
        pc.x,
        pc.y,
        Math.max(
          pressAt(t, T.b1.more),
          pressAt(t, T.b1.share),
          pressAt(t, T.b1.cfo),
          pressAt(t, T.b1.confirm),
        ),
        pc.opacity,
      ),
    );
  // Next quarter: Refresh, confirm it, the versions menu; then the CFO opens the citation.
  const R2 = reportLayout(ui, 2);
  const refresh = R1.buttons.refresh;
  const yes = confirmYes(ui);
  const cfoCite = chatLayout(ui, CFO_CHAT).cites['1'] ?? { x: COL.x, y: 200, w: 10, h: 14 };
  const pe = pointer(
    t,
    [
      { at: T.b2.cursor, x: 520, y: 600 },
      { at: T.b2.refresh - 0.04, x: refresh.x + refresh.w / 2, y: refresh.y + 16 },
      { at: T.b2.yes - 0.04, x: yes.x + yes.w / 2, y: yes.y + 18 },
      { at: T.b2.menu - 0.04, x: R2.version.x + R2.version.w / 2, y: R2.version.y + 11 },
      { at: T.b2.cite - 0.04, x: cfoCite.x + cfoCite.w / 2, y: cfoCite.y + 7 },
    ],
    T.b2.cite + 0.6,
  );
  if (pe)
    out.push(
      cursor(
        'a-cursor5',
        pe.x,
        pe.y,
        Math.max(
          pressAt(t, T.b2.refresh),
          pressAt(t, T.b2.yes),
          pressAt(t, T.b2.menu),
          pressAt(t, T.b2.cite),
        ),
        pe.opacity,
      ),
    );
  // The refresh confirmation and the versions menu sit over the report page.
  const confirmP =
    progress(t, T.b2.confirm, 0.25, easing.enter) *
    (1 - progress(t, T.b2.yes + 0.02, 0.15, easing.exit));
  if (confirmP > 0) out.unshift(refreshConfirm(ui, t, confirmP));
  const ver =
    progress(t, T.b2.menu + 0.02, 0.2, easing.enter) *
    (1 - progress(t, T.b2.menuEnd, 0.15, easing.exit));
  if (ver > 0) out.unshift(versionsMenu(ui, ver));
  return out.filter((n): n is SceneNode => n !== null);
}

// ---------------------------------------------------------------------------
// D: the HR head and the intern, one above the other
// ---------------------------------------------------------------------------

const D_CHAT: Record<'hr' | 'intern', ChatSpec> = {
  hr: {
    key: 'hr',
    question: Q.d,
    answer:
      "This year's revision averaged *7.2%*, effective 1 April.[1] Bands 3 to 5 rose 8 to 10%, and 412 people were included.[2]",
    meta: { confidence: 'High', reason: 'Pay policy and committee notes agree.', sources: 2 },
    top: TOP + 14,
  },
  intern: {
    key: 'intern',
    question: Q.d,
    answer:
      "I didn't find this year's salary revisions in the items your access covers. Other items may exist that you can open in SharePoint.",
    meta: { confidence: 'Low', reason: 'No items in your access answer this.', sources: 0 },
    top: TOP + 14,
  },
};

export function stationD(ui: Ui, t: number): SceneNode[] {
  const nodes: SceneNode[] = [];
  const swap = progress(t, T.d3.swap, 0.7, easing.camera);
  const x = DESK.d - WIN.w / 2;
  // D3: the HR head's window lifts away; the intern's rises and opens out to the full height.
  if (swap < 1) {
    const away = progress(t, T.d3.swap, 0.6, easing.exit);
    const cx = x + WIN.w / 2;
    const cy = WIN.top + PANE.h / 2;
    nodes.push(
      groupNode(
        'd-hr',
        [gridWindow('d-hr-win', { x, y: WIN.top, w: WIN.w, h: PANE.h }, paneD(ui, t, 'hr'))],
        {
          opacity: 1 - away,
          transform: { x: cx, y: cy - 60 * away, scale: 1 - 0.06 * away, originX: cx, originY: cy },
        },
      ),
    );
  }
  const y = WIN.top + lerp(LOW, 0, swap);
  const h = lerp(PANE.h, WIN.h, swap);
  nodes.push(
    gridWindow('d-in-win', { x, y, w: WIN.w, h }, [
      ...(swap < 0.4
        ? [groupNode('d-in-old', paneD(ui, t, 'intern'), { opacity: 1 - clamp(swap * 3) })]
        : []),
      ...(swap > 0 ? linkPaneD(ui, t, swap) : []),
    ]),
  );
  return nodes;
}

/** The composer's top in a pane once a question is sent. */
const paneFoot = PANE.h - 14 - COMPOSER.h;

function paneD(ui: Ui, t: number, who: 'hr' | 'intern'): SceneNode[] {
  const k = who === 'hr' ? TYPE.hr : TYPE.intern;
  const sendAt = who === 'hr' ? T.d1.sendHr : T.d1.sendIntern;
  const spec = D_CHAT[who];
  const id = `d-${who}`;
  const sent = t >= sendAt;
  const kids: (SceneNode | null)[] = [];
  const text = sent ? '' : typed(k, t);
  const fit = composerFit(ui, text, COMPOSER.w, 1);
  const comp = composer(ui, `${id}-comp`, COMPOSER.x, PANE.h - 14 - fit.h, COMPOSER.w, {
    text,
    t,
    focus: sent ? 0 : clamp((t - ((k.times[0] ?? 0) - 0.3)) / 0.15),
    level: 1,
    press: pressAt(t, sendAt),
    idle: text.length < k.text.length ? Infinity : k.end,
  });
  // The question rises into the conversation; the answer streams in under it.
  const rise = progress(t, sendAt + 0.04, 0.45, easing.enter);
  if (rise > 0) {
    const L = chatLayout(ui, spec);
    const [from, to] = who === 'hr' ? [T.d2.stream, T.d2.streamEnd] : [T.d2.empty, T.d2.emptyEnd];
    const shown = lerp(0, wordCount(spec.answer) + 1, progress(t, from, to - from));
    const wait = clamp((t - sendAt - 0.4) / 0.3) * (1 - clamp((t - from) / 0.2));
    kids.push(
      groupNode(
        `${id}-chat`,
        chatNodes(ui, id, spec, { shown, extras: progress(t, to, 0.35, easing.enter) }),
        {
          opacity: clamp(rise * 2),
          transform: { y: (1 - rise) * (paneFoot - (spec.top ?? CHAT_TOP)) },
        },
      ),
    );
    if (wait > 0)
      kids.push(
        groupNode(`${id}-wait`, [searching(`${id}-search`, COL.x, L.y0, COL.w, t)], {
          opacity: wait,
        }),
      );
  }
  kids.push(...comp.nodes, ...topBar(ui, `${id}-top`, WIN.w));
  return kids.filter((n): n is SceneNode => n !== null);
}

/** The pane's answer block (for the hints). */
function paneAnswer(ui: Ui, who: 'hr' | 'intern'): Box {
  const L = chatLayout(ui, D_CHAT[who]);
  return { x: COL.x - 8, y: L.y0 - 6, w: COL.w + 16, h: L.metaY + L.meta.h - L.y0 + 4 };
}

/** D3: a chat message with the report's link, then the page that won't open. */
const LINK = 'cowork/r/4f8k2q';
const LINK_POS = { x: 92, y: TOP + 114 } as const;
function linkPaneD(ui: Ui, t: number, swap: number): SceneNode[] {
  const w = WIN.w;
  const page = progress(t, T.d3.page, 0.35, easing.enter);
  const msg = progress(t, T.d3.message, 0.45, easing.enter);
  const kids: SceneNode[] = [];
  if (page < 1) {
    // A plain team chat (not Cowork): a message with a link and nothing else about the report.
    const hover = clamp((t - (T.d3.click - 0.3)) / 0.12);
    const lw = ui.measure(LINK, PF.body);
    const chat: SceneNode[] = [
      box('d-l-bg', 0, 0, w, WIN.h, 0, { fill: G.panel }),
      box('d-l-hbar', 0, 0, w, TOP, 0, { fill: G.page }),
      hairline('d-l-hrule', 0, TOP - 1, w),
      plainAvatar('d-l-hav', 34, TOP / 2, 13),
      label('d-l-hname', 'Dana Ortiz', 56, 15, PF.bodyStrong, G.ink),
      label(
        'd-l-hk',
        'chat',
        56 + ui.measure('Dana Ortiz ', PF.bodyStrong) + 6,
        18,
        PF.mono,
        G.faint,
      ),
      label('d-l-day', 'Today', w / 2, TOP + 22, PF.monoSmall, G.faint, { align: 'center' }),
      groupNode(
        'd-l-msg',
        [
          plainAvatar('d-l-av', 50, TOP + 78, 16),
          label('d-l-from', 'Dana Ortiz', LINK_POS.x, TOP + 60, PF.smallStrong, G.ink),
          label(
            'd-l-time',
            '11:02',
            LINK_POS.x + ui.measure('Dana Ortiz ', PF.smallStrong) + 6,
            TOP + 61,
            PF.monoSmall,
            G.faint,
          ),
          label('d-l-text', "For Monday's review:", LINK_POS.x, TOP + 82, PF.body, G.ink),
          label('d-l-link', LINK, LINK_POS.x, LINK_POS.y, PF.body, G.link),
          box('d-l-ul', LINK_POS.x, LINK_POS.y + 22, lw, hover > 0.5 ? 1.5 : 1, 0, {
            fill: G.link,
          }),
        ],
        { opacity: msg, transform: { y: 10 * (1 - msg) } },
      ),
      box('d-l-compose', 16, WIN.h - 68, w - 32, 48, GR, {
        fill: G.panel,
        stroke: { color: G.border, width: 1 },
      }),
      label('d-l-compose-t', 'Type a message', 32, WIN.h - 56, PF.body, G.faint),
    ];
    kids.push(groupNode('d-l-chat', chat, { opacity: clamp(swap * 2 - 1) * (1 - page) }));
    const pt = pointer(
      t,
      [
        { at: T.d3.cursor, x: w - 140, y: 560 },
        { at: T.d3.click - 0.05, x: LINK_POS.x + lw / 2, y: LINK_POS.y + 12 },
      ],
      T.d3.click + 0.4,
    );
    if (pt) kids.push(cursor('d-l-cursor', pt.x, pt.y, pressAt(t, T.d3.click), pt.opacity));
    const ring = clickRing('d-l-ring', LINK_POS.x + lw / 2, LINK_POS.y + 12, t, T.d3.click);
    if (ring) kids.push(ring);
  }
  if (page > 0) {
    // Cowork, signed in as the intern: the page shows nothing of the report, not even its title.
    const cy = 300;
    const mx = MAIN.x + MAIN.w / 2;
    const cw = MAIN.w - 64;
    kids.push(
      groupNode(
        'd-l-page',
        [
          box('d-l-pbg', 0, 0, w, WIN.h, 0, { fill: G.page }),
          box('d-l-main', MAIN.x, TOP, MAIN.w, WIN.h - TOP, 0, { fill: G.panel }),
          label('d-l-head', "You can't open this report", mx, cy, PF.title, G.ink, {
            align: 'center',
          }),
          textNode('d-l-body', {
            text: "It may not have been shared with you, or it may have been removed. You're signed in as sam.lee@company.com.",
            font: PF.body,
            fill: G.muted,
            maxWidth: cw,
            align: 'center',
            transform: { x: mx, y: cy + 46 },
          }),
          textNode('d-l-ask', {
            text: 'Ask the person who sent the link to share it with you.',
            font: PF.body,
            fill: G.muted,
            maxWidth: cw,
            align: 'center',
            transform: { x: mx, y: cy + 150 },
          }),
          gridButton(
            ui,
            'd-l-all',
            'All reports',
            mx - Math.round(ui.measure('All reports', PF.label) + 46) / 2,
            cy + 214,
            {
              icon: 'back',
            },
          ).node,
          ...topBar(ui, 'd-l-top', w),
        ],
        { opacity: page },
      ),
    );
  }
  // Loading: a thin bar under the top bar as the link opens.
  const load = progress(t, T.d3.click + 0.04, T.d3.page - T.d3.click + 0.05);
  if (load > 0 && page < 1)
    kids.push(box('d-l-load', 0, TOP - 2, w * load, 2, 1, { fill: G.ink, opacity: 1 - page }));
  return kids;
}

// ---------------------------------------------------------------------------
// Hints: what each part of a screen is, while the timeline holds on it
// ---------------------------------------------------------------------------

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
interface Hint {
  /** When it is on screen, in the timeline as first written (the holds inside it add to it). */
  readonly from: number;
  readonly until: number;
  readonly desk: 0 | 1 | 2;
  /** What it points at (window-local). */
  readonly target: (ui: Ui) => Box;
  readonly side: 'above' | 'below';
  readonly align?: 'left' | 'center' | 'right';
  /** Where the callout sits instead (window-local top left), for hints shown together. */
  readonly place?: (ui: Ui) => { x: number; y: number };
  readonly text: string;
  readonly sub?: string;
  readonly meaning: Meaning;
  /** Dim the rest of the window (off when hints share a screen). */
  readonly dim?: boolean;
  /** Seconds after `from` it waits to appear (for what is still arriving). */
  readonly lag?: number;
  /**
   * Keyed by colour instead of a leader line (for hints shown together, whose
   * leaders would cross the content between them): the ring and a dot on it
   * take the hint's meaning colour, matching the callout's dot.
   */
  readonly keyed?: boolean;
}

/** A box grown by `d` on every side. */
const inflate = (b: Box, d: number): Box => ({
  x: b.x - d,
  y: b.y - d,
  w: b.w + 2 * d,
  h: b.h + 2 * d,
});
/** The smallest box round two boxes. */
const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

const HINTS: readonly Hint[] = [
  // The ask: the rep, the COO, the HR head and the intern.
  {
    from: 1.75,
    until: 2.6,
    desk: 0,
    target: () => ({
      x: COMPOSER.x,
      y: COMPOSER.empty,
      w: COMPOSER.w,
      h: COMPOSER.h,
    }),
    side: 'below',
    align: 'left',
    text: 'Ask across your workspace',
    sub: 'read-only, scoped to what you can see',
    meaning: 'brand',
  },
  {
    from: 3.15,
    until: 3.25,
    desk: 0,
    target: (ui) => ({ x: COL.x - 8, y: cLayout(ui).y0 - 8, w: COL.w + 16, h: 100 }),
    side: 'below',
    align: 'left',
    text: 'Searches everything you can access',
    sub: 'mail · Teams · files',
    meaning: 'knowledge',
  },
  {
    from: 5.79,
    until: 5.8,
    desk: 1,
    target: (ui) => inflate(union(aComposer(ui).chip, aComposer(ui).menu), 2),
    side: 'below',
    align: 'right',
    text: 'Pick the depth',
    sub: 'level 1 · seconds · level 3 · 15–30 min',
    meaning: 'brand',
  },
  {
    from: 5.95,
    until: 6.12,
    desk: 1,
    target: (ui) => inflate(aComposer(ui).chip3, 3),
    side: 'below',
    align: 'right',
    text: 'Level 3 · deep analysis',
    sub: 'plans first, then 15–30 minutes',
    meaning: 'brand',
  },
  {
    from: 6.9,
    until: 8.5,
    desk: 2,
    target: () => ({ x: 0, y: 0, w: WIN.w, h: TOP }),
    side: 'below',
    align: 'left',
    text: 'HR head · pay data access',
    meaning: 'people',
    dim: false,
  },
  {
    from: 7.0,
    until: 8.5,
    desk: 2,
    target: () => ({ x: 0, y: LOW, w: WIN.w, h: TOP }),
    side: 'below',
    align: 'left',
    text: 'Intern · no pay data',
    meaning: 'friction',
    dim: false,
  },
  // The work: the plan, the quick answer, the deep run.
  {
    from: 9.3,
    until: 9.7,
    desk: 1,
    target: (ui) => inflate(aChatLayout(ui).chip, 2),
    side: 'below',
    align: 'left',
    text: 'It plans first',
    sub: 'plan · v1 · 4 steps',
    meaning: 'brand',
  },
  {
    from: 9.86,
    until: 9.9,
    lag: 0.55,
    desk: 1,
    target: (ui) => planLayout(ui).steps,
    side: 'above',
    align: 'left',
    text: 'Who does what',
    sub: 'lead · researchers · checker',
    meaning: 'brand',
  },
  {
    from: 10.06,
    until: 10.3,
    desk: 1,
    target: (ui) => inflate(planLayout(ui).save, 4),
    side: 'above',
    align: 'left',
    text: 'A page you can share and come back to',
    meaning: 'outcome',
  },
  {
    from: 10.3,
    until: 10.42,
    desk: 1,
    target: (ui) => inflate(planLayout(ui).go, 3),
    side: 'above',
    align: 'right',
    text: 'Nothing runs until you say go',
    meaning: 'brand',
  },
  {
    from: 11.5,
    until: 13.0,
    desk: 0,
    target: (ui) => {
      const L = cLayout(ui);
      return { x: COL.x - 6, y: L.y0 - 6, w: COL.w + 12, h: L.answerH + 10 };
    },
    side: 'below',
    align: 'left',
    place: () => ({ x: 24, y: 520 }),
    dim: false,
    keyed: true,
    text: 'Answered in seconds',
    meaning: 'time',
  },
  {
    from: 11.5,
    until: 13.0,
    desk: 0,
    target: (ui) => inflate(cLayout(ui).meta.sources, -1),
    side: 'below',
    align: 'left',
    place: () => ({ x: 24, y: 600 }),
    dim: false,
    keyed: true,
    text: 'Every claim cited',
    meaning: 'knowledge',
  },
  {
    from: 11.5,
    until: 13.0,
    desk: 0,
    target: (ui) => inflate(cLayout(ui).meta.confidence, -1),
    side: 'below',
    align: 'left',
    place: () => ({ x: 24, y: 680 }),
    dim: false,
    keyed: true,
    text: 'Two sources agree',
    meaning: 'outcome',
  },
  {
    from: 13.75,
    until: 14.25,
    desk: 1,
    target: () => ({ x: 16, y: WORK.row0 + WORK.row - 2, w: WIN.w - 32, h: 4 * WORK.row + 4 }),
    side: 'below',
    align: 'left',
    text: '4 researchers at once',
    sub: 'mail · Teams · files',
    meaning: 'knowledge',
  },
  {
    from: 14.25,
    until: 15.1,
    desk: 1,
    target: () => ({ x: 16, y: WORK.strip, w: 300, h: 44 }),
    side: 'below',
    align: 'left',
    text: '18 minutes of research',
    sub: 'while you do other work',
    meaning: 'time',
  },
  {
    from: 15.15,
    until: 16.25,
    desk: 1,
    target: () => ({ x: 16, y: checkerTop - 4, w: WIN.w - 32, h: 24 + WORK.row + 8 }),
    side: 'below',
    align: 'left',
    text: 'Every answer checked',
    meaning: 'outcome',
  },
  // The answers: allowed, sourced, the report.
  {
    from: 18.02,
    until: 18.4,
    desk: 2,
    target: (ui) => paneAnswer(ui, 'hr'),
    side: 'below',
    align: 'left',
    text: 'Answered from pay policy',
    sub: 'answered from the items your account can access',
    meaning: 'people',
  },
  {
    from: 18.4,
    until: 19.0,
    desk: 2,
    target: (ui) => {
      const b = paneAnswer(ui, 'intern');
      return { ...b, y: LOW + b.y };
    },
    side: 'below',
    align: 'left',
    text: "Nothing they can't see",
    sub: "cowork follows your company's access",
    meaning: 'friction',
  },
  {
    from: 20.0,
    until: 20.45,
    desk: 0,
    target: (ui) => inflate(cLayout(ui).cite, 6),
    side: 'below',
    align: 'left',
    text: 'Open any source',
    meaning: 'knowledge',
  },
  {
    from: 21.1,
    until: 22.1,
    desk: 0,
    target: (ui) => cLayout(ui).foot,
    side: 'below',
    align: 'left',
    text: 'Opens where it lives',
    sub: 'Outlook · the original email',
    meaning: 'outcome',
  },
  {
    from: 23.05,
    until: 23.3,
    desk: 1,
    target: (ui) => inflate(reportCardBox(ui), 2),
    side: 'below',
    align: 'left',
    text: 'Done in 19 min',
    sub: '38 sources, checked',
    meaning: 'outcome',
  },
  {
    from: 23.45,
    until: 23.9,
    desk: 1,
    target: (ui) => reportLayout(ui, 1).answerBox,
    side: 'below',
    align: 'left',
    text: 'The answer first',
    meaning: 'brand',
  },
  {
    from: 24.08,
    until: 24.5,
    desk: 1,
    target: (ui) => inflate(reportLayout(ui, 1).card, 3),
    side: 'below',
    align: 'left',
    text: 'The exact line it used',
    sub: 'kestrel alloys · 14 may',
    meaning: 'outcome',
  },
  // The library: kept, shared, protected, building.
  {
    from: 25.45,
    until: 25.8,
    desk: 1,
    target: (ui) => libraryLayout(ui).row0,
    side: 'below',
    align: 'left',
    text: 'Saved to Reports',
    sub: 'find it again, share it',
    meaning: 'outcome',
  },
  {
    from: 27.12,
    until: 27.9,
    desk: 1,
    target: (ui) => libraryLayout(ui).shared,
    side: 'below',
    align: 'left',
    text: 'Shared with the CFO',
    sub: 'access stays as set',
    meaning: 'people',
  },
  {
    from: 28.6,
    until: 29.05,
    desk: 2,
    target: (ui) => ({
      x: LINK_POS.x - 8,
      y: LINK_POS.y - 6,
      w: ui.measure(LINK, PF.body) + 16,
      h: 36,
    }),
    side: 'below',
    align: 'left',
    text: 'A shared link…',
    meaning: 'brand',
  },
  {
    from: 29.3,
    until: 30.6,
    desk: 2,
    target: () => ({ x: MAIN.x + 16, y: 284, w: MAIN.w - 32, h: 284 }),
    side: 'below',
    align: 'center',
    text: '…opens nothing extra',
    sub: 'access is checked every time',
    meaning: 'friction',
  },
  {
    from: 31.9,
    until: 32.4,
    desk: 1,
    target: () => CONFIRM,
    side: 'below',
    align: 'left',
    text: "Refresh: the same plan, this quarter's data",
    meaning: 'time',
  },
  {
    from: 32.5,
    until: 33.0,
    desk: 1,
    target: (ui) => {
      const L = reportLayout(ui, 2);
      return inflate(union(versionsBox(ui), { x: COL.x, y: L.banner, w: COL.w, h: 64 }), 3);
    },
    side: 'below',
    align: 'left',
    text: 'Version 2',
    meaning: 'outcome',
  },
  {
    from: 33.3,
    until: 34.3,
    desk: 1,
    target: (ui) => cfoPopover(ui),
    side: 'below',
    align: 'left',
    text: 'Their answer cites your report',
    meaning: 'people',
  },
];

/** When a hint is on screen (stretched timeline). */
function hintWindow(h: Hint): { from: number; to: number } {
  return { from: onGrid(stretch(h.from) + (h.lag ?? 0)), to: onGrid(stretch(h.until)) };
}

/** The callouts' size on screen relative to the window's own type (as the deck shows it, wide). */
export const HINT_SCALE = 1.5;

/**
 * The hints on desk `desk` at `t` (window-local): a soft violet ring round
 * the part being explained, the rest of the window dimmed a little, and a
 * Cloud callout beside it (a dot in its meaning's colour, a short label, a
 * lowercase mono line) on a thin leader. `k` scales the callout about its
 * anchor so it stays the same size on screen however far the camera has
 * zoomed in.
 */
export function hintNodes(
  ui: Ui,
  desk: 0 | 1 | 2,
  t: number,
  k = 1,
  /** The part of the window the camera shows (window-local), callouts kept inside it. */
  view?: { x0: number; x1: number; y0: number; y1: number },
): SceneNode[] {
  const nodes: SceneNode[] = [];
  HINTS.forEach((h, i) => {
    if (h.desk !== desk) return;
    const { from, to } = hintWindow(h);
    const p = progress(t, from, 0.35, easing.enter);
    const e = progress(t, to, 0.2, easing.exit);
    const a = p * (1 - e);
    if (a <= 0) return;
    const id = `hint${i}`;
    const b = h.target(ui);
    const meaning = tone(h.meaning);
    if (h.dim !== false) {
      const veil = withAlpha(UI.ink, 0.07 * a);
      const [x0, y0, x1, y1] = [b.x - 8, b.y - 8, b.x + b.w + 8, b.y + b.h + 8];
      nodes.push(
        box(`${id}-dim-t`, 0, 0, WIN.w, Math.max(0, y0), 0, { fill: veil }),
        box(`${id}-dim-b`, 0, y1, WIN.w, Math.max(0, WIN.h - y1), 0, { fill: veil }),
        box(`${id}-dim-l`, 0, y0, Math.max(0, x0), y1 - y0, 0, { fill: veil }),
        box(`${id}-dim-r`, x1, y0, Math.max(0, WIN.w - x1), y1 - y0, 0, { fill: veil }),
      );
    }
    nodes.push(
      box(`${id}-ring`, b.x - 6, b.y - 6, b.w + 12, b.h + 12, 14, {
        stroke: { color: withAlpha(h.keyed ? meaning.fill : C.stroke.focus, a), width: 2.5 },
        shadow: {
          x: 0,
          y: 0,
          blur: 14,
          color: withAlpha(h.keyed ? meaning.fill : C.brand.soft, (h.keyed ? 0.3 : 0.55) * a),
        },
      }),
      ...(h.keyed
        ? [
            box(`${id}-key`, b.x - 6 - 5.5, b.y - 6 - 5.5, 11, 11, 5.5, {
              fill: withAlpha(meaning.fill, a),
              stroke: { color: withAlpha(C.surface.paper, a), width: 2 },
            }),
          ]
        : []),
    );
    // The callout: drawn in its own units, scaled by `k` from its top left.
    const padX = 16;
    const dotW = 16;
    const tw = Math.max(ui.measure(h.text, F.bodyStrong), h.sub ? ui.measure(h.sub, F.meta) : 0);
    const cw = tw + 2 * padX + dotW;
    const ch = h.sub ? 62 : 42;
    const [sw, sh] = [cw * k, ch * k];
    const align = h.align ?? 'left';
    const gap = 18;
    const placed = h.place?.(ui);
    let left = clamp(
      placed
        ? placed.x
        : align === 'left'
          ? b.x
          : align === 'right'
            ? b.x + b.w - sw
            : b.x + b.w / 2 - sw / 2,
      10,
      WIN.w - 10 - sw,
    );
    let top = placed ? placed.y : h.side === 'above' ? b.y - 6 - gap - sh : b.y + b.h + 6 + gap;
    if (view) {
      left = clamp(left, view.x0 + 10, view.x1 - 10 - sw);
      top = clamp(top, view.y0 + 8, view.y1 - 10 - sh);
    }
    // The leader: from the ring's edge to the callout's nearest edge.
    const below = top > b.y + b.h / 2;
    const ringY = below ? b.y + b.h + 6 : b.y - 6;
    const cardY = below ? top : top + sh;
    const lx = clamp(left + Math.min(sw / 2, 40 * k), b.x + 10, b.x + b.w - 10);
    const cx = clamp(lx, left + 14 * k, left + sw - 14 * k);
    if (!h.keyed)
      nodes.push(
        shapeNode(`${id}-lead`, {
          geometry: pathGeometry(`M${lx} ${ringY}L${cx} ${cardY}`),
          stroke: {
            color: withAlpha(C.stroke.focus, a),
            width: 1.5 * Math.max(k, 1),
            cap: 'round',
          },
        }),
        box(`${id}-lead-dot`, lx - 3.5, ringY - 3.5, 7, 7, 3.5, {
          fill: withAlpha(C.brand.fill, a),
        }),
      );
    nodes.push(
      groupNode(
        `${id}-card`,
        [
          box(`${id}-bg`, 0, 0, cw, ch, 14, {
            fill: withAlpha(C.surface.paper, 0.97),
            stroke: { color: C.stroke.hairline, width: 1 },
            shadow: elevationShadows(lighting, 'mid', { strength: 0.7 }),
          }),
          box(`${id}-dot`, padX, 17, 9, 9, 4.5, { fill: meaning.fill }),
          label(`${id}-t`, h.text, padX + dotW, 9, F.bodyStrong, UI.text),
          ...(h.sub ? [label(`${id}-s`, h.sub, padX + dotW, 36, F.meta, UI.faint)] : []),
        ],
        {
          opacity: a,
          transform: { x: left, y: top + (below ? -8 : 8) * (1 - p), scale: k },
        },
      ),
    );
  });
  return nodes;
}

/** When each hint arrives (stretched timeline): a soft tick for each, on the beat. */
export const HINT_TIMES: readonly number[] = HINTS.map((h) => hintWindow(h).from);

// ---------------------------------------------------------------------------
// Shots and highlights: where the film looks inside the screen in focus
// ---------------------------------------------------------------------------

/**
 * A view of the screen in focus: the window-local point the camera centres
 * on, and how far it zooms in (1 = the whole window as the deck shows it).
 */
export interface ShotView {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}
export const WIDE: ShotView = { x: WIN.w / 2, y: WIN.h / 2, zoom: 1 };
/** A result, shown whole and a little larger. */
const FULL: ShotView = { x: WIN.w / 2, y: WIN.h / 2 - 20, zoom: 1.1 };

interface Shot {
  /** When the camera starts moving to this view. */
  readonly at: number;
  readonly view: ShotView;
  readonly duration?: number;
}
export interface Direction {
  readonly shots: readonly Shot[];
}

/**
 * The film's direction inside the screens: typing and work in progress are
 * seen close up on the component doing it; results are seen whole, a
 * little larger. Wide between desks.
 */
function direct(ui: Ui): Direction {
  const C = cLayout(ui);
  const AC = aComposer(ui);
  const A = aChatLayout(ui);
  const R1 = reportLayout(ui, 1);
  const LL = libraryLayout(ui);
  const mid = COMPOSER.x + COMPOSER.w / 2;
  const shots: Shot[] = [
    // C1: the rep types into the composer.
    { at: 1.3, view: { x: mid, y: COMPOSER.empty + 40, zoom: 1.3 }, duration: 0.55 },
    { at: 3.05, view: WIDE, duration: 0.4 },
    // A1: the COO's question, the level dropdown, send.
    { at: 3.75, view: { x: mid, y: COMPOSER.empty + AC.h / 2, zoom: 1.28 } },
    { at: 5.6, view: { x: mid, y: AC.menu.y + 20, zoom: 1.28 }, duration: 0.4 },
    { at: 6.12, view: WIDE, duration: 0.35 },
    // D1: the HR head and the intern type the same question.
    { at: 6.75, view: { x: 320, y: LOW + 48, zoom: 1.3 } },
    { at: 8.25, view: WIDE, duration: 0.35 },
    // A2: the plan chip, then the plan in the Research workspace.
    { at: 9.0, view: { x: COL.x + COL.w / 2, y: A.chip.y + 48, zoom: 1.5 } },
    { at: 9.74, view: FULL, duration: 0.4 },
    { at: 10.55, view: WIDE, duration: 0.35 },
    // C2: the rep's answer, whole.
    { at: 11.2, view: FULL },
    { at: 12.85, view: WIDE, duration: 0.3 },
    // A3: the agents at work, the clock, the Checker.
    { at: 13.6, view: { x: 320, y: WORK.row0 + 2 * WORK.row, zoom: 1.3 } },
    { at: 14.3, view: { x: 320, y: WORK.strip + 140, zoom: 1.3 } },
    { at: 15.05, view: { x: 320, y: 440, zoom: 1.3 } },
    { at: 15.9, view: WIDE, duration: 0.4 },
    // D2: the HR head's answer, the intern's; then both, whole.
    { at: 16.95, view: { x: 320, y: 380, zoom: 1.3 } },
    { at: 18.15, view: FULL },
    { at: 19.1, view: WIDE, duration: 0.3 },
    // C3: citation 1, its popover, the Outlook link.
    { at: 19.95, view: { x: C.cite.x, y: C.cite.y + 7, zoom: 1.7 }, duration: 0.45 },
    { at: 20.6, view: FULL },
    { at: 22.0, view: WIDE, duration: 0.3 },
    // A5: the report card, the page, the citation card.
    { at: 22.85, view: { x: COL.x + COL.w / 2, y: reportCardBox(ui).y + 74, zoom: 1.4 } },
    { at: 23.3, view: FULL, duration: 0.4 },
    { at: 23.95, view: { x: 320, y: R1.card.y + R1.card.h / 2, zoom: 1.25 }, duration: 0.4 },
    // B1: Reports; the row's menu; the Share dialog.
    { at: 24.6, view: FULL },
    { at: 25.85, view: { x: LL.menu.x + 40, y: LL.menu.y + 30, zoom: 1.5 }, duration: 0.4 },
    { at: 26.2, view: FULL, duration: 0.35 },
    { at: 27.8, view: WIDE, duration: 0.3 },
    // D3: the link in the chat, then the page that won't open.
    { at: 28.6, view: { x: LINK_POS.x + 100, y: LINK_POS.y, zoom: 1.6 }, duration: 0.4 },
    { at: 29.25, view: FULL },
    { at: 30.5, view: WIDE, duration: 0.3 },
    // B2: Refresh, its confirmation, version 2; the CFO's answer.
    {
      at: 31.2,
      view: { x: R1.buttons.refresh.x + 40, y: R1.buttons.refresh.y + 16, zoom: 1.6 },
      duration: 0.4,
    },
    { at: 31.66, view: FULL, duration: 0.35 },
  ];
  return {
    shots: shots.map((s) => ({
      ...s,
      at: onGrid(stretch(s.at)),
      ...(s.duration ? { duration: onGrid(s.duration) } : {}),
    })),
  };
}

/** Where the film looks inside the screen in focus at `t` (eased between shots). */
export function shotAt(direction: Direction, t: number): ShotView {
  let view = WIDE;
  for (const s of direction.shots) {
    const p = progress(t, s.at, s.duration ?? beats(1), easing.camera);
    if (p <= 0) break;
    view = {
      x: lerp(view.x, s.view.x, p),
      y: lerp(view.y, s.view.y, p),
      zoom: Math.exp(lerp(Math.log(view.zoom), Math.log(s.view.zoom), p)),
    };
  }
  return view;
}

// ---------------------------------------------------------------------------
// What the screens need
// ---------------------------------------------------------------------------

export interface Apps {
  readonly ui: Ui;
  readonly direction: Direction;
}

export function createApps(ui: Ui): Apps {
  return { ui, direction: direct(ui) };
}

// ---------------------------------------------------------------------------
// Sound (on the same timeline), and each scene's share of it
// ---------------------------------------------------------------------------

const click = (gain = 0.5, pan = 0) => key({ degree: 4, take: 1, gain, pan });

/**
 * Typing's sound: one soft tap for every fifth keystroke (a stream of taps
 * at the screen's typing speed runs together into a bubbling), each on the
 * nearest sixteenth of the beat, never two on the same one.
 */
function typingCues(k: Typing, gain: number, pan: number): Cues {
  const used = new Set<number>();
  const cues: Cues[] = [];
  let n = 0;
  k.times.forEach((at, i) => {
    if (k.text[i] === ' ' || n++ % TAP_EVERY !== 0) return;
    const on = onGrid(at);
    if (used.has(on)) return;
    used.add(on);
    cues.push(
      cue(on, tap({ take: i, gain: gain * (0.75 + 0.5 * random('keys', k.text, i)), pan })),
    );
  });
  return cues;
}
/** One tap per this many keystrokes. */
const TAP_EVERY = 5;

const CUES: readonly Cues[] = [
  // The window opens out of the tile.
  cue(T.intro.tile, whoosh(0.8, { from: 1800, to: 500, peak: 0.4, gain: 0.45 })),
  cue(T.intro.open + 0.5, pop({ degree: 4, gain: 0.45 })),
  cue(T.c1.click, click()),
  cue(T.c1.send, pop({ degree: 7, gain: 0.55 })),
  // A1: the dropdown, Level 3, send.
  cue(T.a1.menu, click()),
  cue(T.a1.level, snap({ degree: 4, gain: 0.45 })),
  cue(T.a1.ask, pop({ degree: 9, gain: 0.5 })),
  // D1: two people typing at once.
  cue(T.d1.sendHr, pop({ degree: 4, gain: 0.4, pan: -0.3 })),
  cue(T.d1.sendIntern, pop({ degree: 7, gain: 0.4, pan: 0.3 })),
  // A2: the plan opens; save; go.
  cue(T.a2.review, click()),
  cue(T.a2.review + 0.03, whoosh(0.5, { from: 400, to: 2400, peak: 0.5, gain: 0.4 })),
  cue(T.a2.review + 0.15, pluck({ degree: 2, octave: 1, gain: 0.4 })),
  cue(T.a2.save, click()),
  cue(T.a2.save + 0.05, pluck({ degree: 7, octave: 2, gain: 0.35 })),
  cue(T.a2.go, snap({ degree: 0, gain: 0.6 })),
  // C2: the answer was waiting.
  cue(T.c2.sweep, bell({ degree: 4, gain: 0.4 })),
  // A3: the agents and the racing clock; steps up the scale.
  cue(T.a3.race, whoosh(T.a3.raceEnd - T.a3.race, { from: 300, to: 2400, peak: 0.85, gain: 0.35 })),
  T.a3.steps
    .slice(1)
    .map((at, k) => cue(at, pluck({ degree: [4, 7, 9][k] ?? 0, octave: 2, gain: 0.4 }))),
  // D2: the HR head's answer; the intern's honest one.
  cue(T.d2.stream, bell({ degree: 7, gain: 0.35, pan: -0.3 })),
  cue(T.d2.empty, pluck({ degree: 2, octave: 1, gain: 0.3, pan: 0.3 })),
  cue(T.d2.streamEnd, pop({ degree: 4, gain: 0.35, pan: -0.3 })),
  // C3: the source's popover; its link to Outlook.
  cue(T.c3.click, click()),
  cue(T.c3.open, pop({ degree: 4, gain: 0.35 })),
  cue(T.c3.highlight, tick({ degree: 9, gain: 0.5 })),
  // A5: done; the report opens; its bars; the citation card.
  cue(T.a5.done, ding({ degree: 4, gain: 0.4 })),
  cue(T.a5.open, click()),
  cue(T.a5.open + 0.03, whoosh(0.45, { from: 500, to: 2200, peak: 0.5, gain: 0.4 })),
  REPORT[1].bars.map((_, k) =>
    cue(T.a5.bars + k * 0.09 + 0.1, pluck({ degree: [0, 2, 4, 7][k] ?? 0, octave: 1, gain: 0.3 })),
  ),
  cue(T.a5.cite, click()),
  cue(T.a5.cite + 0.05, tick({ degree: 9, gain: 0.5 })),
  // B1: Reports; share with the CFO.
  cue(T.b1.land + 0.05, pop({ degree: 2, gain: 0.35 })),
  cue(T.b1.more, click()),
  cue(T.b1.share, click()),
  cue(T.b1.cfo, click()),
  cue(T.b1.cfo + 0.1, pop({ degree: 7, gain: 0.45 })),
  cue(T.b1.confirm, click()),
  cue(T.b1.toast + 0.1, ding({ degree: 7, gain: 0.35 })),
  // D3: the link, and the page that won't open.
  cue(T.d3.message, pop({ degree: 2, gain: 0.35 })),
  cue(T.d3.click, click()),
  cue(T.d3.page, thump({ gain: 0.45 })),
  cue(T.d3.page + 0.02, pluck({ degree: 0, octave: 0, gain: 0.45 })),
  // B2: refresh, confirm, version 2; the CFO's answer cites the report.
  cue(T.b2.refresh, click()),
  cue(T.b2.confirm, pop({ degree: 2, gain: 0.35 })),
  cue(T.b2.yes, click()),
  cue(T.b2.v2, whoosh(0.45, { from: 600, to: 1800, peak: 0.6, gain: 0.3 })),
  cue(T.b2.v2 + 0.05, pop({ degree: 9, gain: 0.5 })),
  cue(T.b2.menu, click()),
  cue(T.b2.cfo, whoosh(0.45, { from: 900, to: 300, peak: 0.4, gain: 0.25 })),
  cue(T.b2.cite, click()),
  cue(T.b2.cite + 0.05, pluck({ degree: 4, octave: 2, gain: 0.4 })),
  cue(T.b2.cite + 0.45, bell({ degree: 0, gain: 0.45 })),
  // The camera moving between desks.
  MOVES.map((m) => cue(m.at, whoosh(m.duration, { from: 260, to: 1300, peak: 0.5, gain: 0.3 }))),
];

const CHORD: Record<AppsScene, 'home' | 'lift' | 'shadow'> = {
  ask: 'lift',
  work: 'home',
  answers: 'lift',
  library: 'home',
};
export const APPS_CHORDS = CHORD;

/**
 * The UI sounds (keys, clicks, pops) are small by design; this lifts the
 * whole application stretch by about 4 dB so it sits level with the scenes
 * before it (about −26 LUFS) over the music.
 */
const MIX = 1.6;

/** The sounds on the timeline in [from, to), moved to start at `at`. */
/** Typing's taps (already on the grid). */
const TYPING: readonly Cues[] = [
  typingCues(TYPE.c, 0.3, -0.1),
  typingCues(TYPE.a, 0.26, 0.1),
  typingCues(TYPE.hr, 0.22, -0.35),
  typingCues(TYPE.intern, 0.22, 0.35),
];

export function cuesBetween(from: number, to: number, at: number): SoundEvent[] {
  const flat: SoundEvent[] = [];
  const walk =
    (grid: boolean) =>
    (c: Cues): void => {
      if ('sound' in c) flat.push(grid ? { ...c, at: onGrid(c.at, SFX_DIV) } : c);
      else c.forEach(walk(grid));
    };
  CUES.forEach(walk(true));
  TYPING.forEach(walk(true));
  // Each hint arriving: a soft, high tick.
  HINT_TIMES.forEach((at, i) =>
    walk(true)(cue(at, tick({ degree: 7 + (i % 3), gain: 0.16, pan: 0.15 }))),
  );
  return flat
    .filter((c) => c.at >= from && c.at < to)
    .map((c) => ({ ...c, at: c.at - from + at, gain: (c.gain ?? 1) * MIX }));
}

/** Timeline moments only the montage shows. */
export const OFF_CAMERA = T.c1b;

/** Every font the screens use. */
export const APPS_FONTS = [...UI_FONTS, ...PRODUCT_FONTS];
