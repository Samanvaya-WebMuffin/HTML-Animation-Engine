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

/** A font file to register with `document.fonts`. */
export interface FontSource {
  readonly family: string;
  /** URL of the font file (e.g. a bundled `.woff2`). */
  readonly src: string;
  /** CSS font-weight, or a range for variable fonts, e.g. `'100 900'`. */
  readonly weight?: string;
  readonly style?: 'normal' | 'italic';
}

const registered = new WeakMap<Document, Map<string, Promise<void>>>();

/**
 * Registers font files with `document.fonts` and waits until they have loaded.
 * Registering the same source twice is a no-op.
 */
export async function registerFontFaces(
  sources: readonly FontSource[],
  doc: Document = document,
): Promise<void> {
  let loaded = registered.get(doc);
  if (!loaded) {
    loaded = new Map();
    registered.set(doc, loaded);
  }
  const cache = loaded;
  await Promise.all(
    sources.map((source) => {
      const key = `${source.family}|${source.src}|${source.weight ?? ''}|${source.style ?? ''}`;
      let pending = cache.get(key);
      if (!pending) {
        const FontFaceCtor = (doc.defaultView ?? globalThis).FontFace;
        const face = new FontFaceCtor(source.family, `url(${JSON.stringify(source.src)})`, {
          ...(source.weight === undefined ? {} : { weight: source.weight }),
          ...(source.style === undefined ? {} : { style: source.style }),
        });
        doc.fonts.add(face);
        pending = face.load().then(() => undefined);
        cache.set(key, pending);
      }
      return pending;
    }),
  );
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
