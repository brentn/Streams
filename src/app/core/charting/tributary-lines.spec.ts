import { describe, expect, it } from 'vitest';
import { Tributary } from './tributaries';
import { buildTributaryLines } from './tributary-lines';

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

describe('buildTributaryLines', () => {
  it('joins an incoming line to the ribbon\'s top edge (above centerY) at the occurrence x, leaning in from the upper-left', () => {
    const [line] = buildTributaryLines([tributary({ direction: 'in', x: 50 })], 60, () => 10, () => 3);

    expect(line.x2).toBe(50);
    expect(line.y2).toBe(50); // centerY(60) - halfThickness(10)
    expect(line.x1).toBeLessThan(50);
    expect(line.y1).toBeLessThan(line.y2);
  });

  it('leaves an outgoing line from the ribbon\'s bottom edge (below centerY) at the occurrence x, toward the lower-right', () => {
    const [line] = buildTributaryLines([tributary({ direction: 'out', x: 50 })], 60, () => 10, () => 3);

    expect(line.x1).toBe(50);
    expect(line.y1).toBe(70); // centerY(60) + halfThickness(10)
    expect(line.x2).toBeGreaterThan(50);
    expect(line.y2).toBeGreaterThan(line.y1);
  });

  it('tracks the ribbon edge at each occurrence\'s own x, not a single fixed thickness', () => {
    const halfThicknessAt = (x: number) => (x === 10 ? 5 : 20);
    const lines = buildTributaryLines(
      [tributary({ x: 10, direction: 'in' }), tributary({ x: 90, direction: 'in' })],
      60,
      halfThicknessAt,
      () => 3,
    );

    expect(lines[0].y2).toBe(55); // 60 - 5
    expect(lines[1].y2).toBe(40); // 60 - 20
  });

  it('mirrors the incoming and outgoing lean through the band, at the same fixed angle for both', () => {
    const [inLine] = buildTributaryLines([tributary({ direction: 'in', x: 50 })], 60, () => 10, () => 3);
    const [outLine] = buildTributaryLines([tributary({ direction: 'out', x: 50 })], 60, () => 10, () => 3);

    expect(inLine.x1 - 50).toBe(-(outLine.x2 - 50));
    expect(inLine.y1 - inLine.y2).toBe(-(outLine.y2 - outLine.y1));
  });

  it('takes stroke width from the scale function applied to the amount', () => {
    const [line] = buildTributaryLines([tributary({ amount: 500 })], 60, () => 10, (amount) => amount / 10);

    expect(line.strokeWidth).toBe(50);
  });

  it('carries the id, direction, and label through for rendering', () => {
    const [line] = buildTributaryLines(
      [tributary({ id: 'flow-1-123', direction: 'out', label: '→ Savings' })],
      60,
      () => 10,
      () => 1,
    );

    expect(line.id).toBe('flow-1-123');
    expect(line.direction).toBe('out');
    expect(line.label).toBe('→ Savings');
  });

  it('places the label at the free end, away from the crowded river — x1/y1 for incoming, x2/y2 for outgoing', () => {
    const [inLine] = buildTributaryLines([tributary({ direction: 'in' })], 60, () => 10, () => 3);
    const [outLine] = buildTributaryLines([tributary({ direction: 'out' })], 60, () => 10, () => 3);

    expect(inLine.labelX).toBe(inLine.x1);
    expect(inLine.labelY).toBe(inLine.y1);
    expect(outLine.labelX).toBe(outLine.x2);
    expect(outLine.labelY).toBe(outLine.y2);
  });

  it('renders no per-item angle variation — every line uses the same fixed lean', () => {
    const lines = buildTributaryLines(
      [tributary({ x: 10, direction: 'in' }), tributary({ x: 30, direction: 'in' })],
      60,
      () => 10,
      () => 3,
    );

    expect(lines[0].x1 - lines[0].x2).toBe(lines[1].x1 - lines[1].x2);
    expect(lines[0].y1 - lines[0].y2).toBe(lines[1].y1 - lines[1].y2);
  });
});
