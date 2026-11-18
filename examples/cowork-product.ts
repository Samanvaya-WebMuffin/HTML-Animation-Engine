/**
 * The Cowork product as it really looks, for the film's app windows: its
 * locked Grid theme (graphite accent, light grey page, white panels,
 * hairline borders, 3 px corners) and its own words. Drawn at 1.25× the
 * product's pixels so it reads in the film (14 px UI text is drawn at 17),
 * with Inter for the UI font and JetBrains Mono for the wordmark, metadata
 * and chips (the film never relies on system fonts).
 *
 * The film's own cards, captions and hints stay in Soft Calm
 * (`cowork-look.ts`); only what is inside a product window uses this kit.
 * Coordinates are window-local and top-left based, like `cowork-ui.ts`.
 */
import {
  clamp,
  gridColors,
  gridRadii,
  groupNode,
  layoutText,
  lerp,
  linearGradient,
  pathGeometry,
  rect,
  shapeNode,
  textNode,
  withAlpha,
  type FontSpec,
  type SceneNode,
} from '@html-animation-engine/core';
import { elevationShadows } from '@html-animation-engine/renderers';
import { lighting } from './cowork-look.js';
import { box, icon, label, type IconName, type Ui } from './cowork-ui.js';
import { font } from './index.js';

export const G = gridColors;
/** The product's 3 px corners, at the film's 1.25×. */
export const GR = Math.round(gridRadii.box * 1.25);

/** Product type at the film's 1.25×: Inter for UI, JetBrains Mono for the wordmark, metadata and chips. */
export const PF = {
  body: { ...font('body', 17), lineHeight: 1.45 },
  bodyStrong: { ...font('body', 17), weight: 600, lineHeight: 1.45 },
  small: { ...font('body', 15), lineHeight: 1.4 },
  smallStrong: { ...font('body', 15), weight: 600, lineHeight: 1.4 },
  label: { ...font('body', 15), weight: 500, lineHeight: 1.3 },
  heading: { ...font('body', 18), weight: 600, lineHeight: 1.35 },
  title: { ...font('body', 22), weight: 600, letterSpacing: -0.2, lineHeight: 1.3 },
  greeting: { ...font('body', 24), weight: 600, letterSpacing: -0.3, lineHeight: 1.3 },
  mono: { ...font('mono', 13.5), lineHeight: 1.35 },
  monoSmall: { ...font('mono', 12.5), lineHeight: 1.35 },
  wordmark: { ...font('mono', 17), weight: 500, lineHeight: 1.2 },
  sup: { ...font('body', 11), weight: 600, lineHeight: 1 },
} satisfies Record<string, FontSpec>;
export const PRODUCT_FONTS: readonly FontSpec[] = Object.values(PF);

/** The top bar's height and the left rail's width. */
export const TOP = 52;
export const RAIL = 140;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

// ---------------------------------------------------------------------------
// The frame: window, top bar, left rail
// ---------------------------------------------------------------------------

/**
 * A product window: the page colour inside a hairline frame and a soft
 * shadow (the film's presentation of a browser window), its content clipped.
 * `shape` overrides the outline while it opens; `content` fades the inside alone.
 */
export function gridWindow(
  id: string,
  frame: { x: number; y: number; w: number; h: number },
  children: readonly (SceneNode | null)[],
  options: {
    opacity?: number;
    shape?: { cx: number; cy: number; w: number; h: number; r: number };
    content?: number;
  } = {},
): SceneNode {
  const { x, y, w, h } = frame;
  const s = options.shape ?? { cx: w / 2, cy: h / 2, w, h, r: 10 };
  const outline = rect(s.cx, s.cy, s.w, s.h, s.r);
  const content = options.content ?? 1;
  return groupNode(
    id,
    [
      shapeNode(`${id}-panel`, {
        geometry: outline,
        fill: G.panel,
        shadow: elevationShadows(lighting, 'mid', { strength: 0.45 }),
      }),
      ...(content > 0
        ? [
            groupNode(
              `${id}-content`,
              children.filter((c): c is SceneNode => c !== null),
              { clip: outline, opacity: content },
            ),
          ]
        : []),
      shapeNode(`${id}-edge`, { geometry: outline, stroke: { color: G.border, width: 1 } }),
    ],
    { transform: { x, y }, opacity: options.opacity },
  );
}

