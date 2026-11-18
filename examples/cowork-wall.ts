/**
 * The film's opening wall (scene 1, the pain point): a flood of the
 * company's paper (pages, charts, sticky notes, index cards, notebook
 * pages, folders, file printouts, photos, receipts) lands on the pinboard
 * and spills past it until every pixel is covered, the wall goes out of
 * focus, and then its paper lifts off, top layer first, and sorts itself into five
 * piles by where it lives (`cowork-piles.ts`): each piece glides on a soft
 * curve into the nearest pile, coming into focus on the way, and slips in
 * behind the folder. The board beneath has gone; bare ground is left.
 *
 * Realism without a per-frame cost: every kind of paper is drawn once at
 * setup into a picture at the output resolution (with its grain, curl and
 * contact shadow), plus a blurred copy for when it is moving fast and soft
 * shadows for when it is in the air. Each frame then only places pictures
 * on one canvas. A piece falls towards the board out of the air: large and
 * motion-blurred near the lens, its shadow wide, soft and far, then lands
 * with a small squash and turn, its shadow tight. Pieces buried under later
 * ones stop being drawn. Once the wall is whole it is one picture (and
 * three pre-blurred copies for the focus pull); for the sorting each piece
 * also has an out-of-focus picture, so the wall can come apart piece by
 * piece.
 *
 * Everything is placed by a seeded layout and timed in film seconds, so any
 * frame can be drawn first.
 */
import {
  clamp,
  createRng,
  groupNode,
  lerp,
  progress,
  withAlpha,
  type FontSpec,
  type SceneNode,
  type TextMeasurer,
} from '@html-animation-engine/core';
import { createRenderer, kineticText, type KineticText } from '@html-animation-engine/renderers';
import { SFX_DIV, onGrid } from './cowork-beat.js';
import {
  FH,
  FW,
  OPENING,
  PILE_REVEAL,
  PILE_SCALE,
  PILE_SPOTS,
  pileReveal,
  piles,
} from './cowork-board.js';
import { PILES, type PileKind } from './cowork-piles.js';
import { C, P, face, lighting, look, tone } from './cowork-look.js';
import {
  chartPage,
  fileCard,
  folder,
  indexCard,
  notebookPage,
  photo,
  printedPage,
  receipt,
  stickyNote,
  type PaperTextures,
  type Placed,
} from './cowork-paper.js';
import { cue, pad, pluck, seeded, slap, thump, whoosh, type Cues } from './sounds.js';

const { easing } = look;
const W = FW;
const H = FH;

// ---------------------------------------------------------------------------
// The paper
// ---------------------------------------------------------------------------

interface Variant {
  readonly w: number;
  readonly h: number;
  /** Extra room above the sheet (a folder's tab). */
  readonly top?: number;
  readonly draw: (id: string, p: Placed, tex: PaperTextures) => SceneNode;
}

const sticky = (color: string, seed: number, size = 118): Variant => ({
  w: size,
  h: size,
  draw: (id, p, tex) => stickyNote(id, p, tex, { color, seed, size }),
});
const page = (title: string, icon: 'doc' | 'sheet' | 'chat' | 'chart', curl = 0): Variant => ({
  w: 150,
  h: 196,
  draw: (id, p, tex) =>
    printedPage(id, p, tex, { title, icon, tint: C.source.icon, ...(curl ? { curl } : {}) }),
});
const file = (kind: string, title: string, meaning: Parameters<typeof tone>[0]): Variant => ({
  w: 142,
  h: 178,
  draw: (id, p, tex) => {
    const t = tone(meaning);
    return fileCard(id, p, tex, { kind, title, tint: { bg: t.bg, fg: t.fg } });
  },
});
const folderOf = (color: string, label: string): Variant => ({
  w: 196,
  h: 146,
  top: 18,
  draw: (id, p, tex) => folder(id, p, tex, { color, label }),
});

