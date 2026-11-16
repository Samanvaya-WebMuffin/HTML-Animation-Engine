import type { Geometry } from '../geometry/shape.js';
import type { FontSpec } from '../text/font.js';

/**
 * Local transform, applied as translate(x, y) · rotate · skew · scale ·
 * translate(-originX, -originY). Rotation and skew are in degrees.
 */
export interface Transform {
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly rotation?: number;
  /** Skew in degrees, applied after rotation and before scale (a slight 2.5D lean). */
  readonly skewX?: number;
  readonly skewY?: number;
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

/** Drop shadow; with `blur` 0 it is a hard offset shadow. With `x = y = 0` and a blur it is a glow. */
export interface Shadow {
  readonly x: number;
  readonly y: number;
  readonly blur?: number;
  readonly color: string;
}

/**
 * A Gaussian blur of everything a node (and its subtree) paints, as one
 * layer. A number blurs evenly; `{ x, y }` blurs more along one axis (motion
 * blur), and `angle` (degrees, clockwise) turns those axes on screen. Like
 * shadows, σ = value / 2, in the node's own units (it scales with the node).
 */
export type Blur = number | { readonly x: number; readonly y: number; readonly angle?: number };

/** One or more shadows, painted in order beneath the node (first is lowest). */
export type Shadows = Shadow | readonly Shadow[];

export interface GradientStop {
  /** 0–1 along the gradient. */
  readonly offset: number;
  readonly color: string;
}

/** Linear gradient from (x1, y1) to (x2, y2), in the node's local px. */
export interface LinearGradient {
  readonly type: 'linear';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly stops: readonly GradientStop[];
}

/**
 * Circular radial gradient centred on (cx, cy) with radius `r`, in the node's
 * local px. Scale the node (or a parent group) for an elliptical one.
 */
export interface RadialGradient {
  readonly type: 'radial';
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly stops: readonly GradientStop[];
}

export type Gradient = LinearGradient | RadialGradient;

/** A solid CSS colour or a gradient. */
export type Paint = string | Gradient;

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
  /** Blurs this node and its children as one layer (focus pulls, depth of field, motion blur). */
  readonly blur?: Blur;
  readonly visible?: boolean;
}

export interface GroupNode extends NodeBase {
  readonly type: 'group';
  readonly children: readonly SceneNode[];
}

export interface ShapeNode extends NodeBase {
  readonly type: 'shape';
  readonly geometry: Geometry;
  readonly fill?: Paint;
  readonly stroke?: Stroke;
  /** Drawn only when the shape has a fill. */
  readonly shadow?: Shadows;
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
  /** Shadows or glows beneath the text, in the text's own shape. */
  readonly shadow?: Shadows;
  readonly align?: 'left' | 'center' | 'right';
  /** Wrap width in px. Default: no wrapping. */
  readonly maxWidth?: number;
}

/**
 * A bitmap drawn centred on the local origin, `width` × `height` px. Its
 * `src` must be loaded first with `preloadImages` (renderers draw it
 * synchronously, so a frame never waits for a decode).
 */
export interface ImageNode extends NodeBase {
  readonly type: 'image';
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

export type SceneNode = GroupNode | ShapeNode | TextNode | ImageNode;

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

export function imageNode(id: string, props: Props<ImageNode>): ImageNode {
  return { id, type: 'image', ...props };
}

/** A blur as standard deviations along two axes turned by `angle` degrees. */
export function blurAxes(blur: Blur | undefined): { x: number; y: number; angle: number } {
  if (blur === undefined) return { x: 0, y: 0, angle: 0 };
  if (typeof blur === 'number') return { x: blur / 2, y: blur / 2, angle: 0 };
  return { x: blur.x / 2, y: blur.y / 2, angle: blur.angle ?? 0 };
}

/** A node's shadows as a list (empty when it has none). */
export function shadowList(shadow: Shadows | undefined): readonly Shadow[] {
  if (!shadow) return [];
  return isShadowArray(shadow) ? shadow : [shadow];
}

function isShadowArray(shadow: Shadows): shadow is readonly Shadow[] {
  return Array.isArray(shadow);
}

/** Linear gradient helper. */
export function linearGradient(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stops: readonly GradientStop[] | readonly string[],
): LinearGradient {
  return { type: 'linear', x1, y1, x2, y2, stops: toStops(stops) };
}

/** Radial gradient helper. */
export function radialGradient(
  cx: number,
  cy: number,
  r: number,
  stops: readonly GradientStop[] | readonly string[],
): RadialGradient {
  return { type: 'radial', cx, cy, r, stops: toStops(stops) };
}

function toStops(stops: readonly GradientStop[] | readonly string[]): readonly GradientStop[] {
  return stops.map((stop, i) =>
    typeof stop === 'string'
      ? { offset: stops.length > 1 ? i / (stops.length - 1) : 0, color: stop }
      : stop,
  );
}
