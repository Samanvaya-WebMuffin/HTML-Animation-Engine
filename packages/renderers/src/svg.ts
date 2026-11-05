import {
  flattenScene,
  fontString,
  geometryBounds,
  geometryToPath,
  shadowList,
  type Geometry,
  type DrawItem,
  type Paint,
  type Shadows,
  type Stroke,
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
  readonly parts?: SvgShapeParts;
  readonly lines: SVGTextElement[];
  /** Per text shadow: its group (offset, filter) and one copy of each line. */
  readonly lineShadows: SvgTextShadow[];
  dispose(): void;
}

interface SvgTextShadow {
  readonly group: SVGGElement;
  readonly blur?: SVGFEGaussianBlurElement;
  readonly lines: SVGTextElement[];
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
      return `text|${item.clips.length}|${text.layout(node).layout.lines.length}|${shadowSignature(node.shadow)}`;
    return `shape|${item.clips.length}|${shapeSignature(node)}`;
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
      const count = text.layout(node).layout.lines.length;
      const makeLines = (parent: SVGGElement) =>
        Array.from({ length: count }, () => {
          const line = el('text');
          line.style.whiteSpace = 'pre';
          parent.append(line);
          return line;
        });
      const lineShadows = shadowList(node.shadow).map((shadow, i): SvgTextShadow => {
        const group = el('g');
        content.append(group);
        let blur: SVGFEGaussianBlurElement | undefined;
        if (shadow.blur) {
          const filter = createBlurFilter(doc, defs, `${prefix}-${key}-tblur${i}`);
          group.setAttribute('filter', `url(#${filter.filter.id})`);
          slotDefs.push(filter.filter);
          blur = filter.blur;
        }
        return { group, ...(blur ? { blur } : {}), lines: makeLines(group) };
      });
      const lines = makeLines(content);
      return {
        root,
        signature: signatureOf(item),
        content,
        clipPaths,
        lines,
        lineShadows,
        dispose,
      };
    }

    const parts = createSvgShapeParts(doc, defs, `${prefix}-${key}`, node);
    for (const shadow of parts.shadows) content.append(shadow.path);
    content.append(parts.shape);
    slotDefs.push(...parts.defs);
    return {
      root,
      signature: signatureOf(item),
      content,
      clipPaths,
      parts,
      lines: [],
      lineShadows: [],
      dispose,
    };
  };

  const updateText = (slot: SvgSlot, node: TextNode, item: DrawItem) => {
    const { layout, baseline } = text.layout(node);
    slot.content.setAttribute('transform', matrixString(item.matrix));
    const style = `font: ${fontString(node.font)}; letter-spacing: ${node.font.letterSpacing ?? 0}px; white-space: pre`;
    const write = (elements: SVGTextElement[], fill: string) =>
      layout.lines.forEach((line, i) => {
        const element = elements[i];
        if (!element) return;
        element.textContent = line.text;
        element.setAttribute('x', fixed(line.x));
        element.setAttribute('y', fixed(line.y + baseline));
        element.setAttribute('fill', fill);
        element.setAttribute('opacity', fixed(item.opacity));
        element.setAttribute('style', style);
      });
    shadowList(node.shadow).forEach((shadow, i) => {
      const entry = slot.lineShadows[i];
      if (!entry) return;
      entry.group.setAttribute('transform', `translate(${fixed(shadow.x)} ${fixed(shadow.y)})`);
      entry.blur?.setAttribute('stdDeviation', fixed((shadow.blur ?? 0) / 2));
      write(entry.lines, shadow.color);
    });
    write(slot.lines, node.fill ?? '#000');
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
          if (item.node.type === 'shape' && slot.parts) {
            updateSvgShape(slot.parts, item.node, matrixString(item.matrix), item.opacity);
          } else if (item.node.type === 'text') updateText(slot, item.node, item);
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
  readonly shape: SVGPathElement;
  /** One per shadow, painted beneath the shape in order. */
  readonly shadows: readonly {
    readonly path: SVGPathElement;
    readonly blur?: SVGFEGaussianBlurElement;
    readonly filter?: SVGFilterElement;
  }[];
  readonly gradient?: SvgGradient;
  /** Elements added to `<defs>` (filters, gradients); remove them with the slot. */
  readonly defs: readonly Element[];
}

