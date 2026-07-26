/** Must stay in sync with the `max-width` in multi-account-stream.css's phone-width media query. */
export const NARROW_BREAKPOINT_PX = 480;

export interface LaneHeights {
  total: number;
  account: number;
}

/**
 * Phone-width lanes shrink in place rather than restructuring — see
 * docs/ux-spec.md, "Multi-account view: mobile layout unchanged, just
 * shrunk".
 */
export function laneHeightsFor(isNarrow: boolean): LaneHeights {
  return isNarrow ? { total: 56, account: 44 } : { total: 72, account: 56 };
}
