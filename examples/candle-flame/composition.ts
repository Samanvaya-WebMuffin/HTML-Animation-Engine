import { candleFlame, defineSceneComposition } from '@html-animation-engine/renderers';
import { exampleDefaults, theme } from '../index.js';

// The flame's colours are physical (blackbody light), computed in the shader,
// so there are no theme colours to choose here beyond the fallback background.
const flame = candleFlame({
  x: 640,
  y: 392,
  height: 270,
  width: 78,
  candle: { width: 210, top: 430 },
  turbulence: 0.06,
  seed: 7,
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'candle-flame',
  title: 'Candle flame',
  duration: 6,
  background: theme.colors.ink,
  renderer: 'canvas',
  shader: flame,
});
