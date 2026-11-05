// @vitest-environment happy-dom
import {
  circle,
  defaultTheme,
  groupNode,
  pathGeometry,
  rect,
  shapeNode,
  textNode,
  type Scene,
  type SceneNode,
  type TextMeasurer,
} from '@html-animation-engine/core';
import { describe, expect, it } from 'vitest';
import { createDomRenderer, createSvgRenderer } from '../src/index.js';

const { colors } = defaultTheme;
const measurer: TextMeasurer = {
  measure: (text, font) => text.length * font.size * 0.5,
  metrics: (font) => ({ ascent: font.size * 0.8, descent: font.size * 0.2 }),
};
const scene = (world: SceneNode[]): Scene => ({ width: 200, height: 100, world });
const host = () => {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
};

describe.each([
  ['svg', createSvgRenderer],
  ['dom', createDomRenderer],
] as const)('%s renderer', (_kind, create) => {
  it('reuses elements across frames and removes nodes that disappear', () => {
    const renderer = create(host(), { width: 200, height: 100, measurer });
    const a = shapeNode('a', { geometry: rect(10, 10, 10, 10), fill: colors.lime });
    const b = shapeNode('b', { geometry: circle(50, 50, 5), fill: colors.pink });
    renderer.render(scene([a, b]));
    const first = renderer.element.querySelector('[data-hae-id="a"]');
    renderer.render(scene([{ ...a, transform: { x: 20 } }]));
    expect(renderer.element.querySelector('[data-hae-id="a"]')).toBe(first);
    expect(renderer.element.querySelector('[data-hae-id="b"]')).toBeNull();
  });

  it('keeps elements in paint order when z changes', () => {
    const renderer = create(host(), { width: 200, height: 100, measurer });
    const a = shapeNode('a', { geometry: rect(0, 0, 5, 5), fill: colors.lime });
    const b = shapeNode('b', { geometry: rect(0, 0, 5, 5), fill: colors.pink });
    const order = () =>
      [...renderer.element.querySelectorAll('[data-hae-id]')].map((e) =>
        e.getAttribute('data-hae-id'),
      );
    renderer.render(scene([a, b]));
    expect(order()).toEqual(['a', 'b']);
    renderer.render(scene([{ ...a, z: 1 }, b]));
    expect(order()).toEqual(['b', 'a']);
  });

  it('draws one element per line of text', () => {
    const renderer = create(host(), { width: 200, height: 100, measurer });
    renderer.render(
      scene([
        textNode('t', { text: 'one\ntwo', font: { family: 'Test', size: 10 }, fill: colors.ink }),
      ]),
    );
    const slot = renderer.element.querySelector('[data-hae-id="t"]');
    expect(slot?.textContent).toBe('onetwo');
  });

  it('cleans up clip and filter definitions when a node goes away', () => {
    const renderer = create(host(), { width: 200, height: 100, measurer });
    const clipped = groupNode(
      'g',
      [
        shapeNode('s', {
          geometry: pathGeometry('M0 0 L10 0 L10 10 Z'),
          fill: colors.lime,
          shadow: { x: 2, y: 2, blur: 4, color: colors.ink },
        }),
      ],
      { clip: circle(0, 0, 5) },
    );
    renderer.render(scene([clipped]));
    const defsCount = () =>
      renderer.element.ownerDocument.querySelectorAll('clipPath, filter').length;
    expect(defsCount()).toBeGreaterThan(0);
    renderer.render(scene([]));
    expect(defsCount()).toBe(0);
    renderer.destroy();
    expect(renderer.element.isConnected).toBe(false);
  });
});

describe('dom renderer', () => {
  it('draws rectangles as divs with a centred border stroke', () => {
    const renderer = createDomRenderer(host(), { width: 200, height: 100, measurer });
    renderer.render(
      scene([
        shapeNode('r', {
          geometry: rect(50, 50, 40, 20, 4),
          fill: colors.lime,
          stroke: { color: colors.ink, width: 2 },
        }),
      ]),
    );
    const box = renderer.element.querySelector<HTMLElement>('[data-hae-id="r"] > div');
    expect(box?.style.width).toBe('42px'); // 40 + stroke width
    expect(box?.style.borderRadius).toBe('5px'); // 4 + half the stroke
    expect(box?.style.transform).toContain('translate(29px, 39px)'); // 50 - 20 - 1, 50 - 10 - 1
  });
});
