import { describe, expect, it } from 'vitest';
import {
  BALANCE_COLOR_DOMAIN,
  balanceColorSegment,
  hueRunsByPoint,
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

describe('hueRunsByPoint', () => {
  it('returns no runs for fewer than two points', () => {
    expect(hueRunsByPoint([], 1)).toEqual([]);
    expect(hueRunsByPoint([{ x: 0, balance: 100 }], 1)).toEqual([]);
  });

  it('builds one run per single segment, with a leading and trailing gradient stop', () => {
    const points: BandPoint[] = [
      { x: 0, balance: 1000 },
      { x: 1, balance: 1000 },
    ];

    const runs = hueRunsByPoint(points, 1);
    const opacity = balanceColorSegment(1000, 1).opacity;

    expect(runs).toEqual([
      {
        points,
        hue: 'positive',
        stops: [
          { x: 0, opacity },
          { x: 1, opacity },
        ],
      },
    ]);
  });

  it(
    'groups 3+ consecutive same-hue segments into one run spanning every point, keeping each ' +
      "day's own differing opacity as a separate stop — unlike the superseded mergeAdjacentSegments, " +
      'which required matching opacity too and would have kept these as separate polygons',
    () => {
      const points: BandPoint[] = [
        { x: 0, balance: 0 },
        { x: 1, balance: 2500 },
        { x: 2, balance: 5000 },
        { x: 3, balance: 5000 },
      ];

      const runs = hueRunsByPoint(points, 1);

      expect(runs).toHaveLength(1);
      expect(runs[0].hue).toBe('positive');
      expect(runs[0].points).toEqual(points);
      expect(runs[0].stops).toEqual([
        { x: 0, opacity: balanceColorSegment(0, 1).opacity },
        { x: 1, opacity: balanceColorSegment(2500, 1).opacity },
        { x: 2, opacity: balanceColorSegment(5000, 1).opacity },
        { x: 3, opacity: balanceColorSegment(5000, 1).opacity },
      ]);
      // the three stops are genuinely distinct, not one shared value
      expect(new Set(runs[0].stops.map((s) => s.opacity)).size).toBe(3);
    },
  );

  it(
    'splits into a separate run at a hue flip, with the shared boundary point carrying the ' +
      "same opacity on both sides — the color hard-cuts at the flip, but the magnitude ramp " +
      'stays continuous across it',
    () => {
      const points: BandPoint[] = [
        { x: 0, balance: 1000 },
        { x: 1, balance: -1000 },
        { x: 2, balance: -1000 },
      ];

      const runs = hueRunsByPoint(points, 1);

      expect(runs).toHaveLength(2);
      expect(runs[0].hue).toBe('positive');
      expect(runs[0].points).toEqual([points[0], points[1]]);
      expect(runs[1].hue).toBe('negative');
      expect(runs[1].points).toEqual([points[1], points[2]]);

      const boundaryOpacity = balanceColorSegment(-1000, 1).opacity;
      expect(runs[0].stops[runs[0].stops.length - 1]).toEqual({ x: 1, opacity: boundaryOpacity });
      expect(runs[1].stops[0]).toEqual({ x: 1, opacity: boundaryOpacity });
    },
  );

  it('resumes a fresh run after a hue-change break, rather than merging back into the earlier run', () => {
    const points: BandPoint[] = [
      { x: 0, balance: 1000 },
      { x: 1, balance: -1000 },
      { x: 2, balance: 1000 },
      { x: 3, balance: 1000 },
    ];

    const runs = hueRunsByPoint(points, 1);

    expect(runs.map((run) => run.hue)).toEqual(['positive', 'negative', 'positive']);
  });

  it('reads a Liability account through Signed Balance for its hue runs, same as segmentsByPoint', () => {
    const points: BandPoint[] = [
      { x: 0, balance: -1000 },
      { x: 1, balance: -1000 },
    ];

    const runs = hueRunsByPoint(points, -1);

    expect(runs).toHaveLength(1);
    expect(runs[0].hue).toBe('positive');
  });

  it("honors a passed curve (e.g. the Total lane's) instead of the default account curve", () => {
    const points: BandPoint[] = [
      { x: 0, balance: 800 },
      { x: 1, balance: 800 },
    ];
    const curve = totalColorCurve(1000);

    const runs = hueRunsByPoint(points, 1, curve);

    expect(runs[0].stops[0].opacity).toBeCloseTo(1.0); // 80% of the 1000 domain -> ceiling
  });
});
