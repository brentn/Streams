import { Directive, ElementRef, inject, input, output } from '@angular/core';
import { accumulateScrubDays } from '../../core/charting/scrub-gesture';

/**
 * Attaches direct drag-to-scrub to a chart's surface: pointer/touch drag,
 * relative-pixel-delta mapped to whole days via `scrubBy`. Per docs/ux-spec.md
 * ("Scrubber: chart, not a range input") this is the only interaction — no
 * range input, no prev/next buttons.
 */
@Directive({
  selector: '[appDragScrub]',
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerEnd($event)',
    '(pointercancel)': 'onPointerEnd($event)',
    style: 'touch-action: none;',
  },
})
export class DragScrub {
  private readonly el = inject(ElementRef<HTMLElement>);

  /** Total days spanned by the element's full rendered width. */
  readonly windowDays = input.required<number>();
  readonly scrubBy = output<number>();

  private pointerId: number | null = null;
  private lastX = 0;
  private carryDays = 0;

  protected onPointerDown(event: PointerEvent): void {
    this.pointerId = event.pointerId;
    this.lastX = event.clientX;
    this.carryDays = 0;
    this.el.nativeElement.setPointerCapture(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;

    const width = this.el.nativeElement.getBoundingClientRect().width;
    if (width <= 0) return;

    const pxPerDay = width / this.windowDays();
    const deltaPx = event.clientX - this.lastX;
    this.lastX = event.clientX;

    // Natural/touch-scroll convention: dragging right pulls the timeline
    // right, revealing the past (like panning a canvas), so a positive
    // pixel delta maps to a negative day delta.
    const { emitDays, carryDays } = accumulateScrubDays(-deltaPx, pxPerDay, this.carryDays);
    this.carryDays = carryDays;
    if (emitDays !== 0) this.scrubBy.emit(emitDays);
  }

  protected onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.carryDays = 0;
  }
}
