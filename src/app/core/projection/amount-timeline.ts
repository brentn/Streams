import { AmountChange, RecurringRule } from '../models/flow';

/** Every yearly firing of `rule` on or before `onOrBefore`, starting at its own anniversaryDate. */
function recurringRuleFirings(rule: RecurringRule, onOrBefore: Date): Date[] {
  const month = rule.anniversaryDate.getMonth();
  const day = rule.anniversaryDate.getDate();

  const firings: Date[] = [];
  let year = rule.anniversaryDate.getFullYear();
  let firing = new Date(year, month, day);
  while (firing.getTime() <= onOrBefore.getTime()) {
    firings.push(firing);
    year += 1;
    firing = new Date(year, month, day);
  }
  return firings;
}

interface AmountEvent {
  date: Date;
  apply: (current: number) => number;
}

/**
 * Every Step Change/Recurring Rule event on or before `onOrBefore`, in chronological order.
 * Ties on the same date break by input order (stable sort) — the domain doesn't define
 * precedence for same-day changes, so this is an arbitrary but deterministic choice.
 */
function eventsOnOrBefore(changes: AmountChange[], onOrBefore: Date): AmountEvent[] {
  const events: AmountEvent[] = [];
  for (const change of changes) {
    if (change.type === 'step') {
      if (change.effectiveDate.getTime() <= onOrBefore.getTime()) {
        events.push({ date: change.effectiveDate, apply: () => change.amount });
      }
    } else {
      for (const firing of recurringRuleFirings(change, onOrBefore)) {
        events.push({ date: firing, apply: (current) => current + change.delta });
      }
    }
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * A Flow's (or Transfer's) effective amount at `date`: `initialAmount` with every Step
 * Change and Recurring Rule firing on/before `date` applied in chronological order —
 * there is no separate base amount they reconcile against (see CONTEXT.md's Recurring
 * Rule entry). Applies equally to a recurring-kind Flow's amount and a budget-kind
 * Flow's limit.
 */
export function amountAtDate(initialAmount: number, changes: AmountChange[], date: Date): number {
  return eventsOnOrBefore(changes, date).reduce((current, event) => event.apply(current), initialAmount);
}

/**
 * Every date strictly inside `(startExclusive, endExclusive)` where a Step Change takes
 * effect or a Recurring Rule fires — the points a budget-kind Flow's period needs to be
 * sliced at to prorate a changing limit correctly.
 */
export function changeDatesInRange(
  changes: AmountChange[],
  startExclusive: Date,
  endExclusive: Date,
): Date[] {
  const inRange = (date: Date) =>
    date.getTime() > startExclusive.getTime() && date.getTime() < endExclusive.getTime();

  const dates = new Set<number>();
  for (const change of changes) {
    if (change.type === 'step') {
      if (inRange(change.effectiveDate)) dates.add(change.effectiveDate.getTime());
    } else {
      for (const firing of recurringRuleFirings(change, endExclusive)) {
        if (inRange(firing)) dates.add(firing.getTime());
      }
    }
  }
  return Array.from(dates)
    .sort((a, b) => a - b)
    .map((t) => new Date(t));
}
