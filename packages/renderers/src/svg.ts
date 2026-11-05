import {
  flattenScene,
  fontString,
  geometryToPath,
  type DrawItem,
  type Scene,
  type ShapeNode,
  type TextNode,
} from '@html-animation-engine/core';
import { fixed, matrixString, type Renderer, type RendererOptions } from './renderer.js';
import { Slots } from './slots.js';
import { TextLayouter } from './text.js';

export const SVG_NS = 'http://www.w3.org/2000/svg';
let instances = 0;

interface SvgSlot {
  readonly root: SVGGElement;
  readonly signature: string;
  /** Innermost group that holds the drawing. */
  readonly content: SVGGElement;
  readonly clipPaths: SVGPathElement[];
  readonly shadow?: SVGPathElement;
  readonly blur?: SVGFEGaussianBlurElement;
  readonly shape?: SVGPathElement;
  readonly lines: SVGTextElement[];
  dispose(): void;
}

/** SVG renderer: one `<svg>` element; vector output at any scale. */
export function createSvgRenderer(host: HTMLElement, options: RendererOptions): Renderer {
  const { width, height } = options;
  const doc = host.ownerDocument;
  const prefix = `hae${++instances}`;
  const el = <K extends keyof SVGElementTagNameMap>(tag: K) =>
    doc.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];

  const svg = el('svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', overflow: 'hidden' });
  const defs = el('defs');
  const layer = el('g');
  svg.append(defs, layer);
  host.append(svg);

  const text = new TextLayouter(options.measurer, doc);
  const slots = new Slots<SvgSlot>(layer);

  const signatureOf = (item: DrawItem): string => {
    const { node } = item;
    if (node.type === 'text')
      return `text|${item.clips.length}|${text.layout(node).layout.lines.length}`;
    return `shape|${item.clips.length}|${node.shadow && node.fill ? (node.shadow.blur ? 'blur' : 'hard') : 'none'}`;
  };

  const build = (item: DrawItem, key: string): SvgSlot => {
    const root = el('g');
    root.dataset['haeId'] = key;
    const slotDefs: Element[] = [];
    const clipPaths: SVGPathElement[] = [];
    let parent: SVGGElement = root;
    item.clips.forEach((_, index) => {
      const id = `${prefix}-${key}-clip${index}`;
      const clipPath = el('clipPath');
      clipPath.id = id;
      clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');
      const path = el('path');
      clipPath.append(path);
      defs.append(clipPath);
      slotDefs.push(clipPath);
      clipPaths.push(path);
      const group = el('g');
      group.setAttribute('clip-path', `url(#${id})`);
      parent.append(group);
      parent = group;
    });
    const content = el('g');
    parent.append(content);
    const dispose = () => slotDefs.forEach((def) => def.remove());

    const { node } = item;
    if (node.type === 'text') {
      const lines = text.layout(node).layout.lines.map(() => {
        const line = el('text');
        line.style.whiteSpace = 'pre';
        content.append(line);
        return line;
      });
      return { root, signature: signatureOf(item), content, clipPaths, lines, dispose };
    }

    let shadow: SVGPathElement | undefined;
    let blur: SVGFEGaussianBlurElement | undefined;
    if (node.shadow && node.fill) {
      const parts = createSvgShadow(doc, defs, `${prefix}-${key}-blur`, Boolean(node.shadow.blur));
      shadow = parts.shadow;
      blur = parts.blur;
      if (parts.filter) slotDefs.push(parts.filter);
      content.append(shadow);
    }
    const shape = el('path');
    content.append(shape);
    return {
      root,
      signature: signatureOf(item),
      content,
      clipPaths,
      ...(shadow ? { shadow } : {}),
      ...(blur ? { blur } : {}),
      shape,
      lines: [],
      dispose,
    };
  };

  const updateText = (slot: SvgSlot, node: TextNode, item: DrawItem) => {
    const { layout, baseline } = text.layout(node);
    slot.content.setAttribute('transform', matrixString(item.matrix));
    const style = `font: ${fontString(node.font)}; letter-spacing: ${node.font.letterSpacing ?? 0}px`;
    layout.lines.forEach((line, i) => {
      const element = slot.lines[i];
      if (!element) return;
      element.textContent = line.text;
      element.setAttribute('x', fixed(line.x));
      element.setAttribute('y', fixed(line.y + baseline));
      element.setAttribute('fill', node.fill ?? '#000');
      element.setAttribute('opacity', fixed(item.opacity));
      element.setAttribute('style', `${style}; white-space: pre`);
    });
  };

  return {
    kind: 'svg',
    element: svg,
    render(scene: Scene) {
      slots.sync(
        flattenScene(scene),
        (item) => item.node.id,
        signatureOf,
        build,
        (slot, item) => {
          item.clips.forEach((clip, i) => {
            const path = slot.clipPaths[i];
            path?.setAttribute('d', geometryToPath(clip.geometry));
            path?.setAttribute('transform', matrixString(clip.matrix));
          });
          if (item.node.type === 'shape') {
            updateSvgShape(slot, item.node, matrixString(item.matrix), item.opacity);
          } else updateText(slot, item.node, item);
        },
      );
    },
    destroy() {
      slots.clear();
      svg.remove();
    },
  };
}

