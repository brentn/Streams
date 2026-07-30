import { Component, computed, input } from '@angular/core';
import { Sign } from '../../core/models/account';
import { BandPoint } from '../../core/charting/band-segments';
import { magnitudeScale, ribbonPoints } from '../../core/charting/ribbon';
import { buildRenderSegments } from '../../core/charting/render-segments';
import { Tributary } from '../../core/charting/tributaries';
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

  protected readonly centerY = computed(() => this.height() / 2);

  private readonly halfThickness = computed(() =>
    magnitudeScale(this.maxAbsBalance(), this.height() / 2 - 2),
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

  protected readonly tributaryLines = computed(() => {
    const scale = magnitudeScale(this.maxTributaryAmount(), MAX_TRIBUTARY_STROKE_WIDTH);
    return buildTributaryLines(this.tributaries(), this.centerY(), this.halfThicknessAt(), scale);
  });
}
