import {
  box,
  cameraBasis,
  createNoise,
  createRng,
  curlVertex,
  cylinder,
  DEG_TO_RAD,
  dot3,
  groupNode,
  keyframes,
  lerp,
  lerpOrbit,
  mod,
  normalize3,
  orbitCamera,
  pathGeometry,
  polygonPath,
  projectPoint,
  projectSpace,
  pyramid,
  random,
  rect,
  shapeNode,
  signedArea,
  sphere,
  sub3,
  toCameraSpace,
  vec3,
  type Camera3D,
  type Ease,
  type Face,
  type Fog3D,
  type GroupNode,
  type Light3D,
  type Mesh,
  type Object3D,
  type OrbitOptions,
  type Point,
  type Vec3,
  type Viewport,
} from '@html-animation-engine/core';

/** Euler rotation in degrees. */
export interface Rotation3D {
  readonly rotateX: number;
  readonly rotateY: number;
  readonly rotateZ: number;
}

export interface Slab3DOptions {
  readonly id: string;
  readonly viewport: Viewport;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly face: string;
  readonly back: string;
  readonly edge: string;
  /** A raised panel on the front face. */
  readonly plate?: { readonly color: string; readonly inset: number };
  /** Rotation keyframes (each key's ease shapes the move that arrives at it). */
  readonly rotation: readonly { at: number; value: Rotation3D; ease?: Ease }[];
  /** Orbit-camera keyframes; distance changes are the zoom ins and outs. */
  readonly camera: readonly { at: number; value: OrbitOptions; ease?: Ease }[];
  readonly light?: Light3D;
}

const lerpRotation = (a: Rotation3D, b: Rotation3D, p: number): Rotation3D => ({
  rotateX: lerp(a.rotateX, b.rotateX, p),
  rotateY: lerp(a.rotateY, b.rotateY, p),
  rotateZ: lerp(a.rotateZ, b.rotateZ, p),
});

/** A slab (thick card) that turns on keyframes while the camera zooms in and out. */
export function slab3d(options: Slab3DOptions): (t: number) => GroupNode {
  const { width, height, depth } = options;
  const body = box(width, height, depth, {
    front: options.face,
    back: options.back,
    left: options.edge,
    right: options.edge,
    top: options.edge,
    bottom: options.edge,
  });
  const plate = options.plate
    ? box(width - 2 * options.plate.inset, height - 2 * options.plate.inset, 4, options.plate.color)
    : undefined;
  const rotation = keyframes(options.rotation, lerpRotation);
  const camera = keyframes(options.camera, lerpOrbit);
  return (t) => {
    const r = rotation(t);
    // The plate sits on the front face, so it shares the slab's rotation.
    const lift = depth / 2 + 2;
    const plateOffset = rotateOffset(vec3(0, 0, lift), r);
    const view = orbitCamera(camera(t));
    const objects: Object3D[] = [{ id: 'body', mesh: body, transform: r }];
    // The plate is only visible from the front. Leaving it out otherwise also
    // stops its thin sides being mis-sorted in front of the slab's back.
    const frontNormal = rotateOffset(vec3(0, 0, 1), r);
    const toCamera = sub3(view.position, vec3(plateOffset.x, plateOffset.y, plateOffset.z));
    if (plate && dot3(frontNormal, toCamera) > 0) {
      objects.push({ id: 'plate', mesh: plate, transform: { ...r, ...plateOffset } });
    }
    return projectSpace(
      options.id,
      { camera: view, objects, ...(options.light ? { light: options.light } : {}) },
      options.viewport,
    );
  };
}

