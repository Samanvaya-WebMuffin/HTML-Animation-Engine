/**
 * The opening's piles: the board's knowledge sorted by where it lives, each
 * kind in its own overfilled folder (Mail, Files, Microsoft 365, Google
 * Workspace, Slack). Items are stuffed in behind the front panel, so their
 * tops peek out above it, askew, and a few push out at the sides; the front
 * bows a little under the load and carries its logo and name: the official
 * logos for Microsoft 365, Google Workspace and Slack (`examples/logos/`,
 * trademarks of their owners), generic icons in the same manner for Mail
 * and Files. A pile can also become scene 2's circle tile (`morph`).
 */
import {
  clamp,
  createRng,
  groupNode,
  imageNode,
  lerp,
  linearGradient,
  mixColors,
  pathGeometry,
  rect,
  shapeNode,
  textNode,
  withAlpha,
  type SceneNode,
} from '@html-animation-engine/core';
import { C, P, face, icon, lighting, tone, type IconName } from './cowork-look.js';
import { paperShadows, printLines, sheet, type PaperTextures } from './cowork-paper.js';
import { elevationShadows, litGradient, preloadImages } from '@html-animation-engine/renderers';
import googleUrl from './logos/google.svg?url';
import m365Url from './logos/microsoft-365.svg?url';
import slackUrl from './logos/slack.svg?url';

/** A product's official logo (`examples/logos/`): its file and aspect ratio (w / h). */
interface Logo {
  readonly src: string;
  readonly aspect: number;
}
const LOGO = {
  m365: { src: m365Url, aspect: 40 / 44 },
  google: { src: googleUrl, aspect: 1 },
  slack: { src: slackUrl, aspect: 1 },
} as const satisfies Record<string, Logo>;

/** Loads the piles' logos (call once at setup, before drawing a pile). */
export async function preloadPileLogos(): Promise<void> {
  await preloadImages(Object.values(LOGO).map((l) => l.src));
}

/**
 * Mail and Files have no one brand, so they get generic icons drawn in the
 * logos' manner: soft multicolour gradients (the reveal's colours), rounded
 * overlapping shapes, a lighter layer in front. `s` is the icon's square.
 */
function mailIcon(id: string, s: number): SceneNode[] {
  const w = s;
  const h = s * 0.76;
  const [x0, y0, x1, y1] = [-w / 2, -h / 2, w / 2, h / 2];
  const r = s * 0.16;
  return [
    // The envelope's body.
    shapeNode(`${id}-body`, {
      geometry: rect(0, 0, w, h, r),
      fill: linearGradient(x0, y0, x1, y1, [C.meet.blue, C.meet.violet]),
    }),
    // The lower pocket: two folds meeting under the middle, lighter.
    shapeNode(`${id}-pocket`, {
      geometry: pathGeometry(
        `M${x0} ${y1 - r}L${-w * 0.08} ${h * 0.02}Q0 ${-h * 0.06} ${w * 0.08} ${h * 0.02}L${x1} ${y1 - r}Q${x1} ${y1} ${x1 - r} ${y1}H${x0 + r}Q${x0} ${y1} ${x0} ${y1 - r}Z`,
      ),
      fill: linearGradient(x0, 0, x1, y1, [C.meet.teal, C.meet.blue]),
    }),
    // The flap, folded down to a soft point.
    shapeNode(`${id}-flap`, {
      geometry: pathGeometry(
        `M${x0 + r * 0.4} ${y0 + r * 0.3}Q${x0 + r * 0.6} ${y0} ${x0 + r} ${y0}H${x1 - r}Q${x1 - r * 0.6} ${y0} ${x1 - r * 0.4} ${y0 + r * 0.3}L${w * 0.09} ${h * 0.12}Q0 ${h * 0.2} ${-w * 0.09} ${h * 0.12}Z`,
      ),
      fill: linearGradient(0, y0, 0, h * 0.18, [C.meet.lilac, C.meet.violet]),
    }),
  ];
}