/** Every kind of paper in the flood: the company's knowledge, in all its forms. */
const VARIANTS: readonly Variant[] = [
  page('Q3 pricing', 'doc', 14),
  page('Vendor terms', 'doc'),
  page('Board notes', 'chat', 10),
  page('Ops review', 'sheet'),
  {
    w: 170,
    h: 140,
    draw: (id, p, tex) =>
      chartPage(id, p, tex, {
        title: 'Late deliveries',
        bars: [0.35, 0.5, 0.42, 0.8, 0.95],
        color: C.source.icon,
      }),
  },
  {
    w: 170,
    h: 140,
    draw: (id, p, tex) =>
      chartPage(id, p, tex, {
        title: 'Churn by region',
        bars: [0.7, 0.55, 0.62, 0.4, 0.3],
        color: C.person.fill,
      }),
  },
  sticky(C.insight.marker, 2),
  sticky(C.outcome.bg, 3, 104),
  sticky(C.source.bg, 4),
  sticky(C.person.bg, 5, 110),
  sticky(C.brand.tint, 6, 100),
  sticky(C.time.bg, 7),
  { w: 190, h: 118, draw: (id, p, tex) => indexCard(id, p, tex, { seed: 21, curl: 10 }) },
  { w: 190, h: 118, draw: (id, p, tex) => indexCard(id, p, tex, { seed: 22 }) },
  { w: 160, h: 200, draw: (id, p, tex) => notebookPage(id, p, tex, { seed: 31 }) },
  {
    w: 160,
    h: 200,
    draw: (id, p, tex) => notebookPage(id, p, tex, { seed: 32, ink: C.brand.deep }),
  },
  folderOf(C.insight.bg, 'contracts 2024'),
  folderOf(C.source.bg, 'audit · q2'),
  folderOf(C.outcome.bg, 'hr · pay bands'),
  folderOf(C.person.bg, 'customer escalations'),
  file('pdf', 'Renewal terms', 'friction'),
  file('xls', 'Forecast v7', 'outcome'),
  file('doc', 'Onboarding SOP', 'knowledge'),
  file('csv', 'Logistics log', 'insight'),
  file('ppt', 'Roadmap', 'brand'),
  {
    w: 150,
    h: 176,
    draw: (id, p, tex) => photo(id, p, tex, { sky: C.source.bg, ground: C.outcome.bg, seed: 41 }),
  },
  {
    w: 150,
    h: 176,
    draw: (id, p, tex) => photo(id, p, tex, { sky: C.time.bg, ground: C.person.bg, seed: 42 }),
  },
  { w: 96, h: 196, draw: (id, p, tex) => receipt(id, p, tex, { seed: 51 }) },
  { w: 96, h: 196, draw: (id, p, tex) => receipt(id, p, tex, { seed: 52 }) },
];

/** Room round each picture for its shadows. */
const PAD = 34;

// ---------------------------------------------------------------------------
// The flood: a seeded layout that leaves no pixel uncovered
// ---------------------------------------------------------------------------

interface Piece {
  readonly v: number;
  readonly x: number;
  readonly y: number;
  /** Degrees. */
  readonly rot: number;
  /** When it starts to fall towards the board. */
  readonly at: number;
  /** From this time on it is buried under later pieces and not drawn. */
  hiddenAt: number;
}

/** How long a piece takes from the air to resting on the board. */
const FALL = 0.26;
const SETTLE = 0.22;
const LANDED = FALL + SETTLE;

/** The pinboard's face in the frame once the camera has arrived (`cowork-board`'s pinboard). */
const BOARD = { x0: 24, y0: 320, x1: 696, y1: 1180 };

const corners = (p: { x: number; y: number; rot: number }, w: number, h: number, inset = 0) => {
  const r = (p.rot * Math.PI) / 180;
  const [c, s] = [Math.cos(r), Math.sin(r)];
  return { c, s, hw: w / 2 - inset, hh: h / 2 - inset };
};
/** Whether (px, py) is well inside a piece (`inset` px in from its edge). */
function inside(p: Piece, px: number, py: number, inset: number): boolean {
  const v = VARIANTS[p.v];
  if (!v) return false;
  const k = corners(p, v.w, v.h, inset);
  const [dx, dy] = [px - p.x, py - p.y];
  const lx = dx * k.c + dy * k.s;
  const ly = -dx * k.s + dy * k.c;
  return Math.abs(lx) <= k.hw && Math.abs(ly) <= k.hh;
}

