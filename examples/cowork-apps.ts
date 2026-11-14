/**
 * The applications part of the queries video, as one continuous timeline:
 * three desks side by side (a sales rep, the COO, and an HR head next to an
 * intern), each with the Cowork app, and a camera gliding between them. The
 * scenes `query-ask`, `query-work`, `query-answers` and `query-library` are
 * consecutive windows of this one timeline, so every cut between them is the
 * same frame on both sides by construction. It opens from the exact last
 * frame of `query-cowork`: the Cowork tile shrinks into the rep's ask bar as
 * the rep's window opens out of it.
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
  createCanvasMeasurer,
  groupNode,
  layoutText,
  lerp,
  linearGradient,
  pathGeometry,
  progress,
  random,
  rect,
  shapeNode,
  textNode,
  withAlpha,
  type FontSpec,
  type SceneNode,
  type SoundEvent,
} from '@html-animation-engine/core';
import { defineSceneComposition, elevationShadows } from '@html-animation-engine/renderers';
import { lighting, phoneDefaults, theme } from './index.js';
import { wall } from './query-bubbles/composition.js';
import { cowork, type CoworkCaptions } from './query-cowork/composition.js';
import {
  CX,
  HEADLINE,
  STORY_FONTS,
  caption,
  paint,
  tileNode,
  type Caption,
} from './query-story.js';
import {
  F,
  UI,
  UI_FONTS,
  avatar,
  createUi,
  box,
  caret,
  checkDisc,
  clickRing,
  clockText,
  cursor,
  grouped,
  icon,
  label,
  mark,
  pressAt,
  rule,
  skeleton,
  spinner,
  windowNode,
  type IconName,
  type Ui,
} from './cowork-ui.js';
import {
  bell,
  cue,
  ding,
  key,
  pad,
  pluck,
  pop,
  slap,
  snap,
  soundtrack,
  thump,
  tick,
  whoosh,
  type Cues,
} from './sounds.js';

const { easing } = theme;

// ---------------------------------------------------------------------------
// The timeline (seconds from the start of `query-ask`)
// ---------------------------------------------------------------------------

/** Where each scene starts and ends on the timeline. */
export const SCENES = {
  ask: { start: 0, end: 8.5 },
  work: { start: 8.5, end: 16.25 },
  answers: { start: 16.25, end: 24.6 },
  library: { start: 24.6, end: 34.2 },
} as const;
export type AppsScene = keyof typeof SCENES;

const T = {
  /** The previous scene's captions leave; the rep's window opens out of the tile. */
  intro: { exit: 0.3, tile: 0.1, tileMove: 0.9, open: 0.3, openDur: 0.8 },
  // C1: mid-scroll, the rep stops and asks.
  scroll: { start: 0.15, duration: 1.5 },
  c1: { cursor: 1.2, click: 1.72, type: 1.86, send: 3.1 },
  // A1: the COO asks a bigger question at Level 3.
  a1: { type: 3.72, level: 5.85, ask: 6.12 },
  // D1: the HR head and the intern ask the same question.
  d1: { hr: 6.86, intern: 7.0, sendHr: 8.18, sendIntern: 8.3 },
  // A2: the plan unfolds; save as a report; go ahead.
  a2: { unfold: 9.12, cursor: 9.7, save: 10.06, go: 10.46, work: 10.62 },
  // C2: the rep's answer is already there.
  c2: { ready: 4.4, sweep: 11.35 },
  // Off camera (seen only in the montage of `query-proof`): the rep's answer streams in and a source opens.
  c1b: { stream: 4.5, streamEnd: 5.1, cursor: 4.95, click: 5.36, open: 5.4, close: 6.4 },
  // A3: researchers in parallel, the elapsed clock racing.
  a3: { race: 13.35, raceEnd: 15.95, steps: [11.9, 13.85, 14.5, 15.15] as const },
  // D2: the HR head's answer streams in; the intern's side stays empty.
  d2: { stream: 17.05, streamEnd: 18.0, empty: 17.25 },
  // C3: the rep opens a citation: the approval email.
  c3: { cursor: 20.0, click: 20.48, open: 20.52, highlight: 21.0 },
  // A5: the report opens; the clock freezes.
  a5: { open: 22.75, bars: 23.1, done: 22.75 },
  // B1: the report lands in the library and is shared with the CFO.
  b1: { land: 25.15, cursor: 25.8, share: 26.18, cfo: 26.62, toast: 26.72, toastEnd: 28.05 },
  // D3: the intern opens the report's link and can't.
  d3: { swap: 28.0, message: 28.55, cursor: 28.7, click: 29.05, page: 29.18 },
  // B2: next quarter, one refresh, version 2, and another team builds on it.
  b2: { flip: 31.3, cursor: 31.35, refresh: 31.85, v2: 32.45, ask: 32.75 },
} as const;

