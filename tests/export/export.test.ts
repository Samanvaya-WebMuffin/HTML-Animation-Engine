import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeWav } from '../../packages/core/src/index.js';
import {
  audioHash,
  frameHashes,
  probeVideo,
  renderAudio,
  renderStills,
  renderVideo,
  startCaptureServer,
  type CaptureServer,
} from '../../packages/export/src/index.js';

let server: CaptureServer;
let browser: Browser;
let dir: string;

beforeAll(async () => {
  server = await startCaptureServer(join(import.meta.dirname, '../../apps/playground'));
  browser = await chromium.launch();
  dir = mkdtempSync(join(tmpdir(), 'hae-export-'));
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  rmSync(dir, { recursive: true, force: true });
});

const render = (example: string, output: string, options: Record<string, unknown> = {}) =>
  renderVideo({ url: server.url, browser, example, output: join(dir, output), ...options });

describe('4K MP4 export', () => {
  it('writes 4K 60 fps H.264 by default, with exact frame count, duration and Rec. 709 tags', async () => {
    // shape-morph is authored at 30 fps; export samples it at 60 by default.
    const result = await render('shape-morph', 'a.mp4', { to: 1 });
    expect(result).toMatchObject({ width: 3840, height: 2160, fps: 60, frames: 60 });
    const probe = await probeVideo(result.output);
    expect(probe).toMatchObject({
      codec: 'h264',
      profile: 'High',
      width: 3840,
      height: 2160,
      pixelFormat: 'yuv420p',
      fps: 60,
      frames: 60,
      colorSpace: 'bt709',
      colorPrimaries: 'bt709',
      colorTransfer: 'bt709',
      // The example's own soundtrack, rendered and muxed by default.
      audioCodec: 'aac',
      audioSampleRate: 48000,
      audioChannels: 2,
    });
    expect(result.audio).toBe('soundtrack');
    expect(probe.duration).toBeCloseTo(1, 1);
  });

  it('re-renders to the same soundtrack, and leaves it out on request', async () => {
    const again = await render('shape-morph', 'a2.mp4', { to: 1, resolution: '720p' });
    const silent = await render('shape-morph', 'silent.mp4', {
      to: 1,
      sound: false,
      resolution: '720p',
    });
    const first = await audioHash(join(dir, 'a.mp4'));
    expect(first).toBeDefined();
    expect(await audioHash(again.output)).toBe(first);
    expect(silent.audio).toBeUndefined();
    expect((await probeVideo(silent.output)).audioCodec).toBeUndefined();
  });

  it("renders a range's soundtrack as exactly that span of the full soundtrack", async () => {
    const opts = { url: server.url, browser, example: 'shape-morph' };
    await renderAudio({ ...opts, output: join(dir, 'full.wav') });
    await renderAudio({ ...opts, output: join(dir, 'part.wav'), from: 3, to: 4 });
    const full = decodeWav(readFileSync(join(dir, 'full.wav')));
    const part = decodeWav(readFileSync(join(dir, 'part.wav')));
    expect(full.sampleRate).toBe(48000);
    expect(full.channels[0]).toHaveLength(5.5 * 48000);
    expect(part.channels[0]).toHaveLength(48000);
    // The clap at 3.2 s (and the reverb carried over from before 3 s) is in the slice, sample for sample.
    expect(part.channels[0]).toEqual(full.channels[0]?.subarray(3 * 48000, 4 * 48000));
    expect(Math.max(...(part.channels[0] ?? []).map(Math.abs))).toBeGreaterThan(0.3);
  });

  it('re-renders to the same frames', async () => {
    const [a, b] = await Promise.all([
      frameHashes(join(dir, 'a.mp4')),
      render('shape-morph', 'b.mp4', { to: 1 }).then((r) => frameHashes(r.output)),
    ]);
    expect(a).toHaveLength(60); // 1 s at 60 fps
    expect(b).toEqual(a);
  });

  it('renders a time range as exactly those frames of the full render (lossless)', async () => {
    const full = await render('shape-morph', 'full.mp4', { to: 1, crf: 0, resolution: '1080p' });
    const part = await render('shape-morph', 'part.mp4', {
      from: 0.5,
      to: 1,
      crf: 0,
      resolution: '1080p',
    });
    const [all, slice] = await Promise.all([frameHashes(full.output), frameHashes(part.output)]);
    expect(slice).toHaveLength(30); // 0.5 s at 60 fps
    expect(slice).toEqual(all.slice(30));
  });

  it('muxes audio without touching the video stream', async () => {
    const wav = join(dir, 'tone.wav');
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      wav,
    ]);
    const result = await render('shape-morph', 'audio.mp4', { to: 1, audio: wav });
    const probe = await probeVideo(result.output);
    expect(probe.audioCodec).toBe('aac');
    expect(probe.duration).toBeCloseTo(1, 1);
    expect(await frameHashes(result.output)).toEqual(await frameHashes(join(dir, 'a.mp4')));
  });

  it('leaves no partial files behind when encoding fails', async () => {
    await expect(
      render('shape-morph', 'broken.mp4', { to: 0.2, preset: 'no-such-preset' }),
    ).rejects.toThrow(/ffmpeg/);
    expect(readdirSync(dir).filter((f) => f.startsWith('broken'))).toEqual([]);
  });
});

describe('every composition type exports deterministically', () => {
  it.each([
    ['candle-flame', 'WebGL shader'],
    ['remotion-title', 'Remotion / React'],
    ['fly-through', 'Canvas 3D'],
    ['counter-roll', 'DOM text'],
  ])('%s (%s)', async (example) => {
    const a = await render(example, `${example}-1.mp4`, { from: 1, to: 1.5, resolution: '1080p' });
    const b = await render(example, `${example}-2.mp4`, { from: 1, to: 1.5, resolution: '1080p' });
    expect((await probeVideo(a.output)).frames).toBe(30); // 0.5 s at 60 fps
    expect(await frameHashes(b.output)).toEqual(await frameHashes(a.output));
  });
});

describe('stills', () => {
  it('writes full-resolution PNGs and a contact sheet', async () => {
    const result = await renderStills({
      url: server.url,
      browser,
      example: 'shape-morph',
      outDir: join(dir, 'stills'),
      at: [0.3, 1.5, 3.5],
    });
    expect(result.files).toHaveLength(3);
    for (const file of result.files) {
      const png = PNG.sync.read(readFileSync(file));
      expect([png.width, png.height]).toEqual([3840, 2160]);
    }
    const sheet = PNG.sync.read(readFileSync(result.contactSheet));
    expect(sheet.width).toBe(3 * 640 + 4 * 8); // 3 tiles, padding and margins
  });

  it('rejects times outside the composition', async () => {
    await expect(
      renderStills({
        url: server.url,
        browser,
        example: 'shape-morph',
        outDir: join(dir, 'bad'),
        at: [99],
      }),
    ).rejects.toThrow(RangeError);
  });
});
