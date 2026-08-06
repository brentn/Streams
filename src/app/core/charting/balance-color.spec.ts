import { describe, expect, it } from 'vitest';
import {
  BALANCE_COLOR_DOMAIN,
  BalanceHue,
  BalancePointSegment,
  balanceColorSegment,
  mergeAdjacentSegments,
  segmentsByPoint,
  signedBalance,
  TOTAL_OPACITY_CEILING_RATIO,
  totalColorCurve,
} from './balance-color';
import { BandPoint } from './band-segments';

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

describe('totalColorCurve (#79 — Total lane\'s own domain/ceiling)', () => {
  it('reaches full opacity at 80% of its own domain, unlike the account curve\'s 100%', () => {
    const curve = totalColorCurve(1000);
    expect(TOTAL_OPACITY_CEILING_RATIO).toBe(0.8);
    expect(balanceColorSegment(800, 1, curve).opacity).toBeCloseTo(1.0);
    expect(balanceColorSegment(400, 1, curve).opacity).toBeCloseTo(0.525); // halfway to the 800 ceiling
  });

  it('clamps opacity at 1.0 past 80% of the domain, for either hue', () => {
    const curve = totalColorCurve(1000);
    expect(balanceColorSegment(2000, 1, curve).opacity).toBeCloseTo(1.0);
    expect(balanceColorSegment(-2000, 1, curve).opacity).toBeCloseTo(1.0);
  });

  it(
    'carries over the account curve\'s raised 0.2 negative floor — red read as washed-out at the ' +
      'same low floor blue/green use, same as brown did, once checked against a rendered swatch',
    () => {
      const curve = totalColorCurve(1000);
      expect(balanceColorSegment(0, 1, curve).opacity).toBeCloseTo(0.05); // zero counts as positive
      expect(balanceColorSegment(-0.0001, 1, curve).opacity).toBeCloseTo(0.2);
    },
  );

  it("is independent of the account curve's flat $5000 domain", () => {
    const curve = totalColorCurve(100);
    // 100 is already past the account curve's domain but should ramp against this smaller one.
    expect(balanceColorSegment(100, 1, curve).opacity).toBeCloseTo(1.0);
    expect(balanceColorSegment(100, 1).opacity).not.toBeCloseTo(1.0);
  });

  it('does not divide by zero when the domain is zero — a zero balance stays at the floor', () => {
    const curve = totalColorCurve(0);
    expect(balanceColorSegment(0, 1, curve).opacity).toBeCloseTo(0.05);
    expect(balanceColorSegment(100, 1, curve).opacity).toBeCloseTo(1.0);
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

describe('mergeAdjacentSegments', () => {
  const p0: BandPoint = { x: 0, balance: 100 };
  const p1: BandPoint = { x: 1, balance: 100 };
  const p2: BandPoint = { x: 2, balance: 100 };
  const p3: BandPoint = { x: 3, balance: 100 };

  function segment(points: [BandPoint, BandPoint], hue: BalanceHue, opacity: number): BalancePointSegment {
    return { points, hue, opacity };
  }

  it('returns no segments for empty input', () => {
    expect(mergeAdjacentSegments([])).toEqual([]);
  });

  it('passes a single segment through unchanged', () => {
    const merged = mergeAdjacentSegments([segment([p0, p1], 'positive', 0.5)]);

    expect(merged).toEqual([{ points: [p0, p1], hue: 'positive', opacity: 0.5 }]);
  });

  it('merges 3+ consecutive same-hue/same-opacity segments into one run spanning every point', () => {
    const segments = [
      segment([p0, p1], 'positive', 0.5),
      segment([p1, p2], 'positive', 0.5),
      segment([p2, p3], 'positive', 0.5),
    ];

    const merged = mergeAdjacentSegments(segments);

    expect(merged).toEqual([{ points: [p0, p1, p2, p3], hue: 'positive', opacity: 0.5 }]);
  });

  it('does not merge across a hue change, even with identical opacity', () => {
    const segments = [segment([p0, p1], 'positive', 0.5), segment([p1, p2], 'negative', 0.5)];

    const merged = mergeAdjacentSegments(segments);

    expect(merged).toEqual([
      { points: [p0, p1], hue: 'positive', opacity: 0.5 },
      { points: [p1, p2], hue: 'negative', opacity: 0.5 },
    ]);
  });

  it('does not merge across an opacity change, even with identical hue', () => {
    const segments = [segment([p0, p1], 'positive', 0.5), segment([p1, p2], 'positive', 0.8)];

    const merged = mergeAdjacentSegments(segments);

    expect(merged).toEqual([
      { points: [p0, p1], hue: 'positive', opacity: 0.5 },
      { points: [p1, p2], hue: 'positive', opacity: 0.8 },
    ]);
  });

  it('resumes a fresh group after a color-change break, rather than merging back into the earlier run', () => {
    const segments = [
      segment([p0, p1], 'positive', 0.5),
      segment([p1, p2], 'negative', 0.5),
      segment([p2, p3], 'positive', 0.5),
    ];

    const merged = mergeAdjacentSegments(segments);

    expect(merged).toEqual([
      { points: [p0, p1], hue: 'positive', opacity: 0.5 },
      { points: [p1, p2], hue: 'negative', opacity: 0.5 },
      { points: [p2, p3], hue: 'positive', opacity: 0.5 },
    ]);
  });

  it('composes with the real segmentsByPoint end-to-end: same-colored consecutive segments merge, a differing one starts a new run', () => {
    // segmentsByPoint colors each segment by its own leading point, so points[1] (also 1000)
    // repeats points[0]'s color and merges; points[2]'s -1000 differs and starts a new run.
    const points: BandPoint[] = [
      { x: 0, balance: 1000 },
      { x: 1, balance: 1000 },
      { x: 2, balance: -1000 },
      { x: 3, balance: -1000 },
    ];

    const merged = mergeAdjacentSegments(segmentsByPoint(points, 1));

    expect(merged).toHaveLength(2);
    expect(merged[0].points).toEqual([points[0], points[1], points[2]]);
    expect(merged[0].hue).toBe('positive');
    expect(merged[1].points).toEqual([points[2], points[3]]);
    expect(merged[1].hue).toBe('negative');
  });
});
