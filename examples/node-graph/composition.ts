import { createNoise } from '@html-animation-engine/core';
import { backdrop, defineSceneComposition, nodeGraph } from '@html-animation-engine/renderers';
import { exampleDefaults, lighting, theme } from '../index.js';
import { bell, cue, pad, pluck, seeded, snap, soundtrack } from '../sounds.js';

const { colors } = theme;
const W = exampleDefaults.width;
const H = exampleDefaults.height;
const LOOP = 6;

const graph = nodeGraph({
  id: 'graph',
  seed: 'graph',
  count: 42,
  bounds: { x: 60, y: 60, width: 1160, height: 600 },
  loopDuration: LOOP,
  drift: 60,
  linkDistance: 220,
  neighbours: 3,
  nodeRadius: 5,
  nodeColor: colors.blue,
  linkColor: colors.violet,
  linkWidth: 1.5,
  glow: { core: colors.light, linkOpacity: 0.22 },
  depth: 0.7,
});

// Two coloured light pools drift slowly behind the graph and loop with it.
const drift = createNoise('node-graph-light');

/** Calm and generative: a seeded pentatonic phrase that loops with the drift, and two soft snaps. */
const audio = soundtrack([
  cue(0, pad(LOOP - 1.4, { chord: 'shadow', attack: 1, release: 1.4 })),
  Array.from({ length: 12 }, (_, i) =>
    cue(
      i * 0.5,
      i % 4 === 3
        ? bell({ degree: 5 + Math.floor(seeded('graph', i) * 5), gain: 0.45 })
        : pluck({
            degree: Math.floor(seeded('graph', i) * 8),
            octave: 1,
            gain: 0.55,
            pan: seeded('graph-pan', i) - 0.5,
          }),
    ),
  ),
  cue(1.5, snap({ degree: 4, gain: 0.55, pan: -0.3 })),
  cue(4.5, snap({ degree: 2, take: 1, gain: 0.55, pan: 0.3 })),
]);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'node-graph',
  audio,
  title: 'Node graph',
  duration: 6,
  background: colors.ink,
  renderer: 'svg',
  scene(t) {
    const p = t / LOOP;
    const sky = backdrop('backdrop', lighting, {
      width: W,
      height: H,
      lights: [
        {
          x: 380 + 120 * drift.loop(p, 0.5, 0),
          y: 300 + 80 * drift.loop(p, 0.5, 1),
          radius: 520,
          color: colors.blue,
          alpha: 0.14,
        },
        {
          x: 920 + 120 * drift.loop(p, 0.5, 2),
          y: 420 + 80 * drift.loop(p, 0.5, 3),
          radius: 480,
          color: colors.violet,
          alpha: 0.14,
        },
      ],
    });
    return { world: [sky, graph(t)] };
  },
});
