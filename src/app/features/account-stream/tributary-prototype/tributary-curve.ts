// PROTOTYPE — throwaway, answers wayfinder ticket #52 (tributary visual model).
// Shared bezier-path math for the meandering-curve variants (D/E/F) — layout stays per-variant.
import { PositionedTributary } from './tributary-data';

/** A smooth vertical S-curve between two points, sharing each endpoint's own x. */
export function sCurve(x0: number, y0: number, x1: number, y1: number): string {
  const midY = (y0 + y1) / 2;
  return `M ${x0} ${y0} C ${x0} ${midY} ${x1} ${midY} ${x1} ${y1}`;
}

/**
 * A straight line on a fixed diagonal — incoming from the upper-left, outgoing to the
 * lower-right (mirrored through the join point) — same angle for every item, uniform on
 * purpose.
 */
export function angledLine(joinX: number, edgeY: number, direction: 'in' | 'out'): string {
  const angleDx = 22;
  const reach = 42;
  const sign = direction === 'in' ? -1 : 1;
  const farX = joinX + sign * angleDx;
  const farY = edgeY + sign * reach;
  const [x0, y0, x1, y1] = direction === 'in' ? [farX, farY, joinX, edgeY] : [joinX, edgeY, farX, farY];
  return `M ${x0} ${y0} L ${x1} ${y1}`;
}

export function scaledMagnitude(item: PositionedTributary, max: number, cap: number): number {
  return Math.max(1.5, (Math.abs(item.magnitude) / max) * cap);
}

export function labelFor(item: PositionedTributary): string {
  return item.kind === 'transfer' ? `${item.direction === 'out' ? '→' : '←'} ${item.name}` : item.name;
}
