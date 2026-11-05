import { fromRemotion } from '@html-animation-engine/adapters/remotion';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  interpolateColors,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { exampleDefaults, theme } from '../index.js';

const { colors } = theme;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Plain Remotion code: everything is derived from useCurrentFrame(). */
function Title() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 6, fps, config: { damping: 12, stiffness: 160 } });
  const bar = interpolate(frame, [20, 40], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return (
    <AbsoluteFill
      style={{
        background: colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: theme.type.display.family,
      }}
    >
      <div
        style={{
          color: colors.paper,
          fontSize: 88,
          fontWeight: 800,
          letterSpacing: -1,
          opacity: Math.min(1, enter),
          transform: `translateY(${(1 - enter) * 40}px) scale(${0.9 + 0.1 * enter})`,
        }}
      >
        Written in Remotion
      </div>
      <div
        style={{
          width: 520 * bar,
          height: 10,
          borderRadius: 5,
          background: colors.lime,
          marginTop: 24,
        }}
      />
      <Sequence from={45} layout="none">
        <Subtitle />
      </Sequence>
    </AbsoluteFill>
  );
}

function Subtitle() {
  const frame = useCurrentFrame(); // relative to the Sequence start
  return (
    <div
      data-testid="subtitle"
      style={{
        position: 'absolute',
        top: 470,
        fontFamily: theme.type.body.family,
        fontSize: 30,
        color: interpolateColors(frame, [0, 30], [colors.muted, colors.lime]),
        opacity: interpolate(frame, [0, 15], [0, 1], clamp),
      }}
    >
      rendered frame-exactly by the engine
    </div>
  );
}

export default fromRemotion({
  id: 'remotion-title',
  title: 'Remotion code inside the engine',
  component: Title,
  width: exampleDefaults.width,
  height: exampleDefaults.height,
  fps: exampleDefaults.fps,
  durationInFrames: 120,
  background: colors.ink,
  fontFaces: exampleDefaults.fontFaces,
  fonts: exampleDefaults.fonts,
});
