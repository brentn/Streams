import { FlowDirection } from '../models/flow';
import { BandPoint } from './band-segments';

/** Which edge of the ribbon a tributary joins: the top edge for 'in', the bottom edge for 'out' — the ribbon's own edge at that x, not its flat centerline. Shared by `tributary-arrows.ts` and `tributary-bundles.ts` so individual and grouped/rolled-up marks can't drift on this rule. */
export function ribbonEdgeY(direction: FlowDirection, centerY: number, half: number): number {
  return direction === 'in' ? centerY - half : centerY + half;
}

/** Linear scale of a magnitude against a stable domain, clamped to `[minPx, maxPx]` — used for a tributary line's stroke width (see issue #74: the domain must stay fixed across scrub frames, never derived from whatever's currently visible). */
export function magnitudeScale(
  maxMagnitude: number,
  maxPx: number,
  minPx = 0,
): (magnitude: number) => number {
  if (maxMagnitude <= 0) return () => 0;
  return (magnitude: number) => Math.max(minPx, Math.min(maxPx, (Math.abs(magnitude) / maxMagnitude) * maxPx));
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
