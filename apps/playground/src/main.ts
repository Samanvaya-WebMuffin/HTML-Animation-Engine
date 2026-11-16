import { compositionSeed, timeToFrame } from '@html-animation-engine/core';
import {
  isSequence,
  mountStage,
  type SceneMark,
  type Stage,
} from '@html-animation-engine/renderers';
import { examples, type ExampleEntry } from './examples.js';
import { Player, type PlayerState } from './player.js';
import { SoundPlayer } from './sound.js';
import './style.css';

/**
 * The one video the page shows: every scene, played straight through
 * (`?example=<name>` still opens a single scene or example, for development).
 */
const FEATURED = 'cowork-film';

const FPS_CHOICES = [12, 24, 25, 30, 50, 60] as const;
const SCALE_CHOICES = [0.5, 1, 2] as const;

function $<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const ui = {
  viewport: $<HTMLElement>('viewport'),
  frame: $<HTMLElement>('stage-frame'),
  empty: $<HTMLElement>('empty'),
  play: $<HTMLButtonElement>('play'),
  prev: $<HTMLButtonElement>('prev'),
  next: $<HTMLButtonElement>('next'),
  scrubber: $<HTMLInputElement>('scrubber'),
  timecode: $<HTMLOutputElement>('timecode'),
  fps: $<HTMLSelectElement>('fps'),
  scale: $<HTMLSelectElement>('scale'),
  reduced: $<HTMLInputElement>('reduced-motion'),
  sound: $<HTMLInputElement>('sound'),
  scenePanel: $<HTMLElement>('scene-panel'),
  sceneList: $<HTMLElement>('scene-list'),
  markers: $<HTMLElement>('markers'),
  export: $<HTMLButtonElement>('export'),
};

/** The scenes of the video being played (empty for a single composition). */
let scenes: readonly SceneMark[] = [];

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/**
 * Lists the scenes on the left (each jumps to its first frame) and puts a
 * divider on the progress bar wherever one scene hands over to the next.
 */
function showScenes(marks: readonly SceneMark[], duration: number): void {
  scenes = marks;
  document.body.classList.toggle('has-scenes', marks.length > 0);
  ui.scenePanel.hidden = marks.length === 0;
  ui.sceneList.replaceChildren(
    ...marks.map((mark, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset['index'] = String(i);
      const parts = [String(i + 1), mark.title, clock(mark.start)];
      const classes = ['number', 'title', 'time'];
      button.append(
        ...parts.map((text, k) => {
          const span = document.createElement('span');
          span.className = classes[k] ?? '';
          span.textContent = text;
          return span;
        }),
      );
      button.addEventListener('click', () => {
        if (!player) return;
        player.seek(timeToFrame(mark.start, player.state.fps), performance.now());
      });
      return button;
    }),
  );
  ui.markers.replaceChildren(
    ...marks.slice(1).map((mark) => {
      const span = document.createElement('span');
      span.style.setProperty('--at', String(mark.start / duration));
      span.title = mark.title;
      return span;
    }),
  );
  requestAnimationFrame(fitStage); // the stage area changed width
}

/** The scene playing at `t`. */
function currentScene(t: number): number {
  let index = 0;
  scenes.forEach((mark, i) => {
    if (t >= mark.start - 1e-9) index = i;
  });
  return index;
}

/** Hold per key moment in reduced-motion playback, seconds. */
const REDUCED_HOLD = 2;

