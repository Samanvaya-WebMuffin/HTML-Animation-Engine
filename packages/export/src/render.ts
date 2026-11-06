import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { renderCompositionAudio, writeWav } from './audio.js';
import { openCapture, probeComposition, type CaptureInfo, type CaptureTarget } from './capture.js';
import { partialPath, runFfmpeg, startEncoder } from './encode.js';
import { ffmpegPath } from './env.js';
import { outputSize, scaleFor, type ResolutionName } from './resolution.js';

export interface SizeOptions {
  /** Fit the output inside a preset. Default '4k' (3840 × 2160). */
  readonly resolution?: ResolutionName;
  /** Exact scale factor instead of a preset. */
  readonly scale?: number;
}

export interface RenderVideoOptions extends CaptureTarget, SizeOptions {
  readonly output: string;
  /** Start and end time in seconds. Default: the whole composition. */
  readonly from?: number;
  readonly to?: number;
  readonly crf?: number;
  readonly preset?: string;
  readonly tune?: string;
  /** Audio file to mux in instead of the composition's soundtrack. */
  readonly audio?: string;
  /** Render the composition's own soundtrack (`Composition.audio`) into the MP4. Default true. */
  readonly sound?: boolean;
  readonly browser?: Browser;
  readonly onProgress?: (done: number, total: number) => void;
  /** Non-fatal notes, e.g. a frame rate that does not suit the composition. */
  readonly onWarning?: (message: string) => void;
}

/** Frame rate videos are exported at unless `fps` is given. */
export const DEFAULT_EXPORT_FPS = 60;

/**
 * The frame rate to export at. Compositions are pure functions of time, so
 * they are sampled at `requested` or 60 fps; a `fixedFps` composition (e.g.
 * Remotion code, written in frames) keeps its own rate unless overridden.
 */
export function exportFps(
  requested: number | undefined,
  info: Pick<CaptureInfo, 'fps' | 'nativeFps' | 'fixedFps'>,
): { fps: number; warning?: string } {
  const native = info.nativeFps ?? info.fps;
  if (!info.fixedFps) return { fps: requested ?? DEFAULT_EXPORT_FPS };
  if (requested === undefined || requested === native) return { fps: native };
  return {
    fps: requested,
    warning:
      `This composition only changes on its own ${native} fps frame grid; at ${requested} fps ` +
      `frames will be ${requested > native ? 'repeated' : 'skipped'}.`,
  };
}

export interface RenderResult {
  readonly output: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly frames: number;
  readonly seconds: number;
  readonly elapsedMs: number;
  /** Where the audio track came from, if there is one. */
  readonly audio?: 'soundtrack' | 'file';
}

function resolveScale(info: CaptureInfo, options: SizeOptions): number {
  if (options.scale !== undefined) {
    if (!(options.scale > 0)) throw new RangeError(`--scale must be > 0, got ${options.scale}.`);
    return options.scale;
  }
  return scaleFor(info.width, info.height, options.resolution ?? '4k');
}

/** Frame indices for [from, to) on the composition's frame grid. */
export function frameRange(
  info: Pick<CaptureInfo, 'duration'>,
  fps: number,
  from = 0,
  to = info.duration,
) {
  if (!(from >= 0) || !(to > from) || to > info.duration + 1e-9) {
    throw new RangeError(`Invalid range ${from}–${to}s for a ${info.duration}s composition.`);
  }
  const first = Math.round(from * fps);
  const last = Math.min(Math.round(to * fps), Math.round(info.duration * fps));
  return { first, count: Math.max(1, last - first) };
}

async function withBrowser<T>(
  browser: Browser | undefined,
  run: (browser: Browser) => Promise<T>,
): Promise<T> {
  if (browser) return run(browser);
  const own = await chromium.launch();
  try {
    return await run(own);
  } finally {
    await own.close();
  }
}

/**
 * Renders a composition to an H.264 MP4. Frames are captured one by one and
 * piped straight into ffmpeg (nothing is written to disk but the video).
 */
