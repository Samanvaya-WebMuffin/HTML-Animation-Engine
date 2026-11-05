import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** ffmpeg encoders that the export formats depend on. */
export const REQUIRED_ENCODERS = {
  libx264: 'MP4 (H.264)',
} as const;

export type EncoderName = keyof typeof REQUIRED_ENCODERS;

export interface ToolStatus {
  ok: boolean;
  /** Resolved command or executable path. */
  path: string;
  /** First line of `-version` output, or the browser build. */
  version?: string;
  /** Why the tool is unusable, and how to fix it. */
  problem?: string;
}

export interface EnvironmentReport {
  ok: boolean;
  ffmpeg: ToolStatus & { missingEncoders: EncoderName[] };
  ffprobe: ToolStatus;
  chromium: ToolStatus;
}

export const INSTALL_HINTS = {
  ffmpeg:
    'Install ffmpeg (includes ffprobe): `brew install ffmpeg` on macOS, ' +
    '`sudo apt-get install ffmpeg` on Debian/Ubuntu, or set FFMPEG_PATH and FFPROBE_PATH.',
  chromium: 'Install the Playwright browser: `pnpm exec playwright install chromium`.',
} as const;

/** Side-effecting probes, injectable for tests. */
export interface EnvironmentProbes {
  run(command: string, args: string[]): { ok: boolean; stdout: string };
  exists(path: string): boolean;
  chromiumExecutable(): Promise<string>;
}

const defaultProbes: EnvironmentProbes = {
  run(command, args) {
    const result = spawnSync(command, args, { encoding: 'utf8' });
    return { ok: result.status === 0, stdout: result.stdout ?? '' };
  },
  exists: existsSync,
  async chromiumExecutable() {
    const { chromium } = await import('playwright');
    return chromium.executablePath();
  },
};

export function ffmpegPath(env: NodeJS.ProcessEnv = process.env): string {
  return env['FFMPEG_PATH'] ?? 'ffmpeg';
}

export function ffprobePath(env: NodeJS.ProcessEnv = process.env): string {
  return env['FFPROBE_PATH'] ?? 'ffprobe';
}

function probeVersion(probes: EnvironmentProbes, command: string, name: string): ToolStatus {
  const { ok, stdout } = probes.run(command, ['-hide_banner', '-version']);
  if (!ok) {
    return { ok: false, path: command, problem: `${name} not found. ${INSTALL_HINTS.ffmpeg}` };
  }
  return { ok: true, path: command, version: stdout.split('\n')[0]?.trim() ?? '' };
}

/** Parses `ffmpeg -encoders` output into the set of encoder names. */
export function parseEncoders(output: string): Set<string> {
  const names = new Set<string>();
  for (const line of output.split('\n')) {
    // Lines look like: " V....D libx264   libx264 H.264 / AVC ..."
    const match = /^\s[VAS.][F.][S.][X.][B.][D.]\s+(\S+)/.exec(line);
    if (match?.[1]) names.add(match[1]);
  }
  return names;
}

/**
 * Checks that ffmpeg, ffprobe and Playwright's Chromium are installed, and
 * that ffmpeg has every encoder the export formats need.
 */
export async function checkEnvironment(
  probes: EnvironmentProbes = defaultProbes,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EnvironmentReport> {
  const ffmpegStatus = probeVersion(probes, ffmpegPath(env), 'ffmpeg');
  let missingEncoders: EncoderName[] = [];
  if (ffmpegStatus.ok) {
    const encoders = parseEncoders(
      probes.run(ffmpegPath(env), ['-hide_banner', '-encoders']).stdout,
    );
    missingEncoders = (Object.keys(REQUIRED_ENCODERS) as EncoderName[]).filter(
      (name) => !encoders.has(name),
    );
    if (missingEncoders.length > 0) {
      ffmpegStatus.problem =
        `ffmpeg is missing encoders: ${missingEncoders.join(', ')}. ` +
        'Install a full ffmpeg build (Homebrew and most distro builds include them).';
    }
  }

  const ffprobe = probeVersion(probes, ffprobePath(env), 'ffprobe');

  let chromium: ToolStatus;
  try {
    const path = await probes.chromiumExecutable();
    chromium = probes.exists(path)
      ? { ok: true, path }
      : { ok: false, path, problem: `Chromium not found at ${path}. ${INSTALL_HINTS.chromium}` };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    chromium = { ok: false, path: '', problem: `${reason}. ${INSTALL_HINTS.chromium}` };
  }

  const ffmpeg = { ...ffmpegStatus, missingEncoders };
  return {
    ok: ffmpeg.ok && missingEncoders.length === 0 && ffprobe.ok && chromium.ok,
    ffmpeg,
    ffprobe,
    chromium,
  };
}

/** Human-readable report for the `doctor` command. */
export function formatReport(report: EnvironmentReport): string {
  const line = (name: string, status: ToolStatus) =>
    status.ok && !status.problem
      ? `  ✓ ${name.padEnd(8)} ${status.version ?? status.path}`
      : `  ✗ ${name.padEnd(8)} ${status.problem ?? 'unavailable'}`;
  return [
    'HTML-Animation-Engine export environment',
    line('ffmpeg', report.ffmpeg),
    line('ffprobe', report.ffprobe),
    line('chromium', report.chromium),
    '',
    report.ok ? 'Ready to render.' : 'Not ready to render: fix the items marked ✗.',
  ].join('\n');
}
