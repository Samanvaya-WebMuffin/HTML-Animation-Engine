import {
  flattenScene,
  fontString,
  geometryToPath,
  type Geometry,
  type Matrix,
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

  const drawShape = (node: ShapeNode, matrix: Matrix, opacity: number) => {
    const path = path2d(node.geometry);
    if (node.shadow && node.fill) {
      context.save();
      context.translate(node.shadow.x, node.shadow.y);
      if (node.shadow.blur) {
        context.filter = `blur(${(node.shadow.blur / 2) * matrixScale(matrix) * pixelRatio}px)`;
      }
      context.globalAlpha = opacity;
      context.fillStyle = node.shadow.color;
      context.fill(path);
      context.restore();
    }
    if (node.fill) {
      context.globalAlpha = opacity;
      context.fillStyle = node.fill;
      context.fill(path);
    }
    if (node.stroke && node.stroke.width > 0) {
      const { stroke } = node;
      context.globalAlpha = opacity;
      context.strokeStyle = stroke.color;
      context.lineWidth = stroke.width;
      context.lineCap = stroke.cap ?? 'butt';
      context.lineJoin = stroke.join ?? 'miter';
      context.setLineDash(stroke.dash ? [...stroke.dash] : []);
      context.lineDashOffset = stroke.dashOffset ?? 0;
      context.stroke(path);
    }
  };

  const drawText = (node: TextNode, opacity: number) => {
    const { layout, baseline } = text.layout(node);
    context.globalAlpha = opacity;
    context.font = fontString(node.font);
    context.letterSpacing = `${node.font.letterSpacing ?? 0}px`;
    context.fillStyle = node.fill ?? '#000';
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    for (const line of layout.lines) context.fillText(line.text, line.x, line.y + baseline);
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
        else drawText(item.node, item.opacity);
        context.restore();
      }
    },
    destroy() {
      canvas.remove();
    },
  };
}
