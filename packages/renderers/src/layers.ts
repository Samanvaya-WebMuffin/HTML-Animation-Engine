import {
  applyMatrix,
  geometryBounds,
  shadowList,
  type BlurLayer,
  type DrawItem,
  type Shadows,
} from '@html-animation-engine/core';
import type { TextLayouter } from './text.js';

/** An axis-aligned box. */
export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** A filter region: top-left corner and size. */
export interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How far shadows reach beyond a box (offset plus 3σ of blur). */
function shadowReach(shadow: Shadows | undefined): number {
  let reach = 0;
  for (const s of shadowList(shadow)) {
    reach = Math.max(reach, Math.max(Math.abs(s.x), Math.abs(s.y)) + 1.5 * (s.blur ?? 0));
  }
  return reach;
}

/** Screen bounds of everything an item paints (stroke and shadows included). */
export function itemBounds(item: DrawItem, text: TextLayouter): Bounds {
  const { node } = item;
  let local: Bounds;
  let pad = 0;
  if (node.type === 'shape') {
    local = geometryBounds(node.geometry);
    pad = (node.stroke?.width ?? 0) / 2 + (node.fill ? shadowReach(node.shadow) : 0);
  } else if (node.type === 'text') {
    const { layout } = text.layout(node);
    const xs = layout.lines.flatMap((line) => [line.x, line.x + line.width]);
    local = {
      minX: Math.min(0, ...xs),
      minY: 0,
      maxX: Math.max(0, ...xs),
      maxY: layout.height,
    };
    pad = shadowReach(node.shadow) + node.font.size * 0.25;
  } else {
    local = {
      minX: -node.width / 2,
      minY: -node.height / 2,
      maxX: node.width / 2,
      maxY: node.height / 2,
    };
  }
  const corners = [
    { x: local.minX - pad, y: local.minY - pad },
    { x: local.maxX + pad, y: local.minY - pad },
    { x: local.maxX + pad, y: local.maxY + pad },
    { x: local.minX - pad, y: local.maxY + pad },
  ].map((p) => applyMatrix(item.matrix, p));
  return boxOf(corners);
}

function boxOf(points: readonly { x: number; y: number }[]): Bounds {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

/** For each blurred layer, the screen bounds of everything painted into it. */
export function layerBounds(items: readonly DrawItem[], text: TextLayouter): Map<string, Bounds> {
  const out = new Map<string, Bounds>();
  for (const item of items) {
    if (item.layers.length === 0) continue;
    const b = itemBounds(item, text);
    for (const layer of item.layers) {
      const prev = out.get(layer.id);
      out.set(
        layer.id,
        prev
          ? {
              minX: Math.min(prev.minX, b.minX),
              minY: Math.min(prev.minY, b.minY),
              maxX: Math.max(prev.maxX, b.maxX),
              maxY: Math.max(prev.maxY, b.maxY),
            }
          : b,
      );
    }
  }
  return out;
}

/** 3σ of the layer's widest blur, plus a pixel. */
export function blurPad(layer: BlurLayer): number {
  return 3 * Math.max(layer.x, layer.y) + 1;
}

/**
 * The region to blur, in the layer container's space (screen space turned by
 * −angle): the layer's bounds, kept within the frame (plus the blur's reach,
 * so content just outside still bleeds in), widened by the blur's reach.
 */
export function layerRegion(
  bounds: Bounds,
  layer: BlurLayer,
  frame: { width: number; height: number },
): Region {
  const pad = blurPad(layer);
  const clipped = {
    minX: Math.max(bounds.minX, -pad),
    minY: Math.max(bounds.minY, -pad),
    maxX: Math.min(bounds.maxX, frame.width + pad),
    maxY: Math.min(bounds.maxY, frame.height + pad),
  };
  if (clipped.maxX <= clipped.minX || clipped.maxY <= clipped.minY) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const r = (-layer.angle * Math.PI) / 180;
  const [cos, sin] = [Math.cos(r), Math.sin(r)];
  const turned = boxOf(
    [
      [clipped.minX, clipped.minY],
      [clipped.maxX, clipped.minY],
      [clipped.maxX, clipped.maxY],
      [clipped.minX, clipped.maxY],
    ].map(([x = 0, y = 0]) => ({ x: x * cos - y * sin, y: x * sin + y * cos })),
  );
  return {
    x: turned.minX - pad,
    y: turned.minY - pad,
    width: turned.maxX - turned.minX + 2 * pad,
    height: turned.maxY - turned.minY + 2 * pad,
  };
}

/** Number of leading layers two stacks share. */
export function sharedLayers(a: readonly BlurLayer[], b: readonly BlurLayer[]): number {
  let k = 0;
  while (k < a.length && k < b.length && a[k]?.id === b[k]?.id) k++;
  return k;
}