/** Captions: each phrase arrives at its time, and the whole line leaves at `out`. */
const CAPTIONS: readonly {
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
    text: 'Researchers, in *parallel.* | Every step *checked.*',
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
const CAPTION_Y = 140;

// ---------------------------------------------------------------------------
// The desks and the camera
// ---------------------------------------------------------------------------

/** Each desk's centre on the (wide) desk plane; one frame apart. */
export const DESK = { c: CX, a: CX + 720, d: CX + 1440 } as const;
/** The window every desk shows. */
export const WIN = { w: 640, h: 860, top: 330 } as const;
export const MID = WIN.top + WIN.h / 2;
/** The intern's and HR head's windows, side by side. */
const HALF = { w: 314, gap: 12 } as const;

/** Camera moves: arrive at desk `to`, moving over [at, at + duration]. */
const MOVES: readonly { to: number; at: number; duration: number }[] = [
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
  c: typing('c', Q.c, T.c1.type, 34),
  a: typing('a', Q.a, T.a1.type, 54),
  hr: typing('hr', Q.d, T.d1.hr, 31),
  intern: typing('intern', Q.d, T.d1.intern, 30),
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

interface Paragraph {
  readonly node: SceneNode;
  readonly height: number;
}

/**
 * A paragraph laid out once by `layoutText`. Words in `*stars*` take
 * `accent`. `shown` (words, fractional) streams it in word by word.
 */
function paragraph(
  ui: Ui,
  id: string,
  text: string,
  x: number,
  y: number,
  f: FontSpec,
  maxWidth: number,
  options: { color?: string; accent?: string; shown?: number; align?: 'left' | 'center' } = {},
): Paragraph {
  const raw = text.split(/\s+/);
  const accent = raw.map((w) => /^\*.+\*[.,;:]?$/.test(w));
  const plain = raw.map((w) => w.replace(/\*/g, '')).join(' ');
  const layout = layoutText(plain, f, { measurer: ui.measurer, maxWidth, align: options.align });
  const shown = options.shown ?? Infinity;
  const children: SceneNode[] = [];
  for (const line of layout.lines) {
    const whole =
      line.words.every((w) => !accent[w.index]) &&
      (line.words[line.words.length - 1]?.index ?? 0) < shown - 1;
    if (whole) {
      children.push(
        textNode(`${id}-l${line.index}`, {
          text: line.text,
          font: f,
          fill: options.color ?? UI.text,
          align: options.align,
          transform: { x: x + (options.align === 'center' ? 0 : line.x), y: y + line.y },
        }),
      );
      continue;
    }
    for (const w of line.words) {
      const o = clamp(shown - w.index);
      if (o <= 0) continue;
      children.push(
        textNode(`${id}-w${w.index}`, {
          text: w.text,
          font: f,
          fill: accent[w.index] ? (options.accent ?? UI.accent) : (options.color ?? UI.text),
          transform: { x: x + w.x, y: y + w.y },
          opacity: o,
        }),
      );
    }
  }
  return { node: groupNode(id, children), height: layout.height };
}

/** Typed text with its caret; returns the node and the text's height. */
function typedText(
  ui: Ui,
  id: string,
  k: Typing,
  t: number,
  x: number,
  y: number,
  f: FontSpec,
  maxWidth: number,
  focus: number,
): SceneNode[] {
  const text = typed(k, t);
  const nodes: (SceneNode | null)[] = [];
  if (text.length > 0) {
    nodes.push(
      textNode(`${id}-text`, { text, font: f, fill: UI.text, maxWidth, transform: { x, y } }),
    );
  }
  if (focus > 0) {
    const layout = layoutText(text.length ? text : ' ', f, { measurer: ui.measurer, maxWidth });
    const line = layout.lines[layout.lines.length - 1];
    const lh = layout.lineHeight;
    const space = text.endsWith(' ') ? ui.measure(' ', f) : 0;
    const cx = text.length && line ? x + line.x + line.width + space + 1 : x;
    const cy = y + (line?.y ?? 0) + lh * 0.14;
    // Solid while typing; blinking before the first key and after the last.
    const idle =
      text.length === 0 ? (k.times[0] ?? 0) - 10 : text.length < k.text.length ? Infinity : k.end;
    nodes.push(caret(`${id}-caret`, cx, cy, lh * 0.72, t, idle));
  }
  return nodes.filter((n): n is SceneNode => n !== null);
}

/** A person tag above a window: who is at this desk. */
function personTag(ui: Ui, id: string, role: string, color: string, x: number, y: number) {
  const w = ui.measure(role, F.role) + 34;
  return groupNode(id, [
    avatar(`${id}-av`, x - w / 2 + 12, y, 12, color),
    label(`${id}-role`, role, x - w / 2 + 32, y - 9, F.role, UI.sub),
  ]);
}

/** A message bubble (the asker's question), right-aligned at `right`. */
function bubble(
  ui: Ui,
  id: string,
  text: string,
  right: number,
  y: number,
  maxWidth: number,
  f = F.body,
) {
  const layout = layoutText(text, f, { measurer: ui.measurer, maxWidth });
  const w = layout.width + 30;
  const h = layout.height + 20;
  return {
    node: groupNode(id, [
      box(`${id}-bg`, right - w, y, w, h, 18, { fill: UI.accentSoft }),
      textNode(`${id}-text`, {
        text,
        font: f,
        fill: UI.text,
        maxWidth,
        transform: { x: right - w + 15, y: y + 10 },
      }),
    ]),
    h,
  };
}

/** "Cowork" with its mark: who is answering. */
function answerer(id: string, x: number, y: number, meta?: string) {
  return groupNode(id, [
    mark(`${id}-mark`, x + 9, y + 9, 18),
    label(`${id}-name`, 'Cowork', x + 26, y, F.smallStrong, UI.text),
    ...(meta ? [label(`${id}-meta`, meta, x + 90, y, F.small, UI.sub)] : []),
  ]);
}

/** A light band sweeping across a box once (0–1). */
function sweepBand(id: string, x: number, y: number, w: number, h: number, p: number) {
  if (p <= 0 || p >= 1) return null;
  const bx = x + lerp(-0.3, 1.3, p) * w;
  return box(id, x, y, w, h, 12, {
    fill: linearGradient(bx - 120, y, bx + 120, y + h, [
      { offset: 0, color: withAlpha(UI.accent, 0) },
      { offset: 0.5, color: withAlpha(UI.accent, 0.08) },
      { offset: 1, color: withAlpha(UI.accent, 0) },
    ]),
  });
}

/** A source chip: [n] icon label. */
function citation(
  ui: Ui,
  id: string,
  n: number,
  ic: IconName,
  text: string,
  x: number,
  y: number,
  hover = 0,
) {
  const numW = 22;
  const f = F.small;
  const w = Math.round(ui.measure(text, f) + numW + 44);
  return {
    node: groupNode(id, [
      box(`${id}-bg`, x, y, w, 32, 10, {
        fill: hover > 0.5 ? UI.accentSoft : UI.wash,
        stroke: { color: hover > 0.5 ? UI.accentLine : UI.line, width: 1 },
      }),
      box(`${id}-n`, x + 6, y + 6, numW, 20, 6, { fill: UI.accentSoft }),
      label(`${id}-nt`, String(n), x + 6 + numW / 2, y + 7, F.smallStrong, UI.accent, {
        align: 'center',
      }),
      icon(`${id}-ic`, ic, x + numW + 20, y + 16, 16, UI.sub),
      label(`${id}-text`, text, x + numW + 32, y + 7, f, UI.text),
    ]),
    w,
  };
}

function confidence(ui: Ui, id: string, x: number, y: number) {
  const text = 'High confidence';
  const w = Math.round(ui.measure(text, F.smallStrong) + 36);
  return groupNode(id, [
    box(`${id}-bg`, x, y, w, 28, 14, { fill: UI.goodSoft }),
    box(`${id}-dot`, x + 11, y + 10, 8, 8, 4, { fill: UI.good }),
    label(`${id}-text`, text, x + 25, y + 5, F.smallStrong, UI.good),
  ]);
}

// ---------------------------------------------------------------------------
// C: the sales rep (inbox + ask bar)
// ---------------------------------------------------------------------------

const INBOX: readonly {
  from: string;
  subject: string;
  time: string;
  unread: boolean;
  tag?: string;
}[] = [
  { from: 'Procurement', subject: 'PO 4471 waiting for your approval', time: '9:41', unread: true },
  {
    from: 'Arden Logistics',
    subject: 'Re: Re: renewal paperwork',
    time: '9:38',
    unread: true,
    tag: 'Renewal',
  },
  {
    from: 'Calendar',
    subject: 'Invitation: Pipeline review, Thu 11:00',
    time: '9:30',
    unread: false,
  },
  {
    from: 'Finance ops',
    subject: 'Q2 invoice reminder (3 overdue)',
    time: '9:12',
    unread: true,
    tag: 'Urgent',
  },
  { from: 'Legal', subject: 'Redlines attached: MSA v4', time: '8:57', unread: true },
  {
    from: 'Sales ops',
    subject: 'Updated pricing sheet (v7, final final)',
    time: '8:40',
    unread: false,
  },
  {
    from: 'IT service desk',
    subject: 'Your password expires in 3 days',
    time: '8:31',
    unread: false,
  },
  { from: 'Deal desk', subject: 'Re: discount approvals this week', time: '8:22', unread: true },
  {
    from: 'Customer success',
    subject: 'Escalation: onboarding delay',
    time: '8:05',
    unread: true,
    tag: 'Urgent',
  },
  { from: 'Marketing', subject: 'Webinar recap and slides', time: 'Yesterday', unread: false },
  {
    from: 'Arden Logistics',
    subject: 'Fwd: Fwd: question about the rate',
    time: 'Yesterday',
    unread: true,
    tag: 'Renewal',
  },
  { from: 'Payroll', subject: 'Reimbursement processed', time: 'Yesterday', unread: false },
  { from: 'Sales ops', subject: 'Weekly forecast: please update', time: 'Yesterday', unread: true },
  { from: 'Travel', subject: 'Your itinerary for Monday', time: 'Mon', unread: false },
  {
    from: 'Deal desk',
    subject: 'Renewal terms: summary of the thread',
    time: 'Mon',
    unread: true,
    tag: 'Renewal',
  },
  { from: 'Procurement', subject: 'Vendor onboarding form', time: 'Mon', unread: false },
  { from: 'Finance ops', subject: 'Month-end close checklist', time: 'Mon', unread: true },
  { from: 'Legal', subject: 'NDA countersigned', time: 'Sun', unread: false },
  { from: 'Sales ops', subject: 'Territory changes from July', time: 'Sun', unread: true },
  { from: 'Customer success', subject: 'QBR notes: Arden Logistics', time: 'Sat', unread: false },
];
const ROW = 68;
const LIST = { top: 64, bottom: 744 } as const;
const DOCK = { x: 16, y: 756, w: 608, h: 88 } as const;
/** The tile lands here, as the ask bar's icon (window-local). */
const DOCK_ICON = { x: 54, y: DOCK.y + DOCK.h / 2, size: 40 } as const;

const ANSWER_C =
  "You approved *8.5%* for Arden Logistics' three-year renewal. The deal desk signed it off on 12 May, and the customer confirmed it in Teams the next day.";

function stationC(ui: Ui, t: number): SceneNode[] {
  const open = progress(t, T.intro.open, T.intro.openDur, easing.enter);
  if (open <= 0) return [];
  const left = DESK.c - WIN.w / 2;
  // The window grows out of the tile (centred on it), as an app opens from its icon.
  const tileY = 512 - WIN.top;
  const shape = {
    cx: WIN.w / 2,
    cy: lerp(tileY, WIN.h / 2, open),
    w: lerp(200, WIN.w, open),
    h: lerp(200, WIN.h, open),
    r: lerp(50, 24, open),
  };
  const kids: (SceneNode | null)[] = [];

  // Header
  kids.push(
    icon('c-h-icon', 'mail', 36, 32, 22, UI.text),
    label('c-h-title', 'Inbox', 56, 19, F.title),
    label('c-h-count', '248 unread', 56 + ui.measure('Inbox', F.title) + 12, 24, F.small, UI.sub),
    icon('c-h-search', 'search', 604, 32, 20, UI.sub),
    rule('c-h-rule', 0, 63, WIN.w),
  );

  // The cluttered inbox, mid-scroll, coming to rest.
  const scroll = lerp(120, 742, progress(t, T.scroll.start, T.scroll.duration, easing.enter));
  const rows: SceneNode[] = [];
  INBOX.forEach((m, k) => {
    const y = LIST.top + k * ROW - scroll;
    if (y < LIST.top - ROW || y > LIST.bottom) return;
    const id = `c-row${k}`;
    if (m.unread) rows.push(box(`${id}-dot`, 18, y + 21, 8, 8, 4, { fill: UI.accent }));
    rows.push(
      label(`${id}-from`, m.from, 36, y + 12, m.unread ? F.bodyStrong : F.body, UI.text),
      label(`${id}-time`, m.time, 616, y + 14, F.small, UI.sub, { align: 'right' }),
      label(
        `${id}-subj`,
        ui.fit(m.subject, F.small, m.tag ? 430 : 560),
        36,
        y + 37,
        F.small,
        UI.sub,
      ),
      rule(`${id}-rule`, 36, y + ROW - 1, 604),
    );
    if (m.tag) {
      const tagColor = m.tag === 'Urgent' ? UI.alert : UI.warm;
      const tag = ui.chip(`${id}-tag`, m.tag, 0, 0, {
        fill: m.tag === 'Urgent' ? UI.alertSoft : UI.warmSoft,
        color: tagColor,
        font: F.tiny,
        height: 22,
      });
      rows.push(
        groupNode(`${id}-tagpos`, [tag.node], { transform: { x: 616 - tag.w, y: y + 35 } }),
      );
    }
  });
  kids.push(
    groupNode('c-list', rows, {
      clip: rect(WIN.w / 2, (LIST.top + LIST.bottom) / 2, WIN.w, LIST.bottom - LIST.top, 0),
    }),
  );

  // The answer sheet rises over the inbox once the question is sent.
  const sheet = progress(t, T.c1.send + 0.06, 0.55, easing.enter);
  if (sheet > 0) kids.push(...sheetC(ui, t, lerp(LIST.bottom, LIST.top, sheet)));
  // C3: the source email slides over the answer.
  const mail = Math.max(
    progress(t, T.c3.open, 0.5, easing.enter),
    progress(t, T.c1b.open, 0.45, easing.enter) * (1 - progress(t, T.c1b.close, 0.3, easing.exit)),
  );
  if (mail > 0) kids.push(emailC(ui, t, lerp(WIN.w, 0, mail)));

  // The ask bar
  const focus = progress(t, T.c1.click, 0.2);
  const sent = progress(t, T.c1.send, 0.25, easing.exit);
  kids.push(
    rule('c-dock-rule', 0, LIST.bottom, WIN.w),
    box('c-dock-ring', DOCK.x - 3, DOCK.y - 3, DOCK.w + 6, DOCK.h + 6, 25, {
      stroke: { color: withAlpha(UI.accent, 0.18 * focus * (1 - sent)), width: 4 },
    }),
    box('c-dock', DOCK.x, DOCK.y, DOCK.w, DOCK.h, 22, {
      fill: UI.wash,
      stroke: { color: focus * (1 - sent) > 0.5 ? UI.accentLine : UI.line, width: 1.2 },
    }),
  );
  const text = typed(TYPE.c, t);
  if (sent < 1) {
    if (text.length === 0)
      kids.push(
        label('c-dock-ph', 'Ask Cowork about anything at work', 88, DOCK.y + 31, F.body, UI.faint),
      );
    kids.push(
      groupNode(
        'c-dock-typed',
        typedText(ui, 'c-q', TYPE.c, t, 88, DOCK.y + 29, F.body, 460, focus),
        {
          opacity: 1 - sent,
          transform: { y: -14 * sent },
        },
      ),
    );
  } else {
    kids.push(
      label('c-dock-ph', 'Ask a follow-up', 88, DOCK.y + 31, F.body, UI.faint, {
        opacity: clamp((t - T.c1.send - 0.3) / 0.3),
      }),
    );
  }
  const ready = text.length > 0 && sent < 1 ? 1 : 0;
  const send = pressAt(t, T.c1.send);
  kids.push(
    groupNode(
      'c-send',
      [
        box('c-send-bg', -19, -19, 38, 38, 19, { fill: ready ? UI.accent : UI.line }),
        icon('c-send-icon', 'send', 0, 0, 20, UI.surface),
      ],
      { transform: { x: 582, y: DOCK.y + DOCK.h / 2, scale: 1 - 0.1 * send } },
    ),
  );

  // C1 and C3 pointers.
  const p1 = pointer(
    t,
    [
      { at: T.c1.cursor, x: 520, y: 560 },
      { at: T.c1.click - 0.04, x: 300, y: DOCK.y + 48 },
    ],
    T.c1.type + 0.25,
  );
  if (p1) kids.push(cursor('c-cursor1', p1.x, p1.y, pressAt(t, T.c1.click), p1.opacity));
  kids.push(clickRing('c-ring1', 300, DOCK.y + 48, t, T.c1.click));
  const chip = sheetLayout(ui).chip;
  const p2 = pointer(
    t,
    [
      { at: T.c1b.cursor, x: 470, y: 640 },
      { at: T.c1b.click - 0.05, x: chip.x + 64, y: chip.y + 18 },
    ],
    T.c1b.click + 0.5,
  );
  if (p2) kids.push(cursor('c-cursor2', p2.x, p2.y, pressAt(t, T.c1b.click), p2.opacity));
  const p3 = pointer(
    t,
    [
      { at: T.c3.cursor, x: 470, y: 650 },
      { at: T.c3.click - 0.05, x: chip.x + 64, y: chip.y + 18 },
    ],
    T.c3.click + 0.7,
  );
  if (p3) kids.push(cursor('c-cursor3', p3.x, p3.y, pressAt(t, T.c3.click), p3.opacity));

  return [
    groupNode('c-tag-o', [personTag(ui, 'c-tag', 'Sales rep', UI.accent, DESK.c, WIN.top - 30)], {
      opacity: clamp((open - 0.5) / 0.5),
    }),
    windowNode('c-win', { x: left, y: WIN.top, w: WIN.w, h: WIN.h }, kids, {
      shape,
      content: clamp((open - 0.45) / 0.45),
    }),
  ];
}

const plain = (text: string) => text.replace(/\*/g, '');

/** Where things sit in the rep's answer sheet once it is up (window-local). */
function sheetLayout(ui: Ui) {
  const q = layoutText(Q.c, F.body, { measurer: ui.measurer, maxWidth: 440 });
  const y0 = LIST.top + 22 + q.height + 20 + 26;
  const para = layoutText(plain(ANSWER_C), F.body, { measurer: ui.measurer, maxWidth: 576 });
  return { chip: { x: 32, y: y0 + 34 + para.height + 16 } };
}

function sheetC(ui: Ui, t: number, top: number): SceneNode[] {
  const nodes: (SceneNode | null)[] = [];
  nodes.push(
    box('c-sheet', 0, top, WIN.w, LIST.bottom - top + 2, 0, {
      fill: UI.surface,
      shadow: { x: 0, y: -6, blur: 22, color: withAlpha(UI.shade, 0.1) },
    }),
  );
  const q = bubble(ui, 'c-qb', Q.c, 616, top + 22, 440);
  nodes.push(q.node);
  const y0 = top + 22 + q.h + 26;
  const ready = progress(t, T.c2.ready, 0.3);
  nodes.push(
    answerer(
      'c-who',
      32,
      y0,
      ready > 0 ? '· answered in 6 s' : '· searching email, chats and files',
    ),
  );
  if (ready < 1) {
    nodes.push(
      groupNode(
        'c-wait',
        [
          spinner('c-spin', 40, y0 + 46, 8, t, UI.accent),
          skeleton('c-sk1', 60, y0 + 40, 380, 12, t),
          skeleton('c-sk2', 32, y0 + 66, 540, 12, t + 0.1),
          skeleton('c-sk3', 32, y0 + 92, 300, 12, t + 0.2),
        ],
        { opacity: 1 - ready },
      ),
    );
  }
  if (ready > 0) {
    const words = ANSWER_C.split(/\s+/).length;
    const shown = lerp(0, words + 1, progress(t, T.c1b.stream, T.c1b.streamEnd - T.c1b.stream));
    const para = paragraph(ui, 'c-ans', ANSWER_C, 32, y0 + 34, F.body, 576, { shown });
    const extras = progress(t, T.c1b.streamEnd, 0.35, easing.enter);
    const chipsY = y0 + 34 + para.height + 16;
    const hoverAt = (click: number) => clamp((t - (click - 0.3)) / 0.1) * (t < click + 0.5 ? 1 : 0);
    const hover = Math.max(hoverAt(T.c3.click), hoverAt(T.c1b.click));
    const c1 = citation(ui, 'c-cite1', 1, 'mail', 'Re: Renewal terms', 32, chipsY, hover);
    const c2 = citation(ui, 'c-cite2', 2, 'chat', 'Teams · #deal-desk', 32 + c1.w + 8, chipsY);
    nodes.push(
      groupNode(
        'c-answer',
        [
          para.node,
          groupNode(
            'c-extras',
            [
              c1.node,
              c2.node,
              confidence(ui, 'c-conf', 32, chipsY + 46),
              label('c-sugg', 'SUGGESTED', 32, chipsY + 104, F.tiny, UI.faint),
              ...['Show me the order form', 'Who else approved a rate this year?'].map((s, k) =>
                groupNode(`c-sugg${k}`, [
                  box(`c-sugg${k}-bg`, 32, chipsY + 128 + k * 48, 576, 40, 12, {
                    stroke: { color: UI.line, width: 1.2 },
                  }),
                  icon(`c-sugg${k}-ic`, 'search', 52, chipsY + 148 + k * 48, 16, UI.sub),
                  label(`c-sugg${k}-t`, s, 70, chipsY + 137 + k * 48, F.body, UI.sub),
                ]),
              ),
            ],
            { opacity: extras, transform: { y: 8 * (1 - extras) } },
          ),
          sweepBand(
            'c-sweep',
            20,
            y0 + 24,
            600,
            para.height + 110,
            progress(t, T.c2.sweep, 0.9, easing.camera),
          ),
        ].filter((n): n is SceneNode => n !== null),
        { opacity: ready },
      ),
    );
  }
  return nodes.filter((n): n is SceneNode => n !== null);
}

function emailC(ui: Ui, t: number, x: number): SceneNode {
  const kids: SceneNode[] = [];
  const top = LIST.top;
  kids.push(
    box('c-mail-bg', 0, top, WIN.w, LIST.bottom - top, 0, {
      fill: UI.surface,
      shadow: { x: -8, y: 0, blur: 24, color: withAlpha(UI.shade, 0.12) },
    }),
    icon('c-mail-back', 'chevron', 36, top + 30, 20, UI.sub),
  );
  const src = ui.chip('c-mail-src', 'Source [1] · Email', 0, 0, {
    fill: UI.accentSoft,
    color: UI.accent,
    icon: 'mail',
  });
  kids.push(groupNode('c-mail-srcpos', [src.node], { transform: { x: 56, y: top + 16 } }));
  kids.push(
    label('c-mail-subj', 'Re: Renewal terms: Arden Logistics', 32, top + 66, F.title),
    avatar('c-mail-av', 50, top + 128, 18, UI.violet),
    label('c-mail-from', 'Deal desk', 78, top + 108, F.bodyStrong),
    label('c-mail-to', 'to Sales · 12 May, 16:42', 78, top + 130, F.small, UI.sub),
    icon('c-mail-clip', 'paperclip', 604, top + 120, 18, UI.sub),
    rule('c-mail-rule', 32, top + 168, 576),
    label('c-mail-hi', 'Hi team,', 32, top + 190, F.body),
  );
  // The approval line, highlighted as if by hand.
  const approval =
    'Approved: 8.5% on the three-year renewal for Arden Logistics, effective 1 June.';
  const layout = layoutText(approval, F.body, { measurer: ui.measurer, maxWidth: 560 });
  const hl = progress(t, T.c3.highlight, 0.5, easing.wipe);
  const total = layout.lines.reduce((s, l) => s + l.width, 0);
  let used = 0;
  layout.lines.forEach((line, k) => {
    const share = clamp((hl * total - used) / line.width);
    used += line.width;
    if (share > 0)
      kids.push(
        box(
          `c-mail-hl${k}`,
          28 + line.x,
          top + 226 + line.y + 1,
          (line.width + 8) * share,
          layout.lineHeight - 2,
          4,
          {
            fill: withAlpha(UI.goodSoft, 0.95),
          },
        ),
      );
  });
  kids.push(
    textNode('c-mail-approval', {
      text: approval,
      font: F.bodyStrong,
      fill: UI.text,
      maxWidth: 560,
      transform: { x: 32, y: top + 226 },
    }),
    paragraph(
      ui,
      'c-mail-p2',
      'Please send the updated order form to the customer today, and copy finance.',
      32,
      top + 226 + layout.height + 18,
      F.body,
      560,
    ).node,
    label('c-mail-sign', 'Deal desk', 32, top + 226 + layout.height + 96, F.body, UI.sub),
  );
  return groupNode('c-mail', kids, { transform: { x } });
}

// ---------------------------------------------------------------------------
// A: the COO (ask → plan → work → report → library)
// ---------------------------------------------------------------------------

const TABS = ['Ask', 'Work', 'Reports'] as const;

const PLAN = {
  who: 'Every supplier that delivered late this quarter, and the customers whose orders they touched.',
  measures: ['Days late', 'On-time rate', 'Promises to customers'],
  steps: [
    'Pull delivery logs and supplier emails',
    'Match late orders to customers',
    'Find what we promised, and to whom',
    'Check every figure against its source',
  ],
} as const;

const RESEARCHERS = [
  { name: 'Researcher 1', focus: 'Delivery logs · ERP', searches: [4, 46], items: [60, 1318] },
  { name: 'Researcher 2', focus: 'Supplier emails', searches: [3, 38], items: [41, 864] },
  { name: 'Researcher 3', focus: 'Customer contracts', searches: [2, 29], items: [18, 412] },
  { name: 'Researcher 4', focus: 'Teams threads · tickets', searches: [5, 52], items: [77, 1096] },
] as const;

const CHECKS = [
  'Collected delivery logs for 46 suppliers',
  'Matched 1,318 late order lines to customers',
  'Found 22 promises in emails and chats',
  'Checked every figure against its source',
  'Writing the report',
] as const;

const BARS = [
  { name: 'Kestrel Alloys', days: 9.4 },
  { name: 'Arbor Freight', days: 6.1 },
  { name: 'Halden Plastics', days: 4.8 },
  { name: 'All others', days: 1.2 },
] as const;

const BOTTOM_LINE =
  'Three suppliers caused *71%* of late deliveries this quarter. We promised 14 customers new dates or credits; 3 are still open.';

const LIBRARY = [
  {
    title: 'Renewals at risk, Q2',
    meta: 'Sales ops · Level 3 · 24 Jun',
    v: 3,
    people: [UI.accent, UI.pink, UI.violet],
  },
  {
    title: 'Vendor contract terms',
    meta: 'Legal · Level 3 · 19 Jun',
    v: 2,
    people: [UI.violet, UI.warm],
  },
  { title: 'Hiring plan review', meta: 'HR · Level 1 · 12 Jun', v: 1, people: [UI.pink] },
  {
    title: 'Escalations this month',
    meta: 'Support · Level 3 · 9 Jun',
    v: 4,
    people: [UI.accent, UI.warm],
  },
  {
    title: 'Pricing changes since 2025',
    meta: 'Finance · Level 3 · 2 Jun',
    v: 2,
    people: [UI.warm],
  },
  { title: 'Onboarding time by region', meta: 'Ops · Level 3 · 28 May', v: 1, people: [UI.accent] },
] as const;

/** The elapsed clock (seconds) on the deep run. */
function elapsed(t: number): number {
  const go = T.a2.go;
  if (t < go) return 0;
  if (t < T.a3.race) return lerp(0, 252, (t - go) / (T.a3.race - go));
  if (t < T.a3.raceEnd)
    return lerp(252, 1112, progress(t, T.a3.race, T.a3.raceEnd - T.a3.race, easing.camera));
  return lerp(1112, 1120, clamp((t - T.a3.raceEnd) / (T.a5.done - T.a3.raceEnd)));
}
/** How far the researchers have got (0–1). */
const researched = (t: number) => clamp(elapsed(t) / 1120);

function stationA(ui: Ui, t: number): SceneNode[] {
  const left = DESK.a - WIN.w / 2;
  const kids: (SceneNode | null)[] = [];
  // Which tab is showing: Ask, then Work once it goes ahead, then Reports as the report lands.
  const toWork = progress(t, T.a2.work, 0.35, easing.camera);
  const toReports = progress(t, T.b1.land, 0.45, easing.camera);
  const tabX: number[] = [];
  let x = 600 - 46;
  for (let k = TABS.length - 1; k >= 0; k--) {
    const w = ui.measure(TABS[k] ?? '', F.smallStrong);
    x -= w;
    tabX[k] = x;
    x -= 26;
  }
  const at = (k: number) => tabX[k] ?? 0;
  const wOf = (k: number) => ui.measure(TABS[k] ?? '', F.smallStrong);
  const ux = lerp(lerp(at(0), at(1), toWork), at(2), toReports);
  const uw = lerp(lerp(wOf(0), wOf(1), toWork), wOf(2), toReports);
  const active = toReports > 0.5 ? 2 : toWork > 0.5 ? 1 : 0;
  kids.push(
    mark('a-h-mark', 38, 32, 22),
    label('a-h-name', 'Cowork', 58, 21, F.heading),
    ...TABS.map((name, k) =>
      label(`a-tab${k}`, name, at(k), 23, F.smallStrong, k === active ? UI.text : UI.sub),
    ),
    box('a-tab-line', ux, 60, uw, 3, 1.5, { fill: UI.accent }),
    avatar('a-h-av', 606, 32, 15, UI.warm),
    rule('a-h-rule', 0, 63, WIN.w),
  );

  const asked = progress(t, T.a1.ask + 0.05, 0.3, easing.exit);
  if (asked < 1)
    kids.push(
      groupNode('a-ask', askViewA(ui, t), { opacity: 1 - asked, transform: { y: -20 * asked } }),
    );
  const plan = progress(t, T.a1.ask + 0.3, 0.35, easing.enter);
  if (plan > 0 && toWork < 1)
    kids.push(
      groupNode('a-plan', planViewA(ui, t), {
        opacity: plan * (1 - clamp(toWork * 2)),
        transform: { y: 16 * (1 - plan) },
      }),
    );
  if (toWork > 0 && toReports < 1)
    kids.push(
      groupNode('a-work', workViewA(ui, t), {
        opacity: clamp(toWork * 2 - 1) * (1 - clamp(toReports * 2)),
        transform: { y: 16 * (1 - toWork) },
      }),
    );
  if (toReports > 0)
    kids.push(groupNode('a-lib', libraryViewA(ui, t), { opacity: clamp(toReports * 2 - 1) }));
  // The report sheet, then the sheet shrinking into its row in the library.
  const sheet = progress(t, T.a5.open, 0.55, easing.enter);
  if (sheet > 0) kids.push(reportA(ui, t, lerp(WIN.h, 150, sheet)));

  // Pointers
  const ASK_BTN = askButton(ui);
  const { save: SAVE, go: GO } = planLayout(ui);
  const pa = pointer(
    t,
    [
      { at: T.a1.type + 1.2, x: 520, y: 760 },
      { at: T.a1.level - 0.05, x: LEVEL.x + 2.5 * LEVEL.seg, y: LEVEL.y + 20 },
      { at: T.a1.ask - 0.04, x: ASK_BTN.x + 30, y: ASK_BTN.y + 22 },
    ],
    T.a1.ask + 0.4,
  );
  if (pa)
    kids.push(
      cursor(
        'a-cursor1',
        pa.x,
        pa.y,
        Math.max(pressAt(t, T.a1.level), pressAt(t, T.a1.ask)),
        pa.opacity,
      ),
    );
  kids.push(clickRing('a-ring1', LEVEL.x + 2.5 * LEVEL.seg, LEVEL.y + 20, t, T.a1.level));
  const pb = pointer(
    t,
    [
      { at: T.a2.cursor, x: 560, y: 820 },
      { at: T.a2.save - 0.05, x: SAVE.x + 11, y: SAVE.y + 12 },
      { at: T.a2.go - 0.05, x: GO.x + 40, y: GO.y + 22 },
    ],
    T.a2.go + 0.35,
  );
  if (pb)
    kids.push(
      cursor(
        'a-cursor2',
        pb.x,
        pb.y,
        Math.max(pressAt(t, T.a2.save), pressAt(t, T.a2.go)),
        pb.opacity,
      ),
    );
  const pc = pointer(
    t,
    [
      { at: T.b1.cursor, x: 420, y: 520 },
      { at: T.b1.share - 0.05, x: SHARE.x, y: SHARE.y },
      { at: T.b1.cfo - 0.05, x: 420, y: SHARE.y + 104 },
    ],
    T.b1.cfo + 0.5,
  );
  if (pc)
    kids.push(
      cursor(
        'a-cursor3',
        pc.x,
        pc.y,
        Math.max(pressAt(t, T.b1.share), pressAt(t, T.b1.cfo)),
        pc.opacity,
      ),
    );
  const pd = pointer(
    t,
    [
      { at: T.b2.cursor, x: 380, y: 560 },
      { at: T.b2.refresh - 0.05, x: REFRESH.x, y: REFRESH.y },
    ],
    T.b2.refresh + 0.5,
  );
  if (pd) kids.push(cursor('a-cursor4', pd.x, pd.y, pressAt(t, T.b2.refresh), pd.opacity));

  return [
    personTag(ui, 'a-tag', 'COO', UI.warm, DESK.a, WIN.top - 30),
    windowNode('a-win', { x: left, y: WIN.top, w: WIN.w, h: WIN.h }, kids),
  ];
}

const COMPOSER = { x: 24, y: 136, w: 592, h: 262 } as const;
const LEVEL = { x: 44, y: COMPOSER.y + COMPOSER.h - 58, seg: 82 } as const;
const askButton = (ui: Ui) => {
  const w = Math.round(ui.measure('Ask', F.bodyStrong) + 36 + 24);
  return { x: COMPOSER.x + COMPOSER.w - 20 - w, y: COMPOSER.y + COMPOSER.h - 60, w };
};

function askViewA(ui: Ui, t: number): SceneNode[] {
  const kids: (SceneNode | null)[] = [];
  kids.push(label('a-greet', 'What do you need to know?', 32, 90, F.title));
  kids.push(
    box('a-comp-ring', COMPOSER.x - 4, COMPOSER.y - 4, COMPOSER.w + 8, COMPOSER.h + 8, 24, {
      stroke: { color: withAlpha(UI.accent, 0.16), width: 4 },
    }),
    box('a-comp', COMPOSER.x, COMPOSER.y, COMPOSER.w, COMPOSER.h, 20, {
      fill: UI.surface,
      stroke: { color: UI.accentLine, width: 1.2 },
    }),
    ...typedText(ui, 'a-q', TYPE.a, t, 48, COMPOSER.y + 22, F.ask, 544, 1),
  );
  // Depth: Level 1 → Level 3.
  const sel = lerp(0, 2, progress(t, T.a1.level, 0.35, easing.snap));
  kids.push(box('a-lvl-bg', LEVEL.x, LEVEL.y, LEVEL.seg * 3, 40, 12, { fill: UI.wash }));
  kids.push(
    box('a-lvl-sel', LEVEL.x + 3 + sel * LEVEL.seg, LEVEL.y + 3, LEVEL.seg - 6, 34, 9, {
      fill: UI.surface,
      shadow: elevationShadows(lighting, 'low', { strength: 0.35 }),
    }),
  );
  const chosen = t >= T.a1.level ? 2 : 0;
  ['Level 1', 'Level 2', 'Level 3'].forEach((name, k) =>
    kids.push(
      label(
        `a-lvl${k}`,
        name,
        LEVEL.x + (k + 0.5) * LEVEL.seg,
        LEVEL.y + 11,
        F.smallStrong,
        k === chosen ? UI.text : UI.sub,
        { align: 'center' },
      ),
    ),
  );
  const ask = ui.button('a-askbtn', 'Ask', 0, 0, {
    primary: true,
    icon: 'send',
    press: pressAt(t, T.a1.ask) * 2,
  });
  const at = askButton(ui);
  kids.push(groupNode('a-askpos', [ask.node], { transform: { x: at.x, y: at.y } }));
  // What the level means: swaps as Level 3 is picked.
  const swap = progress(t, T.a1.level + 0.05, 0.3, easing.enter);
  kids.push(icon('a-hint-icon', 'clock', 42, COMPOSER.y + COMPOSER.h + 32, 17, UI.sub));
  kids.push(
    label(
      'a-hint1',
      'Level 1 · Quick answer · 1–5 min',
      60,
      COMPOSER.y + COMPOSER.h + 22,
      F.small,
      UI.sub,
      { opacity: 1 - clamp(swap * 3) },
    ),
    groupNode(
      'a-hint3',
      [
        label(
          'a-hint3-a',
          'Level 3 · Deep analysis',
          60,
          COMPOSER.y + COMPOSER.h + 22,
          F.smallStrong,
          UI.violet,
        ),
        label(
          'a-hint3-b',
          '· 15–100 min · weeks of work in minutes',
          60 + ui.measure('Level 3 · Deep analysis ', F.smallStrong),
          COMPOSER.y + COMPOSER.h + 22,
          F.small,
          UI.sub,
        ),
      ],
      { opacity: clamp(swap * 1.6 - 0.4), transform: { y: 8 * (1 - swap) } },
    ),
  );
  // Recent questions, quiet below.
  const ry = COMPOSER.y + COMPOSER.h + 84;
  kids.push(label('a-recent', 'RECENT', 32, ry, F.tiny, UI.faint));
  [
    ['Which accounts renew next quarter?', 'Level 1'],
    ['Summarise last week’s escalations', 'Level 1'],
    ['Why did churn rise in the north region?', 'Level 3'],
    ['What changed in our vendor terms this year?', 'Level 3'],
  ].forEach(([q = '', lvl = ''], k) => {
    const y = ry + 30 + k * 56;
    kids.push(
      icon(`a-rec${k}-ic`, 'search', 44, y + 18, 17, UI.faint),
      label(`a-rec${k}`, q, 66, y + 7, F.body, UI.sub),
      label(`a-rec${k}-l`, lvl, 608, y + 9, F.small, UI.faint, { align: 'right' }),
      rule(`a-rec${k}-r`, 32, y + 46, 576),
    );
  });
  return kids.filter((n): n is SceneNode => n !== null);
}
const PLAN_CARD = { x: 24, w: 592, h: 472 } as const;

/** Where the plan card and its controls sit (window-local). */
function planLayout(ui: Ui) {
  const q = layoutText(Q.a, F.body, { measurer: ui.measurer, maxWidth: 450 });
  const y0 = 86 + q.height + 20 + 22;
  const cardY = y0 + 36;
  const fy = cardY + PLAN_CARD.h - 66;
  const goW = Math.round(ui.measure('Go ahead', F.bodyStrong) + 36);
  return {
    y0,
    cardY,
    fy,
    save: { x: PLAN_CARD.x + 24, y: fy + 22 },
    go: { x: PLAN_CARD.x + PLAN_CARD.w - 24 - goW, y: fy + 12 },
  };
}

function planViewA(ui: Ui, t: number): SceneNode[] {
  const kids: (SceneNode | null)[] = [];
  const q = bubble(ui, 'a-qb', Q.a, 616, 86, 450);
  kids.push(q.node);
  const { y0, cardY, fy, save: SAVE, go: GO } = planLayout(ui);
  const lvl = ui.chip('a-lvlchip', 'Level 3 · Deep analysis', 0, 0, {
    fill: UI.violetSoft,
    color: UI.violet,
    font: F.tiny,
    height: 22,
  });
  kids.push(
    answerer('a-who', 32, y0),
    groupNode('a-lvlpos', [lvl.node], {
      transform: { x: 32 + 26 + ui.measure('Cowork', F.smallStrong) + 10, y: y0 - 1 },
    }),
  );
  const unfold = progress(t, T.a2.unfold, 0.7, easing.enter);
  if (unfold <= 0) {
    kids.push(
      spinner('a-plan-spin', 41, cardY + 18, 8, t, UI.violet),
      label('a-plan-wait', 'Drafting a plan…', 58, cardY + 8, F.small, UI.sub),
    );
    return kids.filter((n): n is SceneNode => n !== null);
  }
  const h = lerp(56, PLAN_CARD.h, unfold);
  const inside: SceneNode[] = [];
  const item = (k: number) => {
    const p = progress(t, T.a2.unfold + 0.12 + k * 0.07, 0.45, easing.enter);
    return { opacity: p, transform: { y: 10 * (1 - p) } };
  };
  const cx = PLAN_CARD.x + 24;
  inside.push(
    groupNode('a-plan-head', [
      label('a-plan-title', 'Plan', cx, cardY + 18, F.heading),
      label('a-plan-sub', 'Review it before it runs', cx + 48, cardY + 21, F.small, UI.sub),
    ]),
    groupNode(
      'a-plan-who',
      [
        label('a-plan-who-l', 'WHO IS INCLUDED', cx, cardY + 62, F.tiny, UI.faint),
        paragraph(ui, 'a-plan-who-t', PLAN.who, cx, cardY + 82, F.body, 540).node,
      ],
      item(0),
    ),
  );
  let mx = cx;
  const measures: SceneNode[] = [
    label('a-plan-m-l', 'MEASURES', cx, cardY + 150, F.tiny, UI.faint),
  ];
  PLAN.measures.forEach((m, k) => {
    const c = ui.chip(`a-plan-m${k}`, m, mx, cardY + 172, {
      fill: UI.wash,
      color: UI.text,
      font: F.small,
      stroke: UI.line,
    });
    measures.push(c.node);
    mx += c.w + 8;
  });
  inside.push(groupNode('a-plan-measures', measures, item(1)));
  const steps: SceneNode[] = [label('a-plan-s-l', 'STEPS', cx, cardY + 222, F.tiny, UI.faint)];
  PLAN.steps.forEach((s, k) => {
    const y = cardY + 246 + k * 32;
    steps.push(
      box(`a-plan-n${k}`, cx, y + 1, 22, 22, 11, { fill: UI.violetSoft }),
      label(`a-plan-nt${k}`, String(k + 1), cx + 11, y + 3, F.tiny, UI.violet, { align: 'center' }),
      label(`a-plan-st${k}`, s, cx + 34, y, F.body),
    );
  });
  inside.push(groupNode('a-plan-steps', steps, item(2)));
  // Footer: save as a report, go ahead.
  const saved = progress(t, T.a2.save, 0.3, easing.snap);
  const go = ui.button('a-go', 'Go ahead', 0, 0, {
    primary: true,
    press: pressAt(t, T.a2.go) * 2,
    hover: clamp((t - (T.a2.go - 0.3)) / 0.15),
  });
  const edit = ui.button('a-edit', 'Edit plan', 0, 0, {});
  inside.push(
    groupNode(
      'a-plan-foot',
      [
        rule('a-plan-frule', PLAN_CARD.x, fy, PLAN_CARD.w),
        box('a-save-box', SAVE.x, SAVE.y, 22, 22, 6, {
          fill: saved > 0 ? UI.accent : UI.surface,
          stroke: { color: saved > 0 ? UI.accent : UI.line, width: 1.5 },
        }),
        ...(saved > 0
          ? [
              icon('a-save-tick', 'check', SAVE.x + 11, SAVE.y + 11, 18 * saved, UI.surface, {
                width: 2.6,
              }),
            ]
          : []),
        label('a-save-l', 'Save as a report', SAVE.x + 32, SAVE.y + 1, F.body),
        groupNode('a-editpos', [edit.node], { transform: { x: GO.x - 10 - edit.w, y: GO.y } }),
        groupNode('a-gopos', [go.node], { transform: { x: GO.x, y: GO.y } }),
      ],
      item(3),
    ),
  );
  kids.push(
    box('a-plan-card', PLAN_CARD.x, cardY, PLAN_CARD.w, h, 18, {
      fill: UI.surface,
      stroke: { color: UI.line, width: 1.2 },
      shadow: elevationShadows(lighting, 'low', { strength: 0.3 }),
    }),
    groupNode('a-plan-inside', inside, {
      clip: rect(PLAN_CARD.x + PLAN_CARD.w / 2, cardY + h / 2, PLAN_CARD.w, h, 18),
    }),
  );
  kids.push(clickRing('a-ring-save', SAVE.x + 11, SAVE.y + 11, t, T.a2.save));
  return kids.filter((n): n is SceneNode => n !== null);
}

function workViewA(ui: Ui, t: number): SceneNode[] {
  const kids: (SceneNode | null)[] = [];
  const done = t >= T.a5.done;
  kids.push(
    label('a-w-title', 'Supplier delays and promises', 32, 84, F.heading, UI.text, {
      maxWidth: 400,
    }),
  );
  const lvl = ui.chip('a-w-lvl', 'Level 3 · Deep analysis', 0, 0, {
    fill: UI.violetSoft,
    color: UI.violet,
    font: F.tiny,
    height: 22,
  });
  kids.push(groupNode('a-w-lvlpos', [lvl.node], { transform: { x: 32, y: 114 } }));
  if (done) {
    kids.push(
      checkDisc('a-w-done', 32 + lvl.w + 20, 125, 8, progress(t, T.a5.done, 0.4, easing.enter)),
    );
    kids.push(
      label('a-w-status', 'Done · report ready', 32 + lvl.w + 34, 116, F.smallStrong, UI.good),
    );
  } else {
    kids.push(spinner('a-w-spin', 32 + lvl.w + 20, 125, 7, t, UI.violet));
    kids.push(
      label('a-w-status', 'Running · 4 researchers', 32 + lvl.w + 34, 116, F.small, UI.sub),
    );
  }
  kids.push(
    label('a-w-el', 'ELAPSED', 608, 82, F.tiny, UI.faint, { align: 'right' }),
    label('a-w-clock', clockText(elapsed(t)), 608, 100, F.clock, done ? UI.good : UI.text, {
      align: 'right',
    }),
    rule('a-w-rule', 0, 150, WIN.w),
    label('a-w-res', 'Researchers', 32, 170, F.smallStrong),
    label(
      'a-w-res2',
      'in parallel',
      32 + ui.measure('Researchers ', F.smallStrong),
      170,
      F.small,
      UI.sub,
    ),
  );
  const r = researched(t);
  RESEARCHERS.forEach((res, k) => {
    const y = 200 + k * 78;
    const pace = clamp(r * (1 + 0.08 * (k - 1.5)));
    const id = `a-r${k}`;
    kids.push(
      box(`${id}-disc`, 32, y + 6, 38, 38, 12, { fill: UI.violetSoft }),
      icon(`${id}-ic`, 'search', 51, y + 25, 18, UI.violet),
      label(`${id}-name`, res.name, 84, y + 4, F.bodyStrong),
      label(`${id}-focus`, res.focus, 84, y + 28, F.small, UI.sub),
      label(`${id}-sl`, 'Searches', 470, y + 4, F.tiny, UI.faint, { align: 'right' }),
      label(
        `${id}-s`,
        grouped(lerp(res.searches[0], res.searches[1], pace)),
        470,
        y + 22,
        F.mono,
        UI.text,
        { align: 'right' },
      ),
      label(`${id}-il`, 'Items read', 608, y + 4, F.tiny, UI.faint, { align: 'right' }),
      label(
        `${id}-i`,
        grouped(lerp(res.items[0], res.items[1], pace)),
        608,
        y + 22,
        F.mono,
        UI.text,
        { align: 'right' },
      ),
      box(`${id}-track`, 84, y + 56, 524, 4, 2, { fill: UI.wash }),
      box(`${id}-bar`, 84, y + 56, 524 * lerp(0.08, 1, pace), 4, 2, {
        fill: done ? UI.good : UI.violet,
      }),
    );
  });
  kids.push(
    rule('a-w-rule2', 32, 516, 576),
    label('a-w-steps', 'Checklist', 32, 534, F.smallStrong),
  );
  CHECKS.forEach((c, k) => {
    const y = 566 + k * 40;
    const at = T.a3.steps[k] ?? T.a5.done;
    const p = progress(t, at, 0.45, easing.enter);
    const running = p <= 0 && (k === 0 || t >= (T.a3.steps[k - 1] ?? Infinity));
    kids.push(
      running
        ? spinner(`a-c${k}-spin`, 44, y + 11, 8, t, UI.violet)
        : checkDisc(`a-c${k}`, 44, y + 11, 10, p),
      label(`a-c${k}-t`, c, 66, y, F.body, p > 0 ? UI.text : running ? UI.text : UI.faint),
    );
  });
  return kids.filter((n): n is SceneNode => n !== null);
}

function reportA(ui: Ui, t: number, top: number): SceneNode {
  // As the report lands in the library, the sheet shrinks into the top row.
  const land = progress(t, T.b1.land, 0.6, easing.camera);
  const from = { x: 0, y: top, w: WIN.w, h: WIN.h - top + 30, r: 22 };
  const to = { x: LIB.x, y: LIB.top, w: LIB.w, h: LIB.row - 8, r: 14 };
  const f = {
    x: lerp(from.x, to.x, land),
    y: lerp(from.y, to.y, land),
    w: lerp(from.w, to.w, land),
    h: lerp(from.h, to.h, land),
    r: lerp(from.r, to.r, land),
  };
  if (land >= 1) return groupNode('a-report', []);
  const content = 1 - clamp(land * 3);
  const kids: SceneNode[] = [
    box('a-rep-bg', f.x, f.y, f.w, f.h, f.r, {
      fill: UI.surface,
      stroke: { color: withAlpha(UI.line, land), width: 1.2 },
      shadow: [{ x: 0, y: lerp(-8, 6, land), blur: 26, color: withAlpha(UI.shade, 0.12) }],
    }),
  ];
  if (content > 0) {
    const y = f.y;
    const inner: SceneNode[] = [
      label('a-rep-kicker', 'REPORT · v1', 32, y + 24, F.tiny, UI.faint),
      label('a-rep-title', 'Supplier delays and promises', 32, y + 44, F.title),
      label(
        'a-rep-meta',
        'Level 3 · 38 sources · 18 min 40 s · saved to Reports',
        32,
        y + 76,
        F.small,
        UI.sub,
      ),
      box('a-rep-bl', 24, y + 110, 592, 112, 14, { fill: UI.accentSoft }),
      box('a-rep-blbar', 24, y + 110, 4, 112, 2, { fill: UI.accent }),
      label('a-rep-bll', 'BOTTOM LINE', 44, y + 124, F.tiny, UI.accent),
      paragraph(ui, 'a-rep-blt', BOTTOM_LINE, 44, y + 146, F.body, 552).node,
      label('a-rep-ch', 'Average days late, by supplier', 32, y + 246, F.smallStrong),
    ];
    BARS.forEach((b, k) => {
      const by = y + 278 + k * 38;
      const p = progress(t, T.a5.bars + k * 0.09, 0.7, easing.enter);
      const w = (b.days / 10) * 330 * p;
      inner.push(
        label(`a-rep-b${k}-n`, b.name, 32, by + 1, F.small, UI.sub),
        box(`a-rep-b${k}`, 176, by + 2, Math.max(w, 0.01), 20, 6, {
          fill: k < 3 ? UI.accent : UI.line,
        }),
        label(`a-rep-b${k}-v`, `${b.days.toFixed(1)} d`, 184 + w, by + 2, F.mono, UI.text, {
          opacity: clamp(p * 2 - 0.6),
        }),
      );
    });
    inner.push(label('a-rep-src', 'Sources · 38', 32, y + 440, F.smallStrong));
    let sx = 32;
    (
      [
        ['mail', 'Delivery emails · 21'],
        ['doc', 'Logistics logs · 9'],
        ['chat', 'Teams threads · 8'],
      ] as const
    ).forEach(([ic, text], k) => {
      const c = ui.chip(`a-rep-s${k}`, text, sx, y + 468, {
        fill: UI.wash,
        color: UI.text,
        font: F.small,
        icon: ic,
        stroke: UI.line,
      });
      inner.push(c.node);
      sx += c.w + 8;
    });
    kids.push(
      groupNode('a-rep-inner', inner, {
        opacity: content,
        clip: rect(f.x + f.w / 2, f.y + f.h / 2, f.w, f.h, f.r),
      }),
    );
  }
  return groupNode('a-report', kids);
}

const LIB = { x: 16, top: 172, w: 608, row: 84 } as const;
const SHARE = { x: 590, y: LIB.top + 38 } as const;
const REFRESH = { x: 552, y: LIB.top + 38 } as const;

function libraryViewA(ui: Ui, t: number): SceneNode[] {
  const kids: (SceneNode | null)[] = [];
  const flip = progress(t, T.b2.flip, 0.4, easing.camera);
  const q = flip < 0.5 ? 'Q2 2026' : 'Q3 2026';
  const qChip = ui.chip('a-l-q', q, 0, 0, {
    fill: UI.wash,
    color: UI.text,
    icon: 'clock',
    stroke: UI.line,
  });
  kids.push(
    label('a-l-title', 'Reports', 32, 86, F.title),
    label('a-l-sub', "Your company's reports, kept and shared", 32, 116, F.small, UI.sub),
    groupNode('a-l-qpos', [qChip.node], {
      transform: {
        x: 608 - qChip.w / 2,
        y: 98,
        scaleY: Math.max(0.02, Math.abs(Math.cos(Math.PI * flip))),
        originX: qChip.w / 2,
        originY: 14,
      },
    }),
    rule('a-l-rule', 0, 156, WIN.w),
  );
  // Rows below make room: first for the new report, then for the question that builds on it.
  const landed = progress(t, T.b1.land, 0.6, easing.camera);
  const asked = progress(t, T.b2.ask, 0.5, easing.enter);
  const shift = landed * LIB.row + asked * 104;
  LIBRARY.forEach((row, k) => {
    const y = LIB.top + k * LIB.row + shift;
    if (y > WIN.h) return;
    kids.push(libRow(ui, `a-l-r${k}`, row.title, row.meta, `v${row.v}`, row.people, y, 1));
  });
  if (landed >= 1) {
    // The new report: highlighted as new, shared with the CFO, refreshed to v2.
    const fresh = 1 - progress(t, T.b1.land + 0.7, 1.4);
    const refreshed = t >= T.b2.v2;
    const cfo = progress(t, T.b1.cfo, 0.45, easing.snap);
    const people = cfo > 0 ? [UI.warm, UI.accent] : [UI.warm];
    const meta = refreshed
      ? 'COO · Level 3 · Updated 30 Sep'
      : t >= T.b2.refresh + 0.05
        ? 'COO · Level 3 · Refreshing…'
        : 'COO · Level 3 · Updated 30 Jun';
    const glow = Math.max(fresh, 1 - progress(t, T.b2.v2 + 0.3, 1.2));
    kids.push(
      box('a-l-new-bg', LIB.x, LIB.top, LIB.w, LIB.row - 8, 14, {
        fill: UI.surface,
        stroke: { color: UI.line, width: 1.2 },
      }),
      box('a-l-new-glow', LIB.x, LIB.top, LIB.w, LIB.row - 8, 14, {
        fill: UI.accentSoft,
        opacity: clamp(glow),
      }),
      libRow(
        ui,
        'a-l-new',
        'Supplier delays and promises',
        meta,
        refreshed ? 'v2' : 'v1',
        people,
        LIB.top,
        cfo,
        {
          refresh: t >= T.b2.refresh + 0.05 && !refreshed ? t : null,
          v2: progress(t, T.b2.v2, 0.4, easing.snap),
        },
      ),
    );
  }
  if (asked > 0) kids.push(buildsOn(ui, t, asked));
  // Share popover and the toast.
  const pop =
    progress(t, T.b1.share + 0.04, 0.25, easing.enter) *
    (1 - progress(t, T.b1.cfo + 0.08, 0.2, easing.exit));
  if (pop > 0) kids.push(sharePopover(ui, t, pop));
  const toast =
    progress(t, T.b1.toast, 0.4, easing.enter) *
    (1 - progress(t, T.b1.toastEnd, 0.35, easing.exit));
  if (toast > 0) kids.push(toastNode(ui, 'a-toast', 'Shared with CFO', toast));
  kids.push(clickRing('a-ring-share', SHARE.x, SHARE.y, t, T.b1.share));
  kids.push(clickRing('a-ring-ref', REFRESH.x, REFRESH.y, t, T.b2.refresh));
  return kids.filter((n): n is SceneNode => n !== null);
}

function libRow(
  ui: Ui,
  id: string,
  title: string,
  meta: string,
  version: string,
  people: readonly string[],
  y: number,
  newest: number,
  extra: { refresh?: number | null; v2?: number } = {},
): SceneNode {
  const kids: SceneNode[] = [
    box(`${id}-ic-bg`, LIB.x + 14, y + 16, 44, 44, 12, { fill: UI.wash }),
    icon(`${id}-ic`, 'doc', LIB.x + 36, y + 38, 22, UI.sub),
    label(`${id}-title`, ui.fit(title, F.bodyStrong, 300), LIB.x + 72, y + 15, F.bodyStrong),
    label(`${id}-meta`, meta, LIB.x + 72, y + 40, F.small, UI.sub),
  ];
  const v = ui.chip(`${id}-v`, version, 0, 0, {
    fill: UI.wash,
    color: UI.sub,
    font: F.tiny,
    height: 22,
    stroke: UI.line,
  });
  const vs = 1 + 0.25 * Math.sin(Math.PI * clamp(extra.v2 ?? 0));
  kids.push(
    groupNode(`${id}-vpos`, [v.node], {
      transform: { x: 420 + v.w / 2, y: y + 27 + 11, scale: vs, originX: v.w / 2, originY: 11 },
    }),
  );
  people.forEach((c, k) => {
    const s = k === people.length - 1 ? newest : 1;
    if (s <= 0) return;
    kids.push(
      groupNode(
        `${id}-p${k}`,
        [
          box(`${id}-p${k}-ring`, -14, -14, 28, 28, 14, { fill: UI.surface }),
          avatar(`${id}-p${k}-av`, 0, 0, 12, c),
        ],
        { transform: { x: 474 + k * 18, y: y + 38, scale: s } },
      ),
    );
  });
  if (extra.refresh !== undefined) {
    kids.push(
      extra.refresh !== null
        ? spinner(`${id}-spin`, REFRESH.x, y + 38, 8, extra.refresh, UI.accent)
        : icon(`${id}-ref`, 'refresh', REFRESH.x, y + 38, 19, UI.sub),
      icon(`${id}-share`, 'share', SHARE.x, y + 38, 19, UI.sub),
    );
  } else {
    kids.push(icon(`${id}-share`, 'share', SHARE.x, y + 38, 19, UI.faint));
  }
  kids.push(rule(`${id}-rule`, LIB.x + 14, y + LIB.row - 4, LIB.w - 28));
  return groupNode(id, kids);
}

function sharePopover(ui: Ui, t: number, p: number): SceneNode {
  const x = 330;
  const y = SHARE.y + 22;
  const hover = clamp((t - (T.b1.cfo - 0.3)) / 0.12);
  return groupNode(
    'a-pop',
    [
      box('a-pop-bg', x, y, 280, 160, 14, {
        fill: UI.surface,
        stroke: { color: UI.line, width: 1 },
        shadow: elevationShadows(lighting, 'mid', { strength: 0.4 }),
      }),
      label('a-pop-title', 'Share with', x + 18, y + 16, F.smallStrong),
      box('a-pop-input', x + 14, y + 42, 252, 34, 9, {
        fill: UI.wash,
        stroke: { color: UI.line, width: 1 },
      }),
      label('a-pop-ph', 'Add people or teams', x + 26, y + 50, F.small, UI.faint),
      box('a-pop-hover', x + 8, y + 86, 264, 56, 10, { fill: UI.accentSoft, opacity: hover }),
      avatar('a-pop-av', x + 36, y + 114, 15, UI.accent),
      label('a-pop-name', 'CFO', x + 60, y + 96, F.bodyStrong),
      label('a-pop-team', 'Finance', x + 60, y + 118, F.small, UI.sub),
      icon('a-pop-plus', 'plus', x + 248, y + 114, 18, UI.accent),
    ],
    {
      opacity: p,
      transform: { x: x + 140, y, scale: lerp(0.96, 1, p), originX: x + 140, originY: y },
    },
  );
}

function toastNode(ui: Ui, id: string, text: string, p: number): SceneNode {
  const w = ui.measure(text, F.bodyStrong) + 64;
  const x = (WIN.w - w) / 2;
  const y = WIN.h - 92 + 20 * (1 - p);
  return groupNode(
    id,
    [
      box(`${id}-bg`, x, y, w, 48, 24, {
        fill: UI.ink,
        shadow: elevationShadows(lighting, 'mid', { strength: 0.5 }),
      }),
      checkDisc(`${id}-ck`, x + 26, y + 24, 10, clamp(p * 1.4)),
      label(`${id}-t`, text, x + 44, y + 13, F.bodyStrong, UI.surface),
    ],
    { opacity: clamp(p * 1.5) },
  );
}

function buildsOn(ui: Ui, t: number, p: number): SceneNode {
  const y = LIB.top + LIB.row + 4;
  const x = LIB.x + 44;
  const kids: SceneNode[] = [];
  // A thread from the report down to the question built on it.
  const draw = progress(t, T.b2.ask + 0.15, 0.4, easing.enter);
  kids.push(
    shapeNode('a-b-thread', {
      geometry: pathGeometry(
        `M${LIB.x + 36} ${LIB.top + 62}L${LIB.x + 36} ${lerp(LIB.top + 62, y + 44, draw)}${draw >= 1 ? `Q${LIB.x + 36} ${y + 52} ${x} ${y + 52}` : ''}`,
      ),
      stroke: { color: UI.accentLine, width: 2, cap: 'round' },
    }),
  );
  const card: SceneNode[] = [
    box('a-b-bg', x, y + 8, LIB.w - 44, 88, 14, {
      fill: UI.surface,
      stroke: { color: UI.accentLine, width: 1.2 },
      shadow: elevationShadows(lighting, 'low', { strength: 0.3 }),
    }),
    avatar('a-b-av', x + 26, y + 36, 12, UI.pink),
    label('a-b-who', 'Finance team asked', x + 46, y + 26, F.small, UI.sub),
    label('a-b-q', 'How will supplier delays affect Q3 margins?', x + 18, y + 54, F.bodyStrong),
  ];
  const chip = ui.chip('a-b-chip', 'Builds on v2', 0, 0, {
    fill: UI.accentSoft,
    color: UI.accent,
    font: F.tiny,
    height: 22,
    icon: 'link',
  });
  card.push(
    groupNode('a-b-chippos', [chip.node], {
      transform: { x: x + LIB.w - 44 - 16 - chip.w, y: y + 22 },
    }),
  );
  kids.push(groupNode('a-b-card', card, { opacity: p, transform: { y: 14 * (1 - p) } }));
  return groupNode('a-builds', kids);
}

// ---------------------------------------------------------------------------
// D: the HR head and the intern, side by side
// ---------------------------------------------------------------------------

const ANSWER_D =
  "This year's revision averaged *7.2%*, effective 1 April. Bands 3 to 5 rose 8 to 10%, and 412 people were included.";

function stationD(ui: Ui, t: number): SceneNode[] {
  const nodes: SceneNode[] = [];
  const swap = progress(t, T.d3.swap, 0.7, easing.camera);
  const hrX = DESK.d - WIN.w / 2;
  const inX = DESK.d - WIN.w / 2 + HALF.w + HALF.gap;
  // D3: the HR head's window slides away; the intern's opens out to the full width.
  if (swap < 1) {
    const away = progress(t, T.d3.swap, 0.6, easing.exit);
    nodes.push(
      groupNode(
        'd-hr',
        [
          personTag(ui, 'd-hr-tag', 'HR head', UI.pink, hrX + HALF.w / 2, WIN.top - 30),
          windowNode(
            'd-hr-win',
            { x: hrX, y: WIN.top, w: HALF.w, h: WIN.h },
            paneD(ui, t, 'hr', HALF.w),
          ),
        ],
        { transform: { y: 980 * away } },
      ),
    );
  }
  const w = lerp(HALF.w, WIN.w, swap);
  const x = lerp(inX, hrX, swap);
  nodes.push(
    personTag(ui, 'd-in-tag', 'Intern', UI.warm, x + w / 2, WIN.top - 30),
    windowNode('d-in-win', { x, y: WIN.top, w, h: WIN.h }, [
      ...(swap < 0.4
        ? [groupNode('d-in-old', paneD(ui, t, 'intern', HALF.w), { opacity: 1 - clamp(swap * 3) })]
        : []),
      ...(swap > 0 ? linkPaneD(ui, t, w, swap) : []),
    ]),
  );
  return nodes;
}

function paneD(ui: Ui, t: number, who: 'hr' | 'intern', w: number): SceneNode[] {
  const k = who === 'hr' ? TYPE.hr : TYPE.intern;
  const sendAt = who === 'hr' ? T.d1.sendHr : T.d1.sendIntern;
  const id = `d-${who}`;
  const kids: (SceneNode | null)[] = [
    mark(`${id}-mark`, 30, 32, 18),
    label(`${id}-name`, 'Cowork', 46, 22, F.heading),
    rule(`${id}-rule`, 0, 63, w),
  ];
  // Composer
  const sent = progress(t, sendAt, 0.25, easing.exit);
  const cy = WIN.h - 116;
  kids.push(
    box(`${id}-comp`, 12, cy, w - 24, 104, 18, {
      fill: UI.wash,
      stroke: {
        color: sent < 1 && t > (k.times[0] ?? 0) - 0.3 ? UI.accentLine : UI.line,
        width: 1.2,
      },
    }),
  );
  if (sent < 1) {
    if (t < (k.times[0] ?? 0))
      kids.push(label(`${id}-ph`, 'Ask Cowork…', 28, cy + 16, F.body, UI.faint));
    kids.push(
      groupNode(`${id}-typed`, typedText(ui, `${id}-q`, k, t, 28, cy + 14, F.body, w - 90, 1), {
        opacity: 1 - sent,
      }),
    );
  } else {
    kids.push(
      label(`${id}-ph`, 'Ask a follow-up', 28, cy + 16, F.body, UI.faint, {
        opacity: clamp((t - sendAt - 0.3) / 0.3),
      }),
    );
  }
  const typedAll = typed(k, t).length > 0 && sent < 1;
  const press = pressAt(t, sendAt);
  kids.push(
    groupNode(
      `${id}-send`,
      [
        box(`${id}-send-bg`, -17, -17, 34, 34, 17, { fill: typedAll ? UI.accent : UI.line }),
        icon(`${id}-send-ic`, 'send', 0, 0, 18, UI.surface),
      ],
      { transform: { x: w - 42, y: cy + 104 - 32, scale: 1 - 0.1 * press } },
    ),
  );
  // The question rises into the conversation.
  const rise = progress(t, sendAt + 0.04, 0.5, easing.enter);
  if (rise > 0) {
    const q = bubble(ui, `${id}-qb`, Q.d, w - 16, lerp(cy, 84, rise), w - 70);
    kids.push(groupNode(`${id}-qbg`, [q.node], { opacity: clamp(rise * 2) }));
    const y0 = 84 + q.h + 22;
    const thinking = clamp((t - sendAt - 0.4) / 0.3);
    if (who === 'hr') {
      const streamed = lerp(0, 22, progress(t, T.d2.stream, T.d2.streamEnd - T.d2.stream));
      kids.push(
        groupNode(
          `${id}-whoo`,
          [answerer(`${id}-who`, 16, y0, streamed > 0 ? '· 3 sources' : undefined)],
          { opacity: thinking },
        ),
      );
      if (streamed <= 0) {
        kids.push(
          groupNode(
            `${id}-wait`,
            [
              skeleton(`${id}-sk1`, 16, y0 + 36, w - 60, 11, t),
              skeleton(`${id}-sk2`, 16, y0 + 58, w - 100, 11, t + 0.1),
            ],
            { opacity: thinking },
          ),
        );
      } else {
        const para = paragraph(ui, `${id}-ans`, ANSWER_D, 16, y0 + 32, F.body, w - 32, {
          shown: streamed,
        });
        kids.push(para.node);
        const cites = progress(t, T.d2.streamEnd, 0.35, easing.enter);
        if (cites > 0) {
          const c1 = citation(
            ui,
            `${id}-c1`,
            1,
            'doc',
            'Revision policy 2026',
            16,
            y0 + 44 + para.height,
          );
          const c2 = citation(
            ui,
            `${id}-c2`,
            2,
            'doc',
            'Pay committee notes',
            16,
            y0 + 84 + para.height,
          );
          kids.push(
            groupNode(`${id}-cites`, [c1.node, c2.node], {
              opacity: cites,
              transform: { y: 6 * (1 - cites) },
            }),
          );
        }
      }
    } else {
      const empty = progress(t, T.d2.empty, 0.5, easing.enter);
      kids.push(groupNode(`${id}-whoo`, [answerer(`${id}-who`, 16, y0)], { opacity: thinking }));
      if (empty < 1) {
        kids.push(
          groupNode(
            `${id}-wait`,
            [
              skeleton(`${id}-sk1`, 16, y0 + 36, w - 60, 11, t),
              skeleton(`${id}-sk2`, 16, y0 + 58, w - 100, 11, t + 0.1),
            ],
            { opacity: thinking * (1 - empty) },
          ),
        );
      }
      if (empty > 0) {
        kids.push(
          groupNode(
            `${id}-empty`,
            [
              box(`${id}-e-disc`, w / 2 - 26, y0 + 70, 52, 52, 26, { fill: UI.wash }),
              icon(`${id}-e-lock`, 'lock', w / 2, y0 + 96, 24, UI.faint),
              paragraph(
                ui,
                `${id}-e-t`,
                "Nothing you're allowed to see answers this.",
                w / 2,
                y0 + 138,
                F.small,
                w - 70,
                { color: UI.sub, align: 'center' },
              ).node,
            ],
            { opacity: empty },
          ),
        );
      }
    }
  }
  return kids.filter((n): n is SceneNode => n !== null);
}

/** D3: the intern, given the report's link, and the page that won't open. */
function linkPaneD(ui: Ui, t: number, w: number, swap: number): SceneNode[] {
  const kids: SceneNode[] = [
    mark('d-l-mark', 30, 32, 18),
    label('d-l-name', 'Cowork', 46, 22, F.heading),
    rule('d-l-rule', 0, 63, w),
  ];
  const page = progress(t, T.d3.page, 0.4, easing.enter);
  const msg = progress(t, T.d3.message, 0.45, easing.enter);
  if (page < 1) {
    const chat: SceneNode[] = [
      label('d-l-day', 'Today', w / 2, 86, F.tiny, UI.faint, { align: 'center' }),
      avatar('d-l-av', 34, 136, 16, UI.warm),
      label('d-l-from', 'COO', 60, 116, F.bodyStrong),
      label('d-l-time', '11:02', 60 + ui.measure('COO ', F.bodyStrong) + 4, 118, F.small, UI.sub),
      label('d-l-text', 'Sharing the supplier report for Monday:', 60, 140, F.body),
    ];
    const hover = clamp((t - (T.d3.click - 0.3)) / 0.12);
    const link = ui.chip('d-l-link', 'Open report', 0, 0, {
      fill: hover > 0.5 ? UI.accentSoft : UI.wash,
      color: UI.accent,
      icon: 'link',
      stroke: UI.accentLine,
      height: 34,
    });
    chat.push(groupNode('d-l-linkpos', [link.node], { transform: { x: 60, y: 172 } }));
    kids.push(
      groupNode('d-l-chat', chat, {
        opacity: clamp(swap * 2 - 1) * msg * (1 - page),
        transform: { y: 10 * (1 - msg) },
      }),
    );
    const pt = pointer(
      t,
      [
        { at: T.d3.cursor, x: w - 120, y: 520 },
        { at: T.d3.click - 0.05, x: 120, y: 190 },
      ],
      T.d3.click + 0.4,
    );
    if (pt) kids.push(cursor('d-l-cursor', pt.x, pt.y, pressAt(t, T.d3.click), pt.opacity));
    kids.push(
      ...[clickRing('d-l-ring', 120, 190, t, T.d3.click)].filter((n): n is SceneNode => n !== null),
    );
  }
  // Loading bar, then the page that shows nothing of the report, not even its title.
  const load = progress(t, T.d3.click + 0.04, T.d3.page - T.d3.click + 0.05);
  if (load > 0 && page < 1)
    kids.push(box('d-l-load', 0, 63, w * load, 3, 1.5, { fill: UI.accent, opacity: 1 - page }));
  if (page > 0) {
    const cy = 340;
    kids.push(
      groupNode(
        'd-l-page',
        [
          box('d-l-disc', w / 2 - 40, cy - 40, 80, 80, 40, { fill: UI.wash }),
          icon('d-l-lock', 'lock', w / 2, cy, 36, UI.sub, { width: 2.2 }),
          label('d-l-head', "You can't open this", w / 2, cy + 66, F.title, UI.text, {
            align: 'center',
          }),
          paragraph(
            ui,
            'd-l-body',
            "You don't have access to this report. Ask the person who shared it.",
            w / 2,
            cy + 102,
            F.body,
            420,
            { color: UI.sub, align: 'center' },
          ).node,
          groupNode('d-l-btnpos', [ui.button('d-l-btn', 'Request access', 0, 0, {}).node], {
            transform: {
              x: w / 2 - (ui.measure('Request access', F.bodyStrong) + 36) / 2,
              y: cy + 170,
            },
          }),
        ],
        { opacity: page, transform: { y: 12 * (1 - page) } },
      ),
    );
  }
  return kids;
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

export interface Apps {
  readonly ui: Ui;
  readonly coworkCaptions: CoworkCaptions;
  readonly captions: readonly {
    readonly draw: Caption;
    readonly at: number;
    readonly out: number;
  }[];
}

export function createApps(ui: Ui): Apps {
  return {
    ui,
    coworkCaptions: cowork.createCaptions(ui.measurer),
    captions: CAPTIONS.map((c) => ({
      draw: caption(
        `cap-${c.id}`,
        { text: c.text, at: c.at, font: HEADLINE, y: CAPTION_Y, maxWidth: 620, breaks: c.breaks },
        ui.measurer,
      ),
      at: c.at[0] ?? 0,
      out: c.out,
    })),
  };
}

/** Everything above the room at time `t` on the timeline. */
export interface AppsView {
  /** Override the camera (desk point at the frame centre, and zoom). */
  readonly camera?: { readonly x: number; readonly y: number; readonly zoom: number };
  /** Make the captions leave (0–1), or hide them. */
  readonly captionExit?: number;
  readonly captions?: boolean;
}

export function appsWorld(apps: Apps, t: number, view: AppsView = {}): SceneNode[] {
  const { ui } = apps;
  const nodes: SceneNode[] = [];
  // The previous scene, as it ended: its captions leave and the tile flies into the rep's ask bar.
  const intro = t < 1.2;
  const exit = progress(t, 0, T.intro.exit, easing.exit);
  const from = intro ? cowork.state(cowork.duration, apps.coworkCaptions, exit) : null;
  if (from) nodes.push(...paint({ ...from, dial: null, captions: [] }));

  const cam = view.camera ?? { ...camera(t), y: MID };
  const desks: SceneNode[] = [];
  const visible = (x: number) => Math.abs(x - cam.x) < 720 / cam.zoom + 40;
  if (visible(DESK.c)) desks.push(...stationC(ui, t));
  if (visible(DESK.a) && t > 2.5) desks.push(...stationA(ui, t));
  if (visible(DESK.d) && t > 5.5) desks.push(...stationD(ui, t));
  // The tile: from the middle of the frame into the ask bar, where it stays.
  const d = cowork.state(cowork.duration, apps.coworkCaptions).dial;
  if (d) {
    const p = progress(t, T.intro.tile, T.intro.tileMove, easing.camera);
    const left = DESK.c - WIN.w / 2;
    const to = { x: left + DOCK_ICON.x, y: WIN.top + DOCK_ICON.y };
    desks.push(
      tileNode({
        ...d,
        x: lerp(d.x, to.x, p),
        y: lerp(d.y, to.y, p) - 40 * Math.sin(Math.PI * p),
        scale: lerp(d.scale, DOCK_ICON.size / d.size, p),
        sheen: 0,
      }),
    );
  }
  nodes.push(
    groupNode('desks', desks, {
      transform: { x: CX, y: MID, scale: cam.zoom, originX: cam.x, originY: cam.y },
    }),
  );
  if (from) nodes.push(...from.captions);
  if (view.captions === false) return nodes;
  for (const c of apps.captions) {
    if (t < c.at - 0.1 || t > c.out + 0.45) continue;
    nodes.push(c.draw(t, Math.max(view.captionExit ?? 0, progress(t, c.out, 0.35, easing.exit))));
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Sound (on the same timeline), and each scene's share of it
// ---------------------------------------------------------------------------

const click = (gain = 0.5, pan = 0) => key({ degree: 4, take: 1, gain, pan });

function typingCues(k: Typing, gain: number, pan: number): Cues {
  return k.times.map((at, i) =>
    k.text[i] === ' '
      ? []
      : cue(
          at,
          key({ degree: 7, take: i, gain: gain * (0.75 + 0.5 * random('keys', k.text, i)), pan }),
        ),
  );
}

const CUES: readonly Cues[] = [
  // The window opens out of the tile; the inbox comes to rest.
  cue(T.intro.tile, whoosh(0.8, { from: 1800, to: 500, peak: 0.4, gain: 0.45 })),
  cue(T.intro.open + 0.5, pop({ degree: 4, gain: 0.45 })),
  cue(T.scroll.start, whoosh(1.2, { from: 900, to: 300, peak: 0.1, gain: 0.25 })),
  cue(T.c1.click, click()),
  typingCues(TYPE.c, 0.3, -0.1),
  cue(T.c1.send, pop({ degree: 7, gain: 0.55 })),
  // A1
  typingCues(TYPE.a, 0.26, 0.1),
  cue(T.a1.level, snap({ degree: 4, gain: 0.45 })),
  cue(T.a1.ask, pop({ degree: 9, gain: 0.5 })),
  // D1: two people typing at once.
  typingCues(TYPE.hr, 0.22, -0.35),
  typingCues(TYPE.intern, 0.22, 0.35),
  cue(T.d1.sendHr, pop({ degree: 4, gain: 0.4, pan: -0.3 })),
  cue(T.d1.sendIntern, pop({ degree: 7, gain: 0.4, pan: 0.3 })),
  // A2: the plan unfolds; save; go.
  cue(T.a2.unfold, whoosh(0.7, { from: 400, to: 2400, peak: 0.5, gain: 0.4 })),
  cue(T.a2.unfold + 0.15, pluck({ degree: 2, octave: 1, gain: 0.4 })),
  cue(T.a2.save, click()),
  cue(T.a2.save + 0.05, pluck({ degree: 7, octave: 2, gain: 0.35 })),
  cue(T.a2.go, snap({ degree: 0, gain: 0.6 })),
  // C2: the answer was waiting.
  cue(T.c2.sweep, bell({ degree: 4, gain: 0.4 })),
  // A3: researchers and the racing clock; checks up the scale.
  cue(T.a3.race, whoosh(T.a3.raceEnd - T.a3.race, { from: 300, to: 2400, peak: 0.85, gain: 0.35 })),
  T.a3.steps
    .slice(1)
    .map((at, k) => cue(at, pluck({ degree: [4, 7, 9][k] ?? 0, octave: 2, gain: 0.4 }))),
  // D2: the HR head's answer; the intern's stays empty.
  cue(T.d2.stream, bell({ degree: 7, gain: 0.35, pan: -0.3 })),
  cue(T.d2.empty + 0.1, thump({ gain: 0.3, pan: 0.3 })),
  cue(T.d2.streamEnd, pop({ degree: 4, gain: 0.35, pan: -0.3 })),
  // C3: the source opens; the line is highlighted.
  cue(T.c3.click, click()),
  cue(T.c3.open, whoosh(0.5, { from: 2000, to: 700, peak: 0.3, gain: 0.35 })),
  cue(T.c3.highlight, tick({ degree: 9, gain: 0.5 })),
  // A5: the report, and the clock stops.
  cue(T.a5.open, whoosh(0.55, { from: 500, to: 2200, peak: 0.5, gain: 0.4 })),
  cue(T.a5.done + 0.05, ding({ degree: 4, gain: 0.4 })),
  BARS.map((_, k) =>
    cue(T.a5.bars + k * 0.09 + 0.1, pluck({ degree: [0, 2, 4, 7][k] ?? 0, octave: 1, gain: 0.3 })),
  ),
  // B1: lands in the library; shared with the CFO.
  cue(T.b1.land + 0.5, slap({ gain: 0.5 })),
  cue(T.b1.share, click()),
  cue(T.b1.cfo, click()),
  cue(T.b1.cfo + 0.1, pop({ degree: 7, gain: 0.45 })),
  cue(T.b1.toast + 0.1, ding({ degree: 7, gain: 0.35 })),
  // D3: the link, and the locked page.
  cue(T.d3.message, pop({ degree: 2, gain: 0.35 })),
  cue(T.d3.click, click()),
  cue(T.d3.page, thump({ gain: 0.45 })),
  cue(T.d3.page + 0.02, pluck({ degree: 0, octave: 0, gain: 0.45 })),
  // B2: next quarter, refresh, version 2, built on.
  cue(T.b2.flip, tick({ degree: 4, gain: 0.5 })),
  cue(T.b2.refresh, click()),
  cue(T.b2.refresh + 0.05, whoosh(0.55, { from: 600, to: 1800, peak: 0.6, gain: 0.3 })),
  cue(T.b2.v2, pop({ degree: 9, gain: 0.5 })),
  cue(T.b2.ask + 0.1, pluck({ degree: 4, octave: 2, gain: 0.4 })),
  cue(T.b2.ask + 0.5, bell({ degree: 0, gain: 0.45 })),
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
export function cuesBetween(from: number, to: number, at: number): SoundEvent[] {
  const flat: SoundEvent[] = [];
  const walk = (c: Cues) => {
    if ('sound' in c) flat.push(c);
    else c.forEach(walk);
  };
  CUES.forEach(walk);
  return flat
    .filter((c) => c.at >= from && c.at < to)
    .map((c) => ({ ...c, at: c.at - from + at, gain: (c.gain ?? 1) * MIX }));
}

/** Timeline moments only the montage shows. */
export const OFF_CAMERA = T.c1b;

/** One scene's sounds, timed from its own start (cues from earlier scenes ring on in the video). */
export function appsCues(scene: AppsScene): Cues[] {
  const { start, end } = SCENES[scene];
  const flat: SoundEvent[] = [];
  const walk = (c: Cues) => {
    if ('sound' in c) flat.push(c);
    else c.forEach(walk);
  };
  CUES.forEach(walk);
  return [
    cue(0.05, pad(end - start - 0.4, { chord: CHORD[scene], attack: 0.5, release: 1, gain: 0.55 })),
    ...flat
      .filter((c) => c.at >= start && c.at < end)
      .map((c) => ({ ...c, at: c.at - start, gain: (c.gain ?? 1) * MIX })),
  ];
}

/** Every font the application scenes use. */
export const APPS_FONTS = [...STORY_FONTS, ...UI_FONTS] as const;

/** A scene of the queries video that shows `scene`'s stretch of this timeline. */
export function defineAppsScene(scene: AppsScene, id: string, title: string) {
  const { start, end } = SCENES[scene];
  return defineSceneComposition({
    ...phoneDefaults,
    fonts: [...phoneDefaults.fonts, ...APPS_FONTS],
    id,
    seed: id,
    title,
    audio: soundtrack(appsCues(scene)),
    duration: end - start,
    background: theme.colors.paper,
    renderer: 'svg',
    setup: () => createApps(createUi(createCanvasMeasurer())),
    scene: (t, _ctx, apps) => ({
      camera: wall.camera(wall.end),
      world: [wall.room, ...appsWorld(apps, start + t)],
    }),
  });
}