/** SVG elements that draw one shape node. */
export interface SvgShapeParts {
  readonly shape?: SVGPathElement;
  readonly shadow?: SVGPathElement;
  readonly blur?: SVGFEGaussianBlurElement;
}

/** Writes a shape node's geometry, paint and transform onto SVG elements. */
export function updateSvgShape(
  parts: SvgShapeParts,
  node: ShapeNode,
  transform: string,
  opacity: number,
): void {
  const d = geometryToPath(node.geometry);
  const alpha = fixed(opacity);
  if (parts.shadow && node.shadow) {
    parts.shadow.setAttribute('d', d);
    parts.shadow.setAttribute(
      'transform',
      `${transform} translate(${fixed(node.shadow.x)} ${fixed(node.shadow.y)})`,
    );
    parts.shadow.setAttribute('fill', node.shadow.color);
    parts.shadow.setAttribute('opacity', alpha);
    parts.blur?.setAttribute('stdDeviation', fixed((node.shadow.blur ?? 0) / 2));
  }
  const { shape } = parts;
  if (!shape) return;
  shape.setAttribute('d', d);
  shape.setAttribute('transform', transform);
  shape.setAttribute('opacity', alpha);
  shape.setAttribute('fill', node.fill ?? 'none');
  const { stroke } = node;
  if (stroke && stroke.width > 0) {
    shape.setAttribute('stroke', stroke.color);
    shape.setAttribute('stroke-width', fixed(stroke.width));
    shape.setAttribute('stroke-linecap', stroke.cap ?? 'butt');
    shape.setAttribute('stroke-linejoin', stroke.join ?? 'miter');
    shape.setAttribute(
      'stroke-dasharray',
      stroke.dash?.length ? stroke.dash.map((v) => fixed(v)).join(' ') : 'none',
    );
    shape.setAttribute('stroke-dashoffset', fixed(stroke.dashOffset ?? 0));
  } else {
    shape.setAttribute('stroke', 'none');
  }
}

/** Creates the shadow path (and blur filter, registered in `defs`) for a shape. */
export function createSvgShadow(
  doc: Document,
  defs: Element,
  id: string,
  blurred: boolean,
): { shadow: SVGPathElement; blur?: SVGFEGaussianBlurElement; filter?: SVGFilterElement } {
  const shadow = doc.createElementNS(SVG_NS, 'path');
  if (!blurred) return { shadow };
  const filter = doc.createElementNS(SVG_NS, 'filter');
  filter.id = id;
  // Blur in sRGB like Canvas `filter` and CSS `blur()`; SVG defaults to linearRGB.
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  for (const [name, value] of [
    ['x', '-50%'],
    ['y', '-50%'],
    ['width', '200%'],
    ['height', '200%'],
  ] as const) {
    filter.setAttribute(name, value);
  }
  const blur = doc.createElementNS(SVG_NS, 'feGaussianBlur');
  filter.append(blur);
  defs.append(filter);
  shadow.setAttribute('filter', `url(#${id})`);
  return { shadow, blur, filter };
}
