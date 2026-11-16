/**
 * Bitmaps for `image` nodes. Load them once with `preloadImages` (in a
 * composition's `setup`); renderers then draw them synchronously, so no
 * frame ever waits for a decode and every frame is complete when captured.
 */
const loaded = new Map<string, HTMLImageElement>();

/** Loads and decodes each image (once per URL). */
export async function preloadImages(
  sources: readonly string[],
  doc: Document = document,
): Promise<void> {
  await Promise.all(
    sources.map(async (src) => {
      if (loaded.has(src)) return;
      const image = doc.createElement('img');
      image.decoding = 'sync';
      image.src = src;
      await image.decode();
      loaded.set(src, image);
    }),
  );
}

/** A preloaded image; throws if `preloadImages` was not awaited for it. */
export function loadedImage(src: string): HTMLImageElement {
  const image = loaded.get(src);
  if (!image)
    throw new Error(`image node: "${src.slice(0, 60)}" was not preloaded (preloadImages).`);
  return image;
}
