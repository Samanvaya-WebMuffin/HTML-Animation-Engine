import { fromRemotion } from '@html-animation-engine/adapters/remotion';
import { mixColors, withAlpha, type Shadow } from '@html-animation-engine/core';
import { elevationShadows, glowShadows } from '@html-animation-engine/renderers';
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
import { exampleDefaults, lighting, theme } from '../index.js';
import { arrival, bell, clap, cue, pad, pluck, snap, soundtrack, whoosh } from '../sounds.js';

const { colors } = theme;
/**
 * Remotion code is written in frames, so this composition has a fixed frame
 * rate. 60 fps matches the export default; timings below are in seconds
 * (`seconds × fps`), so the motion would be the same at any rate.
 */
const FPS = 60;
/** The title's entrance spring and the bar's ease (shared with the soundtrack). */
const TITLE_SPRING = { damping: 12, stiffness: 160 };
const BAR_EASE = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Engine shadows as CSS: same model (σ = blur / 2), so they match the renderers. */
const css = (shadows: readonly Shadow[]) =>
  shadows.map((s) => `${s.x}px ${s.y}px ${s.blur ?? 0}px ${s.color}`).join(', ');
const dropShadows = (shadows: readonly Shadow[]) =>
  shadows.map((s) => `drop-shadow(${s.x}px ${s.y}px ${(s.blur ?? 0) / 2}px ${s.color})`).join(' ');

const backdrop = `radial-gradient(ellipse 75% 85% at 50% 42%, ${lighting.backdrop.centre} 0%, ${mixColors(
  lighting.backdrop.centre,
  lighting.backdrop.edge,
  0.45,
)} 55%, ${lighting.backdrop.edge} 100%)`;
const titleShadow = dropShadows(elevationShadows(lighting, [{ y: 14, blur: 36, alpha: 0.7 }]));
const barFill = `linear-gradient(180deg, ${mixColors(colors.lime, lighting.highlight, lighting.sheen)} 0%, ${colors.lime} 45%, ${mixColors(colors.lime, lighting.shadow, lighting.shade)} 100%)`;

/** Plain Remotion code: everything is derived from useCurrentFrame(). */
function Title() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 0.2 * fps, fps, config: TITLE_SPRING });
  const bar = interpolate(frame, [(2 / 3) * fps, (4 / 3) * fps], [0, 1], {
    ...clamp,
    easing: BAR_EASE,
  });
  // A specular glint crosses the title once it has settled (100 % → 0 % moves it left to right).
  const glint = interpolate(frame, [(14 / 15) * fps, (31 / 15) * fps], [100, 0], {
    ...clamp,
    easing: Easing.bezier(0.65, 0, 0.35, 1),
  });
  return (
    <AbsoluteFill
      style={{
        background: backdrop,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: theme.type.display.family,
      }}
    >
      {/* The bar casts a pool of lime light on the backdrop as it draws. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 40% 30% at 50% 56%, ${withAlpha(colors.lime, 0.12 * bar)} 0%, ${withAlpha(colors.lime, 0)} 100%)`,
        }}
      />
      <div style={{ filter: titleShadow, opacity: Math.min(1, enter) }}>
        <div
          style={{
            fontSize: 88,
            fontWeight: 800,
            letterSpacing: -1,
            color: 'transparent',
            backgroundImage: `linear-gradient(100deg, ${colors.paper} 0%, ${colors.paper} 42%, ${colors.light} 50%, ${colors.paper} 58%, ${colors.paper} 100%)`,
            backgroundSize: '300% 100%',
            backgroundPosition: `${glint}% 0%`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            transform: `translateY(${(1 - enter) * 40}px) scale(${0.9 + 0.1 * enter})`,
          }}
        >
          Written in Remotion
        </div>
      </div>
      <div
        style={{
          width: 520 * bar,
          height: 10,
          borderRadius: 5,
          background: barFill,
          boxShadow: css([
            ...glowShadows(lighting, colors.lime, { radius: 28, strength: bar }),
            ...elevationShadows(lighting, 'low'),
          ]),
          marginTop: 24,
        }}
      />
      <Sequence from={Math.round(1.5 * fps)} layout="none">
        <Subtitle />
      </Sequence>
    </AbsoluteFill>
  );
}

function Subtitle() {
  const frame = useCurrentFrame(); // relative to the Sequence start
  const { fps } = useVideoConfig();
  const lit = interpolate(frame, [0, fps], [0, 1], clamp);
  return (
    <div
      data-testid="subtitle"
      style={{
        position: 'absolute',
        top: 470,
        fontFamily: theme.type.body.family,
        fontSize: 30,
        color: interpolateColors(frame, [0, fps], [colors.muted, colors.lime]),
        textShadow: css(glowShadows(lighting, colors.lime, { radius: 18, strength: 0.6 * lit })),
        opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], clamp),
      }}
    >
      rendered frame-exactly by the engine
    </div>
  );
}

/** First frame at which the title's spring reaches its resting position: it visibly lands. */
const TITLE_LAND =
  (Array.from({ length: FPS }, (_, f) => f).find(
    (f) => spring({ frame: f - 0.2 * FPS, fps: FPS, config: TITLE_SPRING }) >= 1,
  ) ?? 0) / FPS;

/** The title lands on a clap, the bar swishes out and snaps, the subtitle rings in. */
const audio = soundtrack([
  cue(0, pad(2.8, { attack: 0.4, release: 1.2 })),
  cue(TITLE_LAND, clap({ big: true })),
  cue(40 / FPS, whoosh(0.4, { from: 800, to: 4200, peak: 0.35 })),
  cue(arrival(40 / FPS, 40 / FPS, BAR_EASE, 0.9), snap({ degree: 4 })),
  cue(90 / FPS, pluck({ degree: 7, octave: 1 })),
  cue(90 / FPS, bell({ degree: 9, gain: 0.5 })),
]);

export default fromRemotion({
  id: 'remotion-title',
  audio,
  title: 'Remotion code inside the engine',
  component: Title,
  width: exampleDefaults.width,
  height: exampleDefaults.height,
  fps: FPS,
  durationInFrames: 4 * FPS,
  background: colors.ink,
  fontFaces: exampleDefaults.fontFaces,
  fonts: exampleDefaults.fonts,
});
