/**
 * Scene 1's opening, on the bare background (no pinboard): the company's
 * knowledge as items of six kinds (emails, PDFs, text files, messages,
 * spreadsheets and slides) popping up out of thin air across the frame,
 * from the centre outwards. Each starts as a blurred speck, swells past its
 * size on a springy ease and settles, coming into focus as it does.
 *
 * Positions are the lost group's local px; the camera stands still on the
 * group through the opening, so they are also places on screen. The film's
 * time is the group's local time.
 */
import {
  clamp,
  createRng,
  groupNode,
  imageNode,
  lerp,
  pathGeometry,
  progress,
  rect,
  shapeNode,
  spring,
  textNode,
  linearGradient,
  mixColors,
  random,
  withAlpha,
  type SceneNode,
} from '@html-animation-engine/core';
import {
  elevationShadows,
  motionBlur,
  preloadImages,
  type KineticText,
} from '@html-animation-engine/renderers';
import {
  C,
  HEAD,
  P,
  face,
  icon,
  lighting,
  look,
  type Headline,
  type IconName,
} from './cowork-look.js';
import type { PaperTextures } from './cowork-paper.js';
import { SFX_DIV, beats, onGrid } from './cowork-beat.js';
import { phoneDefaults } from './index.js';
import m365Url from './logos/microsoft-365.svg?url';
import slackUrl from './logos/slack.svg?url';

const W = phoneDefaults.width;
const H = phoneDefaults.height;

export type FileKind = 'email' | 'pdf' | 'text' | 'message' | 'sheet' | 'slides';

/** The six kinds, with the names and line icons their piles will carry. */
export const FILE_KINDS: readonly { kind: FileKind; name: string; icon: IconName }[] = [
  { kind: 'email', name: 'Email', icon: 'mail' },
  { kind: 'pdf', name: 'PDFs', icon: 'pdf' },
  { kind: 'text', name: 'Text files', icon: 'doc' },
  { kind: 'message', name: 'Messages', icon: 'chat' },
  { kind: 'sheet', name: 'Spreadsheets', icon: 'sheet' },
  { kind: 'slides', name: 'Slides', icon: 'slides' },
];

/**
 * The pop: items start between `start` and `start + spread` (s), nearer the
 * centre first, `jitter` apart at most, each on a thirty-second of the beat
 * (so its sound can land with it). The centre fills in the first 1.5 s; the
 * rest keep coming in round the edges while the statement is written, the
 * last as its final letters arrive. The spring overshoots by about a sixth.
 */
export const POP = {
  start: 0.05,
  spread: 2.38,
  jitter: 0.12,
  ease: spring({ stiffness: 420, damping: 20 }),
  /** From a speck this size to full size. */
  from: 0.18,
} as const;

export interface OpeningItem {
  readonly id: string;
  readonly kind: FileKind;
  /** Which of its kind (for variety in the drawing). */
  readonly k: number;
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  /** When it starts to pop (film s). */
  readonly at: number;
}

/**
 * 36 items, six of each kind, on a staggered 4 × 9 grid with seeded jitter.
 * The kinds follow (column + 2 × row) mod 6 through a seeded order, so no
 * two neighbours share a kind and each kind has exactly six.
 */
export const ITEMS: readonly OpeningItem[] = (() => {
  const rng = createRng('cowork-opening-items');
  const order = [...FILE_KINDS.map((f) => f.kind)];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [order[i], order[j]] = [order[j] as FileKind, order[i] as FileKind];
  }
  const cols = 4;
  const rows = 9;
  const dx = W / cols;
  const dy = H / rows;
  const counts: Record<string, number> = {};
  const raw: Omit<OpeningItem, 'at'>[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const kind = order[(c + 2 * r) % 6] ?? 'email';
      const k = counts[kind] ?? 0;
      counts[kind] = k + 1;
      raw.push({
        id: `${kind}${k}`,
        kind,
        k,
        x: (c + 0.5 + (r % 2 ? 0.22 : -0.22)) * dx + (rng.next() - 0.5) * 90,
        y: (r + 0.5) * dy + (rng.next() - 0.5) * 70,
        rot: (rng.next() - 0.5) * 22,
      });
    }
  }
  const far = Math.hypot(W / 2, H / 2);
  return raw
    .map((it) => {
      const d = Math.hypot(it.x - W / 2, it.y - H / 2) / far;
      const at = POP.start + POP.spread * d + POP.jitter * rng.next();
      return { ...it, at: onGrid(at, SFX_DIV) };
    })
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
})();

/** The pops grouped by the thirty-second they fall on (for sound): when, how many, and where across the frame (−0.5 to 0.5). */
export const POP_SLOTS: readonly { at: number; n: number; x: number }[] = (() => {
  const slots = new Map<number, { n: number; x: number }>();
  for (const it of ITEMS) {
    const s = slots.get(it.at) ?? { n: 0, x: 0 };
    slots.set(it.at, { n: s.n + 1, x: s.x + it.x });
  }
  return [...slots.entries()].map(([at, s]) => ({ at, n: s.n, x: s.x / s.n / W - 0.5 }));
})();

/** The items' small type: Inter for names and text, JetBrains Mono for metadata and figures. */
const IT = {
  name: face('label', 8, { weight: 600, lineHeight: 1.2, letterSpacing: -0.05 }),
  title: face('label', 9.5, { weight: 600, lineHeight: 1.2, letterSpacing: -0.15 }),
  slide: face('label', 11, { weight: 600, lineHeight: 1.15, letterSpacing: -0.25 }),
  body: face('body', 6.6, { lineHeight: 1.45 }),
  cell: face('label', 6, { weight: 600, lineHeight: 1.2 }),
  meta: face('mono', 6.2, { lineHeight: 1.2, letterSpacing: 0.1 }),
  tag: face('mono', 6, { weight: 700, lineHeight: 1.2, letterSpacing: 0.5 }),
  initials: face('label', 6, { weight: 700, lineHeight: 1.2 }),
} as const;
/** Every font the opening's items draw with (loaded with the film's). */
export const OPENING_ITEM_FONTS = Object.values(IT);

