import { clamp, lerp, mod } from '../math.js';

/** sRGB colour, gamma-encoded, every channel in [0, 1]. */
export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** OKLCH colour: lightness [0, 1], chroma ≥ 0, hue in degrees [0, 360). */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly a: number;
}

interface Oklab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** Below this chroma a colour is treated as grey and its hue is ignored. */
const ACHROMATIC = 1e-4;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const NAMED: Record<string, Rgba> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 1, g: 1, b: 1, a: 1 },
};

function parseChannel(token: string, scale: number): number {
  return token.endsWith('%') ? parseFloat(token) / 100 : parseFloat(token) / scale;
}

function parseAlpha(token: string | undefined): number {
  return token === undefined ? 1 : clamp(parseChannel(token, 1));
}

/** Splits `fn(a b c / d)` or `fn(a, b, c, d)` into its argument tokens. */
function functionArgs(input: string): { name: string; args: string[]; alpha?: string } | null {
  const match = /^([a-z]+)\(\s*([^)]*)\)$/.exec(input);
  if (!match?.[1] || match[2] === undefined) return null;
  const [main = '', alpha] = match[2].split('/').map((part) => part.trim());
  const args = main.split(/[\s,]+/).filter(Boolean);
  if (alpha === undefined && args.length === 4) {
    const last = args.pop();
    return { name: match[1], args, ...(last === undefined ? {} : { alpha: last }) };
  }
  return { name: match[1], args, ...(alpha === undefined ? {} : { alpha }) };
}

/**
 * Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()`,
 * `oklch()`, `transparent`, `black` and `white`.
 */
export function parseColor(input: string): Rgba {
  const value = input.trim().toLowerCase();
  const named = NAMED[value];
  if (named) return named;

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (!/^[0-9a-f]+$/.test(hex) || ![3, 4, 6, 8].includes(hex.length)) {
      throw new SyntaxError(`Invalid hex colour "${input}".`);
    }
    const full = hex.length <= 4 ? [...hex].map((ch) => ch + ch).join('') : hex;
    const byte = (i: number) => parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
    return { r: byte(0), g: byte(1), b: byte(2), a: full.length === 8 ? byte(3) : 1 };
  }

  const fn = functionArgs(value);
  if (fn && (fn.name === 'rgb' || fn.name === 'rgba') && fn.args.length === 3) {
    const [r = '0', g = '0', b = '0'] = fn.args;
    return {
      r: clamp(parseChannel(r, 255)),
      g: clamp(parseChannel(g, 255)),
      b: clamp(parseChannel(b, 255)),
      a: parseAlpha(fn.alpha),
    };
  }
  if (fn && fn.name === 'oklch' && fn.args.length === 3) {
    const [l = '0', c = '0', h = '0'] = fn.args;
    return oklchToRgb({
      l: parseChannel(l, 1),
      c: c.endsWith('%') ? (parseFloat(c) / 100) * 0.4 : parseFloat(c),
      h: parseFloat(h),
      a: parseAlpha(fn.alpha),
    });
  }
  throw new SyntaxError(`Unsupported colour "${input}".`);
}

// ---------------------------------------------------------------------------
// Conversion (Björn Ottosson's OKLab, https://bottosson.github.io/posts/oklab/)
// ---------------------------------------------------------------------------

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function fromLinear(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function rgbToOklab({ r, g, b }: Rgba): Oklab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab → linear sRGB (may be out of gamut). */
function oklabToLinear({ l, a, b }: Oklab): [number, number, number] {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

function oklchToOklab({ l, c, h }: Oklch): Oklab {
  const radians = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(radians), b: c * Math.sin(radians) };
}

export function rgbToOklch(rgba: Rgba): Oklch {
  const { l, a, b } = rgbToOklab(rgba);
  const c = Math.hypot(a, b);
  const h = c < ACHROMATIC ? 0 : mod((Math.atan2(b, a) * 180) / Math.PI, 360);
  return { l, c, h, a: rgba.a };
}

const GAMUT_EPSILON = 1e-6;

function inGamut(linear: readonly number[]): boolean {
  return linear.every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON);
}

/**
 * OKLCH → sRGB. Out-of-gamut colours keep their lightness and hue and lose
 * chroma (found by bisection) until they fit, then clip the residue.
 */
export function oklchToRgb(color: Oklch): Rgba {
  const l = clamp(color.l);
  let linear = oklabToLinear(oklchToOklab({ ...color, l }));
  if (!inGamut(linear) && l > 0 && l < 1) {
    let lo = 0;
    let hi = color.c;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLinear(oklchToOklab({ ...color, l, c: mid })))) lo = mid;
      else hi = mid;
    }
    linear = oklabToLinear(oklchToOklab({ ...color, l, c: lo }));
  }
  const [r = 0, g = 0, b = 0] = linear.map((v) => clamp(fromLinear(clamp(v))));
  return { r, g, b, a: clamp(color.a) };
}

// ---------------------------------------------------------------------------
// Mixing and formatting
// ---------------------------------------------------------------------------

/**
 * Mixes two OKLCH colours. Hue takes the shorter arc, and moves in proportion
 * to how much chroma each end contributes: a colour with little chroma (a
 * near-black or grey) barely pulls the hue, so lime fading to `ink` stays a
 * darkening lime instead of swinging through teal. Two equally vivid colours
 * blend hue evenly. L and C are premultiplied by alpha, as in CSS `color-mix()`.
 */
export function mixOklch(from: Oklch, to: Oklch, p: number): Oklch {
  if (p <= 0) return from;
  if (p >= 1) return to;
  const c1 = from.a === 0 || from.c < ACHROMATIC ? 0 : from.c;
  const c2 = to.a === 0 || to.c < ACHROMATIC ? 0 : to.c;
  const delta = mod(to.h - from.h + 180, 360) - 180;
  const weight = (1 - p) * c1 + p * c2;
  const hueProgress = weight > 0 ? (p * c2) / weight : p;

  const a = lerp(from.a, to.a, p);
  const premul = (x: number, y: number) =>
    a === 0 ? lerp(x, y, p) : lerp(x * from.a, y * to.a, p) / a;
  return {
    l: premul(from.l, to.l),
    c: premul(c1, c2),
    h: mod(from.h + delta * hueProgress, 360),
    a,
  };
}

/** Mixes two CSS colours in OKLCH. Returns a CSS colour string. */
export function mixColors(from: string, to: string, p: number): string {
  if (p <= 0) return formatColor(parseColor(from));
  if (p >= 1) return formatColor(parseColor(to));
  return formatColor(
    oklchToRgb(mixOklch(rgbToOklch(parseColor(from)), rgbToOklch(parseColor(to)), p)),
  );
}

/**
 * Formats a colour as `#rrggbb` when opaque, otherwise `rgba(r, g, b, a)`.
 * Channels are rounded to 8 bits so output strings are stable.
 */
export function formatColor({ r, g, b, a }: Rgba): string {
  const byte = (v: number) => Math.round(clamp(v) * 255);
  if (a >= 1) {
    return `#${[r, g, b].map((v) => byte(v).toString(16).padStart(2, '0')).join('')}`;
  }
  return `rgba(${byte(r)}, ${byte(g)}, ${byte(b)}, ${Math.round(clamp(a) * 1000) / 1000})`;
}

/** Returns `color` with its alpha multiplied by `opacity`. */
export function withAlpha(color: string, opacity: number): string {
  const rgba = parseColor(color);
  return formatColor({ ...rgba, a: rgba.a * clamp(opacity) });
}
