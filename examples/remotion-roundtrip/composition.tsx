import { fromRemotion, HaeComposition } from '@html-animation-engine/adapters/remotion';
import { frameCount } from '@html-animation-engine/core';
import shapeMorph from '../shape-morph/composition.js';
import { exampleDefaults } from '../index.js';

/** A Remotion component that plays an engine composition at its current frame. */
function Host() {
  return <HaeComposition composition={shapeMorph} />;
}

// Engine → Remotion → engine: if both directions are frame-exact, this draws
// the same pixels as the shape-morph example itself. The Remotion layer has a
// fixed frame rate, so it runs at 60 fps (the export default); the engine
// composition inside is drawn at t = frame / fps, so it is the same motion.
const FPS = 60;
export default fromRemotion({
  id: 'remotion-roundtrip',
  // Pixel-identical to shape-morph, so it sounds the same too.
  ...(shapeMorph.audio ? { audio: shapeMorph.audio } : {}),
  title: 'Engine inside Remotion inside the engine',
  component: Host,
  width: shapeMorph.width,
  height: shapeMorph.height,
  fps: FPS,
  durationInFrames: frameCount(shapeMorph.duration, FPS),
  background: shapeMorph.background,
  fontFaces: exampleDefaults.fontFaces,
  fonts: exampleDefaults.fonts,
});
