import { describe, expect, it } from 'vitest';
import {
  db,
  decodeWav,
  defineSoundtrack,
  encodeWav,
  envelopeAt,
  envelopeLength,
  hz,
  noteNumber,
  renderSoundtrack,
  sliceAudio,
  type PcmAudio,
  type Sound,
  type Soundtrack,
} from '../src/index.js';

const SR = 48000;

/** FNV-1a over 16-bit-rounded samples: pins the exact output. */
function hash(audio: PcmAudio): string {
  let h = 0x811c9dc5;
  for (const ch of audio.channels) {
    for (const v of ch) {
      const q = Math.round(v * 32767) & 0xffff;
      h = Math.imul(h ^ (q & 0xff), 0x01000193);
      h = Math.imul(h ^ (q >> 8), 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const peak = (audio: PcmAudio) =>
  Math.max(...audio.channels.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));

/** A sample that is silent except for a single full-scale click `onset` seconds in. */
function click(onset: number): PcmAudio {
  const data = new Float32Array(Math.round(0.05 * SR));
  data[Math.round(onset * SR)] = 0.5;
  return { sampleRate: SR, channels: [data] };
}

const kit: Sound[] = [
  {
    type: 'tone',
    wave: 'saw',
    freq: 220,
    envelope: { decay: 0.4 },
    unison: { voices: 3, detune: 12, width: 0.5 },
  },
  {
    type: 'tone',
    wave: 'sine',
    freq: 880,
    fm: { ratio: 2, index: 1, decay: 0.05 },
    envelope: { decay: 0.3 },
    send: 0.4,
  },
  {
    type: 'noise',
    color: 'pink',
    filter: { type: 'bandpass', freq: 1000, sweep: { to: 4000, time: 0.3 } },
    bursts: { count: 3, spacing: 0.01, decay: 0.01 },
    envelope: { decay: 0.2 },
    stereo: true,
    pan: 0.3,
  },
];
const track: Soundtrack = {
  events: kit.map((sound, i) => ({ at: 0.1 + i * 0.2, sound })),
  reverb: { size: 0.7 },
};

describe('notes', () => {
  it('converts note names and MIDI numbers to frequencies', () => {
    expect(noteNumber('A4')).toBe(69);
    expect(noteNumber('C4')).toBe(60);
    expect(noteNumber('F#3')).toBe(54);
    expect(noteNumber('Bb2')).toBe(46);
    expect(hz('A4')).toBe(440);
    expect(hz('A5')).toBeCloseTo(880, 9);
    expect(hz(57, 432)).toBeCloseTo(216, 9);
    expect(() => noteNumber('H2')).toThrow(/note name/);
  });

  it('converts decibels to gain', () => {
    expect(db(0)).toBe(1);
    expect(db(-6)).toBeCloseTo(0.501, 3);
  });
});

describe('envelopes', () => {
  it('rises over the attack and falls 60 dB over the decay', () => {
    const env = { attack: 0.01, decay: 0.5 };
    expect(envelopeAt(env, 0)).toBe(0);
    expect(envelopeAt(env, 0.005)).toBeCloseTo(0.5, 9);
    expect(envelopeAt(env, 0.01)).toBeCloseTo(1, 9);
    expect(envelopeAt(env, 0.51)).toBeCloseTo(0.001, 6);
    expect(envelopeLength(env)).toBeCloseTo(0.51, 9);
  });

  it('holds a sustained note until `length`, then releases', () => {
    const env = { attack: 0.1, decay: 0.2, sustain: 0.5, length: 1, release: 0.3 };
    expect(envelopeAt(env, 0.9)).toBeCloseTo(0.5, 3);
    expect(envelopeAt(env, 1.3)).toBeCloseTo(0.0005, 4);
    expect(envelopeLength(env)).toBeCloseTo(1.3, 9);
  });
});

describe('WAV', () => {
  const audio: PcmAudio = {
    sampleRate: 44100,
    channels: [
      new Float32Array([0, 0.5, -0.5, 0.25, -1]),
      new Float32Array([1, -0.25, 0.125, 0, 0.75]),
    ],
  };

  it.each([16, 24, 32] as const)('round-trips %i-bit audio', (bits) => {
    const decoded = decodeWav(encodeWav(audio, bits));
    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.channels).toHaveLength(2);
    // Integer formats scale by 2^(bits-1) - 1 on the way in and 2^(bits-1) out: within one step.
    const tolerance = bits === 32 ? 1e-7 : 4 / 2 ** bits;
    decoded.channels.forEach((ch, c) =>
      ch.forEach((v, i) =>
        expect(Math.abs(v - (audio.channels[c]?.[i] ?? 0))).toBeLessThan(tolerance),
      ),
    );
  });

  it('rejects files that are not WAV', () => {
    expect(() => decodeWav(new Uint8Array(64))).toThrow(/RIFF/);
  });
});

describe('renderSoundtrack', () => {
  it('is a pure function: identical output every time (pinned)', () => {
    const a = renderSoundtrack(track, { duration: 1.2, seed: 7 });
    const b = renderSoundtrack(track, { duration: 1.2, seed: 7 });
    expect(a.channels[0]).toEqual(b.channels[0]);
    expect(a.channels[1]).toEqual(b.channels[1]);
    expect(hash(a)).toBe(PINNED);
    // A different seed changes the noise, nothing else.
    expect(hash(renderSoundtrack(track, { duration: 1.2, seed: 8 }))).not.toBe(PINNED);
  });

  it('is exactly `duration` long, stereo, at the requested rate', () => {
    const audio = renderSoundtrack(track, { duration: 0.75, sampleRate: 44100 });
    expect(audio.sampleRate).toBe(44100);
    expect(audio.channels).toHaveLength(2);
    expect(audio.channels[0]).toHaveLength(Math.round(0.75 * 44100));
  });

  it("lands a sample's transient exactly on the event time", () => {
    const at = 0.25;
    const track: Soundtrack = {
      samples: { click: 'click.wav' },
      events: [{ at, sound: { type: 'sample', sample: 'click', onset: 0.01 } }],
    };
    const audio = renderSoundtrack(track, { duration: 0.5, samples: { click: click(0.01) } });
    const left = audio.channels[0] as Float32Array;
    const loudest = left.reduce(
      (best, v, i) => (Math.abs(v) > Math.abs(left[best] ?? 0) ? i : best),
      0,
    );
    expect(loudest).toBe(Math.round(at * SR));
  });

  it('pans with equal-gain balance (centre leaves both channels untouched)', () => {
    const tone = (pan: number): Soundtrack => ({
      events: [
        {
          at: 0,
          pan,
          sound: { type: 'tone', wave: 'sine', freq: 440, envelope: { decay: 0.2 }, gain: 0.25 },
        },
      ],
    });
    const rms = (c: Float32Array) => Math.sqrt(c.reduce((s, v) => s + v * v, 0) / c.length);
    const centre = renderSoundtrack(tone(0), { duration: 0.3 });
    const right = renderSoundtrack(tone(1), { duration: 0.3 });
    expect(rms(centre.channels[0] as Float32Array)).toBeCloseTo(
      rms(centre.channels[1] as Float32Array),
      6,
    );
    expect(rms(right.channels[0] as Float32Array)).toBeLessThan(1e-6);
    expect(rms(right.channels[1] as Float32Array)).toBeCloseTo(
      rms(centre.channels[1] as Float32Array),
      4,
    );
  });

  it('keeps even very loud mixes under the ceiling, without clipping', () => {
    const loud: Soundtrack = {
      events: Array.from({ length: 6 }, (_, i) => ({
        at: 0.05 * i,
        sound: {
          type: 'tone',
          wave: 'square',
          freq: 110 * (i + 1),
          envelope: { decay: 0.4 },
          gain: 2,
        } as Sound,
      })),
      ceiling: -1.5,
    };
    const audio = renderSoundtrack(loud, { duration: 0.6 });
    expect(peak(audio)).toBeLessThanOrEqual(db(-1.5) + 1e-6);
    expect(peak(audio)).toBeGreaterThan(db(-3));
  });

  it('cuts sounds off at the end without a click', () => {
    const audio = renderSoundtrack(track, { duration: 0.5 });
    expect(audio.channels[0]?.at(-1)).toBe(0);
    expect(audio.channels[1]?.at(-1)).toBe(0);
  });

  it('a slice of a render equals those samples of it', () => {
    const audio = renderSoundtrack(track, { duration: 1 });
    const part = sliceAudio(audio, 0.25, 0.5);
    expect(part.channels[0]).toEqual(audio.channels[0]?.subarray(12000, 24000));
  });

  it('reports samples that were declared but not loaded', () => {
    const track: Soundtrack = {
      samples: { a: 'a.wav' },
      events: [{ at: 0, sound: { type: 'sample', sample: 'a' } }],
    };
    expect(() => renderSoundtrack(track, { duration: 0.1 })).toThrow(/"a" was not loaded/);
  });
});

describe('defineSoundtrack', () => {
  it('rejects undeclared samples and non-finite times', () => {
    expect(() =>
      defineSoundtrack({
        events: [{ at: 0, sound: { type: 'layer', layers: [{ type: 'sample', sample: 'x' }] } }],
      }),
    ).toThrow(/"x" is not declared/);
    expect(() =>
      defineSoundtrack({
        events: [
          {
            at: Number.NaN,
            sound: { type: 'tone', wave: 'sine', freq: 1, envelope: { decay: 1 } },
          },
        ],
      }),
    ).toThrow(/not finite/);
  });
});

/** Pinned output of the mix above; a change here changes every soundtrack. */
const PINNED = 'f2816f49';
