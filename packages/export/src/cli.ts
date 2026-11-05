#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { checkEnvironment, formatReport } from './env.js';

const USAGE = `Usage: hae <command> [options]

Commands:
  doctor                 Check ffmpeg, ffprobe and Playwright's Chromium
  render <example>       Render an example to video or images
  stills <example>       Render selected frames plus a contact sheet

Options:
  -h, --help             Show this help
`;

async function main(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: { help: { type: 'boolean', short: 'h' } },
  });
  const [command] = positionals;

  if (values['help'] || !command) {
    process.stdout.write(USAGE);
    return command || values['help'] ? 0 : 1;
  }

  switch (command) {
    case 'doctor': {
      const report = await checkEnvironment();
      process.stdout.write(`${formatReport(report)}\n`);
      return report.ok ? 0 : 1;
    }
    case 'render':
    case 'stills':
      process.stderr.write(`hae ${command}: not implemented yet.\n`);
      return 1;
    default:
      process.stderr.write(`Unknown command "${command}".\n\n${USAGE}`);
      return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
