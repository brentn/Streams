import { describe, expect, it } from 'vitest';
import { numberInputValue } from './number-input';

function numberInputEvent(value: string): Event {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value;
  return { target: input } as unknown as Event;
}

describe('numberInputValue', () => {
  it('reads the parsed number from a valid input event', () => {
    expect(numberInputValue(numberInputEvent('42'), 0)).toBe(42);
  });

  it('falls back to the previous value when the field is empty (valueAsNumber is NaN)', () => {
    expect(numberInputValue(numberInputEvent(''), 7)).toBe(7);
  });

  it('falls back to the previous value when the field holds a not-yet-valid number', () => {
    expect(numberInputValue(numberInputEvent('-'), 3)).toBe(3);
  });
});
