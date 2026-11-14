import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';
import type * as ExportApi from '../../packages/export/src/index.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const EXPORT_API = fileURLToPath(new URL('../../packages/export/src/index.ts', import.meta.url));
const OUT_DIR = `${ROOT}out/exports`;

/** The one export that can run at a time, as the page sees it. */
export interface ExportStatus {
  readonly state: 'idle' | 'running' | 'done' | 'error';
  readonly example?: string;
  readonly done?: number;
  readonly total?: number;
  readonly error?: string;
  /** File name to save as, once done. */
  readonly name?: string;
}

const EXAMPLE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * "Export 4K" for the playground: renders the current video with the same
 * export the CLI uses (`pnpm render`: 4K at 60 fps, 2160 × 3840 for a
 * portrait video, with its soundtrack) and serves the MP4 for download.
 *
 *   POST /__export?example=<name>   start (409 while another runs)
 *   GET  /__export/status           progress, as ExportStatus
 *   GET  /__export/download         the finished MP4
 *
 * Only on the dev server: export needs Node, headless Chromium and ffmpeg.
 */
export function exportServer(): Plugin {
  let status: ExportStatus = { state: 'idle' };
  let output: string | undefined;

  const json = (res: ServerResponse, code: number, body: unknown) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };

  async function run(server: ViteDevServer, example: string) {
    const api = (await server.ssrLoadModule(EXPORT_API)) as typeof ExportApi;
    const base = server.resolvedUrls?.local[0];
    if (!base) throw new Error('The dev server has no local URL.');
    await mkdir(OUT_DIR, { recursive: true });
    const file = `${OUT_DIR}/${example}-4k-60fps.mp4`;
    await api.renderVideo({
      url: new URL('capture.html', base).toString(),
      example,
      output: file,
      onProgress: (done, total) => {
        status = { state: 'running', example, done, total };
      },
    });
    output = file;
    status = { state: 'done', example, name: `${example}-4k-60fps.mp4` };
  }

  return {
    name: 'hae-export-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === '/__export' && req.method === 'POST') {
          const example = url.searchParams.get('example') ?? '';
          if (!EXAMPLE.test(example)) return json(res, 400, { error: 'Bad example name.' });
          if (status.state === 'running') return json(res, 409, status);
          status = { state: 'running', example, done: 0, total: 0 };
          output = undefined;
          run(server, example).catch((error: unknown) => {
            status = {
              state: 'error',
              example,
              error: error instanceof Error ? error.message : String(error),
            };
          });
          return json(res, 202, status);
        }
        if (url.pathname === '/__export/status') return json(res, 200, status);
        if (url.pathname === '/__export/download') {
          if (status.state !== 'done' || !output || !existsSync(output)) {
            return json(res, 404, { error: 'No finished export.' });
          }
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Length', String(statSync(output).size));
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${status.name ?? 'video.mp4'}"`,
          );
          createReadStream(output).pipe(res);
          return;
        }
        next();
      });
    },
  };
}
