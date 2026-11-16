import {
  createCanvasMeasurer,
  groupNode,
  lerp,
  progress,
  rect,
  shapeNode,
  textNode,
  type SceneNode,
  type TextMeasurer,
} from '@html-animation-engine/core';
import {
  aurora,
  defineSceneComposition,
  elevationShadows,
  edgeFade,
  flightPath,
  gridBackdrop,
  kineticText,
  motionBlur,
  screenVelocity,
  viewTransform,
  type BoardView,
  type KineticText,
} from '@html-animation-engine/renderers';
import {
  C,
  LOOK_FONTS,
  P,
  T,
  createLook,
  face,
  lighting,
  look,
  markTile,
  paperCard,
  textLines,
  timeRing,
  type Look,
} from '../cowork-look.js';
import { phoneDefaults } from '../index.js';
import { bell, cue, pluck, soundtrack, whoosh } from '../sounds.js';

const { easing } = look;
const W = phoneDefaults.width;
const H = phoneDefaults.height;
const FRAME = { width: W, height: H };

/**
 * The Cowork look on WebMuffin's Soft Calm design system, as a style sheet
 * on a small mood board: core colours, the natural tints (each with its one
 * meaning), the violet scale and the type roles in the first group; buttons,
 * input, tags and status, a search result, people, time and the mark in the
 * second. The camera flies between them on the optimal zoom-and-pan path,
 * with motion blur from its speed and parallax between the aurora (far), the
 * board and two cards passing close to the lens.
 */
const T0 = { flight: 2.5, land: 3.8, duration: 6.5 } as const;

/** The two groups' views on the board. */
const A: BoardView = { x: W / 2, y: H / 2, zoom: 1 };
/** Group B is taller than a frame, so the camera settles a little further back. */
const B: BoardView = { x: W / 2 + 1280, y: H / 2 + 560, zoom: 0.9 };
const ORIGIN_B = { x: W / 2 + 1280 - W / 2, y: H / 2 + 540 - H / 2 };
const path = flightPath(A, B, W);

/** Where the camera is: a slow drift on each group, the flight between them. */
function view(t: number): BoardView {
  if (t < T0.flight) {
    return { ...A, zoom: lerp(1, 1.02, progress(t, 0, T0.flight, easing.drift)) };
  }
  if (t < T0.land) {
    const s = progress(t, T0.flight, T0.land - T0.flight, easing.camera);
    const v = path.at(s);
    // Leave A's drift and arrive into B's, so the zoom never jumps.
    return { ...v, zoom: v.zoom * lerp(1.02, 1, s) };
  }
  return {
    ...B,
    zoom: B.zoom * lerp(1, 1.02, progress(t, T0.land, T0.duration - T0.land, easing.drift)),
  };
}

/** Light: violet pools on the Linen, a mist hint near the components. */
const light = aurora({
  id: 'aurora',
  seed: 'cowork-style',
  pools: () => [
    { x: -40, y: 120, rx: 420, ry: 320, rotation: -20, color: C.aurora.primary, alpha: 0.32 },
    { x: 760, y: 1180, rx: 380, ry: 300, rotation: 15, color: C.aurora.soft, alpha: 0.4 },
    { x: 860, y: 520, rx: 360, ry: 260, rotation: 30, color: C.aurora.primary, alpha: 0.26 },
    { x: 1150, y: 1260, rx: 300, ry: 220, color: C.aurora.knowledge, alpha: 0.22 },
    { x: 1010, y: 1010, rx: 240, ry: 180, rotation: -10, color: C.aurora.outcome, alpha: 0.2 },
    { x: 260, y: 860, rx: 260, ry: 200, color: C.aurora.soft, alpha: 0.22 },
  ],
});

const grid = gridBackdrop({
  id: 'grid',
  x: -600,
  y: -400,
  width: 3200,
  height: 2700,
  cell: 120,
  color: C.bg.grid,
  majorColor: C.bg.gridMajor,
});

/** The four natural tints: each carries one meaning. */
const TINTS: readonly { name: string; note: string; ramp: readonly string[]; ink: string }[] = [
  {
    name: 'Mist',
    note: 'Knowledge, sources, research',
    ramp: [P.mist50, P.mist100, P.mist300, P.mist500, P.mist700],
    ink: P.mist700,
  },
  {
    name: 'Rose',
    note: 'People; no access, friction',
    ramp: [P.rose50, P.rose100, P.rose300, P.rose500, P.rose700],
    ink: P.rose700,
  },
  {
    name: 'Sand',
    note: 'Highlights, insight, time',
    ramp: [P.sand50, P.sand100, P.sand300, P.sand500, P.sand700],
    ink: P.sand700,
  },
  {
    name: 'Sage',
    note: 'Done, saved, outcomes',
    ramp: [P.sage50, P.sage100, P.sage300, P.sage500, P.sage700],
    ink: P.sage700,
  },
];

