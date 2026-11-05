import { DEG_TO_RAD, lerp } from '../math.js';
import type { Point } from '../tween.js';
import { cross3, dot3, lerp3, normalize3, sub3, vec3, type Vec3 } from './vec.js';

/** A perspective camera that looks from `position` at `target`. */
export interface Camera3D {
  readonly position: Vec3;
  readonly target: Vec3;
  /** Vertical field of view, degrees. Default 50. */
  readonly fov?: number;
  /** Roll about the viewing axis, degrees. Default 0. */
  readonly roll?: number;
  /** Nearest distance that is drawn; geometry closer is clipped. Default 1. */
  readonly near?: number;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** Camera orientation: right, up and forward unit vectors. */
export interface CameraBasis {
  readonly position: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
  /** Focal length in px for the viewport height. */
  readonly focal: number;
  readonly near: number;
  readonly center: Point;
}

const WORLD_UP = vec3(0, 1, 0);

export function cameraBasis(camera: Camera3D, viewport: Viewport): CameraBasis {
  const forward = normalize3(sub3(camera.target, camera.position));
  // Looking straight up or down: fall back to z as the up reference.
  const reference = Math.abs(dot3(forward, WORLD_UP)) > 0.999 ? vec3(0, 0, -1) : WORLD_UP;
  let right = normalize3(cross3(forward, reference));
  let up = cross3(right, forward);
  const roll = (camera.roll ?? 0) * DEG_TO_RAD;
  if (roll !== 0) {
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    [right, up] = [
      vec3(right.x * c + up.x * s, right.y * c + up.y * s, right.z * c + up.z * s),
      vec3(up.x * c - right.x * s, up.y * c - right.y * s, up.z * c - right.z * s),
    ];
  }
  const fov = (camera.fov ?? 50) * DEG_TO_RAD;
  return {
    position: camera.position,
    right,
    up,
    forward,
    focal: viewport.height / 2 / Math.tan(fov / 2),
    near: camera.near ?? 1,
    center: { x: viewport.width / 2, y: viewport.height / 2 },
  };
}

/** World point → camera space: x right, y up, z = distance in front. */
export function toCameraSpace(basis: CameraBasis, p: Vec3): Vec3 {
  const d = sub3(p, basis.position);
  return vec3(dot3(d, basis.right), dot3(d, basis.up), dot3(d, basis.forward));
}

/** Camera-space point (in front of the camera) → screen px (y down). */
export function projectCameraPoint(basis: CameraBasis, c: Vec3): Point {
  return {
    x: basis.center.x + (basis.focal * c.x) / c.z,
    y: basis.center.y - (basis.focal * c.y) / c.z,
  };
}

/** World point → screen px, or `null` if it is behind the near plane. */
export function projectPoint(basis: CameraBasis, p: Vec3): Point | null {
  const c = toCameraSpace(basis, p);
  return c.z < basis.near ? null : projectCameraPoint(basis, c);
}

/**
 * Clips a camera-space polygon to the near plane (z ≥ near), so geometry
 * passing the camera is cut cleanly instead of projecting inside out.
 */
export function clipNear(polygon: readonly Vec3[], near: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i] as Vec3;
    const b = polygon[(i + 1) % polygon.length] as Vec3;
    const aIn = a.z >= near;
    const bIn = b.z >= near;
    if (aIn) out.push(a);
    if (aIn !== bIn) out.push(lerp3(a, b, (near - a.z) / (b.z - a.z)));
  }
  return out;
}

export interface OrbitOptions {
  readonly target: Vec3;
  /** Distance from the target. Smaller = zoomed in. */
  readonly distance: number;
  /** Angle around the vertical axis, degrees (0 = looking down -z). */
  readonly azimuth: number;
  /** Angle above the horizon, degrees. */
  readonly elevation: number;
  readonly fov?: number;
  readonly roll?: number;
}

/** A camera on a sphere around `target`. */
export function orbitCamera(options: OrbitOptions): Camera3D {
  const az = options.azimuth * DEG_TO_RAD;
  const el = options.elevation * DEG_TO_RAD;
  const { target, distance } = options;
  return {
    position: vec3(
      target.x + distance * Math.cos(el) * Math.sin(az),
      target.y + distance * Math.sin(el),
      target.z + distance * Math.cos(el) * Math.cos(az),
    ),
    target,
    ...(options.fov === undefined ? {} : { fov: options.fov }),
    ...(options.roll === undefined ? {} : { roll: options.roll }),
  };
}

/** Interpolates orbit settings; distance moves geometrically (a steady zoom). */
export function lerpOrbit(a: OrbitOptions, b: OrbitOptions, p: number): OrbitOptions {
  if (p <= 0) return a;
  if (p >= 1) return b;
  return {
    target: lerp3(a.target, b.target, p),
    distance: Math.exp(lerp(Math.log(a.distance), Math.log(b.distance), p)),
    azimuth: lerp(a.azimuth, b.azimuth, p),
    elevation: lerp(a.elevation, b.elevation, p),
    fov: lerp(a.fov ?? 50, b.fov ?? 50, p),
    roll: lerp(a.roll ?? 0, b.roll ?? 0, p),
  };
}
