// PROTOTYPE — throwaway, answers wayfinder ticket #59 (tributary density & zoom).
// Variant A: camera-level zoom/pan. Scroll or the +/- control narrows the visible day-range,
// spreading out same-week clusters; drag pans a zoomed-in view. Exact same-date collisions
// aren't fixed by zoom alone (two items 0 days apart stay 0 days apart at any zoom level), so
// this variant also applies a small fixed fan for clusters still within FAN_THRESHOLD_X after
// zooming — a minimal add-on, not the main idea being tested.
import { Component, computed, ElementRef, HostListener, input, signal, viewChild } from '@angular/core';
import { HALF_WINDOW_DAYS } from '../../../core/charting/date-window';
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
}

export const VIEW_W = 183;
export const VIEW_H = 190;
const BAND_TOP = 85;
const BAND_BOTTOM = 105;
const MAX_ZOOM = 8;
const FAN_THRESHOLD_X = 3;

@Component({
  selector: 'app-density-variant-a',
  templateUrl: './density-variant-a.html',
  styleUrl: './density-variant-a.css',
})
export class DensityVariantA {
  readonly items = input.required<PositionedTributary[]>();
  protected readonly viewW = VIEW_W;
  protected readonly viewH = VIEW_H;
  protected readonly bandTop = BAND_TOP;
  protected readonly bandBottom = BAND_BOTTOM;

  protected readonly zoom = signal(1);
  protected readonly panDays = signal(0);
  private readonly scene = viewChild<ElementRef<SVGSVGElement>>('scene');
  private dragStartX: number | null = null;
  private dragStartPan = 0;

  private readonly visibleHalfWidth = computed(() => HALF_WINDOW_DAYS / this.zoom());
  private readonly center = computed(() => HALF_WINDOW_DAYS + this.panDays());

  protected readonly curves = computed<Curve[]>(() => {
    const half = this.visibleHalfWidth();
    const lo = this.center() - half;
    const scale = this.viewW / (half * 2);
    const visible = this.items()
      .filter((item) => item.x >= lo && item.x <= lo + half * 2)
      .map((item) => ({ ...item, x: (item.x - lo) * scale }));

    const max = maxMagnitude(this.items()) || 1;
    const clusters = clusterByProximity(visible, FAN_THRESHOLD_X);
    const curves: Curve[] = [];
    for (const cluster of clusters) {
      const spread = Math.min(cluster.length - 1, 4) * 2.5;
      cluster.forEach((item, i) => {
        const offset =
          cluster.length === 1 ? 0 : -spread / 2 + (spread / Math.max(1, cluster.length - 1)) * i;
        curves.push({
          id: item.id,
          pathId: `density-a-${item.id}`,
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

  protected readonly zoomLabel = computed(() => `${this.zoom().toFixed(1)}×`);

  protected zoomIn(): void {
    this.zoom.update((z) => Math.min(MAX_ZOOM, z + (z < 2 ? 0.5 : 1)));
    this.clampPan();
  }

  protected zoomOut(): void {
    this.zoom.update((z) => Math.max(1, z - (z <= 2 ? 0.5 : 1)));
    this.clampPan();
  }

  protected resetZoom(): void {
    this.zoom.set(1);
    this.panDays.set(0);
  }

  @HostListener('wheel', ['$event'])
  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.deltaY < 0) this.zoomIn();
    else this.zoomOut();
  }

  protected onPointerDown(event: PointerEvent): void {
    if (this.zoom() <= 1) return;
    this.dragStartX = event.clientX;
    this.dragStartPan = this.panDays();
    (event.target as Element).setPointerCapture(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragStartX === null) return;
    const el = this.scene()?.nativeElement;
    if (!el) return;
    const pxPerDay = el.clientWidth / (this.visibleHalfWidth() * 2);
    const deltaDays = (event.clientX - this.dragStartX) / pxPerDay;
    this.panDays.set(this.dragStartPan - deltaDays);
    this.dragStartX = event.clientX;
    this.dragStartPan = this.panDays();
    this.clampPan();
  }

  protected onPointerUp(): void {
    this.dragStartX = null;
  }

  private clampPan(): void {
    const half = this.visibleHalfWidth();
    const max = HALF_WINDOW_DAYS - half;
    this.panDays.update((p) => Math.max(-max, Math.min(max, p)));
  }
}