/** Where a local offset ends up after an X-then-Y-then-Z rotation. */
function rotateOffset(v: Vec3, r: Rotation3D): { x: number; y: number; z: number } {
  const [cx, sx] = [Math.cos(r.rotateX * DEG_TO_RAD), Math.sin(r.rotateX * DEG_TO_RAD)];
  const [cy, sy] = [Math.cos(r.rotateY * DEG_TO_RAD), Math.sin(r.rotateY * DEG_TO_RAD)];
  const [cz, sz] = [Math.cos(r.rotateZ * DEG_TO_RAD), Math.sin(r.rotateZ * DEG_TO_RAD)];
  const a = { x: v.x, y: v.y * cx - v.z * sx, z: v.y * sx + v.z * cx };
  const b = { x: a.x * cy + a.z * sy, y: a.y, z: -a.x * sy + a.z * cy };
  return { x: b.x * cz - b.y * sz, y: b.x * sz + b.y * cz, z: b.z };
}

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface PageCurlOptions {
  readonly id: string;
  readonly viewport: Viewport;
  readonly camera: Camera3D;
  readonly width: number;
  readonly height: number;
  readonly paper: string;
  readonly back: string;
  /** Colour of the printed lines. */
  readonly ink: string;
  /** Number of printed lines. Default 22. */
  readonly lines?: number;
  /** Shadow cast by the lifted part (use a translucent colour); drawn softly blurred. */
  readonly shadow: string;
  readonly corner: Corner;
  /** Distance from the corner to the fold line, along the diagonal. */
  readonly reach: number;
  readonly radius: number;
  /** Relative breathing of the lift (e.g. 0.08), looping every `period` s. */
  readonly wobble: number;
  readonly period: number;
  /** Width of each bent strip, px. Smaller = smoother curl. Default 4. */
  readonly strip?: number;
  readonly seed?: number | string;
  readonly light?: Light3D;
}

/** Keeps the part of a convex polygon where dot(p - origin, dir) is within [lo, hi]. */
function clipBand(
  polygon: readonly Point[],
  origin: Point,
  dir: Point,
  lo: number,
  hi: number,
): Point[] {
  const side = (p: Point) => (p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y;
  const clip = (poly: readonly Point[], keep: (s: number) => boolean, edge: number) => {
    const out: Point[] = [];
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length] as Point;
      const [sa, sb] = [side(a), side(b)];
      if (keep(sa)) out.push(a);
      if (keep(sa) !== keep(sb)) {
        const k = (edge - sa) / (sb - sa);
        out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      }
    });
    return out;
  };
  return clip(
    clip(polygon, (v) => v >= lo, lo),
    (v) => v <= hi,
    hi,
  );
}

/**
 * A sheet of paper whose corner is lifted and gently breathing. The page
 * bends (it never stretches) and the lifted part casts a soft shadow.
 *
 * The curl depends only on distance from the fold line, so the lifted part
 * is cut into thin strips parallel to the fold: each strip stays planar when
 * bent, and every edge is a clean line (no grid staircase). Printed lines are
 * clipped into the same strips, so they bend with the paper.
 */
