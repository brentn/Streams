import { BandPoint } from './band-segments';

/** Linear scale of a magnitude against a window's max, capped at maxPx — shared by the balance ribbon's half-thickness and a tributary line's stroke width. */
export function magnitudeScale(maxMagnitude: number, maxPx: number): (magnitude: number) => number {
  if (maxMagnitude <= 0) return () => 0;
  return (magnitude: number) => Math.min(maxPx, (Math.abs(magnitude) / maxMagnitude) * maxPx);
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
