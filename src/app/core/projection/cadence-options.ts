import { Cadence, DayOfWeek, NthWeek } from '../models/flow';

/**
 * The named, user-facing cadence choices from CONTEXT.md — each resolves to one shape of the
 * generalized `{ period, interval, anchors }` recurrence, not a separate schema branch.
 */
export type CadenceOption =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'bi-monthly'
  | 'semi-monthly'
  | 'annually'
  | 'semi-annually'
  | 'nth-weekday-monthly'
  | 'once';

export const CADENCE_OPTIONS: { value: CadenceOption; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'bi-monthly', label: 'Bi-monthly' },
  { value: 'semi-monthly', label: 'Semi-monthly' },
  { value: 'annually', label: 'Annually' },
  { value: 'semi-annually', label: 'Semi-annually' },
  { value: 'nth-weekday-monthly', label: 'Nth weekday of month' },
  { value: 'once', label: 'One-time' },
];

/** Only the interval-2 options (biweekly, bi-monthly) need a reference date to fix parity. */
export function needsAnchorDate(option: CadenceOption): boolean {
  return option === 'biweekly' || option === 'bi-monthly';
}

/** One-time is a single occurrence that already terminates itself — no End Date to offer. */
export function showsEndDate(option: CadenceOption): boolean {
  return option !== 'once';
}

/**
 * Null when the form fields are valid; otherwise the inline message to show next to End Date.
 * Checked uniformly across every repeating option, including ones that don't surface the
 * reference (anchor) date field — it's still set underneath and still bounds End Date.
 */
export function cadenceEndDateError(option: CadenceOption, fields: CadenceFields): string | null {
  if (option === 'once' || !fields.endDate) return null;
  return fields.endDate.getTime() < fields.anchorDate.getTime()
    ? 'End Date must be on or after the reference date.'
    : null;
}

export interface CadenceFields {
  dayOfWeek: DayOfWeek;
  day: number;
  day2: number;
  month: number;
  month2: number;
  nth: NthWeek;
  anchorDate: Date;
  date: Date;
  endDate?: Date;
}

const DEFAULT_FIELDS: CadenceFields = {
  dayOfWeek: 5,
  day: 1,
  day2: 15,
  month: 1,
  month2: 7,
  nth: 1,
  anchorDate: new Date(),
  date: new Date(),
  endDate: undefined,
};

export function defaultCadenceFields(): CadenceFields {
  return { ...DEFAULT_FIELDS, anchorDate: new Date(), date: new Date() };
}

/** Builds the domain `Cadence` shape from a named option plus its form fields. */
export function buildCadence(option: CadenceOption, fields: CadenceFields): Cadence {
  const { anchorDate, endDate } = fields;
  switch (option) {
    case 'once':
      return { period: 'once', date: fields.date };
    case 'weekly':
      return { period: 'week', interval: 1, anchors: [{ dayOfWeek: fields.dayOfWeek }], anchorDate, endDate };
    case 'biweekly':
      return { period: 'week', interval: 2, anchors: [{ dayOfWeek: fields.dayOfWeek }], anchorDate, endDate };
    case 'monthly':
      return { period: 'month', interval: 1, anchors: [{ day: fields.day }], anchorDate, endDate };
    case 'bi-monthly':
      return { period: 'month', interval: 2, anchors: [{ day: fields.day }], anchorDate, endDate };
    case 'semi-monthly':
      return {
        period: 'month',
        interval: 1,
        anchors: [{ day: fields.day }, { day: fields.day2 }],
        anchorDate,
        endDate,
      };
    case 'annually':
      return {
        period: 'year',
        interval: 1,
        anchors: [{ month: fields.month, day: fields.day }],
        anchorDate,
        endDate,
      };
    case 'semi-annually':
      return {
        period: 'year',
        interval: 1,
        anchors: [
          { month: fields.month, day: fields.day },
          { month: fields.month2, day: fields.day2 },
        ],
        anchorDate,
        endDate,
      };
    case 'nth-weekday-monthly':
      return {
        period: 'month',
        interval: 1,
        anchors: [{ nth: fields.nth, dayOfWeek: fields.dayOfWeek }],
        anchorDate,
        endDate,
      };
  }
}

/** The inverse of `buildCadence`, for pre-filling the edit form from a stored Flow's Cadence. */
export function describeCadence(cadence: Cadence): { option: CadenceOption; fields: CadenceFields } {
  const fields = defaultCadenceFields();

  if (cadence.period === 'once') {
    fields.date = cadence.date;
    return { option: 'once', fields };
  }

  fields.anchorDate = cadence.anchorDate;
  fields.endDate = cadence.endDate;

  if (cadence.period === 'week') {
    fields.dayOfWeek = cadence.anchors[0].dayOfWeek;
    return { option: cadence.interval === 2 ? 'biweekly' : 'weekly', fields };
  }

  if (cadence.period === 'month') {
    const [first, second] = cadence.anchors;
    if ('nth' in first) {
      fields.nth = first.nth;
      fields.dayOfWeek = first.dayOfWeek;
      return { option: 'nth-weekday-monthly', fields };
    }
    fields.day = first.day;
    if (second && 'day' in second) {
      fields.day2 = second.day;
      return { option: 'semi-monthly', fields };
    }
    return { option: cadence.interval === 2 ? 'bi-monthly' : 'monthly', fields };
  }

  const [first, second] = cadence.anchors;
  fields.month = first.month;
  fields.day = first.day;
  if (second) {
    fields.month2 = second.month;
    fields.day2 = second.day;
    return { option: 'semi-annually', fields };
  }
  return { option: 'annually', fields };
}
