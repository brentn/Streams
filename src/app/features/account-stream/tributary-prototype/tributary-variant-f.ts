// PROTOTYPE — throwaway, answers wayfinder ticket #52 (tributary visual model).
// Variant F: straight diagonal lines, uniform angle for every item — incoming from the
// upper-left, outgoing to the lower-right, mirrored through the band.
import { Component, computed, input } from '@angular/core';
import { maxMagnitude, PositionedTributary } from './tributary-data';
import { angledLine, labelFor, scaledMagnitude } from './tributary-curve';

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
  selector: 'app-tributary-variant-f',
  templateUrl: './tributary-variant-f.html',
  styleUrl: './tributary-variant-f.css',
})
export class TributaryVariantF {
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
      pathId: `trib-f-${item.id}`,
      d: angledLine(item.x, item.direction === 'in' ? BAND_TOP : BAND_BOTTOM, item.direction),
      strokeWidth: scaledMagnitude(item, max, 5),
      label: labelFor(item),
      direction: item.direction,
      kind: item.kind,
    }));
  });
}
