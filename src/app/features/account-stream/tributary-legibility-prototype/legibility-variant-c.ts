// PROTOTYPE — throwaway, answers wayfinder ticket #60 (tributary legibility for tiny
// amounts / many flows).
// Variant C: semantic aggregation, reusing the language #54 already established for the
// aggregate "uncategorized" tributary. All minor items (below MINOR_THRESHOLD_FRACTION of
// the window's max) — regardless of date, only split by direction — roll up into one
// aggregate tributary per direction, sized from their combined magnitude and tagged with a
// ×N badge. Tapping the bundle expands a simple name+amount list (not fanned lines — with a
// dozen members that would just recreate the crowding). The badge is a plain HTML overlay,
// not an SVG element in the same non-uniformly-scaled coordinate space as the curves — #59's
// review flagged that a circle drawn inside a `preserveAspectRatio="none"` SVG renders as an
// ellipse, so it's kept out of that space entirely rather than repeating the bug.
import { Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
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
}

interface Bundle {
  direction: 'in' | 'out';
  d: string;
  strokeWidth: number;
  count: number;
  badgeLeftPct: number;
  badgeTopPct: number;
  members: PositionedTributary[];
}

export const VIEW_W = 183;
export const VIEW_H = 190;
const BAND_TOP = 85;
const BAND_BOTTOM = 105;
const ANGLE_DX = 22;
const REACH = 42;

@Component({
  selector: 'app-legibility-variant-c',
  imports: [CurrencyPipe],
  templateUrl: './legibility-variant-c.html',
  styleUrl: './legibility-variant-c.css',
})
export class LegibilityVariantC {
  readonly items = input.required<PositionedTributary[]>();
  protected readonly viewW = VIEW_W;
  protected readonly viewH = VIEW_H;
  protected readonly bandTop = BAND_TOP;
  protected readonly bandBottom = BAND_BOTTOM;

  protected readonly expandedDirection = signal<'in' | 'out' | null>(null);

  protected readonly curves = computed<Curve[]>(() => {
    const max = maxMagnitude(this.items()) || 1;
    return this.items()
      .filter((item) => !isMinor(item, max))
      .map((item) => ({
        id: item.id,
        pathId: `legibility-c-${item.id}`,
        d: angledLine(item.x, item.direction === 'in' ? BAND_TOP : BAND_BOTTOM, item.direction),
        strokeWidth: scaledMagnitude(item, max, 5),
        label: labelFor(item),
        direction: item.direction,
        kind: item.kind,
      }));
  });

  protected readonly bundles = computed<Bundle[]>(() => {
    const max = maxMagnitude(this.items()) || 1;
    const minors = this.items().filter((item) => isMinor(item, max));
    const byDirection = new Map<'in' | 'out', PositionedTributary[]>();
    for (const item of minors) {
      const list = byDirection.get(item.direction) ?? [];
      list.push(item);
      byDirection.set(item.direction, list);
    }

    return [...byDirection.entries()]
      .filter(([, members]) => members.length > 0)
      .map(([direction, members]) => {
        const centerX = members.reduce((sum, m) => sum + m.x, 0) / members.length;
        const total = members.reduce((sum, m) => sum + Math.abs(m.magnitude), 0);
        const edgeY = direction === 'in' ? BAND_TOP : BAND_BOTTOM;
        const sign = direction === 'in' ? -1 : 1;
        const farX = centerX + sign * ANGLE_DX;
        const farY = edgeY + sign * REACH;
        return {
          direction,
          d: angledLine(centerX, edgeY, direction),
          strokeWidth: Math.min(5, (total / max) * 5) + 1,
          count: members.length,
          badgeLeftPct: (farX / VIEW_W) * 100,
          badgeTopPct: (farY / VIEW_H) * 100,
          members,
        };
      });
  });

  protected toggle(direction: 'in' | 'out'): void {
    this.expandedDirection.update((current) => (current === direction ? null : direction));
  }

  protected isExpanded(direction: 'in' | 'out'): boolean {
    return this.expandedDirection() === direction;
  }
}