/** The core surfaces and the one violet. */
const CORE: readonly { name: string; hex: string; fill: string; ink: string }[] = [
  { name: 'Linen', hex: '#f7f5f0', fill: P.linen, ink: C.text.primary },
  { name: 'Cloud', hex: '#fdfcfa', fill: P.cloud, ink: C.text.primary },
  { name: 'Graphite', hex: '#2e2d3a', fill: P.graphite, ink: P.cloud },
  { name: 'Violet', hex: '#5b4bdb', fill: P.violet500, ink: P.white },
  { name: 'Haze', hex: '#eeebfa', fill: P.violet100, ink: P.violet600 },
];

const VIOLETS = [
  P.violet50,
  P.violet100,
  P.violet200,
  P.violet300,
  P.violet400,
  P.violet500,
  P.violet600,
  P.violet700,
  P.violet800,
];

interface State {
  readonly look: Look;
  readonly titleA: KineticText;
  readonly subA: KineticText;
  readonly titleB: KineticText;
  readonly subB: KineticText;
}

function createState(measurer: TextMeasurer): State {
  const title = (id: string, text: string, x: number, y: number, at: number) =>
    kineticText({
      id,
      text,
      font: T.headline,
      measurer,
      x,
      y,
      maxWidth: 624,
      color: C.text.primary,
      accent: C.text.accent,
      at,
      ease: easing.enter,
    });
  const sub = (id: string, text: string, x: number, y: number, at: number) =>
    kineticText({
      id,
      text,
      font: T.subtextItalic,
      measurer,
      x,
      y,
      maxWidth: 624,
      color: C.text.secondary,
      marker: C.insight.marker,
      at,
      ease: easing.enter,
      blur: 6,
    });
  return {
    look: createLook(measurer),
    titleA: title('title-a', 'Soft *calm.*', 48, 128, 0.15),
    subA: sub('sub-a', 'One violet; _everything_ _else_ whispers.', 48, 206, 0.55),
    titleB: title(
      'title-b',
      'Pillowy and *quiet.*',
      ORIGIN_B.x + 48,
      ORIGIN_B.y + 128,
      T0.land - 0.2,
    ),
    subB: sub(
      'sub-b',
      'Hairlines, soft shadows, _filled_ _tints._',
      ORIGIN_B.x + 48,
      ORIGIN_B.y + 206,
      T0.land + 0.15,
    ),
  };
}

const eyebrow = (id: string, text: string, x: number, y: number, color: string = C.text.tertiary) =>
  textNode(id, { text, font: T.meta, fill: color, transform: { x, y } });

