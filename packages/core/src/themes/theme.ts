import type { Ease } from '../easing/ease.js';
import type { FontSpec } from '../text/font.js';

/** Font tokens omit `size`; pick the size where the text is used. */
export type TypeToken = Omit<FontSpec, 'size'> & { readonly size?: number };

/** Named easing tokens every theme must provide. */
export interface EasingTokens {
  /** Quick entrance that settles hard: things arriving on screen. */
  readonly enter: Ease;
  /** Accelerating exit: things leaving. */
  readonly exit: Ease;
  /** Fast with overshoot: things landing or snapping into place. */
  readonly snap: Ease;
  /** Slow in, slow out: camera moves. */
  readonly camera: Ease;
  /** Wipes, masks and reveals. */
  readonly wipe: Ease;
  readonly [name: string]: Ease;
}

/** Duration tokens in seconds. */
export interface DurationTokens {
  readonly fast: number;
  readonly base: number;
  readonly slow: number;
  readonly camera: number;
  /** Delay between staggered items. */
  readonly stagger: number;
  readonly [name: string]: number;
}

/** One layer of a shadow stack: offset straight down by `y`, blurred, at `alpha` of the shadow colour. */
export interface ShadowLayer {
  readonly y: number;
  readonly blur: number;
  readonly alpha: number;
}

/**
 * Light and shadow tokens. Light comes from above: lit surfaces are lighter
 * at the top, shadows fall straight down.
 */
export interface LightingTokens {
  /** Colour shadows are cast in. */
  readonly shadow: string;
  /** Colour of highlights, sheens and specular sweeps. */
  readonly highlight: string;
  /** Shadow stacks by height above the surface (contact, key and ambient layers). */
  readonly elevation: {
    readonly low: readonly ShadowLayer[];
    readonly mid: readonly ShadowLayer[];
    readonly high: readonly ShadowLayer[];
  };
  /** How far the top of a lit surface moves toward `highlight` (OKLCH mix, 0–1). */
  readonly sheen: number;
  /** How far the bottom of a lit surface moves toward `shadow` (OKLCH mix, 0–1). */
  readonly shade: number;
  /** Opacity of coloured glows. */
  readonly glow: number;
  /** Backdrop: the lifted centre and the darker (vignetted) edge. */
  readonly backdrop: { readonly centre: string; readonly edge: string };
}

/**
 * Sound tokens: one key, so every snap, pluck, stab and pad agrees. Melodies
 * pick notes by scale degree; chords are semitone offsets from `root`.
 */
export interface SoundTokens {
  /** Frequency of A4 in Hz. */
  readonly tuning: number;
  /** Root of the key, with octave (e.g. 'D3'). */
  readonly root: string;
  /** Scale as semitone offsets from the root (a pentatonic scale never clashes). */
  readonly scale: readonly number[];
  /** Named chords as semitone offsets from the root. */
  readonly chords: Readonly<Record<string, readonly number[]>>;
  /** Mix level of each sound family, in dB. */
  readonly levels: Readonly<Record<string, number>>;
  /** Shared room. */
  readonly reverb: {
    readonly size: number;
    readonly damping: number;
    readonly predelay: number;
    readonly gain: number;
  };
}

export interface Theme {
  readonly name: string;
  readonly colors: Readonly<Record<string, string>>;
  readonly type: Readonly<Record<string, TypeToken>>;
  readonly easing: EasingTokens;
  readonly durations: DurationTokens;
  readonly lighting?: LightingTokens;
  readonly sound?: SoundTokens;
}

/** Identity helper that keeps the theme's literal keys in its type. */
export function defineTheme<T extends Theme>(theme: T): T {
  return theme;
}
