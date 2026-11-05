import {
  baselineOffset,
  createCanvasMeasurer,
  layoutText,
  type FontMetrics,
  type TextLayout,
  type TextMeasurer,
  type TextNode,
} from '@html-animation-engine/core';

/**
 * Lays out text nodes identically for every renderer: same line breaks, same
 * baseline. Results are memoised by content, which keeps `render` pure.
 */
export class TextLayouter {
  readonly measurer: TextMeasurer;
  readonly #cache = new Map<string, { layout: TextLayout; baseline: number }>();

  constructor(measurer?: TextMeasurer, doc?: Document) {
    this.measurer = measurer ?? createCanvasMeasurer(doc);
  }

  layout(node: TextNode): { layout: TextLayout; baseline: number } {
    const key = JSON.stringify([node.text, node.font, node.maxWidth ?? null, node.align ?? 'left']);
    let entry = this.#cache.get(key);
    if (!entry) {
      const layout = layoutText(node.text, node.font, {
        measurer: this.measurer,
        ...(node.maxWidth === undefined ? {} : { maxWidth: node.maxWidth }),
        align: node.align ?? 'left',
      });
      const metrics: FontMetrics = this.measurer.metrics?.(node.font) ?? {
        ascent: node.font.size * 0.8,
        descent: node.font.size * 0.2,
      };
      entry = { layout, baseline: baselineOffset(node.font, metrics) };
      if (this.#cache.size > 500) this.#cache.clear();
      this.#cache.set(key, entry);
    }
    return entry;
  }
}
