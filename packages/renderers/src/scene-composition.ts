import {
  defineComposition,
  type Camera,
  type Composition,
  type RenderContext,
  type SceneNode,
  type SetupContext,
} from '@html-animation-engine/core';
import { createRenderer } from './create.js';
import type { Renderer, RendererKind } from './renderer.js';
import { createShaderLayer, type ShaderLayer, type Uniforms } from './shader.js';

/** What a scene composition returns for each frame. */
export interface SceneContent {
  readonly camera?: Camera;
  readonly world: readonly SceneNode[];
  readonly screen?: readonly SceneNode[];
}

export interface SceneCompositionOptions<State> extends Omit<
  Composition,
  'setup' | 'render' | 'teardown'
> {
  /** Which renderer draws the scene. */
  readonly renderer: RendererKind;
  /**
   * One-off preparation after fonts have loaded: create effects, measure
   * text. The returned state is passed to every `scene` call.
   */
  setup?(ctx: SetupContext): State | Promise<State>;
  /** Builds the frame at `t`. Must be a pure function of `t` (and state). Default: empty. */
  scene?(t: number, ctx: RenderContext, state: State): SceneContent;
  /**
   * Optional WebGL2 shader drawn beneath the scene (it paints the
   * background). `uniforms` must be a pure function of `t` (and state).
   */
  readonly shader?: {
    readonly fragment: string;
    uniforms(t: number, ctx: RenderContext, state: State): Uniforms;
  };
}

/**
 * A composition described as a scene per frame. The renderer, and whatever
 * `setup` returns, are kept per mounted root, so the same composition can be
 * mounted more than once (e.g. playground and capture).
 */
export function defineSceneComposition<State = undefined>(
  options: SceneCompositionOptions<State>,
): Composition {
  const { renderer: kind, setup, scene, shader, ...meta } = options;
  interface Mounted {
    renderer: Renderer;
    shader: ShaderLayer | undefined;
    state: State;
  }
  const mounted = new WeakMap<HTMLElement, Mounted>();
  return defineComposition({
    ...meta,
    async setup(ctx) {
      const size = { width: meta.width, height: meta.height, pixelRatio: ctx.pixelRatio };
      // A shader paints the background; the scene renderer above it stays transparent.
      const shaderLayer = shader
        ? createShaderLayer(ctx.root, { ...size, fragment: shader.fragment })
        : undefined;
      const renderer = createRenderer(kind, ctx.root, {
        ...size,
        ...(shaderLayer ? {} : { background: meta.background }),
      });
      const state = (await setup?.(ctx)) as State;
      mounted.set(ctx.root, { renderer, shader: shaderLayer, state });
    },
    render(t, ctx) {
      const entry = mounted.get(ctx.root);
      if (!entry) throw new Error(`Composition "${meta.id}" rendered before setup.`);
      if (shader && entry.shader) entry.shader.render(shader.uniforms(t, ctx, entry.state));
      const content = scene?.(t, ctx, entry.state) ?? { world: [] };
      entry.renderer.render({ width: meta.width, height: meta.height, ...content });
    },
    teardown(ctx) {
      const entry = mounted.get(ctx.root);
      entry?.shader?.destroy();
      entry?.renderer.destroy();
      mounted.delete(ctx.root);
    },
  });
}
