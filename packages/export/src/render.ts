import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { chromium, type Browser } from 'playwright';
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
  /** Audio file to mux in (the video stream is copied, not re-encoded). */
  readonly audio?: string;
  readonly browser?: Browser;
  readonly onProgress?: (done: number, total: number) => void;
}

export interface RenderResult {
  readonly output: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly frames: number;
  readonly seconds: number;
  readonly elapsedMs: number;
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
    const fps = options.fps ?? probe.fps;
    const scale = resolveScale(probe, options);
    const { first, count } = frameRange(probe, fps, options.from, options.to);
    const size = outputSize(probe.width, probe.height, scale);
    await mkdir(dirname(options.output), { recursive: true });

    const session = await openCapture(browser, { ...options, fps }, probe, scale);
    const videoPath = options.audio ? `${options.output}.video.mp4` : options.output;
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
      throw error;
    } finally {
      await session.close();
    }

    if (options.audio) {
      const audio = options.audio;
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
          '-shortest',
          '-movflags',
          '+faststart',
          '-f',
          'mp4',
          target,
        ],
        options.output,
      );
      await rm(videoPath, { force: true });
    }

    return {
      output: options.output,
      ...size,
      fps,
      frames: count,
      seconds: count / fps,
      elapsedMs: Date.now() - started,
    };
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
