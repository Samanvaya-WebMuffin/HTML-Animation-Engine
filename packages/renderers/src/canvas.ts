import {
  flattenScene,
  fontString,
  geometryToPath,
  shadowList,
  type BlurLayer,
  type Geometry,
  type ImageNode,
  type Matrix,
  type Paint,
  type Shadow,
  type Stroke,
  type Scene,
  type ShapeNode,
  type TextNode,
} from '@html-animation-engine/core';
import { loadedImage } from './images.js';
import { sharedLayers } from './layers.js';
import { fixed, matrixScale, type Renderer, type RendererOptions } from './renderer.js';
import { SVG_NS } from './svg.js';
import { TextLayouter } from './text.js';

let instances = 0;

/** Canvas 2D renderer. Reads back exactly what it draws, for pixel capture. */
export function createCanvasRenderer(host: HTMLElement, options: RendererOptions): Renderer {
  const prefix = `haec${++instances}`;
  const { width, height } = options;
  const pixelRatio = options.pixelRatio ?? 1;
  const doc = host.ownerDocument;
  const canvas = doc.createElement('canvas');
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  Object.assign(canvas.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
  });
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas renderer: Canvas 2D is unavailable.');
  const main = ctx;
  /** Where drawing goes: the main canvas, or the innermost open blurred layer. */
  let context: CanvasRenderingContext2D = main;
  const text = new TextLayouter(options.measurer, doc);
  const paths = new Map<string, Path2D>();

  const path2d = (geometry: Geometry): Path2D => {
    const d = geometryToPath(geometry);
    let path = paths.get(d);
    if (!path) {
      if (paths.size > 2000) paths.clear();
      path = new Path2D(d);
      paths.set(d, path);
    }
    return path;
  };

  const setMatrix = (m: Matrix) =>
    context.setTransform(
      pixelRatio * m[0],
      pixelRatio * m[1],
      pixelRatio * m[2],
      pixelRatio * m[3],
      pixelRatio * m[4],
      pixelRatio * m[5],
    );

  const paint = (fill: Paint): string | CanvasGradient => {
    if (typeof fill === 'string') return fill;
    const gradient =
      fill.type === 'linear'
        ? context.createLinearGradient(fill.x1, fill.y1, fill.x2, fill.y2)
        : context.createRadialGradient(fill.cx, fill.cy, 0, fill.cx, fill.cy, fill.r);
    for (const stop of fill.stops) gradient.addColorStop(clampOffset(stop.offset), stop.color);
    return gradient;
  };

  /** Draws `draw` once per shadow: offset, blurred, in the shadow colour. */
  const drawShadows = (
    shadows: readonly Shadow[],
    matrix: Matrix,
    opacity: number,
    draw: (color: string) => void,
  ) => {
    for (const shadow of shadows) {
      context.save();
      context.translate(shadow.x, shadow.y);
      if (shadow.blur) {
        context.filter = `blur(${(shadow.blur / 2) * matrixScale(matrix) * pixelRatio}px)`;
      }
      context.globalAlpha = opacity;
      draw(shadow.color);
      context.restore();
    }
  };

  const setStroke = (stroke: Stroke, color: string) => {
    context.strokeStyle = color;
    context.lineWidth = stroke.width;
    context.lineCap = stroke.cap ?? 'butt';
    context.lineJoin = stroke.join ?? 'miter';
    context.setLineDash(stroke.dash ? [...stroke.dash] : []);
    context.lineDashOffset = stroke.dashOffset ?? 0;
  };

  const drawShape = (node: ShapeNode, matrix: Matrix, opacity: number) => {
    const path = path2d(node.geometry);
    const stroke = node.stroke && node.stroke.width > 0 ? node.stroke : undefined;
    // A shadow is a copy of everything the shape paints: fill and stroke.
    drawShadows(shadowList(node.shadow), matrix, opacity, (color) => {
      if (node.fill) {
        context.fillStyle = color;
        context.fill(path);
      }
      if (stroke) {
        setStroke(stroke, color);
        context.stroke(path);
      }
    });
    context.globalAlpha = opacity;
    if (node.fill) {
      context.fillStyle = paint(node.fill);
      context.fill(path);
    }
    if (stroke) {
      setStroke(stroke, stroke.color);
      context.stroke(path);
    }
  };

  const drawText = (node: TextNode, matrix: Matrix, opacity: number) => {
    const { layout, baseline } = text.layout(node);
    context.font = fontString(node.font);
    context.letterSpacing = `${node.font.letterSpacing ?? 0}px`;
    // Exact font sizes, as in the SVG and DOM renderers (see svg.ts).
    context.textRendering = 'geometricPrecision';
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    const lines = (color: string) => {
      context.fillStyle = color;
      for (const line of layout.lines) context.fillText(line.text, line.x, line.y + baseline);
    };
    drawShadows(shadowList(node.shadow), matrix, opacity, lines);
    context.globalAlpha = opacity;
    lines(node.fill ?? '#000');
  };

  const drawImage = (node: ImageNode, opacity: number) => {
    context.globalAlpha = opacity;
    context.drawImage(
      loadedImage(node.src),
      -node.width / 2,
      -node.height / 2,
      node.width,
      node.height,
    );
  };

  // Blurred layers: each is drawn into its own offscreen canvas (pooled by
  // depth), then blurred once onto the layer beneath when it closes.
  const pool: CanvasRenderingContext2D[] = [];
  const offscreen = (index: number, side?: number): CanvasRenderingContext2D => {
    const w = side ?? canvas.width;
    const h = side ?? canvas.height;
    let c = pool[index];
    if (!c || c.canvas.width !== w || c.canvas.height !== h) {
      const element = doc.createElement('canvas');
      element.width = w;
      element.height = h;
      const created = element.getContext('2d');
      if (!created) throw new Error('Canvas renderer: Canvas 2D is unavailable.');
      c = created;
      pool[index] = c;
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.filter = 'none';
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    return c;
  };
  // Uneven blurs use an SVG filter (the same `feGaussianBlur` the SVG renderer uses).
  let filterSvg: SVGSVGElement | undefined;
  const filters = new Map<string, string>();
  const unevenFilter = (sx: number, sy: number): string => {
    const key = `${fixed(sx, 3)} ${fixed(sy, 3)}`;
    let id = filters.get(key);
    if (!id) {
      if (!filterSvg) {
        filterSvg = doc.createElementNS(SVG_NS, 'svg');
        Object.assign(filterSvg.style, { position: 'absolute', width: '0', height: '0' });
        host.append(filterSvg);
      }
      id = `${prefix}-blur${filters.size}`;
      const filter = doc.createElementNS(SVG_NS, 'filter');
      filter.id = id;
      // The default region (the drawn canvas plus 10% each side) covers the frame.
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      const blur = doc.createElementNS(SVG_NS, 'feGaussianBlur');
      blur.setAttribute('stdDeviation', key);
      filter.append(blur);
      filterSvg.append(filter);
      filters.set(key, id);
    }
    return `url(#${id})`;
  };
  const blurFilter = (sx: number, sy: number) =>
    Math.abs(sx - sy) < 1e-6 ? `blur(${sx}px)` : unevenFilter(sx, sy);

  /** Blurs a finished layer onto `target`. */
  const composite = (
    layer: BlurLayer,
    source: CanvasRenderingContext2D,
    target: CanvasRenderingContext2D,
    depth: number,
  ) => {
    const sx = layer.x * pixelRatio;
    const sy = layer.y * pixelRatio;
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalAlpha = 1;
    if (layer.angle === 0) {
      target.filter = blurFilter(sx, sy);
      target.drawImage(source.canvas, 0, 0);
    } else {
      // Turn the layer so the blur's axes line up with the canvas, blur, turn back.
      // The turned copies are as wide as the frame's diagonal, so no corner is cut off.
      const [w, h] = [canvas.width, canvas.height];
      const side = Math.ceil(Math.hypot(w, h));
      const turned = offscreen(depth + 1, side);
      const blurred = offscreen(depth + 2, side);
      const r = (layer.angle * Math.PI) / 180;
      turned.setTransform(
        Math.cos(-r),
        Math.sin(-r),
        -Math.sin(-r),
        Math.cos(-r),
        side / 2,
        side / 2,
      );
      turned.drawImage(source.canvas, -w / 2, -h / 2);
      blurred.filter = blurFilter(sx, sy);
      blurred.drawImage(turned.canvas, 0, 0);
      target.setTransform(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), w / 2, h / 2);
      target.drawImage(blurred.canvas, -side / 2, -side / 2);
    }
    target.restore();
  };

  return {
    kind: 'canvas',
    element: canvas,
    render(scene: Scene) {
      context = main;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.filter = 'none';
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (options.background && options.background !== 'transparent') {
        context.fillStyle = options.background;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      // Open layers, innermost last; layer k draws into pool slot 3k (two spare slots for turning).
      const open: { layer: BlurLayer; ctx: CanvasRenderingContext2D }[] = [];
      const close = () => {
        const done = open.pop();
        if (!done) return;
        const target = open.at(-1)?.ctx ?? main;
        composite(done.layer, done.ctx, target, open.length * 3);
      };
      for (const item of flattenScene(scene)) {
        const keep = sharedLayers(
          open.map((o) => o.layer),
          item.layers,
        );
        while (open.length > keep) close();
        for (let k = keep; k < item.layers.length; k++) {
          const layer = item.layers[k];
          if (layer) open.push({ layer, ctx: offscreen(k * 3) });
        }
        context = open.at(-1)?.ctx ?? main;
        context.save();
        for (const clip of item.clips) {
          setMatrix(clip.matrix);
          context.clip(path2d(clip.geometry));
        }
        setMatrix(item.matrix);
        if (item.node.type === 'shape') drawShape(item.node, item.matrix, item.opacity);
        else if (item.node.type === 'text') drawText(item.node, item.matrix, item.opacity);
        else drawImage(item.node, item.opacity);
        context.restore();
      }
      while (open.length) close();
      context = main;
    },
    destroy() {
      canvas.remove();
    },
  };
}

function clampOffset(offset: number): number {
  return Math.min(Math.max(offset, 0), 1);
}
