/**
 * The Cowork film's product scenes, each drawn on its group of the board
 * (group-local px, 720 × 1280), from its content time `c`: seconds after
 * the scene's intro card has lifted (negative while the card still covers
 * it, when each scene shows its starting state).
 *
 * - The ask (scene 4): only the input box, dressed for the film, with what
 *   the person does in it: one question typed in Quick answer, the mode
 *   menu opened and Deep research picked, then sent.
 * - The work (scene 5): planning and processing as graphics and short
 *   labels: the plan's steps, researchers reading mail, Teams and files in
 *   parallel, the checker, the report.
 * - The answers (scene 6): the product's own components (Grid look): the
 *   answer, its sources, then the report, each with the benefit it brings.
 *
 * Every time is on the film's beat grid, and each scene's sounds are timed
 * from the same tables (`ASK_CUES`, `WORK_CUES`, `ANSWERS_CUES`).
 */
import {
  clamp,
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
} from '@html-animation-engine/core';
import { connector, elevationShadows, glowShadows } from '@html-animation-engine/renderers';
import { beats, gridTimes } from './cowork-beat.js';
import {
  C,
  face,
  icon,
  lighting,
  look,
  puck,
  sparkleStar,
  tone,
  type IconName,
  type Look,
  type Meaning,
} from './cowork-look.js';
import {
  G,
  GR,
  PF,
  answerMeta,
  answerText,
  hairline,
  monoChip,
  userMessage,
} from './cowork-product.js';
import { caret, clickRing, cursor, icon as uiIcon, pressAt, type Ui } from './cowork-ui.js';
import { bell, cue, ding, key, pluck, pop, snap, tap, tick, whoosh, type Cues } from './sounds.js';

const { easing } = look;

/** The scenes' own type (the film's, Soft Calm). */
const F = {
  ask: face('body', 26, { lineHeight: 1.35 }),
  chip: face('label', 18),
  menuTitle: face('title', 24, { weight: 500 }),
  menuSub: face('body', 18, { lineHeight: 1.35 }),
  status: face('body', 17),
  label: face('title', 22, { weight: 500 }),
  meta: face('mono', 15, { letterSpacing: 0.2 }),
  step: face('body', 18),
  benefit: face('title', 22, { weight: 500 }),
  benefitSub: face('mono', 14, { letterSpacing: 0.2 }),
} satisfies Record<string, FontSpec>;
export const SCENE_FONTS: readonly FontSpec[] = Object.values(F);

/** Everything the scenes measure and draw with. */
export interface SceneKit {
  readonly look: Look;
  readonly ui: Ui;
}

// ---------------------------------------------------------------------------
// Shared: typing, pointers, benefit callouts
// ---------------------------------------------------------------------------

