import { BandPoint } from './band-segments';

/** Half-thickness (px) for a balance magnitude, linear against the window's max, capped. */
export function halfThicknessScale(
  maxAbsBalance: number,
  maxHalfThicknessPx: number,
): (balance: number) => number {
  if (maxAbsBalance <= 0) return () => 0;
  return (balance: number) =>
    Math.min(maxHalfThicknessPx, (Math.abs(balance) / maxAbsBalance) * maxHalfThicknessPx);
}

/**
 * SVG `<polygon>` points for a thickness-band ribbon: the top edge traced
 * left-to-right followed by the bottom edge traced right-to-left, so the
 * filled shape's width at each x is `2 * halfThickness(balance)` centered on
 * `centerY`.
 */
export function ribbonPoints(
  points: BandPoint[],
  centerY: number,
  halfThickness: (balance: number) => number,
): string {
  if (points.length === 0) return '';

  const top = points.map((p) => `${p.x},${centerY - halfThickness(p.balance)}`);
  const bottom = points
    .slice()
    .reverse()
    .map((p) => `${p.x},${centerY + halfThickness(p.balance)}`);

  return [...top, ...bottom].join(' ');
}