/** The top bar: the lowercase "cowork" wordmark and workspace, ⌘K, the theme toggle, a plain avatar. */
export function topBar(
  ui: Ui,
  id: string,
  w: number,
  options: { menu?: boolean } = {},
): SceneNode[] {
  const x0 = options.menu ? 50 : 20;
  const wm = ui.measure('cowork', PF.wordmark);
  const kw = ui.measure('⌘K', PF.monoSmall) + 16;
  return [
    box(`${id}-bg`, 0, 0, w, TOP, 0, { fill: G.panel }),
    box(`${id}-rule`, 0, TOP - 1, w, 1, 0, { fill: G.border }),
    ...(options.menu ? [icon(`${id}-menu`, 'menu', 26, TOP / 2, 19, G.muted)] : []),
    label(`${id}-wm`, 'cowork', x0, 15, PF.wordmark, G.ink),
    label(`${id}-ws`, '/ workspace', x0 + wm + 8, 17, PF.mono, G.faint),
    box(`${id}-k`, w - 114 - kw, 14, kw, 24, GR, { stroke: { color: G.border, width: 1 } }),
    label(`${id}-kt`, '⌘K', w - 114 - kw + 8, 18, PF.monoSmall, G.muted),
    icon(`${id}-theme`, 'moon', w - 72, TOP / 2, 18, G.muted),
    box(`${id}-av`, w - 44, TOP / 2 - 13, 26, 26, 13, {
      fill: G.selected,
      stroke: { color: G.border, width: 1 },
    }),
  ];
}

const RAIL_ITEMS: readonly { key: string; text: string; icon: IconName }[] = [
  { key: 'new', text: 'New chat', icon: 'plus' },
  { key: 'search', text: 'Search chats', icon: 'search' },
  { key: 'reports', text: 'Reports', icon: 'doc' },
  { key: 'access', text: 'Your access', icon: 'shield' },
];

/** The left rail: New chat, Search chats, Reports, Your access, Starred, Recents, and the read-only note. */
export function rail(
  ui: Ui,
  id: string,
  h: number,
  options: { active?: string; recents?: readonly string[]; current?: number } = {},
): SceneNode[] {
  const nodes: SceneNode[] = [
    box(`${id}-bg`, 0, TOP, RAIL, h - TOP, 0, { fill: G.page }),
    box(`${id}-rule`, RAIL - 1, TOP, 1, h - TOP, 0, { fill: G.border }),
  ];
  RAIL_ITEMS.forEach((item, k) => {
    const y = TOP + 14 + k * 38;
    if (options.active === item.key)
      nodes.push(box(`${id}-${item.key}-on`, 8, y, RAIL - 16, 32, GR, { fill: G.selected }));
    nodes.push(
      icon(`${id}-${item.key}-i`, item.icon, 26, y + 16, 16, G.ink),
      label(`${id}-${item.key}`, item.text, 44, y + 6, PF.label, G.ink),
    );
  });
  const sy = TOP + 14 + RAIL_ITEMS.length * 38 + 14;
  nodes.push(
    label(`${id}-starred`, 'Starred', 16, sy, PF.monoSmall, G.faint),
    label(`${id}-recents`, 'Recents', 16, sy + 36, PF.monoSmall, G.faint),
  );
  const note = 'Read-only · scoped to what you can see.';
  const noteH = layoutText(note, PF.monoSmall, {
    measurer: ui.measurer,
    maxWidth: RAIL - 28,
  }).height;
  (options.recents ?? []).forEach((r, k) => {
    const y = sy + 60 + k * 32;
    if (y + 24 > h - 22 - noteH) return;
    if (options.current === k)
      nodes.push(box(`${id}-r${k}-on`, 8, y - 4, RAIL - 16, 28, GR, { fill: G.selected }));
    nodes.push(label(`${id}-r${k}`, ui.fit(r, PF.small, RAIL - 36), 16, y, PF.small, G.muted));
  });
  nodes.push(
    textNode(`${id}-ro`, {
      text: note,
      font: PF.monoSmall,
      fill: G.faint,
      maxWidth: RAIL - 28,
      transform: { x: 14, y: h - 16 - noteH },
    }),
  );
  return nodes;
}