/** Group A: the eyebrow, title and subtext, then palette and type. */
function groupA(state: State, t: number): SceneNode[] {
  const nodes: SceneNode[] = [
    eyebrow('a-eyebrow', 'soft calm · cowork film', 48, 96, C.text.accent),
    state.titleA(t),
    state.subA(t),
  ];
  const fade = (at: number) => progress(t, at, 0.5, easing.enter);
  // Core colours: five pillowy tiles.
  const core: SceneNode[] = [eyebrow('a-core-cap', 'core', 48, 282)];
  CORE.forEach((c, k) => {
    const x = 48 + k * 126;
    core.push(
      shapeNode(`a-core${k}`, {
        geometry: rect(x + 57, 360, 114, 104, 20),
        fill: c.fill,
        stroke: { color: C.stroke.hairline, width: 1 },
        shadow: k === 1 ? elevationShadows(lighting, 'low') : [],
      }),
      textNode(`a-core${k}-n`, {
        text: c.name,
        font: T.label,
        fill: c.ink,
        transform: { x: x + 14, y: 320 },
      }),
      textNode(`a-core${k}-h`, {
        text: c.hex,
        font: T.meta,
        fill: c.ink,
        opacity: 0.8,
        transform: { x: x + 14, y: 384 },
      }),
    );
  });
  nodes.push(groupNode('a-core', core, { opacity: fade(0.8) }));
  // Natural tints: name in its own ink, meaning, ramp.
  nodes.push(eyebrow('a-tints-cap', 'natural tints · one meaning each', 48, 450));
  TINTS.forEach((row, k) => {
    const y = 486 + k * 76;
    const kids: SceneNode[] = [
      textNode(`a-r${k}-n`, {
        text: row.name,
        font: T.heading,
        fill: row.ink,
        transform: { x: 48, y },
      }),
      textNode(`a-r${k}-d`, {
        text: row.note,
        font: T.small,
        fill: C.text.tertiary,
        transform: { x: 48, y: y + 28 },
      }),
    ];
    row.ramp.forEach((c, i) => {
      kids.push(
        shapeNode(`a-r${k}-s${i}`, {
          geometry: rect(352 + i * 66, y + 24, 54, 54, 14),
          fill: c,
        }),
      );
    });
    nodes.push(
      groupNode(`a-r${k}`, kids, {
        opacity: fade(0.95 + k * 0.08),
        transform: { y: 8 * (1 - fade(0.95 + k * 0.08)) },
      }),
    );
  });
  // The violet scale.
  const vy = 806;
  nodes.push(
    groupNode(
      'a-violet',
      [
        eyebrow('a-v-cap', 'index violet · 50–800', 48, vy),
        ...VIOLETS.map((c, i) =>
          shapeNode(`a-v${i}`, { geometry: rect(48 + 33 + i * 70, vy + 62, 62, 46, 12), fill: c }),
        ),
      ],
      { opacity: fade(1.3) },
    ),
  );
  // Type: Sora titles, Newsreader subtext, Inter for UI, mono metadata.
  const ty = 926;
  nodes.push(
    groupNode(
      'a-type',
      [
        eyebrow('a-t-cap', 'type', 48, ty),
        textNode('a-t1', {
          text: 'Quietly indexed',
          font: face('display', 54),
          fill: C.text.primary,
          transform: { x: 48, y: ty + 26 },
        }),
        textNode('a-t1m', {
          text: 'sora 300 · titles',
          font: T.meta,
          fill: C.text.tertiary,
          transform: { x: 470, y: ty + 52 },
        }),
        textNode('a-t2', {
          text: 'answers from everything you know',
          font: face('subtext', 28, { style: 'italic' }),
          fill: C.text.secondary,
          transform: { x: 48, y: ty + 104 },
        }),
        textNode('a-t2m', {
          text: 'newsreader · subtext',
          font: T.meta,
          fill: C.text.tertiary,
          transform: { x: 470, y: ty + 116 },
        }),
        textNode('a-t3', {
          text: 'Every saved page is parsed and indexed.',
          font: T.body,
          fill: C.text.primary,
          transform: { x: 48, y: ty + 158 },
        }),
        textNode('a-t3m', {
          text: 'inter · ui and reading',
          font: T.meta,
          fill: C.text.tertiary,
          transform: { x: 470, y: ty + 164 },
        }),
        textNode('a-t4', {
          text: 'saved 2 days ago · 0.93',
          font: face('mono', 18),
          fill: C.button.softFg,
          transform: { x: 48, y: ty + 206 },
        }),
        textNode('a-t4m', {
          text: 'mono · metadata',
          font: T.meta,
          fill: C.text.tertiary,
          transform: { x: 470, y: ty + 210 },
        }),
      ],
      { opacity: fade(1.5) },
    ),
  );
  return nodes;
}

