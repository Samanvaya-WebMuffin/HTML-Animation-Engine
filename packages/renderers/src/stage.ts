import {
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
 * Mounts `composition` inside `host`, runs its `setup`, and waits for web
 * fonts so that text is measured with the real font before the first frame.
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

  const setupContext: SetupContext = { root: element, width, height, fps, pixelRatio };
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
    },
    destroy() {
      composition.teardown?.(setupContext);
      element.remove();
    },
  };
}
