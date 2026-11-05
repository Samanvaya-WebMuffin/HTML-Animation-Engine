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
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @html-animation-engine/playground dev',
    port: PORT,
    reuseExistingServer: !process.env['CI'],
  },
});
