import { describe, expect, it } from 'vitest';
import { buildRenderSegments } from './render-segments';

describe('buildRenderSegments', () => {
  it('produces one actual/expected segment when everything is before the boundary and on the expected side', () => {
    const points = [
      { x: 0, balance: 100 },
      { x: 1, balance: 200 },
    ];

    const segments = buildRenderSegments(points, 1, 5);

    expect(segments).toEqual([{ phase: 'actual', sign: 'expected', points }]);
  });

  it('splits into actual and projected phases at the boundary', () => {
    const points = [
      { x: 0, balance: 100 },
      { x: 10, balance: 100 },
    ];

    const segments = buildRenderSegments(points, 1, 5);

    expect(segments.map((s) => s.phase)).toEqual(['actual', 'projected']);
    expect(segments[0].points.at(-1)).toEqual(segments[1].points.at(0));
  });

  it('splits by sign within each phase independently', () => {
    const points = [
      { x: 0, balance: 100 },
      { x: 2, balance: -100 },
      { x: 4, balance: -100 },
      { x: 10, balance: 100 },
    ];

    const segments = buildRenderSegments(points, 1, 4);

    expect(segments.map((s) => `${s.phase}/${s.sign}`)).toEqual([
      'actual/expected',
      'actual/opposite',
      'projected/opposite',
      'projected/expected',
    ]);
  });
});
