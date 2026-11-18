/**
 * Real paper on a real pinboard: printed pages, sticky notes, index cards,
 * tape and push pins, drawn to look physical. Light falls from the top
 * left; every sheet has a contact shadow, a soft key shadow and paper grain;
 * corners lift; sticky notes curl at the bottom; tape is translucent with
 * torn ends; pins are glossy. Textures (pinboard fabric and paper grain) are
 * generated once from a seed at setup, so every frame stays deterministic.
 */
import {
  createRng,
  groupNode,
  imageNode,
  linearGradient,
  mixColors,
  pathGeometry,
  radialGradient,
  rect,
  shapeNode,
  textNode,
  withAlpha,
  type SceneNode,
} from '@html-animation-engine/core';
import { preloadImages } from '@html-animation-engine/renderers';
import { C, P, face, icon, lighting, type IconName } from './cowork-look.js';

export interface PaperTextures {
  /** A pinboard's fine fabric, 512 px square. */
  readonly fabric: string;
  /** Paper grain: faint speckles on transparent, 256 px square. */
  readonly grain: string;
}

/** Makes the textures from a seed (a canvas in the page) and preloads them. */
export async function createPaperTextures(seed: string): Promise<PaperTextures> {
  const rng = createRng(seed);
  const canvas = (size: number) => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    if (!g) throw new Error('paper: Canvas 2D is unavailable.');
    return { c, g };
  };
  // Fabric: a pale, faintly violet weave with fine fibres.
  const f = canvas(512);
  f.g.fillStyle = mixColors(C.surface.sunken, C.stroke.hairline, 0.7);
  f.g.fillRect(0, 0, 512, 512);
  const data = f.g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < data.data.length; i += 4) {
    const n = (rng.next() - 0.5) * 14 + ((i / 4) % 2 === 0 ? 2 : -2);
    data.data[i] = Math.max(0, Math.min(255, (data.data[i] ?? 0) + n));
    data.data[i + 1] = Math.max(0, Math.min(255, (data.data[i + 1] ?? 0) + n));
    data.data[i + 2] = Math.max(0, Math.min(255, (data.data[i + 2] ?? 0) + n));
  }
  f.g.putImageData(data, 0, 0);
  for (let k = 0; k < 1400; k++) {
    const x = rng.next() * 512;
    const y = rng.next() * 512;
    const a = rng.next() * Math.PI;
    const len = 3 + rng.next() * 9;
    f.g.strokeStyle = withAlpha(
      rng.next() < 0.5 ? P.white : C.text.tertiary,
      0.06 + rng.next() * 0.08,
    );
    f.g.lineWidth = 0.6;
    f.g.beginPath();
    f.g.moveTo(x, y);
    f.g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    f.g.stroke();
  }
  // Grain: speckles of light and shade.
  const g = canvas(256);
  for (let k = 0; k < 2600; k++) {
    g.g.fillStyle = withAlpha(
      rng.next() < 0.5 ? C.text.tertiary : P.white,
      0.05 + rng.next() * 0.07,
    );
    g.g.fillRect(rng.next() * 256, rng.next() * 256, 1 + rng.next(), 1 + rng.next());
  }
  const textures = { fabric: f.c.toDataURL('image/png'), grain: g.c.toDataURL('image/png') };
  await preloadImages([textures.fabric, textures.grain]);
  return textures;
}

/** Shadows for paper resting on a board (`lift` raises it). */
export function paperShadows(lift = 1) {
  const shade = lighting.shadow;
  return [
    { x: 0.5, y: 1, blur: 1.5, color: withAlpha(shade, 0.22) },
    { x: 3 * lift, y: 9 * lift, blur: 22 * lift, color: withAlpha(shade, 0.18) },
  ];
}

/** A sheet's surface: lit from the top left, a touch darker towards the bottom right. */
function paperFill(color: string, w: number, h: number) {
  return linearGradient(-w / 2, -h / 2, w / 2, h / 2, [
    mixColors(color, P.white, 0.5),
    color,
    mixColors(color, C.text.tertiary, 0.08),
  ]);
}

