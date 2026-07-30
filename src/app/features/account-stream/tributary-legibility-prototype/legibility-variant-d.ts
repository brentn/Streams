// PROTOTYPE — throwaway, answers wayfinder ticket #60 (tributary legibility for tiny
// amounts / many flows).
// Variant D: fix the base rendering model instead of adding an interaction. Variants A-C all
// keep #52's linear thickness-proportional-to-amount scaling and add something on top (a wide
// hit-area, a zoom, an aggregate bundle) to compensate for it flooring every sub-$10 item at
// the same 1.5px minimum. This variant changes the scaling itself — `logScaledMagnitude`
// compresses the amount range so small items spread into their own legible, differentiated
// band — and otherwise renders exactly like the plain pre-#59/#60 model: no hit-area gimmick,
// no zoom, no aggregation, every item always shows its own line and label.
import { Component, computed, input } from '@angular/core';
import { maxMagnitude, PositionedTributary } from './tributary-data';
import { angledLine, labelFor, logScaledMagnitude } from './tributary-curve';

interface Curve {
  id: string;
  pathId: string;
  d: string;
  strokeWidth: number;
  label: string;
  direction: 'in' | 'out';
  kind: 'flow' | 'transfer';
}

export const VIEW_W = 183;
export const VIEW_H = 190;
const BAND_TOP = 85;
const BAND_BOTTOM = 105;

@Component({
  selector: 'app-legibility-variant-d',
  templateUrl: './legibility-variant-d.html',
  styleUrl: './legibility-variant-d.css',
})
export class LegibilityVariantD {
  readonly items = input.required<PositionedTributary[]>();
  protected readonly viewW = VIEW_W;
  protected readonly viewH = VIEW_H;
  protected readonly bandTop = BAND_TOP;
  protected readonly bandBottom = BAND_BOTTOM;

  protected readonly curves = computed<Curve[]>(() => {
    const max = maxMagnitude(this.items()) || 1;
    return this.items().map((item) => ({
      id: item.id,
      pathId: `legibility-d-${item.id}`,
      d: angledLine(item.x, item.direction === 'in' ? BAND_TOP : BAND_BOTTOM, item.direction),
      strokeWidth: logScaledMagnitude(item, max, 5),
      label: labelFor(item),
      direction: item.direction,
      kind: item.kind,
    }));
  });
}
