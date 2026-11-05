import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

export default defineConfig({
  testDir: 'tests/visual',
  // Goldens differ by OS (font rasterisation), so each platform keeps its own set.
  snapshotPathTemplate: '{testDir}/__goldens__/{platform}/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // No tracing: the trace recorder's screencast forces extra compositor
    // frames, which can capture DOM text rasterised under a previous frame's
    // transform and break byte-identical frames. Pass `--trace on` only when
    // debugging, and expect determinism tests to be unreliable while it is on.
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @html-animation-engine/playground dev',
    port: PORT,
    reuseExistingServer: !process.env['CI'],
  },
});
