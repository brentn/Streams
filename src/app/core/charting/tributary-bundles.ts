import { FlowDirection } from '../models/flow';
import { buildTributaryArrows } from './tributary-arrows';
import { Tributary } from './tributaries';
import { bundleId } from './tributary-clusters';

/**
 * A collapsed cluster's rendered geometry: one shaft+tick arrow standing in for every member,
 * anchored at the cluster's centroid x and sized from the members' combined magnitude — the same
 * overlay-based mark an individual tributary renders as (see `buildTributaryArrows` and #81),
 * just with a ×N count badge nested at its free end instead of a name label (see
 * `stream-band.ts`/`stream-band.css`'s `.tributary-arrow`/`.tributary-badge`).
 */
export interface TributaryBundle {
  id: string;
  direction: FlowDirection;
  count: number;
  anchorX: number;
  anchorY: number;
  strokeWidth: number;
  tickLength: number;
}

/** A stand-in Tributary at the cluster's centroid x, amount summed across every member — reuses `buildTributaryArrows`' anchor geometry rather than duplicating the lean/join math. */
function centroidTributary(cluster: Tributary[], id: string): Tributary {
  const centerX = cluster.reduce((sum, t) => sum + t.x, 0) / cluster.length;
  const total = cluster.reduce((sum, t) => sum + t.amount, 0);
  return {
    id,
    kind: cluster[0].kind,
    direction: cluster[0].direction,
    date: cluster[0].date,
    x: centerX,
    amount: total,
    label: '',
  };
}

/** Builds one bundle per cluster, in the same order as `clusters`. */
export function buildTributaryBundles(
  clusters: Tributary[][],
  centerY: number,
  halfThicknessAt: (x: number) => number,
  strokeWidth: (amount: number) => number,
): TributaryBundle[] {
  return clusters.map((cluster) => {
    const id = bundleId(cluster);
    const [arrow] = buildTributaryArrows([centroidTributary(cluster, id)], centerY, halfThicknessAt, strokeWidth);
    return {
      id,
      direction: arrow.direction,
      count: cluster.length,
      anchorX: arrow.anchorX,
      anchorY: arrow.anchorY,
      strokeWidth: arrow.strokeWidth,
      tickLength: arrow.tickLength,
    };
  });
}
