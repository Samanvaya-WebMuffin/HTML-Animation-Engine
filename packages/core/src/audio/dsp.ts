import type { Rng } from '../random/rng.js';
import type { Envelope, Filter, NoiseSound, PcmAudio, SampleSound, ToneSound } from './types.js';

/** ln(1000): an exponential that has fallen by 60 dB after T seconds is exp(-T60 · t / T). */
const T60 = 6.907755278982137;

/** Stereo PCM produced by one voice, starting `offset` samples after its start time. */
export interface Rendered {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly offset: number;
}

/** Envelope duration in seconds. */
export function envelopeLength(env: Envelope): number {
  const attack = env.attack ?? 0.002;
  const hold = env.hold ?? 0;
  if (env.length !== undefined) return env.length + (env.release ?? 0.05);
  return attack + hold + env.decay;
}

/** Envelope level (0–1) at `t` seconds. */
export function envelopeAt(env: Envelope, t: number): number {
  if (t < 0) return 0;
  const attack = env.attack ?? 0.002;
  const hold = env.hold ?? 0;
  const sustain = env.sustain ?? 0;
  const level = (time: number) => {
    if (time < attack) return time / attack;
    const after = time - attack - hold;
    if (after <= 0) return 1;
    return sustain + (1 - sustain) * Math.exp((-T60 * after) / env.decay);
  };
  if (env.length === undefined || t < env.length) return level(t);
  const release = env.release ?? 0.05;
  return level(env.length) * Math.exp((-T60 * (t - env.length)) / release);
}

/** RBJ-cookbook biquad (transposed direct form II) whose cutoff may sweep. */
export function createFilter(filter: Filter, sampleRate: number) {
  const nyquistSafe = sampleRate * 0.45;
  const q = filter.q ?? (filter.type === 'bandpass' ? 1 : Math.SQRT1_2);
  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  let a1 = 0;
  let a2 = 0;
  let z1 = 0;
  let z2 = 0;
  const set = (freq: number) => {
    const w = (2 * Math.PI * Math.min(Math.max(freq, 10), nyquistSafe)) / sampleRate;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    if (filter.type === 'lowpass') {
      b0 = (1 - cos) / 2 / a0;
      b1 = (1 - cos) / a0;
      b2 = b0;
    } else if (filter.type === 'highpass') {
      b0 = (1 + cos) / 2 / a0;
      b1 = -(1 + cos) / a0;
      b2 = b0;
    } else {
      b0 = alpha / a0;
      b1 = 0;
      b2 = -alpha / a0;
    }
    a1 = (-2 * cos) / a0;
    a2 = (1 - alpha) / a0;
  };
  set(filter.freq);
  const sweep = filter.sweep;
  return {
    /** Processes one sample; `i` is the sample index from the voice start (for the sweep). */
    process(x: number, i: number): number {
      if (sweep && i % 16 === 0) {
        const p = Math.min(1, i / sampleRate / sweep.time);
        set(filter.freq * (sweep.to / filter.freq) ** p);
      }
      const y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      return y;
    },
  };
}

function polyBlep(phase: number, dt: number): number {
  if (phase < dt) {
    const t = phase / dt;
    return t + t - t * t - 1;
  }
  if (phase > 1 - dt) {
    const t = (phase - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

function wave(kind: ToneSound['wave'], phase: number, dt: number): number {
  switch (kind) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase);
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5);
    case 'saw':
      return 2 * phase - 1 - polyBlep(phase, dt);
    case 'square':
      return (phase < 0.5 ? 1 : -1) + polyBlep(phase, dt) - polyBlep((phase + 0.5) % 1, dt);
  }
}

/** Equal-gain balance: centre leaves both channels untouched. */
export function balance(pan: number): [number, number] {
  const p = Math.max(-1, Math.min(1, pan));
  return [p > 0 ? 1 - p : 1, p < 0 ? 1 + p : 1];
}