const ink = (a: number) => withAlpha(C.text.primary, a);
const soft = (a: number) => withAlpha(C.text.secondary, a);

/** A line of small text, its first line centred on y (left-aligned at x unless `align`). */
function tx(
  id: string,
  text: string,
  x: number,
  y: number,
  font: (typeof IT)[keyof typeof IT],
  fill: string,
  extra: { align?: 'left' | 'center' | 'right'; maxWidth?: number } = {},
): SceneNode {
  const lh = font.size * (font.lineHeight ?? 1.2);
  return textNode(id, { text, font, fill, transform: { x, y: y - lh / 2 }, ...extra });
}
/** A short rounded bar: a word or a line seen too small to read. */
const bar = (id: string, x: number, y: number, w: number, h: number, fill: string) =>
  shapeNode(id, { geometry: rect(x + w / 2, y, w, h, h / 2), fill });
/** Hairline text lines: a paragraph seen at a glance. */
function lines(id: string, x: number, y: number, widths: readonly number[], gap = 7.5): SceneNode {
  return groupNode(
    id,
    widths.map((w, k) => bar(`${id}-${k}`, x, y + k * gap, w, 2.1, soft(0.26))),
  );
}
/** The rough width of `text` in `font` (for sizing a bubble round it before fonts are measured). */
const roughWidth = (text: string, font: (typeof IT)[keyof typeof IT]) =>
  text.length * font.size * 0.54;

/**
 * A sheet of paper (w × h, centred): soft rounded corners, white lit a
 * touch warmer at the bottom, a hairline edge, the faintest grain, and a
 * contact, key and ambient shadow.
 */
function card(id: string, w: number, h: number, tex: PaperTextures, lift = 1): SceneNode[] {
  const shape = rect(0, 0, w, h, 4);
  return [
    shapeNode(`${id}-paper`, {
      geometry: shape,
      fill: linearGradient(0, -h / 2, 0, h / 2, [P.white, mixColors(P.white, C.bg.canvas, 0.55)]),
      stroke: { color: withAlpha(lighting.shadow, 0.07), width: 0.6 },
      shadow: [
        { x: 0, y: 0.5, blur: 1.2, color: withAlpha(lighting.shadow, 0.16) },
        { x: 0, y: 3 * lift, blur: 9 * lift, color: withAlpha(lighting.shadow, 0.08) },
        { x: 0, y: 10 * lift, blur: 26 * lift, color: withAlpha(lighting.shadow, 0.06) },
      ],
    }),
    groupNode(
      `${id}-grain`,
      [imageNode(`${id}-grain-img`, { src: tex.grain, width: w, height: h, opacity: 0.22 })],
      { clip: shape },
    ),
  ];
}

/** Each kind's sheet (px): its own shape, before it joins a stack. */
export const FILE_SIZE: Readonly<Record<FileKind, { w: number; h: number }>> = {
  email: { w: 170, h: 112 },
  pdf: { w: 124, h: 160 },
  text: { w: 124, h: 160 },
  message: { w: 160, h: 122 },
  sheet: { w: 164, h: 118 },
  slides: { w: 176, h: 102 },
};

/** What each item says, the k-th of its kind (fictional people and files). */
const WORDS = {
  email: [
    ['Maya Chen', '9:41', 'Re: Arden renewal terms', 'Attaching the latest terms before Thursday.'],
    ['Dev Patel', '10:02', 'Pricing deck, final?', 'Is this the version legal signed off on?'],
    ['Ana Ruiz', '11:18', 'Discount approval', 'Who approved the 12% for Northwind?'],
    ['Tom Becker', '13:05', 'Q3 supplier delays', 'Three vendors slipped again this month.'],
    ['Lina Okafor', '14:30', 'Contract redlines', 'Comments on sections 4 and 7 inside.'],
    ['Sam Ito', '16:47', 'Notes from Tuesday', 'Summary and owners for each action.'],
  ],
  pdf: [
    ['Q3 Supplier Review', 'finance · 14 pp'],
    ['Arden MSA 2026', 'legal · 22 pp'],
    ['Pricing Policy v4', 'sales · 9 pp'],
    ['Board Pack · Oct', 'exec · 31 pp'],
    ['Vendor Scorecard', 'ops · 6 pp'],
    ['Renewal Terms', 'legal · 12 pp'],
  ],
  text: [
    ['meeting-notes.txt', 'Decision: launch moves to 12 Mar.', 'Owner: Priya. Review on Friday.'],
    ['decisions.md', 'Keep the Q2 pricing for renewals.', 'Discounts over 10% need sign-off.'],
    ['call-notes.txt', 'Arden wants a two-year term.', 'Follow up with legal by Monday.'],
    ['handover.txt', 'Open tickets are in the tracker.', 'Supplier contacts are in the sheet.'],
    ['todo.md', 'Send the deck to Northwind.', 'Check who approved the discount.'],
    ['ideas.md', 'Bundle support with renewals.', 'Ask finance for last year’s numbers.'],
  ],
  message: [
    ['# ops-sync', 'Who approved the discount?', 'Checking the deck', 'Need it by 3pm'],
    ['# deals', 'Arden signed?', 'Not yet, Friday', 'Ok, ping legal'],
    ['# finance', 'Q3 numbers are in', 'Which tab?', 'Pricing, row 40'],
    ['# sales-emea', 'Latest pricing deck?', 'In the drive', 'Which folder?'],
    ['# product', 'Launch date moved', 'To when?', '12 March'],
    ['# support', 'Renewal terms link?', 'Sent it Monday', 'Can’t find it'],
  ],
  sheet: [
    ['pricing_2026.xlsx'],
    ['suppliers.xlsx'],
    ['pipeline.csv'],
    ['budget_q3.xlsx'],
    ['renewals.xlsx'],
    ['headcount.csv'],
  ],
  slides: [
    ['Q3 Roadmap', '04'],
    ['Pricing Update', '07'],
    ['Supplier Plan', '03'],
    ['Board Review', '12'],
    ['Launch Plan', '05'],
    ['Renewals', '09'],
  ],
} as const;
const said = (kind: keyof typeof WORDS, k: number): readonly string[] =>
  WORDS[kind][k % WORDS[kind].length] ?? [];