interface Typing {
  readonly text: string;
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
const typedAt = (k: Typing, t: number) => k.text.slice(0, k.times.filter((at) => at <= t).length);

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
    const duration = Math.min(0.2 + dist / 1500, b.at - a.at - 0.04, 0.5);
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

/** One soft tap for every fifth keystroke, each on the nearest sixteenth. */
function typingCues(k: Typing, at: (c: number) => number, gain: number): Cues {
  const cues: Cues[] = [];
  let n = 0;
  k.times.forEach((t, i) => {
    if (k.text[i] === ' ' || n++ % 5 !== 0) return;
    cues.push(cue(at(t), tap({ take: i, gain: gain * (0.75 + 0.5 * random('keys', k.text, i)) })));
  });
  return cues;
}

/**
 * A benefit, in the film's voice: a Cloud callout with a meaning dot, a
 * short Sora line and a lowercase mono line, arriving at `p` (0–1).
 */
function benefit(
  kit: SceneKit,
  id: string,
  x: number,
  y: number,
  text: string,
  sub: string,
  meaning: Meaning,
  p: number,
  /** A light-violet highlighter swept behind the main line (0–1). */
  marker = 0,
): SceneNode | null {
  if (p <= 0) return null;
  const m = kit.look.measurer;
  const tw = m.measure(text, F.benefit);
  const w = Math.max(tw, m.measure(sub, F.benefitSub)) + 64;
  const h = 76;
  const lh = F.benefit.size * (F.benefit.lineHeight ?? 1.2);
  const mw = (tw + 12) * clamp(marker);
  return groupNode(
    id,
    [
      shapeNode(`${id}-bg`, {
        geometry: rect(w / 2, h / 2, w, h, 18),
        fill: withAlpha(C.surface.paper, 0.97),
        stroke: { color: C.stroke.hairline, width: 1 },
        shadow: elevationShadows(lighting, 'mid', { strength: 0.8 }),
      }),
      shapeNode(`${id}-dot`, { geometry: rect(26, 27, 11, 11, 5.5), fill: tone(meaning).fill }),
      ...(mw > 0.5
        ? [
            shapeNode(`${id}-mark`, {
              geometry: rect(36 + mw / 2, 12 + lh * 0.56, mw, lh * 0.72, 7),
              fill: withAlpha(C.brand.soft, 0.85),
            }),
          ]
        : []),
      textNode(`${id}-t`, {
        text,
        font: F.benefit,
        fill: C.text.primary,
        transform: { x: 42, y: 12 },
      }),
      textNode(`${id}-s`, {
        text: sub,
        font: F.benefitSub,
        fill: C.text.tertiary,
        transform: { x: 42, y: 46 },
      }),
    ],
    { transform: { x, y: y + 10 * (1 - p) }, opacity: clamp(p * 1.4) },
  );
}

// ---------------------------------------------------------------------------
// Scene 4: the ask
// ---------------------------------------------------------------------------

/**
 * What happens in the box (content time, s): one question typed in the
 * default mode, Quick answer; the mode menu opened and Deep research picked;
 * then send, and the box says it plans first.
 */
export const ASK = gridTimes({
  cursor: 0.1,
  focus: 0.45,
  type: 0.6,
  menu: 2.6,
  hover: 3.1,
  pick: 3.55,
  send: 4.0,
} as const);
export const ASK_Q = 'Which suppliers slowed deliveries, and what did we promise customers?';
/** The question the answers scene answers (its own: the ask now shows only the deep one). */
const ANSWER_Q = 'What rate did we approve for the renewal?';
const TYPED = typing('ask-q', ASK_Q, ASK.type, 40);

/** The box (group-local, centred) and its level menu. */
export const BOX = { cx: 360, cy: 600, w: 624, h: 176, r: 30 } as const;
const ROW_Y = BOX.cy + BOX.h / 2 - 42;
const SEND = { x: BOX.cx + BOX.w / 2 - 50, y: ROW_Y, r: 26 } as const;
const MENU = { x: BOX.cx - BOX.w / 2 + 6, y: BOX.cy + BOX.h / 2 + 16, w: 560, row: 96 } as const;
/** The two modes (the product's Level 1 and Level 3, named for what they do). */
const LEVELS = {
  1: {
    name: 'Quick answer',
    line: 'For everyday questions',
    icon: 'bolt',
    meaning: 'time',
  },
  3: {
    name: 'Deep research',
    line: 'For questions that need a plan',
    icon: 'plan',
    meaning: 'brand',
  },
} as const satisfies Record<1 | 3, { icon: IconName; meaning: Meaning } & Record<string, string>>;

/** The level chip's box (left edge, row centre) for `level`. */
/** The chip's parts: the level icon, its name, then a drawn chevron (left edges, from the chip's left). */
const CHIP = { text: 42, gap: 12, chevron: 16, pad: 18, h: 42 } as const;
function chipBox(kit: SceneKit, level: 1 | 3) {
  const textW = kit.look.measurer.measure(LEVELS[level].name, F.chip);
  const w = CHIP.text + textW + CHIP.gap + CHIP.chevron + CHIP.pad;
  return { x: BOX.cx - BOX.w / 2 + 24, y: ROW_Y - CHIP.h / 2, w, h: CHIP.h, textW };
}

export function askArt(kit: SceneKit, c: number): SceneNode[] {
  const level: 1 | 3 = c >= ASK.pick ? 3 : 1;
  const lvl = LEVELS[level];
  const meaning = tone(lvl.meaning);
  const focus = progress(c, ASK.focus, 0.25, easing.enter);
  const pick = progress(c, ASK.pick, 0.35, easing.snap);
  // The question: typed, then (once the mode is switched) sent up and out of the box.
  const sent = progress(c, ASK.send, 0.4, easing.exit);
  const text = c < ASK.send ? typedAt(TYPED, c) : '';
  const leaving = c >= ASK.send && c < ASK.send + 0.4 ? ASK_Q : '';
  const nodes: SceneNode[] = [];
  const left = BOX.cx - BOX.w / 2;
  const top = BOX.cy - BOX.h / 2;
  // Its light: a soft glow in the level's colour, stronger while focused and at each send.
  const flare = Math.max(
    Math.sin(Math.PI * clamp((c - ASK.send) / 0.6)),
    Math.sin(Math.PI * clamp((c - ASK.pick) / 0.7)),
  );
  const glowColor = level === 3 ? C.meet.violet : C.meet.amber;
  nodes.push(
    shapeNode('ask-aura', {
      geometry: rect(BOX.cx, BOX.cy, BOX.w + 60, BOX.h + 60, BOX.r + 30),
      fill: withAlpha(glowColor, 0.16 + 0.12 * focus + 0.2 * flare),
      blur: 34,
    }),
  );
  // A border of moving colour: a gradient turning slowly round the box.
  const a = 0.5 * c + 0.4;
  const [dx, dy] = [Math.cos(a) * BOX.w * 0.5, Math.sin(a) * BOX.h * 0.9];
  nodes.push(
    shapeNode('ask-ring', {
      geometry: rect(BOX.cx, BOX.cy, BOX.w + 5, BOX.h + 5, BOX.r + 2.5),
      fill: linearGradient(BOX.cx - dx, BOX.cy - dy, BOX.cx + dx, BOX.cy + dy, [
        { offset: 0, color: withAlpha(C.meet.violet, 0.55 + 0.35 * focus) },
        { offset: 0.35, color: withAlpha(C.meet.blue, 0.5 + 0.3 * focus) },
        { offset: 0.7, color: withAlpha(C.meet.pink, 0.45 + 0.3 * focus) },
        {
          offset: 1,
          color: withAlpha(level === 3 ? C.meet.violet : C.meet.amber, 0.55 + 0.35 * focus),
        },
      ]),
    }),
    shapeNode('ask-panel', {
      geometry: rect(BOX.cx, BOX.cy, BOX.w, BOX.h, BOX.r),
      fill: linearGradient(0, top, 0, top + BOX.h, [C.surface.paper, C.surface.paper]),
      shadow: elevationShadows(lighting, 'high', { strength: 0.7 }),
    }),
    // A glassy top sheen.
    shapeNode('ask-sheen', {
      geometry: rect(BOX.cx, top + 26, BOX.w - 30, 40, 20),
      fill: linearGradient(0, top + 6, 0, top + 46, [
        withAlpha(C.surface.paper, 0),
        withAlpha(C.brand.tint, 0.35),
      ]),
      opacity: 0.6,
    }),
  );
  // The text area: placeholder, typed question, caret.
  const tx = left + 32;
  const ty = top + 26;
  const tw = BOX.w - 64;
  const statusOn = c >= ASK.send + 0.4;
  if (text.length === 0 && !leaving && !statusOn)
    nodes.push(
      textNode('ask-ph', {
        text: 'Ask across your workspace…',
        font: F.ask,
        fill: C.text.tertiary,
        transform: { x: tx, y: ty },
      }),
    );
  if (text.length > 0)
    nodes.push(
      textNode('ask-text', {
        text,
        font: F.ask,
        fill: C.text.primary,
        maxWidth: tw,
        transform: { x: tx, y: ty },
      }),
    );
  if (leaving) {
    const p = sent;
    nodes.push(
      textNode('ask-leaving', {
        text: leaving,
        font: F.ask,
        fill: C.text.primary,
        maxWidth: tw,
        transform: { x: tx, y: ty - 46 * p },
        opacity: 1 - p,
      }),
    );
  }
  if (focus > 0.5 && !leaving) {
    const layout = layoutText(text || ' ', F.ask, { measurer: kit.look.measurer, maxWidth: tw });
    const line = layout.lines[layout.lines.length - 1];
    const lh = F.ask.size * (F.ask.lineHeight ?? 1.2);
    const space = text.endsWith(' ') ? kit.look.measurer.measure(' ', F.ask) : 0;
    const cx = text && line ? tx + line.x + line.width + space + 2 : tx;
    const k = TYPED;
    const idle = text.length === 0 ? -10 : text.length < k.text.length ? Infinity : k.end;
    const node = caret(
      'ask-caret',
      cx,
      ty + (line?.y ?? 0) + lh * 0.14,
      lh * 0.72,
      c,
      idle,
      C.brand.fill,
    );
    if (node) nodes.push(node);
  }
  // What the box says once it is sent: Deep research plans first.
  const st = progress(c, ASK.send + 0.42, 0.3, easing.enter);
  if (st > 0)
    nodes.push(
      groupNode(
        'ask-st',
        [kit.look.status('ask-st-s', 'Planning first · Deep research', tx, ty + 18, 'brand')],
        { opacity: st },
      ),
    );
  // The mode chip: its icon, name and colour change as Deep research is picked.
  const chip = chipBox(kit, level);
  const pop = 1 + 0.08 * Math.sin(Math.PI * pick);
  nodes.push(
    groupNode(
      'ask-chip',
      [
        shapeNode('ask-chip-bg', {
          geometry: rect(chip.w / 2, 0, chip.w, chip.h, chip.h / 2),
          fill: meaning.bg,
          stroke: { color: withAlpha(meaning.fill, 0.5), width: 1 },
          ...(level === 3
            ? { shadow: glowShadows(lighting, C.brand.glow, { radius: 16, strength: pick }) }
            : {}),
        }),
        icon('ask-chip-i', lvl.icon, 24, 0, 20, meaning.fg, 1.8),
        textNode('ask-chip-t', {
          text: lvl.name,
          font: F.chip,
          fill: meaning.fg,
          transform: { x: CHIP.text, y: -(F.chip.size * (F.chip.lineHeight ?? 1.2)) / 2 },
        }),
        // The dropdown's chevron: drawn, broad and centred on the row like the icon and name.
        shapeNode('ask-chip-chev', {
          geometry: pathGeometry('M-8 -3.5L0 4L8 -3.5'),
          stroke: { color: meaning.fg, width: 2, cap: 'round', join: 'round' },
          transform: { x: CHIP.text + chip.textW + CHIP.gap + CHIP.chevron / 2, y: 0.5 },
        }),
      ],
      { transform: { x: chip.x, y: ROW_Y, scale: pop, originX: 0, originY: 0 } },
    ),
  );
  // Send: violet once there is something to send, pressed on each send.
  const ready = text.length > 0;
  const press = pressAt(c, ASK.send);
  nodes.push(
    groupNode(
      'ask-send',
      [
        shapeNode('ask-send-bg', {
          geometry: rect(0, 0, 2 * SEND.r, 2 * SEND.r, 14),
          fill: ready ? C.brand.fill : C.stroke.hairline,
          ...(ready ? { shadow: glowShadows(lighting, C.brand.glow, { radius: 14 }) } : {}),
        }),
        icon('ask-send-i', 'send', 0, 0, 24, C.text.onBrand, 2.2),
      ],
      { transform: { x: SEND.x, y: SEND.y, scale: 1 - 0.1 * press } },
    ),
  );
  // The send throws a few sparks of light from the button.
  for (const at of [ASK.send]) {
    const p = (c - at) / 0.6;
    if (p <= 0 || p >= 1) continue;
    for (let k = 0; k < 7; k++) {
      const ang = -Math.PI / 2 + (random('ask-spark', at, k) - 0.5) * 2.4;
      const dist = 30 + 60 * p * (0.6 + 0.4 * random('ask-spark-d', at, k));
      nodes.push(
        shapeNode(`ask-spark-${at.toFixed(2)}-${k}`, {
          geometry: rect(SEND.x + Math.cos(ang) * dist, SEND.y + Math.sin(ang) * dist, 6, 6, 3),
          fill: k % 2 ? C.meet.violet : C.meet.blue,
          opacity: 1 - p,
        }),
      );
    }
  }
  // The mode menu: opened from the chip, the two modes and what each is for.
  const menu =
    progress(c, ASK.menu + 0.03, 0.25, easing.enter) *
    (1 - progress(c, ASK.pick + 0.08, 0.2, easing.exit));
  if (menu > 0) nodes.push(levelMenu(kit, c, menu));
  // The pointer: into the box, aside while typing, the chip, Deep research, send.
  const p = pointer(
    c,
    [
      { at: ASK.cursor, x: 560, y: 900 },
      { at: ASK.focus - 0.04, x: left + 260, y: ty + 18 },
      { at: ASK.type + 0.5, x: left + 420, y: top + BOX.h + 60 },
      { at: ASK.menu - 0.04, x: chip.x + chip.w / 2, y: ROW_Y },
      { at: ASK.menu + 0.3, x: MENU.x + 200, y: MENU.y + 8 + MENU.row / 2 },
      { at: ASK.hover, x: MENU.x + 220, y: MENU.y + 8 + MENU.row * 1.5 },
      { at: ASK.pick - 0.04, x: MENU.x + 230, y: MENU.y + 8 + MENU.row * 1.5 },
      { at: ASK.send - 0.04, x: SEND.x, y: SEND.y },
    ],
    ASK.send + 0.45,
  );
  if (p)
    nodes.push(
      cursor(
        'ask-cursor',
        p.x,
        p.y,
        Math.max(
          pressAt(c, ASK.focus),
          pressAt(c, ASK.menu),
          pressAt(c, ASK.pick),
          pressAt(c, ASK.send),
        ),
        p.opacity,
      ),
    );
  for (const [id, at, x, y] of [
    ['ask-ring1', ASK.focus, left + 260, ty + 18],
    ['ask-ring2', ASK.menu, chip.x + chip.w / 2, ROW_Y],
    ['ask-ring3', ASK.pick, MENU.x + 230, MENU.y + 8 + MENU.row * 1.5],
  ] as const) {
    const r = clickRing(id, x, y, c, at);
    if (r) nodes.push(r);
  }
  return nodes;
}

/** The dropdown: Quick answer and Deep research, each with its icon and what it is for. */
function levelMenu(kit: SceneKit, c: number, p: number): SceneNode {
  const h = 2 * MENU.row + 16;
  const hover: 1 | 3 = c >= ASK.hover - 0.1 ? 3 : 1;
  const rows = ([1, 3] as const).map((level, k) => {
    const L = LEVELS[level];
    const t = tone(L.meaning);
    const y = MENU.y + 8 + k * MENU.row;
    const on = hover === level;
    return groupNode(`ask-menu-r${level}`, [
      ...(on
        ? [
            shapeNode(`ask-menu-on${level}`, {
              geometry: rect(MENU.x + MENU.w / 2, y + MENU.row / 2, MENU.w - 16, MENU.row - 6, 16),
              fill: t.bg,
            }),
          ]
        : []),
      shapeNode(`ask-menu-disc${level}`, {
        geometry: rect(MENU.x + 44, y + MENU.row / 2, 44, 44, 14),
        fill: on ? C.surface.paper : t.bg,
        stroke: { color: withAlpha(t.fill, 0.4), width: 1 },
      }),
      icon(`ask-menu-i${level}`, L.icon, MENU.x + 44, y + MENU.row / 2, 22, t.fg, 1.8),
      textNode(`ask-menu-t${level}`, {
        text: L.name,
        font: F.menuTitle,
        fill: C.text.primary,
        transform: { x: MENU.x + 84, y: y + 16 },
      }),
      textNode(`ask-menu-s${level}`, {
        text: L.line,
        font: F.menuSub,
        fill: C.text.secondary,
        transform: { x: MENU.x + 84, y: y + 52 },
      }),
    ]);
  });
  return groupNode(
    'ask-menu',
    [
      shapeNode('ask-menu-bg', {
        geometry: rect(MENU.x + MENU.w / 2, MENU.y + h / 2, MENU.w, h, 22),
        fill: C.surface.paper,
        stroke: { color: C.stroke.hairline, width: 1 },
        shadow: elevationShadows(lighting, 'high', { strength: 0.8 }),
      }),
      ...rows,
    ],
    {
      opacity: clamp(p * 1.5),
      transform: {
        x: MENU.x,
        y: MENU.y - 10 * (1 - p),
        scale: lerp(0.96, 1, p),
        originX: MENU.x,
        originY: MENU.y,
      },
    },
  );
}

/** The ask's sounds, at film time `at(c)`. */
export function askCues(at: (c: number) => number): Cues {
  const click = () => key({ degree: 4, take: 1, gain: 0.5 });
  return [
    cue(at(ASK.focus), click()),
    typingCues(TYPED, at, 0.3),
    cue(at(ASK.menu), click()),
    cue(at(ASK.menu + 0.05), whoosh(0.3, { from: 2400, to: 900, peak: 0.3, gain: 0.25 })),
    cue(at(ASK.hover), tick({ degree: 7, gain: 0.3 })),
    cue(at(ASK.pick), snap({ degree: 4, gain: 0.5 })),
    cue(at(ASK.pick + 0.05), bell({ degree: 9, gain: 0.3 })),
    cue(at(ASK.send), pop({ degree: 9, gain: 0.55 })),
    cue(at(ASK.send + 0.05), whoosh(0.45, { from: 700, to: 3600, peak: 0.45, gain: 0.35 })),
    cue(at(ASK.send + 0.35), pluck({ degree: 4, octave: 2, gain: 0.3 })),
  ];
}

// ---------------------------------------------------------------------------
// Scene 5: the work
// ---------------------------------------------------------------------------

/**
 * One stage at a time, close up (the plan, the researchers, the checker),
 * then the full picture with what it means for you (content time, s).
 */
export const WORK = gridTimes({
  plan: 0,
  steps: 0.15,
  // Each stage holds longer than first timed, so it can be read close up (the plan
  // three beats, the researchers two; the answers scene's closing view gave two).
  lanes: 1.3 + beats(3),
  check: 2.35 + beats(5),
  full: 3.05 + beats(6),
  benefit: 3.65 + beats(6),
} as const);
/** Each step of the plan lands this long after the one before. */
const STEP_EVERY = 0.2;

/**
 * Where the film's camera looks in the work group (group-local focus point
 * and zoom), from each `at` (content time) over `duration`: close on each
 * stage in turn, then back to the whole diagram.
 */
export const WORK_SHOTS: readonly {
  at: number;
  duration: number;
  view: { x: number; y: number; zoom: number };
}[] = [
  { at: -10, duration: 0, view: { x: 360, y: 640, zoom: 1 } },
  { at: -0.7, duration: 0.7, view: { x: 360, y: 350, zoom: 1.45 } },
  { at: WORK.lanes - 0.2, duration: 0.45, view: { x: 360, y: 690, zoom: 1.6 } },
  { at: WORK.check - 0.2, duration: 0.45, view: { x: 360, y: 965, zoom: 1.6 } },
  { at: WORK.full, duration: 0.6, view: { x: 360, y: 700, zoom: 1 } },
];

/** The plan: four steps in order, each with who does it. */
const PLAN_STEPS: readonly { icon: IconName; text: string; meaning: Meaning }[] = [
  { icon: 'insight', text: 'Split the question', meaning: 'brand' },
  { icon: 'search', text: 'Read every source', meaning: 'knowledge' },
  { icon: 'layers', text: 'Connect the findings', meaning: 'knowledge' },
  { icon: 'shield', text: 'Check every answer', meaning: 'outcome' },
];
const STEP_X = [165, 285, 405, 525] as const;
const PLAN_Y = 390;
const LANES: readonly [number, IconName, string][] = [
  [200, 'mail', 'mail'],
  [360, 'chat', 'Teams'],
  [520, 'doc', 'files'],
];
const LANE_Y = 735;
const CHECK = { x: 360, y: 940 } as const;
const BENEFIT = { y: 1095 } as const;

/** The scene's labels: a Sora line with a light-violet highlighter swept behind it as it arrives. */
const LABEL = face('title', 26, { weight: 500, lineHeight: 1.3 });
const BENEFIT_FONT = face('title', 32, { weight: 500, letterSpacing: -0.4, lineHeight: 1.25 });

function markedLabel(
  kit: SceneKit,
  id: string,
  text: string,
  cx: number,
  y: number,
  f: FontSpec,
  p: number,
  maxWidth = 600,
  /** The highlighter sweep (0–1); none when omitted (the text simply arrives). */
  marker?: number,
): SceneNode | null {
  if (p <= 0) return null;
  if (marker === undefined)
    return textNode(`${id}-t`, {
      text,
      font: f,
      fill: C.text.primary,
      maxWidth,
      align: 'center',
      transform: { x: cx, y: y + 8 * (1 - p) },
      opacity: clamp(p * 1.5),
    });
  const layout = layoutText(text, f, { measurer: kit.look.measurer, maxWidth, align: 'center' });
  const lh = layout.lineHeight;
  const total = layout.lines.reduce((s, l) => s + l.width + 18, 0);
  let used = 0;
  const marks: SceneNode[] = [];
  layout.lines.forEach((line, k) => {
    const w = line.width + 18;
    const share = clamp(((marker ?? 0) * total - used) / w);
    used += w;
    if (share <= 0) return;
    const x0 = cx - line.width / 2 - 9;
    marks.push(
      shapeNode(`${id}-mark${k}`, {
        geometry: rect(x0 + (w * share) / 2, y + line.y + lh * 0.56, w * share, lh * 0.7, 8),
        fill: withAlpha(C.brand.soft, 0.85),
      }),
    );
  });
  return groupNode(id, [
    ...marks,
    textNode(`${id}-t`, {
      text,
      font: f,
      fill: C.text.primary,
      maxWidth,
      align: 'center',
      transform: { x: cx, y },
      opacity: clamp(p * 2),
    }),
  ]);
}

export function workArt(kit: SceneKit, c: number): SceneNode[] {
  if (c < -0.05) return [];
  const nodes: (SceneNode | null)[] = [];
  // It plans first: four steps along one line, lit in turn.
  nodes.push(
    markedLabel(
      kit,
      'wk-plan-l',
      'It plans first',
      360,
      PLAN_Y - 150,
      LABEL,
      progress(c, WORK.plan, 0.4, easing.enter),
    ),
  );
  const spine = connector({
    id: 'wk-spine',
    d: `M${STEP_X[0]} ${PLAN_Y}L${STEP_X[3]} ${PLAN_Y}`,
    color: withAlpha(C.brand.soft, 0.95),
    width: 2,
    start: WORK.steps,
    duration: 3 * STEP_EVERY + 0.1,
    ease: easing.enter,
    pulses: [{ at: WORK.steps + 0.1, duration: 3 * STEP_EVERY + 0.2, color: C.meet.violet }],
    glow: 0.8,
  });
  nodes.push(spine(c));
  PLAN_STEPS.forEach((step, k) => {
    const x = STEP_X[k] ?? 360;
    const p = progress(c, WORK.steps + k * STEP_EVERY, 0.35, easing.snap);
    if (p <= 0) return;
    nodes.push(
      groupNode(`wk-step${k}`, [puck(`wk-step${k}-puck`, x, PLAN_Y, 34, step.icon, step.meaning)], {
        transform: { x, y: PLAN_Y, scale: p, originX: x, originY: PLAN_Y },
      }),
      textNode(`wk-step${k}-t`, {
        text: step.text,
        font: F.step,
        fill: C.text.secondary,
        maxWidth: 110,
        align: 'center',
        transform: { x, y: PLAN_Y + 48 },
        opacity: clamp(p * 1.5),
      }),
    );
  });
  const planEnd = nodes.length;
  // Researchers, in parallel: light runs down from the plan to mail, Teams and files.
  const fromY = PLAN_Y + 150;
  nodes.push(
    markedLabel(
      kit,
      'wk-lanes-l',
      'Researchers, in parallel',
      360,
      fromY + 16,
      LABEL,
      progress(c, WORK.lanes, 0.4, easing.enter),
    ),
  );
  LANES.forEach(([x, name, words], k) => {
    const lane = connector({
      id: `wk-lane${k}`,
      d: `M360 ${fromY + 64}C360 ${fromY + 110} ${x} ${LANE_Y - 100} ${x} ${LANE_Y - 44}`,
      color: withAlpha(C.brand.soft, 0.9),
      width: 2,
      start: WORK.lanes + 0.1,
      duration: 0.3,
      ease: easing.enter,
      pulses: [0, 0.2, 0.4].map((d) => ({
        at: WORK.lanes + 0.2 + d + k * 0.05,
        duration: 0.45,
        color: C.meet.violet,
      })),
      glow: 0.8,
    });
    nodes.push(lane(c));
    const p = progress(c, WORK.lanes + 0.25 + k * 0.06, 0.35, easing.snap);
    if (p > 0)
      nodes.push(
        groupNode(`wk-r${k}`, [puck(`wk-r${k}-puck`, x, LANE_Y, 40, name, 'knowledge')], {
          transform: { x, y: LANE_Y, scale: p, originX: x, originY: LANE_Y },
        }),
        textNode(`wk-r${k}-l`, {
          text: words,
          font: F.meta,
          fill: C.text.secondary,
          align: 'center',
          transform: { x, y: LANE_Y + 52 },
          opacity: p,
        }),
      );
    const join = connector({
      id: `wk-join${k}`,
      d: `M${x} ${LANE_Y + 76}C${x} ${LANE_Y + 120} 360 ${CHECK.y - 100} 360 ${CHECK.y - 44}`,
      color: withAlpha(C.outcome.glow, 0.9),
      width: 2,
      start: WORK.check - 0.25,
      duration: 0.3,
      ease: easing.enter,
      pulses: [{ at: WORK.check - 0.15 + k * 0.04, duration: 0.35, color: C.outcome.fill }],
      glow: 0.7,
    });
    nodes.push(join(c));
  });
  const lanesEnd = nodes.length;
  // The checker.
  const check = progress(c, WORK.check, 0.35, easing.snap);
  if (check > 0)
    nodes.push(
      groupNode('wk-check', [puck('wk-check-puck', CHECK.x, CHECK.y, 44, 'shield', 'outcome')], {
        transform: { x: CHECK.x, y: CHECK.y, scale: check, originX: CHECK.x, originY: CHECK.y },
      }),
    );
  nodes.push(
    markedLabel(
      kit,
      'wk-check-l',
      'Every answer checked',
      360,
      CHECK.y + 56,
      LABEL,
      progress(c, WORK.check + 0.1, 0.4, easing.enter),
    ),
  );
  // What it means for you.
  const benefit = progress(c, WORK.benefit, 0.45, easing.enter);
  nodes.push(
    markedLabel(
      kit,
      'wk-benefit',
      'The full picture, ready to act on.',
      360,
      BENEFIT.y,
      BENEFIT_FONT,
      benefit,
      560,
      // Only this line is highlighted: the sweep follows once it has been read for a moment.
      progress(c, WORK.benefit + 0.45, 0.6, easing.wipe),
    ),
  );
  if (benefit > 0)
    nodes.push(
      textNode('wk-benefit-s', {
        text: 'planned, researched and checked while you work',
        font: F.meta,
        fill: C.text.tertiary,
        align: 'center',
        transform: { x: 360, y: BENEFIT.y + 56 },
        opacity: clamp(benefit * 1.5 - 0.3),
      }),
    );
  const star = sparkleStar('wk-benefit-star', 600, BENEFIT.y - 6, (c - WORK.benefit - 0.35) / 0.7);
  if (star) nodes.push(star);
  // One stage at a time: earlier stages step back while the camera is on the next, and
  // come forward again for the full picture.
  const back = (from: number) =>
    1 -
    0.72 *
      progress(c, from, 0.45, easing.camera) *
      (1 - progress(c, WORK.full, 0.6, easing.camera));
  const live = (list: (SceneNode | null)[]) => list.filter((n): n is SceneNode => n !== null);
  return [
    groupNode('wk-stage-plan', live(nodes.slice(0, planEnd)), { opacity: back(WORK.lanes - 0.2) }),
    groupNode('wk-stage-lanes', live(nodes.slice(planEnd, lanesEnd)), {
      opacity: back(WORK.check - 0.2),
    }),
    ...live(nodes.slice(lanesEnd)),
  ];
}

export function workCues(at: (c: number) => number): Cues {
  return [
    cue(at(WORK.plan), whoosh(0.4, { from: 400, to: 2400, peak: 0.5, gain: 0.35 })),
    PLAN_STEPS.map((_, k) =>
      cue(
        at(WORK.steps + k * STEP_EVERY),
        pluck({ degree: [0, 2, 4, 7][k] ?? 0, octave: 2, gain: 0.32 }),
      ),
    ),
    LANES.map((_, k) =>
      cue(
        at(WORK.lanes + 0.25 + k * 0.06),
        pop({ degree: [4, 7, 9][k] ?? 4, gain: 0.35, pan: (k - 1) * 0.4 }),
      ),
    ),
    cue(at(WORK.lanes + 0.2), whoosh(0.7, { from: 300, to: 2600, peak: 0.7, gain: 0.3 })),
    cue(at(WORK.check), snap({ degree: 7, gain: 0.45 })),
    cue(at(WORK.full), whoosh(0.6, { from: 1800, to: 500, peak: 0.5, gain: 0.3 })),
    cue(at(WORK.benefit), ding({ degree: 4, gain: 0.4 })),
    cue(at(WORK.benefit + 0.45), tick({ degree: 9, gain: 0.25 })),
  ];
}

// ---------------------------------------------------------------------------
// Scene 6: the answers (the product's components, Grid look)
// ---------------------------------------------------------------------------

/** The answer, then its sources (content time, s). */
export const ANSWERS = gridTimes({
  answer: 0,
  stream: 0.1,
  streamEnd: 0.7,
  answerNote: 0.85,
  // The report step was removed: its time went equally to the answer and its sources.
  cursor: 2.2,
  click: 2.6,
  sources: 2.65,
  sourcesNote: 3.15,
  // No closing view of both together: the scene ends close on the sources.
  full: Infinity,
} as const);
/** Each benefit's highlighter follows this long after it arrives (once it has been read). */
const NOTE_MARK = { after: 0.45, sweep: 0.5 } as const;

/**
 * Where the film's camera looks in the answers group: close on the answer,
 * then its sources (group-local
 * focus point and zoom, from `at` content time over `duration`).
 */
export const ANSWERS_SHOTS: readonly {
  at: number;
  duration: number;
  view: { x: number; y: number; zoom: number };
}[] = [
  { at: -10, duration: 0, view: { x: 360, y: 640, zoom: 1 } },
  { at: -0.7, duration: 0.7, view: { x: 360, y: 320, zoom: 1.2 } },
  { at: ANSWERS.sources + 0.05, duration: 0.45, view: { x: 360, y: 640, zoom: 1.2 } },
];
const A_ANSWER =
  "You approved *8.5%* for Arden Logistics' three-year renewal.[1] The deal desk signed it off on 12 May, and the customer confirmed it in Teams the next day.[2]";
const A_META = {
  confidence: 'High',
  reason: 'Two sources agree on the rate.',
  sources: 2,
} as const;
const PANEL = { x: 70, w: 580, pad: 22 } as const;
const ANSWER_TOP = 130;
const SOURCES: readonly [string, string, string, string][] = [
  ['mail', 'Re: Renewal terms – Arden Logistics', 'Deal desk · 12 May', 'Outlook · Open'],
  ['chat', 'Deal desk', 'Teams · 13 May', 'Teams · Open'],
];

/** Where the answer panel's parts sit (they depend only on measured text). */
function answerLayout(ui: Ui) {
  const inner = PANEL.w - 2 * PANEL.pad;
  const x = PANEL.x + PANEL.pad;
  const msgH = layoutText(ANSWER_Q, PF.body, { measurer: ui.measurer, maxWidth: 400 }).height + 18;
  const y0 = ANSWER_TOP + PANEL.pad + msgH + 18;
  const ans = answerText(ui, 'm', A_ANSWER, x, y0, inner);
  const metaY = y0 + ans.h + 14;
  const meta = answerMeta(ui, 'm', x, metaY, { ...A_META, w: inner });
  const bottom = metaY + meta.h + PANEL.pad - 6;
  return { inner, x, y0, metaY, meta, bottom };
}

function gridPanel(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  kids: readonly SceneNode[],
  p: number,
) {
  return groupNode(
    id,
    [
      shapeNode(`${id}-bg`, {
        geometry: rect(x + w / 2, y + h / 2, w, h, GR + 3),
        fill: G.panel,
        stroke: { color: G.border, width: 1 },
        shadow: elevationShadows(lighting, 'mid', { strength: 0.55 }),
      }),
      ...kids,
    ],
    { opacity: clamp(p * 1.4), transform: { y: 16 * (1 - p) } },
  );
}

export function answersArt(kit: SceneKit, c: number): SceneNode[] {
  const ui = kit.ui;
  const L = answerLayout(ui);
  let nodes: SceneNode[] = [];
  const steps: SceneNode[][] = [];
  const noteMark = (at: number) => progress(c, at + NOTE_MARK.after, NOTE_MARK.sweep, easing.wipe);
  // 1. The answer to the quick question.
  const words = A_ANSWER.split(/\s+/).length;
  const shown = lerp(0, words + 1, progress(c, ANSWERS.stream, ANSWERS.streamEnd - ANSWERS.stream));
  const meta = progress(c, ANSWERS.streamEnd, 0.3, easing.enter);
  const msg = userMessage(
    ui,
    'an-msg',
    ANSWER_Q,
    PANEL.x + PANEL.w - PANEL.pad,
    ANSWER_TOP + PANEL.pad,
    400,
  );
  const hot = Math.max(
    clamp((c - (ANSWERS.click - 0.25)) / 0.1) * (c < ANSWERS.click + 0.2 ? 1 : 0),
    0,
  );
  const s = L.meta.sources;
  nodes.push(
    gridPanel(
      'an-answer',
      PANEL.x,
      ANSWER_TOP,
      PANEL.w,
      L.bottom - ANSWER_TOP,
      [
        msg.node,
        answerText(ui, 'an-ans', A_ANSWER, L.x, L.y0, L.inner, { shown }).node,
        ...(meta > 0
          ? [
              groupNode(
                'an-meta',
                [answerMeta(ui, 'an-meta-r', L.x, L.metaY, { ...A_META, w: L.inner }).node],
                {
                  opacity: meta,
                },
              ),
            ]
          : []),
        ...(hot > 0
          ? [
              shapeNode('an-src-hot', {
                geometry: rect(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, GR),
                fill: withAlpha(G.ink, 0.06 * hot),
              }),
            ]
          : []),
      ],
      progress(c, ANSWERS.answer - 0.2, 0.35, easing.enter),
    ),
  );
  const ansNote = benefit(
    kit,
    'an-ans-note',
    PANEL.x + PANEL.w - 380,
    L.bottom - 22,
    'Answers in seconds',
    'from everything you can access',
    'time',
    progress(c, ANSWERS.answerNote, 0.35, easing.enter),
    noteMark(ANSWERS.answerNote),
  );
  if (ansNote) nodes.push(ansNote);
  steps.push(nodes);
  nodes = [];
  // 2. Its sources: each claim's original, a click away.
  const src = progress(c, ANSWERS.sources, 0.35, easing.enter);
  const srcTop = L.bottom + 76;
  const rowH = 64;
  const srcH = 56 + SOURCES.length * rowH + 6;
  if (src > 0) {
    const kids: SceneNode[] = [
      textNode('an-src-h', {
        text: 'Sources (2)',
        font: PF.heading,
        fill: G.ink,
        transform: { x: PANEL.x + PANEL.pad, y: srcTop + 16 },
      }),
      hairline('an-src-rule', PANEL.x, srcTop + 52, PANEL.w),
    ];
    SOURCES.forEach(([ic, title, sub, open], k) => {
      const y = srcTop + 56 + k * rowH;
      const r = progress(c, ANSWERS.sources + 0.1 + k * 0.1, 0.3, easing.enter);
      kids.push(
        groupNode(
          `an-src${k}`,
          [
            monoChip(ui, `an-src${k}-n`, String(k + 1), PANEL.x + PANEL.pad, y + 20).node,
            uiIcon(
              `an-src${k}-i`,
              ic === 'mail' ? 'mail' : 'chat',
              PANEL.x + PANEL.pad + 46,
              y + 31,
              18,
              G.muted,
            ),
            textNode(`an-src${k}-t`, {
              text: title,
              font: PF.bodyStrong,
              fill: G.ink,
              transform: { x: PANEL.x + PANEL.pad + 66, y: y + 8 },
            }),
            textNode(`an-src${k}-s`, {
              text: sub,
              font: PF.small,
              fill: G.muted,
              transform: { x: PANEL.x + PANEL.pad + 66, y: y + 34 },
            }),
            textNode(`an-src${k}-o`, {
              text: `${open} ↗`,
              font: PF.mono,
              fill: G.link,
              align: 'right',
              transform: { x: PANEL.x + PANEL.w - PANEL.pad, y: y + 22 },
            }),
            ...(k < SOURCES.length - 1
              ? [
                  hairline(
                    `an-src${k}-r`,
                    PANEL.x + PANEL.pad,
                    y + rowH - 1,
                    PANEL.w - 2 * PANEL.pad,
                  ),
                ]
              : []),
          ],
          { opacity: r },
        ),
      );
    });
    nodes.push(gridPanel('an-sources', PANEL.x, srcTop, PANEL.w, srcH, kids, src));
  }
  const srcNote = benefit(
    kit,
    'an-src-note',
    PANEL.x + PANEL.w - 430,
    srcTop + srcH - 22,
    'Every claim links to its source',
    'open the original in a click',
    'knowledge',
    progress(c, ANSWERS.sourcesNote, 0.35, easing.enter),
    noteMark(ANSWERS.sourcesNote),
  );
  if (srcNote) nodes.push(srcNote);
  steps.push(nodes);
  nodes = [];
  // The pointer opens the sources.
  const pt = pointer(
    c,
    [
      { at: ANSWERS.cursor, x: 520, y: L.bottom + 120 },
      { at: ANSWERS.click - 0.04, x: s.x + s.w / 2, y: s.y + s.h / 2 },
    ],
    ANSWERS.click + 0.45,
  );
  if (pt) nodes.push(cursor('an-cursor', pt.x, pt.y, pressAt(c, ANSWERS.click), pt.opacity));
  const ring = clickRing('an-ring', s.x + s.w / 2, s.y + s.h / 2, c, ANSWERS.click);
  if (ring) nodes.push(ring);
  // One step at a time: each steps back while the camera is on the next, and comes
  // forward again for the whole column.
  const back = (from: number) =>
    1 -
    0.72 *
      progress(c, from, 0.45, easing.camera) *
      (1 - progress(c, ANSWERS.full, 0.6, easing.camera));
  const leaves = [ANSWERS.sources, Infinity];
  return [
    ...steps.map((list, k) =>
      groupNode(`an-step${k}`, list, { opacity: back(leaves[k] ?? Infinity) }),
    ),
    ...nodes,
  ];
}

export function answersCues(at: (c: number) => number): Cues {
  return [
    cue(at(ANSWERS.stream), bell({ degree: 4, gain: 0.35 })),
    cue(at(ANSWERS.streamEnd), pop({ degree: 7, gain: 0.35 })),
    cue(at(ANSWERS.answerNote), tick({ degree: 4, gain: 0.25 })),
    cue(at(ANSWERS.click), key({ degree: 4, take: 1, gain: 0.5 })),
    cue(at(ANSWERS.sources), whoosh(0.35, { from: 2000, to: 700, peak: 0.3, gain: 0.3 })),
    SOURCES.map((_, k) =>
      cue(
        at(ANSWERS.sources + 0.1 + k * 0.1),
        pluck({ degree: [4, 7][k] ?? 4, octave: 2, gain: 0.3 }),
      ),
    ),
    cue(at(ANSWERS.sourcesNote), tick({ degree: 9, gain: 0.25 })),
  ];
}
