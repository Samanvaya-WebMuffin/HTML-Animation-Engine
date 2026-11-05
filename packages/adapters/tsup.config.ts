import { defineConfig } from 'tsup';

export default defineConfig({
  // One entry per subpath export, so importing one adapter never pulls in
  // another adapter's peer dependency.
  entry: ['src/gsap.ts', 'src/three.ts', 'src/framer-motion.ts', 'src/remotion.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['gsap', 'three', 'framer-motion', 'remotion', 'react'],
});
