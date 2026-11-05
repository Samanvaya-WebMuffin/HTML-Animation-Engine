/**
 * Remotion bridge, both ways.
 *
 * - Engine → Remotion: `<HaeComposition composition={…} />` draws an
 *   HTML-Animation-Engine composition inside any Remotion composition at
 *   t = useCurrentFrame() / fps. `remotionCompositionProps()` gives the props
 *   for a Remotion `<Composition>`.
 * - Remotion → Engine: `fromRemotion({ component, … })` wraps Remotion-style
 *   React code (useCurrentFrame, interpolate, spring, Sequence, …) as an
 *   engine composition, rendered frame-exactly through `@remotion/player`'s
 *   `<Thumbnail frameToDisplay>`.
 *
 * Both directions seek: nothing runs on Remotion's or React's own clock.
 */
import {
  defineComposition,
  frameCount,
  timeToFrame,
  type Composition,
  type FontSource,
  type FontSpec,
  type Seed,
} from '@html-animation-engine/core';
import { mountStage, type Stage } from '@html-animation-engine/renderers';
import { Thumbnail } from '@remotion/player';
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

// ---------------------------------------------------------------------------
// Readiness: lets `fromRemotion` wait for asynchronous work (such as a nested
// engine composition mounting) before its first frame, so no frame is blank.
// Inside a real Remotion render, `delayRender` does the same job.
// ---------------------------------------------------------------------------

interface ReadyTracker {
  track(work: Promise<unknown>): void;
}

const ReadyContext = createContext<ReadyTracker | null>(null);

