// PROTOTYPE — throwaway, answers wayfinder ticket #52 (tributary visual model).
// Variant D: curves fan in/out from a single shared corner, like tributaries feeding a river
// from one general direction on a map. Positioned at the real occurrence date.
import { Component, computed, input } from '@angular/core';
import { maxMagnitude, PositionedTributary } from './tributary-data';
import { labelFor, sCurve, scaledMagnitude } from './tributary-curve';

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
export const VIEW_H = 240;
const BAND_TOP = 100;
const BAND_BOTTOM = 120;
const ANCHOR_IN = { x: 10, y: 12 };
const ANCHOR_OUT = { x: VIEW_W - 10, y: VIEW_H - 12 };

@Component({
  selector: 'app-tributary-variant-d',
  templateUrl: './tributary-variant-d.html',
  styleUrl: './tributary-variant-d.css',
})
export class TributaryVariantD {
  readonly items = input.required<PositionedTributary[]>();
  protected readonly viewW = VIEW_W;
  protected readonly viewH = VIEW_H;
  protected readonly bandTop = BAND_TOP;
  protected readonly bandBottom = BAND_BOTTOM;

  protected readonly curves = computed<Curve[]>(() => {
    const list = this.items();
    const max = maxMagnitude(list) || 1;
    return list.map((item) => ({
      id: item.id,
      pathId: `trib-d-${item.id}`,
      d:
        item.direction === 'in'
          ? sCurve(ANCHOR_IN.x, ANCHOR_IN.y, item.x, BAND_TOP)
          : sCurve(item.x, BAND_BOTTOM, ANCHOR_OUT.x, ANCHOR_OUT.y),
      strokeWidth: scaledMagnitude(item, max, 7),
      label: labelFor(item),
      direction: item.direction,
      kind: item.kind,
    }));
  });
}
