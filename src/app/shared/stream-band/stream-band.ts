import { Component, computed, input, output, signal } from '@angular/core';
import { Sign } from '../../core/models/account';
import { BandPoint } from '../../core/charting/band-segments';
import { magnitudeScale, ribbonPoints } from '../../core/charting/ribbon';
import { buildRenderSegments } from '../../core/charting/render-segments';
import { Tributary } from '../../core/charting/tributaries';
import { buildTributaryBundles } from '../../core/charting/tributary-bundles';
import {
  bundleId,
  clusterTributaries,
  spreadExactDateCollisions,
  zoomRangeFor,
} from '../../core/charting/tributary-clusters';
import { buildTributaryLines } from '../../core/charting/tributary-lines';

/** Cap on a tributary line's stroke width, independent of the balance ribbon's own thickness scale. */
const MAX_TRIBUTARY_STROKE_WIDTH = 6;

/**
 * One thickness-band stream: `|balance|` as line thickness around a flat
 * centerline, never zero-floored. The actual portion renders solid; the
 * projected portion renders dashed at reduced opacity. Whichever portion sits
 * on the opposite of `expectedSign` renders in the brown accent regardless of
 * phase. Shared by `account-stream` (single, tall) and the multi-account view
 * (many, short, plus the neutral-ink Total lane) — see docs/ux-spec.md.
 */
@Component({
  selector: 'app-stream-band',
  templateUrl: './stream-band.html',
  styleUrl: './stream-band.css',
})
export class StreamBand {
  readonly points = input.required<BandPoint[]>();
  readonly expectedSign = input<Sign>(1);
  readonly boundaryX = input.required<number>();
  readonly maxAbsBalance = input.required<number>();
  readonly viewWidth = input.required<number>();
  readonly height = input(120);
  /** 'expected'-side segments render accent green for an account, neutral ink for the Total lane. */
  readonly expectedColor = input<'accent' | 'neutral'>('accent');
  /** Real Flow/Transfer occurrences to render as tributaries joining/leaving the river — absent for the multi-account view's lanes. */
  readonly tributaries = input<Tributary[]>([]);
  /** Cap on the ribbon's total thickness, as a fraction of `height` — reserves vertical margin above/below for tributaries to lean into. Defaults to no cap (the ribbon may fill the full height, as the multi-account view's lanes do). */
  readonly maxThicknessFraction = input(1);
  /** The source Tributary a user clicked its line to open — for drill-in (issue #65). The label stays `pointer-events: none` (see `stream-band.css`), so only the line itself is clickable. */
  readonly tributaryClick = output<Tributary>();

  protected readonly centerY = computed(() => this.height() / 2);

  private readonly halfThickness = computed(() =>
    magnitudeScale(this.maxAbsBalance(), (this.maxThicknessFraction() * this.height()) / 2),
  );

  protected readonly segments = computed(() => {
    const scale = this.halfThickness();
    return buildRenderSegments(this.points(), this.expectedSign(), this.boundaryX()).map(
      (segment) => ({
        ...segment,
        polygon: ribbonPoints(segment.points, this.centerY(), scale),
      }),
    );
  });

  private readonly maxTributaryAmount = computed(() =>
    this.tributaries().reduce((max, t) => Math.max(max, t.amount), 0),
  );

  /** The ribbon's own half-thickness at a given x — where a tributary joins/leaves its edge, not the flat centerline. */
  private readonly halfThicknessAt = computed(() => {
    const balanceByX = new Map(this.points().map((p) => [p.x, p.balance]));
    const scale = this.halfThickness();
    return (x: number) => scale(balanceByX.get(x) ?? 0);
  });

  private readonly strokeScale = computed(() =>
    magnitudeScale(this.maxTributaryAmount(), MAX_TRIBUTARY_STROKE_WIDTH),
  );

  private readonly clusters = computed(() => clusterTributaries(this.tributaries()));

  /**
   * Set when a bundle is tapped, to auto-zoom into that cluster's neighborhood — cleared by
   * the close control to return to the default full-window view (see issue #66). Also clears
   * implicitly on the next read if the underlying data changes such that no current cluster
   * matches it (`expandedCluster` falls back to `null`).
   */
  private readonly expandedBundleId = signal<string | null>(null);

