import { FlowDirection } from '../models/flow';
import { Tributary } from './tributaries';

/** How far a tributary's free end leans from its river-joining x, in day-units. */
const LEAD_X = 8;
/** How far a tributary's free end leans from the centerline, as a fraction of centerY. */
const LEAD_Y_FRACTION = 0.4;
/** Fraction of the line's length, measured from the free end, that stays full width before tapering to a point at the river join. */
const TAPER_FRACTION = 2 / 3;

/**
 * A tributary's rendered geometry: a straight line from its free end to where it joins/leaves the
 * river at the ribbon's edge. `labelX`/`labelY` sit at the free end (away from the crowded
 * river) — where the name label renders, as a plain HTML overlay rather than SVG text, since the
 * chart's non-uniform x/y scaling (`preserveAspectRatio="none"`) would otherwise smear glyphs
 * horizontally.
 */
export interface TributaryLine {
  id: string;
  direction: FlowDirection;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
  d: string;
  strokeWidth: number;
}

/**
 * A filled taper shape rather than a stroked line: full `width` for the first `TAPER_FRACTION` of
 * the run from `freeX`,`freeY`, then narrowing linearly to a single point exactly at `joinX`,
 * `joinY` — so a thick tributary tucks cleanly into the ribbon's edge instead of butting against
 * it at full width.
 */
function taperedLinePath(freeX: number, freeY: number, joinX: number, joinY: number, width: number): string {
  const half = width / 2;
  const dx = joinX - freeX;
  const dy = joinY - freeY;
  const length = Math.hypot(dx, dy) || 1;
  const px = -dy / length;
  const py = dx / length;

  const taperX = freeX + dx * TAPER_FRACTION;
  const taperY = freeY + dy * TAPER_FRACTION;

  const points = [
    [freeX + px * half, freeY + py * half],
    [taperX + px * half, taperY + py * half],
    [joinX, joinY],
    [taperX - px * half, taperY - py * half],
    [freeX - px * half, freeY - py * half],
  ];

  return `M${points.map(([x, y]) => `${x},${y}`).join(' L')} Z`;
}

/**
 * Straight, uniform-angle tributary lines: incoming leans in from the upper-left and joins the
 * ribbon's top edge at the occurrence's x; outgoing leaves the ribbon's bottom edge and leans out
 * toward the lower-right — the ribbon's own edge at that x, not its flat centerline, since the
 * ribbon's thickness already varies with the balance there. The lean itself is a fixed offset
 * mirrored through the band, never varied per item, so a dense run of same-kind occurrences reads
 * as parallel lines rather than a tangle of individually-angled ones.
 */
export function buildTributaryLines(
  tributaries: Tributary[],
  centerY: number,
  halfThicknessAt: (x: number) => number,
  strokeWidth: (amount: number) => number,
): TributaryLine[] {
  const leadY = centerY * LEAD_Y_FRACTION;

  return tributaries.map((tributary) => {
    const half = halfThicknessAt(tributary.x);
    const joinY = tributary.direction === 'in' ? centerY - half : centerY + half;

    const [x1, y1, x2, y2] =
      tributary.direction === 'in'
        ? [tributary.x - LEAD_X, joinY - leadY, tributary.x, joinY]
        : [tributary.x, joinY, tributary.x + LEAD_X, joinY + leadY];

    const [freeX, freeY, joinX, joinY2] =
      tributary.direction === 'in' ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
    const width = strokeWidth(tributary.amount);

    return {
      id: tributary.id,
      direction: tributary.direction,
      label: tributary.label,
      x1,
      y1,
      x2,
      y2,
      labelX: tributary.direction === 'in' ? x1 : x2,
      labelY: tributary.direction === 'in' ? y1 : y2,
      d: taperedLinePath(freeX, freeY, joinX, joinY2, width),
      strokeWidth: width,
    };
  });
}