/**
 * One item of `kind` (the k-th), centred on (0, 0). `bare` leaves out its
 * sheet (only its face); `detail` false draws its words as bars (for
 * copies too blurred or too covered to read).
 */
export function fileItem(
  id: string,
  kind: FileKind,
  k: number,
  tex: PaperTextures,
  bare = false,
  detail = true,
): SceneNode[] {
  const tint = C.file[kind];
  const { w, h } = FILE_SIZE[kind];
  const nodes: SceneNode[] = bare ? [] : card(id, w, h, tex);
  const x0 = -w / 2 + 12;
  const y0 = -h / 2 + 15;
  const words = said(kind, k);
  /** A word, or (without detail) a bar as long as it would be. */
  const word = (
    key: string,
    text: string,
    x: number,
    y: number,
    font: (typeof IT)[keyof typeof IT],
    fill: string,
    align: 'left' | 'right' = 'left',
  ) => {
    if (detail) return tx(`${id}-${key}`, text, x, y, font, fill, { align });
    const bw = roughWidth(text, font);
    return bar(`${id}-${key}`, align === 'right' ? x - bw : x, y, bw, font.size * 0.42, fill);
  };
  switch (kind) {
    case 'email': {
      const [from = '', time = '', subject = '', preview = ''] = words;
      const initials = from
        .split(' ')
        .map((p) => p[0])
        .join('');
      nodes.push(
        shapeNode(`${id}-av`, { geometry: rect(x0 + 8, y0 + 3, 16, 16, 8), fill: tint.icon }),
        ...(detail
          ? [tx(`${id}-ini`, initials, x0 + 8, y0 + 3, IT.initials, P.white, { align: 'center' })]
          : []),
        word('from', from, x0 + 21, y0, IT.name, ink(0.88)),
        word('to', 'to me', x0 + 21, y0 + 9, IT.meta, soft(0.7)),
        word('time', time, w / 2 - 12, y0, IT.meta, soft(0.7), 'right'),
        shapeNode(`${id}-rule`, {
          geometry: rect(0, y0 + 19, w - 24, 0.6, 0),
          fill: withAlpha(lighting.shadow, 0.08),
        }),
        word('subj', subject, x0, y0 + 30, IT.title, ink(0.92)),
        word('pre', preview, x0, y0 + 42, IT.body, soft(0.85)),
        lines(`${id}-l`, x0, y0 + 54, [w - 34, w - 52, w - 70], 7.5),
      );
      break;
    }
    case 'pdf': {
      const [title = '', meta = ''] = words;
      nodes.push(
        shapeNode(`${id}-tag`, { geometry: rect(x0 + 11, y0, 22, 11, 2.5), fill: tint.icon }),
        ...(detail
          ? [tx(`${id}-tag-t`, 'PDF', x0 + 11, y0, IT.tag, P.white, { align: 'center' })]
          : []),
        word('meta', meta, w / 2 - 12, y0, IT.meta, soft(0.7), 'right'),
        word('title', title, x0, y0 + 18, IT.title, ink(0.92)),
      );
      // A figure: a line over faint gridlines, its area tinted, its last point marked.
      const fx = x0;
      const fy = y0 + 30;
      const fw = w - 24;
      const fh = 34;
      const pts = [0.72, 0.55, 0.62, 0.38, 0.3, 0.12].map((v, i) => ({
        x: fx + (fw * i) / 5,
        y: fy + fh * (v + ((k * 0.07 + i * 0.03) % 0.08)),
      }));
      const path = pts
        .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join('');
      const last = pts[pts.length - 1] ?? { x: fx + fw, y: fy };
      nodes.push(
        shapeNode(`${id}-fig`, {
          geometry: rect(fx + fw / 2, fy + fh / 2, fw, fh, 2.5),
          fill: withAlpha(tint.chip, 0.8),
        }),
        ...[1, 2].map((g) =>
          shapeNode(`${id}-grid${g}`, {
            geometry: rect(fx + fw / 2, fy + (fh * g) / 3, fw - 6, 0.5, 0),
            fill: withAlpha(tint.icon, 0.18),
          }),
        ),
        shapeNode(`${id}-area`, {
          geometry: pathGeometry(`${path}L${fx + fw} ${fy + fh}L${fx} ${fy + fh}Z`),
          fill: linearGradient(0, fy, 0, fy + fh, [
            withAlpha(tint.icon, 0.22),
            withAlpha(tint.icon, 0),
          ]),
        }),
        shapeNode(`${id}-line`, {
          geometry: pathGeometry(path),
          stroke: { color: tint.icon, width: 1.2, cap: 'round', join: 'round' },
        }),
        shapeNode(`${id}-pt`, { geometry: rect(last.x, last.y, 4, 4, 2), fill: tint.icon }),
        lines(`${id}-l`, x0, fy + fh + 11, [w - 30, w - 40, w - 28, w - 56, w - 36, w - 48], 7.5),
      );
      break;
    }
    case 'text': {
      const [name = '', a = '', b = ''] = words;
      nodes.push(
        icon(`${id}-i`, 'doc', x0 + 5, y0, 11, tint.icon, 1.5),
        word('name', name, x0 + 14, y0, IT.meta, ink(0.75)),
        shapeNode(`${id}-rule`, {
          geometry: rect(0, y0 + 10, w - 24, 0.6, 0),
          fill: withAlpha(lighting.shadow, 0.08),
        }),
        ...(detail
          ? [
              tx(`${id}-a`, a, x0, y0 + 21, IT.body, ink(0.8), { maxWidth: w - 24 }),
              tx(`${id}-b`, b, x0, y0 + 41, IT.body, ink(0.8), { maxWidth: w - 24 }),
            ]
          : [
              lines(`${id}-a`, x0, y0 + 21, [w - 26, w - 60], 9.6),
              lines(`${id}-b`, x0, y0 + 41, [w - 30, w - 50], 9.6),
            ]),
        lines(
          `${id}-l`,
          x0,
          y0 + 62,
          [w - 28, w - 36, w - 30, w - 54, w - 32, w - 44, w - 30, w - 62, w - 40],
          7.5,
        ),
      );
      break;
    }
    case 'message': {
      const [channel = '', ...said3] = words;
      nodes.push(
        word('ch', channel, x0, y0, IT.name, ink(0.88)),
        word('n', `${3 + (k % 4)} new`, w / 2 - 12, y0, IT.meta, tint.icon, 'right'),
        shapeNode(`${id}-rule`, {
          geometry: rect(0, y0 + 9, w - 24, 0.6, 0),
          fill: withAlpha(lighting.shadow, 0.08),
        }),
      );
      // A thread: theirs on the left on Linen, yours on the right in the kind's tint.
      said3.forEach((line, m) => {
        const mine = m === 1;
        const y = y0 + 25 + m * 25;
        const bw = Math.min(w - 44, roughWidth(line, IT.body) + 14);
        const x = mine ? w / 2 - 12 - bw / 2 : x0 + 14 + bw / 2;
        if (!mine)
          nodes.push(
            shapeNode(`${id}-a${m}`, {
              geometry: rect(x0 + 4, y + 3, 9, 9, 4.5),
              fill: withAlpha(
                [C.person.fill, C.source.icon, C.outcome.fill][(m + k) % 3] ?? tint.icon,
                0.6,
              ),
            }),
          );
        nodes.push(
          shapeNode(`${id}-b${m}`, {
            geometry: rect(x, y, bw, 15, 7.5),
            fill: mine ? tint.stock : mixColors(C.bg.canvas, P.white, 0.2),
          }),
          detail
            ? tx(
                `${id}-bt${m}`,
                line,
                x - bw / 2 + 7,
                y,
                IT.body,
                mine ? withAlpha(tint.icon, 1) : ink(0.78),
              )
            : bar(`${id}-bt${m}`, x - bw / 2 + 7, y, bw - 14, 2.4, soft(0.4)),
        );
      });
      break;
    }
    case 'sheet': {
      const [name = ''] = words;
      const cols = 4;
      const rows = 6;
      const cw = (w - 24) / cols;
      const rh = 11.5;
      const gy = y0 + 10;
      nodes.push(
        icon(`${id}-i`, 'sheet', x0 + 5, y0 - 1, 11, tint.icon, 1.5),
        word('name', name, x0 + 14, y0 - 1, IT.meta, ink(0.75)),
        shapeNode(`${id}-head`, {
          geometry: rect(x0 + (cols * cw) / 2, gy + rh / 2, cols * cw, rh, 0),
          fill: tint.stock,
        }),
      );
      ['Region', 'Q1', 'Q2', 'Q3'].forEach((label, c) =>
        nodes.push(
          word(`h${c}`, label, x0 + c * cw + 4, gy + rh / 2, IT.cell, withAlpha(tint.icon, 1)),
        ),
      );
      const regions = ['North', 'South', 'East', 'West', 'Total'];
      for (let r = 1; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const cy = gy + r * rh + rh / 2;
          const value =
            c === 0
              ? (regions[r - 1] ?? '')
              : String(Math.round(600 + random('cell', kind, k, r, c) * 900)).replace(
                  /(\d)(\d{3})$/,
                  '$1,$2',
                );
          nodes.push(
            c === 0
              ? word(`v${r}-${c}`, value, x0 + 4, cy, IT.cell, ink(0.7))
              : word(`v${r}-${c}`, value, x0 + (c + 1) * cw - 4, cy, IT.meta, ink(0.62), 'right'),
          );
        }
      const hr = 2 + (k % 3);
      const d: string[] = [];
      for (let c = 1; c < cols; c++) d.push(`M${x0 + c * cw} ${gy}V${gy + rows * rh}`);
      for (let r = 1; r < rows; r++) d.push(`M${x0} ${gy + r * rh}H${x0 + cols * cw}`);
      nodes.push(
        shapeNode(`${id}-hl`, {
          geometry: rect(x0 + 2.5 * cw, gy + hr * rh + rh / 2, cw, rh, 0),
          stroke: { color: tint.icon, width: 1 },
        }),
        shapeNode(`${id}-grid`, {
          geometry: pathGeometry(d.join('')),
          stroke: { color: withAlpha(lighting.shadow, 0.1), width: 0.5 },
        }),
        shapeNode(`${id}-frame`, {
          geometry: rect(x0 + (cols * cw) / 2, gy + (rows * rh) / 2, cols * cw, rows * rh, 1.5),
          stroke: { color: withAlpha(lighting.shadow, 0.14), width: 0.6 },
        }),
      );
      break;
    }
    case 'slides': {
      const [title = '', page = ''] = words;
      nodes.push(
        shapeNode(`${id}-band`, {
          geometry: rect(0, -h / 2 + 2, w - 1, 3, 1.5),
          fill: tint.icon,
        }),
        word('title', title, x0, y0 + 4, IT.slide, ink(0.92)),
        ...[0, 1, 2].flatMap((b) => [
          shapeNode(`${id}-dot${b}`, {
            geometry: rect(x0 + 2, y0 + 21 + b * 11, 3, 3, 1.5),
            fill: tint.icon,
          }),
          bar(`${id}-bl${b}`, x0 + 8, y0 + 21 + b * 11, [58, 46, 52][b] ?? 50, 2.2, soft(0.32)),
        ]),
        word('page', page, w / 2 - 10, h / 2 - 9, IT.meta, soft(0.6), 'right'),
      );
      // A chart on the right: bars, or a ring.
      const cx = w / 2 - 40;
      const cy = 6;
      if (k % 2)
        nodes.push(
          shapeNode(`${id}-ring`, {
            geometry: rect(cx, cy, 38, 38, 19),
            stroke: { color: tint.stock, width: 7 },
          }),
          shapeNode(`${id}-arc`, {
            geometry: pathGeometry(`M${cx} ${cy - 19}A19 19 0 0 1 ${cx + 18} ${cy + 5}`),
            stroke: { color: tint.icon, width: 7 },
          }),
        );
      else
        [22, 32, 17, 27].forEach((bh, b) =>
          nodes.push(
            shapeNode(`${id}-bar${b}`, {
              geometry: rect(cx - 17 + b * 11.5, cy + 19 - bh / 2, 7, bh, 1.2),
              fill: b === 1 ? tint.icon : tint.stock,
            }),
          ),
        );
      break;
    }
  }
  return nodes;
}

