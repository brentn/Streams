// PROTOTYPE — throwaway, answers wayfinder ticket #60. Line geometry ported unchanged from
// the winning tributary-visual-model prototype (ticket #52, variant F).
import { PositionedTributary } from './tributary-data';

/**
 * A straight line on a fixed diagonal — incoming from the upper-left, outgoing to the
 * lower-right (mirrored through the join point) — same angle for every item, per #52.
 * `joinX` is the actual attach point on the band; `originX` lets a variant fan the line's
 * *far* end away from where it would otherwise land, without moving where it joins the band.
 */
export function angledLine(
  joinX: number,
  edgeY: number,
  direction: 'in' | 'out',
  originXOffset = 0,
): string {
  const angleDx = 22;
  const reach = 42;
  const sign = direction === 'in' ? -1 : 1;
  const farX = joinX + sign * angleDx + originXOffset;
  const farY = edgeY + sign * reach;
  const [x0, y0, x1, y1] = direction === 'in' ? [farX, farY, joinX, edgeY] : [joinX, edgeY, farX, farY];
  return `M ${x0} ${y0} L ${x1} ${y1}`;
}

export function scaledMagnitude(item: PositionedTributary, max: number, cap: number): number {
  return Math.max(1.5, (Math.abs(item.magnitude) / max) * cap);
}

/**
 * Linear scaling against a $2,200 anchor floors every sub-$10 item at the same 1.5px minimum
 * — a $2 and an $8 subscription render identically, with no relative distinction at all.
 * `log1p` compresses that dynamic range (log1p(2200) ≈ 7.7 vs log1p(8) ≈ 2.2 — an 11x spread
 * instead of linear's 1100x) so small amounts land in their own legible, differentiated band
 * instead of all collapsing onto the floor. `floor` still guarantees a minimum tappable width.
 */
export function logScaledMagnitude(
  item: PositionedTributary,
  max: number,
  cap: number,
  floor = 1.2,
): number {
  const ratio = Math.log1p(Math.abs(item.magnitude)) / Math.log1p(max);
  return floor + ratio * (cap - floor);
}

export function labelFor(item: PositionedTributary): string {
  return item.kind === 'transfer' ? `${item.direction === 'out' ? '→' : '←'} ${item.name}` : item.name;
}

/** Below this fraction of the window's max magnitude, an item counts as "minor" for #60's variants. */
export const MINOR_THRESHOLD_FRACTION = 0.05;

export function isMinor(item: PositionedTributary, max: number): boolean {
  return max > 0 && Math.abs(item.magnitude) / max < MINOR_THRESHOLD_FRACTION;
}
