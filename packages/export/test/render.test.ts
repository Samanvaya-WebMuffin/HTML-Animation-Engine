import { describe, expect, it } from 'vitest';
import { encodeArgs, frameRange, outputSize, RESOLUTIONS, scaleFor } from '../src/index.js';

describe('resolution presets', () => {
  it('fits a 16:9 composition to UHD 4K exactly', () => {
    expect(scaleFor(1280, 720, '4k')).toBe(3);
    expect(outputSize(1280, 720, 3)).toEqual({ width: 3840, height: 2160 });
    expect(scaleFor(1920, 1080, '4k')).toBe(2);
  });

  it('fits other aspect ratios inside the bounds', () => {
    expect(outputSize(1080, 1080, scaleFor(1080, 1080, '4k'))).toEqual({
      width: 2160,
      height: 2160,
    });
    expect(outputSize(1080, 1920, scaleFor(1080, 1920, '4k'))).toEqual({
      width: 1214,
      height: 2160,
    });
  });

  it('keeps output dimensions even (required by 4:2:0 video)', () => {
    expect(outputSize(1001, 501, 1)).toEqual({ width: 1000, height: 500 });
  });

  it('has the expected presets', () => {
    expect(Object.keys(RESOLUTIONS)).toEqual(['4k', '1440p', '1080p', '720p']);
  });
});

describe('frameRange', () => {
  const info = { duration: 6 };

  it('covers the whole composition by default', () => {
    expect(frameRange(info, 30)).toEqual({ first: 0, count: 180 });
  });

  it('aligns partial ranges to the frame grid', () => {
    expect(frameRange(info, 30, 0.5, 1)).toEqual({ first: 15, count: 15 });
    expect(frameRange(info, 24, 1, 2.5)).toEqual({ first: 24, count: 36 });
  });

  it('rejects ranges outside the composition', () => {
    expect(() => frameRange(info, 30, 2, 1)).toThrow(RangeError);
    expect(() => frameRange(info, 30, 0, 7)).toThrow(RangeError);
    expect(() => frameRange(info, 30, -1, 1)).toThrow(RangeError);
  });
});

describe('encodeArgs', () => {
  const args = encodeArgs({ output: '/tmp/x.mp4', fps: 30 }, '/tmp/x.partial');

  it('reads PNG frames from stdin and writes H.264 MP4 to the temporary path', () => {
    expect(args.join(' ')).toContain('-f image2pipe -framerate 30 -c:v png -i pipe:0');
    expect(args).toContain('libx264');
    expect(args.at(-1)).toBe('/tmp/x.partial');
    expect(args.join(' ')).toContain('-movflags +faststart');
  });

  it('converts and tags colour as Rec. 709, limited range, 4:2:0', () => {
    const filters = args[args.indexOf('-vf') + 1] ?? '';
    expect(filters).toContain('out_color_matrix=bt709');
    expect(filters).toContain('format=yuv420p');
    expect(filters).toContain(
      'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    );
  });

  it('defaults to CRF 18 and the medium preset, and passes overrides through', () => {
    expect(args.join(' ')).toContain('-preset medium -crf 18');
    const custom = encodeArgs(
      { output: 'o', fps: 60, crf: 0, preset: 'slow', tune: 'animation' },
      't',
    );
    expect(custom.join(' ')).toContain('-preset slow -tune animation -crf 0');
    expect(custom.join(' ')).toContain('-framerate 60');
  });
});
