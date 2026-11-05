import interVariable from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import monoVariable from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url';
import type { FontSource } from '@html-animation-engine/core';

/** Bundled fonts (Inter and JetBrains Mono, both SIL Open Font License). */
export const fontFaces: readonly FontSource[] = [
  { family: 'Inter', src: interVariable, weight: '100 900', style: 'normal' },
  { family: 'JetBrains Mono', src: monoVariable, weight: '100 800', style: 'normal' },
];