function filesIcon(id: string, s: number): SceneNode[] {
  const w = s;
  const h = s * 0.8;
  const [x0, y0, x1, y1] = [-w / 2, -h / 2, w / 2, h / 2];
  const r = s * 0.12;
  const tab = { w: w * 0.42, h: h * 0.16 };
  const frontTop = y0 + h * 0.3;
  return [
    // The back, with its tab.
    shapeNode(`${id}-back`, {
      geometry: pathGeometry(
        `M${x0} ${y0 + r}Q${x0} ${y0} ${x0 + r} ${y0}H${x0 + tab.w - r * 0.4}Q${x0 + tab.w} ${y0} ${x0 + tab.w + r * 0.5} ${y0 + tab.h * 0.6}L${x0 + tab.w + r} ${y0 + tab.h}H${x1 - r}Q${x1} ${y0 + tab.h} ${x1} ${y0 + tab.h + r}V${y1 - r}Q${x1} ${y1} ${x1 - r} ${y1}H${x0 + r}Q${x0} ${y1} ${x0} ${y1 - r}Z`,
      ),
      fill: linearGradient(x0, y0, x1, y1, [C.meet.amber, C.meet.pink]),
    }),
    // A sheet inside.
    shapeNode(`${id}-sheet`, {
      geometry: rect(0, frontTop - h * 0.04, w * 0.74, h * 0.3, r * 0.6),
      fill: P.white,
    }),
    // The front, lighter, overlapping.
    shapeNode(`${id}-front`, {
      geometry: rect(0, (frontTop + y1) / 2, w, y1 - frontTop, r),
      fill: linearGradient(x0, frontTop, x1, y1, [
        mixColors(C.meet.amber, P.white, 0.35),
        C.meet.amber,
      ]),
    }),
  ];
}

/** A pile's logo (or, for Mail and Files, its generic icon), centred at (x, y) in a `size` px square. */
function logos(id: string, kind: PileKind, x: number, y: number, size: number): SceneNode[] {
  if (kind === 'mail' || kind === 'files')
    return [
      groupNode(
        `${id}-logo`,
        kind === 'mail' ? mailIcon(`${id}-m`, size) : filesIcon(`${id}-f`, size),
        { transform: { x, y } },
      ),
    ];
  const l = kind === 'm365' ? LOGO.m365 : kind === 'workspace' ? LOGO.google : LOGO.slack;
  return [
    imageNode(`${id}-logo`, {
      src: l.src,
      width: l.aspect >= 1 ? size : size * l.aspect,
      height: l.aspect >= 1 ? size / l.aspect : size,
      transform: { x, y },
    }),
  ];
}

export type PileKind = 'mail' | 'files' | 'm365' | 'workspace' | 'slack';

export const PILES: readonly { kind: PileKind; name: string; icon: IconName }[] = [
  { kind: 'mail', name: 'Mail', icon: 'mail' },
  { kind: 'files', name: 'Files', icon: 'folder' },
  { kind: 'm365', name: 'Microsoft 365', icon: 'apps' },
  { kind: 'workspace', name: 'Google Workspace', icon: 'cloud' },
  { kind: 'slack', name: 'Slack', icon: 'hash' },
];

/** A pile as scene 2's circle tile: radius and logo size (px on the board). */
export const TILE = { r: 42, logo: 34 } as const;

const smooth = (x: number) => x * x * (3 - 2 * x);

/** The folder's size (local px, origin at the front panel's centre). */
export const PILE = { w: 220, front: 140, back: 196, tab: 20 } as const;

const tag = (meaning: 'knowledge' | 'outcome' | 'insight' | 'people') => tone(meaning);
/** Tag colours for file types: documents mist, sheets sage, slides sand, PDFs rose. */
const TYPE_TINT = {
  doc: tag('knowledge'),
  sheet: tag('outcome'),
  slide: tag('insight'),
  pdf: tag('people'),
  other: tag('knowledge'),
} as const;

const small = face('title', 10.5, { letterSpacing: 0 });
/** The pile's name on its label. */
export const PILE_NAME = face('title', 13.5, { letterSpacing: -0.1 });
const mono = face('mono', 10, { weight: 600, letterSpacing: 0.2 });

