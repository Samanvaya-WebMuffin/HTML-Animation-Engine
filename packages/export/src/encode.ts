import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rename, rm } from 'node:fs/promises';
import { ffmpegPath } from './env.js';

export interface EncodeOptions {
  /** Final file path; the encoder writes to a temporary name and renames on success. */
  readonly output: string;
  readonly fps: number;
  /** x264 constant rate factor: 0 = lossless, 18 ≈ visually lossless (default), 23 = x264 default. */
  readonly crf?: number;
  /** x264 preset (speed vs. size). Default 'medium'. */
  readonly preset?: string;
  /** x264 tune, e.g. 'animation' for flat-colour motion graphics. Default none. */
  readonly tune?: string;
  readonly ffmpeg?: string;
}

/**
 * ffmpeg arguments: PNG frames on stdin → H.264 MP4, 8-bit 4:2:0, converted
 * with the Rec. 709 matrix in limited range and tagged as Rec. 709 so players
 * show the colours that were rendered.
 */
export function encodeArgs(options: EncodeOptions, target: string): string[] {
  const crf = options.crf ?? 18;
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'image2pipe',
    '-framerate',
    String(options.fps),
    '-c:v',
    'png',
    '-i',
    'pipe:0',
    '-vf',
    [
      'pad=ceil(iw/2)*2:ceil(ih/2)*2',
      'scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int',
      'format=yuv420p',
      // Tag the frames so the encoder writes Rec. 709 into the stream.
      'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    ].join(','),
    '-c:v',
    'libx264',
    '-preset',
    options.preset ?? 'medium',
    ...(options.tune ? ['-tune', options.tune] : []),
    '-crf',
    String(crf),
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-color_range',
    'tv',
    '-r',
    String(options.fps),
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    target,
  ];
}

export interface Encoder {
  /** Queues one PNG frame; resolves when ffmpeg can take more. */
  write(png: Buffer): Promise<void>;
  /** Closes the input, waits for ffmpeg, and moves the file into place. */
  finish(): Promise<void>;
  /** Stops ffmpeg and removes the partial file. */
  abort(): Promise<void>;
}

/** Temporary sibling path, renamed to `output` only when ffmpeg succeeds. */
export function partialPath(output: string): string {
  return `${output}.partial-${process.pid}`;
}

export function startEncoder(options: EncodeOptions): Encoder {
  const target = partialPath(options.output);
  const child = spawn(options.ffmpeg ?? ffmpegPath(), encodeArgs(options, target), {
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });
  const exited = once(child, 'close') as Promise<[number | null]>;
  let failure: Error | undefined;
  child.stdin.on('error', (error) => {
    failure ??= error;
  });

  return {
    async write(png) {
      if (failure) throw failure;
      if (child.exitCode !== null) throw new Error(`ffmpeg exited early:\n${stderr}`);
      if (!child.stdin.write(png)) await once(child.stdin, 'drain');
    },
    async finish() {
      child.stdin.end();
      const [code] = await exited;
      if (code !== 0) {
        await rm(target, { force: true });
        throw new Error(`ffmpeg failed (exit ${code}):\n${stderr}`);
      }
      await rename(target, options.output);
    },
    async abort() {
      child.kill('SIGKILL');
      await exited.catch(() => undefined);
      await rm(target, { force: true });
    },
  };
}

/** Runs ffmpeg to completion with `args`, writing to `output` via a temporary name. */
export async function runFfmpeg(
  args: (target: string) => string[],
  output: string,
  ffmpeg?: string,
) {
  const target = partialPath(output);
  const child = spawn(ffmpeg ?? ffmpegPath(), args(target), {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });
  const [code] = (await once(child, 'close')) as [number | null];
  if (code !== 0) {
    await rm(target, { force: true });
    throw new Error(`ffmpeg failed (exit ${code}):\n${stderr}`);
  }
  await rename(target, output);
}