export function pageCurl(options: PageCurlOptions): (t: number) => GroupNode {
  const { width, height } = options;
  const sx = options.corner.endsWith('right') ? 1 : -1;
  const sy = options.corner.startsWith('top') ? 1 : -1;
  const corner = { x: (sx * width) / 2, y: (sy * height) / 2 };
  const diagonal = normalize3(vec3(sx * width, sy * height, 0));
  const light = options.light ?? { direction: vec3(-0.3, 0.5, -1), ambient: 0.45 };
  const lightDir = normalize3(light.direction);
  const stripWidth = options.strip ?? 4;
  const page: Point[] = [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ];

  // Printed lines (fixed): rectangles in page coordinates.
  const count = options.lines ?? 22;
  const margin = width * 0.12;
  const pitch = (height - 2 * margin) / count;
  const printed = Array.from({ length: count }, (_, i): Point[] => {
    const top = height / 2 - margin - i * pitch;
    const bottom = top - pitch * 0.42;
    const right = width / 2 - margin - random(options.seed ?? 0, 'line', i) * width * 0.35;
    return [
      { x: -width / 2 + margin, y: bottom },
      { x: right, y: bottom },
      { x: right, y: top },
      { x: -width / 2 + margin, y: top },
    ];
  });

  return (t) => {
    const wave = Math.sin((2 * Math.PI * mod(t, options.period)) / options.period);
    const reach = options.reach * (1 + options.wobble * wave);
    const angle = 4 * wave * DEG_TO_RAD; // the fold line sways a few degrees
    const direction = {
      x: diagonal.x * Math.cos(angle) - diagonal.y * Math.sin(angle),
      y: diagonal.x * Math.sin(angle) + diagonal.y * Math.cos(angle),
    };
    const fold = { x: corner.x - diagonal.x * reach, y: corner.y - diagonal.y * reach };
    const radius = options.radius * (1 - 0.5 * options.wobble * wave);
    const curl = { fold, direction, radius };
    const far = Math.max(
      ...page.map((p) => (p.x - fold.x) * direction.x + (p.y - fold.y) * direction.y),
    );

    // Builds a mesh from 2D polygons, curling every vertex.
    const toMesh = (polys: { points: Point[]; face: Omit<Face, 'indices'> }[]): Mesh => {
      const vertices: Vec3[] = [];
      const faces: Face[] = [];
      for (const { points, face } of polys) {
        if (points.length < 3) continue;
        const start = vertices.length;
        for (const p of points) vertices.push(curlVertex(vec3(p.x, p.y, 0), curl));
        faces.push({ ...face, indices: points.map((_, i) => start + i) });
      }
      return { vertices, faces };
    };
    const sheet = { color: options.paper, backColor: options.back };
    const ink = { color: options.ink };

    // Flat part: one polygon plus its printed lines, drawn in this order.
    const flat = toMesh([
      { points: clipBand(page, fold, direction, -Infinity, 0), face: sheet },
      ...printed.map((rect) => ({
        points: clipBand(rect, fold, direction, -Infinity, 0),
        face: ink,
      })),
    ]);

    // Lifted part: strips parallel to the fold, each followed by its printed pieces.
    const basis = cameraBasis(options.camera, options.viewport);
    const strips = Array.from({ length: Math.max(0, Math.ceil(far / stripWidth)) }, (_, i) => {
      const [lo, hi] = [i * stripWidth, Math.min(far, (i + 1) * stripWidth)];
      const mid = curlVertex(
        vec3(fold.x + (direction.x * (lo + hi)) / 2, fold.y + (direction.y * (lo + hi)) / 2, 0),
        curl,
      );
      return {
        depth: toCameraSpace(basis, mid).z,
        lift: mid.z,
        polys: [
          { points: clipBand(page, fold, direction, lo, hi), face: sheet },
          ...printed.map((rect) => ({
            points: clipBand(rect, fold, direction, lo, hi),
            face: ink,
          })),
        ],
      };
    });
    strips.sort((a, b) => b.depth - a.depth); // far strips first
    const lifted = toMesh(strips.flatMap((strip) => strip.polys));

    // Shadow: clearly lifted strips projected along the light onto the desk,
    // merged into one path (overlaps don't darken twice) and blurred.
    const shadowPaths = strips
      .filter((strip) => strip.lift > radius * 0.25)
      .flatMap((strip) => {
        const outline = strip.polys[0]?.points ?? [];
        const points = outline.map((p) => {
          const v = curlVertex(vec3(p.x, p.y, 0), curl);
          return projectPoint(
            basis,
            vec3(v.x - (lightDir.x * v.z) / lightDir.z, v.y - (lightDir.y * v.z) / lightDir.z, 0),
          );
        });
        if (points.length < 3 || points.some((p) => p === null)) return [];
        const polygon = points as Point[];
        return [polygonPath(signedArea(polygon) < 0 ? [...polygon].reverse() : polygon, 2)];
      });

    const space = { camera: options.camera, light, sort: false };
    return groupNode(options.id, [
      projectSpace(
        `${options.id}-flat`,
        { ...space, objects: [{ id: 'p', mesh: flat }] },
        options.viewport,
      ),
      // A transparent shape whose blurred shadow is the visible part.
      shapeNode(`${options.id}-shadow`, {
        geometry: shadowPaths.length ? pathGeometry(shadowPaths.join('')) : rect(0, 0, 0, 0),
        fill: 'transparent',
        shadow: { x: 0, y: 0, blur: options.radius * 0.6, color: options.shadow },
      }),
      projectSpace(
        `${options.id}-lift`,
        { ...space, objects: [{ id: 'p', mesh: lifted }] },
        options.viewport,
      ),
    ]);
  };
}

