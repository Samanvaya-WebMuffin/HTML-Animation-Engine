import { fromRemotion, HaeComposition } from '@html-animation-engine/adapters/remotion';
import { frameCount } from '@html-animation-engine/core';
import shapeMorph from '../shape-morph/composition.js';
import { exampleDefaults } from '../index.js';

/** A Remotion component that plays an engine composition at its current frame. */
function Host() {
  return <HaeComposition composition={shapeMorph} />;
}

// Engine → Remotion → engine: if both directions are frame-exact, this draws
// the same pixels as the shape-morph example itself.
export default fromRemotion({
  id: 'remotion-roundtrip',
  title: 'Engine inside Remotion inside the engine',
  component: Host,
  width: shapeMorph.width,
  height: shapeMorph.height,
  fps: shapeMorph.fps,
  durationInFrames: frameCount(shapeMorph.duration, shapeMorph.fps),
  background: shapeMorph.background,
  fontFaces: exampleDefaults.fontFaces,
  fonts: exampleDefaults.fonts,
});
