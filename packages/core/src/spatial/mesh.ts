import { add3, scale3, sub3, vec3, dot3, type Vec3 } from './vec.js';

export interface Face {
  /** Vertex indices, counter-clockwise when seen from outside (the front). */
  readonly indices: readonly number[];
  readonly color: string;
  /** Colour of the back side; if set, the face is drawn from both sides. */
  readonly backColor?: string;
}

export interface Mesh {
  readonly vertices: readonly Vec3[];
  readonly faces: readonly Face[];
}

export type BoxColors =
  | string
  | {
      readonly front: string;
      readonly back: string;
      readonly left: string;
      readonly right: string;
      readonly top: string;
      readonly bottom: string;
    };

/** A box centred on the origin; a thin one is a slab or card. */
export function box(width: number, height: number, depth: number, colors: BoxColors): Mesh {
  const [x, y, z] = [width / 2, height / 2, depth / 2];
  const c =
    typeof colors === 'string'
      ? { front: colors, back: colors, left: colors, right: colors, top: colors, bottom: colors }
      : colors;
  // 0..7 = (±x, ±y, ±z) with bit 0 = x, bit 1 = y, bit 2 = z (1 = positive).
  const vertices = Array.from({ length: 8 }, (_, i) =>
    vec3(i & 1 ? x : -x, i & 2 ? y : -y, i & 4 ? z : -z),
  );
  return {
    vertices,
    faces: [
      { indices: [4, 5, 7, 6], color: c.front }, // +z
      { indices: [1, 0, 2, 3], color: c.back }, // -z
      { indices: [5, 1, 3, 7], color: c.right }, // +x
      { indices: [0, 4, 6, 2], color: c.left }, // -x
      { indices: [6, 7, 3, 2], color: c.top }, // +y
      { indices: [0, 1, 5, 4], color: c.bottom }, // -y
    ],
  };
}

/**
 * A flat rectangle in the XY plane facing +z, split into `cols × rows` quads
 * so it can be bent. Drawn from both sides.
 */
export function plane(
  width: number,
  height: number,
  cols: number,
  rows: number,
  color: string,
  backColor = color,
): Mesh {
  const vertices: Vec3[] = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      vertices.push(vec3(-width / 2 + (i * width) / cols, -height / 2 + (j * height) / rows, 0));
    }
  }
  const faces: Face[] = [];
  const at = (i: number, j: number) => j * (cols + 1) + i;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      faces.push({
        indices: [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)],
        color,
        backColor,
      });
    }
  }
  return { vertices, faces };
}

/** A UV sphere centred on the origin. */
export function sphere(radius: number, segments: number, rings: number, color: string): Mesh {
  const vertices: Vec3[] = [vec3(0, radius, 0)];
  for (let r = 1; r < rings; r++) {
    const phi = (Math.PI * r) / rings;
    for (let s = 0; s < segments; s++) {
      const theta = (2 * Math.PI * s) / segments;
      vertices.push(
        vec3(
          radius * Math.sin(phi) * Math.sin(theta),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.cos(theta),
        ),
      );
    }
  }
  vertices.push(vec3(0, -radius, 0));
  const bottom = vertices.length - 1;
  const ring = (r: number, s: number) => 1 + (r - 1) * segments + (s % segments);
  const faces: Face[] = [];
  for (let s = 0; s < segments; s++) {
    faces.push({ indices: [0, ring(1, s), ring(1, s + 1)], color });
    for (let r = 1; r < rings - 1; r++) {
      faces.push({
        indices: [ring(r, s), ring(r + 1, s), ring(r + 1, s + 1), ring(r, s + 1)],
        color,
      });
    }
    faces.push({ indices: [ring(rings - 1, s), bottom, ring(rings - 1, s + 1)], color });
  }
  return { vertices, faces };
}

/** A cylinder (or a cone, with `topRadius` 0) along the y axis. */
export function cylinder(
  radius: number,
  height: number,
  sides: number,
  color: string,
  topRadius = radius,
): Mesh {
  const vertices: Vec3[] = [];
  for (let s = 0; s < sides; s++) {
    const theta = (2 * Math.PI * s) / sides;
    vertices.push(vec3(radius * Math.sin(theta), -height / 2, radius * Math.cos(theta)));
  }
  const apex = topRadius === 0;
  if (apex) vertices.push(vec3(0, height / 2, 0));
  else {
    for (let s = 0; s < sides; s++) {
      const theta = (2 * Math.PI * s) / sides;
      vertices.push(vec3(topRadius * Math.sin(theta), height / 2, topRadius * Math.cos(theta)));
    }
  }
  const faces: Face[] = [];
  for (let s = 0; s < sides; s++) {
    const next = (s + 1) % sides;
    faces.push(
      apex
        ? { indices: [s, next, sides], color }
        : { indices: [s, next, sides + next, sides + s], color },
    );
  }
  faces.push({ indices: Array.from({ length: sides }, (_, s) => sides - 1 - s), color }); // bottom
  if (!apex) faces.push({ indices: Array.from({ length: sides }, (_, s) => sides + s), color }); // top
  return { vertices, faces };
}

/** A pyramid with a regular `sides`-gon base (a cone with few sides). */
export function pyramid(radius: number, height: number, sides: number, color: string): Mesh {
  return cylinder(radius, height, sides, color, 0);
}

/** Moves every vertex through `fn` (faces unchanged). */
export function deformMesh(mesh: Mesh, fn: (vertex: Vec3, index: number) => Vec3): Mesh {
  return { vertices: mesh.vertices.map(fn), faces: mesh.faces };
}

export interface CurlOptions {
  /** A point on the fold line, in the page plane (z = 0). */
  readonly fold: { readonly x: number; readonly y: number };
  /** Unit direction (in the page plane) from the fold line towards the lifted edge or corner. */
  readonly direction: { readonly x: number; readonly y: number };
  /** Radius of the roll. Smaller = tighter curl. */
  readonly radius: number;
}

/**
 * Rolls the part of a flat page beyond a fold line around a cylinder, lifting
 * it towards +z. The page is bent, not stretched: distances along the page
 * are preserved.
 */
export function curlVertex(v: Vec3, options: CurlOptions): Vec3 {
  const d = vec3(options.direction.x, options.direction.y, 0);
  const s = dot3(sub3(v, vec3(options.fold.x, options.fold.y, 0)), d);
  if (s <= 0) return v;
  const r = options.radius;
  const theta = s / r;
  const base = sub3(v, scale3(d, s));
  if (theta <= Math.PI) {
    return add3(
      add3(base, scale3(d, r * Math.sin(theta))),
      vec3(0, 0, v.z + r * (1 - Math.cos(theta))),
    );
  }
  // Past a half turn the page runs back flat, on top of itself.
  return add3(add3(base, scale3(d, -(s - Math.PI * r))), vec3(0, 0, v.z + 2 * r));
}
