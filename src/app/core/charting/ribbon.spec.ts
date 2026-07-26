import { describe, expect, it } from 'vitest';
import { halfThicknessScale, ribbonPoints } from './ribbon';

describe('halfThicknessScale', () => {
  it('scales |balance| linearly against the window max, capped at maxHalfThicknessPx', () => {
    const scale = halfThicknessScale(1000, 20);
    expect(scale(500)).toBe(10);
    expect(scale(-500)).toBe(10);
    expect(scale(1000)).toBe(20);
    expect(scale(0)).toBe(0);
  });

  it('returns zero thickness everywhere when the window max is zero', () => {
    const scale = halfThicknessScale(0, 20);
    expect(scale(0)).toBe(0);
  });
});

describe('ribbonPoints', () => {
  it('returns an empty string for no points', () => {
    expect(ribbonPoints([], 50, () => 10)).toBe('');
  });

  it('traces the top edge forward then the bottom edge backward', () => {
    const points = [
      { x: 0, balance: 100 },
      { x: 10, balance: 200 },
    ];

    const result = ribbonPoints(points, 50, (b) => b / 10);

    expect(result).toBe('0,40 10,30 10,70 0,60');
  });
});
