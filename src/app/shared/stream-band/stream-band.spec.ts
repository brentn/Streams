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
  async function createComponent(tributaries: Tributary[] = [], viewWidth = 2) {
    await TestBed.configureTestingModule({ imports: [StreamBand] }).compileComponents();
    const fixture = TestBed.createComponent(StreamBand);
    fixture.componentRef.setInput('points', points);
    fixture.componentRef.setInput('boundaryX', 1);
    fixture.componentRef.setInput('maxAbsBalance', 100);
    fixture.componentRef.setInput('viewWidth', viewWidth);
    fixture.componentRef.setInput('tributaries', tributaries);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

  function tributaryAt(overrides: Partial<Tributary>): Tributary {
    return {
      id: 't-1',
      kind: 'flow',
      direction: 'out',
      date: new Date(2026, 0, 1),
      x: 30,
      amount: 50,
      label: 'Groceries',
      ...overrides,
    };
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

  describe('density & clustering (#66)', () => {
    it('collapses a same-direction cluster within the proximity threshold into one dashed bundle line with a ×N badge, hiding individual lines', async () => {
      const cluster = [
        tributaryAt({ id: 'a', x: 10 }),
        tributaryAt({ id: 'b', x: 11 }),
        tributaryAt({ id: 'c', x: 12 }),
      ];
      const { fixture } = await createComponent(cluster, 60);

      const bundlePaths = fixture.nativeElement.querySelectorAll('path.tributary.bundle');
      const individualPaths = fixture.nativeElement.querySelectorAll('path.tributary:not(.bundle)');
      const badge: HTMLElement = fixture.nativeElement.querySelector('.tributary-badge');

      expect(bundlePaths.length).toBe(1);
      expect(individualPaths.length).toBe(0);
      expect(badge.textContent).toBe('×3');
    });

    it('renders items outside the proximity threshold as individual lines, not a bundle', async () => {
      const items = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 50 })];
      const { fixture } = await createComponent(items, 60);

      const bundlePaths = fixture.nativeElement.querySelectorAll('path.tributary.bundle');
      const individualPaths = fixture.nativeElement.querySelectorAll('path.tributary:not(.bundle)');

      expect(bundlePaths.length).toBe(0);
      expect(individualPaths.length).toBe(2);
    });

    it('renders the ×N badge as a plain HTML overlay outside the SVG, not an SVG element', async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { fixture } = await createComponent(cluster, 60);

      const svgBadge = fixture.nativeElement.querySelector('svg .tributary-badge');
      const htmlBadge: HTMLElement = fixture.nativeElement.querySelector('.tributary-badge');

      expect(svgBadge).toBeNull();
      expect(htmlBadge.tagName).not.toBe('circle');
      expect(htmlBadge.parentElement?.tagName.toLowerCase()).not.toBe('svg');
    });

    it('clicking a bundle does not emit tributaryClick — it zooms instead of drilling in', async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { component, fixture } = await createComponent(cluster, 60);
      const emitted = vi.fn();
      component.tributaryClick.subscribe(emitted);

      const bundlePath: SVGPathElement = fixture.nativeElement.querySelector('path.tributary.bundle');
      bundlePath.dispatchEvent(new Event('click'));

      expect(emitted).not.toHaveBeenCalled();
    });

    it('tapping a bundle auto-zooms the view into that cluster\'s neighborhood and expands its members into individual lines', async () => {
      const cluster = [
        tributaryAt({ id: 'a', x: 10 }),
        tributaryAt({ id: 'b', x: 11 }),
        tributaryAt({ id: 'c', x: 12 }),
      ];
      const { fixture } = await createComponent(cluster, 60);
      const defaultViewBox = fixture.nativeElement.querySelector('svg').getAttribute('viewBox');

      const bundlePath: SVGPathElement = fixture.nativeElement.querySelector('path.tributary.bundle');
      bundlePath.dispatchEvent(new Event('click'));
      fixture.detectChanges();

      const zoomedViewBox = fixture.nativeElement.querySelector('svg').getAttribute('viewBox');
      const individualPaths = fixture.nativeElement.querySelectorAll('path.tributary:not(.bundle)');
      const bundlePaths = fixture.nativeElement.querySelectorAll('path.tributary.bundle');

      expect(zoomedViewBox).not.toBe(defaultViewBox);
      expect(zoomedViewBox).not.toBe('0 0 60 120');
      expect(individualPaths.length).toBe(3);
      expect(bundlePaths.length).toBe(0);
    });

    it('a close control returns from the zoomed cluster view to the default full-window view', async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { fixture } = await createComponent(cluster, 60);
      const defaultViewBox = fixture.nativeElement.querySelector('svg').getAttribute('viewBox');

      fixture.nativeElement.querySelector('path.tributary.bundle').dispatchEvent(new Event('click'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.zoom-close')).toBeTruthy();

      fixture.nativeElement.querySelector('.zoom-close').dispatchEvent(new Event('click'));
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('svg').getAttribute('viewBox')).toBe(defaultViewBox);
      expect(fixture.nativeElement.querySelector('.zoom-close')).toBeNull();
      expect(fixture.nativeElement.querySelector('path.tributary.bundle')).toBeTruthy();
    });

    it('gives members sharing an exact date synthetic intraday positions once their cluster is expanded, instead of an identical x', async () => {
      const sameDate = new Date(2026, 3, 15);
      const cluster = [
        tributaryAt({ id: 'a', x: 30, date: sameDate }),
        tributaryAt({ id: 'b', x: 30, date: sameDate }),
        tributaryAt({ id: 'c', x: 30, date: sameDate }),
      ];
      const { fixture } = await createComponent(cluster, 60);

      fixture.nativeElement.querySelector('path.tributary.bundle').dispatchEvent(new Event('click'));
      fixture.detectChanges();

      const individualPaths: NodeListOf<SVGPathElement> = fixture.nativeElement.querySelectorAll(
        'path.tributary:not(.bundle)',
      );
      const dAttrs = Array.from(individualPaths).map((p) => p.getAttribute('d'));

      expect(individualPaths.length).toBe(3);
      expect(new Set(dAttrs).size).toBe(3);
    });

    it('still emits tributaryClick for an unbundled tributary once its cluster is expanded, for drill-in (#65)', async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { component, fixture } = await createComponent(cluster, 60);
      const emitted = vi.fn();
      component.tributaryClick.subscribe(emitted);

      fixture.nativeElement.querySelector('path.tributary.bundle').dispatchEvent(new Event('click'));
      fixture.detectChanges();

      const individualPath: SVGPathElement = fixture.nativeElement.querySelector('path.tributary:not(.bundle)');
      individualPath.dispatchEvent(new Event('click'));

      expect(emitted).toHaveBeenCalledTimes(1);
      expect(emitted.mock.calls[0][0].id).toBe('a');
    });
  });
});
