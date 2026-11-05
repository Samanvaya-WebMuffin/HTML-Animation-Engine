/** An easing function maps linear progress `p ∈ [0, 1]` to eased progress. */
export type Ease = (p: number) => number;

export const linear: Ease = (p) => p;

/** Plays `ease` backwards in time: `1 - ease(1 - p)`. Turns an ease-out into an ease-in. */
export function reverseEase(ease: Ease): Ease {
  return (p) => 1 - ease(1 - p);
}