/** How far item `it` has popped at film time `t`: the springy size (overshoots), its opacity and focus. */
export function popOf(it: OpeningItem, t: number) {
  const u = t - it.at;
  return {
    size: progress(t, it.at, POP.ease.duration, POP.ease),
    appear: clamp(u / 0.12),
    focus: clamp(u / 0.24),
  };
}

// ---------------------------------------------------------------------------
// Sorting into stacks
// ---------------------------------------------------------------------------

/** Every stack's sheet: one portrait rectangle, whatever its kind (px). */
export const STACK = { w: 150, h: 196, rise: 2.6 } as const;

/** Where each kind's stack stands (group px, its bottom sheet's centre): three over two, under the hour. */
export const STACK_SPOTS: Readonly<Record<FileKind, { x: number; y: number }>> = {
  email: { x: 130, y: 805 },
  pdf: { x: 360, y: 805 },
  text: { x: 590, y: 805 },
  message: { x: 130, y: 1060 },
  sheet: { x: 360, y: 1060 },
  slides: { x: 590, y: 1060 },
};

/**
 * The sorting: items leave over `span` (s) from `start`, the stacks
 * building together (each stack's nearest item first, round the six kinds
 * in turn), each gliding on a soft curve for `flight` and reshaping into
 * the stack's sheet on the way. Departures are on thirty-seconds, and the
 * flight is a whole number of them, so every landing is on the grid too.
 */
