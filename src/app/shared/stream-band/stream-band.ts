import { Component, computed, input } from '@angular/core';
import { Sign } from '../../core/models/account';
import { BandPoint } from '../../core/charting/band-segments';
import { halfThicknessScale, ribbonPoints } from '../../core/charting/ribbon';
import { buildRenderSegments } from '../../core/charting/render-segments';

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

  protected readonly centerY = computed(() => this.height() / 2);

  private readonly halfThickness = computed(() =>
    halfThicknessScale(this.maxAbsBalance(), this.height() / 2 - 2),
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
}
