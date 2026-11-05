import type { Scene, TextMeasurer } from '@html-animation-engine/core';

export type RendererKind = 'canvas' | 'svg' | 'dom';

export interface RendererOptions {
  readonly width: number;
  readonly height: number;
  /** Backing-store scale for Canvas (ignored by vector renderers). Default 1. */
  readonly pixelRatio?: number;
  /**
   * Background colour. Canvas paints it into the bitmap (so captured pixels
   * include it); DOM and SVG leave it to the stage. Default transparent.
   */
  readonly background?: string;
  /** Text measurer; defaults to a Canvas-backed one. */
  readonly measurer?: TextMeasurer;
}

/** Draws whole scenes. Each `render` call replaces the previous frame completely. */
export interface Renderer {
  readonly kind: RendererKind;
  readonly element: Element;
  render(scene: Scene): void;
  destroy(): void;
}

/** Formats a matrix for CSS / SVG `matrix()` with stable precision. */
export function matrixString(m: readonly number[]): string {
  return `matrix(${m.map((v) => fixed(v)).join(',')})`;
}

/** Fixed-precision number for attributes and styles (no "-0"). */
export function fixed(value: number, digits = 5): string {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Uniform scale of a matrix (geometric mean of its axis scales). */
export function matrixScale(m: readonly number[]): number {
  return Math.sqrt(Math.abs((m[0] ?? 1) * (m[3] ?? 1) - (m[1] ?? 0) * (m[2] ?? 0)));
}
