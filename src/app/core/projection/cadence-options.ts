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
  | 'nth-weekday-monthly';

export const CADENCE_OPTIONS: { value: CadenceOption; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'bi-monthly', label: 'Bi-monthly' },
  { value: 'semi-monthly', label: 'Semi-monthly' },
  { value: 'annually', label: 'Annually' },
  { value: 'semi-annually', label: 'Semi-annually' },
  { value: 'nth-weekday-monthly', label: 'Nth weekday of month' },
];

/** Only the interval-2 options (biweekly, bi-monthly) need a reference date to fix parity. */
export function needsAnchorDate(option: CadenceOption): boolean {
  return option === 'biweekly' || option === 'bi-monthly';
}

export interface CadenceFields {
  dayOfWeek: DayOfWeek;
  day: number;
  day2: number;
  month: number;
  month2: number;
  nth: NthWeek;
  anchorDate: Date;
}

const DEFAULT_FIELDS: CadenceFields = {
  dayOfWeek: 5,
  day: 1,
  day2: 15,
  month: 1,
  month2: 7,
  nth: 1,
  anchorDate: new Date(),
};

export function defaultCadenceFields(): CadenceFields {
  return { ...DEFAULT_FIELDS, anchorDate: new Date() };
}

/** Builds the domain `Cadence` shape from a named option plus its form fields. */
export function buildCadence(option: CadenceOption, fields: CadenceFields): Cadence {
  const { anchorDate } = fields;
  switch (option) {
    case 'weekly':
      return { period: 'week', interval: 1, anchors: [{ dayOfWeek: fields.dayOfWeek }], anchorDate };
    case 'biweekly':
      return { period: 'week', interval: 2, anchors: [{ dayOfWeek: fields.dayOfWeek }], anchorDate };
    case 'monthly':
      return { period: 'month', interval: 1, anchors: [{ day: fields.day }], anchorDate };
    case 'bi-monthly':
      return { period: 'month', interval: 2, anchors: [{ day: fields.day }], anchorDate };
    case 'semi-monthly':
      return {
        period: 'month',
        interval: 1,
        anchors: [{ day: fields.day }, { day: fields.day2 }],
        anchorDate,
      };
    case 'annually':
      return { period: 'year', interval: 1, anchors: [{ month: fields.month, day: fields.day }], anchorDate };
    case 'semi-annually':
      return {
        period: 'year',
        interval: 1,
        anchors: [
          { month: fields.month, day: fields.day },
          { month: fields.month2, day: fields.day2 },
        ],
        anchorDate,
      };
    case 'nth-weekday-monthly':
      return {
        period: 'month',
        interval: 1,
        anchors: [{ nth: fields.nth, dayOfWeek: fields.dayOfWeek }],
        anchorDate,
      };
  }
}

/** The inverse of `buildCadence`, for pre-filling the edit form from a stored Flow's Cadence. */
export function describeCadence(cadence: Cadence): { option: CadenceOption; fields: CadenceFields } {
  const fields = defaultCadenceFields();
  fields.anchorDate = cadence.anchorDate;

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
