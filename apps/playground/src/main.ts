import { compositionSeed, timeToFrame } from '@html-animation-engine/core';
import { mountStage, type Stage } from '@html-animation-engine/renderers';
import { examples, type ExampleEntry } from './examples.js';
import { Player, type PlayerState } from './player.js';
import { SoundPlayer } from './sound.js';
import './style.css';

const FPS_CHOICES = [12, 24, 25, 30, 50, 60] as const;
const SCALE_CHOICES = [0.5, 1, 2] as const;

function $<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const ui = {
  list: $<HTMLElement>('example-list'),
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
};

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

  for (const link of ui.list.querySelectorAll('a')) {
    if (link.dataset['name'] === entry.name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
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
  fitStage();
  setControlsEnabled(true);
  await soundReady;
  if (token === mountToken && player) render(player.state);
}

function buildList(): void {
  ui.list.replaceChildren(
    ...examples.map((entry) => {
      const link = document.createElement('a');
      link.href = `?example=${encodeURIComponent(entry.name)}`;
      link.textContent = entry.name;
      link.dataset['name'] = entry.name;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        void selectExample(entry);
      });
      return link;
    }),
  );
}

function bindControls(): void {
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

buildList();
bindControls();
setControlsEnabled(false);

const initial = examples.find((entry) => entry.name === params.get('example')) ?? examples[0];
if (initial) {
  void selectExample(initial);
} else {
  ui.empty.hidden = false;
}
requestAnimationFrame(loop);