function layout(): Piece[] {
  const rng = createRng('cowork-wall');
  const STEP = 4;
  const INSET = 3;
  const [cols, rows] = [Math.ceil(W / STEP) + 1, Math.ceil(H / STEP) + 1];
  const covered = new Uint8Array(cols * rows);
  const pieces: Piece[] = [];
  const cover = (p: Piece) => {
    const v = VARIANTS[p.v];
    if (!v) return;
    const reach = Math.hypot(v.w, v.h) / 2;
    const [c0, c1] = [
      Math.max(0, Math.floor((p.x - reach) / STEP)),
      Math.min(cols - 1, Math.ceil((p.x + reach) / STEP)),
    ];
    const [r0, r1] = [
      Math.max(0, Math.floor((p.y - reach) / STEP)),
      Math.min(rows - 1, Math.ceil((p.y + reach) / STEP)),
    ];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++)
        if (inside(p, c * STEP, r * STEP, INSET)) covered[r * cols + c] = 1;
    }
  };
  for (let n = 0; n < 900; n++) {
    const open: number[] = [];
    covered.forEach((on, i) => {
      if (on) return;
      // The first pieces land on the board itself, then the flood spills everywhere.
      if (n < 18) {
        const [px, py] = [(i % cols) * STEP, Math.floor(i / cols) * STEP];
        if (px < BOARD.x0 + 40 || px > BOARD.x1 - 40 || py < BOARD.y0 + 60 || py > BOARD.y1 - 60)
          return;
      }
      open.push(i);
    });
    if (open.length === 0) {
      if (n < 18) continue;
      break;
    }
    const target = open[Math.floor(rng.next() * open.length)] as number;
    const [px, py] = [(target % cols) * STEP, Math.floor(target / cols) * STEP];
    const v = Math.floor(rng.next() * VARIANTS.length);
    const size = VARIANTS[v] ?? { w: 120, h: 120 };
    const piece: Piece = {
      v,
      x: px + (rng.next() - 0.5) * size.w * 0.5,
      y: py + (rng.next() - 0.5) * size.h * 0.5,
      rot: (rng.next() - 0.5) * 26,
      at: 0,
      hiddenAt: Infinity,
    };
    pieces.push(piece);
    cover(piece);
  }
  // Times: unhurried at first, faster and faster until the frame is covered.
  const span = OPENING.flood.end - LANDED - OPENING.flood.start;
  return pieces.map((p, i) => ({
    ...p,
    at: onGrid(OPENING.flood.start + span * ((i + 1) / pieces.length) ** 0.62, SFX_DIV),
  }));
}

/**
 * When each piece is completely covered by later pieces that have landed,
 * it is no longer drawn (its shadow margin included, so nothing changes on
 * screen). Points off the frame count as covered.
 */
function bury(pieces: Piece[]): void {
  const margin = 14;
  pieces.forEach((p, i) => {
    const v = VARIANTS[p.v];
    if (!v) return;
    const reach = Math.hypot(v.w + 2 * margin, v.h + 2 * margin) / 2;
    const later = pieces.slice(i + 1).filter((o) => Math.hypot(o.x - p.x, o.y - p.y) < reach + 160);
    const k = corners(p, v.w + 2 * margin, v.h + 2 * margin);
    let hidden = 0;
    for (let ly = -k.hh; ly <= k.hh && hidden < Infinity; ly += 5) {
      for (let lx = -k.hw; lx <= k.hw; lx += 5) {
        const px = p.x + lx * k.c - ly * k.s;
        const py = p.y + lx * k.s + ly * k.c;
        if (px < 0 || px > W || py < 0 || py > H) continue;
        let first = Infinity;
        for (const o of later) if (inside(o, px, py, 1.5)) first = Math.min(first, o.at + LANDED);
        hidden = Math.max(hidden, first);
        if (hidden === Infinity) break;
      }
    }
    p.hiddenAt = hidden;
  });
}

export const PIECES: readonly Piece[] = (() => {
  const pieces = layout();
  bury(pieces);
  return pieces;
})();

// ---------------------------------------------------------------------------
// Pictures made at setup
// ---------------------------------------------------------------------------

interface Sprite {
  /** The paper, resting (grain, curl, contact shadow). */
  readonly sharp: HTMLCanvasElement;
  /** The same, smeared, for when it is moving fast. */
  readonly smear: HTMLCanvasElement;
  /** The same, out of focus as the finished wall is, for the sorting. */
  readonly soft: HTMLCanvasElement;
  /** Its shadow from the air: wide and soft. */
  readonly air: HTMLCanvasElement;
  readonly bw: number;
  readonly bh: number;
  /** The paper's centre within the picture. */
  readonly cx: number;
  readonly cy: number;
}

/** A speck of the opening line as it breaks into grain. */
interface Grain {
  readonly flies: boolean;
  /** Its place in the line's picture (css px) and its cell there (device px). */
  readonly x: number;
  readonly y: number;
  readonly px: number;
  readonly py: number;
  readonly color: string;
  /** When it comes loose, how long it lasts, how it drifts. */
  readonly at: number;
  readonly life: number;
  readonly vx: number;
  readonly vy: number;
  readonly phase: number;
}

