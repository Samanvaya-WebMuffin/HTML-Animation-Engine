import type { Geometry } from '../geometry/shape.js';
import type { FontSpec } from '../text/font.js';

/**
 * Local transform, applied as translate(x, y) · rotate · scale ·
 * translate(-originX, -originY). Rotation is in degrees.
 */
export interface Transform {
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly rotation?: number;
  /** Pivot for rotation and scale, in local px. */
  readonly originX?: number;
  readonly originY?: number;
}

export interface Stroke {
  readonly color: string;
  readonly width: number;
  readonly dash?: readonly number[];
  readonly dashOffset?: number;
  readonly cap?: 'butt' | 'round' | 'square';
  readonly join?: 'miter' | 'round' | 'bevel';
}

/** Drop shadow; with `blur` 0 it is a hard offset shadow. */
export interface Shadow {
  readonly x: number;
  readonly y: number;
  readonly blur?: number;
  readonly color: string;
}

interface NodeBase {
  /** Unique within the scene; renderers use it to reuse elements between frames. */
  readonly id: string;
  readonly transform?: Transform;
  /** Multiplied down the tree. Default 1. */
  readonly opacity?: number;
  /** Paint order among siblings (higher paints later). Default 0; ties keep tree order. */
  readonly z?: number;
  /** Clips this node and its children, in this node's local coordinates. */
  readonly clip?: Geometry;
  readonly visible?: boolean;
}

export interface GroupNode extends NodeBase {
  readonly type: 'group';
  readonly children: readonly SceneNode[];
}

export interface ShapeNode extends NodeBase {
  readonly type: 'shape';
  readonly geometry: Geometry;
  readonly fill?: string;
  readonly stroke?: Stroke;
  readonly shadow?: Shadow;
}

/**
 * Text laid out from the local origin: `y = 0` is the top of the first line;
 * `x = 0` is the left edge, centre or right edge depending on `align`.
 */
export interface TextNode extends NodeBase {
  readonly type: 'text';
  readonly text: string;
  readonly font: FontSpec;
  readonly fill?: string;
  readonly align?: 'left' | 'center' | 'right';
  /** Wrap width in px. Default: no wrapping. */
  readonly maxWidth?: number;
}

export type SceneNode = GroupNode | ShapeNode | TextNode;

/** 2D camera. (`x`, `y`) is the world point shown at the centre of the frame. */
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  /** Degrees. The world appears rotated by `-rotation`. */
  readonly rotation: number;
}

/**
 * One frame's content. `world` nodes are seen through the camera; `screen`
 * nodes are pinned to the frame (titles, lower thirds) and always paint on top.
 */
export interface Scene {
  readonly width: number;
  readonly height: number;
  readonly camera?: Camera;
  readonly world: readonly SceneNode[];
  readonly screen?: readonly SceneNode[];
}

type Props<T> = Omit<T, 'id' | 'type'>;

export function groupNode(
  id: string,
  children: readonly SceneNode[],
  props: Omit<Props<GroupNode>, 'children'> = {},
): GroupNode {
  return { id, type: 'group', children, ...props };
}

export function shapeNode(id: string, props: Props<ShapeNode>): ShapeNode {
  return { id, type: 'shape', ...props };
}

export function textNode(id: string, props: Props<TextNode>): TextNode {
  return { id, type: 'text', ...props };
}
