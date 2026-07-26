import { Sign } from '../models/account';
import { BandPoint, BandSegment, segmentBandBySign } from './band-segments';
import { splitAtX } from './split-at-x';

export type BandPhase = 'actual' | 'projected';

export interface RenderSegment extends BandSegment {
  phase: BandPhase;
}

/**
 * Composes the two independent splits a rendered band needs: actual vs.
 * projected (solid vs. dashed/reduced-opacity, split at `boundaryX`) and
 * expected vs. opposite sign (accent vs. brown, never-flatten). Each phase is
 * segmented by sign independently so a sign crossing that straddles the
 * actual/projected boundary still renders correctly on both sides.
 */
export function buildRenderSegments(
  points: BandPoint[],
  expectedSign: Sign,
  boundaryX: number,
): RenderSegment[] {
  const { before, after } = splitAtX(points, boundaryX);

  const actual = segmentBandBySign(before, expectedSign).map((s) => ({
    ...s,
    phase: 'actual' as const,
  }));
  const projected = segmentBandBySign(after, expectedSign).map((s) => ({
    ...s,
    phase: 'projected' as const,
  }));

  return [...actual, ...projected];
}
