import { createCanvasRenderer } from './canvas.js';
import { createDomRenderer } from './dom.js';
import type { Renderer, RendererKind, RendererOptions } from './renderer.js';
import { createSvgRenderer } from './svg.js';

/** Creates a renderer of `kind` inside `host`. All three draw the same scenes. */
export function createRenderer(
  kind: RendererKind,
  host: HTMLElement,
  options: RendererOptions,
): Renderer {
  switch (kind) {
    case 'canvas':
      return createCanvasRenderer(host, options);
    case 'svg':
      return createSvgRenderer(host, options);
    case 'dom':
      return createDomRenderer(host, options);
  }
}
