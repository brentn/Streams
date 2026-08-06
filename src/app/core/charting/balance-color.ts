import { Sign } from '../models/account';
import { BandPoint } from './band-segments';

/**
 * Flat color domain for the per-account balance ribbon — deliberately not per-account and not
 * relative to the currently-visible scrub window, so a fuller account reads visually fuller than
 * a near-empty one rather than every account normalizing to fill its own scale. See ADR-0009.
 */
export const BALANCE_COLOR_DOMAIN = 5000;

/**
 * Opacity floor per hue at a zero-magnitude Signed Balance, and the shared ceiling at/past the
 * domain. The negative (brown) floor sits higher than the positive (blue) one — brown read as
 * too faint/washed-out at the same low floor blue uses, at the same |Signed Balance| ratio.
 */
const OPACITY_FLOOR_POSITIVE = 0.05;
const OPACITY_FLOOR_NEGATIVE = 0.2;
const OPACITY_CEILING = 1.0;

/** Fraction of the Total lane's own domain at which opacity reaches the ceiling — the top 20% of its range all reads as the same fully-saturated color, so the domain doesn't need its own headroom above the largest total the app is likely to show. See ADR-0009. */
export const TOTAL_OPACITY_CEILING_RATIO = 0.8;

/** Parameters of the opacity ramp described in `balanceColorSegment` — everything that differs between the individual-account treatment and the Total lane's (#79). */
export interface ColorCurve {
  domain: number;
  /** Opacity reaches `1.0` at `domain * ceilingRatio`, not necessarily at `domain` itself. */
  ceilingRatio: number;
  positiveFloor: number;
  negativeFloor: number;
}

/** The individual-account curve (#77/#78): flat `$5000` domain, ceiling at the domain itself, brown's floor raised above blue's — see ADR-0009. */
export const ACCOUNT_COLOR_CURVE: ColorCurve = {
  domain: BALANCE_COLOR_DOMAIN,
  ceilingRatio: 1,
  positiveFloor: OPACITY_FLOOR_POSITIVE,
  negativeFloor: OPACITY_FLOOR_NEGATIVE,
};

/**
 * The Total lane's curve (#79): `domain` is computed by the caller once over the full
 * scrubbable range (not the flat $5000), and the ceiling sits at 80% of that domain. Carries
 * over the account curve's raised negative floor rather than sharing the low positive one —
 * red read as washed-out at the same floor blue/green use, same problem brown's raised floor
 * already solves, confirmed against a rendered swatch before shipping this asymmetric-in-either-
 * curve floor split.
 */
export function totalColorCurve(domain: number): ColorCurve {
  return {
    domain,
    ceilingRatio: TOTAL_OPACITY_CEILING_RATIO,
    positiveFloor: OPACITY_FLOOR_POSITIVE,
    negativeFloor: OPACITY_FLOOR_NEGATIVE,
  };
}

export type BalanceHue = 'positive' | 'negative';

export interface BalanceColorSegment {
  hue: BalanceHue;
  opacity: number;
}

/** A balance reoriented by the account's Expected Sign, so "as expected" always reads positive — see CONTEXT.md's Signed Balance. */
export function signedBalance(balance: number, expectedSign: Sign): number {
  return balance * expectedSign;
}

/**
 * Solid-hue opacity for a balance against `curve`'s domain: linear from the hue's own floor to
 * `1.0` as `|Signed Balance| / (domain * ceilingRatio)` goes `0` to `1`, clamped past `1`. Hue
 * flips abruptly at the zero crossing (a zero Signed Balance counts as `'positive'`) rather than
 * blending through the floor. Defaults to the individual-account curve so #77/#78 callers are
 * unaffected; the Total lane (#79) passes `totalColorCurve(...)` instead.
 */
export function balanceColorSegment(
  balance: number,
  expectedSign: Sign,
  curve: ColorCurve = ACCOUNT_COLOR_CURVE,
): BalanceColorSegment {
  const signed = signedBalance(balance, expectedSign);
  const hue: BalanceHue = signed >= 0 ? 'positive' : 'negative';
  const floor = hue === 'positive' ? curve.positiveFloor : curve.negativeFloor;
  const ceiling = curve.domain * curve.ceilingRatio;
  const ratio = ceiling <= 0 ? (Math.abs(signed) > 0 ? 1 : 0) : Math.min(1, Math.abs(signed) / ceiling);
  const opacity = floor + ratio * (OPACITY_CEILING - floor);
  return { hue, opacity };
}

export interface BalancePointSegment {
  points: [BandPoint, BandPoint];
  hue: BalanceHue;
  opacity: number;
}

/**
 * One segment per consecutive point pair, colored by the segment's own leading balance — every
 * day gets its own exact hue/opacity rather than a handful of fixed range buckets. The raw
 * per-day building block `hueRunsByPoint` groups into gradient runs for `StreamBand`; see
 * ADR-0009.
 */
export function segmentsByPoint(
  points: BandPoint[],
  expectedSign: Sign,
  curve: ColorCurve = ACCOUNT_COLOR_CURVE,
): BalancePointSegment[] {
  const segments: BalancePointSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const { hue, opacity } = balanceColorSegment(points[i].balance, expectedSign, curve);
    segments.push({ points: [points[i], points[i + 1]], hue, opacity });
  }
  return segments;
}

/** One day's exact opacity at its real x-position, along a `HueRun`'s gradient. */
export interface GradientStop {
  x: number;
  opacity: number;
}

export interface HueRun {
  points: BandPoint[];
  hue: BalanceHue;
  stops: GradientStop[];
}

/**
 * Groups consecutive same-*hue* segments from `segmentsByPoint` into one run — unlike the
 * superseded `mergeAdjacentSegments`, this is same-hue only, not same-hue-*and*-same-opacity:
 * every day keeps its own exact opacity rather than being flattened to a shared value, carried as
 * a `GradientStop` at that day's real x-position. `StreamBand` paints each run as a single
 * `<linearGradient>`-filled polygon whose stops interpolate continuously between days, so unlike
 * a flat per-day fill, two adjacent days can differ in opacity with no internal polygon edge
 * between them at all — only a genuine hue flip still produces a separate shape. Validated in the
 * `smooth` variant of the `prototype/gradient-stream-fill` throwaway branch. See ADR-0009.
 */
export function hueRunsByPoint(
  points: BandPoint[],
  expectedSign: Sign,
  curve: ColorCurve = ACCOUNT_COLOR_CURVE,
): HueRun[] {
  const segments = segmentsByPoint(points, expectedSign, curve);
  if (segments.length === 0) return [];

  const runs: BalancePointSegment[][] = [];
  for (const segment of segments) {
    const last = runs[runs.length - 1];
    if (last && last[0].hue === segment.hue) last.push(segment);
    else runs.push([segment]);
  }

  return runs.map((run) => {
    const leadingStops = run.map((segment) => ({ x: segment.points[0].x, opacity: segment.opacity }));
    const lastSegment = run[run.length - 1];
    const trailingOpacity = balanceColorSegment(lastSegment.points[1].balance, expectedSign, curve).opacity;
    const stops = [...leadingStops, { x: lastSegment.points[1].x, opacity: trailingOpacity }];
    const runPoints = run.map((segment) => segment.points[0]).concat(lastSegment.points[1]);
    return { points: runPoints, hue: run[0].hue, stops };
  });
}
