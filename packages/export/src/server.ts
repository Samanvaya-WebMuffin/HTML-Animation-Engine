import { join } from 'node:path';

export interface CaptureServer {
  /** URL of the capture page (capture.html). */
  readonly url: string;
  close(): Promise<void>;
}

/**
 * Starts a Vite dev server for an app that contains `capture.html` (in this
 * repo: apps/playground) on a free port.
 */
export async function startCaptureServer(root: string): Promise<CaptureServer> {
  const { createServer } = await import('vite');
  const server = await createServer({
    root,
    configFile: join(root, 'vite.config.ts'),
    logLevel: 'error',
    clearScreen: false,
    server: { port: 0, strictPort: false, hmr: false },
  });
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  if (!base) {
    await server.close();
    throw new Error('Capture server did not report a URL.');
  }
  return {
    url: new URL('capture.html', base).toString(),
    close: () => server.close(),
  };
}
