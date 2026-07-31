import { BandPoint } from './band-segments';

/**
 * PROTOTYPE (issue TBD) — diverging blue/white/brown color-by-balance, explored as an
 * alternative to width-by-balance (see `StreamBand`'s `encoding` input). Not wired into any
 * production path; delete alongside the `gradient`/`bands` encodings if width wins.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLUE: Rgb = { r: 37, g: 99, b: 235 };
const BROWN: Rgb = { r: 140, g: 79, b: 25 };

function mix(a: Rgb, b: Rgb, t: number): string {
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Normalizes `balance` against the window's max magnitude, clamped to [-1, 1]. */
function normalize(balance: number, maxAbsBalance: number): number {
  if (maxAbsBalance <= 0) return 0;
  return Math.max(-1, Math.min(1, balance / maxAbsBalance));
}

/** Balance within this fraction of the window's max magnitude renders as flat white — a true, not just visually-near, zero. */
const DEAD_ZONE = 0.05;
/** The opacity a balance jumps to the instant it leaves the dead zone, so "barely on one side" reads as a clear tint rather than a near-invisible fade from white — see the interaction transcript: extremes were getting lost against a near-white page/card background. */
const OPACITY_FLOOR = 0.1;

/** Blue/white/brown diverging opacity: 0 inside the dead zone, then `OPACITY_FLOOR` the instant a balance is meaningfully on one side, ramping linearly to 1 at the window's max magnitude. */
function divergingOpacity(absT: number): number {
  if (absT < DEAD_ZONE) return 0;
  const eased = (absT - DEAD_ZONE) / (1 - DEAD_ZONE);
  return OPACITY_FLOOR + (1 - OPACITY_FLOOR) * Math.min(1, eased);
}

/** Continuous diverging color for a single balance value: white at zero, blue toward positive, brown toward negative. */
export function balanceColor(balance: number, maxAbsBalance: number): string {
  const t = normalize(balance, maxAbsBalance);
  const opacity = divergingOpacity(Math.abs(t));
  return t >= 0 ? mix(WHITE, BLUE, opacity) : mix(WHITE, BROWN, opacity);
}

export interface GradientStop {
  offsetPercent: number;
  color: string;
}

/** Per-point stops for an SVG `<linearGradient>` spanning the full x domain, so a single constant-width polygon can render a smooth left-to-right color blend. */
export function balanceGradientStops(
  points: BandPoint[],
  maxAbsBalance: number,
  viewWidth: number,
): GradientStop[] {
  if (points.length === 0 || viewWidth <= 0) return [];
  return points.map((p) => ({
    offsetPercent: (p.x / viewWidth) * 100,
    color: balanceColor(p.balance, maxAbsBalance),
  }));
}

export interface BalancePointSegment {
  points: [BandPoint, BandPoint];
  color: string;
}

/**
 * One flat-filled polygon per consecutive point pair, colored by the segment's own leading
 * balance through the same continuous `balanceColor` mapping `balanceGradientStops` uses — every
 * sample gets its own exact color rather than snapping into one of a handful of fixed range
 * buckets, but without an SVG `<linearGradient>`'s interpolation between stops: each segment is a
 * single flat fill, and it's the density of daily samples (not blending) that makes the strip
 * read as continuous.
 *
 * Segments exactly abut (share a vertex) rather than overlap — an earlier attempt at closing the
 * anti-aliasing seam by overlapping adjacent polygons instead produced a visible stripe wherever
 * `.projected`'s `opacity: 0.45` applied, since two overlapping *translucent* layers compound
 * their opacity right at the overlap. `shape-rendering: crispEdges` on the rendered `<polygon>`
 * (see `stream-band.css`) is what actually kills the seam, by turning off anti-aliasing so
 * there's no fractional-coverage edge pixel left to blend in the first place.
 */
export function segmentsByPoint(points: BandPoint[], maxAbsBalance: number): BalancePointSegment[] {
  const segments: BalancePointSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      points: [points[i], points[i + 1]],
      color: balanceColor(points[i].balance, maxAbsBalance),
    });
  }
  return segments;
}
