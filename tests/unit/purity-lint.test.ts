import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: new URL('../..', import.meta.url).pathname });

async function restrictedHits(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId?.startsWith('no-restricted-'))
    .map((m) => m.ruleId ?? '');
}

const IMPURE = [
  'export const a = Math.random();',
  'export const b = Date.now();',
  'export const c = performance.now();',
  'export const d = new Date();',
  'requestAnimationFrame(() => {});',
  'window.requestAnimationFrame(() => {});',
  'setTimeout(() => {}, 10);',
];

describe('render-path purity lint', () => {
  it.each(IMPURE)('rejects `%s` in examples and engine packages', async (code) => {
    for (const filePath of [
      'examples/demo/composition.ts',
      'packages/core/src/demo.ts',
      'packages/renderers/src/demo.ts',
      'packages/adapters/src/demo.ts',
    ]) {
      expect(await restrictedHits(code, filePath)).not.toHaveLength(0);
    }
  });

  it('allows a wall clock in the playground player', async () => {
    expect(
      await restrictedHits(
        'requestAnimationFrame(() => performance.now());',
        'apps/playground/src/x.ts',
      ),
    ).toHaveLength(0);
  });

  it('allows pure, time-derived code', async () => {
    expect(
      await restrictedHits(
        'export const x = (t: number) => Math.sin(t * Math.PI);',
        'examples/demo/composition.ts',
      ),
    ).toHaveLength(0);
  });
});
