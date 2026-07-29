/**
 * Reads `valueAsNumber` from a number input event, falling back to `previous` when the field
 * is empty or not yet a valid number (`valueAsNumber` is NaN mid-edit). Writing NaN into a
 * signal bound back to `[value]` sets the DOM `value` to the literal string "NaN", which the
 * browser logs as unparseable.
 */
export function numberInputValue(event: Event, previous: number): number {
  const value = (event.target as HTMLInputElement).valueAsNumber;
  return Number.isNaN(value) ? previous : value;
}