/** A white sheet (w × h, centred) with its paper, grain and shadow. */
function paper(id: string, w: number, h: number, tex: PaperTextures, kids: SceneNode[]) {
  return [...sheet(id, w, h, P.white, tex, 0, 0.6), ...kids];
}

/** A file-type chip, lowercase mono. */
function chip(id: string, x: number, y: number, text: string, t: { bg: string; fg: string }) {
  const w = 10 + text.length * 7;
  return [
    shapeNode(`${id}-bg`, { geometry: rect(x + w / 2, y, w, 18, 5), fill: t.bg }),
    textNode(`${id}-t`, {
      text,
      font: mono,
      fill: t.fg,
      align: 'center',
      transform: { x: x + w / 2, y: y - 7 },
    }),
  ];
}

/** One item that belongs in a pile of `kind` (the k-th, for variety). */
function item(id: string, kind: PileKind, k: number, tex: PaperTextures): SceneNode[] {
  const w = 156;
  const h = 196;
  const x0 = -w / 2 + 14;
  const y0 = -h / 2 + 22;
  const lines = (y: number, n: number) =>
    printLines(
      `${id}-l`,
      x0,
      y,
      [w - 34, w - 48, w - 30, w - 62, w - 40, w - 56, w - 36, w - 70].slice(0, n),
    );
  switch (kind) {
    case 'mail':
      return paper(id, w, h, tex, [
        icon(`${id}-i`, 'mail', x0 + 6, y0 + 2, 12, C.source.icon, 1.6),
        shapeNode(`${id}-from`, {
          geometry: rect(x0 + 18 + 34, y0 + 2, 68, 4, 2),
          fill: withAlpha(C.text.secondary, 0.5),
        }),
        shapeNode(`${id}-subj`, {
          geometry: rect(x0 + (w - 50) / 2, y0 + 20, w - 50, 6, 3),
          fill: withAlpha(C.text.primary, 0.75),
        }),
        lines(y0 + 38, 7),
      ]);
    case 'files': {
      const types = [
        ['pdf', TYPE_TINT.pdf],
        ['csv', TYPE_TINT.sheet],
        ['zip', TYPE_TINT.other],
        ['png', TYPE_TINT.slide],
      ] as const;
      const [ext, tint] = types[k % types.length] ?? types[0];
      return paper(id, w, h, tex, [
        ...chip(`${id}-c`, x0, y0 + 2, ext, tint),
        shapeNode(`${id}-name`, {
          geometry: rect(x0 + 45, y0 + 24, 90, 5, 2.5),
          fill: withAlpha(C.text.primary, 0.7),
        }),
        lines(y0 + 42, 6),
      ]);
    }
    case 'm365':
    case 'workspace': {
      const types =
        kind === 'm365'
          ? (['docx', 'xlsx', 'pptx'] as const)
          : (['doc', 'sheet', 'slides'] as const);
      const which = k % 3;
      const ext = types[which] ?? 'doc';
      const tint = [TYPE_TINT.doc, TYPE_TINT.sheet, TYPE_TINT.slide][which] ?? TYPE_TINT.doc;
      const body: SceneNode[] = [];
      if (which === 0) body.push(lines(y0 + 30, 8));
      else if (which === 1) {
        // A spreadsheet's grid.
        const gx = x0;
        const gy = y0 + 24;
        const cols = 4;
        const rows = 8;
        const cw = (w - 28) / cols;
        const d: string[] = [];
        for (let c = 0; c <= cols; c++) d.push(`M${gx + c * cw} ${gy}V${gy + rows * 14}`);
        for (let r = 0; r <= rows; r++) d.push(`M${gx} ${gy + r * 14}H${gx + cols * cw}`);
        body.push(
          shapeNode(`${id}-head`, {
            geometry: rect(gx + (cols * cw) / 2, gy + 7, cols * cw, 14, 0),
            fill: withAlpha(tint.bg, 0.9),
          }),
          shapeNode(`${id}-grid`, {
            geometry: pathGeometry(d.join('')),
            stroke: { color: withAlpha(C.text.secondary, 0.3), width: 0.8 },
          }),
        );
      } else {
        // Slides: a landscape frame with a title bar and a shape.
        const sw = w - 28;
        const sh = sw * 0.62;
        const cy = y0 + 24 + sh / 2;
        body.push(
          shapeNode(`${id}-slide`, {
            geometry: rect(0, cy, sw, sh, 3),
            fill: withAlpha(tint.bg, 0.6),
            stroke: { color: withAlpha(C.text.secondary, 0.25), width: 0.8 },
          }),
          shapeNode(`${id}-st`, {
            geometry: rect(-sw / 2 + 40, cy - sh / 2 + 14, 64, 5, 2.5),
            fill: withAlpha(C.text.primary, 0.6),
          }),
          shapeNode(`${id}-sh`, {
            geometry: rect(sw / 4, cy + 8, 34, 34, 17),
            fill: withAlpha(tint.fg, 0.35),
          }),
          lines(cy + sh / 2 + 16, 3),
        );
      }
      return paper(id, w, h, tex, [...chip(`${id}-c`, x0, y0 + 2, ext, tint), ...body]);
    }
    case 'slack': {
      // A printed thread: the channel, then messages with their senders.
      const card: SceneNode[] = [
        textNode(`${id}-ch`, {
          text: ['# sales', '# ops', '# deals', '# finance'][k % 4] ?? '# sales',
          font: small,
          fill: C.text.primary,
          transform: { x: x0, y: y0 - 6 },
        }),
      ];
      [0, 1, 2].forEach((m) => {
        const y = y0 + 26 + m * 52;
        const who = [C.person.fill, C.source.icon, C.outcome.fill][(m + k) % 3] ?? C.person.fill;
        card.push(
          shapeNode(`${id}-a${m}`, {
            geometry: rect(x0 + 9, y + 6, 18, 18, 5),
            fill: withAlpha(who, 0.55),
          }),
          shapeNode(`${id}-n${m}`, {
            geometry: rect(x0 + 26 + 26, y, 52, 4.5, 2),
            fill: withAlpha(C.text.primary, 0.65),
          }),
          printLines(`${id}-m${m}`, x0 + 26, y + 13, [w - 60, w - 80], 9),
        );
      });
      return paper(id, w, h, tex, card);
    }
  }
}

