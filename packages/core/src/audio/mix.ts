import { createRng } from '../random/rng.js';
import {
  balance,
  createFilter,
  renderNoise,
  renderSample,
  renderTone,
  type Rendered,
} from './dsp.js';
import type { PcmAudio, ReverbOptions, Sound, Soundtrack } from './types.js';

export interface RenderSoundtrackOptions {
  /** Output length in seconds (the composition's duration). */
  readonly duration: number;
  /** Default 48000. */
  readonly sampleRate?: number;
  /** Decoded samples by name (see `Soundtrack.samples`). */
  readonly samples?: Readonly<Record<string, PcmAudio>>;
  /** Seed for noise when the soundtrack has none (pass the composition seed). */
  readonly seed?: number;
}

/** A leaf sound with its placement resolved through every enclosing layer. */
interface Voice {
  readonly sound: Exclude<Sound, { type: 'layer' }>;
  readonly at: number;
  readonly gain: number;
  readonly pan: number;
  readonly send: number;
}

function flatten(
  sound: Sound,
  at: number,
  gain: number,
  pan: number,
  send: number | undefined,
  out: Voice[],
) {
  const here = at + (sound.delay ?? 0);
  const g = gain * (sound.gain ?? 1);
  const p = pan + (sound.pan ?? 0);
  const s = sound.send ?? send;
  if (sound.type === 'layer') {
    for (const layer of sound.layers) flatten(layer, here, g, p, s, out);
  } else {
    out.push({ sound, at: here, gain: g, pan: p, send: s ?? 0 });
  }
}

/**
 * Freeverb (Jezar's public-domain design): eight damped comb filters and four
 * all-passes per channel, the right channel's delays 23 samples longer.
 */
function reverb(
  input: Float32Array,
  sampleRate: number,
  options: ReverbOptions,
): [Float32Array, Float32Array] {
  const scale = sampleRate / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const allpasses = [556, 441, 341, 225];
  const feedback = 0.7 + 0.28 * (options.size ?? 0.7);
  const damp = 0.4 * (options.damping ?? 0.4);
  const predelay = Math.round((options.predelay ?? 0.02) * sampleRate);
  const outs: [Float32Array, Float32Array] = [
    new Float32Array(input.length),
    new Float32Array(input.length),
  ];
  for (let c = 0; c < 2; c++) {
    const spread = c * 23;
    const combLines = combs.map((n) => new Float32Array(Math.round((n + spread) * scale)));
    const combIndex = combs.map(() => 0);
    const combStore = combs.map(() => 0);
    const apLines = allpasses.map((n) => new Float32Array(Math.round((n + spread) * scale)));
    const apIndex = allpasses.map(() => 0);
    const out = outs[c] as Float32Array;
    for (let i = 0; i < input.length; i++) {
      const x = (i >= predelay ? (input[i - predelay] as number) : 0) * 0.015;
      let sum = 0;
      for (let k = 0; k < combLines.length; k++) {
        const line = combLines[k] as Float32Array;
        const j = combIndex[k] as number;
        const y = line[j] as number;
        const store = y * (1 - damp) + (combStore[k] as number) * damp;
        combStore[k] = store;
        line[j] = x + store * feedback;
        combIndex[k] = j + 1 === line.length ? 0 : j + 1;
        sum += y;
      }
      for (let k = 0; k < apLines.length; k++) {
        const line = apLines[k] as Float32Array;
        const j = apIndex[k] as number;
        const buffered = line[j] as number;
        line[j] = sum + buffered * 0.5;
        sum = buffered - sum;
        apIndex[k] = j + 1 === line.length ? 0 : j + 1;
      }
      out[i] = sum * 3 * (options.gain ?? 1);
    }
  }
  return outs;
}

/** Taps each side of the true-peak interpolator. */
const TP_TAPS = 8;
/** Lanczos-windowed sinc kernels for the points a quarter, half and three quarters between samples. */
const TP_KERNELS = [0.25, 0.5, 0.75].map((frac) =>
  Array.from({ length: 2 * TP_TAPS }, (_, k) => {
    const x = k - (TP_TAPS - 1) - frac;
    const sinc = (v: number) => (v === 0 ? 1 : Math.sin(Math.PI * v) / (Math.PI * v));
    return sinc(x) * sinc(x / TP_TAPS);
  }),
);

/**
 * Peak level of each sample including the peaks between it and its
 * neighbours (4× oversampled, as in ITU-R BS.1770 true peak), so the limited
 * signal stays under the ceiling after a decoder reconstructs it.
 */
function truePeaks(left: Float32Array, right: Float32Array): Float32Array {
  const n = left.length;
  const sample = new Float32Array(n);
  const between = new Float32Array(n); // peak in (i, i + 1)
  for (const ch of [left, right]) {
    for (let i = 0; i < n; i++) {
      sample[i] = Math.max(sample[i] as number, Math.abs(ch[i] as number));
      let peak = 0;
      for (const kernel of TP_KERNELS) {
        let v = 0;
        for (let k = 0; k < kernel.length; k++) {
          const j = i - (TP_TAPS - 1) + k;
          if (j >= 0 && j < n) v += (ch[j] as number) * (kernel[k] as number);
        }
        peak = Math.max(peak, Math.abs(v));
      }
      between[i] = Math.max(between[i] as number, peak);
    }
  }
  for (let i = 0; i < n; i++) {
    const before = i > 0 ? (between[i - 1] as number) : 0;
    sample[i] = Math.max(sample[i] as number, before, between[i] as number);
  }
  return sample;
}

