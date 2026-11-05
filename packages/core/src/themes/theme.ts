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

export interface Theme {
  readonly name: string;
  readonly colors: Readonly<Record<string, string>>;
  readonly type: Readonly<Record<string, TypeToken>>;
  readonly easing: EasingTokens;
  readonly durations: DurationTokens;
}

/** Identity helper that keeps the theme's literal keys in its type. */
export function defineTheme<T extends Theme>(theme: T): T {
  return theme;
}
