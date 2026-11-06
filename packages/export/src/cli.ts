#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { checkEnvironment, formatReport } from './env.js';
import { renderAudio, renderStills, renderVideo } from './render.js';
import { isResolutionName, RESOLUTIONS, type ResolutionName } from './resolution.js';
import { startCaptureServer } from './server.js';

const USAGE = `Usage: hae <command> [options]

Commands:
  doctor                    Check ffmpeg, ffprobe and Playwright's Chromium
  render <example>          Render an example to an H.264 MP4
  stills <example>          Render chosen frames as PNGs plus a contact sheet
  audio <example>           Render only the soundtrack, as a 48 kHz 24-bit WAV

Render options:
  --out <file>              Output file (default: out/<example>.mp4)
  --resolution <name>       Fit inside ${Object.keys(RESOLUTIONS).join(' | ')} (default: 4k = 3840×2160)
  --scale <n>               Exact scale factor instead of --resolution
  --fps <n>                 Frame rate (default: 60; Remotion compositions keep their own)
  --from <s> --to <s>       Render only part of the composition
  --crf <n>                 x264 quality: 0 lossless, 18 visually lossless (default), 23 smaller
  --preset <name>           x264 preset (default: medium)
  --tune <name>             x264 tune, e.g. animation
  --audio <file>            Mux this audio file instead of the example's soundtrack
  --no-audio                Leave the soundtrack out (silent video)

Stills options:
  --at <s,s,...>            Times in seconds (default: the example's config stills)
  --out <dir>               Output directory (default: out/<example>/stills)
  --resolution, --scale     As for render

Audio options:
  --out <file>              Output file (default: out/<example>.wav)
  --from <s> --to <s>       As for render

Common:
  --root <dir>              App containing capture.html (default: apps/playground)
  -h, --help                Show this help
`;

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  out: { type: 'string' },
  resolution: { type: 'string' },
  scale: { type: 'string' },
  fps: { type: 'string' },
  from: { type: 'string' },
  to: { type: 'string' },
  crf: { type: 'string' },
  preset: { type: 'string' },
  tune: { type: 'string' },
  audio: { type: 'string' },
  'no-audio': { type: 'boolean' },
  at: { type: 'string' },
  root: { type: 'string' },
} as const;

function number(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`--${name} must be a number, got "${value}".`);
  return n;
}

function resolution(value: string | undefined): ResolutionName | undefined {
  if (value === undefined) return undefined;
  const name = value.toLowerCase();
  if (!isResolutionName(name)) {
    throw new Error(
      `--resolution must be one of ${Object.keys(RESOLUTIONS).join(', ')}, got "${value}".`,
    );
  }
  return name;
}

/** Live progress on a terminal; a line per 25 % when output is piped or logged. */
function progressLine(label: string) {
  const started = Date.now();
  const interactive = process.stderr.isTTY;
  let lastQuarter = -1;
  return (done: number, total: number) => {
    const seconds = (Date.now() - started) / 1000;
    const rate = done / Math.max(seconds, 1e-3);
    const eta = (total - done) / Math.max(rate, 1e-3);
    const text = `${label} ${done}/${total} frames  ${rate.toFixed(1)} fps  ETA ${eta.toFixed(0)}s`;
    if (interactive) {
      process.stderr.write(`\r${text}   ${done === total ? '\n' : ''}`);
      return;
    }
    const quarter = Math.floor((done / total) * 4);
    if (quarter !== lastQuarter) {
      lastQuarter = quarter;
      process.stderr.write(`${text}\n`);
    }
  };
}

export async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: OPTIONS,
  });
  const [command, example] = positionals;
  if (values.help || !command) {
    process.stdout.write(USAGE);
    return command || values.help ? 0 : 1;
  }
  if (command === 'doctor') {
    const report = await checkEnvironment();
    process.stdout.write(`${formatReport(report)}\n`);
    return report.ok ? 0 : 1;
  }
  if (command !== 'render' && command !== 'stills' && command !== 'audio') {
    process.stderr.write(`Unknown command "${command}".\n\n${USAGE}`);
    return 1;
  }
  if (!example) {
    process.stderr.write(`hae ${command}: name an example, e.g. "hae ${command} shape-morph".\n`);
    return 1;
  }

  const report = await checkEnvironment();
  if (!report.ok) {
    process.stderr.write(`${formatReport(report)}\n`);
    return 1;
  }

  const root = resolve(values.root ?? 'apps/playground');
  if (!existsSync(resolve(root, 'capture.html'))) {
    process.stderr.write(`No capture.html in ${root}. Run from the repo root or pass --root.\n`);
    return 1;
  }
  const size = {
    ...(values.resolution === undefined ? {} : { resolution: resolution(values.resolution) }),
    ...(values.scale === undefined ? {} : { scale: number('scale', values.scale) }),
  };
  const fps = number('fps', values.fps);

  const server = await startCaptureServer(root);
  try {
    if (command === 'stills') {
      const at = values.at?.split(',').map((v) => number('at', v.trim()) as number);
      const result = await renderStills({
        url: server.url,
        example,
        outDir: resolve(values.out ?? `out/${example}/stills`),
        ...(at ? { at } : {}),
        ...(fps === undefined ? {} : { fps }),
        ...size,
      } as Parameters<typeof renderStills>[0]);
      process.stdout.write(
        `${result.files.length} stills at ${result.width}×${result.height}:\n` +
          result.files.map((f) => `  ${f}`).join('\n') +
          `\ncontact sheet: ${result.contactSheet}\n`,
      );
      return 0;
    }

    if (command === 'audio') {
      const result = await renderAudio({
        url: server.url,
        example,
        output: resolve(values.out ?? `out/${example}.wav`),
        ...(values.from === undefined ? {} : { from: number('from', values.from) }),
        ...(values.to === undefined ? {} : { to: number('to', values.to) }),
      } as Parameters<typeof renderAudio>[0]);
      process.stdout.write(
        `${result.output}\n  ${result.events} sounds, ${result.seconds.toFixed(2)}s, 48 kHz 24-bit stereo\n`,
      );
      return 0;
    }

    const output = resolve(values.out ?? `out/${example}.mp4`);
    const result = await renderVideo({
      url: server.url,
      example,
      output,
      onProgress: progressLine(`rendering ${example}`),
      onWarning: (message: string) => process.stderr.write(`warning: ${message}\n`),
      ...size,
      ...(fps === undefined ? {} : { fps }),
      ...(values.from === undefined ? {} : { from: number('from', values.from) }),
      ...(values.to === undefined ? {} : { to: number('to', values.to) }),
      ...(values.crf === undefined ? {} : { crf: number('crf', values.crf) }),
      ...(values.preset === undefined ? {} : { preset: values.preset }),
      ...(values.tune === undefined ? {} : { tune: values.tune }),
      ...(values.audio === undefined ? {} : { audio: resolve(values.audio) }),
      ...(values['no-audio'] ? { sound: false } : {}),
    } as Parameters<typeof renderVideo>[0]);
    const sound =
      result.audio === 'soundtrack'
        ? ', with soundtrack'
        : result.audio === 'file'
          ? ', with audio'
          : '';
    process.stdout.write(
      `${result.output}\n  ${result.width}×${result.height}, ${result.fps} fps, ${result.frames} frames ` +
        `(${result.seconds.toFixed(2)}s)${sound} in ${(result.elapsedMs / 1000).toFixed(1)}s\n`,
    );
    return 0;
  } finally {
    await server.close();
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
