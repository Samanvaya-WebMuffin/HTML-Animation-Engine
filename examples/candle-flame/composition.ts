import { candleFlame, defineSceneComposition } from '@html-animation-engine/renderers';
import { exampleDefaults, theme } from '../index.js';
import { cue, pad, soundtrack, whoosh } from '../sounds.js';

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

/** A still candle is nearly silent: a warm, low bed and a faint breath of air. */
const audio = soundtrack([
  cue(0, pad(4.6, { attack: 1.4, release: 1.4, gain: 0.8 })),
  cue(0, whoosh(5.8, { from: 180, to: 420, peak: 0.45, gain: 0.45 })),
]);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'candle-flame',
  audio,
  title: 'Candle flame',
  duration: 6,
  background: theme.colors.ink,
  renderer: 'canvas',
  shader: flame,
});
