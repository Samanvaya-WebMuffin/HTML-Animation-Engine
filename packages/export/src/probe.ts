import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath, ffprobePath } from './env.js';

const run = promisify(execFile);

export interface VideoProbe {
  readonly codec: string;
  readonly profile: string;
  readonly width: number;
  readonly height: number;
  readonly pixelFormat: string;
  readonly fps: number;
  readonly frames: number;
  readonly duration: number;
  readonly colorSpace: string;
  readonly colorPrimaries: string;
  readonly colorTransfer: string;
  readonly audioCodec: string | undefined;
  readonly audioSampleRate: number | undefined;
  readonly audioChannels: number | undefined;
}

/** Reads the video (and audio) stream properties with ffprobe, counting frames exactly. */
export async function probeVideo(path: string): Promise<VideoProbe> {
  const { stdout } = await run(
    ffprobePath(),
    ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', path],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const data = JSON.parse(stdout) as {
    streams: Record<string, string | number | undefined>[];
    format: { duration?: string };
  };
  const video = data.streams.find((s) => s['codec_type'] === 'video');
  if (!video) throw new Error(`No video stream in ${path}`);
  const audio = data.streams.find((s) => s['codec_type'] === 'audio');
  const [num = 0, den = 1] = String(video['r_frame_rate']).split('/').map(Number);
  return {
    codec: String(video['codec_name']),
    profile: String(video['profile']),
    width: Number(video['width']),
    height: Number(video['height']),
    pixelFormat: String(video['pix_fmt']),
    fps: num / den,
    frames: Number(video['nb_read_frames']),
    duration: Number(data.format.duration),
    colorSpace: String(video['color_space']),
    colorPrimaries: String(video['color_primaries']),
    colorTransfer: String(video['color_transfer']),
    audioCodec: audio ? String(audio['codec_name']) : undefined,
    audioSampleRate: audio ? Number(audio['sample_rate']) : undefined,
    audioChannels: audio ? Number(audio['channels']) : undefined,
  };
}

/** MD5 of the decoded audio stream (undefined when there is none). */
export async function audioHash(path: string): Promise<string | undefined> {
  const { stdout } = await run(ffmpegPath(), [
    '-v',
    'error',
    '-i',
    path,
    '-map',
    '0:a?',
    '-f',
    'md5',
    '-',
  ]);
  const hash = stdout.trim().replace(/^MD5=/, '');
  return hash === 'd41d8cd98f00b204e9800998ecf8427e' || !hash ? undefined : hash;
}

/** MD5 of every decoded frame: equal lists mean the videos match frame for frame. */
export async function frameHashes(path: string): Promise<string[]> {
  const { stdout } = await run(
    ffmpegPath(),
    ['-v', 'error', '-i', path, '-map', '0:v', '-f', 'framemd5', '-'],
    {
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return stdout
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(',').at(-1)?.trim() ?? '');
}
