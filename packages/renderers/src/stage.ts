import {
  compositionSeed,
  loadFonts,
  registerFontFaces,
  timeToFrame,
  type Composition,
  type RenderContext,
  type SetupContext,
} from '@html-animation-engine/core';

export interface StageOptions {
  /** Sampling rate for `ctx.frame`. Defaults to the composition's fps. */
  fps?: number;
  /** Output pixel ratio for canvas backing stores. Defaults to 1. */
  pixelRatio?: number;
  /** Passed to the composition as `ctx.reducedMotion`. Defaults to false. */
  reducedMotion?: boolean;
  /**
   * Give every frame fresh layout, paint and compositing state (for capture).
   * Chrome keeps compositing decisions per element: an element that once had
   * a transform and opacity below 1 can be rasterised differently on later
   * frames than if it had never faded, so a frame's pixels would depend on
   * which frames were drawn before it. Detaching and re-attaching the stage
   * after each render discards that state; DOM, React roots, canvas bitmaps
   * and WebGL contexts survive. Costs a relayout per frame. Default false.
   */
  isolateFrames?: boolean;
}

/**
 * A mounted composition. The stage owns the sized root element and is the
 * only thing that calls `composition.render`. It holds no clock: callers
 * (the playground player, the export capturer) decide which `t` to draw.
 */
export interface Stage {
  readonly composition: Composition;
  /** Root element, exactly `width` × `height` CSS pixels. */
  readonly element: HTMLElement;
  readonly fps: number;
  readonly pixelRatio: number;
  /** Draws the frame at `t` seconds. */
  render(t: number): void;
  /** Runs `teardown` and removes the root element. */
  destroy(): void;
}

/**
 * Mounts `composition` inside `host`: loads its declared fonts, runs its
 * `setup`, and waits for `document.fonts.ready`, so text is measured with the
 * real font before the first frame.
 */
export async function mountStage(
  host: HTMLElement,
  composition: Composition,
  options: StageOptions = {},
): Promise<Stage> {
  const fps = options.fps ?? composition.fps;
  const pixelRatio = options.pixelRatio ?? 1;
  const { width, height } = composition;

  const doc = host.ownerDocument;
  installMotionGuard(doc);
  const element = doc.createElement('div');
  element.dataset['haeStage'] = composition.id;
  Object.assign(element.style, {
    position: 'relative',
    width: `${width}px`,
    height: `${height}px`,
    overflow: 'hidden',
    contain: 'strict',
    background: composition.background,
  });
  host.append(element);

  const setupContext: SetupContext = {
    root: element,
    width,
    height,
    fps,
    pixelRatio,
    seed: compositionSeed(composition),
    reducedMotion: options.reducedMotion ?? false,
  };
  if (composition.fontFaces?.length) await registerFontFaces(composition.fontFaces, doc);
  if (composition.fonts?.length) {
    const missing = await loadFonts(composition.fonts, doc);
    for (const font of missing) {
      console.warn(`[hae] Font not available, a fallback will be used: ${font.family}`);
    }
  }
  await composition.setup?.(setupContext);
  await doc.fonts?.ready;

  return {
    composition,
    element,
    fps,
    pixelRatio,
    render(t: number) {
      const ctx: RenderContext = { ...setupContext, frame: timeToFrame(t, fps) };
      composition.render(t, ctx);
      stopClockDrivenAnimation(element, composition.id);
      if (options.isolateFrames) {
        const parent = element.parentNode;
        const next = element.nextSibling;
        element.remove();
        parent?.insertBefore(element, next);
      }
    },
    destroy() {
      composition.teardown?.(setupContext);
      element.remove();
    },
  };
}

const GUARD_ID = 'hae-motion-guard';

/**
 * CSS transitions and animations run on the browser's clock, not on `t`, so
 * they are switched off for everything inside a stage.
 */
function installMotionGuard(doc: Document): void {
  if (doc.getElementById(GUARD_ID)) return;
  const style = doc.createElement('style');
  style.id = GUARD_ID;
  style.textContent =
    '[data-hae-stage], [data-hae-stage] * { transition: none !important; animation: none !important; }';
  doc.head.append(style);
}

const warned = new Set<string>();

/**
 * Cancels Web Animations (`element.animate()`) and pauses SVG SMIL inside the
 * stage after every frame, so nothing moves except what `render(t)` set.
 */
function stopClockDrivenAnimation(element: HTMLElement, id: string): void {
  const animations = element.getAnimations?.({ subtree: true }) ?? [];
  if (animations.length > 0) {
    for (const animation of animations) animation.cancel();
    if (!warned.has(id)) {
      warned.add(id);
      console.warn(
        `[hae] "${id}" started ${animations.length} clock-driven animation(s); they were cancelled. ` +
          'Derive motion from t instead.',
      );
    }
  }
  for (const svg of element.querySelectorAll('svg')) {
    if (typeof svg.pauseAnimations === 'function' && typeof svg.setCurrentTime === 'function') {
      svg.pauseAnimations();
      svg.setCurrentTime(0);
    }
  }
}
