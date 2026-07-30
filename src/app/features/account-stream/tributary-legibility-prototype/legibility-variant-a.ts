// PROTOTYPE — throwaway, answers wayfinder ticket #60 (tributary legibility for tiny
// amounts / many flows).
// Variant A: leave the visual line alone (still true to #52's thickness-proportional-to-
// amount model, floored at 1.5px) and fix only the interaction affordance. Every line gets
// a wide invisible stroke laid on top purely for hit-testing, so a hairline is still easy to
// tap. Minor items (below MINOR_THRESHOLD_FRACTION of the window's max) keep their label
// hidden by default — with a dozen sub-$10 subscriptions, always-on labels would just be
// more clutter — and reveal it on tap/hover of that wide hit-area instead.
import { Component, computed, input, signal } from '@angular/core';
import { maxMagnitude, PositionedTributary } from './tributary-data';
import { angledLine, isMinor, labelFor, scaledMagnitude } from './tributary-curve';

interface Curve {
  id: string;
  pathId: string;
  d: string;
  strokeWidth: number;
  label: string;
  direction: 'in' | 'out';
  kind: 'flow' | 'transfer';
  minor: boolean;
}

export const VIEW_W = 183;
export const VIEW_H = 190;
const BAND_TOP = 85;
const BAND_BOTTOM = 105;
/** Hit-area width in view-units — generous relative to a floored 1.5px visual line. */
const HIT_WIDTH = 10;

@Component({
  selector: 'app-legibility-variant-a',
  templateUrl: './legibility-variant-a.html',
  styleUrl: './legibility-variant-a.css',
})
export class LegibilityVariantA {
  readonly items = input.required<PositionedTributary[]>();
  protected readonly viewW = VIEW_W;
  protected readonly viewH = VIEW_H;
  protected readonly bandTop = BAND_TOP;
  protected readonly bandBottom = BAND_BOTTOM;
  protected readonly hitWidth = HIT_WIDTH;

  protected readonly revealed = signal<ReadonlySet<string>>(new Set());

  protected readonly curves = computed<Curve[]>(() => {
    const max = maxMagnitude(this.items()) || 1;
    return this.items().map((item) => ({
      id: item.id,
      pathId: `legibility-a-${item.id}`,
      d: angledLine(item.x, item.direction === 'in' ? BAND_TOP : BAND_BOTTOM, item.direction),
      strokeWidth: scaledMagnitude(item, max, 5),
      label: labelFor(item),
      direction: item.direction,
      kind: item.kind,
      minor: isMinor(item, max),
    }));
  });

  protected showLabel(curve: Curve): boolean {
    return !curve.minor || this.revealed().has(curve.id);
  }

  protected toggle(id: string): void {
    this.revealed.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected reveal(id: string): void {
    this.revealed.update((set) => new Set(set).add(id));
  }

  protected unreveal(id: string): void {
    this.revealed.update((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }
}
