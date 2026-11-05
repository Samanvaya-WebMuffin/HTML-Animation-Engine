import { timeToFrame } from '@html-animation-engine/core';
import { mountStage, type Stage } from '@html-animation-engine/renderers';
import { examples, type ExampleEntry } from './examples.js';
import { Player, type PlayerState } from './player.js';
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
};

/** Playground state that is mirrored into the URL so views can be shared. */
const params = new URLSearchParams(location.search);
let stage: Stage | undefined;
let player: Player | undefined;
let mountToken = 0;

function writeUrl(state?: PlayerState): void {
  if (state) params.set('frame', String(state.frame));
  history.replaceState(null, '', `?${params.toString()}`);
}

function render(state: PlayerState): void {
  stage?.render(state.t);
  ui.scrubber.max = String(state.frameCount - 1);
  ui.scrubber.value = String(state.frame);
  ui.play.textContent = state.playing ? 'Pause' : 'Play';
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
  for (const control of [ui.play, ui.prev, ui.next, ui.scrubber, ui.fps, ui.scale]) {
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

  const { composition } = await entry.load();
  if (token !== mountToken) return;

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

  const mounted = await mountStage(ui.frame, composition, { fps, pixelRatio: scale });
  if (token !== mountToken) {
    mounted.destroy();
    return;
  }
  stage = mounted;
  player = new Player({ fps, duration: composition.duration, onChange: render });
  player.seek(Number(params.get('frame')) || 0);
  render(player.state);
  fitStage();
  setControlsEnabled(true);
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