export interface Wall {
  readonly sprites: readonly Sprite[];
  /** The opening line as a picture, a scratch copy to erase from, and its grains. */
  readonly first: {
    readonly image: HTMLCanvasElement;
    readonly scratch: HTMLCanvasElement;
    readonly w: number;
    readonly h: number;
    readonly cell: number;
    readonly grains: readonly Grain[];
  };
  /** The finished wall, sharp, then three steps out of focus. */
  readonly stills: readonly HTMLCanvasElement[];
  readonly scale: number;
}

const canvasOf = (doc: Document, w: number, h: number) => {
  const c = doc.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
};

/** A copy of `src` through a canvas filter (blur, at the picture's own scale). */
function filtered(
  doc: Document,
  src: HTMLCanvasElement,
  filter: string,
  veil?: string,
): HTMLCanvasElement {
  const out = canvasOf(doc, src.width, src.height);
  const g = out.getContext('2d');
  if (g) {
    if (veil) {
      // A whole-frame picture: the ground first, so the blur's edges stay opaque.
      g.fillStyle = C.bg.canvas;
      g.fillRect(0, 0, out.width, out.height);
    }
    g.filter = filter;
    g.drawImage(src, 0, 0);
    g.filter = 'none';
    if (veil) {
      g.fillStyle = veil;
      g.fillRect(0, 0, out.width, out.height);
    }
  }
  return out;
}

/** The opening line, laid out once. */
export interface WallText {
  readonly first: KineticText;
}

const LINE: FontSpec = face('headline', 46, { letterSpacing: -1.1, lineHeight: 1.12 });
export const WALL_FONTS: readonly FontSpec[] = [LINE];
/** Long after any entrance: the opening line settled. */
const SETTLED_TEXT = 1e4;

export function createWallText(measurer: TextMeasurer): WallText {
  const first = kineticText({
    id: 'open-first',
    text: 'Your company produces *knowledge* every day.',
    font: LINE,
    measurer,
    x: 0,
    y: 0,
    align: 'center',
    maxWidth: 600,
    breaks: [3],
    color: C.text.primary,
    accent: C.text.accent,
    at: 0,
    ease: easing.enter,
  });
  return { first };
}

/** Draws every picture the wall needs, once, at the output scale. */
export function createWall(doc: Document, tex: PaperTextures, scale: number, text: WallText): Wall {
  const sprites = VARIANTS.map((v, i): Sprite => {
    const bw = v.w + 2 * PAD;
    const bh = v.h + 2 * PAD + (v.top ?? 0);
    const cx = bw / 2;
    const cy = bh / 2 + (v.top ?? 0) / 2;
    const holder = doc.createElement('div');
    const r = createRenderer('canvas', holder, { width: bw, height: bh, pixelRatio: scale });
    r.render({
      width: bw,
      height: bh,
      camera: { x: bw / 2, y: bh / 2, zoom: 1, rotation: 0 },
      world: [v.draw(`wall-v${i}`, { x: cx, y: cy, lift: 0.45 }, tex)],
    });
    const drawn = holder.querySelector('canvas') as HTMLCanvasElement;
    const sharp = canvasOf(doc, drawn.width, drawn.height);
    sharp.getContext('2d')?.drawImage(drawn, 0, 0);
    r.destroy();
    const air = canvasOf(doc, bw * scale, bh * scale);
    const g = air.getContext('2d');
    if (g) {
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.filter = `blur(${11 * scale}px)`;
      g.fillStyle = withAlpha(lighting.shadow, 0.4);
      g.fillRect(cx - v.w / 2 + 4, cy - v.h / 2 + 4, v.w - 8, v.h - 8);
    }
    return {
      sharp,
      smear: filtered(doc, sharp, `blur(${3.2 * scale}px)`),
      soft: filtered(doc, sharp, `blur(${11 * scale}px)`),
      air,
      bw,
      bh,
      cx,
      cy,
    };
  });
  // The finished wall: every piece at rest, on the ground colour (nothing shows through).
  const still = canvasOf(doc, W * scale, H * scale);
  const g = still.getContext('2d');
  if (g) {
    g.fillStyle = C.bg.canvas;
    g.fillRect(0, 0, still.width, still.height);
    for (const p of PIECES) drawPiece(g, sprites, p, OPENING.flood.end + 10, scale);
  }
  // Out of focus in three steps, a little veiled each time (the line in front reads on it).
  const veil = (a: number) => withAlpha(C.bg.canvas, a);
  const stills = [
    still,
    filtered(doc, still, `blur(${2.5 * scale}px)`, veil(0.02)),
    filtered(doc, still, `blur(${6 * scale}px)`, veil(0.04)),
    filtered(doc, still, `blur(${11 * scale}px)`, veil(0.06)),
  ];
  return {
    sprites,
    first: lineGrains(doc, text, scale),
    stills,
    scale,
  };
}

