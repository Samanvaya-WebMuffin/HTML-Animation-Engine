/**
 * The Cowork chrome ball (Three.js, through `@html-animation-engine/adapters/three`):
 * violet-tinted polished chrome with a clear coat and a faint rainbow sheen,
 * reflecting a studio lit by soft white boxes and the reveal's colours. It
 * starts as drops of liquid metal (metaballs) that run together into one
 * ball, which squashes and wobbles like firm jelly, stretches when it moves
 * fast, and can flatten out into a card. Every shape is set from a `BallPose`
 * that the caller computes from time, so any frame can be drawn first.
 *
 * Screen space: the camera (`frameCamera`) sees the z = 0 plane as the frame,
 * so poses are in frame px (y down).
 */
import {
  BackSide,
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { frameCamera } from '@html-animation-engine/adapters/three';
import { clamp, mixColors } from '@html-animation-engine/core';
import { BALL_PURPLE, C, P } from './cowork-look.js';

/** A drop of liquid metal (metaball phase), in frame px. */
export interface Drop {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export interface BallPose {
  /** Centre and radius (frame px). */
  readonly x: number;
  readonly y: number;
  readonly r: number;
  /** Height over width: below 1 flattened (an impact), above 1 tall. Volume is kept. */
  readonly squash?: number;
  /** Stretch along `angle` (degrees, screen, clockwise from +x): 1 is none. Volume is kept. */
  readonly stretch?: number;
  readonly angle?: number;
  /** Jelly wobble: the surface's second and third modes (fraction of the radius). */
  readonly wobble2?: number;
  readonly wobble3?: number;
  /** 0–1: flattening out into a rounded slab of `card` size (frame px). */
  readonly spread?: number;
  readonly card?: { readonly w: number; readonly h: number };
  /** 0–1: the metal settling into the card's pale, glossy paper finish. */
  readonly matte?: number;
  /** How far the studio has turned round the ball (degrees): the shines glide as it turns. */
  readonly spin?: number;
  /** 0–1, for handing over to what replaces it. */
  readonly opacity?: number;
  /** While set, the ball is these drops running together instead (metaballs). */
  readonly drops?: readonly Drop[];
}

export interface BallRig {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Shapes the ball (or its drops) for one frame. */
  pose(p: BallPose | null): void;
}

/**
 * The metal: Cowork's purple, under a clear coat that reflects the studio in
 * untinted white and light grey (candy-coated chrome).
 */
const TINT = BALL_PURPLE;

/**
 * The studio the ball reflects: a soft gradient dome (light above, a darker
 * floor), white soft boxes for the highlights, and panels in the reveal's
 * colours for the colourful reflections. Rendered once into an environment
 * map (PMREM) at setup.
 */
function studio(): Scene {
  const scene = new Scene();
  const dome = new SphereGeometry(50, 64, 32);
  // Chrome is all contrast: a pale sky, a dark band at the horizon, a near-black floor.
  const top = new Color(mixColors(C.surface.sunken, C.text.tertiary, 0.25));
  const horizon = new Color(mixColors(C.text.primary, C.text.secondary, 0.7));
  const floor = new Color(C.text.primary).multiplyScalar(0.6);
  const colors: number[] = [];
  const pos = dome.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50;
    const c =
      y >= 0
        ? horizon.clone().lerp(top, Math.pow(y, 0.6))
        : horizon.clone().lerp(floor, Math.pow(-y, 0.5));
    colors.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new Float32BufferAttribute(colors, 3));
  scene.add(new Mesh(dome, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
  const panel = (
    color: string,
    strength: number,
    size: [number, number, number],
    at: [number, number, number],
  ) => {
    const m = new Mesh(
      new BoxGeometry(...size),
      new MeshBasicMaterial({ color: new Color(color).multiplyScalar(strength) }),
    );
    m.position.set(...at);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  // Soft boxes: a big one overhead, a key to the upper left, a strip on the right.
  panel(P.white, 110, [26, 20, 1], [0, 44, 8]);
  panel(P.white, 80, [12, 20, 1], [-34, 18, 24]);
  panel(P.white, 60, [3, 30, 1], [36, 8, 16]);
  // The floor's soft light, so the lower half has form.
  panel(mixColors(C.surface.sunken, C.text.tertiary, 0.4), 1.4, [44, 44, 1], [0, -46, 4]);
  // Light grey cards and strips around the sides and below, for the softer shines.
  const grey = mixColors(C.surface.sunken, C.text.tertiary, 0.2);
  panel(grey, 14, [16, 9, 1], [-38, -4, -6]);
  panel(grey, 12, [16, 11, 1], [36, 20, -14]);
  panel(grey, 10, [22, 7, 1], [6, -20, 36]);
  panel(P.white, 40, [2.5, 18, 1], [30, -10, 26]);
  panel(grey, 14, [24, 14, 1], [-12, 8, -40]);
  panel(P.white, 45, [20, 2.5, 1], [-20, 30, 30]);
  return scene;
}

/** The ball's material: chrome (metal, nearly mirror smooth) with a clear coat and a faint sheen of colour. */
function chrome(env: ReturnType<PMREMGenerator['fromScene']>): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: new Color(TINT),
    metalness: 1,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMap: env.texture,
    envMapIntensity: 1.15,
    emissive: new Color(C.meet.violet),
    emissiveIntensity: 0.06,
  });
}

/** Turns the studio round the metal by `degrees` (and tilts it a little), so the shines move. */
function turn(m: MeshPhysicalMaterial, degrees: number): void {
  const spin = (degrees * Math.PI) / 180;
  m.envMapRotation.set(0.18 * Math.sin(spin * 0.7), spin, 0.08 * Math.sin(spin * 0.45));
}

/** Legendre polynomials for the wobble's surface modes. */
const P2 = (c: number) => (3 * c * c - 1) / 2;
const P3 = (c: number) => (5 * c * c * c - 3 * c) / 2;

/**
 * Builds the ball for a `width` × `height` frame, rendering its environment
 * with `renderer` (once, now).
 */
export function createBallRig(renderer: WebGLRenderer, width: number, height: number): BallRig {
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(studio(), 0.03);
  pmrem.dispose();
  scene.environment = env.texture;
  const material = chrome(env);
  material.premultipliedAlpha = true;
  const camera = frameCamera(width, height, 20);

  // Poles front and back (not top and bottom), so a flattened card's rim is
  // the evenly divided equator rather than two pinched poles.
  const sphere = new SphereGeometry(1, 192, 144).rotateX(Math.PI / 2);
  // One shared vertex along the seam, so its shading has no line where the mesh joins.
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const geometry = mergeVertices(sphere, 1e-5);
  sphere.dispose();
  const base = Float32Array.from(geometry.getAttribute('position').array);
  const ball = new Mesh(geometry, material);
  scene.add(ball);

  // The drops: metaballs in a cube of side 2·`span` px round their centre.
  const blobs = new MarchingCubes(96, material, false, false, 60000);
  blobs.isolation = 80;
  scene.add(blobs);
  // A steep falloff, so drops stay separate until they are close.
  const SUBTRACT = 40;

  const metal = {
    emissive: new Color(C.meet.violet),
    color: new Color(TINT),
    roughness: material.roughness,
    metalness: material.metalness,
  };
  const paper = new Color(C.surface.paper);
  const pose = (p: BallPose | null) => {
    ball.visible = false;
    blobs.visible = false;
    if (!p) return;
    // Every material value is set from the pose, so frames never depend on the last one.
    const matte = clamp(p.matte ?? 0);
    // Settling to paper: the metal goes dull and white, the coat and the
    // studio's reflections fade, and it lights itself evenly like the card.
    material.color.copy(metal.color).lerp(paper, matte);
    material.roughness = metal.roughness + (1 - metal.roughness) * matte;
    material.metalness = metal.metalness * (1 - matte);
    material.clearcoat = 1 - matte;
    material.envMapIntensity = 1.15 - 0.9 * matte;
    material.emissive.copy(metal.emissive).lerp(paper, matte);
    material.emissiveIntensity = 0.06 + 1.25 * matte;
    // The studio turns slowly round the ball (and tilts a little), so the shines keep moving.
    turn(material, p.spin ?? 0);
    const opacity = clamp(p.opacity ?? 1);
    material.transparent = opacity < 1;
    material.opacity = opacity;
    if (p.drops && p.drops.length > 0) {
      // The cube spans every drop with room to spare.
      const xs = p.drops.map((d) => d.x);
      const ys = p.drops.map((d) => d.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const reach = Math.max(...p.drops.map((d) => d.r)) * 2.2;
      const span =
        Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + reach;
      blobs.position.set(cx, -cy, 0);
      blobs.scale.setScalar(span);
      blobs.reset();
      for (const d of p.drops) {
        // A lone drop's surface sits where strength / dist² − subtract = isolation.
        const n = d.r / (2 * span);
        const strength = n * n * (blobs.isolation + SUBTRACT);
        if (strength > 0)
          blobs.addBall(
            0.5 + (d.x - cx) / (2 * span),
            0.5 - (d.y - cy) / (2 * span),
            0.5,
            strength,
            SUBTRACT,
          );
      }
      blobs.update();
      blobs.visible = true;
      return;
    }
    const pos = geometry.getAttribute('position');
    const out = pos.array as Float32Array;
    const sq = p.squash ?? 1;
    const st = p.stretch ?? 1;
    const a = ((p.angle ?? 0) * Math.PI) / 180;
    const [ux, uy] = [Math.cos(a), -Math.sin(a)];
    const w2 = p.wobble2 ?? 0;
    const w3 = p.wobble3 ?? 0;
    const spread = clamp(p.spread ?? 0);
    const card = p.card ?? { w: 2 * p.r, h: 2 * p.r };
    // Spreading out, it inflates smoothly: the ball widens into a flat oval
    // disc (an ellipsoid growing to the card's size and thinning), and only
    // towards the end squares off into the rounded card (a superellipsoid
    // whose exponent rises), thin as card stock.
    const grow = spread;
    const square = spread * spread;
    const [hx, hy, hz] = [
      p.r + (card.w / 2 - p.r) * grow,
      p.r + (card.h / 2 - p.r) * grow,
      p.r + (1.5 - p.r) * grow,
    ];
    const m = 2 + 8 * square;
    for (let i = 0; i < pos.count; i++) {
      const nx = base[3 * i] as number;
      const ny = base[3 * i + 1] as number;
      const nz = base[3 * i + 2] as number;
      // The jelly's surface modes, about the vertical axis.
      const f = 1 + w2 * P2(ny) + w3 * P3(ny);
      let x = nx * f;
      let y = ny * f;
      let z = nz * f;
      // Squash, keeping the volume.
      y *= sq;
      const side = 1 / Math.sqrt(sq);
      x *= side;
      z *= side;
      // Stretch along the motion, keeping the volume.
      if (st !== 1) {
        const d = x * ux + y * uy;
        const k = 1 / Math.sqrt(st);
        x = ux * d * st + (x - ux * d) * k;
        y = uy * d * st + (y - uy * d) * k;
        z *= k;
      }
      x *= p.r;
      y *= p.r;
      z *= p.r;
      if (spread > 0) {
        // The same direction on the spreading shape; it replaces the ball's own
        // shape (squash, stretch, wobble) quickly, so those don't fold it.
        const s =
          1 /
          Math.pow(
            Math.pow(Math.abs(nx / hx), m) +
              Math.pow(Math.abs(ny / hy), m) +
              Math.pow(Math.abs(nz / hz), m),
            1 / m,
          );
        const k = clamp(spread * 4);
        x += (nx * s - x) * k;
        y += (ny * s - y) * k;
        z += (nz * s - z) * k;
      }
      out[3 * i] = x;
      out[3 * i + 1] = y;
      out[3 * i + 2] = z;
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    ball.position.set(p.x, -p.y, 0);
    ball.visible = true;
  };

  return { scene, camera, pose };
}

// ---------------------------------------------------------------------------
// Motion, as pure functions of time
// ---------------------------------------------------------------------------

/** How the ball falls and bounces: gravity (px/s²), restitution, impacts kept. */
const FALL = { g: 2600, e: 0.48, bounces: 3 } as const;

/**
 * A drop onto the floor from rest at `t` = 0, from a centre `drop` px above
 * where it rests: arcs of falling and rebounding (each lower by the
 * restitution squared), the jelly flattening at each impact and wobbling
 * after it, damped. Returns the centre's height above resting and the
 * surface's squash and wobble.
 */
export function bounce(t: number, drop: number): { lift: number; squash: number; wobble3: number } {
  const v0 = Math.sqrt(2 * FALL.g * drop);
  let start = 0;
  let v = v0;
  const impacts: { at: number; v: number }[] = [];
  // The first fall, then each rebound's flight.
  let flight = v0 / FALL.g;
  for (let k = 0; k <= FALL.bounces; k++) {
    impacts.push({ at: start + flight, v });
    start += flight;
    v *= FALL.e;
    flight = (2 * v) / FALL.g;
  }
  let lift = 0;
  if (t < (impacts[0]?.at ?? 0)) lift = drop - 0.5 * FALL.g * t * t;
  else {
    for (let k = 0; k < impacts.length - 1; k++) {
      const a = impacts[k];
      const b = impacts[k + 1];
      if (!a || !b) continue;
      if (t >= a.at && t < b.at) {
        const u = t - a.at;
        const up = a.v * FALL.e;
        lift = up * u - 0.5 * FALL.g * u * u;
      }
    }
  }
  // Each impact sets the jelly ringing: flattened first, then wobbling, damped.
  let squash = 1;
  let wobble3 = 0;
  for (const hit of impacts) {
    const u = t - hit.at;
    if (u < 0) continue;
    const a = 0.32 * (hit.v / v0);
    const ring = Math.exp(-u / 0.16);
    squash -= a * ring * Math.cos(2 * Math.PI * 4.2 * u);
    wobble3 += 0.05 * (hit.v / v0) * ring * Math.sin(2 * Math.PI * 6.5 * u);
  }
  return { lift: Math.max(0, lift), squash, wobble3 };
}