/** Reduced motion: from the URL if set, otherwise from the OS preference. */
function prefersReducedMotion(): boolean {
  const fromUrl = params.get('reduced');
  if (fromUrl !== null) return fromUrl === '1';
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Playground state that is mirrored into the URL so views can be shared. */
const params = new URLSearchParams(location.search);
let stage: Stage | undefined;
let player: Player | undefined;
let mountToken = 0;
let keyTimes: readonly number[] = [];
const sound = new SoundPlayer();
sound.enabled = params.get('sound') !== '0';

function writeUrl(state?: PlayerState): void {
  if (state) params.set('frame', String(state.frame));
  history.replaceState(null, '', `?${params.toString()}`);
}

function render(state: PlayerState): void {
  stage?.render(state.t);
  // Reduced-motion playback cuts between still moments, so it plays silently.
  sound.sync(state.t, state.playing && !state.reducedMotion);
  ui.scrubber.max = String(state.frameCount - 1);
  ui.scrubber.value = String(state.frame);
  ui.play.textContent = state.playing ? 'Pause' : 'Play';
  ui.reduced.checked = state.reducedMotion;
  ui.timecode.value = `${state.t.toFixed(3)} s · ${state.frame} / ${state.frameCount - 1}`;
  if (scenes.length) {
    const current = currentScene(state.t);
    for (const button of ui.sceneList.querySelectorAll('button')) {
      button.setAttribute('aria-current', String(Number(button.dataset['index']) === current));
    }
  }
  if (!state.playing) writeUrl(state);
}

/** Scales the stage down (never up) to fit the viewport. */
function fitStage(): void {
  if (!stage) return;
  const { width, height } = stage.composition;
  const pad = 32;
  const scale = Math.min(
    1,
    (ui.viewport.clientWidth - pad) / width,
    (ui.viewport.clientHeight - pad) / height,
  );
  ui.frame.style.transform = `scale(${scale}) translate(-50%, -50%)`;
}

function setControlsEnabled(enabled: boolean): void {
  for (const control of [
    ui.play,
    ui.prev,
    ui.next,
    ui.scrubber,
    ui.fps,
    ui.scale,
    ui.reduced,
    ui.sound,
  ]) {
    control.disabled = !enabled;
  }
}

function fillSelect(select: HTMLSelectElement, options: [string, string][], value: string) {
  select.replaceChildren(
    ...options.map(
      ([optionValue, label]) => new Option(label, optionValue, false, optionValue === value),
    ),
  );
}

async function selectExample(entry: ExampleEntry): Promise<void> {
  const token = ++mountToken;
  player?.pause();
  sound.stop();
  stage?.destroy();
  stage = undefined;

  if (params.get('example') !== entry.name) {
    params.set('example', entry.name);
    params.delete('frame');
  }

  const { composition, config } = await entry.load();
  if (token !== mountToken) return;
  ui.sound.checked = sound.enabled;
  const soundReady = sound.load(
    composition.audio,
    composition.duration,
    compositionSeed(composition),
  );
  keyTimes = config?.stills ?? [composition.duration - 1 / composition.fps];

  const fps = Number(params.get('fps')) || composition.fps;
  const scale = Number(params.get('scale')) || 1;
  fillSelect(
    ui.fps,
    [...new Set([composition.fps, ...FPS_CHOICES])]
      .sort((a, b) => a - b)
      .map((value) => [
        String(value),
        value === composition.fps ? `${value} (native)` : String(value),
      ]),
    String(fps),
  );
  fillSelect(
    ui.scale,
    SCALE_CHOICES.map((value) => [
      String(value),
      `${composition.width * value} × ${composition.height * value}`,
    ]),
    String(scale),
  );

  const reducedMotion = prefersReducedMotion();
  const mounted = await mountStage(ui.frame, composition, {
    fps,
    pixelRatio: scale,
    reducedMotion,
  });
  if (token !== mountToken) {
    mounted.destroy();
    return;
  }
  stage = mounted;
  player = new Player({ fps, duration: composition.duration, onChange: render });
  player.seek(Number(params.get('frame')) || 0);
  player.setReducedMotion(reducedMotion ? { keyTimes, hold: REDUCED_HOLD } : null);
  render(player.state);
  showScenes(isSequence(composition) ? composition.scenes : [], composition.duration);
  render(player.state);
  fitStage();
  setControlsEnabled(true);
  await soundReady;
  if (token === mountToken && player) render(player.state);
}

/** What the dev server reports about an export (see export-server.ts). */
interface ExportStatus {
  readonly state: 'idle' | 'running' | 'done' | 'error';
  readonly done?: number;
  readonly total?: number;
  readonly error?: string;
  readonly name?: string;
}

/**
 * Renders the current video at 4K 60 fps on the dev server (the same export
 * as `pnpm render`) and downloads it, showing progress on the button.
 */
async function exportVideo(): Promise<void> {
  const example = params.get('example') ?? FEATURED;
  const label = ui.export.textContent;
  ui.export.disabled = true;
  const show = (text: string) => (ui.export.textContent = text);
  try {
    const start = await fetch(`/__export?example=${encodeURIComponent(example)}`, {
      method: 'POST',
    });
    if (!start.ok && start.status !== 409)
      throw new Error(`Export failed to start (${start.status}).`);
    show('Exporting…');
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const status = (await (await fetch('/__export/status')).json()) as ExportStatus;
      if (status.state === 'error') throw new Error(status.error ?? 'Export failed.');
      if (status.state === 'done') {
        const link = document.createElement('a');
        link.href = '/__export/download';
        link.download = status.name ?? `${example}-4k-60fps.mp4`;
        link.click();
        break;
      }
      const pct = status.total ? Math.floor(((status.done ?? 0) / status.total) * 100) : 0;
      show(status.total ? `Exporting ${pct}%` : 'Preparing…');
    }
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
  } finally {
    ui.export.disabled = false;
    show(label ?? 'Export 4K');
  }
}

