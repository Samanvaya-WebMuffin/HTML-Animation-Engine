import {
  effectiveRadius,
  flattenScene,
  fontString,
  geometryToPath,
  IDENTITY,
  invert,
  multiply,
  type DrawItem,
  type Matrix,
  type Scene,
  type ShapeNode,
  type TextNode,
} from '@html-animation-engine/core';
import { fixed, matrixString, type Renderer, type RendererOptions } from './renderer.js';
import { Slots } from './slots.js';
import { createSvgShadow, SVG_NS, updateSvgShape, type SvgShapeParts } from './svg.js';
import { TextLayouter } from './text.js';

let instances = 0;

type Mode = 'rect' | 'svg' | 'text';

interface DomSlot {
  readonly root: HTMLElement;
  readonly signature: string;
  readonly mode: Mode;
  readonly wrappers: HTMLElement[];
  readonly content: HTMLElement;
  readonly shadowBox?: HTMLElement;
  readonly box?: HTMLElement;
  readonly svgParts?: SvgShapeParts;
  readonly lines: HTMLElement[];
}

function modeOf(node: ShapeNode | TextNode): Mode {
  if (node.type === 'text') return 'text';
  const dashed = Boolean(node.stroke?.dash?.length);
  return node.geometry.kind === 'rect' && !dashed ? 'rect' : 'svg';
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
        ? text.layout(node).layout.lines.length
        : node.shadow && node.fill
          ? node.shadow.blur
            ? 'blur'
            : 'hard'
          : 'none';
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
      lines: [],
    };

    if (node.type === 'text') {
      const lines = text.layout(node).layout.lines.map(() => {
        const line = positioned();
        line.style.whiteSpace = 'pre';
        content.append(line);
        return line;
      });
      return { ...base, lines };
    }
    if (mode === 'rect') {
      let shadowBox: HTMLElement | undefined;
      if (node.shadow && node.fill) {
        shadowBox = positioned();
        content.append(shadowBox);
      }
      const box = positioned();
      box.style.boxSizing = 'border-box';
      content.append(box);
      return { ...base, box, ...(shadowBox ? { shadowBox } : {}) };
    }
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', overflow: 'visible' });
    const defs = doc.createElementNS(SVG_NS, 'defs');
    svg.append(defs);
    let parts: SvgShapeParts = {};
    if (node.shadow && node.fill) {
      const shadow = createSvgShadow(doc, defs, `${prefix}-${key}-blur`, Boolean(node.shadow.blur));
      svg.append(shadow.shadow);
      parts = { shadow: shadow.shadow, ...(shadow.blur ? { blur: shadow.blur } : {}) };
    }
    const shape = doc.createElementNS(SVG_NS, 'path');
    svg.append(shape);
    content.append(svg);
    return { ...base, svgParts: { ...parts, shape } };
  };

  const updateRect = (slot: DomSlot, node: ShapeNode, local: Matrix, opacity: number) => {
    const g = node.geometry;
    if (g.kind !== 'rect' || !slot.box) return;
    const w = Math.abs(g.width);
    const h = Math.abs(g.height);
    const r = effectiveRadius(g);
    const sw = node.stroke && node.stroke.width > 0 ? node.stroke.width : 0;
    const transform = matrixString(local);
    if (slot.shadowBox && node.shadow) {
      Object.assign(slot.shadowBox.style, {
        width: `${fixed(w)}px`,
        height: `${fixed(h)}px`,
        transform: `${transform} translate(${fixed(g.x - w / 2 + node.shadow.x)}px, ${fixed(g.y - h / 2 + node.shadow.y)}px)`,
        borderRadius: `${fixed(r)}px`,
        background: node.shadow.color,
        filter: node.shadow.blur ? `blur(${fixed(node.shadow.blur / 2)}px)` : 'none',
        opacity: fixed(opacity),
      });
    }
    Object.assign(slot.box.style, {
      width: `${fixed(w + sw)}px`,
      height: `${fixed(h + sw)}px`,
      transform: `${transform} translate(${fixed(g.x - w / 2 - sw / 2)}px, ${fixed(g.y - h / 2 - sw / 2)}px)`,
      borderRadius: r > 0 ? `${fixed(r + sw / 2)}px` : '0',
      background: node.fill ?? 'transparent',
      backgroundClip: 'padding-box',
      border: sw > 0 && node.stroke ? `${fixed(sw)}px solid ${node.stroke.color}` : 'none',
      opacity: fixed(opacity),
    });
  };

  const updateText = (slot: DomSlot, node: TextNode, local: Matrix, opacity: number) => {
    const { layout } = text.layout(node);
    slot.content.style.transform = matrixString(local);
    layout.lines.forEach((line, i) => {
      const element = slot.lines[i];
      if (!element) return;
      element.textContent = line.text;
      Object.assign(element.style, {
        transform: `translate(${fixed(line.x)}px, ${fixed(line.y)}px)`,
        font: fontString(node.font),
        lineHeight: `${fixed(layout.lineHeight)}px`,
        height: `${fixed(layout.lineHeight)}px`,
        letterSpacing: `${node.font.letterSpacing ?? 0}px`,
        color: node.fill ?? '#000',
        opacity: fixed(opacity),
      });
    });
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
