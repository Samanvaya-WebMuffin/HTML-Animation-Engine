import type { Geometry } from '../geometry/shape.js';
import {
  compose,
  IDENTITY,
  multiply,
  rotate,
  scale,
  translate,
  type Matrix,
} from '../geometry/matrix.js';
import { cameraMatrix } from './camera.js';
import type { Scene, SceneNode, ShapeNode, TextNode, Transform } from './nodes.js';

export interface ClipRegion {
  readonly geometry: Geometry;
  /** Local → screen matrix for the clip geometry. */
  readonly matrix: Matrix;
}

/** A leaf node ready to paint, in final paint order. */
export interface DrawItem {
  readonly node: ShapeNode | TextNode;
  readonly layer: 'world' | 'screen';
  /** Local → screen matrix (camera included for the world layer). */
  readonly matrix: Matrix;
  /** Product of the opacities of the node and all its ancestors. */
  readonly opacity: number;
  /** Clips from ancestors (outermost first) and the node itself. */
  readonly clips: readonly ClipRegion[];
}

export function transformMatrix(t: Transform | undefined): Matrix {
  if (!t) return IDENTITY;
  const sx = (t.scaleX ?? 1) * (t.scale ?? 1);
  const sy = (t.scaleY ?? 1) * (t.scale ?? 1);
  return compose(
    translate(t.x ?? 0, t.y ?? 0),
    rotate(t.rotation ?? 0),
    scale(sx, sy),
    translate(-(t.originX ?? 0), -(t.originY ?? 0)),
  );
}

/** Siblings in paint order: by `z`, ties in tree order. */
function paintOrder(nodes: readonly SceneNode[]): SceneNode[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => (a.node.z ?? 0) - (b.node.z ?? 0) || a.index - b.index)
    .map(({ node }) => node);
}

/**
 * Flattens a scene into leaf draw items in paint order: the world layer
 * through the camera, then the screen layer. Invisible and fully
 * transparent subtrees are skipped. Throws on duplicate ids.
 */
export function flattenScene(scene: Scene): DrawItem[] {
  const items: DrawItem[] = [];
  const seen = new Set<string>();

  const visit = (
    node: SceneNode,
    layer: DrawItem['layer'],
    parent: Matrix,
    parentOpacity: number,
    parentClips: readonly ClipRegion[],
  ) => {
    if (seen.has(node.id)) throw new Error(`scene: duplicate node id "${node.id}".`);
    seen.add(node.id);
    const opacity = parentOpacity * (node.opacity ?? 1);
    if (node.visible === false || opacity <= 0) return;
    const matrix = multiply(parent, transformMatrix(node.transform));
    const clips = node.clip ? [...parentClips, { geometry: node.clip, matrix }] : parentClips;
    if (node.type === 'group') {
      for (const child of paintOrder(node.children)) visit(child, layer, matrix, opacity, clips);
    } else {
      items.push({ node, layer, matrix, opacity, clips });
    }
  };

  const camera = scene.camera ? cameraMatrix(scene.camera, scene.width, scene.height) : IDENTITY;
  for (const node of paintOrder(scene.world)) visit(node, 'world', camera, 1, []);
  for (const node of paintOrder(scene.screen ?? [])) visit(node, 'screen', IDENTITY, 1, []);
  return items;
}
