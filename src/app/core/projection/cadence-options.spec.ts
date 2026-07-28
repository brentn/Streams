import { describe, expect, it } from 'vitest';
import {
  buildCadence,
  CadenceFields,
  CadenceOption,
  cadenceEndDateError,
  defaultCadenceFields,
  describeCadence,
  showsEndDate,
} from './cadence-options';

const anchorDate = new Date(2026, 0, 2);

describe('buildCadence / describeCadence', () => {
  const cases: CadenceOption[] = [
    'weekly',
    'biweekly',
    'monthly',
    'bi-monthly',
    'semi-monthly',
    'annually',
    'semi-annually',
    'nth-weekday-monthly',
    'once',
  ];

  it.each(cases)('round-trips %s through describeCadence', (option) => {
    const fields = { ...defaultCadenceFields(), anchorDate };
    const cadence = buildCadence(option, fields);

    const described = describeCadence(cadence);

    expect(described.option).toBe(option);
    expect(buildCadence(described.option, described.fields)).toEqual(cadence);
  });

  it('builds a semi-monthly cadence with two day-of-month anchors', () => {
    const fields = { ...defaultCadenceFields(), day: 1, day2: 15, anchorDate };
    expect(buildCadence('semi-monthly', fields)).toEqual({
      period: 'month',
      interval: 1,
      anchors: [{ day: 1 }, { day: 15 }],
      anchorDate,
    });
  });

  it('builds a biweekly cadence with interval 2', () => {
    const fields: CadenceFields = { ...defaultCadenceFields(), dayOfWeek: 5, anchorDate };
    expect(buildCadence('biweekly', fields)).toEqual({
      period: 'week',
      interval: 2,
      anchors: [{ dayOfWeek: 5 }],
      anchorDate,
    });
  });

  it('builds an nth-weekday-of-month cadence', () => {
    const fields = { ...defaultCadenceFields(), nth: -1 as const, dayOfWeek: 3 as const, anchorDate };
    expect(buildCadence('nth-weekday-monthly', fields)).toEqual({
      period: 'month',
      interval: 1,
      anchors: [{ nth: -1, dayOfWeek: 3 }],
      anchorDate,
    });
  });

  it('builds a one-time cadence with just its date', () => {
    const date = new Date(2026, 6, 10);
    const fields = { ...defaultCadenceFields(), date };
    expect(buildCadence('once', fields)).toEqual({ period: 'once', date });
  });

  it('builds a repeating cadence with an End Date when the field is set', () => {
    const endDate = new Date(2026, 11, 31);
    const fields = { ...defaultCadenceFields(), anchorDate, endDate };
    expect(buildCadence('monthly', fields)).toEqual({
      period: 'month',
      interval: 1,
      anchors: [{ day: fields.day }],
      anchorDate,
      endDate,
    });
  });

  it('omits End Date from a repeating cadence when the field is unset', () => {
    const fields = { ...defaultCadenceFields(), anchorDate };
    expect(buildCadence('monthly', fields)).toEqual({
      period: 'month',
      interval: 1,
      anchors: [{ day: fields.day }],
      anchorDate,
    });
  });

  it('describeCadence carries a repeating cadence End Date back into the form fields', () => {
    const endDate = new Date(2026, 11, 31);
    const cadence = buildCadence('weekly', { ...defaultCadenceFields(), anchorDate, endDate });
    expect(describeCadence(cadence).fields.endDate).toEqual(endDate);
  });
});

describe('showsEndDate', () => {
  it('is false only for one-time', () => {
    expect(showsEndDate('once')).toBe(false);
    expect(showsEndDate('weekly')).toBe(true);
    expect(showsEndDate('monthly')).toBe(true);
    expect(showsEndDate('annually')).toBe(true);
  });
});

describe('cadenceEndDateError', () => {
  it('is null for one-time, regardless of fields', () => {
    const fields = { ...defaultCadenceFields(), anchorDate, endDate: new Date(2020, 0, 1) };
    expect(cadenceEndDateError('once', fields)).toBeNull();
  });

  it('is null when no End Date is set', () => {
    const fields = { ...defaultCadenceFields(), anchorDate };
    expect(cadenceEndDateError('monthly', fields)).toBeNull();
  });

  it('is null when End Date is on or after the anchor date', () => {
    const fields = { ...defaultCadenceFields(), anchorDate, endDate: anchorDate };
    expect(cadenceEndDateError('monthly', fields)).toBeNull();

    const laterFields = { ...defaultCadenceFields(), anchorDate, endDate: new Date(2026, 5, 1) };
    expect(cadenceEndDateError('monthly', laterFields)).toBeNull();
  });

  it('is a message when End Date falls before the anchor date, even for options that hide the anchor date field', () => {
    const fields = { ...defaultCadenceFields(), anchorDate, endDate: new Date(2025, 0, 1) };
    expect(cadenceEndDateError('monthly', fields)).toEqual(expect.any(String));
    expect(cadenceEndDateError('biweekly', fields)).toEqual(expect.any(String));
  });
});