export interface FlyThroughOptions {
  readonly id: string;
  readonly viewport: Viewport;
  readonly seed: number | string;
  readonly count: number;
  /** Size of the field the objects fill (around the flight path). */
  readonly field: { readonly width: number; readonly height: number; readonly length: number };
  /** Half-size of the clear tunnel the camera flies through. */
  readonly clearance: number;
  /** Object size range. */
  readonly size: readonly [number, number];
  readonly palette: readonly string[];
  /** Seconds for one seamless loop: the camera covers `field.length` per loop. */
  readonly loopDuration: number;
  readonly fog: Fog3D;
  readonly fov?: number;
  /** Camera sway (roll in degrees, drift in units). */
  readonly sway?: { readonly roll: number; readonly drift: number };
  readonly light?: Light3D;
}

/** The camera flies forward through a field of 3D objects; loops exactly. */
export function flyThrough(options: FlyThroughOptions): (t: number) => GroupNode {
  const { field, loopDuration } = options;
  const rng = createRng(options.seed);
  const noise = createNoise(options.seed);
  const meshes = (size: number, color: string): Mesh[] => [
    box(size, size, size, color),
    sphere(size / 2, 12, 8, color),
    pyramid(size / 2, size, 4, color),
    cylinder(size / 3, size * 1.4, 10, color),
  ];
  const items = Array.from({ length: options.count }, (_, i) => {
    // Rejection-sample a position outside the clear tunnel.
    let x: number;
    let y: number;
    do {
      x = rng.range(-field.width / 2, field.width / 2);
      y = rng.range(-field.height / 2, field.height / 2);
    } while (Math.abs(x) < options.clearance && Math.abs(y) < options.clearance);
    const size = rng.range(options.size[0], options.size[1]);
    return {
      id: `o${i}`,
      x,
      y,
      z: rng.range(0, field.length),
      mesh: rng.pick(meshes(size, rng.pick(options.palette))),
      phase: rng.range(0, 360),
      turns: rng.int(-1, 1) || 1, // whole turns per loop, so rotation loops too
    };
  });
  const speed = field.length / loopDuration;
  const sway = options.sway ?? { roll: 3, drift: 30 };

  return (t) => {
    const local = mod(t, loopDuration);
    const p = local / loopDuration;
    const objects: Object3D[] = items.map((item) => ({
      id: item.id,
      mesh: item.mesh,
      transform: {
        x: item.x,
        y: item.y,
        // Distance ahead shrinks as we fly; objects that pass re-enter at the far end.
        z: -mod(item.z - speed * local, field.length),
        rotateX: item.phase + 360 * item.turns * p,
        rotateY: item.phase * 0.7 + 360 * item.turns * p,
      },
    }));
    const camera: Camera3D = {
      position: vec3(sway.drift * noise.loop(p, 0.6, 0), sway.drift * noise.loop(p, 0.6, 1), 0),
      target: vec3(0, 0, -100),
      roll: sway.roll * noise.loop(p, 0.6, 2),
      fov: options.fov ?? 60,
      near: 5,
    };
    return projectSpace(
      options.id,
      { camera, objects, fog: options.fog, ...(options.light ? { light: options.light } : {}) },
      options.viewport,
    );
  };
}
