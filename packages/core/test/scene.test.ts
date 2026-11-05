import { describe, expect, it } from 'vitest';
import {
  applyMatrix,
  cameraMatrix,
  defaultCamera,
  flattenScene,
  groupNode,
  lerpCamera,
  rect,
  screenToWorld,
  shapeNode,
  textNode,
  transformMatrix,
  worldToScreen,
  type Scene,
} from '../src/index.js';

const W = 1920;
const H = 1080;
const box = (id: string, props: Partial<Parameters<typeof shapeNode>[1]> = {}) =>
  shapeNode(id, { geometry: rect(0, 0, 10, 10), ...props });
const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 9);
  expect(p.y).toBeCloseTo(y, 9);
};

describe('transformMatrix', () => {
  it('rotates and scales about the origin, then translates', () => {
    const m = transformMatrix({ x: 100, y: 50, rotation: 90, scale: 2, originX: 10, originY: 0 });
    close(applyMatrix(m, { x: 10, y: 0 }), 100, 50); // the pivot lands on (x, y)
    close(applyMatrix(m, { x: 11, y: 0 }), 100, 52); // +1 x → rotated 90° and doubled
  });
});

describe('camera', () => {
  it('shows the world unchanged with the default camera', () => {
    expect(cameraMatrix(defaultCamera(W, H), W, H)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('puts the camera target at the frame centre, zoomed and rotated', () => {
    const camera = { x: 500, y: 300, zoom: 2, rotation: 90 };
    close(worldToScreen(camera, W, H, { x: 500, y: 300 }), W / 2, H / 2);
    // One world unit to the right appears 2 px *up* (world rotated by -90°).
    close(worldToScreen(camera, W, H, { x: 501, y: 300 }), W / 2, H / 2 - 2);
    close(screenToWorld(camera, W, H, { x: W / 2, y: H / 2 - 2 }), 501, 300);
  });

  it('interpolates zoom geometrically', () => {
    const a = { x: 0, y: 0, zoom: 1, rotation: 0 };
    const b = { x: 100, y: 0, zoom: 4, rotation: 30 };
    expect(lerpCamera(a, b, 0.5)).toEqual({ x: 50, y: 0, zoom: 2, rotation: 15 });
    expect(lerpCamera(a, b, 0)).toBe(a);
    expect(lerpCamera(a, b, 1)).toBe(b);
  });

  it('rejects a zero zoom', () => {
    expect(() => cameraMatrix({ x: 0, y: 0, zoom: 0, rotation: 0 }, W, H)).toThrow(RangeError);
  });
});

describe('flattenScene', () => {
  const camera = { x: W / 2 + 100, y: H / 2, zoom: 2, rotation: 0 };

  it('applies the camera to world nodes only; screen nodes stay pinned', () => {
    const scene: Scene = {
      width: W,
      height: H,
      camera,
      world: [box('w', { transform: { x: W / 2 + 100, y: H / 2 } })],
      screen: [box('s', { transform: { x: 40, y: 40 } })],
    };
    const [world, screen] = flattenScene(scene);
    expect(world?.layer).toBe('world');
    close(applyMatrix(world!.matrix, { x: 0, y: 0 }), W / 2, H / 2);
    close(applyMatrix(world!.matrix, { x: 1, y: 0 }), W / 2 + 2, H / 2);
    expect(screen?.layer).toBe('screen');
    expect(screen?.matrix).toEqual([1, 0, 0, 1, 40, 40]);
  });

  it('paints by z among siblings, ties in tree order, screen layer last', () => {
    const scene: Scene = {
      width: W,
      height: H,
      world: [box('a', { z: 2 }), box('b'), box('c', { z: -1 }), box('d')],
      screen: [box('top', { z: -100 })],
    };
    expect(flattenScene(scene).map((i) => i.node.id)).toEqual(['c', 'b', 'd', 'a', 'top']);
  });

  it('multiplies opacity, composes transforms and collects clips down the tree', () => {
    const clip = rect(0, 0, 50, 50);
    const scene: Scene = {
      width: W,
      height: H,
      world: [
        groupNode(
          'outer',
          [
            groupNode('inner', [box('leaf', { opacity: 0.5 })], {
              opacity: 0.5,
              transform: { x: 5 },
            }),
          ],
          { transform: { x: 10, y: 20 }, clip },
        ),
      ],
    };
    const [leaf] = flattenScene(scene);
    expect(leaf?.opacity).toBe(0.25); // 1 (outer) × 0.5 (inner) × 0.5 (leaf)
    expect(leaf?.matrix).toEqual([1, 0, 0, 1, 15, 20]);
    expect(leaf?.clips).toEqual([{ geometry: clip, matrix: [1, 0, 0, 1, 10, 20] }]);
  });

  it('skips invisible and fully transparent subtrees', () => {
    const scene: Scene = {
      width: W,
      height: H,
      world: [
        box('hidden', { visible: false }),
        groupNode('ghost', [box('child')], { opacity: 0 }),
        textNode('label', { text: 'Hi', font: { family: 'sans-serif', size: 20 } }),
      ],
    };
    expect(flattenScene(scene).map((i) => i.node.id)).toEqual(['label']);
  });

  it('rejects duplicate ids', () => {
    expect(() => flattenScene({ width: W, height: H, world: [box('x'), box('x')] })).toThrow(
      /duplicate node id/,
    );
  });
});