interface SvgGradient {
  readonly element: SVGLinearGradientElement | SVGRadialGradientElement;
  readonly stops: readonly SVGStopElement[];
}

/** Structure of a shape's paint, for slot signatures: shadows and gradient kind. */
export function shapeSignature(node: ShapeNode): string {
  const shadows = paints(node) ? shadowSignature(node.shadow) : '';
  const fill = node.fill;
  const gradient = fill && typeof fill !== 'string' ? `${fill.type}${fill.stops.length}` : 'solid';
  return `${shadows}|${gradient}`;
}

export function shadowSignature(shadow: Shadows | undefined): string {
  return shadowList(shadow)
    .map((s) => (s.blur ? 'b' : 'h'))
    .join('');
}

/** Creates the SVG elements for a shape node (shadows and gradient in `defs`). */
export function createSvgShapeParts(
  doc: Document,
  defs: Element,
  id: string,
  node: ShapeNode,
): SvgShapeParts {
  const added: Element[] = [];
  const shadows = (paints(node) ? shadowList(node.shadow) : []).map((shadow, i) => {
    const path = doc.createElementNS(SVG_NS, 'path');
    if (!shadow.blur) return { path };
    const { filter, blur } = createBlurFilter(doc, defs, `${id}-blur${i}`);
    // In user space, sized per frame from the geometry: a bounding-box region
    // collapses for a straight line and cuts off wide glows on small shapes.
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    path.setAttribute('filter', `url(#${filter.id})`);
    added.push(filter);
    return { path, blur, filter };
  });
  const shape = doc.createElementNS(SVG_NS, 'path');
  let gradient: SvgGradient | undefined;
  const fill = node.fill;
  if (fill && typeof fill !== 'string') {
    const element = doc.createElementNS(
      SVG_NS,
      fill.type === 'linear' ? 'linearGradient' : 'radialGradient',
    );
    element.id = `${id}-paint`;
    element.setAttribute('gradientUnits', 'userSpaceOnUse');
    const stops = fill.stops.map(() => {
      const stop = doc.createElementNS(SVG_NS, 'stop');
      element.append(stop);
      return stop;
    });
    defs.append(element);
    added.push(element);
    gradient = { element, stops };
  }
  return { shape, shadows, ...(gradient ? { gradient } : {}), defs: added };
}

