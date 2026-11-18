/**
 * Three.js, seeked like everything else: a transparent WebGL layer placed
 * over (or under) an engine scene, drawn only when asked, with whatever the
 * caller has set up for time `t`. Nothing runs on Three.js's own clock: no
 * `setAnimationLoop`, no `Clock`, no `AnimationMixer` updates by delta. A
 * composition sets every time-dependent property (positions, deformation,
 * material values) from `t` and then calls `render`, so any frame can be
 * drawn first and rendering the same `t` twice gives identical pixels.
 *
 * Use it only where the built-in projection (`spatial/`) can't do the job:
 * smooth shading, physically based materials and reflections, high polygon
 * counts, intersecting geometry. Three.js is an optional peer dependency.
 *
 * Determinism: headless Chromium runs WebGL on SwiftShader (CPU), which is
 * deterministic; the drawing buffer is preserved so a frame can be captured
 * after `render` returns. Build environment maps (PMREM) and compile
 * materials in setup, never per frame.
 */
import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
  SRGBColorSpace,
  WebGLRenderer,
  type Camera,
  type Object3D,
} from 'three';

export interface ThreeLayerOptions {
  /** CSS size of the layer (the composition's size). */
  readonly width: number;
  readonly height: number;
  /** Device pixels per CSS px (the export scale). */
  readonly pixelRatio: number;
  /** Put the layer beneath the root's existing content instead of above it. */
  readonly below?: boolean;
  /** Tone mapping exposure (ACES filmic). Default 1. */
  readonly exposure?: number;
}

export interface ThreeLayer {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  /** Draws `scene` from `camera` now, synchronously. */
  render(scene: Object3D, camera: Camera): void;
  /** Clears the layer to transparent (for frames where it shows nothing). */
  clear(): void;
  destroy(): void;
}

/** Creates a transparent Three.js layer filling `root` (which should be positioned). */
export function createThreeLayer(root: HTMLElement, options: ThreeLayerOptions): ThreeLayer {
  const canvas = root.ownerDocument.createElement('canvas');
  Object.assign(canvas.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${options.width}px`,
    height: `${options.height}px`,
    pointerEvents: 'none',
  });
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(options.pixelRatio);
  renderer.setSize(options.width, options.height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.exposure ?? 1;
  if (options.below) root.prepend(canvas);
  else root.append(canvas);
  return {
    renderer,
    canvas,
    render(scene, camera) {
      renderer.render(scene, camera);
    },
    clear() {
      renderer.clear();
    },
    destroy() {
      renderer.dispose();
      canvas.remove();
    },
  };
}

/**
 * A perspective camera that sees the plane z = 0 exactly as the composition's
 * frame: x right in px, y up (so a screen point (x, y) is world (x, −y)),
 * one world unit per px at z = 0. `fov` (degrees, vertical) sets how much
 * perspective objects with depth show; a long lens (small fov) is gentlest.
 */
export function frameCamera(width: number, height: number, fov = 20): PerspectiveCamera {
  const distance = height / 2 / Math.tan((fov * Math.PI) / 360);
  const camera = new PerspectiveCamera(fov, width / height, distance / 20, distance * 20);
  camera.position.set(width / 2, -height / 2, distance);
  camera.lookAt(width / 2, -height / 2, 0);
  camera.updateProjectionMatrix();
  return camera;
}