export const SORT = { start: beats(7.5), span: beats(2), flight: beats(9 / 8) } as const;

/** The badges pop onto the finished stacks, one a sixteenth after another. */
export const BADGES = { start: beats(10.75), each: beats(0.25), r: 21 } as const;

interface Sorting {
  readonly depart: number;
  readonly land: number;
  readonly layer: number;
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  /** Which side its path bows to. */
  readonly bow: number;
}

const SORTING: ReadonlyMap<string, Sorting> = (() => {
  const map = new Map<string, Sorting>();
  const last = ITEMS.length - 1;
  FILE_KINDS.forEach(({ kind }, ki) => {
    const spot = STACK_SPOTS[kind];
    const near = (it: OpeningItem) => Math.hypot(it.x - spot.x, it.y - spot.y);
    ITEMS.filter((it) => it.kind === kind)
      .sort((a, b) => near(a) - near(b))
      .forEach((it, layer) => {
        const depart = onGrid(SORT.start + (SORT.span * (layer * 6 + ki)) / last, SFX_DIV);
        map.set(it.id, {
          depart,
          land: depart + SORT.flight,
          layer,
          x: spot.x + (random('stack-x', it.id) - 0.5) * 3,
          y: spot.y - layer * STACK.rise,
          rot: (random('stack-r', it.id) - 0.5) * 2.4,
          bow: random('stack-bow', it.id) < 0.5 ? -1 : 1,
        });
      });
  });
  return map;
})();

/** When each stacked sheet is covered by the next one landing on it (its words then go unseen). */
const COVERED: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  const all = [...SORTING.entries()];
  for (const [id, s] of all) {
    const kind = ITEMS.find((it) => it.id === id)?.kind;
    const next = all.find(
      ([other, o]) => o.layer === s.layer + 1 && ITEMS.find((it) => it.id === other)?.kind === kind,
    );
    map.set(id, next ? next[1].land : Infinity);
  }
  return map;
})();

/** When each item lands on its stack (film s), for sound. */
export const STACK_LANDINGS: readonly number[] = [...SORTING.values()]
  .map((s) => s.land)
  .sort((a, b) => a - b);

/** When each badge pops (film s), in `FILE_KINDS` order. */
export const BADGE_TIMES: readonly number[] = FILE_KINDS.map(
  (_, i) => BADGES.start + i * BADGES.each,
);

/** Where item `it` is at `t` once it has left: on its curve, or on its stack. */
function sortedPose(it: OpeningItem, s: Sorting, t: number) {
  const u = progress(t, s.depart, SORT.flight, look.easing.camera);
  const dx = s.x - it.x;
  const dy = s.y - it.y;
  // A quadratic curve, bowed sideways by a fifth of its length.
  const c = { x: it.x + dx / 2 - dy * 0.2 * s.bow, y: it.y + dy / 2 + dx * 0.2 * s.bow };
  const at = (v: number) => ({
    x: (1 - v) ** 2 * it.x + 2 * (1 - v) * v * c.x + v * v * s.x,
    y: (1 - v) ** 2 * it.y + 2 * (1 - v) * v * c.y + v * v * s.y,
  });
  return { u, ...at(u), rot: lerp(it.rot, s.rot, u), path: at };
}

/** How far below each face's last mark its own sheet ends (px). */
const FACE_MARGIN: Readonly<Record<FileKind, number>> = {
  email: 27,
  pdf: 32,
  text: 23,
  message: 24,
  sheet: 24,
  slides: 6,
};

/**
 * The sheet of `kind` reshaping into the stack's sheet (`m` 0–1), its own
 * face pinned to the top and the rest of the page filling with fine lines.
 */
