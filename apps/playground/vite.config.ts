import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const EXAMPLES = fileURLToPath(new URL('../../examples', import.meta.url));

/**
 * Vite only watches the app's own folder, but the example list comes from an
 * `import.meta.glob` over `examples/`. Watching it makes new example folders
 * appear without restarting the dev server.
 */
function watchExamples(): Plugin {
  return {
    name: 'hae-watch-examples',
    configureServer(server) {
      server.watcher.add(EXAMPLES);
    },
  };
}

export default defineConfig({
  plugins: [watchExamples()],
  // Resolve workspace packages to their TypeScript sources (see the "source"
  // export condition in each package.json), so no build step is needed.
  resolve: { conditions: ['source', 'module', 'browser', 'development|production'] },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        capture: fileURLToPath(new URL('./capture.html', import.meta.url)),
      },
    },
  },
});
