import { createNoise, type RenderContext } from '@html-animation-engine/core';
import type { Uniforms } from '../shader.js';

/**
 * A physically motivated candle flame, as a WebGL2 fragment shader.
 *
 * Built from flame structure and photographic reference:
 * - luminous region: soot glowing as a blackbody. A temperature field maps
 *   through a blackbody colour fit (Tanner Helland's fit to Mitchell
 *   Charity's data) and filmic tone mapping, so the core blows out to
 *   white-yellow like a photo while the edges fall to orange and red;
 * - blue reaction zone: CH / C2 band emission, a thin blue rim at the base;
 * - dark zone: oxygen-starved fuel vapour just above the wick emits little;
 * - motion: a single candle in still air does not really flicker, so the
 *   flame sways slowly, breathes a few percent, and carries upward-advected,
 *   domain-warped turbulence that grows towards the tip;
 * - light: halo and room glow, wax lit from above with subsurface scattering
 *   near the top, and a charred wick with a glowing ember tip.
 *
 * Noise uses an integer hash (PCG) rather than sin-based hashing, so it is
 * the same on every GPU. Output is dithered to avoid banding in the dark.
 */
export const FLAME_FRAGMENT = /* glsl */ `
uniform vec2 uFrame;   // frame size in CSS px
uniform vec4 uFlame;   // base x, base y (CSS px, y down), max width, height
uniform vec4 uMotion;  // tip bend, height scale, time (s), frame index
uniform vec4 uCandle;  // centre x, top y, width, 1 = draw the candle
uniform vec4 uParams;  // turbulence, exposure, seed, 0

uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

vec3 gradientAt(ivec3 c) {
  uvec3 h = pcg3d(uvec3(c + 65536) ^ uvec3(uint(uParams.z)));
  return normalize(vec3(h & 0xffffu) / 32767.5 - 1.0 + 1e-4);
}

// Gradient noise with quintic fade, roughly in [-0.7, 0.7].
float gnoise(vec3 p) {
  ivec3 i = ivec3(floor(p));
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(gradientAt(i), f);
  float n100 = dot(gradientAt(i + ivec3(1, 0, 0)), f - vec3(1, 0, 0));
  float n010 = dot(gradientAt(i + ivec3(0, 1, 0)), f - vec3(0, 1, 0));
  float n110 = dot(gradientAt(i + ivec3(1, 1, 0)), f - vec3(1, 1, 0));
  float n001 = dot(gradientAt(i + ivec3(0, 0, 1)), f - vec3(0, 0, 1));
  float n101 = dot(gradientAt(i + ivec3(1, 0, 1)), f - vec3(1, 0, 1));
  float n011 = dot(gradientAt(i + ivec3(0, 1, 1)), f - vec3(0, 1, 1));
  float n111 = dot(gradientAt(i + ivec3(1, 1, 1)), f - vec3(1, 1, 1));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z);
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int k = 0; k < 5; k++) {
    sum += amp * gnoise(p);
    p = p * 2.02 + vec3(17.1, 31.7, 7.3);
    amp *= 0.5;
  }
  return sum;
}

// Blackbody colour (Helland's fit), converted to linear light.
vec3 blackbody(float kelvin) {
  float t = kelvin / 100.0;
  float g = clamp((99.4708025861 * log(t) - 161.1195681661) / 255.0, 0.0, 1.0);
  float b = t <= 19.0 ? 0.0 : clamp((138.5177312231 * log(t - 10.0) - 305.0447927307) / 255.0, 0.0, 1.0);
  return pow(vec3(1.0, g, b), vec3(2.2));
}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  float pxScale = uFrame.x / uResolution.x;
  vec2 px = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) * pxScale; // CSS px, y down
  float time = uMotion.z;
  vec2 base = uFlame.xy;
  float W = uFlame.z;
  float H = uFlame.w * uMotion.y;
  float bend = uMotion.x;

  // --- room: near-black, warmed by the flame's light -----------------------
  vec2 centre = base - vec2(bend * W * 0.35, H * 0.45);
  float dist = length((px - centre) / vec2(1.0, 1.2)) / H;
  vec3 warm = blackbody(1850.0);
  vec3 col = vec3(0.0016, 0.0013, 0.0011);
  col += warm * (0.20 * exp(-dist * 4.5) + 0.022 * exp(-dist * 1.2));

  // --- candle: wax lit from above, glowing through near the top -------------
  if (uCandle.w > 0.5) {
    float half_ = uCandle.z * 0.5;
    float nx = (px.x - uCandle.x) / half_;
    float ry = half_ * 0.15;
    float top = uCandle.y;
    float inTop = ((px.x - uCandle.x) * (px.x - uCandle.x)) / (half_ * half_) + ((px.y - top) * (px.y - top)) / (ry * ry);
    float aa = pxScale * 1.5 / half_;
    float side = (1.0 - smoothstep(1.0 - aa, 1.0, abs(nx))) * step(top, px.y);
    vec3 wax = vec3(0.86, 0.74, 0.58);
    float below = max(px.y - top, 0.0);
    float facing = sqrt(max(1.0 - nx * nx, 0.0));
    float lit = exp(-below / (0.9 * half_));
    float sss = exp(-below / (0.25 * half_)) * (1.0 - 0.6 * nx * nx);
    float shade = 0.15 + 0.85 * pow(facing, 1.5); // round cylinder falloff
    vec3 body = wax * (vec3(0.004) + warm * 0.26 * lit * shade) + warm * sss * 0.8;
    col = mix(col, body, side);
    // Top surface: a translucent melt pool, brightest in the middle, with a lit rim.
    float pool = 1.0 - smoothstep(1.0 - 0.08, 1.0, inTop);
    float rim = smoothstep(0.55, 0.95, inTop) * pool;
    vec3 topColour = wax * 0.10 + warm * (0.95 * (1.0 - inTop) + 0.35) + warm * rim * 0.6;
    col = mix(col, topColour, pool);
  }

  // --- wick: charred, bending at the top, with a glowing ember tip ----------
  {
    vec2 w0 = vec2(uCandle.x, uCandle.y);
    vec2 w1 = base + vec2(-0.02 * W, 0.03 * H);
    vec2 w2 = base + vec2(0.11 * W + bend * W * 0.05, -0.05 * H);
    float d = min(segmentDistance(px, w0, w1), segmentDistance(px, w1, w2));
    float thickness = max(W * 0.085, 1.5);
    float wick = 1.0 - smoothstep(thickness * 0.5, thickness * 0.5 + pxScale * 1.2, d);
    col = mix(col, vec3(0.006, 0.005, 0.004), wick);
    float ember = exp(-length(px - w2) / (thickness * 0.9));
    col += blackbody(1300.0) * ember * 2.4;
  }

  // --- flame ---------------------------------------------------------------
  vec2 q = vec2(px.x - base.x, base.y - px.y) / vec2(W, H); // x in widths, y: 0 base .. 1 tip
  if (q.y > -0.35 && q.y < 1.35 && abs(q.x) < 1.6) {
    float v = q.y;
    q.x -= bend * v * v; // sway: the tip moves most
    float turbulence = uParams.x;
    vec3 np = vec3(q.x * 3.2, v * 2.4 - time * 2.6, time * 0.4);
    float rise = smoothstep(0.1, 0.95, v);
    float warpX = fbm(np);
    float warpY = fbm(np + vec3(5.2, 1.3, 2.9));
    q.x += turbulence * warpX * rise * 1.6;
    v += turbulence * warpY * rise * 0.8;

    // Teardrop width profile, widest around a third of the way up.
    float vv = clamp(v, 0.0, 1.0);
    float r = 0.80 * pow(clamp((v + 0.10) / 1.10, 0.0, 1.0), 0.33) * pow(1.0 - vv, 0.75);
    float d = abs(q.x) / max(r, 1e-4); // 0 on the axis, 1 at the edge

    float bottom = smoothstep(-0.10, 0.0, v);
    float tipFade = 1.0 - smoothstep(0.82, 1.02, v);
    float body = (1.0 - smoothstep(0.62, 1.0, d)) * bottom * tipFade;

    // Soot glows above the base; oxygen-starved dark zone just above the wick.
    float luminous = smoothstep(0.10, 0.34, v);
    float darkZone = exp(-pow(q.x / (r * 0.5 + 1e-3), 2.0) - pow((v - 0.14) / 0.11, 2.0));
    float heat = body * luminous * (1.0 - 0.8 * darkZone) * mix(1.0, 0.7, smoothstep(0.5, 1.0, v));
    float kelvin = mix(1050.0, 2700.0, pow(clamp(heat * (1.0 - 0.55 * d * d), 0.0, 1.0), 0.75));
    vec3 emission = blackbody(kelvin) * pow(heat, 1.5) * 10.0;

    // Blue reaction zone: a thin rim around the base.
    float rimBand = exp(-pow((d - 0.86) / 0.17, 2.0));
    float blue = rimBand * smoothstep(-0.10, 0.0, v) * (1.0 - smoothstep(0.10, 0.38, v));
    emission += vec3(0.12, 0.38, 1.0) * blue * 0.6;
    emission += vec3(0.05, 0.05, 0.16) * darkZone * body * 0.25;

    // Halation: soft light hugging the flame.
    float hug = exp(-max(d - 0.75, 0.0) * 2.2) * smoothstep(-0.25, 0.15, v) * (1.0 - smoothstep(0.85, 1.35, v));
    emission += blackbody(1700.0) * hug * 0.16;

    col += emission;
  }

  // --- film response: filmic tone map, sRGB, dither --------------------------
  col = 1.0 - exp(-col * uParams.y);
  col = pow(col, vec3(1.0 / 2.2));
  uvec3 h = pcg3d(uvec3(uvec2(gl_FragCoord.xy), uint(uMotion.w)));
  col += (float(h.x & 0xffffu) / 65535.0 - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}
`;

