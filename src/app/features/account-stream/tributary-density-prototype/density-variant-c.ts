// PROTOTYPE — throwaway, answers wayfinder ticket #59 (tributary density & zoom).
// Variant C: semantic aggregation. A cluster of same-direction items within
// CLUSTER_THRESHOLD_X collapses by default into one dashed "bundle" line sized from the
// cluster's combined magnitude, tagged with a ×N badge — individual names and dates are
// hidden until the user taps the bundle, which expands it into the same fanned members
// variant B would show, plus a small collapse control to fold it back.
import { Component, computed, input, signal } from '@angular/core';
import { maxMagnitude, PositionedTributary } from './density-data';
import { angledLine, clusterByProximity, labelFor, scaledMagnitude } from './density-curve';

interface MemberCurve {
  id: string;
  pathId: string;
  d: string;
  strokeWidth: number;
  label: string;
  direction: 'in' | 'out';
  kind: 'flow' | 'transfer';
}

interface Bundle {
  id: string;
  pathId: string;
  d: string;
  strokeWidth: number;
  count: number;
  direction: 'in' | 'out';
  centerX: number;
  edgeY: number;
}

interface CollapseMarker {
  id: string;
  x: number;
  y: number;
}

export const VIEW_W = 183;
export const VIEW_H = 190;
const BAND_TOP = 85;
const BAND_BOTTOM = 105;
const CLUSTER_THRESHOLD_X = 4;
const MAX_ARC = 26;

function clusterKey(cluster: PositionedTributary[]): string {
  return cluster
    .map((item) => item.id)
    .sort()
    .join('|');
}

@Component({
  selector: 'app-density-variant-c',
  templateUrl: './density-variant-c.html',
  styleUrl: './density-variant-c.css',
})
export class DensityVariantC {
  readonly items = input.required<PositionedTributary[]>();
  protected readonly viewW = VIEW_W;
  protected readonly viewH = VIEW_H;
  protected readonly bandTop = BAND_TOP;
  protected readonly bandBottom = BAND_BOTTOM;

  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  private readonly clusters = computed(() => clusterByProximity(this.items(), CLUSTER_THRESHOLD_X));

  protected readonly bundles = computed<Bundle[]>(() => {
    const max = maxMagnitude(this.items()) || 1;
    return this.clusters()
      .filter((cluster) => cluster.length > 1 && !this.expanded().has(clusterKey(cluster)))
      .map((cluster) => {
        const key = clusterKey(cluster);
        const centerX = cluster.reduce((sum, item) => sum + item.x, 0) / cluster.length;
        const total = cluster.reduce((sum, item) => sum + Math.abs(item.magnitude), 0);
        const direction = cluster[0].direction;
        const edgeY = direction === 'in' ? BAND_TOP : BAND_BOTTOM;
        return {
          id: key,
          pathId: `density-c-bundle-${key}`,
          d: angledLine(centerX, edgeY, direction),
          strokeWidth: scaledMagnitude({ magnitude: total } as PositionedTributary, max, 5) + 1,
          count: cluster.length,
          direction,
          centerX,
          edgeY,
        };
      });
  });

  protected readonly members = computed<MemberCurve[]>(() => {
    const max = maxMagnitude(this.items()) || 1;
    const curves: MemberCurve[] = [];
    for (const cluster of this.clusters()) {
      const bundled = cluster.length > 1 && !this.expanded().has(clusterKey(cluster));
      if (bundled) continue;
      const arc = cluster.length > 1 ? Math.min(MAX_ARC, 6 + cluster.length * 3) : 0;
      cluster.forEach((item, i) => {
        const offset =
          cluster.length > 1 ? -arc / 2 + (arc / (cluster.length - 1)) * i : 0;
        curves.push({
          id: item.id,
          pathId: `density-c-${item.id}`,
          d: angledLine(item.x, item.direction === 'in' ? BAND_TOP : BAND_BOTTOM, item.direction, offset),
          strokeWidth: scaledMagnitude(item, max, 5),
          label: labelFor(item),
          direction: item.direction,
          kind: item.kind,
        });
      });
    }
    return curves;
  });

  protected readonly expandedMarkers = computed<CollapseMarker[]>(() =>
    this.clusters()
      .filter((cluster) => cluster.length > 1 && this.expanded().has(clusterKey(cluster)))
      .map((cluster) => {
        const key = clusterKey(cluster);
        const centerX = cluster.reduce((sum, item) => sum + item.x, 0) / cluster.length;
        const direction = cluster[0].direction;
        const sign = direction === 'in' ? -1 : 1;
        return { id: key, x: centerX, y: (direction === 'in' ? BAND_TOP : BAND_BOTTOM) + sign * 50 };
      }),
  );

  protected toggle(clusterId: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  }
}
