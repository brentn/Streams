import { describe, expect, it } from 'vitest';
import { Tributary } from './tributaries';
import { buildTributaryBundles } from './tributary-bundles';
import { bundleId } from './tributary-clusters';

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

describe('buildTributaryBundles', () => {
  it('anchors the bundle arrow at the cluster\'s centroid x, not any one member\'s x', () => {
    const cluster = [tributary({ id: 'a', x: 10, direction: 'in' }), tributary({ id: 'b', x: 20, direction: 'in' })];

    const [bundle] = buildTributaryBundles([cluster], 60, () => 10, () => 3);

    expect(bundle.anchorX).toBe(15);
  });

  it('sizes the stroke from the combined magnitude of every member, via the given scale', () => {
    const cluster = [
      tributary({ id: 'a', x: 10, amount: 50 }),
      tributary({ id: 'b', x: 11, amount: 30 }),
    ];
    const scale = (amount: number) => amount / 10;

    const [bundle] = buildTributaryBundles([cluster], 60, () => 10, scale);

    expect(bundle.strokeWidth).toBe(8); // (50 + 30) / 10
  });

  it('carries the member count for the ×N badge', () => {
    const cluster = [
      tributary({ id: 'a' }),
      tributary({ id: 'b' }),
      tributary({ id: 'c' }),
    ];

    const [bundle] = buildTributaryBundles([cluster], 60, () => 10, () => 3);

    expect(bundle.count).toBe(3);
  });

  it('carries the shared direction through', () => {
    const cluster = [tributary({ direction: 'out' }), tributary({ direction: 'out' })];

    const [bundle] = buildTributaryBundles([cluster], 60, () => 10, () => 3);

    expect(bundle.direction).toBe('out');
  });

  it('uses the same stable id as bundleId, so a click handler can match it back to its cluster', () => {
    const cluster = [tributary({ id: 'a' }), tributary({ id: 'b' })];

    const [bundle] = buildTributaryBundles([cluster], 60, () => 10, () => 3);

    expect(bundle.id).toBe(bundleId(cluster));
  });

  it("scales the tick's length with the shaft's own strokeWidth, same as an individual tributary arrow", () => {
    const cluster = [tributary({ id: 'a' }), tributary({ id: 'b' })];

    const [thin] = buildTributaryBundles([cluster], 60, () => 10, () => 2);
    const [thick] = buildTributaryBundles([cluster], 60, () => 10, () => 10);

    expect(thick.tickLength).toBeGreaterThan(thin.tickLength);
    expect(thin.tickLength).toBeGreaterThan(0);
  });

  it('builds one bundle per cluster, in order', () => {
    const clusterA = [tributary({ id: 'a' }), tributary({ id: 'b' })];
    const clusterB = [tributary({ id: 'c', x: 40 }), tributary({ id: 'd', x: 40 })];

    const bundles = buildTributaryBundles([clusterA, clusterB], 60, () => 10, () => 3);

    expect(bundles).toHaveLength(2);
    expect(bundles[0].id).toBe(bundleId(clusterA));
    expect(bundles[1].id).toBe(bundleId(clusterB));
  });
});
