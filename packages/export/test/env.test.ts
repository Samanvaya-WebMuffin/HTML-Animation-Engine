import { describe, expect, it } from 'vitest';
import {
  checkEnvironment,
  formatReport,
  parseEncoders,
  type EnvironmentProbes,
} from '../src/index.js';

const ENCODERS_OUTPUT = `Encoders:
 V..... = Video
 ------
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)
 V....D libx265              libx265 H.265 / HEVC (codec hevc)
 V....D libvpx-vp9           libvpx VP9 (codec vp9)
 VF...D prores_ks            Apple ProRes (iCodec Pro) (codec prores)
 V....D gif                  GIF (Graphics Interchange Format)
 V....D apng                 APNG (Animated Portable Network Graphics) image
 V....D png                  PNG (Portable Network Graphics) image
 A....D aac                  AAC (Advanced Audio Coding)
`;

function probes(overrides: Partial<EnvironmentProbes> = {}): EnvironmentProbes {
  return {
    run: (_command, args) =>
      args.includes('-encoders')
        ? { ok: true, stdout: ENCODERS_OUTPUT }
        : { ok: true, stdout: 'ffmpeg version 8.0 Copyright\nmore' },
    exists: () => true,
    chromiumExecutable: () => Promise.resolve('/browsers/chromium'),
    ...overrides,
  };
}

describe('parseEncoders', () => {
  it('reads encoder names from ffmpeg -encoders output', () => {
    const names = parseEncoders(ENCODERS_OUTPUT);
    expect(names.has('libx264')).toBe(true);
    expect(names.has('prores_ks')).toBe(true);
    expect(names.has('aac')).toBe(true);
    expect(names.has('Video')).toBe(false);
  });
});

describe('checkEnvironment', () => {
  it('is ok when every tool and encoder is present', async () => {
    const report = await checkEnvironment(probes(), {});
    expect(report.ok).toBe(true);
    expect(report.ffmpeg.version).toBe('ffmpeg version 8.0 Copyright');
    expect(formatReport(report)).toContain('Ready to render.');
  });

  it('reports a missing ffmpeg with install instructions', async () => {
    const report = await checkEnvironment(probes({ run: () => ({ ok: false, stdout: '' }) }), {});
    expect(report.ok).toBe(false);
    expect(report.ffmpeg.problem).toMatch(/brew install ffmpeg/);
    expect(report.ffprobe.ok).toBe(false);
  });

  it('reports missing encoders', async () => {
    const run: EnvironmentProbes['run'] = (_c, args) =>
      args.includes('-encoders')
        ? { ok: true, stdout: ' V....D libx265   libx265 H.265\n' }
        : { ok: true, stdout: 'ffmpeg version 8.0' };
    const report = await checkEnvironment(probes({ run }), {});
    expect(report.ok).toBe(false);
    expect(report.ffmpeg.missingEncoders).toEqual(['libx264']);
    expect(report.ffmpeg.problem).toMatch(/libx264/);
  });

  it('reports a missing Chromium with install instructions', async () => {
    const report = await checkEnvironment(probes({ exists: () => false }), {});
    expect(report.ok).toBe(false);
    expect(report.chromium.problem).toMatch(/playwright install chromium/);
  });

  it('honours FFMPEG_PATH and FFPROBE_PATH', async () => {
    const seen: string[] = [];
    const run: EnvironmentProbes['run'] = (command, args) => {
      seen.push(command);
      return probes().run(command, args);
    };
    await checkEnvironment(probes({ run }), {
      FFMPEG_PATH: '/opt/ff/ffmpeg',
      FFPROBE_PATH: '/opt/ff/ffprobe',
    });
    expect(new Set(seen)).toEqual(new Set(['/opt/ff/ffmpeg', '/opt/ff/ffprobe']));
  });
});
