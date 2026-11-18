import { createCanvasMeasurer, defineComposition } from '@html-animation-engine/core';
import { createRenderer, type Renderer } from '@html-animation-engine/renderers';
import {
  FILM_FONTS,
  FILM_SCENES,
  createFilmState,
  filmWorld,
  sceneCues,
  type FilmState,
} from '../cowork-film.js';
import { C } from '../cowork-look.js';
import {
  WALL_FONTS,
  createWall,
  createWallText,
  drawWall,
  wallOverlay,
  type Wall,
  type WallText,
} from '../cowork-wall.js';
import { phoneDefaults } from '../index.js';
import { soundtrack } from '../sounds.js';

const { start, end, title } = FILM_SCENES.pain;
const W = phoneDefaults.width;
const H = phoneDefaults.height;

interface Mounted {
  readonly film: Renderer;
  readonly state: FilmState;
  readonly canvas: HTMLCanvasElement;
  readonly wall: Wall;
  readonly text: WallText;
  readonly top: Renderer;
}
const mounted = new WeakMap<HTMLElement, Mounted>();

/**
 * Scene 1 of the Cowork film, the pain point: a window of the film's
 * timeline (the pinboard and its camera, drawn by `filmWorld`) with the
 * opening's paper wall over it (`cowork-wall.ts`). Layers, bottom to top:
 * the board (SVG), the wall and its paper in flight (one canvas, drawn
 * from pictures made at setup), and the opening line and the piles the
 * paper sorts into (SVG). Once the wall has gone the board's group draws
 * the piles itself, so the last frame is the next scene's first.
 */
export default defineComposition({
  ...phoneDefaults,
  fonts: [...FILM_FONTS, ...WALL_FONTS],
  id: 'cowork-pain',
  seed: 'cowork-pain',
  title,
  audio: soundtrack(sceneCues('pain')),
  duration: end - start,
  background: C.bg.canvas,
  async setup(ctx) {
    const size = { width: W, height: H, pixelRatio: ctx.pixelRatio };
    const film = createRenderer('svg', ctx.root, { ...size, background: C.bg.canvas });
    const state = await createFilmState();
    const doc = ctx.root.ownerDocument;
    const canvas = doc.createElement('canvas');
    canvas.width = Math.round(W * ctx.pixelRatio);
    canvas.height = Math.round(H * ctx.pixelRatio);
    Object.assign(canvas.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${W}px`,
      height: `${H}px`,
    });
    ctx.root.append(canvas);
    const top = createRenderer('svg', ctx.root, size);
    const text = createWallText(createCanvasMeasurer());
    const wall = createWall(doc, state.board.paper, ctx.pixelRatio, text);
    mounted.set(ctx.root, { film, state, canvas, wall, text, top });
  },
  render(t, ctx) {
    const m = mounted.get(ctx.root);
    if (!m) throw new Error('cowork-pain rendered before setup.');
    const at = start + t;
    m.film.render({ width: W, height: H, world: filmWorld(m.state, at) });
    const g = m.canvas.getContext('2d');
    if (g) drawWall(g, m.wall, m.text, at);
    m.top.render({ width: W, height: H, world: wallOverlay(m.text, m.state.board.paper, at) });
  },
  teardown(ctx) {
    const m = mounted.get(ctx.root);
    m?.film.destroy();
    m?.top.destroy();
    m?.canvas.remove();
    mounted.delete(ctx.root);
  },
});
