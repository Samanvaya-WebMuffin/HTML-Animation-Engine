import { describe, expect, it } from 'vitest';
import {
  apply3D,
  box,
  cameraBasis,
  centroid3,
  clipNear,
  curlVertex,
  cylinder,
  deformMesh,
  dot3,
  flattenScene,
  length3,
  lerpOrbit,
  orbitCamera,
  plane,
  polygonNormal,
  projectPoint,
  projectSpace,
  pyramid,
  rotateX3D,
  rotateY3D,
  shadeColor,
  sphere,
  sub3,
  transform3DMatrix,
  vec3,
  type Mesh,
  type Vec3,
} from '../src/index.js';

const VIEW = { width: 1280, height: 720 };
const close3 = (a: Vec3, b: Vec3) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};

describe('transforms', () => {
  it('rotates by the right-hand rule', () => {
    close3(apply3D(rotateY3D(90), vec3(0, 0, 1)), vec3(1, 0, 0));
    close3(apply3D(rotateX3D(90), vec3(0, 1, 0)), vec3(0, 0, 1));
  });

  it('applies scale, then rotation, then translation', () => {
    const m = transform3DMatrix({ x: 10, rotateY: 90, scale: 2 });
    close3(apply3D(m, vec3(0, 0, 1)), vec3(12, 0, 0));
  });
});

describe('primitives', () => {
  const outward = (mesh: Mesh) =>
    mesh.faces.every((face) => {
      const points = face.indices.map((i) => mesh.vertices[i] as Vec3);
      return dot3(polygonNormal(points), centroid3(points)) > 0;
    });

  it.each([
    ['box', box(2, 1, 0.5, '#fff')],
    ['sphere', sphere(1, 12, 8, '#fff')],
    ['cylinder', cylinder(1, 2, 10, '#fff')],
    ['pyramid', pyramid(1, 2, 4, '#fff')],
  ])('%s faces all point outward', (_name, mesh) => {
    expect(outward(mesh)).toBe(true);
  });

  it('builds a subdivided, two-sided plane', () => {
    const p = plane(100, 50, 4, 2, '#fff', '#000');
    expect(p.vertices).toHaveLength(15);
    expect(p.faces).toHaveLength(8);
    expect(p.faces.every((f) => f.backColor === '#000')).toBe(true);
  });
});

describe('camera and projection', () => {
  const camera = { position: vec3(0, 0, 1000), target: vec3(0, 0, 0), fov: 50 };
  const basis = cameraBasis(camera, VIEW);

  it('puts the target at the centre of the frame', () => {
    expect(projectPoint(basis, vec3(0, 0, 0))).toEqual({ x: 640, y: 360 });
  });

  it('halves apparent size at twice the distance', () => {
    const near = projectPoint(basis, vec3(100, 0, 0));
    const far = projectPoint(basis, vec3(100, 0, -1000));
    expect((near?.x ?? 0) - 640).toBeCloseTo(2 * ((far?.x ?? 0) - 640), 9);
  });

  it('maps up to up on screen (y down)', () => {
    expect(projectPoint(basis, vec3(0, 100, 0))?.y).toBeLessThan(360);
  });

  it('returns null for points behind the camera', () => {
    expect(projectPoint(basis, vec3(0, 0, 2000))).toBeNull();
  });

  it('clips polygons at the near plane', () => {
    const clipped = clipNear([vec3(0, 0, -5), vec3(10, 0, 5), vec3(0, 10, 5)], 1);
    expect(clipped.length).toBeGreaterThanOrEqual(3);
    expect(clipped.every((p) => p.z >= 1 - 1e-9)).toBe(true);
    expect(clipNear([vec3(0, 0, -5), vec3(1, 0, -5), vec3(0, 1, -5)], 1)).toEqual([]);
  });

  it('orbits at the requested distance and zooms geometrically', () => {
    const orbit = { target: vec3(10, 0, 0), distance: 500, azimuth: 30, elevation: 20 };
    expect(length3(sub3(orbitCamera(orbit).position, orbit.target))).toBeCloseTo(500, 9);
    expect(lerpOrbit(orbit, { ...orbit, distance: 2000 }, 0.5).distance).toBeCloseTo(1000, 9);
  });
});

describe('projectSpace', () => {
  const camera = orbitCamera({ target: vec3(0, 0, 0), distance: 900, azimuth: 30, elevation: 20 });
  const space = { camera, objects: [{ id: 'slab', mesh: box(400, 250, 40, '#c6ff3d') }] };

  it('culls back faces: a box shows at most three faces', () => {
    const group = projectSpace('s', space, VIEW);
    expect(group.children.length).toBeGreaterThan(0);
    expect(group.children.length).toBeLessThanOrEqual(3);
  });

  it('draws far faces before near ones', () => {
    const near = { id: 'near', mesh: box(50, 50, 50, '#ff0000'), transform: { z: 300 } };
    const far = { id: 'far', mesh: box(50, 50, 50, '#0000ff'), transform: { z: -300 } };
    const ids = projectSpace('s', { camera, objects: [near, far] }, VIEW).children.map((c) => c.id);
    expect(ids.findIndex((id) => id.includes('far'))).toBeLessThan(
      ids.findIndex((id) => id.includes('near')),
    );
  });

  it('shades faces by their angle to the light', () => {
    const fills = new Set(
      projectSpace('s', space, VIEW).children.map((c) => (c as { fill?: string }).fill),
    );
    expect(fills.size).toBeGreaterThan(1);
  });

  it('fades geometry into fog and drops it beyond the far distance', () => {
    const fogged = projectSpace(
      's',
      { ...space, fog: { color: '#000000', near: 0, far: 400 } },
      VIEW,
    );
    expect(fogged.children).toHaveLength(0);
  });

  it('draws both sides of two-sided faces with their own colours', () => {
    const sheet = plane(200, 200, 1, 1, '#ffffff', '#000000');
    const behind = orbitCamera({
      target: vec3(0, 0, 0),
      distance: 500,
      azimuth: 180,
      elevation: 0,
    });
    const [face] = projectSpace(
      's',
      { camera: behind, objects: [{ id: 'p', mesh: sheet }] },
      VIEW,
    ).children;
    expect((face as { fill?: string }).fill).toBe(shadeColor('#000000', 0.55 + 0.55 * 0.35));
  });

  it('is a pure function of its input', () => {
    const a = JSON.stringify(
      flattenScene({ width: 1280, height: 720, world: [projectSpace('s', space, VIEW)] }),
    );
    const b = JSON.stringify(
      flattenScene({ width: 1280, height: 720, world: [projectSpace('s', space, VIEW)] }),
    );
    expect(a).toBe(b);
  });
});

describe('curlVertex', () => {
  const options = { fold: { x: 50, y: 0 }, direction: { x: 1, y: 0 }, radius: 20 };

  it('leaves the page before the fold flat', () => {
    expect(curlVertex(vec3(10, 5, 0), options)).toEqual(vec3(10, 5, 0));
  });

  it('lifts the page beyond the fold towards +z', () => {
    expect(curlVertex(vec3(80, 5, 0), options).z).toBeGreaterThan(0);
  });

  it('bends without stretching: distances along the page are preserved', () => {
    const strip = plane(200, 10, 100, 1, '#fff');
    const curled = deformMesh(strip, (v) => curlVertex(v, { ...options, fold: { x: 0, y: 0 } }));
    const row = curled.vertices.slice(0, 101);
    let length = 0;
    for (let i = 1; i < row.length; i++)
      length += length3(sub3(row[i] as Vec3, row[i - 1] as Vec3));
    expect(length).toBeCloseTo(200, 0);
  });
});
