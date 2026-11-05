import { mixColors, oklchToRgb, parseColor, rgbToOklch, formatColor } from '../color/color.js';
import { pathGeometry } from '../geometry/shape.js';
import { polygonPath } from '../geometry/path.js';
import { clamp, lerp } from '../math.js';
import { groupNode, shapeNode, type GroupNode, type SceneNode } from '../scene/nodes.js';
import {
  cameraBasis,
  clipNear,
  projectCameraPoint,
  toCameraSpace,
  type Camera3D,
  type Viewport,
} from './camera.js';
import type { Mesh } from './mesh.js';
import { apply3D, transform3DMatrix, type Transform3D } from './transform.js';
import { centroid3, dot3, normalize3, polygonNormal, scale3, sub3, type Vec3 } from './vec.js';

export interface Object3D {
  readonly id: string;
  readonly mesh: Mesh;
  readonly transform?: Transform3D;
}

export interface Light3D {
  /** Direction the light travels (from the light into the scene). */
  readonly direction: Vec3;
  /** Light on faces turned away from it, 0–1. Default 0.35. */
  readonly ambient?: number;
}

export interface Fog3D {
  readonly color: string;
  /** Distance where fog starts and where it fully hides geometry. */
  readonly near: number;
  readonly far: number;
}

export interface Space {
  readonly camera: Camera3D;
  readonly objects: readonly Object3D[];
  readonly light?: Light3D;
  readonly fog?: Fog3D;
  /**
   * Width of a stroke in each face's own colour, drawn to hide hairline gaps
   * between neighbouring faces. Default 1; 0 to disable.
   */
  readonly seam?: number;
  /**
   * Sort faces far to near (default). Set false to draw faces in the order
   * given, when the caller already knows the right order (e.g. coplanar
   * layers, or decals that must follow the face they sit on).
   */
  readonly sort?: boolean;
}

const DEFAULT_LIGHT: Light3D = { direction: { x: -0.35, y: -0.6, z: -0.7 }, ambient: 0.35 };

const shadeCache = new Map<string, string>();

/** Darkens or lightens a colour by scaling its OKLCH lightness. Memoised. */
export function shadeColor(color: string, factor: number): string {
  const key = `${color}|${factor.toFixed(3)}`;
  let shaded = shadeCache.get(key);
  if (shaded === undefined) {
    const lch = rgbToOklch(parseColor(color));
    shaded = formatColor(oklchToRgb({ ...lch, l: clamp(lch.l * Number(factor.toFixed(3))) }));
    if (shadeCache.size > 20000) shadeCache.clear();
    shadeCache.set(key, shaded);
  }
  return shaded;
}

interface ProjectedFace {
  readonly id: string;
  readonly depth: number;
  readonly order: number;
  readonly points: { x: number; y: number }[];
  readonly color: string;
}

/**
 * Projects a 3D space to 2D scene nodes: one filled polygon per visible face,
 * flat-shaded, fogged, and sorted far to near (painter's algorithm). The
 * result is ordinary scene nodes, so every renderer can draw it.
 *
 * Limits of the painter's algorithm: faces that intersect, or overlap in a
 * cycle, can sort wrongly. Keep objects apart, or split large faces.
 */
export function projectSpace(id: string, space: Space, viewport: Viewport): GroupNode {
  const basis = cameraBasis(space.camera, viewport);
  const light = space.light ?? DEFAULT_LIGHT;
  const toLight = scale3(normalize3(light.direction), -1);
  const ambient = light.ambient ?? 0.35;
  const seam = space.seam ?? 1;
  const faces: ProjectedFace[] = [];
  let order = 0;

  for (const object of space.objects) {
    const matrix = transform3DMatrix(object.transform);
    const world = object.mesh.vertices.map((v) => apply3D(matrix, v));
    object.mesh.faces.forEach((face, index) => {
      const points = face.indices.map((i) => world[i] as Vec3);
      const normal = polygonNormal(points);
      const center = centroid3(points);
      const front = dot3(normal, sub3(basis.position, center)) > 0;
      if (!front && face.backColor === undefined) return; // back-face culling
      const facing = front ? normal : scale3(normal, -1);
      const camera = clipNear(
        points.map((p) => toCameraSpace(basis, p)),
        basis.near,
      );
      if (camera.length < 3) return;
      const diffuse = Math.max(0, dot3(facing, toLight));
      let color = shadeColor(
        front ? face.color : (face.backColor ?? face.color),
        lerp(0.55, 1.1, ambient + (1 - ambient) * diffuse),
      );
      const depth = centroid3(camera).z;
      if (space.fog) {
        const amount = clamp((depth - space.fog.near) / (space.fog.far - space.fog.near));
        if (amount >= 1) return;
        if (amount > 0) color = mixColors(color, space.fog.color, amount);
      }
      faces.push({
        id: `${id}-${object.id}-${index}`,
        depth,
        order: order++,
        points: camera.map((c) => projectCameraPoint(basis, c)),
        color,
      });
    });
  }

  if (space.sort !== false) faces.sort((a, b) => b.depth - a.depth || a.order - b.order);
  const nodes: SceneNode[] = faces.map((face) =>
    shapeNode(face.id, {
      geometry: pathGeometry(polygonPath(face.points, 2)),
      fill: face.color,
      ...(seam > 0 ? { stroke: { color: face.color, width: seam, join: 'round' as const } } : {}),
    }),
  );
  return groupNode(id, nodes);
}
