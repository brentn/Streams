import { FlowDirection } from '../models/flow';
import { buildTributaryLines } from './tributary-lines';
import { Tributary } from './tributaries';
import { bundleId } from './tributary-clusters';

/**
 * A collapsed cluster's rendered geometry: one line standing in for every member, joining the
 * river at the cluster's centroid x and sized from the members' combined magnitude. `badgeX`/
 * `badgeY` sit at the line's free end, where the ×N count badge overlay anchors (see
 * `stream-band.ts` — the badge renders as plain HTML, not SVG, same reasoning as an individual
 * tributary's name label — it's the only thing distinguishing a group's stand-in line from a
 * real tributary's own line, both otherwise sharing the same filled-taper geometry).
 */
export interface TributaryBundle {
  id: string;
  direction: FlowDirection;
  count: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  d: string;
  strokeWidth: number;
  badgeX: number;
  badgeY: number;
}

/** A stand-in Tributary at the cluster's centroid x, amount summed across every member — reuses `buildTributaryLines`' line geometry rather than duplicating the lean/join math. */
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
    const [line] = buildTributaryLines([centroidTributary(cluster, id)], centerY, halfThicknessAt, strokeWidth);
    return {
      id,
      direction: line.direction,
      count: cluster.length,
      x1: line.x1,
      y1: line.y1,
      x2: line.x2,
      y2: line.y2,
      d: line.d,
      strokeWidth: line.strokeWidth,
      badgeX: line.labelX,
      badgeY: line.labelY,
    };
  });
}
