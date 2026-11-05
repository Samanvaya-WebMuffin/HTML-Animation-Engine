import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  exports: Record<string, unknown>;
  dependencies?: Record<string, string>;
  peerDependencies: Record<string, string>;
  peerDependenciesMeta: Record<string, { optional?: boolean }>;
};

const ADAPTED = ['remotion', '@remotion/player'];

describe('adapters package', () => {
  it('exposes ./remotion as its own subpath', () => {
    expect(pkg.exports['./remotion']).toBeDefined();
  });

  it.each(ADAPTED)('%s is an optional peer dependency', (name) => {
    expect(pkg.peerDependencies[name]).toBeDefined();
    expect(pkg.peerDependenciesMeta[name]?.optional).toBe(true);
  });

  it('has no hard dependency on any adapted library', () => {
    for (const name of [...ADAPTED, 'react', 'react-dom']) {
      expect(pkg.dependencies?.[name]).toBeUndefined();
    }
  });
});
