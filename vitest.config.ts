import { defineConfig } from 'vitest/config';

// Resolve workspace packages to their TypeScript sources via the "source"
// export condition, so tests never depend on a prior build.
const conditions = ['source', 'module', 'development|production'];

export default defineConfig({
  resolve: { conditions: [...conditions, 'browser'] },
  ssr: { resolve: { conditions: [...conditions, 'node'] } },
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
      'examples/**/*.test.ts',
      'tests/unit/**/*.test.ts',
    ],
    environment: 'node',
  },
});
