import {
  decodeWav,
  renderSoundtrack,
  type PcmAudio,
  type Soundtrack,
} from '@html-animation-engine/core';

const SAMPLE_RATE = 48000;
/**
 * Restart the audio when playback and sound are further apart than this (a
 * seek or a loop). Larger than a frame at any playground rate (1/12 s), since
 * playback time moves in whole frames.
 */
const RESYNC = 0.2;

/**
 * Plays a composition's soundtrack alongside the playground's playback. The
 * soundtrack is rendered once, with the same `renderSoundtrack` export uses,
 * and started at the current time whenever playback runs, so what you hear
 * here is what the MP4 contains. It follows the player; it never drives it.
 */
export class SoundPlayer {
  #context: AudioContext | undefined;
  #buffer: AudioBuffer | undefined;
  #pcm: PcmAudio | undefined;
  #source: AudioBufferSourceNode | undefined;
  /** Composition time and context time when the current source started. */
  #startedAt = { t: 0, clock: 0 };
  #token = 0;
  enabled = true;

  /** Renders `track` (fetching its samples relative to the page). Resolves when ready. */
  async load(track: Soundtrack | undefined, duration: number, seed: number): Promise<void> {
    const token = ++this.#token;
    this.stop();
    this.#buffer = undefined;
    this.#pcm = undefined;
    if (!track || track.events.length === 0) return;
    const samples: Record<string, PcmAudio> = {};
    await Promise.all(
      Object.entries(track.samples ?? {}).map(async ([name, url]) => {
        const response = await fetch(new URL(url, location.href));
        samples[name] = decodeWav(await response.arrayBuffer());
      }),
    );
    if (token !== this.#token) return;
    this.#pcm = renderSoundtrack(track, { duration, sampleRate: SAMPLE_RATE, samples, seed });
  }

  get available(): boolean {
    return this.#pcm !== undefined;
  }

  /**
   * Call on every player update. Starts, restarts (after a seek or loop) or
   * stops the sound to match `t` and whether playback is running.
   */
  sync(t: number, playing: boolean): void {
    if (!playing || !this.enabled || !this.#pcm) {
      this.stop();
      return;
    }
    const context = this.#ensureContext();
    if (this.#source) {
      const heard = this.#startedAt.t + (context.currentTime - this.#startedAt.clock);
      if (Math.abs(heard - t) <= RESYNC) return;
      this.stop();
    }
    const buffer = this.#ensureBuffer(context);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0, Math.min(t, buffer.duration));
    this.#source = source;
    this.#startedAt = { t, clock: context.currentTime };
  }

  stop(): void {
    this.#source?.stop();
    this.#source?.disconnect();
    this.#source = undefined;
  }

  #ensureContext(): AudioContext {
    // Created on first playback, which follows a click or key press (browsers require a gesture).
    this.#context ??= new AudioContext({ sampleRate: SAMPLE_RATE });
    if (this.#context.state === 'suspended') void this.#context.resume();
    return this.#context;
  }

  #ensureBuffer(context: AudioContext): AudioBuffer {
    const pcm = this.#pcm as PcmAudio;
    if (!this.#buffer) {
      const length = pcm.channels[0]?.length ?? 1;
      const buffer = context.createBuffer(pcm.channels.length, length, pcm.sampleRate);
      pcm.channels.forEach((channel, c) => buffer.copyToChannel(new Float32Array(channel), c));
      this.#buffer = buffer;
    }
    return this.#buffer;
  }
}
