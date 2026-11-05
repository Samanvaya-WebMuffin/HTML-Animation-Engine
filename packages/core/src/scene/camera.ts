import {
  applyMatrix,
  compose,
  invert,
  rotate,
  scale,
  translate,
  type Matrix,
} from '../geometry/matrix.js';
import { lerp } from '../math.js';
import type { Point } from '../tween.js';
import type { Camera } from './nodes.js';

/** The camera that shows the world unchanged in a `width` × `height` frame. */
export function defaultCamera(width: number, height: number): Camera {
  return { x: width / 2, y: height / 2, zoom: 1, rotation: 0 };
}

/** World → screen matrix for `camera` in a `width` × `height` frame. */
export function cameraMatrix(camera: Camera, width: number, height: number): Matrix {
  if (!(camera.zoom > 0)) throw new RangeError(`camera: zoom must be > 0, got ${camera.zoom}.`);
  return compose(
    translate(width / 2, height / 2),
    rotate(-camera.rotation),
    scale(camera.zoom),
    translate(-camera.x, -camera.y),
  );
}

export function worldToScreen(camera: Camera, width: number, height: number, point: Point): Point {
  return applyMatrix(cameraMatrix(camera, width, height), point);
}

export function screenToWorld(camera: Camera, width: number, height: number, point: Point): Point {
  return applyMatrix(invert(cameraMatrix(camera, width, height)), point);
}

/**
 * Interpolates cameras. Zoom moves geometrically (in log space), so a push
 * from 1× to 4× feels as steady as a pull from 4× to 1×.
 */
export function lerpCamera(a: Camera, b: Camera, p: number): Camera {
  if (p <= 0) return a;
  if (p >= 1) return b;
  return {
    x: lerp(a.x, b.x, p),
    y: lerp(a.y, b.y, p),
    zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), p)),
    rotation: lerp(a.rotation, b.rotation, p),
  };
}
