import { FlowDirection } from '../models/flow';
import { Tributary } from './tributaries';

/** How far a tributary's free end leans from its river-joining x, in day-units. */
const LEAD_X = 8;
/** How far a tributary's free end leans from the centerline, as a fraction of centerY. */
const LEAD_Y_FRACTION = 0.4;

/** A tributary's rendered geometry: a straight line from its free end to where it joins/leaves the river at `centerY`. */
export interface TributaryLine {
  id: string;
  direction: FlowDirection;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  d: string;
  strokeWidth: number;
}

/**
 * Straight, uniform-angle tributary lines: incoming leans in from the upper-left toward the
 * river at `(x, centerY)`; outgoing leans out from the river toward the lower-right — the same
 * fixed offset mirrored through the band, never varied per item, so a dense run of same-kind
 * occurrences reads as parallel lines rather than a tangle of individually-angled ones.
 */
export function buildTributaryLines(
  tributaries: Tributary[],
  centerY: number,
  strokeWidth: (amount: number) => number,
): TributaryLine[] {
  const leadY = centerY * LEAD_Y_FRACTION;

  return tributaries.map((tributary) => {
    const [x1, y1, x2, y2] =
      tributary.direction === 'in'
        ? [tributary.x - LEAD_X, centerY - leadY, tributary.x, centerY]
        : [tributary.x, centerY, tributary.x + LEAD_X, centerY + leadY];

    return {
      id: tributary.id,
      direction: tributary.direction,
      label: tributary.label,
      x1,
      y1,
      x2,
      y2,
      d: `M${x1},${y1} L${x2},${y2}`,
      strokeWidth: strokeWidth(tributary.amount),
    };
  });
}
