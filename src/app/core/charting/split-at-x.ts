import { BandPoint } from './band-segments';

export interface SplitResult {
  before: BandPoint[];
  after: BandPoint[];
}

/**
 * Splits a series at a fixed x (the actual/projected boundary — today's
 * balanceDate). Interpolates a shared boundary point when the boundary falls
 * between two samples, so the two halves join continuously; reuses the exact
 * sample when the boundary lands on one instead of duplicating it.
 */
export function splitAtX(points: BandPoint[], boundaryX: number): SplitResult {
  const before: BandPoint[] = [];
  const after: BandPoint[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.x <= boundaryX) {
      before.push(p);
      continue;
    }

    if (after.length === 0) {
      const prev = points[i - 1];
      const boundary =
        prev !== undefined && prev.x === boundaryX
          ? prev
          : prev !== undefined
            ? interpolate(prev, p, boundaryX)
            : undefined;
      if (boundary !== undefined) {
        if (boundary !== prev) before.push(boundary);
        after.push(boundary);
      }
    }

    after.push(p);
  }

  return { before, after };
}

function interpolate(a: BandPoint, b: BandPoint, x: number): BandPoint {
  const t = (x - a.x) / (b.x - a.x);
  return { x, balance: a.balance + (b.balance - a.balance) * t };
}
