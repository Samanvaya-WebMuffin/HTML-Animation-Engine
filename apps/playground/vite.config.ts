import { defineConfig } from 'vite';

export default defineConfig({
  // Resolve workspace packages to their TypeScript sources (see the "source"
  // export condition in each package.json), so no build step is needed.
  resolve: { conditions: ['source', 'module', 'browser', 'development|production'] },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
