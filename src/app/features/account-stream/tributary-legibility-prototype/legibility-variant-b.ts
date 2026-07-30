// PROTOTYPE — throwaway, answers wayfinder ticket #60 (tributary legibility for tiny
// amounts / many flows).
// Variant B: local re-scaling zoom, reusing #59's tap-to-zoom interaction but for a
// different purpose. #59 zoomed to separate items that were too close together in *time*;
// it never touched stroke width, so it can't help a $2 subscription that's floored at 1.5px
// against the window's $2,200 Rent. This variant zooms the same way, but on zoom, thickness
// re-normalizes against the *visible* subset's own max magnitude instead of the whole
// window's — so tapping into a quiet stretch of small items makes them scale against each
// other and become legible, without ever introducing a second "minor item" visual tier the
// way variants A and C do. Same rendering path at every zoom level, just a different max.
// Once zoomed, the same surface drag-scrubs the neighborhood left/right — reusing the app's
// own `accumulateScrubDays` so it carries the identical natural-direction, sub-day-carry feel
// as the real chart's `DragScrub` directive, rather than inventing a second scrub convention.
import { Component, computed, ElementRef, signal, input, viewChild } from '@angular/core';
import { accumulateScrubDays } from '../../../core/charting/scrub-gesture';
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
/** Half-width of the zoomed neighborhood, in the same view-units as #59's own zoom. */
const ZOOM_HALF_WIDTH = 18;
/** Items whose join point falls within this padding outside the domain still get drawn — their far end can still dip into view. */
const RENDER_PAD = 22;
/** Pointer movement below this, between down and up, counts as a tap rather than a drag. */
const TAP_THRESHOLD_PX = 6;

@Component({
  selector: 'app-legibility-variant-b',
  templateUrl: './legibility-variant-b.html',
  styleUrl: './legibility-variant-b.css',
})
export class LegibilityVariantB {
  readonly items = input.required<PositionedTributary[]>();
  protected readonly bandTop = BAND_TOP;
  protected readonly bandBottom = BAND_BOTTOM;

  private readonly svgRef = viewChild<ElementRef<SVGSVGElement>>('scene');

  /** Center of the zoomed neighborhood, in view-units; null means the full, unzoomed window. */
  protected readonly zoomCenter = signal<number | null>(null);

  protected readonly isZoomed = computed(() => this.zoomCenter() !== null);

  protected readonly domain = computed<[number, number]>(() => {
    const center = this.zoomCenter();
    if (center === null) return [0, VIEW_W];
    const start = Math.max(0, Math.min(center - ZOOM_HALF_WIDTH, VIEW_W - ZOOM_HALF_WIDTH * 2));
    return [start, start + ZOOM_HALF_WIDTH * 2];
  });

  protected readonly viewBox = computed(() => {
    const [start, end] = this.domain();
    return `${start} 0 ${end - start} ${VIEW_H}`;
  });

  /**
   * Items actually eligible to render at the current zoom — anything else is not just
   * off-screen but, since its stroke width is about to be computed against a `localMax` that
   * has nothing to do with it, would render at a wildly wrong (and wildly large) thickness.
   * Padded so a line whose join point sits just outside the domain, but whose far end still
   * reaches in, doesn't pop out abruptly at the domain edge.
   */
  private readonly visibleItems = computed(() => {
    const [start, end] = this.domain();
    return this.items().filter((item) => item.x >= start - RENDER_PAD && item.x <= end + RENDER_PAD);
  });

  /** Re-normalizes against only the items visible in the current domain — the whole point. */
  private readonly localMax = computed(() => maxMagnitude(this.visibleItems()) || 1);

  /**
   * `preserveAspectRatio="none"` scales x and y independently — the same mechanism #59's
   * review flagged for its badge (a circle drawn there renders as an ellipse). A stroke
   * width declared in path-local units gets stretched by whichever axis moved further, so
   * narrowing only the x-domain on zoom would balloon every line's rendered thickness. This
   * divides the declared width by how much the x-axis alone has stretched, to counteract it.
   */
  private readonly xStretch = computed(() => {
    const [start, end] = this.domain();
    return VIEW_W / (end - start);
  });

  protected readonly curves = computed<Curve[]>(() => {
    const max = this.localMax();
    const correction = this.xStretch();
    return this.visibleItems().map((item) => ({
      id: item.id,
      pathId: `legibility-b-${item.id}`,
      d: angledLine(item.x, item.direction === 'in' ? BAND_TOP : BAND_BOTTOM, item.direction),
      strokeWidth: scaledMagnitude(item, max, 5) / correction,
      label: labelFor(item),
      direction: item.direction,
      kind: item.kind,
    }));
  });

  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private carryDays = 0;

  protected onPointerDown(event: PointerEvent): void {
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.lastX = event.clientX;
    this.carryDays = 0;
    (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId || !this.isZoomed()) return;

    const svg = this.svgRef()?.nativeElement;
    const [start, end] = this.domain();
    const width = svg?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;

    const pxPerDay = width / (end - start);
    const deltaPx = event.clientX - this.lastX;
    this.lastX = event.clientX;

    // Same natural-direction convention as `DragScrub`: dragging right reveals earlier items.
    const { emitDays, carryDays } = accumulateScrubDays(-deltaPx, pxPerDay, this.carryDays);
    this.carryDays = carryDays;
    if (emitDays !== 0) this.zoomCenter.update((center) => (center ?? 0) + emitDays);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;

    const distance = Math.hypot(event.clientX - this.startX, event.clientY - this.startY);
    if (distance >= TAP_THRESHOLD_PX) return;

    // A tap (not a drag) sets — or re-centers — the zoomed neighborhood on the tapped point.
    const svg = this.svgRef()?.nativeElement;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    this.zoomCenter.set(local.x);
  }

  protected resetZoom(): void {
    this.zoomCenter.set(null);
  }
}