function createTracker(): ReadyTracker & { settled(): Promise<void> } {
  const pending = new Set<Promise<unknown>>();
  return {
    track(work) {
      pending.add(work);
    },
    async settled() {
      // New work may be registered while earlier work settles; drain until empty.
      while (pending.size > 0) {
        const batch = [...pending];
        await Promise.all(batch);
        for (const work of batch) pending.delete(work);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Engine → Remotion
// ---------------------------------------------------------------------------

export interface HaeCompositionProps {
  readonly composition: Composition;
  /** Canvas backing-store scale. Default 1. */
  readonly pixelRatio?: number;
}

/**
 * Draws an engine composition inside Remotion at t = frame / fps. The
 * composition is scaled to fit the Remotion video if the sizes differ.
 * Rendering is held with `delayRender` until fonts load and `setup` finishes.
 */
export function HaeComposition({ composition, pixelRatio = 1 }: HaeCompositionProps): ReactNode {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const host = useRef<HTMLDivElement>(null);
  const tracker = useContext(ReadyContext);
  const [stage, setStage] = useState<Stage | null>(null);
  const [handle] = useState(() => delayRender(`Mounting composition "${composition.id}"`));

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false;
    let mounted: Stage | undefined;
    const work = mountStage(element, composition, { fps, pixelRatio }).then(
      (result) => {
        if (cancelled) {
          result.destroy();
          return;
        }
        mounted = result;
        setStage(result);
        continueRender(handle);
      },
      (error: unknown) => cancelRender(error),
    );
    tracker?.track(work);
    return () => {
      cancelled = true;
      mounted?.destroy();
    };
  }, [composition, fps, pixelRatio, handle, tracker]);

  // Layout effect: the frame is drawn before Remotion (or the browser) paints.
  useLayoutEffect(() => {
    stage?.render(frame / fps);
  }, [stage, frame, fps]);

  const scale = Math.min(width / composition.width, height / composition.height);
  return (
    <AbsoluteFill style={{ background: composition.background, overflow: 'hidden' }}>
      <div
        ref={host}
        style={{
          position: 'absolute',
          left: (width - composition.width * scale) / 2,
          top: (height - composition.height * scale) / 2,
          width: composition.width,
          height: composition.height,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: '0 0',
        }}
      />
    </AbsoluteFill>
  );
}

/**
 * Props for a Remotion `<Composition>` that plays an engine composition:
 *
 *   <Composition {...remotionCompositionProps(myComposition)} />
 */
export function remotionCompositionProps(composition: Composition): {
  id: string;
  component: ComponentType<Record<string, unknown>>;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
} {
  const Component = () => <HaeComposition composition={composition} />;
  Component.displayName = `Hae(${composition.id})`;
  return {
    id: composition.id,
    component: Component,
    durationInFrames: frameCount(composition.duration, composition.fps),
    fps: composition.fps,
    width: composition.width,
    height: composition.height,
  };
}

// ---------------------------------------------------------------------------
// Remotion → Engine
// ---------------------------------------------------------------------------

export interface FromRemotionOptions<Props extends Record<string, unknown>> {
  readonly id: string;
  readonly title?: string;
  /** A Remotion-style component: draws from useCurrentFrame() alone. */
  readonly component: ComponentType<Props>;
  readonly inputProps?: Props;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationInFrames: number;
  /** Shown behind the component. Default transparent. */
  readonly background?: string;
  readonly seed?: Seed;
  readonly fontFaces?: readonly FontSource[];
  readonly fonts?: readonly FontSpec[];
}

/**
 * Wraps Remotion-style React code as an engine composition. Each `render(t)`
 * shows frame `floor(t × fps)` synchronously (React `flushSync`), so the
 * frame is complete when `render` returns.
 *
 * Supported: code driven by `useCurrentFrame()` (interpolate, spring,
 * Sequence, Series, AbsoluteFill, Easing, interpolateColors). Not supported:
 * `<Video>`/`<Audio>`/`<OffthreadVideo>` and assets that load asynchronously
 * after `setup`; preload such assets yourself.
 */
export function fromRemotion<Props extends Record<string, unknown> = Record<string, never>>(
  options: FromRemotionOptions<Props>,
): Composition {
  const { component, inputProps, durationInFrames, fps, width, height } = options;
  const roots = new WeakMap<HTMLElement, { root: Root; tracker: ReadyTracker }>();

  const draw = (root: Root, tracker: ReadyTracker, frame: number) => {
    const thumbnail = (
      <Thumbnail
        // Remotion's prop types depend on whether the component has props;
        // the options type above already keeps component and inputProps in step.
        {...({ component, inputProps } as unknown as {
          component: ComponentType<Record<string, unknown>>;
        })}
        compositionWidth={width}
        compositionHeight={height}
        durationInFrames={durationInFrames}
        fps={fps}
        frameToDisplay={frame}
        noSuspense
        style={{ width, height }}
      />
    );
    flushSync(() =>
      root.render(<ReadyContext.Provider value={tracker}>{thumbnail}</ReadyContext.Provider>),
    );
  };

  return defineComposition({
    id: options.id,
    ...(options.title === undefined ? {} : { title: options.title }),
    width,
    height,
    fps,
    duration: durationInFrames / fps,
    background: options.background ?? 'transparent',
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    ...(options.fontFaces ? { fontFaces: options.fontFaces } : {}),
    ...(options.fonts ? { fonts: options.fonts } : {}),
    async setup(ctx) {
      const container = ctx.root.ownerDocument.createElement('div');
      Object.assign(container.style, { position: 'absolute', inset: '0' });
      ctx.root.append(container);
      const root = createRoot(container);
      const tracker = createTracker();
      roots.set(ctx.root, { root, tracker });
      // First render starts any asynchronous work; wait for it, then commit
      // the resulting state so the first real frame is complete.
      draw(root, tracker, 0);
      await tracker.settled();
      draw(root, tracker, 0);
    },
    render(t, ctx) {
      const entry = roots.get(ctx.root);
      if (!entry) throw new Error(`Composition "${options.id}" rendered before setup.`);
      draw(entry.root, entry.tracker, Math.min(timeToFrame(t, fps), durationInFrames - 1));
    },
    teardown(ctx) {
      roots.get(ctx.root)?.root.unmount();
      roots.delete(ctx.root);
    },
  });
}