/**
 * The opening line drawn once into a picture (as the scene draws it,
 * settled), then cut into grains: one per small cell of ink, each coming
 * loose a little after the one to its left (with some grit), drifting up
 * and away on the air and fading.
 */
function lineGrains(doc: Document, text: WallText, scale: number): Wall['first'] {
  const pad = LINE_PAD;
  const w = text.first.width + 2 * pad;
  const h = text.first.height + 2 * pad;
  const holder = doc.createElement('div');
  const r = createRenderer('canvas', holder, { width: w, height: h, pixelRatio: scale });
  r.render({
    width: w,
    height: h,
    camera: { x: w / 2, y: h / 2, zoom: 1, rotation: 0 },
    world: [
      groupNode('open-first-pic', [text.first(SETTLED_TEXT, 0)], {
        transform: { x: w / 2, y: pad },
      }),
    ],
  });
  const drawn = holder.querySelector('canvas') as HTMLCanvasElement;
  const image = canvasOf(doc, drawn.width, drawn.height);
  const ig = image.getContext('2d', { willReadFrequently: true });
  ig?.drawImage(drawn, 0, 0);
  r.destroy();
  const cell = Math.max(1, Math.round(2 * scale));
  const grains: Grain[] = [];
  const data = ig?.getImageData(0, 0, image.width, image.height).data;
  if (data) {
    const rng = createRng('wall-grain');
    const D = OPENING.dissolve;
    for (let py = 0; py < image.height; py += cell) {
      for (let px = 0; px < image.width; px += cell) {
        // The cell's densest pixel: its ink and colour.
        let a = 0;
        let i = 0;
        for (let dy = 0; dy < cell && py + dy < image.height; dy++) {
          for (let dx = 0; dx < cell && px + dx < image.width; dx++) {
            const j = ((py + dy) * image.width + px + dx) * 4;
            const aj = data[j + 3] ?? 0;
            if (aj > a) [a, i] = [aj, j];
          }
        }
        if (a === 0) continue;
        const x = px / scale;
        const y = py / scale;
        grains.push({
          // Faint cells (letter edges) only vanish; the inked ones fly.
          flies: a >= 60,
          x,
          y,
          px,
          py,
          color: `rgba(${data[i]},${data[i + 1]},${data[i + 2]},${(a / 255).toFixed(3)})`,
          at: D.start + D.duration * (0.72 * (x / w) + 0.12 * rng.next()),
          life: 0.35 + 0.4 * rng.next(),
          vx: 8 + 34 * rng.next(),
          vy: -(45 + 95 * rng.next()),
          phase: rng.next() * Math.PI * 2,
        });
      }
    }
  }
  return { image, scratch: canvasOf(doc, image.width, image.height), w, h, cell, grains };
}

/** Room round the opening line in its picture. */
const LINE_PAD = 24;
/** When the last grain of the opening line has gone. */
const GRAIN_END = OPENING.dissolve.start + OPENING.dissolve.duration + 0.95;

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * One piece at time `t`: falling out of the air towards the board (bigger
 * near the lens and pushed away from the frame's centre, as perspective
 * does; smeared by speed; its shadow wide, soft and far), then landing
 * with a small squash and a turn that settles.
 */
function drawPiece(
  g: CanvasRenderingContext2D,
  sprites: readonly Sprite[],
  p: Piece,
  t: number,
  scale: number,
): void {
  const s = sprites[p.v];
  if (!s || t < p.at || t >= p.hiddenAt) return;
  const u = clamp((t - p.at) / FALL);
  const z = 1 - u * u; // height above the board: falling faster and faster
  const after = t - p.at - FALL;
  const bounce = after > 0 ? Math.exp(-after / 0.07) * Math.sin(after * 2 * Math.PI * 7) : 0;
  const grow = 1 + 0.34 * z - 0.025 * bounce * (after > 0 ? 1 : 0);
  const spinSign = seeded('wall-spin', p.v + Math.round(p.x)) < 0.5 ? -1 : 1;
  const rot = ((p.rot + spinSign * (9 * z + 2.5 * bounce)) * Math.PI) / 180;
  const x = W / 2 + (p.x - W / 2) * (1 + 0.22 * z);
  const y = H / 2 + (p.y - H / 2) * (1 + 0.22 * z) - 26 * z;
  const appear = clamp(u * 7);
  const place = (dx: number, dy: number, k: number) => {
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.translate(x + dx, y + dy);
    g.rotate(rot);
    g.scale(grow * k, grow * k);
    g.translate(-s.cx, -s.cy);
  };
  if (z > 0.02) {
    // The shadow from the air: offset down and right (light from the top left), softer the higher.
    place(10 + 46 * z, 16 + 64 * z, 1 + 0.12 * z);
    g.globalAlpha = appear * 0.55 * (1 - 0.55 * z);
    g.drawImage(s.air, 0, 0, s.bw, s.bh);
  }
  place(0, 0, 1);
  const smear = clamp((z - 0.15) / 0.6);
  if (smear < 1) {
    g.globalAlpha = appear * (1 - smear);
    g.drawImage(s.sharp, 0, 0, s.bw, s.bh);
  }
  if (smear > 0) {
    g.globalAlpha = appear * smear;
    g.drawImage(s.smear, 0, 0, s.bw, s.bh);
  }
  g.globalAlpha = 1;
}

