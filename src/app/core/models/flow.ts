import { Sign } from './account';

/** `in` adds to the projection, `out` subtracts. */
export type FlowDirection = 'in' | 'out';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type NthWeek = 1 | 2 | 3 | 4 | -1;

export type WeekAnchor = { dayOfWeek: DayOfWeek };
export type MonthAnchor = { day: number } | { nth: NthWeek; dayOfWeek: DayOfWeek };
export type YearAnchor = { month: number; day: number };
export type Anchor = WeekAnchor | MonthAnchor | YearAnchor;

/**
 * A recurring-kind Flow's schedule, patterned on iCalendar's RRULE.
 * `anchorDate` fixes interval parity (e.g. which Friday is "on" for a
 * biweekly cadence) — irrelevant when interval is 1.
 */
export type Cadence =
  | { period: 'week'; interval: number; anchors: WeekAnchor[]; anchorDate: Date }
  | { period: 'month'; interval: number; anchors: MonthAnchor[]; anchorDate: Date }
  | { period: 'year'; interval: number; anchors: YearAnchor[]; anchorDate: Date };

export type BudgetPeriod = 'month' | 'year';

/** A one-time, manually entered change to a Flow's (or Transfer's) amount, effective from `effectiveDate` forward until superseded. */
export interface StepChange {
  type: 'step';
  effectiveDate: Date;
  amount: number;
}

/**
 * An automated, calendar-anchored Step Change that fires every year on `anniversaryDate`'s
 * month/day, applying `delta` to whatever the amount is at that moment.
 */
export interface RecurringRule {
  type: 'recurring-rule';
  anniversaryDate: Date;
  delta: number;
}

/**
 * Step Changes and Recurring Rules form one ordered timeline of amount-changes — there is
 * no separate "base" amount they reconcile against. Applies to a Flow of either kind (a
 * recurring-kind Flow's expected amount or a budget-kind Flow's limit).
 */
export type AmountChange = StepChange | RecurringRule;

/**
 * A per-Flow Variance Alert bound: how far a completed period's actual total may
 * differ from the expected amount before it's flagged. Either a percentage of the
 * expected amount or a flat dollar amount.
 */
export type Tolerance = { kind: 'percent'; value: number } | { kind: 'fixed'; value: number };

interface FlowBase {
  id: string;
  accountId: string;
  name: string;
  direction: FlowDirection;
  amountChanges?: AmountChange[];
  tolerance?: Tolerance;
}

export interface RecurringFlow extends FlowBase {
  kind: 'recurring';
  amount: number;
  cadence: Cadence;
}

export interface BudgetFlow extends FlowBase {
  kind: 'budget';
  limit: number;
  period: BudgetPeriod;
}

export type Flow = RecurringFlow | BudgetFlow;
export type FlowKind = Flow['kind'];

/** `in` expects a positive contribution, `out` a negative one. */
export function signedFlowAmount(amount: number, direction: FlowDirection): number {
  const sign: Sign = direction === 'in' ? 1 : -1;
  return amount * sign;
}
