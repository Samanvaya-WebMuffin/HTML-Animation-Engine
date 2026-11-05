import type { Composition } from '@html-animation-engine/core';
import type { ExampleConfig } from '@html-animation-engine/examples';

/**
 * Every example under `examples/<name>/composition.ts` (or `.tsx`). Modules load on
 * demand, so a heavy example (e.g. one using Remotion) only loads when selected.
 */
const compositionModules = import.meta.glob<{ default: Composition }>(
  '../../../examples/*/composition.{ts,tsx}',
);
const configModules = import.meta.glob<{ default: ExampleConfig }>('../../../examples/*/config.ts');

export interface ExampleEntry {
  readonly name: string;
  load(): Promise<{ composition: Composition; config: ExampleConfig | undefined }>;
}

function nameOf(path: string): string {
  return path.split('/').at(-2) ?? path;
}

export const examples: readonly ExampleEntry[] = Object.entries(compositionModules)
  .map(([path, loadComposition]): ExampleEntry => {
    const loadConfig = configModules[path.replace(/composition\.tsx?$/, 'config.ts')];
    return {
      name: nameOf(path),
      async load() {
        const [composition, config] = await Promise.all([
          loadComposition().then((m) => m.default),
          loadConfig?.().then((m) => m.default),
        ]);
        return { composition, config };
      },
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
