import { describe, expect, it } from 'vitest';
import {
  buildCadence,
  CadenceFields,
  CadenceOption,
  defaultCadenceFields,
  describeCadence,
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
});
