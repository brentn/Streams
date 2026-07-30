// PROTOTYPE — throwaway, answers wayfinder ticket #59 (tributary density & zoom).
// Variant B: static lane fanning, no zoom/pan control at all. Every cluster of same-direction
// items within FAN_THRESHOLD_X of each other spreads its members' far ends across a small
// fixed arc — a same-week recurring cluster and an exact same-date collision are handled by
// the identical mechanism, just with more members in the arc. The premise: legibility should
// not depend on the user reaching for a control.
import { Component, computed, input } from '@angular/core';
import { maxMagnitude, PositionedTributary } from './density-data';
import { angledLine, clusterByProximity, labelFor, scaledMagnitude } from './density-curve';

interface Curve {
  id: string;
  pathId: string;
  d: string;
  strokeWidth: number;
  label: string;
  direction: 'in' | 'out';
  kind: 'flow' | 'transfer';
  clustered: boolean;
}

export const VIEW_W = 183;
export const VIEW_H = 190;
const BAND_TOP = 85;
const BAND_BOTTOM = 105;
const FAN_THRESHOLD_X = 5;
const MAX_ARC = 26;

@Component({
  selector: 'app-density-variant-b',
  templateUrl: './density-variant-b.html',
  styleUrl: './density-variant-b.css',
})
export class DensityVariantB {
  readonly items = input.required<PositionedTributary[]>();
  protected readonly viewW = VIEW_W;
  protected readonly viewH = VIEW_H;
  protected readonly bandTop = BAND_TOP;
  protected readonly bandBottom = BAND_BOTTOM;

  protected readonly curves = computed<Curve[]>(() => {
    const max = maxMagnitude(this.items()) || 1;
    const clusters = clusterByProximity(this.items(), FAN_THRESHOLD_X);
    const curves: Curve[] = [];
    for (const cluster of clusters) {
      const clustered = cluster.length > 1;
      // More members widen the arc, but it saturates — a cluster of 20 doesn't blow past the
      // scene width, it just packs tighter within MAX_ARC.
      const arc = clustered ? Math.min(MAX_ARC, 6 + cluster.length * 3) : 0;
      cluster.forEach((item, i) => {
        const offset = clustered ? -arc / 2 + (arc / (cluster.length - 1)) * i : 0;
        curves.push({
          id: item.id,
          pathId: `density-b-${item.id}`,
          d: angledLine(item.x, item.direction === 'in' ? BAND_TOP : BAND_BOTTOM, item.direction, offset),
          strokeWidth: scaledMagnitude(item, max, 5),
          label: labelFor(item),
          direction: item.direction,
          kind: item.kind,
          clustered,
        });
      });
    }
    return curves;
  });
}
