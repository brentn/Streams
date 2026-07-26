import { describe, expect, it } from 'vitest';
import { segmentBandBySign } from './band-segments';

describe('segmentBandBySign', () => {
  it('returns no segments for an empty series', () => {
    expect(segmentBandBySign([], 1)).toEqual([]);
  });

  it('returns a single "expected" segment when every point matches the expected sign', () => {
    const points = [
      { x: 0, balance: 100 },
      { x: 1, balance: 200 },
      { x: 2, balance: 50 },
    ];

    const segments = segmentBandBySign(points, 1);

    expect(segments).toEqual([{ sign: 'expected', points }]);
  });

  it('returns a single "opposite" segment when every point is on the opposite side', () => {
    const points = [
      { x: 0, balance: -100 },
      { x: 1, balance: -50 },
    ];

    const segments = segmentBandBySign(points, 1);

    expect(segments).toEqual([{ sign: 'opposite', points }]);
  });

  it('treats a zero balance as matching the expected sign, not opposite', () => {
    const points = [
      { x: 0, balance: 100 },
      { x: 1, balance: 0 },
      { x: 2, balance: 50 },
    ];

    const segments = segmentBandBySign(points, 1);

    expect(segments).toEqual([{ sign: 'expected', points }]);
  });

  it('splits into segments at a sign crossing, inserting an interpolated zero-crossing boundary point shared by both segments', () => {
    const points = [
      { x: 0, balance: 100 },
      { x: 2, balance: -100 },
    ];

    const segments = segmentBandBySign(points, 1);

    expect(segments).toEqual([
      {
        sign: 'expected',
        points: [
          { x: 0, balance: 100 },
          { x: 1, balance: 0 },
        ],
      },
      {
        sign: 'opposite',
        points: [
          { x: 1, balance: 0 },
          { x: 2, balance: -100 },
        ],
      },
    ]);
  });

  it('handles multiple crossings, alternating segment sign each time', () => {
    const points = [
      { x: 0, balance: 100 },
      { x: 1, balance: -100 },
      { x: 2, balance: 100 },
    ];

    const segments = segmentBandBySign(points, 1);

    expect(segments.map((s) => s.sign)).toEqual(['expected', 'opposite', 'expected']);
    // Interior boundary points are shared exactly between adjoining segments.
    expect(segments[0].points.at(-1)).toEqual(segments[1].points.at(0));
    expect(segments[1].points.at(-1)).toEqual(segments[2].points.at(0));
    expect(segments[0].points[0]).toEqual({ x: 0, balance: 100 });
    expect(segments[2].points.at(-1)).toEqual({ x: 2, balance: 100 });
  });

  it('classifies for a liability account (expectedSign -1) so a negative balance is "expected"', () => {
    const points = [
      { x: 0, balance: -500 },
      { x: 1, balance: 300 },
    ];

    const segments = segmentBandBySign(points, -1);

    expect(segments.map((s) => s.sign)).toEqual(['expected', 'opposite']);
  });

  it('returns a single segment for a lone point', () => {
    const segments = segmentBandBySign([{ x: 0, balance: -10 }], 1);

    expect(segments).toEqual([{ sign: 'opposite', points: [{ x: 0, balance: -10 }] }]);
  });
});
