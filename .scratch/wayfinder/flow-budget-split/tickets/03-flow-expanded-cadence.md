# 03 — Recurring-kind Flow's expanded cadence

**Type:** wayfinder:grilling
**Status:** closed
**Claimed by:** claude-session-2026-07-25
**Blocked by:** none

## Question

The original schema sketch (`.scratch/spec-streams-app.md`) gives Flow a `cadence` of `weekly`/`monthly`/`annual` only. The correction that prompted this map specifically calls out that recurring expenses/income know their date and frequency "almost to the day" — including biweekly and semi-monthly rhythms (e.g. a paycheck every other Friday, rent due the 1st and 15th) that don't fit any of the three existing cadence values.

Scope note (per ticket 01's resolution): `cadence` belongs only to recurring-kind Flows — a budget-kind Flow has no cadence at all, just a period (see ticket 02).

What's the corrected cadence enum, and how is the anchor date/day modeled for each — a fixed calendar day (like Recurring Rule's anniversary date), a day-of-week + interval (biweekly), or a list of days-of-month (semi-monthly)? Does this change how Step Changes/Recurring Rules compose against a Flow's amount, or only how often the amount recurs?

## Resolution

The flat `cadence: 'weekly' | 'monthly' | 'annual'` field is replaced by a generalized recurrence shape on recurring-kind Flow, patterned on iCalendar's RRULE (FREQ/INTERVAL/BYDAY/BYMONTHDAY) rather than a flat enum of near-duplicate named cases:

```
cadence: {
  period: 'week' | 'month' | 'year',
  interval: number,   // 1 or 2 today (weekly/monthly/annual vs. biweekly/bi-monthly); not hard-restricted to those values
  anchors: Anchor[],  // 1 anchor = the plain case; 2 anchors = semi-monthly / semi-annual
}

// period: 'week'  → Anchor = { dayOfWeek: Sun..Sat }
// period: 'month' → Anchor = { day: 1..31 } | { nth: 1st|2nd|3rd|4th|last, dayOfWeek: Sun..Sat }
// period: 'year'  → Anchor = { month: 1..12, day: 1..31 }  (no nth-weekday variant on year — not requested, not added)
```

Named, user-facing cadence options (weekly, biweekly, monthly, bi-monthly, semi-monthly, annually, semi-annually, "Nth weekday of month," "last weekday of month" — e.g. "last Wednesday") are UI-level labels that each resolve to one shape of this recurrence, not separate schema branches. "Last weekday" means the last occurrence of a *specific* day-of-week (e.g. last Wednesday), not the last business day of the month — same `nth: 'last'` shape as "first Sunday."

Step Change and Recurring Rule are **unaffected** and stay fully independent: they govern how a Flow's expected *amount* changes over time (a raise, a rent increase), orthogonal to how often the amount recurs. A semi-monthly rent Flow can still carry an annual Recurring Rule that bumps the amount every October, exactly as before.

Scope stays as noted: this recurrence shape belongs only to recurring-kind Flow. Budget-kind Flow has no cadence — see ticket 02 for its period model, which is a separate (simpler) concept, not reusing this shape.

