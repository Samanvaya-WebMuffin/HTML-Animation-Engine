import { describe, expect, it } from 'vitest';
import {
  at,
  clip,
  cubicBezier,
  gap,
  label,
  par,
  seq,
  stagger,
  tempo,
  timeline,
} from '../src/index.js';

const span = (start: number, duration: number) => ({ start, duration, end: start + duration });

describe('timeline', () => {
  it('places sequence items end to end, with gaps', () => {
    const tl = timeline([clip('a', 1), gap(0.5), clip('b', 2)]);
    expect(tl.clip('a')).toEqual(span(0, 1));
    expect(tl.clip('b')).toEqual(span(1.5, 2));
    expect(tl.duration).toBe(3.5);
  });

  it('starts parallel items together and ends with the longest', () => {
    const tl = timeline([clip('intro', 1), par([clip('x', 0.5), clip('y', 2)]), clip('after', 1)]);
    expect(tl.clip('x').start).toBe(1);
    expect(tl.clip('y').start).toBe(1);
    expect(tl.clip('after').start).toBe(3);
  });

  it('staggers items from the start, end or centre', () => {
    const names = ['a', 'b', 'c', 'd', 'e'];
    const starts = (from: 'start' | 'end' | 'center') => {
      const tl = timeline(
        stagger(
          names.map((n) => clip(n, 1)),
          0.1,
          { from },
        ),
      );
      return names.map((n) => Number(tl.clip(n).start.toFixed(6)));
    };
    expect(starts('start')).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
    expect(starts('end')).toEqual([0.4, 0.3, 0.2, 0.1, 0]);
    expect(starts('center')).toEqual([0.2, 0.1, 0, 0.1, 0.2]);
    expect(
      timeline(
        stagger(
          names.map((n) => clip(n, 1)),
          0.1,
        ),
      ).duration,
    ).toBeCloseTo(1.4, 12);
  });

  it('resolves labels and at(label, offset)', () => {
    const tl = timeline([
      clip('logo', 1.2),
      label('drop'),
      clip('title', 0.6),
      clip('flash', 0.2, { at: at('drop', 0.1) }),
      clip('late', 0.3, { at: at('drop', -0.5), delay: 0.05 }),
    ]);
    expect(tl.label('drop')).toBe(1.2);
    expect(tl.at('drop', 0.5)).toBe(1.7);
    expect(tl.clip('flash').start).toBeCloseTo(1.3, 12);
    expect(tl.clip('late').start).toBeCloseTo(0.75, 12);
  });

  it('does not move the sequence cursor for items placed with `at`', () => {
    const tl = timeline([clip('a', 1), clip('overlay', 5, { at: 0 }), clip('b', 1)]);
    expect(tl.clip('b').start).toBe(1);
    expect(tl.duration).toBe(5);
  });

  it('nests sequences in parallels in sequences', () => {
    const tl = timeline(
      seq([
        clip('open', 0.5),
        par([seq([clip('l1', 0.3), clip('l2', 0.3)]), clip('r', 0.4)]),
        clip('close', 0.5),
      ]),
    );
    expect(tl.clip('l2').start).toBe(0.8);
    expect(tl.clip('r').start).toBe(0.5);
    expect(tl.clip('close').start).toBeCloseTo(1.1, 12);
  });

  it('reports eased progress and activity per clip', () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    const tl = timeline([gap(1), clip('move', 2)]);
    expect(tl.progress('move', 0.5)).toBe(0);
    expect(tl.progress('move', 2)).toBe(0.5);
    expect(tl.progress('move', 2, ease)).toBeCloseTo(0.5, 6);
    expect(tl.progress('move', 9)).toBe(1);
    expect(tl.isActive('move', 1)).toBe(true);
    expect(tl.isActive('move', 3)).toBe(false);
  });

  it('rejects forward label references, duplicates and negative starts', () => {
    expect(() => timeline([clip('a', 1, { at: at('later') }), label('later')])).toThrow(
      /not defined before/,
    );
    expect(() => timeline([clip('a', 1), clip('a', 1)])).toThrow(/duplicate clip/);
    expect(() => timeline([label('x'), label('x')])).toThrow(/duplicate label/);
    expect(() => timeline([clip('a', 1, { at: 0.2, delay: -1 })])).toThrow(/before 0/);
    expect(() => timeline([clip('a', 1)]).clip('nope')).toThrow(/no clip/);
  });

  it('resolves identically every time', () => {
    const build = () =>
      timeline([
        clip('a', 0.4),
        stagger(
          ['x', 'y', 'z'].map((n) => clip(n, 0.3)),
          0.07,
        ),
      ]);
    expect([...build().clips]).toEqual([...build().clips]);
  });
});

describe('tempo', () => {
  const music = tempo({ bpm: 120 });

  it('converts beats and bars to seconds at 120 BPM in 4/4', () => {
    expect(music.secondsPerBeat).toBe(0.5);
    expect(music.beat(0)).toBe(0);
    expect(music.beat(3)).toBe(1.5);
    expect(music.bar(2)).toBe(4);
    expect(music.beats(1.5)).toBe(0.75);
    expect(music.bars(1)).toBe(2);
  });

  it('honours an offset and other meters', () => {
    const waltz = tempo({ bpm: 90, beatsPerBar: 3, offset: 0.25 });
    expect(waltz.beat(0)).toBe(0.25);
    expect(waltz.bar(1)).toBeCloseTo(0.25 + 2, 12);
    expect(waltz.beatAt(0.25 + 2 / 3)).toBeCloseTo(1, 12);
    expect(waltz.barAt(2.25)).toBeCloseTo(1, 12);
  });

  it('snaps to the nearest beat or subdivision', () => {
    expect(music.snap(1.2)).toBe(1);
    expect(music.snap(1.3)).toBe(1.5);
    expect(music.snap(1.2, 2)).toBe(1.25);
  });

  it('pulses to 1 on every beat and decays between beats', () => {
    for (let n = 0; n < 8; n++) expect(music.pulse(music.beat(n))).toBeCloseTo(1, 9);
    expect(music.pulse(music.beat(2) + 0.24)).toBeLessThan(0.1);
    expect(music.pulse(-0.1)).toBe(0);
  });

  it('locks timeline clips to the beat grid', () => {
    const tl = timeline([
      clip('kick', music.beats(1), { at: music.bar(1) }),
      clip('title', music.beats(2), { at: music.beat(6) }),
    ]);
    expect(tl.clip('kick').start).toBe(2);
    expect(tl.clip('title')).toEqual(span(3, 1));
  });

  it('rejects invalid tempos', () => {
    expect(() => tempo({ bpm: 0 })).toThrow(RangeError);
    expect(() => tempo({ bpm: 120, beatsPerBar: 2.5 })).toThrow(RangeError);
  });
});
