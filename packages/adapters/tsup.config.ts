import { defineConfig } from 'tsup';

export default defineConfig({
  // One entry per subpath export, so importing one adapter never pulls in
  // another adapter's peer dependency.
  entry: ['src/remotion.tsx'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['remotion', '@remotion/player', 'react', 'react-dom', /^react\//, /^react-dom\//],
});
