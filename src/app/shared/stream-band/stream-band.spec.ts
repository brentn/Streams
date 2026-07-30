import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BandPoint } from '../../core/charting/band-segments';
import { Tributary } from '../../core/charting/tributaries';
import { StreamBand } from './stream-band';

function point(x: number, balance: number): BandPoint {
  return { x, balance };
}

const points: BandPoint[] = [point(0, 100), point(1, 100), point(2, 100)];

describe('StreamBand', () => {
  async function createComponent(tributaries: Tributary[] = []) {
    await TestBed.configureTestingModule({ imports: [StreamBand] }).compileComponents();
    const fixture = TestBed.createComponent(StreamBand);
    fixture.componentRef.setInput('points', points);
    fixture.componentRef.setInput('boundaryX', 1);
    fixture.componentRef.setInput('maxAbsBalance', 100);
    fixture.componentRef.setInput('viewWidth', 2);
    fixture.componentRef.setInput('tributaries', tributaries);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

  const flowTributary: Tributary = {
    id: 'flow-flow-1-100',
    kind: 'flow',
    direction: 'out',
    date: new Date(2026, 0, 1),
    x: 1,
    amount: 50,
    label: 'Rent',
    flowId: 'flow-1',
  };

  it('emits the source Tributary when its line id is clicked', async () => {
    const { component } = await createComponent([flowTributary]);
    const emitted = vi.fn();
    component.tributaryClick.subscribe(emitted);

    component['onTributaryClick'](flowTributary.id);

    expect(emitted).toHaveBeenCalledWith(flowTributary);
  });

  it('does not emit for an unknown line id', async () => {
    const { component } = await createComponent([flowTributary]);
    const emitted = vi.fn();
    component.tributaryClick.subscribe(emitted);

    component['onTributaryClick']('not-a-real-id');

    expect(emitted).not.toHaveBeenCalled();
  });

  it('renders a clickable path and label for each tributary', async () => {
    const { fixture } = await createComponent([flowTributary]);

    const path: SVGPathElement = fixture.nativeElement.querySelector('path.tributary');
    const label: HTMLElement = fixture.nativeElement.querySelector('.tributary-label');
    expect(path).toBeTruthy();
    expect(label.textContent).toContain('Rent');
  });

  it('emits the source Tributary when the rendered path is clicked', async () => {
    const { component, fixture } = await createComponent([flowTributary]);
    const emitted = vi.fn();
    component.tributaryClick.subscribe(emitted);

    const path: SVGPathElement = fixture.nativeElement.querySelector('path.tributary');
    path.dispatchEvent(new Event('click'));

    expect(emitted).toHaveBeenCalledWith(flowTributary);
  });
});
