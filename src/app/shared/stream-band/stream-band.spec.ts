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

  /**
   * Every real interaction goes through `handleTap` — see `handleTap`'s doc comment in
   * stream-band.ts for why there are no native `(click)` bindings in this component's own
   * template at all (a redundant native-click path double-dispatched against `tap` on some
   * browsers, observed live as the group list flickering open then immediately shut).
   */
  function tap(fixture: ReturnType<typeof TestBed.createComponent<StreamBand>>, selector: string): void {
    const target: HTMLElement | null = fixture.nativeElement.querySelector(selector);
    if (!target) throw new Error(`tap(): no element matching "${selector}"`);
    fixture.componentInstance.handleTap(target);
    fixture.detectChanges();
  }

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

  it('renders a tributary line (marked for tap dispatch) and its label', async () => {
    const { fixture } = await createComponent([flowTributary]);

    const path: SVGPathElement = fixture.nativeElement.querySelector('path.tributary');
    const label: HTMLElement = fixture.nativeElement.querySelector('.tributary-label');
    expect(path.getAttribute('data-tributary-id')).toBe(flowTributary.id);
    expect(label.textContent).toContain('Rent');
  });

  it('emits the source Tributary when its line is tapped', async () => {
    const { component, fixture } = await createComponent([flowTributary]);
    const emitted = vi.fn();
    component.tributaryClick.subscribe(emitted);

    tap(fixture, '[data-tributary-id]');

    expect(emitted).toHaveBeenCalledWith(flowTributary);
  });

  describe('handleTap (DragScrub pointer-capture click-retargeting workaround)', () => {
    /**
     * account-stream wraps this component in `appDragScrub`, whose `setPointerCapture` call
     * retargets the browser's real `click` event to the wrapping `.chart` div instead of
     * whatever tributary/group element the pointer actually landed on — so this component has
     * no native `(click)` bindings of its own; `DragScrub`'s `tap` output reports the real
     * target instead, and `handleTap` is where a DragScrub-wrapped consumer forwards it.
     */
    it('resolves a tapped tributary line (via data-tributary-id) and emits tributaryClick', async () => {
      const { component, fixture } = await createComponent([flowTributary]);
      const emitted = vi.fn();
      component.tributaryClick.subscribe(emitted);

      tap(fixture, '[data-tributary-id]');

      expect(emitted).toHaveBeenCalledWith(flowTributary);
    });

    it('resolves a tapped group line (via data-group-id) and opens its list, without emitting tributaryClick', async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { component, fixture } = await createComponent(cluster, 60);
      const emitted = vi.fn();
      component.tributaryClick.subscribe(emitted);

      tap(fixture, '[data-group-id]');

      expect(emitted).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.group-list')).toBeTruthy();
    });

    it('resolves a tapped group badge button the same way as its line', async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { fixture } = await createComponent(cluster, 60);

      tap(fixture, '.tributary-badge');

      expect(fixture.nativeElement.querySelector('.group-list')).toBeTruthy();
    });

    it('resolves a tapped close control (data-group-close) and closes the open list', async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { fixture } = await createComponent(cluster, 60);
      tap(fixture, '[data-group-id]');
      expect(fixture.nativeElement.querySelector('.group-list')).toBeTruthy();

      tap(fixture, '.group-list-close');

      expect(fixture.nativeElement.querySelector('.group-list')).toBeNull();
    });

    it('does nothing for a tapped element with no matching data attribute', async () => {
      const { component, fixture } = await createComponent([flowTributary]);
      const emitted = vi.fn();
      component.tributaryClick.subscribe(emitted);

      component.handleTap(fixture.nativeElement.querySelector('svg'));

      expect(emitted).not.toHaveBeenCalled();
    });

    it("resolves a tapped group-list row (via data-group-member-id) to drill into that real Tributary, and closes the list", async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { component, fixture } = await createComponent(cluster, 60);
      const emitted = vi.fn();
      component.tributaryClick.subscribe(emitted);
      tap(fixture, '[data-group-id]');

      tap(fixture, '[data-group-member-id="a"]');

      expect(emitted).toHaveBeenCalledWith(cluster.find((t) => t.id === 'a'));
      expect(fixture.nativeElement.querySelector('.group-list')).toBeNull();
    });

    it("resolves a tap that lands on a nested child of a marked element (e.g. a group-list row's inner span) by walking up to the nearest ancestor with the data attribute", async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { component, fixture } = await createComponent(cluster, 60);
      const emitted = vi.fn();
      component.tributaryClick.subscribe(emitted);
      tap(fixture, '[data-group-id]');
      // The real pointerdown target inside a `<button>` row is whichever child span sits under
      // the cursor, never the button itself — this is exactly what broke in the live app.

      tap(fixture, '[data-group-member-id="a"] .date');

      expect(emitted).toHaveBeenCalledWith(cluster.find((t) => t.id === 'a'));
      expect(fixture.nativeElement.querySelector('.group-list')).toBeNull();
    });
  });

  describe('proximity clustering (#66)', () => {
    it('collapses a same-direction cluster within the proximity threshold into one group line with a ×N badge, hiding individual lines', async () => {
      const cluster = [
        tributaryAt({ id: 'a', x: 10 }),
        tributaryAt({ id: 'b', x: 11 }),
        tributaryAt({ id: 'c', x: 12 }),
      ];
      const { fixture } = await createComponent(cluster, 60);

      const groupPaths = fixture.nativeElement.querySelectorAll('path.tributary.group');
      const individualPaths = fixture.nativeElement.querySelectorAll('path.tributary:not(.group)');
      const badge: HTMLElement = fixture.nativeElement.querySelector('.tributary-badge');

      expect(groupPaths.length).toBe(1);
      expect(individualPaths.length).toBe(0);
      expect(badge.textContent).toBe('×3');
    });

    it('renders items outside the proximity threshold as individual lines, not a group', async () => {
      const items = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 50 })];
      const { fixture } = await createComponent(items, 60);

      const groupPaths = fixture.nativeElement.querySelectorAll('path.tributary.group');
      const individualPaths = fixture.nativeElement.querySelectorAll('path.tributary:not(.group)');

      expect(groupPaths.length).toBe(0);
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

    it('tapping a group does not emit tributaryClick — it opens the list instead of drilling in', async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { component, fixture } = await createComponent(cluster, 60);
      const emitted = vi.fn();
      component.tributaryClick.subscribe(emitted);

      tap(fixture, 'path.tributary.group');

      expect(emitted).not.toHaveBeenCalled();
    });

    it("tapping a group opens a name+date+amount list of its real members, with no zoom and no new lines added", async () => {
      const cluster = [
        tributaryAt({ id: 'a', x: 10, label: 'Coffee', date: new Date(2026, 3, 10) }),
        tributaryAt({ id: 'b', x: 11, label: 'Parking', date: new Date(2026, 3, 11) }),
        tributaryAt({ id: 'c', x: 12, label: 'Tolls', date: new Date(2026, 3, 12) }),
      ];
      const { fixture } = await createComponent(cluster, 60);
      const viewBoxBefore = fixture.nativeElement.querySelector('svg').getAttribute('viewBox');
      const pathCountBefore = fixture.nativeElement.querySelectorAll('path.tributary').length;

      tap(fixture, 'path.tributary.group');

      const viewBoxAfter = fixture.nativeElement.querySelector('svg').getAttribute('viewBox');
      const pathCountAfter = fixture.nativeElement.querySelectorAll('path.tributary').length;
      const items: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.group-list li');

      expect(viewBoxAfter).toBe(viewBoxBefore);
      expect(pathCountAfter).toBe(pathCountBefore);
      expect(items.length).toBe(3);
      expect(Array.from(items).map((i) => i.textContent)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Coffee'),
          expect.stringContaining('Parking'),
          expect.stringContaining('Tolls'),
        ]),
      );
    });

    it('a close control returns from the open list to no list open', async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { fixture } = await createComponent(cluster, 60);

      tap(fixture, 'path.tributary.group');
      expect(fixture.nativeElement.querySelector('.group-list')).toBeTruthy();

      tap(fixture, '.group-list-close');

      expect(fixture.nativeElement.querySelector('.group-list')).toBeNull();
      expect(fixture.nativeElement.querySelector('path.tributary.group')).toBeTruthy();
    });

    it('re-tapping the same group toggles its list closed, rather than double-opening it', async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { fixture } = await createComponent(cluster, 60);

      tap(fixture, '[data-group-id]');
      expect(fixture.nativeElement.querySelector('.group-list')).toBeTruthy();

      tap(fixture, '[data-group-id]');

      expect(fixture.nativeElement.querySelector('.group-list')).toBeNull();
    });

    it('still emits tributaryClick for an ungrouped (singleton) tributary, for drill-in (#65)', async () => {
      const items = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 50 })];
      const { component, fixture } = await createComponent(items, 60);
      const emitted = vi.fn();
      component.tributaryClick.subscribe(emitted);

      tap(fixture, 'path.tributary:not(.group)');

      expect(emitted).toHaveBeenCalledTimes(1);
    });
  });

  describe('legibility for tiny amounts / high flow count (#67)', () => {
    it('rolls up 2+ minor-magnitude same-direction items into one group with a ×N badge, hiding their individual lines', async () => {
      const major = tributaryAt({ id: 'major', x: 5, amount: 1000, label: 'Rent' });
      const minorA = tributaryAt({ id: 'minor-a', x: 10, amount: 20, label: 'Coffee' });
      const minorB = tributaryAt({ id: 'minor-b', x: 50, amount: 30, label: 'Parking' });
      const { fixture } = await createComponent([major, minorA, minorB], 60);

      const badges: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.tributary-badge');
      const plainLines = fixture.nativeElement.querySelectorAll('path.tributary:not(.group)');
      const labels: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.tributary-label');

      expect(badges.length).toBe(1);
      expect(badges[0].textContent).toBe('×2');
      expect(plainLines.length).toBe(1); // only the major
      expect(Array.from(labels).some((l) => l.textContent === 'Coffee')).toBe(false);
      expect(Array.from(labels).some((l) => l.textContent === 'Parking')).toBe(false);
    });

    it('does not roll up a lone minor item — it renders and drills in normally', async () => {
      const major = tributaryAt({ id: 'major', x: 5, amount: 1000 });
      const lonelyMinor = tributaryAt({ id: 'lonely', x: 50, amount: 20, label: 'Coffee' });
      const { component, fixture } = await createComponent([major, lonelyMinor], 60);
      const emitted = vi.fn();
      component.tributaryClick.subscribe(emitted);

      expect(fixture.nativeElement.querySelector('.tributary-badge')).toBeNull();
      const plainLines = fixture.nativeElement.querySelectorAll('path.tributary:not(.group)');
      expect(plainLines.length).toBe(2);

      tap(fixture, `[data-tributary-id="${lonelyMinor.id}"]`);

      expect(emitted).toHaveBeenCalledWith(lonelyMinor);
    });

    it('tapping the badge expands a name+date+amount list, with no fanned lines added', async () => {
      const major = tributaryAt({ id: 'major', x: 5, amount: 1000 });
      const minorA = tributaryAt({ id: 'minor-a', x: 10, amount: 20, label: 'Coffee' });
      const minorB = tributaryAt({ id: 'minor-b', x: 50, amount: 30, label: 'Parking' });
      const { fixture } = await createComponent([major, minorA, minorB], 60);
      const pathCountBefore = fixture.nativeElement.querySelectorAll('path.tributary').length;

      tap(fixture, '.tributary-badge');

      const list: HTMLElement = fixture.nativeElement.querySelector('.group-list');
      const items: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.group-list li');
      const pathCountAfter = fixture.nativeElement.querySelectorAll('path.tributary').length;

      expect(list).toBeTruthy();
      expect(items.length).toBe(2);
      expect(Array.from(items).map((i) => i.textContent)).toEqual(
        expect.arrayContaining([expect.stringContaining('Coffee'), expect.stringContaining('Parking')]),
      );
      expect(pathCountAfter).toBe(pathCountBefore);
    });

    it('does not emit tributaryClick when the rollup badge is tapped', async () => {
      const major = tributaryAt({ id: 'major', x: 5, amount: 1000 });
      const minorA = tributaryAt({ id: 'minor-a', x: 10, amount: 20 });
      const minorB = tributaryAt({ id: 'minor-b', x: 50, amount: 30 });
      const { component, fixture } = await createComponent([major, minorA, minorB], 60);
      const emitted = vi.fn();
      component.tributaryClick.subscribe(emitted);

      tap(fixture, '.tributary-badge');

      expect(emitted).not.toHaveBeenCalled();
    });

    it('still drills in normally on a real (major) tributary once a rollup exists alongside it', async () => {
      const major = tributaryAt({ id: 'major', x: 5, amount: 1000 });
      const minorA = tributaryAt({ id: 'minor-a', x: 10, amount: 20 });
      const minorB = tributaryAt({ id: 'minor-b', x: 50, amount: 30 });
      const { component, fixture } = await createComponent([major, minorA, minorB], 60);
      const emitted = vi.fn();
      component.tributaryClick.subscribe(emitted);

      tap(fixture, 'path.tributary:not(.group)');

      expect(emitted).toHaveBeenCalledWith(major);
    });

    describe('composition with proximity clustering (#66)', () => {
      it('folds the rollup into a #66 proximity group when it lands near a major, showing the true flattened member count', async () => {
        const major = tributaryAt({ id: 'major', x: 10, amount: 1000, label: 'Rent' });
        const minorA = tributaryAt({ id: 'minor-a', x: 11, amount: 20, label: 'Coffee' });
        const minorB = tributaryAt({ id: 'minor-b', x: 12, amount: 30, label: 'Parking' });
        const { fixture } = await createComponent([major, minorA, minorB], 60);

        const groupPaths = fixture.nativeElement.querySelectorAll('path.tributary.group');
        const badge: HTMLElement = fixture.nativeElement.querySelector('.tributary-badge');

        // One merged group (major + the rolled-up minor aggregate), but its badge counts the
        // real flattened members — 1 major + 2 minors = ×3, not ×2 (cluster.length) or ×1.
        expect(groupPaths.length).toBe(1);
        expect(badge.textContent).toBe('×3');
      });

      it("tapping the merged group's badge lists every real member — the major and both flattened minors — with no zoom", async () => {
        const major = tributaryAt({ id: 'major', x: 10, amount: 1000, label: 'Rent' });
        const minorA = tributaryAt({ id: 'minor-a', x: 11, amount: 20, label: 'Coffee' });
        const minorB = tributaryAt({ id: 'minor-b', x: 12, amount: 30, label: 'Parking' });
        const { component, fixture } = await createComponent([major, minorA, minorB], 60);
        const emitted = vi.fn();
        component.tributaryClick.subscribe(emitted);
        const viewBoxBefore = fixture.nativeElement.querySelector('svg').getAttribute('viewBox');

        tap(fixture, '.tributary-badge');

        const viewBoxAfter = fixture.nativeElement.querySelector('svg').getAttribute('viewBox');
        const items: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.group-list li');

        expect(viewBoxAfter).toBe(viewBoxBefore);
        expect(emitted).not.toHaveBeenCalled();
        expect(items.length).toBe(3);
        expect(Array.from(items).map((i) => i.textContent)).toEqual(
          expect.arrayContaining([
            expect.stringContaining('Rent'),
            expect.stringContaining('Coffee'),
            expect.stringContaining('Parking'),
          ]),
        );
      });
    });
  });
});
