export interface ScrubAccumulation {
  emitDays: number;
  carryDays: number;
}

/**
 * Converts a pointer-drag's pixel delta into whole-day scrub steps, carrying
 * the sub-day fraction forward so it isn't lost between move events. Delta is
 * computed relative to the pointer's own previous position (not an absolute
 * x-to-date mapping), so the result stays stable as the chart's panning
 * window re-centers mid-drag — see ticket 04 in docs/ux-spec.md.
 */
export function accumulateScrubDays(
  deltaPx: number,
  pxPerDay: number,
  carryDays: number,
): ScrubAccumulation {
  const total = carryDays + deltaPx / pxPerDay;
  const emitDays = Math.trunc(total);
  return { emitDays, carryDays: total - emitDays };
}
