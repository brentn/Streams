/**
 * Records that a recurring-kind Flow's specific occurrence has been dismissed and should never
 * be treated as Outstanding — scoped to `occurrenceDate` itself, not the Flow as a whole, so a
 * later occurrence of the same Flow still goes Outstanding normally when its own time comes. See
 * ADR-0014 and CONTEXT.md's Outstanding entry.
 */
export interface SkippedOccurrence {
  flowId: string;
  occurrenceDate: Date;
}
