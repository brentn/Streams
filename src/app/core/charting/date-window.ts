/** ~6-month panning window centered on the scrub position, per docs/ux-spec.md. */
export const WINDOW_DAYS = 183;
export const HALF_WINDOW_DAYS = Math.floor(WINDOW_DAYS / 2);

export function normalizeDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((normalizeDay(a).getTime() - normalizeDay(b).getTime()) / (24 * 60 * 60 * 1000));
}

/** The WINDOW_DAYS dates surrounding `center`, one per day, `center` itself at the midpoint. */
export function buildWindowDates(center: Date): Date[] {
  const normalizedCenter = normalizeDay(center);
  return Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(normalizedCenter, i - HALF_WINDOW_DAYS));
}

/** How far the scrub position may move from today, in either direction. */
export const SCRUB_MIN_DAYS = -365;
export const SCRUB_MAX_DAYS = 180;

export function clampDayOffset(offset: number): number {
  return Math.min(SCRUB_MAX_DAYS, Math.max(SCRUB_MIN_DAYS, offset));
}

/** The scrub position (today + `dayOffset` days, normalized to midnight). */
export function selectedDateFor(dayOffset: number): Date {
  return addDays(normalizeDay(new Date()), dayOffset);
}

/** A band's x-position (within a window built by `buildWindowDates`) for the actual/projected boundary at `balanceDate`. */
export function boundaryXFor(balanceDate: Date, selectedDate: Date): number {
  return HALF_WINDOW_DAYS + diffDays(balanceDate, selectedDate);
}