function morphedItem(
  id: string,
  it: OpeningItem,
  tex: PaperTextures,
  m: number,
  detail = true,
): SceneNode[] {
  if (m <= 0) return fileItem(id, it.kind, it.k, tex, false, detail);
  const own = FILE_SIZE[it.kind];
  const w = lerp(own.w, STACK.w, m);
  const h = lerp(own.h, STACK.h, m);
  const s = lerp(1, Math.min(1, (STACK.w - 8) / own.w), m);
  const top = -h / 2 + 4 * m;
  const nodes: SceneNode[] = [
    ...card(id, w, h, tex),
    groupNode(`${id}-c`, fileItem(`${id}-f`, it.kind, it.k, tex, true, detail), {
      transform: { y: top + (own.h * s) / 2, scale: s },
    }),
  ];
  const from = top + (own.h - FACE_MARGIN[it.kind]) * s + 6;
  const n = Math.floor((h / 2 - 14 - from) / 7.5);
  if (m > 0.4 && n >= 3)
    nodes.push(
      groupNode(
        `${id}-more`,
        [
          lines(
            `${id}-ml`,
            -w / 2 + 12,
            from + 4,
            Array.from({ length: n }, (_, i) => w - 28 - ((i * 23 + it.k * 11) % 40)),
          ),
        ],
        { opacity: (m - 0.4) / 0.6 },
      ),
    );
  return nodes;
}

/**
 * Scene 2's two extra piles, for the apps much of the knowledge lives in:
 * stacks like the others, badged with the products' official logos
 * (`examples/logos/`, trademarks of their owners).
 */
export type AppKind = 'slack' | 'm365';
export type PileKind = FileKind | AppKind;
export const APP_KINDS: readonly { kind: AppKind; name: string; logo: string; aspect: number }[] = [
  { kind: 'slack', name: 'Slack', logo: slackUrl, aspect: 1 },
  { kind: 'm365', name: 'Microsoft 365', logo: m365Url, aspect: 40 / 44 },
];
const isApp = (kind: PileKind): kind is AppKind => kind === 'slack' || kind === 'm365';

/** Loads the app logos (once, at setup, before a pile is drawn). */
export async function preloadPileLogos(): Promise<void> {
  await preloadImages(APP_KINDS.map((a) => a.logo));
}

/** An app's logo, centred, fitting a `size` px square. */
function logo(id: string, kind: AppKind, x: number, y: number, size: number): SceneNode {
  const app = APP_KINDS.find((a) => a.kind === kind) ?? APP_KINDS[0];
  const aspect = app?.aspect ?? 1;
  return imageNode(id, {
    src: app?.logo ?? '',
    width: aspect >= 1 ? size : size * aspect,
    height: aspect >= 1 ? size / aspect : size,
    transform: { x, y },
  });
}

/** What the app piles' pages say (fictional). */
const APP_WORDS = {
  slack: {
    head: '# deals',
    messages: [
      ['Maya Chen', 'Arden wants two years'],
      ['Dev Patel', 'Who approved 12%?'],
      ['Ana Ruiz', 'Deck is in the drive'],
      ['Sam Ito', 'Legal has the redlines'],
    ],
  },
  m365: {
    head: 'Q3 Planning.docx',
    title: 'Supplier plan',
  },
} as const;

/** A page from an app's pile (the k-th), at the stacks' sheet size, centred. */
function appSheet(
  id: string,
  kind: AppKind,
  k: number,
  tex: PaperTextures,
  detail = true,
): SceneNode[] {
  const { w, h } = STACK;
  const x0 = -w / 2 + 12;
  const y0 = -h / 2 + 15;
  const tint = C.file[kind];
  const text = (
    key: string,
    s: string,
    x: number,
    y: number,
    font: (typeof IT)[keyof typeof IT],
    fill: string,
  ) =>
    detail
      ? tx(`${id}-${key}`, s, x, y, font, fill)
      : bar(`${id}-${key}`, x, y, roughWidth(s, font), font.size * 0.42, fill);
  const nodes: SceneNode[] = [
    ...card(id, w, h, tex),
    logo(`${id}-logo`, kind, x0 + 5, y0, 10),
    text(
      'head',
      APP_WORDS[kind].head,
      x0 + 14,
      y0,
      kind === 'slack' ? IT.name : IT.meta,
      ink(0.85),
    ),
    shapeNode(`${id}-rule`, {
      geometry: rect(0, y0 + 10, w - 24, 0.6, 0),
      fill: withAlpha(lighting.shadow, 0.08),
    }),
  ];
  if (kind === 'slack') {
    // A thread: each message with its sender's avatar and name.
    APP_WORDS.slack.messages.forEach(([who, what], m) => {
      const y = y0 + 24 + m * 33;
      nodes.push(
        shapeNode(`${id}-a${m}`, {
          geometry: rect(x0 + 6, y + 4, 12, 12, 3.5),
          fill: withAlpha(
            [C.person.fill, C.source.icon, C.outcome.fill][(m + k) % 3] ?? tint.icon,
            0.7,
          ),
        }),
        text(`n${m}`, who, x0 + 16, y, IT.name, ink(0.85)),
        text(`m${m}`, what, x0 + 16, y + 10, IT.body, ink(0.72)),
        lines(`${id}-l${m}`, x0 + 16, y + 19, [w - 60 - ((m * 13) % 20)]),
      );
    });
  } else {
    // A document: its title, a paragraph, a table, more text.
    nodes.push(
      text('t', APP_WORDS.m365.title, x0, y0 + 24, IT.title, ink(0.92)),
      lines(`${id}-l`, x0, y0 + 38, [w - 28, w - 40, w - 34], 7.5),
      shapeNode(`${id}-tab`, {
        geometry: rect(0, y0 + 84, w - 24, 34, 2),
        fill: withAlpha(tint.chip, 0.9),
        stroke: { color: withAlpha(tint.icon, 0.25), width: 0.6 },
      }),
      shapeNode(`${id}-tab-h`, {
        geometry: rect(0, y0 + 71, w - 24, 8, 2),
        fill: withAlpha(tint.icon, 0.28),
      }),
      ...[0, 1, 2].map((r) =>
        lines(
          `${id}-row${r}`,
          x0 + 4,
          y0 + 81 + r * 8,
          [30, 24, 28].map((v) => v + r * 2),
          0,
        ),
      ),
      lines(`${id}-l2`, x0, y0 + 112, [w - 30, w - 26, w - 52, w - 38, w - 44], 7.5),
    );
  }
  return nodes;
}

