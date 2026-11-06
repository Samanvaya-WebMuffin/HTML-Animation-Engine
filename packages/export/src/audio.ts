import {
  decodeWav,
  encodeWav,
  renderSoundtrack,
  sliceAudio,
  type PcmAudio,
} from '@html-animation-engine/core';
import { rename, rm, writeFile } from 'node:fs/promises';
import type { CaptureInfo } from './capture.js';
import { partialPath } from './encode.js';

/** Sample rate soundtracks are rendered at (the video standard). */
export const AUDIO_SAMPLE_RATE = 48000;

/**
 * Loads a composition's samples (WAV files, fetched relative to the capture
 * page) and renders its soundtrack. Undefined when it has no sound.
 */
export async function renderCompositionAudio(
  info: Pick<CaptureInfo, 'id' | 'duration' | 'seed' | 'audio'>,
  pageUrl: string,
  range: { readonly from?: number; readonly to?: number } = {},
): Promise<PcmAudio | undefined> {
  const track = info.audio;
  if (!track || track.events.length === 0) return undefined;
  const samples: Record<string, PcmAudio> = {};
  await Promise.all(
    Object.entries(track.samples ?? {}).map(async ([name, url]) => {
      const response = await fetch(new URL(url, pageUrl));
      if (!response.ok) {
        throw new Error(
          `"${info.id}": sample "${name}" (${url}) failed to load: ${response.status}.`,
        );
      }
      samples[name] = decodeWav(await response.arrayBuffer());
    }),
  );
  // Render everything, then cut the range, so tails from earlier sounds carry into it.
  const audio = renderSoundtrack(track, {
    duration: info.duration,
    sampleRate: AUDIO_SAMPLE_RATE,
    samples,
    ...(info.seed === undefined ? {} : { seed: info.seed }),
  });
  const from = range.from ?? 0;
  const to = range.to ?? info.duration;
  return from === 0 && to >= info.duration ? audio : sliceAudio(audio, from, to);
}

/** Writes PCM as a 24-bit WAV through a temporary name. */
export async function writeWav(audio: PcmAudio, output: string): Promise<void> {
  const target = partialPath(output);
  try {
    await writeFile(target, encodeWav(audio, 24));
    await rename(target, output);
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
}
