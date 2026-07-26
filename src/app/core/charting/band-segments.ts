import { Sign } from '../models/account';

export interface BandPoint {
  x: number;
  balance: number;
}

export type BandSign = 'expected' | 'opposite';

export interface BandSegment {
  sign: BandSign;
  points: BandPoint[];
}

/**
 * Splits a balance series into contiguous runs by which side of the account's
 * expected sign each point falls on — never zero-floored, since thickness
 * tracks `|balance|` unconditionally and only the "opposite" segments render
 * in the brown accent (see docs/ux-spec.md, "Sign handling: never flatten").
 * A zero balance counts as "expected" so a single boundary sample doesn't
 * spawn its own segment. At each crossing, a zero-balance point is
 * interpolated and shared by both adjoining segments so the rendered paths
 * meet exactly rather than leaving a gap.
 */
export function segmentBandBySign(points: BandPoint[], expectedSign: Sign): BandSegment[] {
  if (points.length === 0) return [];

  const signOf = (balance: number): BandSign => (balance * expectedSign >= 0 ? 'expected' : 'opposite');

  const segments: BandSegment[] = [{ sign: signOf(points[0].balance), points: [points[0]] }];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const currSign = signOf(curr.balance);
    const currentSegment = segments.at(-1)!;

    if (currSign === currentSegment.sign) {
      currentSegment.points.push(curr);
      continue;
    }

    const boundary = interpolateZeroCrossing(prev, curr);
    currentSegment.points.push(boundary);
    segments.push({ sign: currSign, points: [boundary, curr] });
  }

  return segments;
}

function interpolateZeroCrossing(a: BandPoint, b: BandPoint): BandPoint {
  const t = a.balance / (a.balance - b.balance);
  return { x: a.x + (b.x - a.x) * t, balance: 0 };
}
