import {
  defaultCamera,
  keyframes,
  lerpCamera,
  type Camera,
  type Ease,
} from '@html-animation-engine/core';

export interface CameraMoveOptions {
  /** Frame size (the default camera shows the whole frame). */
  readonly width: number;
  readonly height: number;
  /** World point to move towards. */
  readonly target: { readonly x: number; readonly y: number };
  readonly zoom: number;
  readonly rotation?: number;
  readonly start: number;
  readonly duration: number;
  readonly ease?: Ease;
}

/** Push in: from the full frame to `target` at `zoom`. Zoom eases geometrically. */
export function pushIn(options: CameraMoveOptions): (t: number) => Camera {
  const wide = defaultCamera(options.width, options.height);
  const close: Camera = { ...options.target, zoom: options.zoom, rotation: options.rotation ?? 0 };
  return cameraPath([
    { at: options.start, value: wide },
    {
      at: options.start + options.duration,
      value: close,
      ...(options.ease ? { ease: options.ease } : {}),
    },
  ]);
}

/** Pull back: from `target` at `zoom` out to the full frame. */
export function pullBack(options: CameraMoveOptions): (t: number) => Camera {
  const wide = defaultCamera(options.width, options.height);
  const close: Camera = { ...options.target, zoom: options.zoom, rotation: options.rotation ?? 0 };
  return cameraPath([
    { at: options.start, value: close },
    {
      at: options.start + options.duration,
      value: wide,
      ...(options.ease ? { ease: options.ease } : {}),
    },
  ]);
}

/** A camera keyframe track (each key's `ease` shapes the move that arrives at it). */
export function cameraPath(
  keys: readonly { readonly at: number; readonly value: Camera; readonly ease?: Ease }[],
): (t: number) => Camera {
  return keyframes(keys, lerpCamera);
}
