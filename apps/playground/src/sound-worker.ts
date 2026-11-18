/**
 * Renders a soundtrack off the page's main thread, so a long or dense one
 * (a whole film's music) never freezes the playground while it loads. The
 * render is the same `renderSoundtrack` export uses; only where it runs differs.
 */
import { renderSoundtrack, type PcmAudio, type Soundtrack } from '@html-animation-engine/core';

export interface SoundRequest {
  readonly track: Soundtrack;
  readonly duration: number;
  readonly sampleRate: number;
  readonly seed: number;
  readonly samples: Readonly<Record<string, PcmAudio>>;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SoundRequest>) => void) | null;
  postMessage(message: PcmAudio, transfer: Transferable[]): void;
};

scope.onmessage = (event) => {
  const { track, duration, sampleRate, seed, samples } = event.data;
  const pcm = renderSoundtrack(track, { duration, sampleRate, samples, seed });
  scope.postMessage(
    pcm,
    pcm.channels.map((channel) => channel.buffer as ArrayBuffer),
  );
};