function bindControls(): void {
  ui.export.addEventListener('click', () => void exportVideo());
  ui.play.addEventListener('click', () => player?.toggle(performance.now()));
  ui.prev.addEventListener('click', () => player?.step(-1, performance.now()));
  ui.next.addEventListener('click', () => player?.step(1, performance.now()));
  ui.scrubber.addEventListener('input', () => {
    player?.seek(Number(ui.scrubber.value), performance.now());
  });
  const remount = () => {
    const current = examples.find((entry) => entry.name === params.get('example'));
    if (current) void selectExample(current);
  };
  ui.fps.addEventListener('change', () => {
    const fps = Number(ui.fps.value);
    params.set('fps', String(fps));
    if (player) params.set('frame', String(timeToFrame(player.state.t, fps)));
    remount();
  });
  ui.reduced.addEventListener('change', () => {
    params.set('reduced', ui.reduced.checked ? '1' : '0');
    if (player) params.set('frame', String(player.state.frame));
    remount(); // the composition also receives ctx.reducedMotion
  });
  ui.sound.addEventListener('change', () => {
    sound.enabled = ui.sound.checked;
    params.set('sound', ui.sound.checked ? '1' : '0');
    writeUrl();
    if (player) render(player.state);
  });
  ui.scale.addEventListener('change', () => {
    params.set('scale', ui.scale.value);
    if (player) params.set('frame', String(player.state.frame));
    remount();
  });

  document.addEventListener('keydown', (event) => {
    if (!player || event.target instanceof HTMLSelectElement) return;
    const now = performance.now();
    const stride = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case ' ':
        player.toggle(now);
        break;
      case 'ArrowLeft':
        player.step(-stride, now);
        break;
      case 'ArrowRight':
        player.step(stride, now);
        break;
      case 'Home':
        player.seek(0, now);
        break;
      case 'End':
        player.seek(Number.MAX_SAFE_INTEGER, now);
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  new ResizeObserver(fitStage).observe(ui.viewport);
}

/** The playback clock. Only advances the frame index; never drives drawing directly. */
function loop(now: number): void {
  player?.tick(now);
  requestAnimationFrame(loop);
}

bindControls();
setControlsEnabled(false);

const initial =
  examples.find((entry) => entry.name === (params.get('example') ?? FEATURED)) ??
  examples.find((entry) => entry.name === FEATURED);
if (initial) {
  void selectExample(initial);
} else {
  ui.empty.hidden = false;
}
requestAnimationFrame(loop);
