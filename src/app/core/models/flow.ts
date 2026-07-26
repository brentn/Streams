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

interface FlowBase {
  id: string;
  accountId: string;
  name: string;
  direction: FlowDirection;
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
