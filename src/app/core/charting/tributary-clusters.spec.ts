import { describe, expect, it } from 'vitest';
import { Tributary } from './tributaries';
import { bundleId, CLUSTER_THRESHOLD_DAYS, clusterTributaries, flattenGroupMembers } from './tributary-clusters';

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

describe('flattenGroupMembers', () => {
  it('passes a real (non-minor) member through unchanged', () => {
    const a = tributary({ id: 'a', kind: 'flow' });
    const b = tributary({ id: 'b', kind: 'transfer' });

    expect(flattenGroupMembers([a, b])).toEqual([a, b]);
  });

  it("expands a 'minor' rollup member into its own real members, rather than listing it as one opaque row", () => {
    const minorMemberA = tributary({ id: 'coffee', label: 'Coffee' });
    const minorMemberB = tributary({ id: 'parking', label: 'Parking' });
    const rollup = tributary({
      id: 'minor-out-x',
      kind: 'minor',
      members: [minorMemberA, minorMemberB],
    });
    const major = tributary({ id: 'rent', kind: 'flow' });

    const result = flattenGroupMembers([major, rollup]);

    expect(result).toEqual([major, minorMemberA, minorMemberB]);
  });

  it('returns nothing for an empty cluster', () => {
    expect(flattenGroupMembers([])).toEqual([]);
  });
});