/** When the last piece is in its pile and the wall has gone. */
export const WALL_GONE = OPENING.break;

// ---------------------------------------------------------------------------
// The sorting
// ---------------------------------------------------------------------------

interface Flight {
  readonly p: Piece;
  readonly pile: PileKind;
  /** When it lifts off and when it is in its pile. */
  readonly at: number;
  readonly end: number;
  /** Where it slips into the pile (the folder's mouth, on screen) and its tilt there. */
  readonly tx: number;
  readonly ty: number;
  readonly trot: number;
}

/** The piles left to right, so each piece falls into the one below its column. */
const BY_X: readonly PileKind[] = [...PILES]
  .map((p) => p.kind)
  .sort((a, b) => PILE_SPOTS[a].x - PILE_SPOTS[b].x);

/**
 * Every piece still showing on the finished wall, with its flight: the top
 * layer leaves first (the flood in reverse), each into the pile under its
 * column of the frame, departures easing out over `OPENING.sort.span`.
 */
const FLIGHTS: readonly Flight[] = (() => {
  const { start, span, flight } = OPENING.sort;
  const shown = PIECES.filter((p) => p.hiddenAt === Infinity).sort((a, b) => b.at - a.at);
  const rng = createRng('cowork-sort');
  const n = Math.max(1, shown.length - 1);
  return shown.map((p, rank) => {
    const band = Math.min(BY_X.length - 1, Math.max(0, Math.floor((p.x / W) * BY_X.length)));
    const pile = BY_X[band] ?? 'files';
    const spot = PILE_SPOTS[pile];
    const at = start + span * (rank / n) ** 0.85;
    return {
      p,
      pile,
      at,
      end: at + flight,
      tx: spot.x + (rng.next() - 0.5) * 90 * PILE_SCALE,
      ty: spot.y - 95 * PILE_SCALE,
      trot: (rng.next() - 0.5) * 10,
    };
  });
})();
const FLIGHT_OF = new Map(FLIGHTS.map((f) => [f.p, f]));

/** How full each pile is at `t` (0–1): the share of its pieces already in. */
export function pileFills(t: number): Record<PileKind, number> {
  const fills = { mail: 0, files: 0, m365: 0, workspace: 0, slack: 0 } as Record<PileKind, number>;
  const totals = { ...fills };
  for (const f of FLIGHTS) {
    totals[f.pile] += 1;
    if (t >= f.end) fills[f.pile] += 1;
  }
  for (const k of BY_X) fills[k] = totals[k] ? fills[k] / totals[k] : 1;
  return fills;
}

/** One sprite placed at (x, y), turned `rot` degrees and scaled, at `alpha`. */
function blit(
  g: CanvasRenderingContext2D,
  s: Sprite,
  img: HTMLCanvasElement,
  x: number,
  y: number,
  rot: number,
  k: number,
  alpha: number,
  scale: number,
): void {
  if (alpha <= 0.002) return;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.translate(x, y);
  g.rotate((rot * Math.PI) / 180);
  g.scale(k, k);
  g.translate(-s.cx, -s.cy);
  g.globalAlpha = alpha;
  g.drawImage(img, 0, 0, s.bw, s.bh);
}

/**
 * The wall coming apart into the piles at `t`: the pieces still waiting
 * (out of focus, as the wall was), then those in the air, each lifting off
 * on a soft curve, shrinking towards the pile's size, turning to its tilt
 * there and coming into focus, its shadow growing and shrinking with its
 * height; it fades as it slips behind the folder (which is drawn above).
 */