export function renderTone(sound: ToneSound, sampleRate: number, rng: Rng): Rendered {
  const length = Math.ceil(envelopeLength(sound.envelope) * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const voices = Math.max(1, Math.round(sound.unison?.voices ?? 1));
  const norm = 1 / Math.sqrt(voices);
  const drive = sound.drive ?? 0;
  const driveNorm = drive > 0 ? 1 / Math.tanh(1 + drive) : 1;
  const env = new Float32Array(length);
  for (let i = 0; i < length; i++) env[i] = envelopeAt(sound.envelope, i / sampleRate);
  for (let v = 0; v < voices; v++) {
    const spread = voices === 1 ? 0 : v / (voices - 1) - 0.5;
    const ratio = 2 ** (((sound.unison?.detune ?? 0) * spread) / 1200);
    const [gl, gr] = balance(2 * spread * (sound.unison?.width ?? 0));
    let phase = voices === 1 ? 0 : rng.next();
    let modPhase = 0;
    const filter = sound.filter ? createFilter(sound.filter, sampleRate) : undefined;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const glide = sound.pitch ? 1 + (sound.pitch.from - 1) * Math.exp(-t / sound.pitch.time) : 1;
      const freq = sound.freq * ratio * glide;
      const dt = freq / sampleRate;
      let p = phase;
      if (sound.fm) {
        const index = sound.fm.index * (sound.fm.decay ? Math.exp(-t / sound.fm.decay) : 1);
        p += (index * Math.sin(2 * Math.PI * modPhase)) / (2 * Math.PI);
        p -= Math.floor(p);
        modPhase += dt * sound.fm.ratio;
        modPhase -= Math.floor(modPhase);
      }
      let x = wave(sound.wave, p, dt);
      if (filter) x = filter.process(x, i);
      if (drive > 0) x = Math.tanh(x * (1 + drive)) * driveNorm;
      x *= (env[i] as number) * norm;
      left[i] = (left[i] as number) + x * gl;
      right[i] = (right[i] as number) + x * gr;
      phase += dt;
      phase -= Math.floor(phase);
    }
  }
  return { left, right, offset: 0 };
}

export function renderNoise(sound: NoiseSound, sampleRate: number, rng: Rng): Rendered {
  const bursts = sound.bursts;
  const lead = bursts ? (bursts.count - 1) * bursts.spacing : 0;
  const length = Math.ceil((lead + envelopeLength(sound.envelope)) * sampleRate);
  const channels = [new Float32Array(length), new Float32Array(length)] as const;
  const count = sound.stereo ? 2 : 1;
  for (let c = 0; c < count; c++) {
    const out = channels[c] as Float32Array;
    const filter = sound.filter ? createFilter(sound.filter, sampleRate) : undefined;
    // Paul Kellet's pink filter state.
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = rng.next() * 2 - 1;
      let x = white;
      if (sound.color === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        x = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
      if (filter) x = filter.process(x, i);
      const t = i / sampleRate;
      let level = envelopeAt(sound.envelope, t - lead);
      if (bursts && t < lead + bursts.spacing) {
        const k = Math.min(Math.floor(t / bursts.spacing), bursts.count - 1);
        level = Math.max(level, Math.exp((-T60 * (t - k * bursts.spacing)) / bursts.decay));
      }
      out[i] = x * level;
    }
  }
  if (count === 1) channels[1].set(channels[0]);
  return { left: channels[0], right: channels[1], offset: 0 };
}

/** Cubic (Catmull-Rom) interpolation of `data` at fractional index `x`. */
function cubic(data: Float32Array, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const at = (k: number) => (k >= 0 && k < data.length ? (data[k] as number) : 0);
  const p0 = at(i - 1);
  const p1 = at(i);
  const p2 = at(i + 1);
  const p3 = at(i + 2);
  return (
    p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)))
  );
}

export function renderSample(sound: SampleSound, sampleRate: number, pcm: PcmAudio): Rendered {
  const step = (pcm.sampleRate / sampleRate) * (sound.rate ?? 1);
  const frames = pcm.channels[0]?.length ?? 0;
  const length = Math.ceil(frames / step);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const sources = [pcm.channels[0], pcm.channels[1] ?? pcm.channels[0]];
  const outs = [left, right];
  const exact = step === 1;
  for (let c = 0; c < 2; c++) {
    const src = sources[c] as Float32Array;
    const out = outs[c] as Float32Array;
    const filter = sound.filter ? createFilter(sound.filter, sampleRate) : undefined;
    for (let i = 0; i < length; i++) {
      let x = exact ? (src[i] as number) : cubic(src, i * step);
      if (filter) x = filter.process(x, i);
      out[i] = x;
    }
  }
  // Start early by the onset, so the transient lands on the event time.
  const offset = -Math.round(((sound.onset ?? 0) / (sound.rate ?? 1)) * sampleRate);
  return { left, right, offset };
}
