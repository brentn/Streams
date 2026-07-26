import { describe, expect, it } from 'vitest';
import { laneHeightsFor } from './lane-heights';

describe('laneHeightsFor', () => {
  it('returns the desktop heights when not narrow', () => {
    expect(laneHeightsFor(false)).toEqual({ total: 72, account: 56 });
  });

  it('returns shorter heights at phone width, shrinking in place rather than restructuring', () => {
    expect(laneHeightsFor(true)).toEqual({ total: 56, account: 44 });
  });
});
