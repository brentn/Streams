import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BandPoint } from '../../core/charting/band-segments';
import { Sign } from '../../core/models/account';
import { Tributary } from '../../core/charting/tributaries';
import { StreamBand } from './stream-band';

function point(x: number, balance: number): BandPoint {
  return { x, balance };
}

const points: BandPoint[] = [point(0, 100), point(1, 100), point(2, 100)];

interface CreateComponentOverrides {
  points?: BandPoint[];
  boundaryX?: number;
  expectedSign?: Sign;
  colorPalette?: 'account' | 'total';
  colorDomain?: number;
}

describe('StreamBand', () => {
  async function createComponent(
    tributaries: Tributary[] = [],
    viewWidth = 2,
    overrides: CreateComponentOverrides = {},
  ) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [StreamBand] }).compileComponents();
    const fixture = TestBed.createComponent(StreamBand);
    fixture.componentRef.setInput('points', overrides.points ?? points);
    fixture.componentRef.setInput('boundaryX', overrides.boundaryX ?? 1);
    fixture.componentRef.setInput('viewWidth', viewWidth);
    fixture.componentRef.setInput('tributaries', tributaries);
    if (overrides.expectedSign !== undefined) fixture.componentRef.setInput('expectedSign', overrides.expectedSign);
    if (overrides.colorPalette !== undefined) fixture.componentRef.setInput('colorPalette', overrides.colorPalette);
    if (overrides.colorDomain !== undefined) fixture.componentRef.setInput('colorDomain', overrides.colorDomain);
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

  /**
   * Resolves a `.band-fill` polygon's `fill="url(#...)"` back to its `<linearGradient>` in
   * `<defs>` — the hue/opacity now live on that gradient's `.gradient-stop` children, not on the
   * polygon itself (see stream-band.ts's `hueRuns`).
   */
  function gradientFor(
    fixture: ReturnType<typeof TestBed.createComponent<StreamBand>>,
    fill: Element,
  ): Element {
    const url = fill.getAttribute('fill') ?? '';
    const id = url.replace(/^url\(#/, '').replace(/\)$/, '');
    const gradient: Element | null = fixture.nativeElement.querySelector(`[id="${id}"]`);
    if (!gradient) throw new Error(`gradientFor(): no gradient with id "${id}"`);
    return gradient;
  }

  function stopOpacities(gradient: Element): number[] {
    return Array.from(gradient.querySelectorAll<HTMLElement>('.gradient-stop')).map((el) =>
      Number(el.style.stopOpacity),
    );
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

  it('renders a tributary arrow (marked for tap dispatch) and its label', async () => {
    const { fixture } = await createComponent([flowTributary]);

    const arrow: HTMLElement = fixture.nativeElement.querySelector('.tributary-arrow');
    const label: HTMLElement = fixture.nativeElement.querySelector('.tributary-label');
    expect(arrow.getAttribute('data-tributary-id')).toBe(flowTributary.id);
    expect(label.textContent).toContain('Rent');
  });

  it('renders an outgoing individual tributary with the .out modifier and an incoming one without it — both otherwise sharing the same blue shaft/tick markup, no direction-coded color classes (#80)', async () => {
    const inTrib = tributaryAt({ id: 'in-1', direction: 'in', x: 10 });
    const outTrib = tributaryAt({ id: 'out-1', direction: 'out', x: 50 });
    const { fixture } = await createComponent([inTrib, outTrib], 60);

    const inArrow: HTMLElement = fixture.nativeElement.querySelector('[data-tributary-id="in-1"]');
    const outArrow: HTMLElement = fixture.nativeElement.querySelector('[data-tributary-id="out-1"]');

    expect(inArrow.classList.contains('out')).toBe(false);
    expect(outArrow.classList.contains('out')).toBe(true);
    expect(inArrow.querySelector('.arrow-shaft')).toBeTruthy();
    expect(inArrow.querySelector('.arrow-tick')).toBeTruthy();
    expect(outArrow.querySelector('.arrow-shaft')).toBeTruthy();
    expect(outArrow.querySelector('.arrow-tick')).toBeTruthy();
  });

  it("renders an Outstanding Flow's own marker with the .warning modifier (#88), and a normal one without it", async () => {
    const warned = tributaryAt({ id: 'warned', warning: true });
    const unwarned = tributaryAt({ id: 'unwarned', x: 60 });
    const { fixture } = await createComponent([warned, unwarned], 100);

    const warnedArrow: HTMLElement = fixture.nativeElement.querySelector('[data-tributary-id="warned"]');
    const unwarnedArrow: HTMLElement = fixture.nativeElement.querySelector('[data-tributary-id="unwarned"]');

    expect(warnedArrow.classList.contains('warning')).toBe(true);
    expect(unwarnedArrow.classList.contains('warning')).toBe(false);
  });

  it("wires the amount-scaled strokeWidth/tickLength into the arrow's --shaft-width/--tick-length custom properties", async () => {
    const trib = tributaryAt({ id: 'sized', amount: 4000 });
    const { fixture } = await createComponent([trib]);

    const arrow: HTMLElement = fixture.nativeElement.querySelector('[data-tributary-id="sized"]');

    expect(arrow.style.getPropertyValue('--shaft-width')).toMatch(/px$/);
    expect(arrow.style.getPropertyValue('--tick-length')).toMatch(/px$/);
    expect(parseFloat(arrow.style.getPropertyValue('--tick-length'))).toBeGreaterThan(0);
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

    /**
     * `.tributary-label` is nested inside `.tributary-arrow[data-tributary-id]` (#80), so a tap
     * landing directly on the name label — not just the shaft/tick — must resolve to the same
     * Tributary via `.closest()`. This is also the seam that would have caught the label's
     * leftover `pointer-events: none` (a holdover from the old design, where the label sat on top
     * of a separately-clickable SVG line and needed to pass clicks through to it): with that CSS
     * still in place, a real click on the label went nowhere even though this DOM-resolution
     * check alone still passed — see the computed-style assertion below for the part that
     * actually exercises the CSS.
     */
    it('resolves a tap landing directly on the tributary label and emits tributaryClick', async () => {
      const { component, fixture } = await createComponent([flowTributary]);
      const emitted = vi.fn();
      component.tributaryClick.subscribe(emitted);

      tap(fixture, '.tributary-label');

      expect(emitted).toHaveBeenCalledWith(flowTributary);
    });

    it('keeps the tributary label actually clickable — not pointer-events: none — since it is now the primary label target, unlike the old SVG-line design it replaced', async () => {
      const { fixture } = await createComponent([flowTributary]);

      const label: HTMLElement = fixture.nativeElement.querySelector('.tributary-label');

      expect(getComputedStyle(label).pointerEvents).not.toBe('none');
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
    it('collapses a same-direction cluster within the proximity threshold into one group arrow with a ×N badge, hiding individual arrows', async () => {
      const cluster = [
        tributaryAt({ id: 'a', x: 10 }),
        tributaryAt({ id: 'b', x: 11 }),
        tributaryAt({ id: 'c', x: 12 }),
      ];
      const { fixture } = await createComponent(cluster, 60);

      const groupArrows = fixture.nativeElement.querySelectorAll('.tributary-arrow.group');
      const individualArrows = fixture.nativeElement.querySelectorAll('.tributary-arrow:not(.group)');
      const badge: HTMLElement = fixture.nativeElement.querySelector('.tributary-badge');

      expect(groupArrows.length).toBe(1);
      expect(individualArrows.length).toBe(0);
      expect(badge.textContent).toBe('×3');
    });

    it("signals a group containing an Outstanding item on the ×N badge, via the .warning modifier (ADR-0012, #88)", async () => {
      const cluster = [
        tributaryAt({ id: 'a', x: 10 }),
        tributaryAt({ id: 'b', x: 11, warning: true }),
      ];
      const { fixture } = await createComponent(cluster, 60);

      const groupArrow: HTMLElement = fixture.nativeElement.querySelector('.tributary-arrow.group');
      const badge: HTMLElement = fixture.nativeElement.querySelector('.tributary-badge');

      expect(groupArrow.classList.contains('warning')).toBe(true);
      expect(badge.classList.contains('warning')).toBe(true);
    });

    it("renders a group arrow with the same shaft/tick shape/styling as an individual tributary (#81)", async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { fixture } = await createComponent(cluster, 60);

      const groupArrow: HTMLElement = fixture.nativeElement.querySelector('.tributary-arrow.group');

      expect(groupArrow.querySelector('.arrow-shaft')).toBeTruthy();
      expect(groupArrow.querySelector('.arrow-tick')).toBeTruthy();
      expect(groupArrow.style.getPropertyValue('--shaft-width')).toMatch(/px$/);
      expect(groupArrow.style.getPropertyValue('--tick-length')).toMatch(/px$/);
    });

    it('renders items outside the proximity threshold as individual arrows, not a group', async () => {
      const items = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 50 })];
      const { fixture } = await createComponent(items, 60);

      const groupArrows = fixture.nativeElement.querySelectorAll('.tributary-arrow.group');
      const individualArrows = fixture.nativeElement.querySelectorAll('.tributary-arrow:not(.group)');

      expect(groupArrows.length).toBe(0);
      expect(individualArrows.length).toBe(2);
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

      tap(fixture, '.tributary-arrow.group');

      expect(emitted).not.toHaveBeenCalled();
    });

    it("tapping a group opens a name+date+amount list of its real members, with no zoom and no new arrows added", async () => {
      const cluster = [
        tributaryAt({ id: 'a', x: 10, label: 'Coffee', date: new Date(2026, 3, 10) }),
        tributaryAt({ id: 'b', x: 11, label: 'Parking', date: new Date(2026, 3, 11) }),
        tributaryAt({ id: 'c', x: 12, label: 'Tolls', date: new Date(2026, 3, 12) }),
      ];
      const { fixture } = await createComponent(cluster, 60);
      const viewBoxBefore = fixture.nativeElement.querySelector('svg').getAttribute('viewBox');
      const arrowCountBefore = fixture.nativeElement.querySelectorAll('.tributary-arrow').length;

      tap(fixture, '.tributary-arrow.group');

      const viewBoxAfter = fixture.nativeElement.querySelector('svg').getAttribute('viewBox');
      const arrowCountAfter = fixture.nativeElement.querySelectorAll('.tributary-arrow').length;
      const items: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.group-list li');

      expect(viewBoxAfter).toBe(viewBoxBefore);
      expect(arrowCountAfter).toBe(arrowCountBefore);
      expect(items.length).toBe(3);
      expect(Array.from(items).map((i) => i.textContent)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Coffee'),
          expect.stringContaining('Parking'),
          expect.stringContaining('Tolls'),
        ]),
      );
    });

    it("shows the total across all members in the header instead of the bare 'Incoming (N)'/'Outgoing (N)' count (#73)", async () => {
      const cluster = [
        tributaryAt({ id: 'a', x: 10, amount: 20 }),
        tributaryAt({ id: 'b', x: 11, amount: 30 }),
        tributaryAt({ id: 'c', x: 12, amount: 40 }),
      ];
      const { fixture } = await createComponent(cluster, 60);

      tap(fixture, '.tributary-arrow.group');

      const header: HTMLElement = fixture.nativeElement.querySelector('.group-list-header span');
      expect(header.textContent).toContain('$90.00');
      expect(header.textContent).not.toContain('Incoming');
      expect(header.textContent).not.toContain('Outgoing');
    });

    it('a close control returns from the open list to no list open', async () => {
      const cluster = [tributaryAt({ id: 'a', x: 10 }), tributaryAt({ id: 'b', x: 11 })];
      const { fixture } = await createComponent(cluster, 60);

      tap(fixture, '.tributary-arrow.group');
      expect(fixture.nativeElement.querySelector('.group-list')).toBeTruthy();

      tap(fixture, '.group-list-close');

      expect(fixture.nativeElement.querySelector('.group-list')).toBeNull();
      expect(fixture.nativeElement.querySelector('.tributary-arrow.group')).toBeTruthy();
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

      tap(fixture, '.tributary-arrow');

      expect(emitted).toHaveBeenCalledTimes(1);
    });
  });

  describe('color encoding (#77 — Signed Balance color ribbon; #100 — smooth per-hue-run gradients)', () => {
    it('renders a run of same-hue days as one gradient-filled band polygon, never the old width-based segments', async () => {
      const flatPoints: BandPoint[] = [point(0, 100), point(1, 100), point(2, 100)];
      const { fixture } = await createComponent([], 2, { points: flatPoints, boundaryX: 10 });

      expect(fixture.nativeElement.querySelectorAll('.segment').length).toBe(0);
      expect(fixture.nativeElement.querySelectorAll('.band-fill').length).toBe(1);
    });

    it(
      'renders same-hue days with differing balances as one gradient-filled polygon carrying each ' +
        "day's own distinct opacity as a stop, not separate per-day polygons — the smooth-gradient " +
        'replacement (#100) for the old flat per-day fill',
      async () => {
        const rampingPoints: BandPoint[] = [point(0, 0), point(1, 2500), point(2, 5000)];
        const { fixture } = await createComponent([], 3, { points: rampingPoints, boundaryX: 10 });

        const fills: SVGPolygonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.band-fill'));
        expect(fills).toHaveLength(1);

        const opacities = stopOpacities(gradientFor(fixture, fills[0]));
        expect(opacities).toHaveLength(3);
        expect(new Set(opacities).size).toBe(3); // three genuinely distinct per-day opacities
      },
    );

    it('renders two adjacent days with genuinely different hues as two separate, distinctly-edged polygons', async () => {
      const differingPoints: BandPoint[] = [point(0, 1000), point(1, -1000), point(2, -1000)];
      const { fixture } = await createComponent([], 2, { points: differingPoints, boundaryX: 10 });

      expect(fixture.nativeElement.querySelectorAll('.band-fill').length).toBe(2);
    });

    it(
      "gives two StreamBand instances non-colliding gradient ids, so one lane's gradient defs " +
        "can't silently paint another lane's polygon (#100) — both an account lane and the " +
        'multi-account Total lane render at once through this shared component',
      async () => {
        const points: BandPoint[] = [point(0, 1000), point(1, 1000)];
        const { fixture: fixtureA } = await createComponent([], 2, { points, boundaryX: 10 });
        const { fixture: fixtureB } = await createComponent([], 2, { points, boundaryX: 10 });

        const fillA: SVGPolygonElement = fixtureA.nativeElement.querySelector('.band-fill');
        const fillB: SVGPolygonElement = fixtureB.nativeElement.querySelector('.band-fill');

        expect(fillA.getAttribute('fill')).not.toBe(fillB.getAttribute('fill'));
      },
    );

    it('renders the positive (blue) hue for a positive Signed Balance on an Asset account', async () => {
      const { fixture } = await createComponent([], 2, {
        points: [point(0, 1000), point(1, 1000)],
        boundaryX: 10,
        expectedSign: 1,
      });

      const fill: SVGPolygonElement = fixture.nativeElement.querySelector('.band-fill');
      const stops = gradientFor(fixture, fill).querySelectorAll('.gradient-stop');
      expect(stops.length).toBeGreaterThan(0);
      expect(Array.from(stops).every((s) => s.classList.contains('positive'))).toBe(true);
      expect(Array.from(stops).some((s) => s.classList.contains('negative'))).toBe(false);
    });

    it('renders the negative (brown) hue for a negative Signed Balance on an Asset account', async () => {
      const { fixture } = await createComponent([], 2, {
        points: [point(0, -1000), point(1, -1000)],
        boundaryX: 10,
        expectedSign: 1,
      });

      const fill: SVGPolygonElement = fixture.nativeElement.querySelector('.band-fill');
      const stops = gradientFor(fixture, fill).querySelectorAll('.gradient-stop');
      expect(Array.from(stops).every((s) => s.classList.contains('negative'))).toBe(true);
      expect(Array.from(stops).some((s) => s.classList.contains('positive'))).toBe(false);
    });

    it('reads a Liability account through Signed Balance — a negative raw balance (as expected) renders positive', async () => {
      const { fixture } = await createComponent([], 2, {
        points: [point(0, -1000), point(1, -1000)],
        boundaryX: 10,
        expectedSign: -1,
      });

      const fill: SVGPolygonElement = fixture.nativeElement.querySelector('.band-fill');
      const stops = gradientFor(fixture, fill).querySelectorAll('.gradient-stop');
      expect(Array.from(stops).every((s) => s.classList.contains('positive'))).toBe(true);
    });

    it('reads a Liability account whose raw balance is opposite of expected (positive) as the negative hue', async () => {
      const { fixture } = await createComponent([], 2, {
        points: [point(0, 1000), point(1, 1000)],
        boundaryX: 10,
        expectedSign: -1,
      });

      const fill: SVGPolygonElement = fixture.nativeElement.querySelector('.band-fill');
      const stops = gradientFor(fixture, fill).querySelectorAll('.gradient-stop');
      expect(Array.from(stops).every((s) => s.classList.contains('negative'))).toBe(true);
    });

    it("ramps a gradient stop's opacity linearly with |Signed Balance| against the flat $5000 domain, clamped past it", async () => {
      const { fixture } = await createComponent([], 4, {
        points: [point(0, 0), point(1, 2500), point(2, 5000), point(3, 50000)],
        boundaryX: 10,
        expectedSign: 1,
      });

      // every point is >= 0 (positive hue), so the whole series is one run/gradient/polygon.
      const fills: SVGPolygonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.band-fill'));
      expect(fills).toHaveLength(1);
      const opacities = stopOpacities(gradientFor(fixture, fills[0]));

      expect(opacities[0]).toBeCloseTo(0.05); // balance 0
      expect(opacities[1]).toBeCloseTo(0.525); // balance 2500 -> halfway
      expect(opacities[2]).toBeCloseTo(1.0); // balance 5000 -> full
      expect(opacities[3]).toBeCloseTo(1.0); // balance 50000 -> clamped
    });

    it('renders exactly one white backing rect sized to the constant band', async () => {
      const { fixture } = await createComponent([], 2);

      const backingRects = fixture.nativeElement.querySelectorAll('.band-backing');
      expect(backingRects.length).toBe(1);
      expect(Number(backingRects[0].getAttribute('width'))).toBe(2);
      expect(Number(backingRects[0].getAttribute('height'))).toBeGreaterThan(0);
    });

    it("anchors tributaries to a fixed edge regardless of each point's own balance magnitude", async () => {
      const varyingPoints: BandPoint[] = [point(0, 100), point(5, 100000)];
      const lowBalanceTrib = tributaryAt({ id: 'low', x: 0, direction: 'in' });
      const highBalanceTrib = tributaryAt({ id: 'high', x: 5, direction: 'in' });

      const { component } = await createComponent([lowBalanceTrib, highBalanceTrib], 10, {
        points: varyingPoints,
        boundaryX: 10,
      });

      const arrows = component['tributaryArrowGeometry']();
      const low = arrows.find((a: { id: string }) => a.id === 'low')!;
      const high = arrows.find((a: { id: string }) => a.id === 'high')!;

      expect(low.anchorY).toBeCloseTo(high.anchorY);
    });
  });

  describe("Total lane's own color palette/domain (#79)", () => {
    it("defaults to the 'account' palette — no .total class on a plain color-encoded band's gradient stops", async () => {
      const { fixture } = await createComponent([], 2, {
        points: [point(0, 1000), point(1, 1000)],
        boundaryX: 10,
      });

      const fill: SVGPolygonElement = fixture.nativeElement.querySelector('.band-fill');
      const stops = gradientFor(fixture, fill).querySelectorAll('.gradient-stop');
      expect(Array.from(stops).some((s) => s.classList.contains('total'))).toBe(false);
    });

    it("marks every gradient stop with .total when colorPalette is 'total'", async () => {
      const { fixture } = await createComponent([], 4, {
        points: [point(0, 1000), point(1, -1000), point(2, 500), point(3, -500)],
        boundaryX: 10,
        colorPalette: 'total',
        colorDomain: 1000,
      });

      const stops: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.gradient-stop');
      expect(stops.length).toBeGreaterThan(0);
      expect(Array.from(stops).every((el) => el.classList.contains('total'))).toBe(true);
    });

    it('reaches full opacity at 80% of colorDomain for the total palette, not 100% — and clamps identically past it, merging into one polygon', async () => {
      const { fixture } = await createComponent([], 3, {
        points: [point(0, 800), point(1, 1000), point(2, 400)],
        boundaryX: 10,
        colorPalette: 'total',
        colorDomain: 1000,
        expectedSign: 1,
      });

      const fills: SVGPolygonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.band-fill'));
      // balance 800 (80% of the 1000 domain) and 1000 (past it, clamped) both reach the same full
      // opacity and share a hue, so their two segments merge into one gradient-filled polygon
      // (#100) rather than two identically-colored ones — point 2 (400) never leads a segment in
      // a 3-point series, so the sub-ceiling ramp is covered by balance-color.spec.ts instead.
      expect(fills).toHaveLength(1);
      const opacities = stopOpacities(gradientFor(fixture, fills[0]));
      expect(opacities[0]).toBeCloseTo(1.0);
    });

    it("carries over the account palette's raised 0.2 negative floor, unlike its shared positive one", async () => {
      const { fixture } = await createComponent([], 2, {
        points: [point(0, -1), point(1, -1)],
        boundaryX: 10,
        colorPalette: 'total',
        colorDomain: 1000,
        expectedSign: 1,
      });

      const fill: SVGPolygonElement = fixture.nativeElement.querySelector('.band-fill');
      const stops = gradientFor(fixture, fill).querySelectorAll('.gradient-stop');
      expect(Array.from(stops).every((s) => s.classList.contains('negative'))).toBe(true);
      expect(stopOpacities(gradientFor(fixture, fill))[0]).toBeCloseTo(0.2);
    });
  });

  describe('projected-region overlay (replaces the old opacity-based marker)', () => {
    it('renders no band-fill polygon or gradient stop with reduced opacity for the projected phase — magnitude opacity is untouched by phase', async () => {
      const { fixture } = await createComponent([], 3, {
        points: [point(0, 5000), point(1, 5000), point(2, 5000)],
        boundaryX: 1,
        expectedSign: 1,
      });

      const fills: SVGPolygonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.band-fill'));
      // every day ramps purely by its own balance — none carry a `.projected` class/opacity dip anymore.
      expect(fills.every((el) => !el.classList.contains('projected'))).toBe(true);
      for (const fill of fills) {
        for (const opacity of stopOpacities(gradientFor(fixture, fill))) {
          expect(opacity).toBeCloseTo(1.0); // flat $5000 balance throughout -> ceiling, unaffected by boundaryX
        }
      }
    });

    it('positions a single overlay rectangle spanning from boundaryX to the right edge, at the band\'s fixed top/bottom', async () => {
      const { fixture } = await createComponent([], 10, {
        points: [point(0, 100), point(9, 100)],
        boundaryX: 6,
      });

      const overlay: HTMLElement = fixture.nativeElement.querySelector('.projected-overlay');
      expect(overlay).toBeTruthy();
      expect(parseFloat(overlay.style.left)).toBeCloseTo(60); // 6/10 -> 60%
      expect(parseFloat(overlay.style.width)).toBeCloseTo(40); // (10-6)/10 -> 40%
    });

    it('renders no overlay when the boundary is at or past the right edge — nothing in view is projected', async () => {
      const { fixture } = await createComponent([], 10, {
        points: [point(0, 100), point(9, 100)],
        boundaryX: 10,
      });

      expect(fixture.nativeElement.querySelector('.projected-overlay')).toBeNull();
    });

    it('spans the full width when the boundary is at or before the left edge — everything in view is projected', async () => {
      const { fixture } = await createComponent([], 10, {
        points: [point(0, 100), point(9, 100)],
        boundaryX: 0,
      });

      const overlay: HTMLElement = fixture.nativeElement.querySelector('.projected-overlay');
      expect(parseFloat(overlay.style.left)).toBeCloseTo(0);
      expect(parseFloat(overlay.style.width)).toBeCloseTo(100);
    });
  });

  describe('tributary stroke width against a stable domain (issue #74)', () => {
    it("sizes a tributary's stroke against the color-curve domain, not the other tributaries currently in view", async () => {
      const small = tributaryAt({ id: 'small', amount: 100 });
      const big = tributaryAt({ id: 'big', amount: 4000, x: 60 });

      const { component: alone } = await createComponent([small]);
      const { component: withBigNeighbor } = await createComponent([small, big]);

      const strokeAlone = alone['tributaryArrowGeometry']().find((a: { id: string }) => a.id === 'small')!
        .strokeWidth;
      const strokeWithNeighbor = withBigNeighbor['tributaryArrowGeometry']().find(
        (a: { id: string }) => a.id === 'small',
      )!.strokeWidth;

      expect(strokeWithNeighbor).toBe(strokeAlone);
    });

    it('never renders a stroke thinner than the 1px floor, even for a tiny amount against a large domain', async () => {
      const tiny = tributaryAt({ id: 'tiny', amount: 1 });

      const { component } = await createComponent([tiny]);

      expect(component['tributaryArrowGeometry']().find((a: { id: string }) => a.id === 'tiny')!.strokeWidth).toBe(
        1,
      );
    });
  });
});
