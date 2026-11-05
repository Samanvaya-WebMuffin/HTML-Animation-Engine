import type { Ease } from '../easing/ease.js';
import { progress as windowProgress, staggerOrder } from '../tween.js';

/** A time relative to a label defined earlier in the timeline. */
export interface LabelRef {
  readonly label: string;
  readonly offset: number;
}

/** An absolute time in seconds, or a label plus an offset. */
export type TimeRef = number | LabelRef;

export interface Placement {
  /**
   * Place the item at this absolute time instead of at the cursor. Items
   * placed with `at` do not move the enclosing sequence's cursor.
   */
  readonly at?: TimeRef;
  /** Extra delay in seconds, added after `at` or the cursor. */
  readonly delay?: number;
}

export type TimelineItem =
  | {
      readonly kind: 'clip';
      readonly name: string;
      readonly duration: number;
      readonly place: Placement;
    }
  | { readonly kind: 'gap'; readonly duration: number }
  | { readonly kind: 'label'; readonly name: string; readonly place: Placement }
  | { readonly kind: 'seq'; readonly items: readonly TimelineItem[]; readonly place: Placement }
  | { readonly kind: 'par'; readonly items: readonly TimelineItem[]; readonly place: Placement }
  | {
      readonly kind: 'stagger';
      readonly items: readonly TimelineItem[];
      readonly each: number;
      readonly from: 'start' | 'end' | 'center';
      readonly place: Placement;
    };

/** `label + offset`, for use as `at`. */
export function at(label: string, offset = 0): LabelRef {
  return { label, offset };
}

/** A named span of `duration` seconds. */
export function clip(name: string, duration: number, place: Placement = {}): TimelineItem {
  if (!(duration >= 0)) throw new RangeError(`clip "${name}": duration must be >= 0.`);
  return { kind: 'clip', name, duration, place };
}

/** Empty time inside a sequence. */
export function gap(duration: number): TimelineItem {
  if (!(duration >= 0)) throw new RangeError('gap: duration must be >= 0.');
  return { kind: 'gap', duration };
}

/** Names the current point in time (or `place.at`). */
export function label(name: string, place: Placement = {}): TimelineItem {
  return { kind: 'label', name, place };
}

/** Items one after another. */
export function seq(items: readonly TimelineItem[], place: Placement = {}): TimelineItem {
  return { kind: 'seq', items, place };
}

/** Items all starting together; ends when the longest ends. */
export function par(items: readonly TimelineItem[], place: Placement = {}): TimelineItem {
  return { kind: 'par', items, place };
}

/** Items starting `each` seconds apart. */
export function stagger(
  items: readonly TimelineItem[],
  each: number,
  options: Placement & { from?: 'start' | 'end' | 'center' } = {},
): TimelineItem {
  const { from = 'start', ...place } = options;
  return { kind: 'stagger', items, each, from, place };
}

export interface Span {
  readonly start: number;
  readonly duration: number;
  readonly end: number;
}

export interface Timeline {
  /** End of the last item, in seconds. */
  readonly duration: number;
  readonly clips: ReadonlyMap<string, Span>;
  readonly labels: ReadonlyMap<string, number>;
  /** The resolved span of clip `name`. Throws if it doesn't exist. */
  clip(name: string): Span;
  /** The resolved time of label `name`. Throws if it doesn't exist. */
  label(name: string): number;
  /** Absolute time of `label + offset`. */
  at(label: string, offset?: number): number;
  /** Eased progress of clip `name` at time `t`: 0 before, 1 after. */
  progress(name: string, t: number, ease?: Ease): number;
  /** True while `t` is inside clip `name` (start inclusive, end exclusive). */
  isActive(name: string, t: number): boolean;
}

/**
 * Resolves a timeline tree to absolute times, once. The result is plain data:
 * nothing depends on when or how often it is queried. A root array is a `seq`.
 */
export function timeline(root: TimelineItem | readonly TimelineItem[]): Timeline {
  const clips = new Map<string, Span>();
  const labels = new Map<string, number>();
  let duration = 0;

  const resolveRef = (ref: TimeRef): number => {
    if (typeof ref === 'number') return ref;
    const time = labels.get(ref.label);
    if (time === undefined) {
      throw new ReferenceError(
        `timeline: label "${ref.label}" is not defined before it is used. ` +
          'Labels must appear earlier in the tree than the items that reference them.',
      );
    }
    return time + ref.offset;
  };

  const startOf = (place: Placement, cursor: number): number => {
    const start = (place.at === undefined ? cursor : resolveRef(place.at)) + (place.delay ?? 0);
    if (start < 0) throw new RangeError(`timeline: item starts before 0 (${start}).`);
    return start;
  };

  /** Resolves `item` at `cursor`; returns where the item ends. */
  const resolve = (item: TimelineItem, cursor: number): number => {
    switch (item.kind) {
      case 'gap':
        return cursor + item.duration;
      case 'label': {
        if (labels.has(item.name)) throw new Error(`timeline: duplicate label "${item.name}".`);
        const time = startOf(item.place, cursor);
        labels.set(item.name, time);
        return time;
      }
      case 'clip': {
        if (clips.has(item.name)) throw new Error(`timeline: duplicate clip "${item.name}".`);
        const start = startOf(item.place, cursor);
        const span = { start, duration: item.duration, end: start + item.duration };
        clips.set(item.name, span);
        duration = Math.max(duration, span.end);
        return span.end;
      }
      case 'seq': {
        let position = startOf(item.place, cursor);
        for (const child of item.items) {
          const end = resolve(child, position);
          if (!isAbsolute(child)) position = end;
        }
        return position;
      }
      case 'par': {
        const start = startOf(item.place, cursor);
        let end = start;
        for (const child of item.items) {
          const childEnd = resolve(child, start);
          if (!isAbsolute(child)) end = Math.max(end, childEnd);
        }
        return end;
      }
      case 'stagger': {
        const start = startOf(item.place, cursor);
        let end = start;
        item.items.forEach((child, index) => {
          const offset = staggerOrder(index, item.items.length, item.from) * item.each;
          const childEnd = resolve(child, start + offset);
          if (!isAbsolute(child)) end = Math.max(end, childEnd);
        });
        return end;
      }
    }
  };

  const end = resolve(Array.isArray(root) ? seq(root) : (root as TimelineItem), 0);
  duration = Math.max(duration, end);

  const getClip = (name: string): Span => {
    const span = clips.get(name);
    if (!span) throw new ReferenceError(`timeline: no clip named "${name}".`);
    return span;
  };
  const getLabel = (name: string): number => {
    const time = labels.get(name);
    if (time === undefined) throw new ReferenceError(`timeline: no label named "${name}".`);
    return time;
  };

  return {
    duration,
    clips,
    labels,
    clip: getClip,
    label: getLabel,
    at: (name, offset = 0) => getLabel(name) + offset,
    progress(name, t, ease) {
      const span = getClip(name);
      return windowProgress(t, span.start, span.duration, ease);
    },
    isActive(name, t) {
      const span = getClip(name);
      return t >= span.start && t < span.end;
    },
  };
}

function isAbsolute(item: TimelineItem): boolean {
  return item.kind !== 'gap' && item.place.at !== undefined;
}
