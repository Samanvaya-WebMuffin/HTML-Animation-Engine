import { defineConfig } from 'vitest/config';

// End-to-end export tests: real Chromium, a Vite capture server and ffmpeg.
// Slow, so they run separately: `pnpm test:export`.
const conditions = ['source', 'module', 'development|production'];

export default defineConfig({
  resolve: { conditions: [...conditions, 'browser'] },
  ssr: { resolve: { conditions: [...conditions, 'node'] } },
  test: {
    include: ['tests/export/**/*.test.ts'],
    environment: 'node',
    testTimeout: 300_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
