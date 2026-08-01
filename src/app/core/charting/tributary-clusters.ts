import { Tributary } from './tributaries';

/** Same-direction Tributaries whose x falls within this many day-units of a neighbor collapse into one cluster by default — see issue #66. */
export const CLUSTER_THRESHOLD_DAYS = 4;

/**
 * Groups same-direction Tributaries whose x falls within `thresholdDays` of a neighbor —
 * an 'in' and an 'out' on the same date already separate visually (opposite band edges), so
 * clustering never crosses direction. Sequential/greedy: sort by x, start a new cluster
 * whenever the gap to the previous item exceeds the threshold. A cluster of one is just an
 * uncrowded item — callers should treat singletons as the no-op (never-grouped) case.
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