/** Group B: buttons, input, tags and status, a search result, people, time and the mark. */
function groupB(state: State, t: number): SceneNode[] {
  const o = ORIGIN_B;
  const { look: L } = state;
  const nodes: SceneNode[] = [
    eyebrow('b-eyebrow', 'components', o.x + 48, o.y + 96, C.text.accent),
    state.titleB(t),
    state.subB(t),
  ];
  const at = (k: number) => progress(t, T0.land + 0.3 + k * 0.12, 0.5, easing.enter);
  const reveal = (id: string, k: number, kids: SceneNode[]) =>
    groupNode(id, kids, { opacity: at(k), transform: { y: 10 * (1 - at(k)) } });
  // Buttons: the one key action solid, the rest haze, hairline and link.
  let bx = o.x + 48;
  const by = o.y + 326;
  const buttons: SceneNode[] = [eyebrow('b-btn-cap', 'buttons', o.x + 48, o.y + 272)];
  (
    [
      ['b-send', 'Send', { variant: 'primary', icon: 'send' }],
      ['b-edit', 'Edit plan', { variant: 'soft' }],
      ['b-contact', 'Contact us', { variant: 'secondary' }],
      ['b-more', 'Learn more', { variant: 'link' }],
    ] as const
  ).forEach(([id, text, opts]) => {
    const btn = L.button(id, text, bx, by, opts);
    buttons.push(btn.node);
    bx += btn.w + (opts.variant === 'secondary' ? 22 : 12);
  });
  nodes.push(reveal('b-buttons', 0, buttons));
  // An input in focus, mid-sentence.
  const typed = 'supplier delays this quarter';
  const n = Math.round(typed.length * progress(t, T0.land + 0.6, 1.4));
  nodes.push(
    reveal('b-inputs', 1, [
      eyebrow('b-in-cap', 'search your knowledge', o.x + 48, o.y + 384),
      L.input('b-search', o.x + 48, o.y + 438, 624, {
        text: typed.slice(0, n),
        placeholder: 'Ask anything…',
        icon: 'search',
        focus: 1,
        caret: true,
      }).node,
    ]),
  );
  // Tags and status.
  let tx = o.x + 48;
  const tags: SceneNode[] = [eyebrow('b-tag-cap', 'tags and status', o.x + 48, o.y + 506)];
  (
    [
      ['#retrieval', 'brand'],
      ['#research', 'knowledge'],
      ['#saved', 'outcome'],
      ['#reading-list', 'insight'],
      ['#notes', 'people'],
    ] as const
  ).forEach(([text, meaning], k) => {
    const c = L.chip(`b-tag${k}`, text, tx, o.y + 552, meaning, { font: T.small });
    tags.push(c.node);
    tx += c.w + 8;
  });
  tags.push(
    L.status('b-st0', 'Indexed', o.x + 48, o.y + 600, 'outcome'),
    L.status('b-st1', 'Researching', o.x + 196, o.y + 600, 'brand'),
    L.status('b-st2', 'No access', o.x + 376, o.y + 600, 'friction'),
  );
  nodes.push(reveal('b-tags', 2, tags));
  // A search result: the passage that answered highlighted in sand, a citation, a score.
  const card = L.resultCard('b-card', o.x + 48, o.y + 696, 624, {
    title: 'Supplier delays and promises',
    meta: 'reports · saved 2 days ago',
    before: 'Three suppliers caused ',
    passage: '71% of late deliveries this quarter',
    after: '; 14 customers were promised new dates.',
    cite: 1,
    tags: [
      ['#deliveries', 'knowledge'],
      ['#q3', 'insight'],
    ],
    score: '0.93',
    highlight: progress(t, T0.land + 1.0, 0.6, easing.wipe),
  });
  nodes.push(
    reveal('b-result', 3, [eyebrow('b-card-cap', 'search result', o.x + 48, o.y + 656), card.node]),
  );
  // People, time, and the mark.
  const py = o.y + 696 + card.h + 90;
  nodes.push(
    reveal('b-people', 4, [
      L.avatar('b-av1', 'SR', o.x + 76, py, 26, C.avatar.rep),
      L.avatar('b-av2', 'CO', o.x + 124, py, 26, C.avatar.coo),
      L.avatar('b-av3', 'HR', o.x + 172, py, 26, C.avatar.intern),
      timeRing(
        'b-ring',
        o.x + 340,
        py,
        56,
        progress(t, T0.land, 1.6, easing.enter) * 0.78,
        '18:40',
      ),
      markTile('b-mark', o.x + 560, py, 112, { glow: 0.5 }),
    ]),
  );
  return nodes;
}

/** Two paper fragments near the lens, seen only as the camera passes them. */
function foreground(): SceneNode[] {
  return [
    paperCard('fg-a', 1250, 860, 320, 210, {
      lift: 2,
      rotation: -8,
      blur: 18,
      opacity: 0.9,
      children: [textLines('fg-a-l', -120, -40, [220, 170, 200])],
    }),
    paperCard('fg-b', 1500, 1240, 260, 180, { lift: 2, rotation: 10, blur: 22, opacity: 0.85 }),
  ];
}

function world(t: number, state: State): SceneNode[] {
  const v = view(t);
  const blur = motionBlur(screenVelocity(view, t));
  return [
    shapeNode('base', { geometry: rect(W / 2, H / 2, W, H), fill: C.bg.canvas }),
    groupNode('far', [light(t)], { transform: viewTransform(v, FRAME, 0.35, A) }),
    groupNode(
      'moving',
      [
        groupNode('board-grid', [grid], { transform: viewTransform(v, FRAME) }),
        edgeFade('fade', FRAME, C.bg.canvas, 0.3),
        groupNode('board', [...groupA(state, t), ...groupB(state, t)], {
          transform: viewTransform(v, FRAME),
        }),
      ],
      blur ? { blur } : {},
    ),
    groupNode('near', foreground(), { transform: viewTransform(v, FRAME, 1.4, A) }),
  ];
}

/** Air through the flight, a pluck as each headline arrives, a soft bell on landing. */
const audio = soundtrack([
  cue(0.15, pluck({ degree: 4, octave: 1, gain: 0.35 })),
  cue(T0.flight, whoosh(T0.land - T0.flight, { from: 300, to: 1600, peak: 0.5, gain: 0.5 })),
  cue(T0.land - 0.2, pluck({ degree: 7, octave: 1, gain: 0.35 })),
  cue(T0.land + 0.1, bell({ degree: 4, gain: 0.3 })),
]);

export default defineSceneComposition({
  ...phoneDefaults,
  fonts: [...phoneDefaults.fonts, ...LOOK_FONTS],
  id: 'cowork-style',
  seed: 'cowork-style',
  audio,
  title: 'The Cowork look',
  duration: T0.duration,
  background: C.bg.canvas,
  renderer: 'svg',
  setup: () => createState(createCanvasMeasurer()),
  scene: (t, _ctx, state) => ({ world: world(t, state) }),
});