// ---------------------------------------------------------------------------
// Composer and the level menu
// ---------------------------------------------------------------------------

/** Where the composer's parts sit (window-local). */
export function composerLayout(
  ui: Ui,
  x: number,
  y: number,
  w: number,
  h: number,
  level: 1 | 3,
): { text: Box; chip: Box; send: Box; hint: Box } {
  const chipText = `✦ Level ${level} ⌄`;
  const cw = ui.measure(chipText, PF.mono) + 18;
  const send = { x: x + w - 44, y: y + h - 42, w: 32, h: 32 };
  const chip = { x: send.x - 10 - cw, y: y + h - 39, w: cw, h: 26 };
  const hw = ui.measure('/ ⌘K', PF.monoSmall);
  return {
    text: { x: x + 16, y: y + 14, w: w - 32, h: h - 56 },
    chip,
    send,
    hint: { x: chip.x - 14 - hw, y: y + h - 34, w: hw, h: 18 },
  };
}

/** The composer box: the text area above a row with the "/ ⌘K" hint, the level dropdown and the square send. */
export function composerFrame(
  ui: Ui,
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { focus?: number; level?: 1 | 3; ready?: boolean; press?: number; empty?: boolean } = {},
): SceneNode[] {
  const level = options.level ?? 1;
  const L = composerLayout(ui, x, y, w, h, level);
  const focus = clamp(options.focus ?? 0);
  const press = clamp(options.press ?? 0);
  return [
    box(`${id}-bg`, x, y, w, h, GR, {
      fill: G.panel,
      stroke: { color: focus > 0.5 ? G.ink : G.border, width: focus > 0.5 ? 1.5 : 1 },
    }),
    ...(options.empty !== false
      ? [label(`${id}-hint`, '/ ⌘K', L.hint.x, L.hint.y, PF.monoSmall, G.faint)]
      : []),
    box(`${id}-chip`, L.chip.x, L.chip.y, L.chip.w, L.chip.h, GR, {
      fill: G.page,
      stroke: { color: G.border, width: 1 },
    }),
    label(`${id}-chip-t`, `✦ Level ${level} ⌄`, L.chip.x + 9, L.chip.y + 4, PF.mono, G.ink),
    groupNode(
      `${id}-send`,
      [
        box(`${id}-send-bg`, L.send.x, L.send.y, L.send.w, L.send.h, GR, {
          fill: options.ready ? G.ink : G.border,
        }),
        icon(`${id}-send-i`, 'send', L.send.x + 16, L.send.y + 16, 18, G.white, { width: 2 }),
      ],
      {
        transform: {
          x: L.send.x + 16,
          y: L.send.y + 16,
          scale: 1 - 0.1 * press,
          originX: L.send.x + 16,
          originY: L.send.y + 16,
        },
      },
    ),
  ];
}

/** Where the level dropdown sits under its chip. */
export function levelMenuBox(anchor: Box): Box {
  const w = 360;
  const h = 128;
  return { x: anchor.x + anchor.w - w, y: anchor.y + anchor.h + 8, w, h };
}

/**
 * The level dropdown, opening under its chip: only Level 1 and Level 3, as
 * the product offers. `hover` is the row under the pointer.
 */