function drawSorting(g: CanvasRenderingContext2D, wall: Wall, t: number): void {
  const { scale, sprites } = wall;
  const { flight } = OPENING.sort;
  for (const p of PIECES) {
    const f = FLIGHT_OF.get(p);
    if (!f || t >= f.at) continue;
    const s = sprites[p.v];
    if (s) blit(g, s, s.soft, p.x, p.y, p.rot, 1, 1, scale);
  }
  // The finished wall's own picture fades out over the first moment, so the switch is seamless.
  const still = wall.stills[wall.stills.length - 1];
  const veil = 1 - progress(t, OPENING.sort.start - 0.3, 0.3, easing.camera);
  if (still && veil > 0) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = veil;
    g.drawImage(still, 0, 0);
  }
  for (const p of PIECES) {
    const f = FLIGHT_OF.get(p);
    const s = sprites[p.v];
    if (!f || !s || t < f.at || t >= f.end) continue;
    const u = progress(t, f.at, flight, easing.camera);
    const lift = Math.sin(Math.PI * u);
    // A soft curve: up off the wall a little, then down into the pile.
    const cx = lerp(p.x, f.tx, 0.35);
    const cy = Math.min(p.y, f.ty) - 70;
    const x = (1 - u) * (1 - u) * p.x + 2 * u * (1 - u) * cx + u * u * f.tx;
    const y = (1 - u) * (1 - u) * p.y + 2 * u * (1 - u) * cy + u * u * f.ty;
    const k = lerp(1, PILE_SCALE * 0.7, u) * (1 + 0.07 * lift);
    const rot = lerp(p.rot, f.trot, u);
    const fade = 1 - clamp((u - 0.82) / 0.18);
    blit(
      g,
      s,
      s.air,
      x + 8 + 34 * lift,
      y + 12 + 46 * lift,
      rot,
      k * (1 + 0.1 * lift),
      0.4 * lift * fade,
      scale,
    );
    const focus = clamp(u * 1.7);
    blit(g, s, s.soft, x, y, rot, k, (1 - focus) * fade, scale);
    blit(g, s, s.sharp, x, y, rot, k, focus * fade, scale);
  }
  g.globalAlpha = 1;
}

/**
 * The wall layer at film time `t` (screen space; the camera stands still
 * from the flood until the wall has gone): the flood, then the finished
 * wall going out of focus behind "Most of it is lost.", then the sorting.
 */
export function drawWall(g: CanvasRenderingContext2D, wall: Wall, text: WallText, t: number): void {
  const { scale, stills } = wall;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  if (t >= WALL_GONE) return;
  if (t >= OPENING.sort.start - 0.3) {
    drawSorting(g, wall, t);
    return;
  }
  if (t >= OPENING.flood.end) {
    // Out of focus, step by step: each step crossfades into the next.
    const f =
      progress(t, OPENING.blur.start, OPENING.blur.duration, easing.camera) * (stills.length - 1);
    const k = Math.min(Math.floor(f), stills.length - 2);
    const a = stills[Math.max(0, k)];
    const b = stills[Math.max(0, k) + 1];
    if (a) g.drawImage(a, 0, 0);
    if (b && f > k) {
      g.globalAlpha = clamp(f - k);
      g.drawImage(b, 0, 0);
      g.globalAlpha = 1;
    }
  } else if (t >= OPENING.flood.start) {
    for (const p of PIECES) drawPiece(g, wall.sprites, p, t, scale);
  }
  if (t >= OPENING.dissolve.start && t < GRAIN_END) drawGrains(g, wall, t);
}

/** Where the opening line's centre sits on screen: the frame's centre, then riding up with the camera. */
const textY = (t: number) =>
  lerp(H / 2, 250, progress(t, OPENING.pan.start, OPENING.pan.duration, easing.camera));

