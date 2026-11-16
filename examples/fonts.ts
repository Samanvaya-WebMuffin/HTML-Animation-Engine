import interVariable from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import monoVariable from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url';
import newsreaderItalic from '@fontsource-variable/newsreader/files/newsreader-latin-standard-italic.woff2?url';
import newsreaderVariable from '@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2?url';
import soraVariable from '@fontsource-variable/sora/files/sora-latin-wght-normal.woff2?url';
import type { FontSource } from '@html-animation-engine/core';

/**
 * Bundled fonts, all SIL Open Font License: Inter and JetBrains Mono, plus
 * Sora (Soft Calm headlines) and Newsreader (serif subtext, with optical
 * sizes and an italic).
 */
export const fontFaces: readonly FontSource[] = [
  { family: 'Inter', src: interVariable, weight: '100 900', style: 'normal' },
  { family: 'JetBrains Mono', src: monoVariable, weight: '100 800', style: 'normal' },
  { family: 'Sora', src: soraVariable, weight: '100 800', style: 'normal' },
  { family: 'Newsreader', src: newsreaderVariable, weight: '200 800', style: 'normal' },
  { family: 'Newsreader', src: newsreaderItalic, weight: '200 800', style: 'italic' },
];
