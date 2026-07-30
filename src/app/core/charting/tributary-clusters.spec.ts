import { describe, expect, it } from 'vitest';
import { Tributary } from './tributaries';
import {
  bundleId,
  CLUSTER_THRESHOLD_DAYS,
  clusterTributaries,
  spreadExactDateCollisions,
  ZOOM_CONTEXT_DAYS,
  zoomRangeFor,
} from './tributary-clusters';

function tributary(overrides: Partial<Tributary>): Tributary {
  return {
    id: 't-1',
    kind: 'flow',
    direction: 'in',
    date: new Date(2026, 6, 10),
    x: 50,
    amount: 100,
    label: 'Paycheck',
    ...overrides,
  };
}

describe('clusterTributaries', () => {
  it('groups same-direction items within the proximity threshold into one cluster', () => {
    const items = [
      tributary({ id: 'a', x: 10, direction: 'out' }),
      tributary({ id: 'b', x: 11, direction: 'out' }),
      tributary({ id: 'c', x: 12, direction: 'out' }),
    ];

    const clusters = clusterTributaries(items);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('splits items farther apart than the threshold into separate clusters', () => {
    const items = [
      tributary({ id: 'a', x: 10, direction: 'out' }),
      tributary({ id: 'b', x: 10 + CLUSTER_THRESHOLD_DAYS + 1, direction: 'out' }),
    ];

    const clusters = clusterTributaries(items);

    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.length)).toEqual([1, 1]);
  });

  it('never merges opposite-direction items regardless of proximity', () => {
    const items = [
      tributary({ id: 'a', x: 10, direction: 'in' }),
      tributary({ id: 'b', x: 10, direction: 'out' }),
    ];

    const clusters = clusterTributaries(items);

    expect(clusters).toHaveLength(2);
  });

  it('clusters items of mixed kind (flow, transfer, uncategorized) together by direction alone', () => {
    const items = [
      tributary({ id: 'a', kind: 'flow', x: 10, direction: 'out' }),
      tributary({ id: 'b', kind: 'transfer', x: 11, direction: 'out' }),
      tributary({ id: 'c', kind: 'uncategorized', x: 12, direction: 'out' }),
    ];

    const clusters = clusterTributaries(items);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });

  it('returns nothing for an empty input', () => {
    expect(clusterTributaries([])).toEqual([]);
  });

  it('treats a lone item as a cluster of one', () => {
    const clusters = clusterTributaries([tributary({ id: 'a' })]);
    expect(clusters).toEqual([[tributary({ id: 'a' })]]);
  });
});

describe('bundleId', () => {
  it('is stable regardless of member order', () => {
    const a = tributary({ id: 'a' });
    const b = tributary({ id: 'b' });

    expect(bundleId([a, b])).toBe(bundleId([b, a]));
  });

  it('differs for clusters with different membership', () => {
    const a = tributary({ id: 'a' });
    const b = tributary({ id: 'b' });
    const c = tributary({ id: 'c' });

    expect(bundleId([a, b])).not.toBe(bundleId([a, c]));
  });
});

describe('zoomRangeFor', () => {
  it('expands the cluster\'s x-range by the surrounding-context margin on both sides', () => {
    const cluster = [tributary({ x: 20 }), tributary({ x: 25 })];

    const { lo, hi } = zoomRangeFor(cluster, 59);

    expect(lo).toBe(20 - ZOOM_CONTEXT_DAYS);
    expect(hi).toBe(25 + ZOOM_CONTEXT_DAYS);
  });

  it('clamps to the window bounds rather than going negative or past maxX', () => {
    const cluster = [tributary({ x: 1 }), tributary({ x: 2 })];

    const { lo, hi } = zoomRangeFor(cluster, 59);

    expect(lo).toBe(0);
    expect(hi).toBe(2 + ZOOM_CONTEXT_DAYS);
  });

  it('never collapses to a zero-width range', () => {
    const cluster = [tributary({ x: 0 })];

    const { lo, hi } = zoomRangeFor(cluster, 0);

    expect(hi).toBeGreaterThan(lo);
  });
});

describe('spreadExactDateCollisions', () => {
  it('leaves a single member at its real x when no other member shares its date', () => {
    const cluster = [tributary({ id: 'a', x: 10, date: new Date(2026, 6, 1) })];

    const [result] = spreadExactDateCollisions(cluster);

    expect(result.x).toBe(10);
  });

  it('spreads members sharing an exact date to distinct x positions around the real date', () => {
    const sameDate = new Date(2026, 6, 15);
    const cluster = [
      tributary({ id: 'a', x: 30, date: sameDate }),
      tributary({ id: 'b', x: 30, date: sameDate }),
      tributary({ id: 'c', x: 30, date: sameDate }),
    ];

    const result = spreadExactDateCollisions(cluster);
    const xs = result.map((t) => t.x);

    expect(new Set(xs).size).toBe(3);
    for (const x of xs) {
      expect(x).toBeGreaterThan(29);
      expect(x).toBeLessThan(31);
    }
  });

  it('does not spread members that merely land nearby but on different dates', () => {
    const cluster = [
      tributary({ id: 'a', x: 30, date: new Date(2026, 6, 15) }),
      tributary({ id: 'b', x: 31, date: new Date(2026, 6, 16) }),
    ];

    const result = spreadExactDateCollisions(cluster);

    expect(result.find((t) => t.id === 'a')?.x).toBe(30);
    expect(result.find((t) => t.id === 'b')?.x).toBe(31);
  });

  it('preserves every other field on spread members', () => {
    const sameDate = new Date(2026, 6, 15);
    const cluster = [
      tributary({ id: 'a', x: 30, date: sameDate, label: 'Groceries', amount: 42 }),
      tributary({ id: 'b', x: 30, date: sameDate, label: 'Gas', amount: 55 }),
    ];

    const result = spreadExactDateCollisions(cluster);

    expect(result.find((t) => t.id === 'a')).toMatchObject({ label: 'Groceries', amount: 42 });
    expect(result.find((t) => t.id === 'b')).toMatchObject({ label: 'Gas', amount: 55 });
  });
});