/**
 * A pile's badge, centred: a white puck with a hairline edge holding a
 * disc of its kind's colour with the kind's icon in white, or, for an app,
 * its logo.
 */
function badgeNodes(id: string, kind: PileKind): SceneNode[] {
  const tint = C.file[kind];
  const r = BADGES.r;
  const d = r - 4;
  return [
    shapeNode(`${id}-puck`, {
      geometry: rect(0, 0, 2 * r, 2 * r, r),
      fill: P.white,
      stroke: { color: withAlpha(lighting.shadow, 0.08), width: 0.8 },
      shadow: elevationShadows(lighting, 'mid', { strength: 1.1 }),
    }),
    ...(isApp(kind)
      ? [logo(`${id}-logo`, kind, 0, 0, 22)]
      : [
          shapeNode(`${id}-disc`, {
            geometry: rect(0, 0, 2 * d, 2 * d, d),
            fill: linearGradient(0, -d, 0, d, [mixColors(tint.icon, P.white, 0.22), tint.icon]),
          }),
          icon(
            `${id}-i`,
            FILE_KINDS.find((f) => f.kind === kind)?.icon ?? 'doc',
            0,
            0,
            18,
            P.white,
            1.8,
          ),
        ]),
  ];
}

/** Where a stack's badge sits, from its bottom sheet's centre. */
const BADGE_AT = { x: STACK.w / 2 - 8, y: -5 * STACK.rise - STACK.h / 2 + 8 } as const;

/** A stack's icon badge, popping onto its top sheet's corner. */
function badge(kind: FileKind, i: number, o: { x: number; y: number }, t: number, prefix: string) {
  const at = BADGE_TIMES[i] ?? Infinity;
  if (t <= at) return [];
  const p = progress(t, at, POP.ease.duration, POP.ease);
  const spot = STACK_SPOTS[kind];
  return [
    groupNode(`${prefix}-badge-${kind}`, badgeNodes(`${prefix}-badge-${kind}`, kind), {
      transform: {
        x: o.x + spot.x + BADGE_AT.x,
        y: o.y + spot.y + BADGE_AT.y,
        scale: lerp(POP.from, 1, p),
      },
      ...(t - at < 0.1 ? { opacity: (t - at) / 0.1 } : {}),
    }),
  ];
}

/** A stack's soft contact shadow on the ground, under its bottom sheet. */
function contact(id: string): SceneNode {
  return shapeNode(id, {
    geometry: rect(0, STACK.h / 2 + 1, STACK.w * 0.92, 10, 5),
    fill: withAlpha(lighting.shadow, 0.12),
    blur: 7,
  });
}

/**
 * A finished, badged pile of `kind`, its bottom sheet centred on (x, y)
 * (board px), `scale` times its size: for the six kinds of file, exactly
 * the stack the opening sorted (same sheets, same places); for an app, six
 * of its pages squared up the same way. Only the top sheet's words are
 * drawn as words (the rest are covered).
 */
export function pileNode(
  id: string,
  kind: PileKind,
  x: number,
  y: number,
  tex: PaperTextures,
  scale = 1,
): SceneNode {
  const nodes: SceneNode[] = [contact(`${id}-ground`)];
  if (isApp(kind)) {
    for (let l = 0; l < 6; l++)
      nodes.push(
        groupNode(`${id}-s${l}`, appSheet(`${id}-s${l}-d`, kind, l, tex, l === 5), {
          transform: {
            x: (random('app-x', kind, l) - 0.5) * 3,
            y: -l * STACK.rise,
            rotation: l === 5 ? 0.3 : (random('app-r', kind, l) - 0.5) * 2.4,
          },
        }),
      );
  } else {
    const spot = STACK_SPOTS[kind];
    ITEMS.filter((it) => it.kind === kind)
      .map((it) => ({ it, s: SORTING.get(it.id) }))
      .filter((e): e is { it: OpeningItem; s: Sorting } => e.s !== undefined)
      .sort((a, b) => a.s.layer - b.s.layer)
      .forEach(({ it, s }, l) =>
        nodes.push(
          groupNode(`${id}-s${l}`, morphedItem(`${id}-s${l}-d`, it, tex, 1, l === 5), {
            transform: { x: s.x - spot.x, y: s.y - spot.y, rotation: s.rot },
          }),
        ),
      );
  }
  nodes.push(
    groupNode(`${id}-badge`, badgeNodes(`${id}-badge`, kind), {
      transform: { x: BADGE_AT.x, y: BADGE_AT.y },
    }),
  );
  return groupNode(id, nodes, { transform: { x, y, scale } });
}

/**
 * The items at film time `t` (offset by `o`): popping in, scattered, then
 * sorting themselves into the six stacks, which get their badges; ids
 * start with `prefix`. Paint order: scattered, then stacked (bottom sheet
 * first), then those in flight.
 */
