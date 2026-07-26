import { describe, expect, it } from 'vitest';
import { accumulateScrubDays } from './scrub-gesture';

describe('accumulateScrubDays', () => {
  it('emits nothing and carries the fraction when movement is less than a day', () => {
    const result = accumulateScrubDays(5, 10, 0);
    expect(result).toEqual({ emitDays: 0, carryDays: 0.5 });
  });

  it('emits whole days once accumulated movement crosses a day boundary', () => {
    const result = accumulateScrubDays(25, 10, 0);
    expect(result).toEqual({ emitDays: 2, carryDays: 0.5 });
  });

  it('carries a running fraction across multiple calls', () => {
    const first = accumulateScrubDays(6, 10, 0);
    expect(first).toEqual({ emitDays: 0, carryDays: 0.6 });

    const second = accumulateScrubDays(6, 10, first.carryDays);
    expect(second.emitDays).toBe(1);
    expect(second.carryDays).toBeCloseTo(0.2);
  });

  it('handles negative (leftward/backward) movement symmetrically', () => {
    const result = accumulateScrubDays(-25, 10, 0);
    expect(result).toEqual({ emitDays: -2, carryDays: -0.5 });
  });

  it('is a no-op for zero movement', () => {
    expect(accumulateScrubDays(0, 10, 0.3)).toEqual({ emitDays: 0, carryDays: 0.3 });
  });
});
