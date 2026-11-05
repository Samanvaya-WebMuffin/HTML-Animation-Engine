import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, unknown>;
  dependencies?: Record<string, string>;
  peerDependencies: Record<string, string>;
  peerDependenciesMeta: Record<string, { optional?: boolean }>;
};

const ADAPTED = ['gsap', 'three', 'framer-motion', 'remotion'];

describe('adapters package', () => {
  it.each(ADAPTED)('exposes ./%s as its own subpath with an optional peer', (name) => {
    expect(pkg.exports[`./${name}`]).toBeDefined();
    expect(pkg.peerDependencies[name]).toBeDefined();
    expect(pkg.peerDependenciesMeta[name]?.optional).toBe(true);
  });

  it('has no hard dependency on any adapted library', () => {
    for (const name of [...ADAPTED, 'react']) {
      expect(pkg.dependencies?.[name]).toBeUndefined();
    }
  });
});
