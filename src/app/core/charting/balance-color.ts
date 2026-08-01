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
 * Solid-hue opacity for a balance against the flat `$5000` domain: linear from the hue's own
 * floor to `1.0` as `|Signed Balance| / domain` goes `0` to `1`, clamped past `1`. Hue flips
 * abruptly at the zero crossing (a zero Signed Balance counts as `'positive'`) rather than
 * blending through the floor.
 */
export function balanceColorSegment(balance: number, expectedSign: Sign): BalanceColorSegment {
  const signed = signedBalance(balance, expectedSign);
  const hue: BalanceHue = signed >= 0 ? 'positive' : 'negative';
  const floor = hue === 'positive' ? OPACITY_FLOOR_POSITIVE : OPACITY_FLOOR_NEGATIVE;
  const ratio = Math.min(1, Math.abs(signed) / BALANCE_COLOR_DOMAIN);
  const opacity = floor + ratio * (OPACITY_CEILING - floor);
  return { hue, opacity };
}

export interface BalancePointSegment {
  points: [BandPoint, BandPoint];
  hue: BalanceHue;
  opacity: number;
}

/**
 * One flat-filled polygon per consecutive point pair, colored by the segment's own leading
 * balance — every day gets its own exact hue/opacity rather than a handful of fixed range
 * buckets, but as a flat fill (not an SVG `<linearGradient>`'s interpolation between stops); see
 * `StreamBand`'s `colorSegments` and ADR-0009.
 */
export function segmentsByPoint(points: BandPoint[], expectedSign: Sign): BalancePointSegment[] {
  const segments: BalancePointSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const { hue, opacity } = balanceColorSegment(points[i].balance, expectedSign);
    segments.push({ points: [points[i], points[i + 1]], hue, opacity });
  }
  return segments;
}
