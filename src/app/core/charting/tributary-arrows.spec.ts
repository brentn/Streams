import { describe, expect, it } from 'vitest';
import { Tributary } from './tributaries';
import { buildTributaryArrows } from './tributary-arrows';

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

describe('buildTributaryArrows', () => {
  it("anchors an incoming arrow to the ribbon's top edge (above centerY) at the occurrence x", () => {
    const [arrow] = buildTributaryArrows([tributary({ direction: 'in', x: 50 })], 60, () => 10, () => 3);

    expect(arrow.anchorX).toBe(50);
    expect(arrow.anchorY).toBe(50); // centerY(60) - halfThickness(10)
  });

  it("anchors an outgoing arrow to the ribbon's bottom edge (below centerY) at the occurrence x", () => {
    const [arrow] = buildTributaryArrows([tributary({ direction: 'out', x: 50 })], 60, () => 10, () => 3);

    expect(arrow.anchorX).toBe(50);
    expect(arrow.anchorY).toBe(70); // centerY(60) + halfThickness(10)
  });

  it("tracks the ribbon edge at each occurrence's own x, not a single fixed thickness", () => {
    const halfThicknessAt = (x: number) => (x === 10 ? 5 : 20);
    const arrows = buildTributaryArrows(
      [tributary({ x: 10, direction: 'in' }), tributary({ x: 90, direction: 'in' })],
      60,
      halfThicknessAt,
      () => 3,
    );

    expect(arrows[0].anchorY).toBe(55); // 60 - 5
    expect(arrows[1].anchorY).toBe(40); // 60 - 20
  });

  it('takes strokeWidth from the scale function applied to the amount', () => {
    const [arrow] = buildTributaryArrows([tributary({ amount: 500 })], 60, () => 10, (amount) => amount / 10);

    expect(arrow.strokeWidth).toBe(50);
  });

  it("scales the tick's length with the shaft's own strokeWidth, not a fixed value", () => {
    const [thin] = buildTributaryArrows([tributary({})], 60, () => 10, () => 2);
    const [thick] = buildTributaryArrows([tributary({})], 60, () => 10, () => 10);

    expect(thick.tickLength).toBeGreaterThan(thin.tickLength);
    expect(thin.tickLength).toBeGreaterThan(0);
  });

  it('carries the id, direction, and label through for rendering', () => {
    const [arrow] = buildTributaryArrows(
      [tributary({ id: 'flow-1-123', direction: 'out', label: '→ Savings' })],
      60,
      () => 10,
      () => 1,
    );

    expect(arrow.id).toBe('flow-1-123');
    expect(arrow.direction).toBe('out');
    expect(arrow.label).toBe('→ Savings');
  });

  it("carries a source Tributary's warning flag through, for #88's distinct treatment", () => {
    const [warned] = buildTributaryArrows([tributary({ warning: true })], 60, () => 10, () => 1);
    const [unwarned] = buildTributaryArrows([tributary({})], 60, () => 10, () => 1);

    expect(warned.warning).toBe(true);
    expect(unwarned.warning).toBeUndefined();
  });
});