function writeGradient(gradient: SvgGradient, paint: Exclude<Paint, string>): void {
  const { element } = gradient;
  if (paint.type === 'linear') {
    element.setAttribute('x1', fixed(paint.x1));
    element.setAttribute('y1', fixed(paint.y1));
    element.setAttribute('x2', fixed(paint.x2));
    element.setAttribute('y2', fixed(paint.y2));
  } else {
    element.setAttribute('cx', fixed(paint.cx));
    element.setAttribute('cy', fixed(paint.cy));
    element.setAttribute('fx', fixed(paint.cx));
    element.setAttribute('fy', fixed(paint.cy));
    element.setAttribute('r', fixed(Math.max(paint.r, 0)));
  }
  paint.stops.forEach((stop, i) => {
    const el = gradient.stops[i];
    if (!el) return;
    el.setAttribute('offset', fixed(Math.min(Math.max(stop.offset, 0), 1)));
    el.setAttribute('stop-color', stop.color);
  });
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
  const stroke = node.stroke && node.stroke.width > 0 ? node.stroke : undefined;
  shadowList(paints(node) ? node.shadow : undefined).forEach((shadow, i) => {
    const entry = parts.shadows[i];
    if (!entry) return;
    entry.path.setAttribute('d', d);
    entry.path.setAttribute(
      'transform',
      `${transform} translate(${fixed(shadow.x)} ${fixed(shadow.y)})`,
    );
    entry.path.setAttribute('fill', node.fill ? shadow.color : 'none');
    writeStroke(entry.path, stroke, shadow.color);
    entry.path.setAttribute('opacity', alpha);
    entry.blur?.setAttribute('stdDeviation', fixed((shadow.blur ?? 0) / 2));
    if (entry.filter) {
      // 3σ of blur on every side, plus half the stroke.
      const pad = 1.5 * (shadow.blur ?? 0) + (stroke ? stroke.width / 2 : 0) + 2;
      const b = boundsOf(node.geometry);
      entry.filter.setAttribute('x', fixed(b.minX - pad));
      entry.filter.setAttribute('y', fixed(b.minY - pad));
      entry.filter.setAttribute('width', fixed(b.maxX - b.minX + 2 * pad));
      entry.filter.setAttribute('height', fixed(b.maxY - b.minY + 2 * pad));
    }
  });
  const { shape } = parts;
  shape.setAttribute('d', d);
  shape.setAttribute('transform', transform);
  shape.setAttribute('opacity', alpha);
  const fill = node.fill;
  if (fill && typeof fill !== 'string' && parts.gradient) {
    writeGradient(parts.gradient, fill);
    shape.setAttribute('fill', `url(#${parts.gradient.element.id})`);
  } else {
    shape.setAttribute('fill', typeof fill === 'string' ? fill : 'none');
  }
  writeStroke(shape, stroke, stroke?.color ?? '');
}

const bounds = new Map<string, ReturnType<typeof geometryBounds>>();

function boundsOf(geometry: Geometry): ReturnType<typeof geometryBounds> {
  if (geometry.kind === 'rect') return geometryBounds(geometry);
  let b = bounds.get(geometry.d);
  if (!b) {
    if (bounds.size > 2000) bounds.clear();
    b = geometryBounds(geometry);
    bounds.set(geometry.d, b);
  }
  return b;
}

/** Whether a shape paints anything (and so can cast a shadow). */
export function paints(node: ShapeNode): boolean {
  return Boolean(node.fill) || Boolean(node.stroke && node.stroke.width > 0);
}

function writeStroke(element: SVGPathElement, stroke: Stroke | undefined, color: string): void {
  if (!stroke) {
    element.setAttribute('stroke', 'none');
    return;
  }
  element.setAttribute('stroke', color);
  element.setAttribute('stroke-width', fixed(stroke.width));
  element.setAttribute('stroke-linecap', stroke.cap ?? 'butt');
  element.setAttribute('stroke-linejoin', stroke.join ?? 'miter');
  element.setAttribute(
    'stroke-dasharray',
    stroke.dash?.length ? stroke.dash.map((v) => fixed(v)).join(' ') : 'none',
  );
  element.setAttribute('stroke-dashoffset', fixed(stroke.dashOffset ?? 0));
}

/** A Gaussian blur filter in `defs`, in sRGB like Canvas `filter` and CSS `blur()`. */
export function createBlurFilter(
  doc: Document,
  defs: Element,
  id: string,
): { filter: SVGFilterElement; blur: SVGFEGaussianBlurElement } {
  const filter = doc.createElementNS(SVG_NS, 'filter');
  filter.id = id;
  // SVG filters default to linearRGB; Canvas and CSS blur in sRGB.
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  // A large region so wide glows are not cut off.
  for (const [name, value] of [
    ['x', '-100%'],
    ['y', '-100%'],
    ['width', '300%'],
    ['height', '300%'],
  ] as const) {
    filter.setAttribute(name, value);
  }
  const blur = doc.createElementNS(SVG_NS, 'feGaussianBlur');
  filter.append(blur);
  defs.append(filter);
  return { filter, blur };
}
