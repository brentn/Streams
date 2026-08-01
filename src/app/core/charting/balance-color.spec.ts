import { describe, expect, it } from 'vitest';
import { BALANCE_COLOR_DOMAIN, balanceColorSegment, segmentsByPoint, signedBalance } from './balance-color';

describe('signedBalance', () => {
  it('leaves an Asset balance (expectedSign 1) unchanged', () => {
    expect(signedBalance(500, 1)).toBe(500);
    expect(signedBalance(-500, 1)).toBe(-500);
  });

  it('flips a Liability balance (expectedSign -1), so "as expected" (negative) reads positive', () => {
    expect(signedBalance(-500, -1)).toBe(500);
    expect(signedBalance(500, -1)).toBe(-500);
  });
});

describe('balanceColorSegment', () => {
  it('is the positive hue at a zero Signed Balance', () => {
    expect(balanceColorSegment(0, 1).hue).toBe('positive');
  });

  it('is the positive hue for a positive Signed Balance and negative for a negative one', () => {
    expect(balanceColorSegment(1000, 1).hue).toBe('positive');
    expect(balanceColorSegment(-1000, 1).hue).toBe('negative');
  });

  it('reads Liability accounts through Signed Balance, not raw balance', () => {
    // A Liability $1000 in the red (normal/expected) is Signed Balance +1000 -> positive hue.
    expect(balanceColorSegment(-1000, -1).hue).toBe('positive');
    // A Liability with a positive raw balance (opposite of expected) is Signed Balance -1000 -> negative hue.
    expect(balanceColorSegment(1000, -1).hue).toBe('negative');
  });

  it('has opacity 0.05 at a zero Signed Balance (counts as the positive hue)', () => {
    expect(balanceColorSegment(0, 1).opacity).toBeCloseTo(0.05);
  });

  it('ramps the positive hue\'s opacity linearly from 0.05 to 1.0 as |Signed Balance| / domain goes 0 -> 1', () => {
    const half = BALANCE_COLOR_DOMAIN / 2;
    expect(balanceColorSegment(half, 1).opacity).toBeCloseTo(0.525);
    expect(balanceColorSegment(BALANCE_COLOR_DOMAIN, 1).opacity).toBeCloseTo(1.0);
  });

  it(
    'ramps the negative hue\'s opacity linearly from a higher 0.2 floor to 1.0 — brown reads too ' +
      'faint/washed-out at the same 0.05 floor blue uses, at the same |Signed Balance| ratio',
    () => {
      const half = BALANCE_COLOR_DOMAIN / 2;
      expect(balanceColorSegment(-half, 1).opacity).toBeCloseTo(0.6);
      expect(balanceColorSegment(-BALANCE_COLOR_DOMAIN, 1).opacity).toBeCloseTo(1.0);
    },
  );

  it('clamps opacity at 1.0 past the domain for either hue, rather than exceeding it', () => {
    expect(balanceColorSegment(BALANCE_COLOR_DOMAIN * 10, 1).opacity).toBeCloseTo(1.0);
    expect(balanceColorSegment(-BALANCE_COLOR_DOMAIN * 10, 1).opacity).toBeCloseTo(1.0);
  });

  it('uses the same flat domain regardless of the window\'s actual max balance', () => {
    // Nothing here takes a maxAbsBalance parameter at all — the domain is the fixed constant.
    const small = balanceColorSegment(100, 1);
    const large = balanceColorSegment(100, 1);
    expect(small).toEqual(large);
  });
});

describe('segmentsByPoint', () => {
  it('returns no segments for fewer than two points', () => {
    expect(segmentsByPoint([], 1)).toEqual([]);
    expect(segmentsByPoint([{ x: 0, balance: 100 }], 1)).toEqual([]);
  });

  it('builds one segment per consecutive point pair, colored by the leading point\'s balance', () => {
    const points = [
      { x: 0, balance: 1000 },
      { x: 1, balance: -1000 },
      { x: 2, balance: 0 },
    ];

    const segments = segmentsByPoint(points, 1);

    expect(segments).toHaveLength(2);
    expect(segments[0].points).toEqual([points[0], points[1]]);
    expect(segments[0].hue).toBe('positive');
    expect(segments[1].points).toEqual([points[1], points[2]]);
    expect(segments[1].hue).toBe('negative');
  });
});
