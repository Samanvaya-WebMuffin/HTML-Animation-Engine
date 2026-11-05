import {
  effectiveRadius,
  flattenScene,
  fontString,
  geometryToPath,
  IDENTITY,
  invert,
  multiply,
  shadowList,
  type DrawItem,
  type Matrix,
  type Scene,
  type ShapeNode,
  type TextNode,
} from '@html-animation-engine/core';
import { fixed, matrixString, type Renderer, type RendererOptions } from './renderer.js';
import { Slots } from './slots.js';
import {
  createSvgShapeParts,
  paints,
  shadowSignature,
  shapeSignature,
  SVG_NS,
  updateSvgShape,
  type SvgShapeParts,
} from './svg.js';
import { TextLayouter } from './text.js';

let instances = 0;

type Mode = 'rect' | 'svg' | 'text';

interface DomSlot {
  readonly root: HTMLElement;
  readonly signature: string;
  readonly mode: Mode;
  readonly wrappers: HTMLElement[];
  readonly content: HTMLElement;
  readonly shadowBoxes: HTMLElement[];
  readonly box?: HTMLElement;
  readonly svgParts?: SvgShapeParts;
  readonly lines: HTMLElement[];
  /** One set of line copies per text shadow. */
  readonly lineShadows: HTMLElement[][];
}

function modeOf(node: ShapeNode | TextNode): Mode {
  if (node.type === 'text') return 'text';
  const dashed = Boolean(node.stroke?.dash?.length);
  const gradient = node.fill !== undefined && typeof node.fill !== 'string';
  return node.geometry.kind === 'rect' && !dashed && !gradient ? 'rect' : 'svg';
}

/**
 * DOM renderer: HTML elements positioned with CSS transforms. Rectangles are
 * `div`s (border-radius, centred borders), text is real HTML text, and paths
 * or dashed strokes use small inline SVGs.
 */
