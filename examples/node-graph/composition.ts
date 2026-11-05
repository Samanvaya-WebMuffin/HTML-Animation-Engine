import { defineSceneComposition, nodeGraph } from '@html-animation-engine/renderers';
import { exampleDefaults, theme } from '../index.js';

const { colors } = theme;

const graph = nodeGraph({
  id: 'graph',
  seed: 'graph',
  count: 42,
  bounds: { x: 60, y: 60, width: 1160, height: 600 },
  loopDuration: 6,
  drift: 60,
  linkDistance: 220,
  neighbours: 3,
  nodeRadius: 5,
  nodeColor: colors.blue,
  linkColor: colors.violet,
  linkWidth: 1.5,
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'node-graph',
  title: 'Node graph',
  duration: 6,
  background: colors.ink,
  renderer: 'svg',
  scene(t) {
    return { world: [graph(t)] };
  },
});