export function levelMenu(
  ui: Ui,
  id: string,
  anchor: Box,
  p: number,
  selected: 1 | 3,
  hover?: 1 | 3,
): { node: SceneNode; box: Box } {
  const b = levelMenuBox(anchor);
  const { w, h } = b;
  const row = (k: 0 | 1, level: 1 | 3, line: string) => {
    const y = b.y + 8 + k * 58;
    return [
      ...(hover === level
        ? [box(`${id}-on${k}`, b.x + 6, y, w - 12, 54, GR, { fill: G.hover })]
        : []),
      label(`${id}-l${k}`, `✦ Level ${level}`, b.x + 18, y + 7, PF.label, G.ink),
      label(`${id}-d${k}`, line, b.x + 18, y + 29, PF.small, G.muted),
      ...(selected === level
        ? [icon(`${id}-ck${k}`, 'check', b.x + w - 26, y + 27, 16, G.ink)]
        : []),
    ];
  };
  return {
    box: b,
    node: groupNode(
      id,
      [
        box(`${id}-bg`, b.x, b.y, w, h, GR, {
          fill: G.panel,
          stroke: { color: G.border, width: 1 },
          shadow: elevationShadows(lighting, 'mid', { strength: 0.6 }),
        }),
        ...row(0, 1, 'Everyday questions — answers in seconds'),
        ...row(1, 3, 'Deep analysis — plans first, then 15–30 minutes'),
      ],
      {
        opacity: clamp(p * 1.6),
        transform: {
          x: b.x + w,
          y: b.y - 6 * (1 - p),
          scale: lerp(0.97, 1, p),
          originX: b.x + w,
          originY: b.y,
        },
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

/** The person's message: right-aligned, a quiet grey box. */
export function userMessage(
  ui: Ui,
  id: string,
  text: string,
  right: number,
  y: number,
  maxWidth: number,
): { node: SceneNode; h: number } {
  const layout = layoutText(text, PF.body, { measurer: ui.measurer, maxWidth });
  const w = layout.width + 28;
  const h = layout.height + 18;
  return {
    h,
    node: groupNode(id, [
      box(`${id}-bg`, right - w, y, w, h, GR, { fill: G.hover }),
      textNode(`${id}-t`, {
        text,
        font: PF.body,
        fill: G.ink,
        maxWidth,
        transform: { x: right - w + 14, y: y + 9 },
      }),
    ]),
  };
}

/** Searching: a pulsing dot and "Searching your workspace…" over three grey bars. */
export function searching(id: string, x: number, y: number, w: number, t: number): SceneNode {
  const pulse = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 * 1.2);
  const bar = (k: number, bw: number) => {
    const s = ((((t + k * 0.15) % 1.3) + 1.3) % 1.3) / 1.3;
    const bx = lerp(-0.4, 1.4, s) * bw;
    return box(`${id}-b${k}`, x, y + 34 + k * 22, bw, 11, GR, {
      fill: linearGradient(x + bx - 80, 0, x + bx + 80, 0, [
        { offset: 0, color: G.hover },
        { offset: 0.5, color: G.selected },
        { offset: 1, color: G.hover },
      ]),
    });
  };
  return groupNode(id, [
    box(`${id}-dot`, x, y + 6, 9, 9, 4.5, { fill: G.ink, opacity: pulse }),
    label(`${id}-t`, 'Searching your workspace…', x + 18, y, PF.small, G.muted),
    bar(0, w * 0.92),
    bar(1, w * 0.78),
    bar(2, w * 0.55),
  ]);
}

/**
 * An answer: the text, with citations as small superscript numbers after
 * the word they follow (written `[1]` in `text`). `shown` streams it word by
 * word. Returns where each citation sits, for the cursor and the hints.
 */
export function answerText(
  ui: Ui,
  id: string,
  text: string,
  x: number,
  y: number,
  w: number,
  options: { shown?: number; accent?: string } = {},
): { node: SceneNode; h: number; cites: Record<string, Box> } {
  // Split off citations: "word[1]" → word, with a superscript after it.
  const raw = text.split(/\s+/);
  const sups = raw.map((word) => [...word.matchAll(/\[(\d+)\]/g)].map((m) => m[1] ?? ''));
  const fonts = raw.map((word) => (/^\*.+\*/.test(word) ? PF.bodyStrong : PF.body));
  const words = raw.map((word) => word.replace(/\[\d+\]/g, '').replace(/\*/g, ''));
  // Lines broken greedily on each word's width with its superscripts (so they never touch the next word).
  const supW = (k: number) =>
    (sups[k] ?? []).reduce((sum, n) => sum + ui.measure(n, PF.sup) + 3, 0) +
    ((sups[k]?.length ?? 0) > 0 ? 1.5 : 0);
  const space = ui.measure(' ', PF.body);
  const lineH = PF.body.size * PF.body.lineHeight;
  const placed: { x: number; line: number }[] = [];
  let lx = 0;
  let line = 0;
  words.forEach((word, k) => {
    const ww = ui.measure(word, fonts[k] ?? PF.body) + supW(k);
    if (lx > 0 && lx + ww > w) {
      lx = 0;
      line++;
    }
    placed.push({ x: lx, line });
    lx += ww + space;
  });
  const shown = options.shown ?? Infinity;
  const kids: SceneNode[] = [];
  const cites: Record<string, Box> = {};
  words.forEach((word, k) => {
    const at = placed[k] ?? { x: 0, line: 0 };
    const o = clamp(shown - k);
    const wy = y + at.line * lineH;
    const f = fonts[k] ?? PF.body;
    let sx = x + at.x + ui.measure(word, f) + 1.5;
    for (const n of sups[k] ?? []) {
      cites[n] = { x: sx - 2, y: wy - 2, w: ui.measure(n, PF.sup) + 4, h: 14 };
      if (o > 0)
        kids.push(
          textNode(`${id}-s${k}-${n}`, {
            text: n,
            font: PF.sup,
            fill: options.accent ?? G.link,
            transform: { x: sx, y: wy + 1 },
            opacity: o,
          }),
        );
      sx += ui.measure(n, PF.sup) + 3;
    }
    if (o <= 0) return;
    kids.push(
      textNode(`${id}-w${k}`, {
        text: word,
        font: f,
        fill: G.ink,
        transform: { x: x + at.x, y: wy },
        opacity: o,
      }),
    );
  });
  return { node: groupNode(id, kids), h: (line + 1) * lineH, cites };
}

/** Under every searched answer. */
export const ACCESS_LINE = 'Answered from the items your account can access.';

/**
 * The line under an answer and its meta row: the access line, a
 * confidence chip with its one-line reason, Sources (N), Copy, Regenerate.
 * Returns the parts' boxes.
 */
export function answerMeta(
  ui: Ui,
  id: string,
  x: number,
  y: number,
  options: { confidence: 'High' | 'Low'; reason: string; sources: number; w: number },
): { node: SceneNode; h: number; confidence: Box; sources: Box; access: Box } {
  const high = options.confidence === 'High';
  const ct = `${options.confidence} confidence`;
  const cw = ui.measure(ct, PF.label) + 20;
  const why = ui.fit(options.reason, PF.small, options.w - cw - 10);
  const sText = `Sources (${options.sources})`;
  const sw = options.sources > 0 ? ui.measure(sText, PF.label) + 22 : -22;
  const ry = y + 66;
  const kids: SceneNode[] = [
    label(`${id}-access`, ACCESS_LINE, x, y, PF.small, G.muted),
    box(`${id}-conf`, x, y + 30, cw, 26, GR, { fill: high ? G.goodSoft : G.warnSoft }),
    label(`${id}-conf-t`, ct, x + 10, y + 33, PF.label, high ? G.good : G.warn),
    label(`${id}-why`, why, x + cw + 10, y + 34, PF.small, G.muted),
  ];
  if (options.sources > 0)
    kids.push(
      box(`${id}-src`, x, ry, sw, 30, GR, { fill: G.panel, stroke: { color: G.border, width: 1 } }),
      label(`${id}-src-t`, sText, x + 11, ry + 6, PF.label, G.ink),
    );
  kids.push(
    icon(`${id}-copy-i`, 'copy', x + sw + 30, ry + 15, 15, G.muted),
    label(`${id}-copy`, 'Copy', x + sw + 42, ry + 6, PF.label, G.muted),
    icon(`${id}-regen-i`, 'refresh', x + sw + 110, ry + 15, 15, G.muted),
    label(`${id}-regen`, 'Regenerate', x + sw + 122, ry + 6, PF.label, G.muted),
  );
  return {
    node: groupNode(id, kids),
    h: 96,
    access: { x, y: y - 2, w: ui.measure(ACCESS_LINE, PF.small), h: 24 },
    confidence: { x, y: y + 30, w: cw + 10 + ui.measure(why, PF.small), h: 26 },
    sources: { x, y: ry, w: Math.max(sw, 0), h: 30 },
  };
}

/** The fixed follow-up pills under an answer. */
export function followUps(
  ui: Ui,
  id: string,
  x: number,
  y: number,
  w: number,
): { node: SceneNode; h: number } {
  const pills = ['Go deeper on this', 'Summarize the key points', 'What changed recently?'];
  const kids: SceneNode[] = [];
  let px = x;
  let py = y;
  pills.forEach((text, k) => {
    const pw = ui.measure(text, PF.label) + 24;
    if (px + pw > x + w) {
      px = x;
      py += 38;
    }
    kids.push(
      box(`${id}-p${k}`, px, py, pw, 30, GR, {
        fill: G.panel,
        stroke: { color: G.border, width: 1 },
      }),
      label(`${id}-p${k}-t`, text, px + 12, py + 6, PF.label, G.ink),
    );
    px += pw + 8;
  });
  return { node: groupNode(id, kids), h: py + 30 - y };
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/** A button: `primary` filled graphite, `secondary` white with a hairline, `ghost` text only. */
export function gridButton(
  ui: Ui,
  id: string,
  text: string,
  x: number,
  y: number,
  options: {
    kind?: 'primary' | 'secondary' | 'ghost';
    icon?: IconName;
    press?: number;
    hover?: number;
    h?: number;
  } = {},
): { node: SceneNode; w: number; box: Box } {
  const kind = options.kind ?? 'secondary';
  const h = options.h ?? 34;
  const iw = options.icon ? 22 : 0;
  const w = Math.round(ui.measure(text, PF.label) + 24 + iw);
  const press = clamp(options.press ?? 0);
  const hover = clamp(options.hover ?? 0);
  const fg = kind === 'primary' ? G.white : G.ink;
  const kids: SceneNode[] = [];
  if (kind !== 'ghost')
    kids.push(
      box(`${id}-bg`, x, y, w, h, GR, {
        fill: kind === 'primary' ? G.ink : hover > 0.5 || press > 0 ? G.hover : G.panel,
        ...(kind === 'secondary' ? { stroke: { color: G.border, width: 1 } } : {}),
      }),
    );
  if (options.icon) kids.push(icon(`${id}-i`, options.icon, x + 12 + 8, y + h / 2, 15, fg));
  kids.push(label(`${id}-t`, text, x + 12 + iw, y + (h - 19.5) / 2, PF.label, fg));
  return {
    w,
    box: { x, y, w, h },
    node: groupNode(id, kids, {
      transform: {
        x: x + w / 2,
        y: y + h / 2 + press,
        scale: 1 - 0.03 * press,
        originX: x + w / 2,
        originY: y + h / 2,
      },
    }),
  };
}

/** A small monospace chip with a hairline (metadata, versions, status). */
export function monoChip(
  ui: Ui,
  id: string,
  text: string,
  x: number,
  y: number,
  tone: 'plain' | 'good' | 'warn' = 'plain',
): { node: SceneNode; w: number } {
  const w = Math.round(ui.measure(text, PF.monoSmall) + 14);
  const [bg, fg, edge] =
    tone === 'good'
      ? [G.goodSoft, G.good, G.goodSoft]
      : tone === 'warn'
        ? [G.warnSoft, G.warn, G.warnSoft]
        : [G.panel, G.muted, G.border];
  return {
    w,
    node: groupNode(id, [
      box(`${id}-bg`, x, y, w, 22, GR, { fill: bg, stroke: { color: edge, width: 1 } }),
      label(`${id}-t`, text, x + 7, y + 3, PF.monoSmall, fg),
    ]),
  };
}

/** A checkbox with its label and helper line. */
export function checkbox(
  id: string,
  x: number,
  y: number,
  checked: number,
  text: string,
  helper?: string,
): SceneNode {
  const c = clamp(checked);
  return groupNode(id, [
    box(`${id}-box`, x, y + 2, 18, 18, GR, {
      fill: c > 0 ? G.ink : G.panel,
      stroke: { color: c > 0 ? G.ink : G.faint, width: 1.2 },
    }),
    ...(c > 0 ? [icon(`${id}-tick`, 'check', x + 9, y + 11, 15 * c, G.white, { width: 2.2 })] : []),
    label(`${id}-t`, text, x + 28, y, PF.label, G.ink),
    ...(helper ? [label(`${id}-h`, helper, x + 28, y + 22, PF.small, G.muted)] : []),
  ]);
}

/** Tabs with the active one underlined in graphite. */
export function tabs(
  ui: Ui,
  id: string,
  names: readonly string[],
  x: number,
  y: number,
  active: number,
): { node: SceneNode; at: readonly Box[] } {
  const at: Box[] = [];
  const kids: SceneNode[] = [];
  let tx = x;
  names.forEach((n, k) => {
    const w = ui.measure(n, PF.label);
    at.push({ x: tx, y, w, h: 30 });
    kids.push(label(`${id}-${k}`, n, tx, y + 4, PF.label, k === active ? G.ink : G.muted));
    if (k === active) kids.push(box(`${id}-u`, tx, y + 28, w, 2, 1, { fill: G.ink }));
    tx += w + 26;
  });
  return { node: groupNode(id, kids), at };
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

/** A dialog over the window: a light scrim, then a white panel with a soft shadow. */
export function dialog(
  id: string,
  win: { w: number; h: number },
  b: Box,
  p: number,
  children: readonly SceneNode[],
): SceneNode {
  return groupNode(id, [
    box(`${id}-scrim`, 0, 0, win.w, win.h, 0, { fill: withAlpha(G.ink, 0.22 * p) }),
    groupNode(
      `${id}-panel`,
      [
        box(`${id}-bg`, b.x, b.y, b.w, b.h, GR + 2, {
          fill: G.panel,
          stroke: { color: G.border, width: 1 },
          shadow: elevationShadows(lighting, 'high', { strength: 0.8 }),
        }),
        ...children,
      ],
      {
        opacity: clamp(p * 1.5),
        transform: {
          x: b.x + b.w / 2,
          y: b.y + b.h / 2 + 10 * (1 - p),
          scale: lerp(0.97, 1, p),
          originX: b.x + b.w / 2,
          originY: b.y + b.h / 2,
        },
      },
    ),
  ]);
}

/** A toast at the foot of the window: graphite, white text, its actions as links. */
export function toast(
  ui: Ui,
  id: string,
  lines: readonly string[],
  actions: readonly string[],
  win: { w: number; h: number },
  p: number,
): { node: SceneNode; box: Box } {
  const w = win.w - 48;
  const h = 26 + lines.length * 22 + 34;
  const b = { x: 24, y: win.h - 24 - h + 18 * (1 - p), w, h };
  const kids: SceneNode[] = [
    box(`${id}-bg`, b.x, b.y, w, h, GR + 2, {
      fill: G.ink,
      shadow: elevationShadows(lighting, 'mid', { strength: 0.6 }),
    }),
    ...lines.map((l, k) => label(`${id}-l${k}`, l, b.x + 18, b.y + 14 + k * 22, PF.small, G.white)),
  ];
  let ax = b.x + 18;
  actions.forEach((a, k) => {
    kids.push(label(`${id}-a${k}`, a, ax, b.y + h - 32, PF.smallStrong, G.white));
    ax += ui.measure(a, PF.smallStrong) + 22;
  });
  return { box: b, node: groupNode(id, kids, { opacity: clamp(p * 1.5) }) };
}

/** A popover's height for its body text at width `w`. */
export function popoverHeight(ui: Ui, body: string, w: number): number {
  const bodyH = body
    ? layoutText(body, PF.small, { measurer: ui.measurer, maxWidth: w - 28 }).height + 8
    : 0;
  return 40 + bodyH + 42;
}

/** Where a popover's "open" link sits (for the pointer and the hints). */
export function popoverFoot(ui: Ui, b: Box, foot: string): Box {
  return { x: b.x + 8, y: b.y + b.h - 36, w: ui.measure(foot, PF.mono) + 40, h: 30 };
}

/** A small popover card (a citation's source): title, body, and where it opens. */
export function popover(
  ui: Ui,
  id: string,
  b: Box,
  p: number,
  content: { title: string; body: string; foot: string },
  hover = 0,
): SceneNode {
  const foot = popoverFoot(ui, b, content.foot);
  const fw = ui.measure(content.foot, PF.mono);
  return groupNode(
    id,
    [
      box(`${id}-bg`, b.x, b.y, b.w, b.h, GR + 2, {
        fill: G.panel,
        stroke: { color: G.border, width: 1 },
        shadow: elevationShadows(lighting, 'mid', { strength: 0.7 }),
      }),
      label(
        `${id}-title`,
        ui.fit(content.title, PF.smallStrong, b.w - 28),
        b.x + 14,
        b.y + 12,
        PF.smallStrong,
        G.ink,
      ),
      ...(content.body
        ? [
            textNode(`${id}-body`, {
              text: content.body,
              font: PF.small,
              fill: G.muted,
              maxWidth: b.w - 28,
              transform: { x: b.x + 14, y: b.y + 40 },
            }),
          ]
        : []),
      box(`${id}-rule`, b.x, b.y + b.h - 42, b.w, 1, 0, { fill: G.border }),
      ...(hover > 0
        ? [
            box(`${id}-hover`, foot.x, foot.y, foot.w, foot.h, GR, {
              fill: G.hover,
              opacity: hover,
            }),
          ]
        : []),
      label(`${id}-foot`, content.foot, b.x + 14, b.y + b.h - 30, PF.mono, G.ink),
      icon(`${id}-ext`, 'external', b.x + 14 + fw + 12, b.y + b.h - 21, 14, G.ink),
      ...(hover > 0.5
        ? [box(`${id}-ul`, b.x + 14, b.y + b.h - 11, fw, 1, 0, { fill: G.ink })]
        : []),
    ],
    {
      opacity: clamp(p * 1.6),
      transform: {
        x: b.x,
        y: b.y + 6 * (1 - p),
        scale: lerp(0.97, 1, p),
        originX: b.x,
        originY: b.y,
      },
    },
  );
}

/** A bar chart in the report's own style: vertical bars, a finding as its title. */
export function barChart(
  ui: Ui,
  id: string,
  b: Box,
  bars: readonly { name: string; value: number }[],
  max: number,
  p: number,
): SceneNode {
  const kids: SceneNode[] = [box(`${id}-axis`, b.x, b.y + b.h - 34, b.w, 1, 0, { fill: G.border })];
  const n = bars.length;
  const slot = b.w / n;
  const bw = Math.min(56, slot * 0.5);
  bars.forEach((bar, k) => {
    const cx = b.x + slot * (k + 0.5);
    const full = (b.h - 70) * (bar.value / max);
    const hgt = Math.max(0.01, full * clamp(p * 1.4 - k * 0.12));
    const top = b.y + b.h - 34 - hgt;
    kids.push(
      box(`${id}-b${k}`, cx - bw / 2, top, bw, hgt, 2, { fill: k < n - 1 ? G.ink : G.selected }),
      label(`${id}-v${k}`, `${bar.value.toFixed(1)} d`, cx, top - 20, PF.monoSmall, G.muted, {
        align: 'center',
        opacity: clamp(p * 2 - 0.8),
      }),
      label(
        `${id}-n${k}`,
        ui.fit(bar.name, PF.monoSmall, slot - 6),
        cx,
        b.y + b.h - 26,
        PF.monoSmall,
        G.muted,
        {
          align: 'center',
        },
      ),
    );
  });
  return groupNode(id, kids);
}

/** A plain avatar circle (the product shows no initials, except in share suggestions). */
export function plainAvatar(id: string, x: number, y: number, r: number): SceneNode {
  return box(id, x - r, y - r, 2 * r, 2 * r, r, {
    fill: G.selected,
    stroke: { color: G.border, width: 1 },
  });
}

/** A thin rule. */
export function hairline(id: string, x: number, y: number, w: number): SceneNode {
  return box(id, x, y, w, 1, 0, { fill: G.border });
}

/** A tiny line chart in a report row (its trend, for recognition). */
export function miniChart(id: string, x: number, y: number, values: readonly number[]): SceneNode {
  const w = 54;
  const h = 22;
  const max = Math.max(...values);
  const d = values
    .map(
      (v, k) =>
        `${k ? 'L' : 'M'}${(x + (k / (values.length - 1)) * w).toFixed(1)} ${(y + h - (v / max) * h).toFixed(1)}`,
    )
    .join('');
  return shapeNode(id, {
    geometry: pathGeometry(d),
    stroke: { color: G.muted, width: 1.4, join: 'round', cap: 'round' },
  });
}