export async function renderVideo(options: RenderVideoOptions): Promise<RenderResult> {
  const started = Date.now();
  return withBrowser(options.browser, async (browser) => {
    const probe = await probeComposition(browser, options);
    const { fps, warning } = exportFps(options.fps, probe);
    if (warning) options.onWarning?.(warning);
    const scale = resolveScale(probe, options);
    const { first, count } = frameRange(probe, fps, options.from, options.to);
    const size = outputSize(probe.width, probe.height, scale);
    await mkdir(dirname(options.output), { recursive: true });

    // The soundtrack covers exactly the exported frames.
    const soundtrack =
      options.audio === undefined && options.sound !== false
        ? await renderCompositionAudio(probe, options.url, {
            from: first / fps,
            to: (first + count) / fps,
          })
        : undefined;
    const audioPath =
      options.audio ?? (soundtrack ? `${options.output}.audio-${process.pid}.wav` : undefined);
    if (soundtrack && audioPath) await writeWav(soundtrack, audioPath);

    const session = await openCapture(browser, { ...options, fps }, probe, scale);
    const videoPath = audioPath ? `${options.output}.video-${process.pid}.mp4` : options.output;
    const encoder = startEncoder({
      output: videoPath,
      fps,
      ...(options.crf === undefined ? {} : { crf: options.crf }),
      ...(options.preset === undefined ? {} : { preset: options.preset }),
      ...(options.tune === undefined ? {} : { tune: options.tune }),
    });
    try {
      for (let i = 0; i < count; i++) {
        await encoder.write(await session.frame((first + i) / fps));
        options.onProgress?.(i + 1, count);
      }
      await encoder.finish();
    } catch (error) {
      await encoder.abort();
      if (soundtrack && audioPath) await rm(audioPath, { force: true });
      throw error;
    } finally {
      await session.close();
    }

    if (audioPath) {
      const audio = audioPath;
      try {
        await runFfmpeg(
          (target) => [
            '-hide_banner',
            '-loglevel',
            'error',
            '-y',
            '-i',
            videoPath,
            '-i',
            audio,
            '-map',
            '0:v',
            '-map',
            '1:a',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-b:a',
            '320k',
            '-ar',
            '48000',
            '-shortest',
            '-movflags',
            '+faststart',
            '-f',
            'mp4',
            target,
          ],
          options.output,
        );
      } finally {
        await rm(videoPath, { force: true });
        if (soundtrack) await rm(audio, { force: true });
      }
    }

    return {
      output: options.output,
      ...size,
      fps,
      frames: count,
      seconds: count / fps,
      elapsedMs: Date.now() - started,
      ...(audioPath ? { audio: soundtrack ? ('soundtrack' as const) : ('file' as const) } : {}),
    };
  });
}

export interface RenderAudioOptions extends CaptureTarget {
  /** WAV file to write (48 kHz, 24-bit stereo). */
  readonly output: string;
  readonly from?: number;
  readonly to?: number;
  readonly browser?: Browser;
}

/** Renders only a composition's soundtrack, as a WAV (fast: no frames are captured). */
export async function renderAudio(
  options: RenderAudioOptions,
): Promise<{ output: string; seconds: number; events: number }> {
  return withBrowser(options.browser, async (browser) => {
    const probe = await probeComposition(browser, options);
    const from = options.from ?? 0;
    const to = options.to ?? probe.duration;
    frameRange(probe, DEFAULT_EXPORT_FPS, from, to); // validates the range
    const audio = await renderCompositionAudio(probe, options.url, { from, to });
    if (!audio) throw new Error(`"${probe.id}" has no soundtrack (Composition.audio).`);
    await mkdir(dirname(options.output), { recursive: true });
    await writeWav(audio, options.output);
    return { output: options.output, seconds: to - from, events: probe.audio?.events.length ?? 0 };
  });
}

export interface RenderStillsOptions extends CaptureTarget, SizeOptions {
  /** Directory for the PNGs and contact sheet. */
  readonly outDir: string;
  /** Times in seconds. Default: the composition's `stills`. */
  readonly at?: readonly number[];
  readonly browser?: Browser;
}

export interface StillsResult {
  readonly files: readonly string[];
  readonly contactSheet: string;
  readonly width: number;
  readonly height: number;
}

/** Renders chosen frames as PNGs at full output size, plus a contact sheet. */
export async function renderStills(options: RenderStillsOptions): Promise<StillsResult> {
  return withBrowser(options.browser, async (browser) => {
    const probe = await probeComposition(browser, options);
    const scale = resolveScale(probe, options);
    const times = options.at?.length ? options.at : probe.stills;
    if (times.length === 0)
      throw new Error(`No times given and "${probe.id}" has no stills in its config.`);
    for (const t of times) {
      if (!(t >= 0 && t < probe.duration))
        throw new RangeError(`Still at ${t}s is outside 0–${probe.duration}s.`);
    }
    await mkdir(options.outDir, { recursive: true });
    const session = await openCapture(browser, options, probe, scale);
    const files: string[] = [];
    const frames: Buffer[] = [];
    try {
      for (const t of times) {
        const png = await session.frame(t);
        const file = join(options.outDir, `${probe.id}-${String(t).replace('.', '_')}s.png`);
        await writeFile(file, png);
        files.push(file);
        frames.push(png);
      }
    } finally {
      await session.close();
    }

    // Contact sheet: up to 3 columns of 640 px wide tiles.
    const cols = Math.min(3, frames.length);
    const rows = Math.ceil(frames.length / cols);
    const contactSheet = join(options.outDir, `${probe.id}-contact-sheet.png`);
    const target = partialPath(contactSheet);
    const child = spawn(
      ffmpegPath(),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'image2pipe',
        '-c:v',
        'png',
        '-i',
        'pipe:0',
        '-vf',
        `scale=640:-2:flags=lanczos,tile=${cols}x${rows}:padding=8:margin=8:color=0x111111`,
        '-frames:v',
        '1',
        '-f',
        'image2',
        '-c:v',
        'png',
        target,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    for (const png of frames) child.stdin.write(png);
    child.stdin.end();
    const [code] = (await once(child, 'close')) as [number | null];
    if (code !== 0) {
      await rm(target, { force: true });
      throw new Error(`Contact sheet failed:\n${stderr}`);
    }
    await rename(target, contactSheet);
    return { files, contactSheet, ...outputSize(probe.width, probe.height, scale) };
  });
}
