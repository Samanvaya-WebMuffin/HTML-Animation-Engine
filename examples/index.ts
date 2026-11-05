import { defaultTheme, type Composition, type FontSpec } from '@html-animation-engine/core';
import { fontFaces } from './fonts.js';

export { fontFaces };

/** The theme every example uses. Import tokens from here; never hard-code colours. */
export const theme = defaultTheme;

/** A theme type token at a given size. */
export function font(token: keyof typeof theme.type, size: number): FontSpec {
  return { ...theme.type[token], size };
}

/** Shared defaults: 1280 × 720 at 30 fps with the bundled fonts. */
export const exampleDefaults = {
  width: 1280,
  height: 720,
  fps: 30,
  fontFaces,
  fonts: [font('display', 64), font('body', 24)],
} as const;

/**
 * Per-example settings, in `examples/<name>/config.ts`. The composition itself
 * lives in `examples/<name>/composition.ts` as the default export.
 */
export interface ExampleConfig {
  /**
   * Key moments in seconds. `pnpm stills <name>` renders these by default and
   * the visual tests keep a golden frame for each.
   */
  readonly stills: readonly number[];
  /** Average render budget per frame, in milliseconds. */
  readonly budgetMs?: number;
}

export function defineExampleConfig(config: ExampleConfig): ExampleConfig {
  return config;
}

export interface Example {
  readonly name: string;
  readonly composition: Composition;
  readonly config: ExampleConfig;
}
