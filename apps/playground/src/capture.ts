/**
 * Capture page: mounts one example at its exact size in the top-left corner,
 * with nothing else on the page. Headless capture (visual tests, export)
 * drives it through `window.haeCapture`.
 *
 *   capture.html?example=<name>[&scale=2][&fps=60][&reduced=1]
 */
import { compositionSeed, type Soundtrack } from '@html-animation-engine/core';
import { mountStage } from '@html-animation-engine/renderers';
import { examples } from './examples.js';

export interface CaptureInfo {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** The composition's own frame rate, and whether export must keep it. */
  readonly nativeFps: number;
  readonly fixedFps: boolean;
  readonly duration: number;
  readonly stills: readonly number[];
  readonly background: string;
  /** The composition's numeric seed (seeds the soundtrack's noise). */
  readonly seed: number;
  /** Sound as data; sample URLs are relative to this page. */
  readonly audio?: Soundtrack;
}

export interface CaptureApi {
  /** Resolves once the example is mounted, fonts are loaded and setup has run. */
  readonly ready: Promise<CaptureInfo>;
  /** Draws the frame at `t` seconds (synchronously). */
  render(t: number): void;
}

declare global {
  interface Window {
    haeCapture: CaptureApi;
  }
}

const params = new URLSearchParams(location.search);
const host = document.getElementById('host');
let renderFrame: (t: number) => void = () => {
  throw new Error('haeCapture: not ready');
};

async function mount(): Promise<CaptureInfo> {
  const name = params.get('example');
  const entry = examples.find((e) => e.name === name);
  if (!host || !entry) throw new Error(`haeCapture: unknown example "${name ?? ''}"`);
  const { composition, config } = await entry.load();
  const fps = Number(params.get('fps')) || composition.fps;
  const stage = await mountStage(host, composition, {
    fps,
    pixelRatio: Number(params.get('scale')) || 1,
    reducedMotion: params.get('reduced') === '1',
    // Frames must not depend on which frames were drawn before them.
    isolateFrames: true,
  });
  renderFrame = (t) => stage.render(t);
  return {
    id: composition.id,
    width: composition.width,
    height: composition.height,
    fps,
    nativeFps: composition.fps,
    fixedFps: composition.fixedFps ?? false,
    duration: composition.duration,
    stills: config?.stills ?? [],
    background: composition.background,
    seed: compositionSeed(composition),
    ...(composition.audio ? { audio: composition.audio } : {}),
  };
}

window.haeCapture = {
  // Without ?example= the page is a blank, isolated host (used by test fixtures).
  ready: params.has('example') ? mount() : new Promise<CaptureInfo>(() => undefined),
  render: (t) => renderFrame(t),
};
