// PROTOTYPE — throwaway, answers wayfinder ticket #52 (tributary visual model).
// Variant E: each curve drops straight from a parallel rail above/below the band to its
// real join date — orderly, lane-like, easier to scan than a converging fan (Variant D).
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
export const VIEW_H = 220;
const BAND_TOP = 95;
const BAND_BOTTOM = 115;
const RAIL_IN_Y = 20;
const RAIL_OUT_Y = VIEW_H - 20;

@Component({
  selector: 'app-tributary-variant-e',
  templateUrl: './tributary-variant-e.html',
  styleUrl: './tributary-variant-e.css',
})
export class TributaryVariantE {
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
      pathId: `trib-e-${item.id}`,
      d:
        item.direction === 'in'
          ? sCurve(item.x, RAIL_IN_Y, item.x, BAND_TOP)
          : sCurve(item.x, BAND_BOTTOM, item.x, RAIL_OUT_Y),
      strokeWidth: scaledMagnitude(item, max, 6),
      label: labelFor(item),
      direction: item.direction,
      kind: item.kind,
    }));
  });
}
