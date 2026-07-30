// PROTOTYPE — throwaway, answers wayfinder ticket #59. Line geometry ported unchanged from
// the winning tributary-visual-model prototype (ticket #52, variant F); clusterByProximity
// is new — the grouping primitive every density variant builds its decluttering on.
import { PositionedTributary } from './density-data';

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

export function labelFor(item: PositionedTributary): string {
  return item.kind === 'transfer' ? `${item.direction === 'out' ? '→' : '←'} ${item.name}` : item.name;
}

/**
 * Groups items whose join point falls within `thresholdX` view-units of the next item, same
 * direction only (an 'in' and an 'out' on the same date already separate visually — they
 * mount on opposite band edges). Sequential/greedy: sort by x, start a new cluster whenever
 * the gap to the previous item exceeds the threshold. A cluster of one is just an
 * uncrowded item — variants should treat singletons as the no-op case.
 */
export function clusterByProximity(
  items: PositionedTributary[],
  thresholdX: number,
): PositionedTributary[][] {
  const byDirection = new Map<'in' | 'out', PositionedTributary[]>();
  for (const item of items) {
    const list = byDirection.get(item.direction) ?? [];
    list.push(item);
    byDirection.set(item.direction, list);
  }

  const clusters: PositionedTributary[][] = [];
  for (const list of byDirection.values()) {
    const sorted = [...list].sort((a, b) => a.x - b.x);
    let current: PositionedTributary[] = [];
    for (const item of sorted) {
      if (current.length === 0 || item.x - current[current.length - 1].x <= thresholdX) {
        current.push(item);
      } else {
        clusters.push(current);
        current = [item];
      }
    }
    if (current.length > 0) clusters.push(current);
  }
  return clusters;
}
