import type { Ease } from './ease.js';

export type StepPosition = 'jump-start' | 'jump-end' | 'jump-none' | 'jump-both';

/** CSS `steps(count, position)`. */
export function steps(count: number, position: StepPosition = 'jump-end'): Ease {
  if (!Number.isInteger(count) || count < 1 || (position === 'jump-none' && count < 2)) {
    throw new RangeError(`steps: invalid count ${count} for ${position}.`);
  }
  const jumps = position === 'jump-none' ? count - 1 : position === 'jump-both' ? count + 1 : count;
  const startsHigh = position === 'jump-start' || position === 'jump-both';
  return (p) => {
    if (p <= 0) return startsHigh ? 1 / jumps : 0;
    if (p >= 1) return 1;
    // Small epsilon so that e.g. 0.3 * 10 lands on step 3, not 2.
    const step = Math.floor(p * count + 1e-9) + (startsHigh ? 1 : 0);
    return Math.min(step, jumps) / jumps;
  };
}
