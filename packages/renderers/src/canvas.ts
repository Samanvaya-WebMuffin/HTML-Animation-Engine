import {
  flattenScene,
  fontString,
  geometryToPath,
  shadowList,
  type Geometry,
  type Matrix,
  type Paint,
  type Shadow,
  type Stroke,
  type Scene,
  type ShapeNode,
  type TextNode,
} from '@html-animation-engine/core';
import { matrixScale, type Renderer, type RendererOptions } from './renderer.js';
import { TextLayouter } from './text.js';

/** Canvas 2D renderer. Reads back exactly what it draws, for pixel capture. */
export function createCanvasRenderer(host: HTMLElement, options: RendererOptions): Renderer {
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
  const context = ctx;
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

  return {
    kind: 'canvas',
    element: canvas,
    render(scene: Scene) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.filter = 'none';
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (options.background && options.background !== 'transparent') {
        context.fillStyle = options.background;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      for (const item of flattenScene(scene)) {
        context.save();
        for (const clip of item.clips) {
          setMatrix(clip.matrix);
          context.clip(path2d(clip.geometry));
        }
        setMatrix(item.matrix);
        if (item.node.type === 'shape') drawShape(item.node, item.matrix, item.opacity);
        else drawText(item.node, item.matrix, item.opacity);
        context.restore();
      }
    },
    destroy() {
      canvas.remove();
    },
  };
}

function clampOffset(offset: number): number {
  return Math.min(Math.max(offset, 0), 1);
}
