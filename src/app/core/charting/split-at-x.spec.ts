import { describe, expect, it } from 'vitest';
import { splitAtX } from './split-at-x';

describe('splitAtX', () => {
  it('returns both empty for an empty series', () => {
    expect(splitAtX([], 5)).toEqual({ before: [], after: [] });
  });

  it('puts everything in "before" when the boundary is past the last point', () => {
    const points = [
      { x: 0, balance: 10 },
      { x: 1, balance: 20 },
    ];
    expect(splitAtX(points, 5)).toEqual({ before: points, after: [] });
  });

  it('puts everything in "after" when the boundary is before the first point', () => {
    const points = [
      { x: 5, balance: 10 },
      { x: 6, balance: 20 },
    ];
    expect(splitAtX(points, 0)).toEqual({ before: [], after: points });
  });

  it('splits and shares an interpolated boundary point between both halves', () => {
    const points = [
      { x: 0, balance: 0 },
      { x: 10, balance: 100 },
    ];

    const { before, after } = splitAtX(points, 4);

    expect(before).toEqual([
      { x: 0, balance: 0 },
      { x: 4, balance: 40 },
    ]);
    expect(after).toEqual([
      { x: 4, balance: 40 },
      { x: 10, balance: 100 },
    ]);
  });

  it('does not interpolate when the boundary lands exactly on a sample', () => {
    const points = [
      { x: 0, balance: 0 },
      { x: 4, balance: 40 },
      { x: 10, balance: 100 },
    ];

    const { before, after } = splitAtX(points, 4);

    expect(before).toEqual([
      { x: 0, balance: 0 },
      { x: 4, balance: 40 },
    ]);
    expect(after).toEqual([
      { x: 4, balance: 40 },
      { x: 10, balance: 100 },
    ]);
  });
});
