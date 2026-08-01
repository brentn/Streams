import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { Sign } from '../../core/models/account';
import { segmentsByPoint } from '../../core/charting/balance-color';
import { BandPoint } from '../../core/charting/band-segments';
import { magnitudeScale, ribbonPoints } from '../../core/charting/ribbon';
import { BandPhase, buildRenderSegments } from '../../core/charting/render-segments';
import { splitAtX } from '../../core/charting/split-at-x';
import { Tributary } from '../../core/charting/tributaries';
import { buildTributaryBundles } from '../../core/charting/tributary-bundles';
import { bundleId, clusterTributaries, flattenGroupMembers } from '../../core/charting/tributary-clusters';
import { buildTributaryLines } from '../../core/charting/tributary-lines';
import { applyMinorRollup } from '../../core/charting/tributary-minor-rollup';

/** Cap on a tributary line's stroke width, independent of the balance ribbon's own thickness scale. */
const MAX_TRIBUTARY_STROKE_WIDTH = 6;

/** A `'color'`-encoded band's fixed half-thickness, as a fraction of the max the width encoding could reach — validated in the `prototype/balance-color-stream` throwaway prototype (see ADR-0009). Fixed rather than magnitude-scaled, since the whole point of the color encoding is to stop the band's thickness moving. */
const CONSTANT_HALF_THICKNESS_FRACTION = 0.7;