/**
 * A pile of `kind`, its front panel centred at (x, y) (board px), `scale`
 * times its size. `fill` (0–1) is how many of its items have arrived; items
 * still to come are left out (their flight is drawn by the caller). `morph`
 * (0–1) turns it into scene 2's circle tile (`TILE.r` px, whatever the scale).
 */
export function pile(
  id: string,
  kind: PileKind,
  x: number,
  y: number,
  tex: PaperTextures,
  options: { scale?: number; fill?: number; opacity?: number; morph?: number } = {},
): SceneNode {
  const spec = PILES.find((p) => p.kind === kind) ?? { kind, name: kind, icon: 'folder' as const };
  // Becoming scene 2's tile (`morph` 0–1): the pages tuck in and the label
  // fades, then the front panel rounds into a disc, the logo gliding to its
  // centre; at 1 only the tile is left.
  const morph = clamp(options.morph ?? 0);
  const tuck = clamp(morph / 0.45);
  const round = smooth(clamp((morph - 0.3) / 0.7));
  const sc = options.scale ?? 1;
  const { w, front, back, tab } = PILE;
  const [x0, x1] = [-w / 2, w / 2];
  const fy0 = -front / 2;
  const fy1 = front / 2;
  const by0 = fy1 - back;
  const tint = C.pile[kind];
  const stock = mixColors(tint.stock, P.white, 0.2);
  const nodes: SceneNode[] = [];

  // The back panel and its tab (shrinking with the body as it becomes a tile).
  const tx = x0 + 16;
  const tw = w * 0.4;
  if (round < 1)
    nodes.push(
      shapeNode(`${id}-back`, {
        geometry: pathGeometry(
          `M${x0} ${by0 + 6}Q${x0} ${by0} ${x0 + 6} ${by0}H${tx}L${tx + 10} ${by0 - tab + 4}Q${tx + 12} ${by0 - tab} ${tx + 17} ${by0 - tab}H${tx + tw - 7}Q${tx + tw - 2} ${by0 - tab} ${tx + tw} ${by0 - tab + 4}L${tx + tw + 10} ${by0}H${x1 - 6}Q${x1} ${by0} ${x1} ${by0 + 6}V${fy1}H${x0}Z`,
        ),
        fill: linearGradient(0, by0 - tab, 0, fy1, [
          mixColors(stock, C.text.tertiary, 0.12),
          mixColors(stock, C.text.tertiary, 0.24),
        ]),
        shadow: paperShadows(1.2),
        ...(round > 0
          ? {
              opacity: 1 - clamp(round * 2.2),
              transform: {
                scaleX: 1 + ((2 * TILE.r) / sc / w - 1) * round,
                scaleY: 1 + ((2 * TILE.r) / sc / front - 1) * round,
              },
            }
          : {}),
      }),
    );

  // The items, stuffed in: tops peeking above the front at different heights,
  // each askew; the outer ones pushed out past the sides by the crowd.
  const rng = createRng(`pile-${kind}`);
  const count = 8;
  const shown = tuck >= 1 ? 0 : Math.round(clamp(options.fill ?? 1) * count);
  const scale = 0.72;
  const ih = 196 * scale;
  for (let k = 0; k < shown; k++) {
    const side = k === count - 2 ? -1 : k === count - 1 ? 1 : 0;
    // Two items pushed up highest by the crowd, so what they are shows.
    const tall = k === 2 || k === 4;
    const r = rng.next();
    const peek = side !== 0 ? 18 + r * 12 : tall ? 70 + r * 16 : 16 + r * 40;
    const rot = side !== 0 ? side * (16 + rng.next() * 4) : (rng.next() - 0.5) * 12;
    const dx = side !== 0 ? side * (w * 0.33) : (rng.next() - 0.5) * (w * 0.4);
    const cy = fy0 - peek + ih / 2 + tuck * (peek + 12);
    nodes.push(
      groupNode(`${id}-it${k}`, item(`${id}-it${k}`, kind, k, tex), {
        transform: { x: dx, y: cy, rotation: rot * (1 - tuck), scale, originX: 0, originY: 0 },
        ...(tuck > 0 ? { opacity: 1 - tuck } : {}),
      }),
    );
  }
  // The stack's thickness: the tops of the pages packed in behind the front.
  if (shown > 0 && tuck < 1)
    for (let e = 0; e < 5; e++) {
      const ew = w - 30 - e * 6;
      nodes.push(
        shapeNode(`${id}-edge${e}`, {
          geometry: rect((e % 2 ? 1 : -1) * e * 1.5, fy0 - 3 - e * 2.6, ew, 5, 1.5),
          fill: mixColors(P.white, C.surface.sunken, 0.25 + e * 0.12),
          stroke: { color: withAlpha(lighting.shadow, 0.08), width: 0.6 },
          transform: { rotation: (e - 2) * 0.6 },
          ...(tuck > 0 ? { opacity: 1 - tuck } : {}),
        }),
      );
    }

  const ly = fy0 + 52;
  const logoW = 22;
  if (morph > 0) {
    // Becoming the tile: the body rounds from the front panel into a disc.
    const R = TILE.r / sc;
    const bw = w + (2 * R - w) * round;
    const bh = front + (2 * R - front) * round;
    const br = 6 + (R - 6) * round;
    const centre = smooth(clamp(round * 1.4));
    nodes.push(
      shapeNode(`${id}-front`, {
        geometry: rect(0, 0, bw, bh, br),
        fill: linearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2, [
          mixColors(stock, P.white, 0.35),
          stock,
          mixColors(stock, C.text.tertiary, 0.14),
        ]),
        shadow: elevationShadows(lighting, 'mid'),
        ...(round > 0 ? { opacity: 1 - round } : {}),
      }),
    );
    if (round > 0)
      nodes.push(
        shapeNode(`${id}-disc`, {
          geometry: rect(0, 0, bw, bh, br),
          fill: litGradient(lighting, C.surface.raised, -bh / 2, bh / 2, {
            sheen: 0.2,
            shade: 0.06,
          }),
          stroke: { color: C.stroke.hairline, width: 1 / sc },
          opacity: round,
        }),
        shapeNode(`${id}-chip`, {
          geometry: rect(0, 0, 1.45 * R * round, 1.45 * R * round, 0.725 * R * round),
          fill: tint.stock,
          opacity: round,
        }),
      );
    if (tuck < 1)
      nodes.push(
        groupNode(
          `${id}-labelset`,
          [
            shapeNode(`${id}-label`, {
              geometry: rect(0, ly, w - 24, 46, 10),
              fill: withAlpha(P.white, 0.9),
              stroke: { color: withAlpha(lighting.shadow, 0.08), width: 0.8 },
            }),
            textNode(`${id}-name`, {
              text: spec.name,
              font: PILE_NAME,
              fill: C.text.primary,
              transform: { x: x0 + 26 + logoW + 9, y: ly - 9.5 },
            }),
          ],
          { opacity: 1 - tuck },
        ),
      );
    nodes.push(
      ...logos(
        `${id}-l`,
        kind,
        lerp(x0 + 26 + logoW / 2, 0, centre),
        lerp(ly, 0, centre),
        lerp(logoW, TILE.logo / sc, round),
      ),
    );
    if (round < 1)
      nodes.unshift(
        shapeNode(`${id}-ground`, {
          geometry: rect(0, fy1 + 4, w * 1.05, 18, 9),
          fill: withAlpha(lighting.shadow, 0.16),
          blur: 10,
          opacity: 1 - clamp(round * 2),
        }),
      );
    return groupNode(id, nodes, {
      transform: { x, y, scale: sc },
      ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
    });
  }

  // The front panel, bowed a little at the top by the load.
  const bow = 7;
  const frontPath = `M${x0} ${fy0 + 6}Q${x0 + 1} ${fy0} ${x0 + 8} ${fy0 - 1}Q0 ${fy0 - bow} ${x1 - 8} ${fy0 - 1}Q${x1 - 1} ${fy0} ${x1} ${fy0 + 6}V${fy1 - 4}Q${x1} ${fy1} ${x1 - 4} ${fy1}H${x0 + 4}Q${x0} ${fy1} ${x0} ${fy1 - 4}Z`;
  nodes.push(
    shapeNode(`${id}-front`, {
      geometry: pathGeometry(frontPath),
      fill: linearGradient(x0, fy0, x1, fy1, [
        mixColors(stock, P.white, 0.35),
        stock,
        mixColors(stock, C.text.tertiary, 0.14),
      ]),
      shadow: [
        { x: 0, y: -2, blur: 6, color: withAlpha(lighting.shadow, 0.18) },
        { x: 0, y: 1, blur: 1.5, color: withAlpha(lighting.shadow, 0.12) },
      ],
    }),
    // The pressed fold along the top, catching the light.
    shapeNode(`${id}-fold`, {
      geometry: pathGeometry(`M${x0 + 10} ${fy0 + 7}Q0 ${fy0 + 2 - bow} ${x1 - 10} ${fy0 + 7}`),
      stroke: { color: withAlpha(P.white, 0.6), width: 1.2 },
    }),
  );
  // The label: the kind's logo and its name.
  nodes.push(
    shapeNode(`${id}-label`, {
      geometry: rect(0, ly, w - 24, 46, 10),
      fill: withAlpha(P.white, 0.9),
      stroke: { color: withAlpha(lighting.shadow, 0.08), width: 0.8 },
    }),
    ...logos(`${id}-l`, kind, x0 + 26 + logoW / 2, ly, logoW),
    textNode(`${id}-name`, {
      text: spec.name,
      font: PILE_NAME,
      fill: C.text.primary,
      transform: { x: x0 + 26 + logoW + 9, y: ly - 9.5 },
    }),
  );
  // A soft contact shadow on the ground.
  nodes.unshift(
    shapeNode(`${id}-ground`, {
      geometry: rect(0, fy1 + 4, w * 1.05, 18, 9),
      fill: withAlpha(lighting.shadow, 0.16),
      blur: 10,
    }),
  );
  return groupNode(id, nodes, {
    transform: { x, y, scale: sc },
    ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
  });
}