export function createDomRenderer(host: HTMLElement, options: RendererOptions): Renderer {
  const { width, height } = options;
  const doc = host.ownerDocument;
  const prefix = `haed${++instances}`;
  const root = doc.createElement('div');
  Object.assign(root.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    overflow: 'hidden',
  });
  host.append(root);
  const text = new TextLayouter(options.measurer, doc);
  const slots = new Slots<DomSlot>(root);

  const positioned = () => {
    const element = doc.createElement('div');
    Object.assign(element.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      transformOrigin: '0 0',
    });
    return element;
  };

  const signatureOf = (item: DrawItem) => {
    const { node } = item;
    const extra =
      node.type === 'text'
        ? `${text.layout(node).layout.lines.length}|${shadowSignature(node.shadow)}`
        : shapeSignature(node);
    return `${modeOf(node)}|${item.clips.length}|${extra}`;
  };

  const build = (item: DrawItem, key: string): DomSlot => {
    const wrappers = item.clips.map(() => {
      const wrapper = positioned();
      wrapper.style.width = `${width}px`;
      wrapper.style.height = `${height}px`;
      return wrapper;
    });
    for (let i = 1; i < wrappers.length; i++) wrappers[i - 1]?.append(wrappers[i] as HTMLElement);
    const content = positioned();
    (wrappers.at(-1) ?? root).append(content);
    const slotRoot = wrappers[0] ?? content;
    slotRoot.dataset['haeId'] = key;
    const { node } = item;
    const mode = modeOf(node);
    const base = {
      root: slotRoot,
      signature: signatureOf(item),
      mode,
      wrappers,
      content,
      shadowBoxes: [],
      lines: [],
      lineShadows: [],
    };

    if (node.type === 'text') {
      const count = text.layout(node).layout.lines.length;
      const makeLines = () =>
        Array.from({ length: count }, () => {
          const line = positioned();
          line.style.whiteSpace = 'pre';
          content.append(line);
          return line;
        });
      const lineShadows = shadowList(node.shadow).map(makeLines);
      return { ...base, lines: makeLines(), lineShadows };
    }
    if (mode === 'rect') {
      const shadowBoxes = (paints(node) ? shadowList(node.shadow) : []).map(() => {
        const shadowBox = positioned();
        content.append(shadowBox);
        return shadowBox;
      });
      const box = positioned();
      box.style.boxSizing = 'border-box';
      content.append(box);
      return { ...base, box, shadowBoxes };
    }
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', overflow: 'visible' });
    const defs = doc.createElementNS(SVG_NS, 'defs');
    svg.append(defs);
    // The defs live inside this slot's own svg, so they go with it.
    const parts = createSvgShapeParts(doc, defs, `${prefix}-${key}`, node);
    for (const shadow of parts.shadows) svg.append(shadow.path);
    svg.append(parts.shape);
    content.append(svg);
    return { ...base, svgParts: parts };
  };

  const updateRect = (slot: DomSlot, node: ShapeNode, local: Matrix, opacity: number) => {
    const g = node.geometry;
    if (g.kind !== 'rect' || !slot.box) return;
    const w = Math.abs(g.width);
    const h = Math.abs(g.height);
    const r = effectiveRadius(g);
    const sw = node.stroke && node.stroke.width > 0 ? node.stroke.width : 0;
    const transform = matrixString(local);
    // Shadows copy the box exactly (fill and border) in the shadow colour.
    const boxStyle = (dx: number, dy: number, fill: string, border: string) => ({
      width: `${fixed(w + sw)}px`,
      height: `${fixed(h + sw)}px`,
      transform: `${transform} translate(${fixed(g.x - w / 2 - sw / 2 + dx)}px, ${fixed(g.y - h / 2 - sw / 2 + dy)}px)`,
      borderRadius: r > 0 ? `${fixed(r + sw / 2)}px` : '0',
      background: fill,
      backgroundClip: 'padding-box',
      border: sw > 0 ? `${fixed(sw)}px solid ${border}` : 'none',
      opacity: fixed(opacity),
    });
    shadowList(paints(node) ? node.shadow : undefined).forEach((shadow, i) => {
      const shadowBox = slot.shadowBoxes[i];
      if (!shadowBox) return;
      Object.assign(shadowBox.style, {
        boxSizing: 'border-box',
        ...boxStyle(shadow.x, shadow.y, node.fill ? shadow.color : 'transparent', shadow.color),
        filter: shadow.blur ? `blur(${fixed(shadow.blur / 2)}px)` : 'none',
      });
    });
    Object.assign(
      slot.box.style,
      boxStyle(
        0,
        0,
        typeof node.fill === 'string' ? node.fill : 'transparent',
        node.stroke?.color ?? 'transparent',
      ),
    );
  };

  const updateText = (slot: DomSlot, node: TextNode, local: Matrix, opacity: number) => {
    const { layout } = text.layout(node);
    slot.content.style.transform = matrixString(local);
    const write = (elements: HTMLElement[], color: string, dx: number, dy: number, blur = 0) =>
      layout.lines.forEach((line, i) => {
        const element = elements[i];
        if (!element) return;
        element.textContent = line.text;
        Object.assign(element.style, {
          transform: `translate(${fixed(line.x + dx)}px, ${fixed(line.y + dy)}px)`,
          font: fontString(node.font),
          lineHeight: `${fixed(layout.lineHeight)}px`,
          height: `${fixed(layout.lineHeight)}px`,
          letterSpacing: `${node.font.letterSpacing ?? 0}px`,
          color,
          filter: blur ? `blur(${fixed(blur / 2)}px)` : 'none',
          opacity: fixed(opacity),
        });
      });
    shadowList(node.shadow).forEach((shadow, i) => {
      write(slot.lineShadows[i] ?? [], shadow.color, shadow.x, shadow.y, shadow.blur);
    });
    write(slot.lines, node.fill ?? '#000', 0, 0);
  };

  return {
    kind: 'dom',
    element: root,
    render(scene: Scene) {
      slots.sync(
        flattenScene(scene),
        (item) => item.node.id,
        signatureOf,
        build,
        (slot, item) => {
          // Clip wrappers: each is placed in its clip's space; the content is
          // then placed relative to the innermost clip.
          let parent: Matrix = IDENTITY;
          let visible = true;
          item.clips.forEach((clip, i) => {
            const wrapper = slot.wrappers[i];
            if (!wrapper) return;
            try {
              wrapper.style.transform = matrixString(multiply(invert(parent), clip.matrix));
              wrapper.style.clipPath = `path("${geometryToPath(clip.geometry)}")`;
              parent = clip.matrix;
            } catch {
              visible = false; // a singular clip (zero scale) shows nothing
            }
          });
          slot.root.style.display = visible ? '' : 'none';
          if (!visible) return;
          const local = multiply(invert(parent), item.matrix);
          const { node } = item;
          if (node.type === 'text') updateText(slot, node, local, item.opacity);
          else if (slot.mode === 'rect') updateRect(slot, node, local, item.opacity);
          else if (slot.svgParts)
            updateSvgShape(slot.svgParts, node, matrixString(local), item.opacity);
        },
      );
    },
    destroy() {
      slots.clear();
      root.remove();
    },
  };
}