/** The opening line breaking into grain: what is left of it, and the grains drifting off. */
function drawGrains(g: CanvasRenderingContext2D, wall: Wall, t: number): void {
  const { scale } = wall;
  const f = wall.first;
  const ox = W / 2 - f.w / 2;
  const oy = textY(t) - f.h / 2;
  // What is left: the picture with every loose grain's cell erased.
  const sg = f.scratch.getContext('2d');
  if (sg) {
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.globalCompositeOperation = 'copy';
    sg.drawImage(f.image, 0, 0);
    sg.globalCompositeOperation = 'destination-out';
    // Any opaque paint erases.
    sg.fillStyle = P.white;
    for (const gr of f.grains) if (t >= gr.at) sg.fillRect(gr.px, gr.py, f.cell, f.cell);
    // Whatever is left once the last grain has gone (the faintest antialiasing) goes with it.
    if (t >= OPENING.dissolve.start + OPENING.dissolve.duration)
      sg.clearRect(0, 0, f.scratch.width, f.scratch.height);
    sg.globalCompositeOperation = 'source-over';
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(f.scratch, ox * scale, oy * scale);
  }
  // The grains: drifting up and to the right on the air, turning over, fading.
  g.setTransform(scale, 0, 0, scale, 0, 0);
  const size = f.cell / scale;
  for (const gr of f.grains) {
    const age = t - gr.at;
    if (!gr.flies || age <= 0 || age >= gr.life) continue;
    const k = age / gr.life;
    const x = ox + gr.x + gr.vx * age + 5 * Math.sin(gr.phase + age * 9);
    const y = oy + gr.y + gr.vy * age - 30 * age * age;
    g.globalAlpha = 0.85 * (1 - k) * (1 - k);
    g.fillStyle = gr.color;
    const d = size * (1 - 0.45 * k);
    g.fillRect(x, y, d, d);
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// The line, and the piles
// ---------------------------------------------------------------------------

/**
 * Above the wall: the opening line arriving at the centre and riding up
 * with the camera (until it breaks into grain on the wall's canvas), and
 * the piles while the paper sorts into them (drawn above the wall, so each
 * piece slips in behind its folder). The camera is still on the lost group
 * then, so group-local places are screen places; once the wall has gone
 * the group draws the piles itself, identically.
 */
export function wallOverlay(text: WallText, tex: PaperTextures, t: number): SceneNode[] {
  const nodes: SceneNode[] = [];
  if (t < OPENING.dissolve.start) {
    nodes.push(
      groupNode('open-first-o', [text.first(t - OPENING.text, 0)], {
        transform: { x: W / 2, y: textY(t) - text.first.height / 2 },
      }),
    );
  }
  if (t >= PILE_REVEAL.start && t < WALL_GONE) {
    nodes.push(...piles(tex, { x: 0, y: 0 }, pileFills(t), (kind) => pileReveal(kind, t)));
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

/**
 * The opening's sound in film seconds: a low bed under the line; air as the
 * camera moves down; the flood a patter of paper landing, quieter the
 * faster it comes, under a rising rush; a muffled fall as the wall goes out
 * of focus; then a soft rush of air as the paper sorts itself
 * into the piles, with a quiet patter as the pieces slip in.
 */
export const WALL_CUES: readonly Cues[] = [
  cue(0, pad(OPENING.break, { chord: 'shadow', attack: 1.0, release: 1.0, gain: 0.85 })),
  cue(OPENING.text + 0.05, pluck({ degree: 4, octave: 1, gain: 0.3 })),
  // The line breaking into grain: a fine, rising hiss of sand.
  cue(
    OPENING.dissolve.start,
    whoosh(OPENING.dissolve.duration + 0.4, { from: 2500, to: 9000, peak: 0.35, gain: 0.32 }),
  ),
  cue(
    OPENING.pan.start,
    whoosh(OPENING.pan.duration, { from: 220, to: 900, peak: 0.5, gain: 0.3 }),
  ),
  cue(
    OPENING.flood.start,
    whoosh(OPENING.flood.end - OPENING.flood.start, { from: 300, to: 4000, peak: 0.95, gain: 1.2 }),
  ),
  PIECES.map((p, i) => {
    const gap = (PIECES[i + 1]?.at ?? p.at + 0.1) - p.at;
    const pan = clamp((p.x - W / 2) / (W / 2), -1, 1) * 0.6;
    return cue(p.at + FALL, slap({ gain: clamp(gap / 0.18, 0.12, 0.42), pan }));
  }),
  cue(
    OPENING.blur.start,
    whoosh(OPENING.blur.duration + 0.3, { from: 2400, to: 200, peak: 0.15, gain: 0.5 }),
  ),
  cue(OPENING.blur.start, thump({ gain: 0.35 })),
  // The paper lifting off and sorting itself into the piles: a soft rush of
  // air, a note as the empty folders settle, a quiet patter as pieces slip in.
  cue(
    OPENING.sort.start,
    whoosh(OPENING.sort.span + OPENING.sort.flight, { from: 1800, to: 420, peak: 0.45, gain: 0.5 }),
  ),
  cue(PILE_REVEAL.start + 0.15, pluck({ degree: 2, octave: 1, gain: 0.22 })),
  FLIGHTS.filter((_, i) => i % 3 === 0).map((f) =>
    cue(f.end - 0.06, slap({ gain: 0.13, pan: clamp((f.tx - W / 2) / (W / 2), -1, 1) * 0.6 })),
  ),
  cue(OPENING.break - 0.05, pluck({ degree: 4, octave: 1, gain: 0.24 })),
];