/** Minimum gap kept between an open group-list panel and the specific badge that opened it, so a second tap at the badge's old position can't land on a list row instead — see `expandedGroupMembers`. */
const GROUP_LIST_CLEARANCE = '1.75rem';

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
  imports: [CurrencyPipe, DatePipe],
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
  /**
   * Which of two ways this instance renders `|balance|`: `'width'` (the original,
   * magnitude-scaled thickness — still used by `multi-account-stream`) or `'color'` (constant
   * width, Signed Balance encoded as fill hue/opacity instead — used by `account-stream`, see
   * ADR-0009). Defaults to `'width'` so every existing caller is unaffected.
   */
  readonly encoding = input<'width' | 'color'>('width');

  protected readonly centerY = computed(() => this.height() / 2);

  private readonly widthScale = computed(() =>
    magnitudeScale(this.maxAbsBalance(), (this.maxThicknessFraction() * this.height()) / 2),
  );

  private readonly constantHalfThickness = computed(
    () => (this.maxThicknessFraction() * this.height() * CONSTANT_HALF_THICKNESS_FRACTION) / 2,
  );

  /** The half-thickness function actually used to draw the ribbon and to anchor tributaries — magnitude-scaled for `'width'`, fixed for `'color'` (so a tributary's join point no longer tapers with its neighboring balance — see ADR-0009). */
  private readonly halfThickness = computed(() => {
    if (this.encoding() === 'color') {
      const constant = this.constantHalfThickness();
      return () => constant;
    }
    return this.widthScale();
  });

  protected readonly viewBox = computed(() => `0 0 ${this.viewWidth()} ${this.height()}`);

  protected readonly segments = computed(() => {
    const scale = this.halfThickness();
    return buildRenderSegments(this.points(), this.expectedSign(), this.boundaryX()).map(
      (segment) => ({
        ...segment,
        polygon: ribbonPoints(segment.points, this.centerY(), scale),
      }),
    );
  });

  /**
   * `'color'` encoding: one flat-filled polygon per consecutive point pair, colored by its own
   * Signed Balance (see `segmentsByPoint`) rather than a width-based segment run — each day gets
   * its own exact hue/opacity, so a sign crossing needs no special segmentation of its own the
   * way `segmentBandBySign` requires for the width encoding.
   */
  protected readonly colorSegments = computed(() => {
    if (this.encoding() !== 'color') return [];
    const scale = this.halfThickness();
    const { before, after } = splitAtX(this.points(), this.boundaryX());
    const build = (pts: BandPoint[], phase: BandPhase) =>
      segmentsByPoint(pts, this.expectedSign()).map((segment) => ({
        phase,
        hue: segment.hue,
        opacity: segment.opacity,
        polygon: ribbonPoints(segment.points, this.centerY(), scale),
      }));
    return [...build(before, 'actual'), ...build(after, 'projected')];
  });

  /**
   * `'color'` encoding: an explicit white backing rect behind every day's translucent fill, so
   * the opacity-compositing math reproduces white-mixing identically in both light and dark mode
   * rather than blending toward the page's actual (near-black, in dark mode) surface — see
   * ADR-0009. Literal white (not a `--color-*` token) is deliberate: the point is a fixed
   * compositing basis that does *not* follow the theme.
   */
  protected readonly colorBandEdges = computed(() => {
    if (this.encoding() !== 'color') return null;
    const half = this.constantHalfThickness();
    const centerY = this.centerY();
    return { top: centerY - half, bottom: centerY + half, height: 2 * half };
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

  /**
   * Magnitude-based rollup (#67) runs before proximity clustering (#66), per #67's recommended
   * composition order — the resulting per-direction minor aggregate is just another Tributary
   * as far as clustering is concerned, and may itself end up folded into a proximity cluster
   * alongside real (major) occurrences.
   */
  private readonly rolledUpTributaries = computed(() => applyMinorRollup(this.tributaries()));

  private readonly clusters = computed(() => clusterTributaries(this.rolledUpTributaries()));

  /**
   * A "group" is anything rendered as a stand-in line with a ×N badge rather than as its own
   * labeled line: a proximity cluster of 2+ (#66), or a single `kind: 'minor'` magnitude rollup
   * (#67) standing in for its own 2+ real members. Both behave identically —
   * tapping shows a plain name+date+amount list of the group's real underlying Tributaries
   * (`flattenGroupMembers`), never a zoom or a fanned re-layout of lines. (An earlier version
   * auto-zoomed into a #66 cluster's neighborhood instead; that was reverted — see #59's
   * follow-up amendment — since it distorted the chart under the SVG's non-uniform
   * `preserveAspectRatio="none"` scaling and needlessly diverged from #67's own list-only
   * interaction for the exact same "too many/too tight to show as lines" problem.)
   */
  private readonly groupClusters = computed(() =>
    this.clusters().filter((cluster) => cluster.length > 1 || cluster[0].kind === 'minor'),
  );

  protected readonly groups = computed(() =>
    buildTributaryBundles(this.groupClusters(), this.centerY(), this.halfThicknessAt(), this.strokeScale()),
  );

  /** Every tributary rendered as its own labeled line: singletons that aren't a magnitude rollup. */
  private readonly individualTributaries = computed<Tributary[]>(() =>
    this.clusters()
      .filter((cluster) => cluster.length === 1 && cluster[0].kind !== 'minor')
      .flat(),
  );

  protected readonly tributaryLines = computed(() =>
    buildTributaryLines(this.individualTributaries(), this.centerY(), this.halfThicknessAt(), this.strokeScale()),
  );

  private readonly tributariesById = computed(() => new Map(this.tributaries().map((t) => [t.id, t])));

  /** An individual (ungrouped) tributary's line click drills in (#65); a group's click never does — see `onGroupClick`. */
  private onTributaryClick(lineId: string): void {
    const tributary = this.tributariesById().get(lineId);
    if (tributary) this.tributaryClick.emit(tributary);
  }

  /**
   * The account-stream chart wraps this component in `appDragScrub`, whose `setPointerCapture`
   * call (needed for drag-to-scrub) retargets the browser's own `click` event to the capturing
   * `.chart` div instead of whatever tributary/group element the pointer actually landed on. Its
   * `preventDefault()` on pointerdown is meant to stop the browser synthesizing that click at
   * all, but that's not reliable across every browser/input device — so rather than risk a
   * native `(click)` binding *also* firing and double-dispatching the same tap (observed in
   * practice as the group list flickering open then immediately shut), this component has no
   * native click bindings of its own at all. `DragScrub`'s `tap` output, carrying the
   * pointerdown's real target, is the *only* interaction channel — a DragScrub-wrapped consumer
   * forwards it here; this method resolves the target back to the tributary/group/list-row it
   * belongs to via `data-*` attributes and dispatches exactly once.
   */
  handleTap(target: HTMLElement): void {
    // `.closest()`, not a direct `dataset` read: the real pointerdown target can be a child of
    // the marked element (e.g. one of a group-list row's `<span>`s), not the marked element
    // itself.
    if (target.closest('[data-group-close]')) {
      this.closeGroupList();
      return;
    }
    const memberRow = target.closest<HTMLElement>('[data-group-member-id]');
    if (memberRow) {
      this.onGroupMemberClick(memberRow.dataset['groupMemberId']!);
      return;
    }
    const group = target.closest<HTMLElement>('[data-group-id]');
    if (group) {
      this.onGroupClick(group.dataset['groupId']!);
      return;
    }
    const tributary = target.closest<HTMLElement>('[data-tributary-id]');
    if (tributary) {
      this.onTributaryClick(tributary.dataset['tributaryId']!);
    }
  }

  /** Set to whichever group's list is open — at most one at a time. Self-heals to closed if the underlying data changes such that no current group matches it (`expandedGroupMembers` falls back to `null`). */
  private readonly expandedGroupId = signal<string | null>(null);

  protected onGroupClick(id: string): void {
    this.expandedGroupId.update((current) => (current === id ? null : id));
  }

  protected closeGroupList(): void {
    this.expandedGroupId.set(null);
  }

  /** A row in the open group's list drills straight into that real Tributary (same as clicking its own line would, had it not been collapsed into the group) and closes the list, since drilling in navigates away. */
  protected onGroupMemberClick(id: string): void {
    this.onTributaryClick(id);
    this.closeGroupList();
  }

  private readonly expandedGroup = computed(() => {
    const id = this.expandedGroupId();
    if (id === null) return null;
    return this.groupClusters().find((cluster) => bundleId(cluster) === id) ?? null;
  });

  /**
   * The open list is positioned with guaranteed clearance from the specific badge that opened
   * it (`calc()`, not a fixed chart-edge offset) — a static top/bottom-of-chart anchor isn't
   * reliably far enough from the triggering badge (depends on that badge's own y and the list's
   * content height), so a second tap landing where the badge used to be lands on a list row
   * instead and silently drills into whichever real Tributary happens to render there.
   */
  protected readonly expandedGroupMembers = computed(() => {
    const cluster = this.expandedGroup();
    if (!cluster) return null;
    const direction = cluster[0].direction;
    const badgeTopPercent = this.groupBadges().find((b) => b.id === this.expandedGroupId())?.topPercent ?? 50;
    const verticalStyle =
      direction === 'in'
        ? { top: `calc(${badgeTopPercent}% + ${GROUP_LIST_CLEARANCE})`, bottom: null }
        : { top: null, bottom: `calc(${100 - badgeTopPercent}% + ${GROUP_LIST_CLEARANCE})` };
    return { direction, members: flattenGroupMembers(cluster), verticalStyle };
  });

  /**
   * Converts an SVG-space (x, y) into the overlay's percentage coordinates. Shared by tributary
   * name labels and group count badges — both plain HTML overlays rather than SVG text/shapes,
   * since the chart's non-uniform x/y scaling (`preserveAspectRatio="none"`) stretches SVG
   * glyphs into an illegible horizontal smear and would distort a circular badge into an ellipse.
   */
  private readonly toPercent = computed(() => {
    const width = this.viewWidth();
    const height = this.height();
    return (x: number, y: number) => ({
      leftPercent: (x / width) * 100,
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

  protected readonly groupBadges = computed(() => {
    const toPercent = this.toPercent();
    return this.groups().map((group) => ({
      id: group.id,
      count: group.count,
      ...toPercent(group.badgeX, group.badgeY),
    }));
  });
}
