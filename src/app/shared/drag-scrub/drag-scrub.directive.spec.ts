import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DragScrub } from './drag-scrub.directive';

@Component({
  template: `<div appDragScrub [windowDays]="60" (scrubBy)="scrubBy($event)" (tap)="tap($event)">
    <button type="button" class="inner">Inner</button>
  </div>`,
  imports: [DragScrub],
})
class HostComponent {
  scrubBy = vi.fn();
  tap = vi.fn();
}

function pointerEvent(type: string, overrides: Partial<PointerEvent> = {}): PointerEvent {
  return new PointerEvent(type, { pointerId: 1, clientX: 0, clientY: 0, bubbles: true, cancelable: true, ...overrides });
}

describe('DragScrub', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  let host: HTMLElement;
  let inner: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.nativeElement.querySelector('[appDragScrub]');
    inner = fixture.nativeElement.querySelector('.inner');
    // jsdom doesn't implement pointer capture — stub it so the directive's calls are no-ops.
    host.setPointerCapture = vi.fn();
    host.releasePointerCapture = vi.fn();
    fixture.detectChanges();
  });

  it("prevents the pointerdown's default so the browser never synthesizes a competing click", () => {
    const event = pointerEvent('pointerdown');
    const preventDefault = vi.spyOn(event, 'preventDefault');

    inner.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
  });

  it('emits tap with the pointerdown target when pointerup follows with no meaningful movement', () => {
    inner.dispatchEvent(pointerEvent('pointerdown'));
    host.dispatchEvent(pointerEvent('pointerup', { clientX: 0, clientY: 0 }));

    expect(fixture.componentInstance.tap).toHaveBeenCalledWith(inner);
  });

  it('does not emit tap when the pointer moved past the tap threshold before pointerup', () => {
    inner.dispatchEvent(pointerEvent('pointerdown', { clientX: 0, clientY: 0 }));
    host.dispatchEvent(pointerEvent('pointermove', { clientX: 50, clientY: 0 }));
    host.dispatchEvent(pointerEvent('pointerup', { clientX: 50, clientY: 0 }));

    expect(fixture.componentInstance.tap).not.toHaveBeenCalled();
  });

  it('emits scrubBy days as the pointer moves', () => {
    inner.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 0 }));
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () => ({ width: 60, height: 100, top: 0, left: 0, right: 60, bottom: 100, x: 0, y: 0 }),
      configurable: true,
    });
    // 1px per day at this width — move left by 5px (natural pan: right-drag reveals the past).
    host.dispatchEvent(pointerEvent('pointermove', { clientX: 95, clientY: 0 }));

    expect(fixture.componentInstance.scrubBy).toHaveBeenCalledWith(5);
  });

  it('ignores events from a different, unrelated pointerId', () => {
    inner.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 }));
    host.dispatchEvent(pointerEvent('pointerup', { pointerId: 2, clientX: 0, clientY: 0 }));

    expect(fixture.componentInstance.tap).not.toHaveBeenCalled();
  });
});