export interface CandleFlameOptions {
  /** Base of the flame (the wick tip), CSS px, y down. */
  readonly x: number;
  readonly y: number;
  /** Flame height and maximum width, px. A candle flame is about 3.5 × taller than wide. */
  readonly height: number;
  readonly width: number;
  /** Candle body below the flame; omit for a free-standing flame. */
  readonly candle?: { readonly width: number; readonly top: number };
  /** Fine turbulence near the tip. ~0.06 for a candle in still air, 0.3+ for a wild flame. */
  readonly turbulence?: number;
  /** Slow sway of the tip, in flame widths. Default 0.12. */
  readonly sway?: number;
  /** Height breathing, fraction. Default 0.035. */
  readonly breath?: number;
  /** Exposure for the filmic tone map. Default 1. */
  readonly exposure?: number;
  readonly seed?: number;
}

/**
 * A candle flame as a shader layer for `defineSceneComposition({ shader })`.
 * Slow motion (sway, breathing) is computed here from `t` with seeded noise;
 * fine turbulence is advected in the shader from the same `t`.
 */
export function candleFlame(options: CandleFlameOptions): {
  fragment: string;
  uniforms: (t: number, ctx: RenderContext) => Uniforms;
} {
  const seed = options.seed ?? 1;
  const noise = createNoise(seed);
  const sway = options.sway ?? 0.12;
  const breath = options.breath ?? 0.035;
  return {
    fragment: FLAME_FRAGMENT,
    uniforms(t, ctx) {
      // Slow drift (~0.3 Hz) plus a lighter, quicker wander (~1 Hz).
      const bend = sway * (0.7 * noise.noise1(t * 0.32) + 0.3 * noise.noise1(t * 1.05 + 40));
      // Breathing, plus a tiny 10.5 Hz tremor (real flames carry a faint
      // flicker near this frequency; kept far below the flash threshold).
      const scale =
        1 + breath * noise.noise1(t * 0.8 + 90) + 0.004 * Math.sin(2 * Math.PI * 10.5 * t);
      return {
        uFrame: [ctx.width, ctx.height],
        uFlame: [options.x, options.y, options.width, options.height],
        uMotion: [bend, scale, t, ctx.frame],
        uCandle: options.candle
          ? [options.x, options.candle.top, options.candle.width, 1]
          : [options.x, options.y + options.height * 0.12, 0, 0],
        uParams: [options.turbulence ?? 0.06, options.exposure ?? 1, seed, 0],
      };
    },
  };
}
