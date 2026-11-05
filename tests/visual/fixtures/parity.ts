/**
 * Test fixture: one scene that exercises every renderer feature, drawn by the
 * Canvas, SVG and DOM renderers side by side.
 */
import {
  circle,
  defaultTheme,
  groupNode,
  pathGeometry,
  pill,
  rect,
  registerFontFaces,
  loadFonts,
  shapeNode,
  textNode,
  type Composition,
  type Scene,
} from '../../../packages/core/src/index.js';
import {
  createRenderer,
  mountStage,
  type RendererKind,
} from '../../../packages/renderers/src/index.js';
import { fontFaces } from '../../../examples/fonts.js';

const { colors } = defaultTheme;
export const W = 800;
export const H = 500;
const display = { ...defaultTheme.type.display, size: 44, letterSpacing: -1 };
const body = { ...defaultTheme.type.body, size: 20 };

export function scene(): Scene {
  return {
    width: W,
    height: H,
    camera: { x: W / 2 + 10, y: H / 2, zoom: 1.05, rotation: 2 },
    world: [
      shapeNode('plain', { geometry: rect(90, 80, 120, 80), fill: colors.blue }),
      shapeNode('rounded', {
        geometry: rect(250, 80, 120, 80, 20),
        fill: colors.pink,
        stroke: { color: colors.paper, width: 6 },
      }),
      shapeNode('circle', { geometry: circle(400, 80, 45), fill: colors.lime }),
      shapeNode('pill', { geometry: pill(560, 80, 180, 60), fill: colors.orange, opacity: 0.6 }),
      shapeNode('star', {
        geometry: pathGeometry(
          'M0 -50 L12 -16 L48 -15 L19 7 L29 40 L0 20 L-29 40 L-19 7 L-48 -15 L-12 -16 Z',
        ),
        fill: colors.violet,
        transform: { x: 720, y: 90, rotation: 15, scale: 1.1 },
      }),
      shapeNode('dashed', {
        geometry: pathGeometry('M40 230 C140 160 240 300 340 230'),
        stroke: { color: colors.lime, width: 5, dash: [16, 10], dashOffset: 4, cap: 'round' },
      }),
      shapeNode('hard-shadow', {
        geometry: rect(470, 230, 120, 80, 12),
        fill: colors.lime,
        shadow: { x: 10, y: 10, color: colors.paper },
      }),
      shapeNode('soft-shadow', {
        geometry: rect(650, 230, 120, 80, 12),
        fill: colors.blue,
        shadow: { x: 0, y: 8, blur: 16, color: colors.pink },
      }),
      groupNode(
        'clipped',
        [
          shapeNode('clipped-bar', { geometry: rect(0, 0, 200, 40), fill: colors.orange }),
          textNode('clipped-text', {
            text: 'clip',
            font: body,
            fill: colors.ink,
            align: 'center',
            transform: { y: -12 },
          }),
        ],
        { clip: circle(0, 0, 55), transform: { x: 150, y: 380, rotation: -10 } },
      ),
      textNode('title', {
        text: 'Same scene,\nthree renderers',
        font: display,
        fill: colors.paper,
        align: 'center',
        transform: { x: 520, y: 340 },
      }),
    ],
    screen: [
      textNode('pinned', {
        text: 'screen layer',
        font: body,
        fill: colors.muted,
        transform: { x: 16, y: 466 },
      }),
    ],
  };
}

export async function mountAll(): Promise<void> {
  await registerFontFaces(fontFaces);
  await loadFonts([display, body]);
  document.body.style.margin = '0';
  (['canvas', 'svg', 'dom'] as RendererKind[]).forEach((kind, i) => {
    const host = document.createElement('div');
    host.id = `host-${kind}`;
    Object.assign(host.style, {
      position: 'absolute',
      left: '0',
      top: `${i * H}px`,
      width: `${W}px`,
      height: `${H}px`,
      background: colors.ink,
      overflow: 'hidden',
    });
    document.body.append(host);
    createRenderer(kind, host, { width: W, height: H, background: colors.ink }).render(scene());
  });
}

/** Mounts a composition that tries to animate on the browser's clock. */
export async function mountClockDriven(): Promise<{ transform: string; animations: number }> {
  const composition: Composition = {
    id: 'clock-driven',
    width: 200,
    height: 100,
    fps: 30,
    duration: 2,
    background: colors.ink,
    setup({ root }) {
      const box = document.createElement('div');
      box.id = 'box';
      box.style.cssText = 'width:20px;height:20px;background:red;transition:transform 2s linear';
      root.append(box);
    },
    render(t, { root }) {
      const box = root.querySelector<HTMLElement>('#box');
      if (!box) return;
      box.style.transform = `translateX(${t * 100}px)`;
      box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 5000 });
    },
  };
  const host = document.createElement('div');
  document.body.append(host);
  const stage = await mountStage(host, composition);
  stage.render(0);
  stage.render(1);
  const box = stage.element.querySelector<HTMLElement>('#box');
  return {
    transform: box ? getComputedStyle(box).transform : '',
    animations: stage.element.getAnimations({ subtree: true }).length,
  };
}