  private readonly expandedCluster = computed(() => {
    const id = this.expandedBundleId();
    if (id === null) return null;
    return this.clusters().find((cluster) => bundleId(cluster) === id) ?? null;
  });

  protected readonly isZoomed = computed(() => this.expandedCluster() !== null);

  /** The SVG's visible x-range: the full window by default, or a tapped cluster's neighborhood (`zoomRangeFor`) once expanded. */
  private readonly zoomRange = computed(() => {
    const cluster = this.expandedCluster();
    return cluster ? zoomRangeFor(cluster, this.viewWidth()) : { lo: 0, hi: this.viewWidth() };
  });

  protected readonly viewBox = computed(() => {
    const { lo, hi } = this.zoomRange();
    return `${lo} 0 ${hi - lo} ${this.height()}`;
  });

  /** Every cluster still collapsed — all but the one currently expanded, if any. */
  protected readonly bundles = computed(() => {
    const expandedId = this.expandedBundleId();
    const collapsed = this.clusters().filter(
      (cluster) => cluster.length > 1 && bundleId(cluster) !== expandedId,
    );
    return buildTributaryBundles(collapsed, this.centerY(), this.halfThicknessAt(), this.strokeScale());
  });

  /**
   * Tributaries rendered as individual lines: every uncrowded singleton, plus the currently
   * expanded cluster's members with their exact-date collisions spread apart (see #59's
   * amendments) — zooming alone can't separate two items sharing an identical x.
   */
  private readonly individualTributaries = computed<Tributary[]>(() => {
    const expandedId = this.expandedBundleId();
    return this.clusters().flatMap((cluster) => {
      if (cluster.length === 1) return cluster;
      if (bundleId(cluster) === expandedId) return spreadExactDateCollisions(cluster);
      return [];
    });
  });

  protected readonly tributaryLines = computed(() =>
    buildTributaryLines(this.individualTributaries(), this.centerY(), this.halfThicknessAt(), this.strokeScale()),
  );

  private readonly tributariesById = computed(() => new Map(this.tributaries().map((t) => [t.id, t])));

  /** Bundle vs. individual-tributary click stay distinct: an unbundled tributary drills in (#65); a bundle zooms in instead — see `onBundleClick`. */
  protected onTributaryClick(lineId: string): void {
    const tributary = this.tributariesById().get(lineId);
    if (tributary) this.tributaryClick.emit(tributary);
  }

  protected onBundleClick(id: string): void {
    this.expandedBundleId.set(id);
  }

  protected closeZoom(): void {
    this.expandedBundleId.set(null);
  }

  /**
   * Converts an SVG-space (x, y) into the overlay's percentage coordinates, relative to the
   * current visible x-range (`zoomRange`, not the fixed full window, so it tracks the zoomed-in
   * view) and the fixed height. Shared by tributary name labels and bundle count badges — both
   * plain HTML overlays rather than SVG text/shapes, since the chart's non-uniform x/y scaling
   * (`preserveAspectRatio="none"`) stretches SVG glyphs into an illegible horizontal smear and
   * would distort a circular badge into an ellipse.
   */
  private readonly toPercent = computed(() => {
    const { lo, hi } = this.zoomRange();
    const width = hi - lo;
    const height = this.height();
    return (x: number, y: number) => ({
      leftPercent: ((x - lo) / width) * 100,
      topPercent: (y / height) * 100,
    });
  });

  protected readonly tributaryLabels = computed(() => {
    const toPercent = this.toPercent();
    return this.tributaryLines().map((line) => ({
      id: line.id,
      text: line.label,
      ...toPercent(line.labelX, line.labelY),
    }));
  });

  protected readonly bundleBadges = computed(() => {
    const toPercent = this.toPercent();
    return this.bundles().map((bundle) => ({
      id: bundle.id,
      count: bundle.count,
      ...toPercent(bundle.badgeX, bundle.badgeY),
    }));
  });
}
