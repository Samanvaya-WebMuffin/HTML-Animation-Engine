export interface FontSpec {
  /** CSS font-family list, e.g. `'"Inter", system-ui, sans-serif'`. */
  readonly family: string;
  /** Size in px. */
  readonly size: number;
  readonly weight?: number | string;
  readonly style?: 'normal' | 'italic';
  /** Line height as a multiple of `size`. Default 1.2. */
  readonly lineHeight?: number;
  /** Extra space after each character, in px. Default 0. */
  readonly letterSpacing?: number;
}

/** CSS `font` shorthand for a spec, e.g. `italic 700 48px Inter`. */
export function fontString(font: FontSpec): string {
  const style = font.style === 'italic' ? 'italic ' : '';
  return `${style}${font.weight ?? 400} ${font.size}px ${font.family}`;
}

/**
 * Loads every font in `fonts` and waits for `document.fonts.ready`. Call it
 * before measuring text: `document.fonts.ready` alone does not load fonts
 * that nothing on the page has used yet. Returns the specs that are still
 * unavailable (rendering would fall back to another font).
 */
export async function loadFonts(
  fonts: readonly FontSpec[],
  doc: Document = document,
): Promise<FontSpec[]> {
  await Promise.all(fonts.map((font) => doc.fonts.load(fontString(font))));
  await doc.fonts.ready;
  return fonts.filter((font) => !doc.fonts.check(fontString(font)));
}
