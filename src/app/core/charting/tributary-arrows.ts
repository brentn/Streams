import { FlowDirection } from '../models/flow';
import { ribbonEdgeY } from './ribbon';
import { Tributary } from './tributaries';

/** How many times a shaft's own thickness its capping tick grows to — ticket #80: "Tick length scales with the shaft's thickness (bigger amount -> taller tick)". */
const TICK_LENGTH_PER_STROKE_WIDTH = 2.5;

/**
 * An individual tributary's rendered geometry, as a plain HTML/CSS overlay anchor rather than SVG
 * path geometry (see #80 and stream-band.css's `.tributary-arrow`): `anchorX`/`anchorY` are the
 * single point where the arrow's tick meets the ribbon's edge — everything else (the shaft's fixed
 * length and guaranteed 45°, the tick's length, and the name label's own position) is expressed as
 * CSS from that one anchor. The label is deliberately *not* given its own SVG-space coordinate: an
 * earlier version leaned it a fixed day/centerY-fraction offset from the anchor, which drifted
 * away from the shaft's actual (fixed-length, CSS-rotated) free end as the window got wider and
 * the chart's `preserveAspectRatio="none"` non-uniform scaling grew more extreme. Nesting the
 * label inside `.arrow-shaft` in the template instead — inheriting the shaft's own real
 * screen-space position/rotation rather than a separately-computed approximation — keeps the two
 * in lockstep at every width.
 */
export interface TributaryArrow {
  id: string;
  direction: FlowDirection;
  label: string;
  anchorX: number;
  anchorY: number;
  strokeWidth: number;
  tickLength: number;
  /** Carried through from the source Tributary (see `withOutstandingTributaries`, #88/#91) — an Outstanding Flow's "Pending" stand-in, rendered with a distinct warning treatment. */
  warning?: boolean;
}

/**
 * Anchors every individual tributary to where it joins/leaves the ribbon's edge at the
 * occurrence's x — the ribbon's own edge there, not its flat centerline, since the ribbon's
 * thickness already varies with the balance. Also the geometry engine behind
 * `buildTributaryBundles` (#81), which anchors a cluster's/rollup's centroid stand-in the same way.
 */
export function buildTributaryArrows(
  tributaries: Tributary[],
  centerY: number,
  halfThicknessAt: (x: number) => number,
  strokeWidth: (amount: number) => number,
): TributaryArrow[] {
  return tributaries.map((tributary) => {
    const half = halfThicknessAt(tributary.x);
    const anchorY = ribbonEdgeY(tributary.direction, centerY, half);
    const width = strokeWidth(tributary.amount);

    return {
      id: tributary.id,
      direction: tributary.direction,
      label: tributary.label,
      anchorX: tributary.x,
      anchorY,
      strokeWidth: width,
      tickLength: width * TICK_LENGTH_PER_STROKE_WIDTH,
      warning: tributary.warning,
    };
  });
}