/**
 * Look-ahead true-peak limiter: the gain needed to keep each sample (and the
 * peaks between samples) under `ceiling` is taken as a running minimum over
 * the next `ahead` samples, released smoothly, then averaged over `ahead`
 * samples, so every peak is already turned down when it arrives.
 */
function limit(left: Float32Array, right: Float32Array, ceiling: number, sampleRate: number) {
  const n = left.length;
  const ahead = Math.max(1, Math.round(0.0015 * sampleRate));
  const release = 1 - Math.exp(-1 / (0.08 * sampleRate));
  const peaks = truePeaks(left, right);
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const peak = peaks[i] as number;
    need[i] = peak > ceiling ? ceiling / peak : 1;
  }
  const smooth = new Float32Array(n);
  let held = 1;
  for (let i = 0; i < n; i++) {
    let m = 1;
    for (let k = i; k < Math.min(n, i + ahead + 1); k++) m = Math.min(m, need[k] as number);
    held = m < held ? m : held + (m - held) * release;
    smooth[i] = held;
  }
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += smooth[i] as number;
    if (i >= ahead) acc -= smooth[i - ahead] as number;
    const g = Math.min(acc / Math.min(i + 1, ahead), smooth[i] as number);
    left[i] = (left[i] as number) * g;
    right[i] = (right[i] as number) * g;
  }
}

/**
 * Renders a soundtrack to stereo PCM, `duration` seconds long. A pure
 * function of its inputs: the same soundtrack, samples and seed always give
 * the same numbers. Sounds before 0 or after `duration` are cut off.
 */
export function renderSoundtrack(track: Soundtrack, options: RenderSoundtrackOptions): PcmAudio {
  const sampleRate = options.sampleRate ?? 48000;
  const n = Math.max(1, Math.round(options.duration * sampleRate));
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const sendBus = new Float32Array(n);
  const seed = track.seed ?? options.seed ?? 0;

  const voices: Voice[] = [];
  for (const event of track.events) {
    flatten(
      event.sound,
      event.at + (event.delay ?? 0),
      event.gain ?? 1,
      event.pan ?? 0,
      event.send,
      voices,
    );
  }
  voices.forEach((voice, index) => {
    const rng = createRng(seed).fork(index);
    const { sound } = voice;
    let rendered: Rendered;
    if (sound.type === 'sample') {
      const pcm = options.samples?.[sound.sample];
      if (!pcm) throw new Error(`renderSoundtrack: sample "${sound.sample}" was not loaded.`);
      rendered = renderSample(sound, sampleRate, pcm);
    } else if (sound.type === 'tone') rendered = renderTone(sound, sampleRate, rng);
    else rendered = renderNoise(sound, sampleRate, rng);
    const [gl, gr] = balance(voice.pan);
    const start = Math.round(voice.at * sampleRate) + rendered.offset;
    for (let i = Math.max(0, -start); i < rendered.left.length && start + i < n; i++) {
      const l = (rendered.left[i] as number) * voice.gain * gl;
      const r = (rendered.right[i] as number) * voice.gain * gr;
      const j = start + i;
      left[j] = (left[j] as number) + l;
      right[j] = (right[j] as number) + r;
      if (voice.send > 0) sendBus[j] = (sendBus[j] as number) + ((l + r) / 2) * voice.send;
    }
  });

  if (voices.some((v) => v.send > 0)) {
    // Keep low end out of the reverb, so the tail stays clear.
    const hp = createFilter({ type: 'highpass', freq: 220 }, sampleRate);
    for (let i = 0; i < n; i++) sendBus[i] = hp.process(sendBus[i] as number, i);
    const [wl, wr] = reverb(sendBus, sampleRate, track.reverb ?? {});
    for (let i = 0; i < n; i++) {
      left[i] = (left[i] as number) + (wl[i] as number);
      right[i] = (right[i] as number) + (wr[i] as number);
    }
  }

  const gain = track.gain ?? 1;
  const dcL = createFilter({ type: 'highpass', freq: 18 }, sampleRate);
  const dcR = createFilter({ type: 'highpass', freq: 18 }, sampleRate);
  for (let i = 0; i < n; i++) {
    left[i] = dcL.process((left[i] as number) * gain, i);
    right[i] = dcR.process((right[i] as number) * gain, i);
  }
  limit(left, right, 10 ** ((track.ceiling ?? -1.5) / 20), sampleRate);
  // Fade the last 15 ms so a tail cut off by the end doesn't click.
  const fade = Math.min(n, Math.round(0.015 * sampleRate));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    left[n - 1 - i] = (left[n - 1 - i] as number) * g;
    right[n - 1 - i] = (right[n - 1 - i] as number) * g;
  }
  return { sampleRate, channels: [left, right] };
}

/** Samples `[from, to)` seconds of `audio` (for a partial render). */
export function sliceAudio(audio: PcmAudio, from: number, to: number): PcmAudio {
  const a = Math.max(0, Math.round(from * audio.sampleRate));
  const b = Math.max(a, Math.round(to * audio.sampleRate));
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((c) => {
      const out = new Float32Array(b - a);
      out.set(c.subarray(a, Math.min(b, c.length)));
      return out;
    }),
  };
}
