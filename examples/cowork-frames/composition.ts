import {
  createCanvasMeasurer,
  groupNode,
  rect,
  shapeNode,
  type SceneNode,
} from '@html-animation-engine/core';
import {
  aurora,
  defineSceneComposition,
  edgeFade,
  gridBackdrop,
  viewTransform,
  type BoardView,
} from '@html-animation-engine/renderers';
import {
  BOARD_FONTS,
  FH,
  FW,
  GROUPS,
  auroraPools,
  createBoard,
  groupArt,
  groupView,
  overviewView,
  threads,
  LOST,
  OPENING,
  QUERIES,
  type Board,
  type GroupId,
} from '../cowork-board.js';
import { C, LOOK_FONTS } from '../cowork-look.js';
import { phoneDefaults } from '../index.js';
import { cue, soundtrack, tick } from '../sounds.js';

/**
 * Style frames for the queries video's overhaul (phase 2): the whole mood
 * board, then each scene's group at its key moment, one second each. Nothing
 * moves; this is for approving the look of every scene before animating.
 */
const FRAMES: readonly { group: GroupId | 'overview'; lt?: number; beat?: 'a' | 'b' }[] = [
  { group: 'overview' },
  { group: 'queries', lt: QUERIES.full },
  { group: 'queries', lt: QUERIES.crack.start + 1.2 },
  { group: 'lost', lt: OPENING.flood.start },
  { group: 'lost', lt: LOST.b.start + 3.6 },
  { group: 'criteria' },
  { group: 'intro' },
  { group: 'ask' },
  { group: 'work' },
  { group: 'answers' },
  { group: 'outro' },
];

const FRAME = { width: FW, height: FH };
const light = aurora({ id: 'aurora', seed: 'cowork-board', pools: auroraPools, drift: 0 });
const grid = gridBackdrop({
  id: 'grid',
  x: -1400,
  y: -1400,
  width: 6400,
  height: 7800,
  cell: 120,
  color: C.bg.grid,
  majorColor: C.bg.gridMajor,
});

function frameAt(t: number) {
  return (
    FRAMES[Math.min(FRAMES.length - 1, Math.max(0, Math.floor(t)))] ?? {
      group: 'overview' as const,
    }
  );
}

/** Groups near the view (all of them for the overview). */
function visible(view: BoardView): GroupId[] {
  const halfW = FW / 2 / view.zoom + FW;
  const halfH = FH / 2 / view.zoom + FH;
  return GROUPS.filter(
    (g) => Math.abs(g.x + FW / 2 - view.x) < halfW && Math.abs(g.y + FH / 2 - view.y) < halfH,
  ).map((g) => g.id);
}

function world(t: number, board: Board): SceneNode[] {
  const frame = frameAt(t);
  const view = frame.group === 'overview' ? overviewView() : groupView(frame.group);
  const content: SceneNode[] = [...threads(frame.group === 'overview' ? 14 : 3)];
  for (const id of visible(view)) {
    const own = frame.group === id;
    content.push(
      groupNode(
        `group-${id}`,
        groupArt(
          board,
          id,
          own
            ? { ...(frame.lt === undefined ? {} : { lt: frame.lt }), beat: frame.beat ?? 'a' }
            : {},
        ),
      ),
    );
  }
  return [
    shapeNode('base', { geometry: rect(FW / 2, FH / 2, FW, FH), fill: C.bg.canvas }),
    groupNode('far', [light(0)], { transform: viewTransform(view, FRAME) }),
    groupNode('board-grid', [grid], { transform: viewTransform(view, FRAME) }),
    edgeFade('fade', FRAME, C.bg.canvas, 0.3),
    groupNode('board', content, { transform: viewTransform(view, FRAME) }),
  ];
}

export default defineSceneComposition({
  ...phoneDefaults,
  fonts: [...phoneDefaults.fonts, ...LOOK_FONTS, ...BOARD_FONTS],
  id: 'cowork-frames',
  seed: 'cowork-frames',
  audio: soundtrack(FRAMES.map((_, k) => cue(k + 0.02, tick({ degree: 4, gain: 0.3 })))),
  title: 'Cowork style frames',
  duration: FRAMES.length,
  background: C.bg.canvas,
  renderer: 'svg',
  setup: async () => createBoard(createCanvasMeasurer()),
  scene: (t, _ctx, board) => ({ world: world(t, board) }),
});
