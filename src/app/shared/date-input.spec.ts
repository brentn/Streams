import { describe, expect, it } from 'vitest';
import { dateInputValue, parseDateInput } from './date-input';

describe('dateInputValue', () => {
  it('formats a Date as yyyy-MM-dd, zero-padded', () => {
    expect(dateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('parseDateInput', () => {
  it('parses a yyyy-MM-dd string into a local Date', () => {
    const date = parseDateInput('2026-01-05');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(5);
  });

  it('round-trips through dateInputValue', () => {
    const date = new Date(2027, 6, 31);
    expect(parseDateInput(dateInputValue(date))).toEqual(date);
  });
});
