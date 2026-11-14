import {
  compositionSeed,
  defineComposition,
  timeToFrame,
  type Composition,
  type FontSource,
  type FontSpec,
  type SetupContext,
  type SoundEvent,
  type Soundtrack,
} from '@html-animation-engine/core';

export interface SequenceOptions {
  readonly id: string;
  readonly title?: string;
  /** Scenes in order; each starts where the previous one ends. Same size and fps. */
  readonly scenes: readonly Composition[];
  /**
   * Music under the whole video, timed from its start (mixed with every
   * scene's own soundtrack). Its reverb is used if no scene sets one.
   */
  readonly music?: Soundtrack;
}

/** A scene's place in a sequence (for chapter lists and progress-bar markers). */
export interface SceneMark {
  readonly id: string;
  readonly title: string;
  readonly start: number;
  readonly duration: number;
}

/** A sequence: a composition that also lists its scenes. */
export interface SequenceComposition extends Composition {
  readonly scenes: readonly SceneMark[];
}

/** True for a composition made by `defineSequence`. */
export function isSequence(composition: Composition): composition is SequenceComposition {
  return Array.isArray((composition as Partial<SequenceComposition>).scenes);
}

/** Where each scene starts within the sequence, in seconds. */
export function sceneStarts(scenes: readonly Composition[]): number[] {
  let t = 0;
  return scenes.map((scene) => {
    const start = t;
    t += scene.duration;
    return start;
  });
}

/** The scene playing at `t`, and the time within it. The last scene holds its end. */
export function sceneAt(
  scenes: readonly Composition[],
  t: number,
): { readonly index: number; readonly local: number } {
  const starts = sceneStarts(scenes);
  for (let i = scenes.length - 1; i >= 0; i--) {
    const start = starts[i] ?? 0;
    if (t >= start) return { index: i, local: t - start };
  }
  return { index: 0, local: t };
}

/**
 * Plays scenes back to back as one composition (a whole video). Each scene
 * is mounted in its own layer, keeps its own seed, and is rendered at its
 * own local time, so every frame is exactly what that scene draws on its
 * own; only the scene playing is shown. Soundtracks are merged with each
 * scene's start added, so sounds ring on across a cut.
 */
export function defineSequence(options: SequenceOptions): SequenceComposition {
  const { scenes } = options;
  const first = scenes[0];
  if (!first) throw new Error(`Sequence "${options.id}" has no scenes.`);
  for (const scene of scenes) {
    if (scene.width !== first.width || scene.height !== first.height || scene.fps !== first.fps) {
      throw new Error(
        `Sequence "${options.id}": scene "${scene.id}" is ${scene.width}×${scene.height} at ` +
          `${scene.fps} fps; every scene must match "${first.id}".`,
      );
    }
  }
  const starts = sceneStarts(scenes);
  const unique = <T>(items: readonly T[], key: (item: T) => string) => [
    ...new Map(items.map((item) => [key(item), item])).values(),
  ];
  const fontFaces = unique<FontSource>(
    scenes.flatMap((s) => s.fontFaces ?? []),
    (f) => `${f.family}|${f.src}|${f.weight ?? ''}|${f.style ?? ''}`,
  );
  const fonts = unique<FontSpec>(
    scenes.flatMap((s) => s.fonts ?? []),
    (f) => JSON.stringify(f),
  );
  const tracks = [
    ...scenes.flatMap((s, i) => (s.audio ? [{ track: s.audio, at: starts[i] ?? 0 }] : [])),
    ...(options.music ? [{ track: options.music, at: 0 }] : []),
  ];
  const reverb = tracks.find(({ track }) => track.reverb)?.track.reverb;
  const audio = tracks.length
    ? {
        samples: Object.assign({}, ...tracks.map(({ track }) => track.samples ?? {})) as Record<
          string,
          string
        >,
        events: tracks.flatMap(({ track, at }) =>
          track.events.map((e): SoundEvent => ({ ...e, at: e.at + at })),
        ),
        ...(reverb ? { reverb } : {}),
      }
    : undefined;

  const layers = new WeakMap<HTMLElement, { root: HTMLElement; ctx: SetupContext }[]>();
  const marks: SceneMark[] = scenes.map((scene, i) => ({
    id: scene.id,
    title: scene.title ?? scene.id,
    start: starts[i] ?? 0,
    duration: scene.duration,
  }));
  return defineComposition({
    scenes: marks,
    id: options.id,
    ...(options.title === undefined ? {} : { title: options.title }),
    width: first.width,
    height: first.height,
    fps: first.fps,
    ...(scenes.some((s) => s.fixedFps) ? { fixedFps: true } : {}),
    duration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
    background: first.background,
    fontFaces,
    fonts,
    ...(audio ? { audio } : {}),
    async setup(ctx) {
      const mounted = [];
      for (const scene of scenes) {
        const root = ctx.root.ownerDocument.createElement('div');
        Object.assign(root.style, {
          position: 'absolute',
          inset: '0',
          background: scene.background,
          display: 'none',
        });
        ctx.root.append(root);
        const sceneCtx: SetupContext = { ...ctx, root, seed: compositionSeed(scene) };
        await scene.setup?.(sceneCtx);
        mounted.push({ root, ctx: sceneCtx });
      }
      layers.set(ctx.root, mounted);
    },
    render(t, ctx) {
      const mounted = layers.get(ctx.root);
      if (!mounted) throw new Error(`Sequence "${options.id}" rendered before setup.`);
      const { index, local } = sceneAt(scenes, t);
      mounted.forEach((layer, i) => {
        layer.root.style.display = i === index ? '' : 'none';
      });
      const layer = mounted[index];
      const scene = scenes[index];
      if (!layer || !scene) return;
      scene.render(Math.min(local, scene.duration), {
        ...layer.ctx,
        frame: timeToFrame(local, ctx.fps),
      });
    },
    teardown(ctx) {
      const mounted = layers.get(ctx.root) ?? [];
      scenes.forEach((scene, i) => {
        const layer = mounted[i];
        if (!layer) return;
        scene.teardown?.(layer.ctx);
        layer.root.remove();
      });
      layers.delete(ctx.root);
    },
  });
}