export function openingItems(
  tex: PaperTextures,
  o: { x: number; y: number },
  t: number,
  prefix = 'op',
  /** Draw words as words (false for a copy too blurred to read them). */
  detail = true,
): SceneNode[] {
  const drawn: { z: number; node: SceneNode }[] = [];
  ITEMS.forEach((it, order) => {
    if (t <= it.at) return;
    const id = `${prefix}-${it.id}`;
    const s = SORTING.get(it.id);
    if (!s || t < s.depart) {
      const { size, appear, focus } = popOf(it, t);
      drawn.push({
        z: order / 100,
        node: groupNode(id, fileItem(`${id}-d`, it.kind, it.k, tex, false, detail), {
          transform: {
            x: o.x + it.x,
            y: o.y + it.y + 18 * (1 - size),
            rotation: it.rot + 12 * (1 - size),
            scale: lerp(POP.from, 1, size),
          },
          ...(appear < 1 ? { opacity: appear } : {}),
          ...(focus < 1 ? { blur: 9 * (1 - focus) } : {}),
        }),
      });
      return;
    }
    const pose = sortedPose(it, s, t);
    const m = clamp((pose.u - 0.15) / 0.7);
    const morph = m * m * (3 - 2 * m);
    // In flight: lifted a little, blurred along its path.
    const flying = pose.u < 1;
    const ahead = flying ? sortedPose(it, s, t + 1 / 120) : pose;
    const blur = flying
      ? motionBlur({ x: (ahead.x - pose.x) * 120, y: (ahead.y - pose.y) * 120 })
      : undefined;
    drawn.push({
      z: flying ? 100 + pose.u : 10 + s.layer,
      node: groupNode(
        id,
        morphedItem(`${id}-d`, it, tex, morph, detail && t < (COVERED.get(it.id) ?? Infinity)),
        {
          transform: {
            x: o.x + pose.x,
            y: o.y + pose.y,
            rotation: pose.rot,
            scale: 1 + 0.06 * Math.sin(Math.PI * pose.u),
          },
          ...(blur ? { blur } : {}),
        },
      ),
    });
  });
  drawn.sort((a, b) => a.z - b.z);
  return [
    ...drawn.map((d) => d.node),
    ...FILE_KINDS.flatMap(({ kind }, i) => badge(kind, i, o, t, prefix)),
  ];
}

// ---------------------------------------------------------------------------
// The glass and its words
// ---------------------------------------------------------------------------

/**
 * The statement's glass: frosted glass tinted with mist (the colour of
 * knowledge) at the centre of the frame, the items behind it showing
 * through blurred. It grows in from a little smaller as its frost thickens
 * (`rise`), the statement arrives on it letter by letter (`words`), then it
 * glides up to `top` (`move`) as the items sort themselves beneath it.
 * Later the hour's words take its place on the same glass, which reshapes
 * to fit them.
 */
export const GLASS = {
  start: beats(2.75),
  rise: 0.55,
  words: beats(3.25),
  move: { start: beats(7.25), duration: beats(1.5) },
  w: 640,
  h: 214,
  r: 30,
  /** Its top edge once it has moved up (group px). */
  top: 150,
  /** The blur of what is seen through it (px). */
  frost: 16,
} as const;

/** The glass's words: the statement, then (from `hour.start`) the hour's card text. */
export interface GlassWords {
  readonly statement: KineticText | undefined;
  readonly hour?: { readonly card: Headline; readonly start: number };
}

/** The glass and its words at film time `t` (offset by `o`). */
export function openingGlass(
  tex: PaperTextures,
  o: { x: number; y: number },
  t: number,
  words: GlassWords,
): SceneNode[] {
  const p = progress(t, GLASS.start, GLASS.rise, look.easing.enter);
  if (p <= 0) return [];
  const { statement, hour } = words;
  const up = progress(t, GLASS.move.start, GLASS.move.duration, look.easing.camera);
  const swap = hour ? progress(t, hour.start - 0.25, 0.5, look.easing.camera) : 0;
  const s = lerp(0.94, 1, p);
  const w = lerp(GLASS.w, hour?.card.width ?? GLASS.w, swap) * s;
  const h = lerp(GLASS.h, hour?.card.height ?? GLASS.h, swap) * s;
  const cx = o.x + W / 2;
  const cy = lerp(o.y + H / 2, o.y + GLASS.top + h / 2, up);
  const shape = rect(cx, cy, w, h, GLASS.r * s);
  const top = cy - h / 2;
  const nodes: SceneNode[] = [
    // Its shadow, and the ground seen through it.
    shapeNode('op-glass-base', {
      geometry: shape,
      fill: C.bg.canvas,
      shadow: elevationShadows(lighting, 'high', { strength: 0.8 }),
    }),
    // The items behind, frosted.
    groupNode(
      'op-glass-frost',
      [groupNode('op-glass-seen', openingItems(tex, o, t, 'gl', false), { blur: GLASS.frost * p })],
      { clip: shape },
    ),
    // The tint, lighter at the top where the light catches it, and its bright edge.
    shapeNode('op-glass-tint', {
      geometry: shape,
      fill: linearGradient(cx, top, cx, top + h, [
        withAlpha(C.source.bg, 0.72),
        withAlpha(C.source.bg, 0.56),
      ]),
      stroke: { color: withAlpha(P.white, 0.9), width: 1.5 },
    }),
    shapeNode('op-glass-sheen', {
      geometry: shape,
      fill: linearGradient(cx, top, cx, top + h * 0.6, [
        withAlpha(P.white, 0.45),
        withAlpha(P.white, 0),
      ]),
    }),
  ];
  // The statement, until the hour's words take its place.
  const out = hour ? progress(t, hour.start - 0.4, 0.35, look.easing.exit) : 0;
  if (statement && t >= GLASS.words && out < 1)
    nodes.push(
      groupNode('op-statement', [statement(t - GLASS.words, out)], {
        transform: { x: cx, y: cy - statement.height / 2 },
      }),
    );
  if (hour) {
    const since = t - hour.start - 0.2;
    const { card } = hour;
    const x = cx - w / 2 + HEAD.padX;
    if (since >= 0)
      nodes.push(
        groupNode('op-hour-title', [card.title(since - 0.08, 0)], {
          transform: { x, y: top + HEAD.padY },
        }),
      );
    if (card.sub && since >= card.subAt)
      nodes.push(
        groupNode('op-hour-sub', [card.sub(since - card.subAt, 0)], {
          transform: { x, y: top + HEAD.padY + card.title.height + HEAD.gap },
        }),
      );
  }
  return [groupNode('op-glass', nodes, p < 1 ? { opacity: p } : {})];
}
