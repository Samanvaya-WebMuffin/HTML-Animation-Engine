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
  /** Builds the frame at `t`. Must be a pure function of `t` (and state). */
  scene(t: number, ctx: RenderContext, state: State): SceneContent;
}

/**
 * A composition described as a scene per frame. The renderer, and whatever
 * `setup` returns, are kept per mounted root, so the same composition can be
 * mounted more than once (e.g. playground and capture).
 */
export function defineSceneComposition<State = undefined>(
  options: SceneCompositionOptions<State>,
): Composition {
  const { renderer: kind, setup, scene, ...meta } = options;
  const mounted = new WeakMap<HTMLElement, { renderer: Renderer; state: State }>();
  return defineComposition({
    ...meta,
    async setup(ctx) {
      const renderer = createRenderer(kind, ctx.root, {
        width: meta.width,
        height: meta.height,
        pixelRatio: ctx.pixelRatio,
        background: meta.background,
      });
      const state = (await setup?.(ctx)) as State;
      mounted.set(ctx.root, { renderer, state });
    },
    render(t, ctx) {
      const entry = mounted.get(ctx.root);
      if (!entry) throw new Error(`Composition "${meta.id}" rendered before setup.`);
      entry.renderer.render({
        width: meta.width,
        height: meta.height,
        ...scene(t, ctx, entry.state),
      });
    },
    teardown(ctx) {
      mounted.get(ctx.root)?.renderer.destroy();
      mounted.delete(ctx.root);
    },
  });
}