export interface Placed {
  readonly x: number;
  readonly y: number;
  readonly rotation?: number;
  readonly opacity?: number;
  readonly blur?: number | { x: number; y: number; angle?: number };
  /** Height off the board (shadow size), default 1. */
  readonly lift?: number;
  readonly scale?: number;
}

function place(id: string, p: Placed, kids: SceneNode[]): SceneNode {
  return groupNode(id, kids, {
    transform: { x: p.x, y: p.y, rotation: p.rotation ?? 0, scale: p.scale ?? 1 },
    ...(p.opacity === undefined ? {} : { opacity: p.opacity }),
    ...(p.blur ? { blur: p.blur } : {}),
  });
}

/**
 * A sheet with its bottom-right corner lifting off the board: the outline
 * curves away, the underside catches light, and a shadow sits under it.
 */
export function sheet(
  id: string,
  w: number,
  h: number,
  color: string,
  tex: PaperTextures,
  curl: number,
  lift: number,
): SceneNode[] {
  const [x0, y0, x1, y1] = [-w / 2, -h / 2, w / 2, h / 2];
  const c = Math.max(0, curl);
  const outline = c
    ? `M${x0} ${y0}H${x1}V${y1 - c}Q${x1 - c * 0.15} ${y1 - c * 0.15} ${x1 - c} ${y1}H${x0}Z`
    : `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
  const nodes: SceneNode[] = [
    shapeNode(`${id}-paper`, {
      geometry: pathGeometry(outline),
      fill: paperFill(color, w, h),
      shadow: paperShadows(lift),
    }),
    groupNode(
      `${id}-grain`,
      [imageNode(`${id}-grain-img`, { src: tex.grain, width: w, height: h, opacity: 0.8 })],
      {
        clip: pathGeometry(outline),
      },
    ),
  ];
  if (c) {
    // The lifted corner: its underside, lighter, with a soft shadow beneath.
    const flap = `M${x1} ${y1 - c}Q${x1 - c * 0.15} ${y1 - c * 0.15} ${x1 - c} ${y1}Q${x1 - c * 0.55} ${y1 - c * 0.55} ${x1} ${y1 - c}Z`;
    nodes.push(
      shapeNode(`${id}-curlshade`, {
        geometry: pathGeometry(
          `M${x1} ${y1 - c}L${x1 + c * 0.25} ${y1 + c * 0.1}L${x1 - c} ${y1}Z`,
        ),
        fill: withAlpha(lighting.shadow, 0.16),
        blur: c * 0.35,
      }),
      shapeNode(`${id}-flap`, {
        geometry: pathGeometry(flap),
        fill: linearGradient(x1 - c, y1 - c, x1, y1, [
          mixColors(color, P.white, 0.7),
          mixColors(color, C.text.tertiary, 0.18),
        ]),
      }),
    );
  }
  return nodes;
}

/**
 * Marker handwriting at a glance: each line is a run of word-shaped strokes
 * (small loops riding a wavy baseline) with gaps between words.
 */
function scribble(
  id: string,
  x: number,
  y: number,
  widths: readonly number[],
  seed: number,
  color: string,
  gap = 18,
): SceneNode {
  const rng = createRng(`scribble-${seed}`);
  const parts: string[] = [];
  widths.forEach((width, k) => {
    let cx = x;
    const base = y + k * gap;
    while (cx < x + width - 8) {
      const w = Math.min(14 + rng.next() * 34, x + width - cx);
      const steps = Math.max(3, Math.round(w / 4));
      const amp = 2 + rng.next() * 2.5;
      const freq = 1.2 + rng.next() * 0.9;
      const pts: [number, number][] = [[cx, base + (rng.next() - 0.5) * 2]];
      for (let i = 1; i <= steps; i++) {
        const px = cx + (w * i) / steps;
        const loop = Math.sin(i * freq * 1.6 + seed) * amp * 0.75;
        const rise = i % 4 === 0 && rng.next() < 0.35 ? -amp * 1.4 : 0;
        pts.push([px, base + loop + rise]);
      }
      // Smooth: curve through the midpoints, so strokes flow like ink.
      let d = `M${pts[0]?.[0].toFixed(1)} ${pts[0]?.[1].toFixed(1)}`;
      for (let i = 1; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i] ?? [0, 0];
        const [x2, y2] = pts[i + 1] ?? [0, 0];
        d += `Q${x1.toFixed(1)} ${y1.toFixed(1)} ${((x1 + x2) / 2).toFixed(1)} ${((y1 + y2) / 2).toFixed(1)}`;
      }
      const end = pts[pts.length - 1];
      if (end) d += `L${end[0].toFixed(1)} ${end[1].toFixed(1)}`;
      parts.push(d);
      cx += w + 6 + rng.next() * 5;
    }
  });
  return shapeNode(id, {
    geometry: pathGeometry(parts.join('')),
    stroke: { color, width: 1.9, cap: 'round', join: 'round' },
  });
}

/** Printed text lines (grey bars), for paragraphs seen at a glance. */
export function printLines(
  id: string,
  x: number,
  y: number,
  widths: readonly number[],
  gap = 10,
  color = withAlpha(C.text.secondary, 0.42),
): SceneNode {
  return groupNode(
    id,
    widths.map((w, k) =>
      shapeNode(`${id}-${k}`, { geometry: rect(x + w / 2, y + k * gap, w, 3.2, 1.6), fill: color }),
    ),
  );
}

/** A glossy push pin, its point at (x, y). */
export function pin(id: string, x: number, y: number, color: string, r = 8): SceneNode {
  return groupNode(
    id,
    [
      shapeNode(`${id}-shadow`, {
        geometry: rect(4, 6, r * 2, r * 2, r),
        fill: withAlpha(lighting.shadow, 0.3),
        blur: 4,
      }),
      shapeNode(`${id}-head`, {
        geometry: rect(0, 0, r * 2, r * 2, r),
        fill: radialGradient(-r * 0.35, -r * 0.4, r * 1.5, [
          mixColors(color, P.white, 0.75),
          color,
          mixColors(color, lighting.shadow, 0.35),
        ]),
      }),
      shapeNode(`${id}-spec`, {
        geometry: rect(-r * 0.32, -r * 0.38, r * 0.55, r * 0.4, r * 0.2),
        fill: withAlpha(P.white, 0.85),
      }),
    ],
    { transform: { x, y } },
  );
}

/** A strip of translucent tape with torn ends. */
export function tape(id: string, x: number, y: number, w: number, rotation: number): SceneNode {
  const h = 26;
  const zig = (side: number) =>
    Array.from({ length: 6 }, (_, k) => {
      const yy = -h / 2 + (k * h) / 5;
      return `${side * (w / 2 + (k % 2 ? 2.5 : -1.5))} ${yy}`;
    });
  const right = zig(1);
  const left = zig(-1).reverse();
  const d = `M${right.join('L')}L${left.join('L')}Z`;
  return shapeNode(id, {
    geometry: pathGeometry(d),
    fill: linearGradient(0, -h / 2, 0, h / 2, [
      withAlpha(P.white, 0.62),
      withAlpha(C.surface.sunken, 0.5),
    ]),
    stroke: { color: withAlpha(P.white, 0.7), width: 0.8 },
    shadow: { x: 0.5, y: 1, blur: 2, color: withAlpha(lighting.shadow, 0.12) },
    transform: { x, y, rotation },
  });
}

/** A printed page: a title, a meaning icon, paragraph lines. */
export function printedPage(
  id: string,
  p: Placed,
  tex: PaperTextures,
  options: { title: string; icon: IconName; tint: string; curl?: number; w?: number; h?: number },
): SceneNode {
  const w = options.w ?? 150;
  const h = options.h ?? 196;
  return place(id, p, [
    ...sheet(id, w, h, P.white, tex, options.curl ?? 0, p.lift ?? 1),
    icon(`${id}-i`, options.icon, -w / 2 + 20, -h / 2 + 31, 13, options.tint, 1.6),
    textNode(`${id}-t`, {
      text: options.title,
      font: face('title', 11, { letterSpacing: 0 }),
      fill: C.text.primary,
      transform: { x: -w / 2 + 32, y: -h / 2 + 24 },
    }),
    printLines(
      `${id}-l`,
      -w / 2 + 14,
      -h / 2 + 54,
      [
        w - 34,
        w - 46,
        w - 30,
        w - 60,
        w - 38,
        w - 52,
        w - 34,
        w - 70,
        w - 44,
        w - 56,
        w - 40,
      ].slice(0, Math.floor((h - 70) / 11)),
    ),
  ]);
}

/** A printed chart page: a title and bars. */
export function chartPage(
  id: string,
  p: Placed,
  tex: PaperTextures,
  options: { title: string; bars: readonly number[]; color: string; curl?: number },
): SceneNode {
  const w = 170;
  const h = 140;
  return place(id, p, [
    ...sheet(id, w, h, P.white, tex, options.curl ?? 0, p.lift ?? 1),
    textNode(`${id}-t`, {
      text: options.title,
      font: face('title', 11, { letterSpacing: 0 }),
      fill: C.text.primary,
      transform: { x: -w / 2 + 14, y: -h / 2 + 12 },
    }),
    shapeNode(`${id}-axis`, {
      geometry: pathGeometry(`M${-w / 2 + 16} ${-h / 2 + 36}V${h / 2 - 18}H${w / 2 - 14}`),
      stroke: { color: C.stroke.strong, width: 1 },
    }),
    ...options.bars.map((v, k) => {
      const bh = (h - 62) * v;
      return shapeNode(`${id}-b${k}`, {
        geometry: rect(-w / 2 + 34 + k * 24, h / 2 - 19 - bh / 2, 14, bh, 2),
        fill:
          k === options.bars.length - 1 ? options.color : mixColors(options.color, P.white, 0.55),
      });
    }),
  ]);
}

/** A sticky note: a square of coloured paper, curling up a little at the bottom, with handwriting. */
export function stickyNote(
  id: string,
  p: Placed,
  tex: PaperTextures,
  options: { color: string; lines?: readonly number[]; seed: number; size?: number },
): SceneNode {
  const s = options.size ?? 118;
  const color = options.color;
  const outline = `M${-s / 2} ${-s / 2}H${s / 2}V${s / 2 - 4}Q0 ${s / 2 + 3} ${-s / 2} ${s / 2 - 4}Z`;
  return place(id, p, [
    shapeNode(`${id}-paper`, {
      geometry: pathGeometry(outline),
      fill: linearGradient(0, -s / 2, 0, s / 2, [
        mixColors(color, P.white, 0.25),
        color,
        mixColors(color, C.text.tertiary, 0.14),
      ]),
      shadow: [
        { x: 0.5, y: 1, blur: 1.5, color: withAlpha(lighting.shadow, 0.18) },
        { x: 2, y: 9, blur: 12, color: withAlpha(lighting.shadow, 0.16) },
      ],
    }),
    // The glue strip at the top sits flat and slightly darker.
    shapeNode(`${id}-glue`, {
      geometry: rect(0, -s / 2 + 9, s, 18),
      fill: withAlpha(mixColors(color, C.text.tertiary, 0.25), 0.25),
    }),
    groupNode(
      `${id}-grain`,
      [imageNode(`${id}-grain-img`, { src: tex.grain, width: s, height: s, opacity: 0.7 })],
      {
        clip: pathGeometry(outline),
      },
    ),
    scribble(
      `${id}-w`,
      -s / 2 + 12,
      -s / 2 + (34 * s) / 118,
      (options.lines ?? [80, 66, 74]).map((l) => (l * s) / 118),
      options.seed,
      withAlpha(C.text.primary, 0.72),
    ),
  ]);
}

/** A ruled index card: blue lines, a light red margin, typed and handwritten notes. */
export function indexCard(
  id: string,
  p: Placed,
  tex: PaperTextures,
  options: { seed: number; curl?: number },
): SceneNode {
  const w = 190;
  const h = 118;
  return place(id, p, [
    ...sheet(id, w, h, mixColors(P.white, C.insight.bg, 0.4), tex, options.curl ?? 0, p.lift ?? 1),
    shapeNode(`${id}-top`, {
      geometry: pathGeometry(`M${-w / 2} ${-h / 2 + 24}H${w / 2}`),
      stroke: { color: withAlpha(C.friction.fill, 0.55), width: 1 },
    }),
    shapeNode(`${id}-rules`, {
      geometry: pathGeometry(
        Array.from({ length: 5 }, (_, k) => `M${-w / 2} ${-h / 2 + 42 + k * 16}H${w / 2}`).join(''),
      ),
      stroke: { color: withAlpha(C.source.icon, 0.3), width: 0.8 },
    }),
    scribble(
      `${id}-w`,
      -w / 2 + 14,
      -h / 2 + 38,
      [120, 150, 96],
      options.seed,
      withAlpha(C.source.fg, 0.75),
      16,
    ),
  ]);
}

/** A page torn from a spiral notebook: ruled, holes along the top, a ragged torn edge. */
export function notebookPage(
  id: string,
  p: Placed,
  tex: PaperTextures,
  options: { seed: number; ink?: string },
): SceneNode {
  const w = 160;
  const h = 200;
  const rng = createRng(`notebook-${options.seed}`);
  const top = Array.from(
    { length: 17 },
    (_, k) =>
      `${(-w / 2 + (k * w) / 16).toFixed(1)} ${(-h / 2 + (rng.next() - 0.5) * 4).toFixed(1)}`,
  );
  const outline = `M${top.join('L')}L${w / 2} ${h / 2}L${-w / 2} ${h / 2}Z`;
  const color = mixColors(P.white, C.source.bg, 0.25);
  return place(id, p, [
    shapeNode(`${id}-paper`, {
      geometry: pathGeometry(outline),
      fill: paperFill(color, w, h),
      shadow: paperShadows(p.lift ?? 1),
    }),
    groupNode(
      `${id}-grain`,
      [imageNode(`${id}-grain-img`, { src: tex.grain, width: w, height: h, opacity: 0.8 })],
      {
        clip: pathGeometry(outline),
      },
    ),
    ...Array.from({ length: 8 }, (_, k) =>
      shapeNode(`${id}-hole${k}`, {
        geometry: rect(-w / 2 + 14 + k * 19, -h / 2 + 12, 7, 7, 3.5),
        fill: withAlpha(lighting.shadow, 0.14),
      }),
    ),
    shapeNode(`${id}-rules`, {
      geometry: pathGeometry(
        Array.from({ length: 9 }, (_, k) => `M${-w / 2} ${-h / 2 + 40 + k * 17}H${w / 2}`).join(''),
      ),
      stroke: { color: withAlpha(C.source.icon, 0.22), width: 0.8 },
    }),
    shapeNode(`${id}-margin`, {
      geometry: pathGeometry(`M${-w / 2 + 22} ${-h / 2 + 22}V${h / 2}`),
      stroke: { color: withAlpha(C.friction.fill, 0.45), width: 0.9 },
    }),
    scribble(
      `${id}-w`,
      -w / 2 + 28,
      -h / 2 + 36,
      [110, 96, 120, 70, 104, 88],
      options.seed,
      withAlpha(options.ink ?? C.source.fg, 0.8),
      17,
    ),
  ]);
}

/** A torn scrap of paper left under a pin after the note fell away. */
export function scrap(
  id: string,
  x: number,
  y: number,
  rotation: number,
  seed: number,
  color: string = P.white,
): SceneNode {
  const rng = createRng(`scrap-${seed}`);
  const pts = Array.from({ length: 9 }, (_, k) => {
    const a = (k / 9) * Math.PI * 2;
    const r = 9 + rng.next() * 9;
    return `${(Math.cos(a) * r * 1.3).toFixed(1)} ${(Math.sin(a) * r + 6).toFixed(1)}`;
  });
  return shapeNode(id, {
    geometry: pathGeometry(`M${pts.join('L')}Z`),
    fill: paperFill(color, 30, 30),
    shadow: paperShadows(0.6),
    transform: { x, y, rotation },
  });
}

/**
 * A card folder: a back panel with a tab, two sheets peeking out of it, and
 * a front panel a shade lighter, with a label strip. Coloured paper stock
 * in one of the theme's tints.
 */
export function folder(
  id: string,
  p: Placed,
  tex: PaperTextures,
  options: { color: string; label: string; w?: number; h?: number },
): SceneNode {
  const w = options.w ?? 196;
  const h = options.h ?? 146;
  const [x0, y0, x1, y1] = [-w / 2, -h / 2, w / 2, h / 2];
  const tab = { x: x0 + 14, w: w * 0.38, h: 18 };
  const back = `M${x0} ${y0 + 4}Q${x0} ${y0} ${x0 + 4} ${y0}H${tab.x}L${tab.x + 8} ${y0 - tab.h + 4}Q${tab.x + 10} ${y0 - tab.h} ${tab.x + 14} ${y0 - tab.h}H${tab.x + tab.w - 6}Q${tab.x + tab.w - 2} ${y0 - tab.h} ${tab.x + tab.w} ${y0 - tab.h + 4}L${tab.x + tab.w + 8} ${y0}H${x1 - 4}Q${x1} ${y0} ${x1} ${y0 + 4}V${y1}H${x0}Z`;
  const frontTop = y0 + 26;
  const front = `M${x0} ${frontTop + 3}Q${x0 + 1} ${frontTop} ${x0 + 5} ${frontTop}H${x1 - 5}Q${x1 - 1} ${frontTop} ${x1} ${frontTop + 3}V${y1 - 3}Q${x1} ${y1} ${x1 - 3} ${y1}H${x0 + 3}Q${x0} ${y1} ${x0} ${y1 - 3}Z`;
  const stock = options.color;
  return place(id, p, [
    shapeNode(`${id}-back`, {
      geometry: pathGeometry(back),
      fill: linearGradient(0, y0 - tab.h, 0, y1, [
        mixColors(stock, C.text.tertiary, 0.1),
        mixColors(stock, C.text.tertiary, 0.2),
      ]),
      shadow: paperShadows(p.lift ?? 1),
    }),
    // Sheets peeking out, each a little askew.
    ...[
      { dx: 10, dy: -12, r: -2.5 },
      { dx: -6, dy: -6, r: 1.8 },
    ].map((s, k) =>
      shapeNode(`${id}-sheet${k}`, {
        geometry: rect(s.dx, y0 + 30 + s.dy, w - 28, 60, 2),
        fill: linearGradient(0, y0, 0, y0 + 60, [
          P.white,
          mixColors(P.white, C.surface.sunken, 0.6),
        ]),
        stroke: { color: withAlpha(lighting.shadow, 0.08), width: 0.8 },
        shadow: { x: 0, y: 1, blur: 3, color: withAlpha(lighting.shadow, 0.12) },
        transform: { rotation: s.r },
      }),
    ),
    printLines(`${id}-peek`, x0 + 26, y0 + 12, [w * 0.42, w * 0.3], 7),
    shapeNode(`${id}-front`, {
      geometry: pathGeometry(front),
      fill: linearGradient(x0, frontTop, x1, y1, [
        mixColors(stock, P.white, 0.28),
        stock,
        mixColors(stock, C.text.tertiary, 0.12),
      ]),
      shadow: { x: 0, y: -1.5, blur: 4, color: withAlpha(lighting.shadow, 0.16) },
    }),
    groupNode(
      `${id}-grain`,
      [imageNode(`${id}-grain-img`, { src: tex.grain, width: w, height: h, opacity: 0.7 })],
      { clip: pathGeometry(front) },
    ),
    // A pressed fold line and the label strip.
    shapeNode(`${id}-fold`, {
      geometry: pathGeometry(`M${x0 + 6} ${frontTop + 6}H${x1 - 6}`),
      stroke: { color: withAlpha(P.white, 0.55), width: 1 },
    }),
    shapeNode(`${id}-strip`, {
      geometry: rect(x0 + 18 + w * 0.27, frontTop + 34, w * 0.54, 24, 3),
      fill: withAlpha(P.white, 0.85),
      stroke: { color: withAlpha(lighting.shadow, 0.1), width: 0.6 },
    }),
    textNode(`${id}-label`, {
      text: options.label,
      font: face('mono', 10.5, { letterSpacing: 0.1 }),
      fill: C.text.primary,
      transform: { x: x0 + 26, y: frontTop + 26 },
    }),
  ]);
}

/** A file printout: a big file-type tag (lowercase mono, no brand marks), a title and lines. */
export function fileCard(
  id: string,
  p: Placed,
  tex: PaperTextures,
  options: { kind: string; title: string; tint: { bg: string; fg: string }; curl?: number },
): SceneNode {
  const w = 142;
  const h = 178;
  return place(id, p, [
    ...sheet(id, w, h, P.white, tex, options.curl ?? 0, p.lift ?? 1),
    shapeNode(`${id}-dog`, {
      geometry: pathGeometry(`M${w / 2 - 22} ${-h / 2}L${w / 2} ${-h / 2 + 22}H${w / 2 - 22}Z`),
      fill: linearGradient(w / 2 - 22, -h / 2, w / 2, -h / 2 + 22, [
        mixColors(P.white, C.surface.sunken, 0.9),
        P.white,
      ]),
      shadow: { x: -1, y: 1.5, blur: 2.5, color: withAlpha(lighting.shadow, 0.16) },
    }),
    shapeNode(`${id}-tag`, {
      geometry: rect(-w / 2 + 38, -h / 2 + 34, 50, 26, 7),
      fill: options.tint.bg,
    }),
    textNode(`${id}-kind`, {
      text: options.kind,
      font: face('mono', 13, { weight: 600, letterSpacing: 0.2 }),
      fill: options.tint.fg,
      align: 'center',
      transform: { x: -w / 2 + 38, y: -h / 2 + 25 },
    }),
    textNode(`${id}-t`, {
      text: options.title,
      font: face('title', 11.5, { letterSpacing: 0 }),
      fill: C.text.primary,
      transform: { x: -w / 2 + 14, y: -h / 2 + 58 },
    }),
    printLines(`${id}-l`, -w / 2 + 14, -h / 2 + 86, [
      w - 30,
      w - 44,
      w - 34,
      w - 58,
      w - 40,
      w - 64,
      w - 36,
      w - 52,
    ]),
  ]);
}

/** An instant photo: a white frame, a soft landscape in the theme's tints, a gloss. */
export function photo(
  id: string,
  p: Placed,
  tex: PaperTextures,
  options: { sky: string; ground: string; seed: number },
): SceneNode {
  const w = 150;
  const h = 176;
  const iw = w - 18;
  const ih = 124;
  const iy = -h / 2 + 9 + ih / 2;
  const rng = createRng(`photo-${options.seed}`);
  const hill = Array.from({ length: 9 }, (_, k) => {
    const x = -iw / 2 + (k * iw) / 8;
    return `${x.toFixed(1)} ${(iy + 14 + Math.sin(k * 0.9 + options.seed) * 9 + (rng.next() - 0.5) * 6).toFixed(1)}`;
  });
  const window = rect(0, iy, iw, ih, 1.5);
  return place(id, p, [
    ...sheet(id, w, h, P.white, tex, 0, p.lift ?? 1),
    groupNode(
      `${id}-img`,
      [
        shapeNode(`${id}-sky`, {
          geometry: window,
          fill: linearGradient(0, iy - ih / 2, 0, iy + ih / 2, [
            mixColors(options.sky, P.white, 0.35),
            options.sky,
          ]),
        }),
        shapeNode(`${id}-sun`, {
          geometry: rect(iw * 0.22, iy - ih * 0.2, 26, 26, 13),
          fill: radialGradient(iw * 0.22, iy - ih * 0.2, 13, [
            withAlpha(P.white, 0.95),
            withAlpha(P.white, 0),
          ]),
        }),
        shapeNode(`${id}-hill`, {
          geometry: pathGeometry(
            `M${hill.join('L')}L${iw / 2} ${iy + ih / 2}L${-iw / 2} ${iy + ih / 2}Z`,
          ),
          fill: linearGradient(0, iy, 0, iy + ih / 2, [
            options.ground,
            mixColors(options.ground, C.text.tertiary, 0.25),
          ]),
        }),
        // Gloss: light across the print.
        shapeNode(`${id}-gloss`, {
          geometry: window,
          fill: linearGradient(-iw / 2, iy - ih / 2, iw / 2, iy + ih / 2, [
            withAlpha(P.white, 0.22),
            withAlpha(P.white, 0),
            withAlpha(P.white, 0.08),
          ]),
        }),
      ],
      { clip: window },
    ),
    shapeNode(`${id}-edge`, {
      geometry: window,
      stroke: { color: withAlpha(lighting.shadow, 0.12), width: 0.8 },
    }),
    scribble(
      `${id}-w`,
      -w / 2 + 16,
      h / 2 - 22,
      [70],
      options.seed,
      withAlpha(C.text.primary, 0.6),
    ),
  ]);
}

/** A till receipt: narrow thermal paper, mono lines, a total, a torn zigzag bottom. */
export function receipt(
  id: string,
  p: Placed,
  tex: PaperTextures,
  options: { seed: number },
): SceneNode {
  const w = 96;
  const h = 196;
  const teeth = Array.from({ length: 9 }, (_, k) => {
    const x = w / 2 - (k * w) / 8;
    return `${x.toFixed(1)} ${(h / 2 - (k % 2 ? 5 : 0)).toFixed(1)}`;
  });
  const outline = `M${-w / 2} ${-h / 2}H${w / 2}L${teeth.join('L')}Z`;
  const rng = createRng(`receipt-${options.seed}`);
  const rows = Array.from({ length: 9 }, () => 30 + rng.next() * 40);
  return place(id, p, [
    shapeNode(`${id}-paper`, {
      geometry: pathGeometry(outline),
      fill: paperFill(mixColors(P.white, C.surface.sunken, 0.35), w, h),
      shadow: paperShadows(p.lift ?? 1),
    }),
    groupNode(
      `${id}-grain`,
      [imageNode(`${id}-grain-img`, { src: tex.grain, width: w, height: h, opacity: 0.6 })],
      { clip: pathGeometry(outline) },
    ),
    shapeNode(`${id}-head`, {
      geometry: rect(0, -h / 2 + 18, w * 0.5, 6, 3),
      fill: withAlpha(C.text.primary, 0.55),
    }),
    printLines(`${id}-l`, -w / 2 + 10, -h / 2 + 38, rows, 11, withAlpha(C.text.primary, 0.32)),
    shapeNode(`${id}-rule`, {
      geometry: pathGeometry(`M${-w / 2 + 10} ${h / 2 - 50}H${w / 2 - 10}`),
      stroke: { color: withAlpha(C.text.primary, 0.3), width: 0.8, dash: [3, 2] },
    }),
    shapeNode(`${id}-total`, {
      geometry: rect(w / 2 - 30, h / 2 - 36, 36, 7, 2),
      fill: withAlpha(C.text.primary, 0.6),
    }),
  ]);
}
