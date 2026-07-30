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
  it('draws an incoming line leaning in from the upper-left, joining the river at the occurrence x', () => {
    const [line] = buildTributaryLines([tributary({ direction: 'in', x: 50 })], 60, () => 3);

    expect(line.x1).toBeLessThan(50);
    expect(line.y1).toBeLessThan(60);
    expect(line.x2).toBe(50);
    expect(line.y2).toBe(60);
  });

  it('draws an outgoing line leaving from the river at the occurrence x toward the lower-right', () => {
    const [line] = buildTributaryLines([tributary({ direction: 'out', x: 50 })], 60, () => 3);

    expect(line.x1).toBe(50);
    expect(line.y1).toBe(60);
    expect(line.x2).toBeGreaterThan(50);
    expect(line.y2).toBeGreaterThan(60);
  });

  it('mirrors the incoming and outgoing offsets through the band, at the same fixed angle for both', () => {
    const [inLine] = buildTributaryLines([tributary({ direction: 'in', x: 50 })], 60, () => 3);
    const [outLine] = buildTributaryLines([tributary({ direction: 'out', x: 50 })], 60, () => 3);

    expect(inLine.x1 - 50).toBe(-(outLine.x2 - 50));
    expect(inLine.y1 - 60).toBe(-(outLine.y2 - 60));
  });

  it('takes stroke width from the scale function applied to the amount', () => {
    const [line] = buildTributaryLines([tributary({ amount: 500 })], 60, (amount) => amount / 10);

    expect(line.strokeWidth).toBe(50);
  });

  it('carries the id, direction, and label through for rendering', () => {
    const [line] = buildTributaryLines(
      [tributary({ id: 'flow-1-123', direction: 'out', label: '→ Savings' })],
      60,
      () => 1,
    );

    expect(line.id).toBe('flow-1-123');
    expect(line.direction).toBe('out');
    expect(line.label).toBe('→ Savings');
  });

  it('renders no per-item angle variation — every line uses the same fixed lean', () => {
    const lines = buildTributaryLines(
      [tributary({ x: 10, direction: 'in' }), tributary({ x: 170, direction: 'in' })],
      60,
      () => 3,
    );

    expect(lines[0].x1 - lines[0].x2).toBe(lines[1].x1 - lines[1].x2);
    expect(lines[0].y1 - lines[0].y2).toBe(lines[1].y1 - lines[1].y2);
  });
});
