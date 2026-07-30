import { normalizeDay } from './date-window';
import { Tributary } from './tributaries';

/** Same-direction Tributaries whose x falls within this many day-units of a neighbor collapse into one cluster by default — see issue #66. */
export const CLUSTER_THRESHOLD_DAYS = 4;

/** How far (in day-units) a cluster's auto-zoom window extends past the cluster's own x-range, to keep some surrounding river visible for context. */
export const ZOOM_CONTEXT_DAYS = 6;

/** How wide (in day-units) an exact-date collision's synthetic intraday spread fans out, centered on the real date — see `spreadExactDateCollisions`. */
const INTRADAY_SPREAD_DAYS = 0.8;

/**
 * Groups same-direction Tributaries whose x falls within `thresholdDays` of a neighbor —
 * an 'in' and an 'out' on the same date already separate visually (opposite band edges), so
 * clustering never crosses direction. Sequential/greedy: sort by x, start a new cluster
 * whenever the gap to the previous item exceeds the threshold. A cluster of one is just an
 * uncrowded item — callers should treat singletons as the no-op (never-bundled) case.
 */
export function clusterTributaries(
  tributaries: Tributary[],
  thresholdDays: number = CLUSTER_THRESHOLD_DAYS,
): Tributary[][] {
  const byDirection = new Map<Tributary['direction'], Tributary[]>();
  for (const t of tributaries) {
    const list = byDirection.get(t.direction) ?? [];
    list.push(t);
    byDirection.set(t.direction, list);
  }

  const clusters: Tributary[][] = [];
  for (const list of byDirection.values()) {
    const sorted = [...list].sort((a, b) => a.x - b.x);
    let current: Tributary[] = [];
    for (const item of sorted) {
      const prev = current[current.length - 1];
      if (current.length === 0 || item.x - prev.x <= thresholdDays) {
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

/** A stable identity for a cluster, independent of member order — lets a click handler track which cluster is currently expanded across recomputations. */
export function bundleId(cluster: Tributary[]): string {
  return `bundle-${cluster
    .map((t) => t.id)
    .slice()
    .sort()
    .join('|')}`;
}

/**
 * The zoomed-in x-range for a tapped cluster: its own x-range widened by `ZOOM_CONTEXT_DAYS`
 * on each side (some surrounding stream stays visible for context), clamped to the visible
 * window `[0, maxX]`. Guarantees a non-zero-width range even for a degenerate (single-point,
 * zero-margin) cluster.
 */
export function zoomRangeFor(
  cluster: Tributary[],
  maxX: number,
  contextDays: number = ZOOM_CONTEXT_DAYS,
): { lo: number; hi: number } {
  const xs = cluster.map((t) => t.x);
  const lo = Math.max(0, Math.min(...xs) - contextDays);
  const hi = Math.min(maxX, Math.max(...xs) + contextDays);
  return { lo, hi: Math.max(hi, lo + 1) };
}

/**
 * Members sharing an exact occurrence date get synthetic intraday positions — fractional x
 * offsets spread within that date, as if spaced across hours — so they separate along the
 * same continuous date axis every other tributary sits on, rather than a sideways fan (see
 * #59's amendment 2). A date with only one member is left at its real x.
 */
export function spreadExactDateCollisions(cluster: Tributary[]): Tributary[] {
  const byDate = new Map<number, Tributary[]>();
  for (const t of cluster) {
    const key = normalizeDay(t.date).getTime();
    const list = byDate.get(key) ?? [];
    list.push(t);
    byDate.set(key, list);
  }

  const result: Tributary[] = [];
  for (const group of byDate.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    group.forEach((t, i) => {
      const offset = -INTRADAY_SPREAD_DAYS / 2 + (INTRADAY_SPREAD_DAYS / (group.length - 1)) * i;
      result.push({ ...t, x: t.x + offset });
    });
  }
  return result;
}
