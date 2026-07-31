import { describe, expect, it } from 'vitest';
import { Tributary } from './tributaries';
import { applyMinorRollup, MINOR_THRESHOLD_FRACTION } from './tributary-minor-rollup';

function tributary(overrides: Partial<Tributary>): Tributary {
  return {
    id: 't-1',
    kind: 'flow',
    direction: 'out',
    date: new Date(2026, 0, 1),
    x: 10,
    amount: 100,
    label: 'Item',
    ...overrides,
  };
}

describe('applyMinorRollup', () => {
  it('rolls up 2+ same-direction items under the minor threshold into one aggregate tributary', () => {
    const major = tributary({ id: 'major', amount: 1000 });
    const minorA = tributary({ id: 'minor-a', amount: 10, x: 5 });
    const minorB = tributary({ id: 'minor-b', amount: 20, x: 15 });

    const result = applyMinorRollup([major, minorA, minorB]);

    expect(result).toHaveLength(2);
    const rollup = result.find((t) => t.kind === 'minor');
    expect(rollup).toBeDefined();
    expect(result).toContainEqual(major);
  });

  it('does not roll up a lone minor item in a direction — it passes through unchanged', () => {
    const major = tributary({ id: 'major', amount: 1000, direction: 'out' });
    const lonelyMinor = tributary({ id: 'lonely', amount: 10, direction: 'in' });

    const result = applyMinorRollup([major, lonelyMinor]);

    expect(result).toHaveLength(2);
    expect(result.find((t) => t.kind === 'minor')).toBeUndefined();
    expect(result).toContainEqual(lonelyMinor);
  });

  it('leaves major (>= threshold) items untouched and passed through as-is', () => {
    const major = tributary({ id: 'major', amount: 1000 });
    const minorA = tributary({ id: 'minor-a', amount: 10 });
    const minorB = tributary({ id: 'minor-b', amount: 20 });

    const result = applyMinorRollup([major, minorA, minorB]);

    expect(result).toContainEqual(major);
  });

  it("sizes the aggregate's amount as the sum of its members' magnitudes", () => {
    const major = tributary({ id: 'major', amount: 1000 });
    const minorA = tributary({ id: 'minor-a', amount: 10 });
    const minorB = tributary({ id: 'minor-b', amount: 15 });

    const [rollup] = applyMinorRollup([major, minorA, minorB]).filter((t) => t.kind === 'minor');

    expect(rollup.amount).toBe(25);
  });

  it("positions the aggregate at the centroid x of its members", () => {
    const major = tributary({ id: 'major', amount: 1000, x: 0 });
    const minorA = tributary({ id: 'minor-a', amount: 10, x: 10 });
    const minorB = tributary({ id: 'minor-b', amount: 15, x: 20 });

    const [rollup] = applyMinorRollup([major, minorA, minorB]).filter((t) => t.kind === 'minor');

    expect(rollup.x).toBe(15);
  });

  it('keeps the original members accessible on the aggregate for its expand-list', () => {
    const major = tributary({ id: 'major', amount: 1000 });
    const minorA = tributary({ id: 'minor-a', amount: 10, label: 'Coffee' });
    const minorB = tributary({ id: 'minor-b', amount: 15, label: 'Parking' });

    const [rollup] = applyMinorRollup([major, minorA, minorB]).filter((t) => t.kind === 'minor');

    expect(rollup.members?.map((m) => m.label).sort()).toEqual(['Coffee', 'Parking']);
  });

  it('produces separate aggregates per direction when both directions have qualifying minors', () => {
    const major = tributary({ id: 'major', amount: 1000, direction: 'out' });
    const minorOutA = tributary({ id: 'minor-out-a', amount: 10, direction: 'out' });
    const minorOutB = tributary({ id: 'minor-out-b', amount: 15, direction: 'out' });
    const minorInA = tributary({ id: 'minor-in-a', amount: 10, direction: 'in' });
    const minorInB = tributary({ id: 'minor-in-b', amount: 15, direction: 'in' });

    const result = applyMinorRollup([major, minorOutA, minorOutB, minorInA, minorInB]);
    const rollups = result.filter((t) => t.kind === 'minor');

    expect(rollups).toHaveLength(2);
    expect(rollups.map((r) => r.direction).sort()).toEqual(['in', 'out']);
  });

  it('returns the tributaries unchanged when nothing qualifies as minor', () => {
    const a = tributary({ id: 'a', amount: 100 });
    const b = tributary({ id: 'b', amount: 90 });

    expect(applyMinorRollup([a, b])).toEqual([a, b]);
  });

  it('returns an empty array unchanged', () => {
    expect(applyMinorRollup([])).toEqual([]);
  });

  it("the aggregate's id stays stable regardless of input member order", () => {
    const major = tributary({ id: 'major', amount: 1000 });
    const minorA = tributary({ id: 'minor-a', amount: 10 });
    const minorB = tributary({ id: 'minor-b', amount: 15 });

    const [rollupForward] = applyMinorRollup([major, minorA, minorB]).filter((t) => t.kind === 'minor');
    const [rollupReversed] = applyMinorRollup([major, minorB, minorA]).filter((t) => t.kind === 'minor');

    expect(rollupForward.id).toBe(rollupReversed.id);
  });

  it(`treats an item as minor only strictly below ${MINOR_THRESHOLD_FRACTION * 100}% of the window's max magnitude`, () => {
    const major = tributary({ id: 'major', amount: 1000 });
    const atThreshold = tributary({ id: 'at-threshold', amount: 1000 * MINOR_THRESHOLD_FRACTION });
    const belowThreshold = tributary({ id: 'below-threshold', amount: 1000 * MINOR_THRESHOLD_FRACTION - 1 });
    const anotherBelow = tributary({ id: 'another-below', amount: 1 });

    const result = applyMinorRollup([major, atThreshold, belowThreshold, anotherBelow]);

    expect(result).toContainEqual(atThreshold);
    expect(result.find((t) => t.kind === 'minor')?.members?.map((m) => m.id).sort()).toEqual([
      'another-below',
      'below-threshold',
    ]);
  });
});
